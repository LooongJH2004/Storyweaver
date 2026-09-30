/** Live-model evidence; script-backed tests do not substitute for these human-reviewed performances. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { SessionId, type InputIntent } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { parseStorybookDocument } from '@deepseek-ai/dsh-story'
import { STYLE_PRESETS } from '@deepseek-ai/dsh-story/style'
import { launchWebScaffold, type WebScaffold } from '../../../../apps/web/tests/scaffold.ts'
import { performanceMetrics, performanceReview } from './performance-evidence.ts'
import { parseStructuredPlayerDirective } from '../src/player-directive.ts'

const fixture = new URL('../../roleplay-web-profile/tests/fixtures/legacy-profile/moonshadow-ledger/', import.meta.url)
const bookSource = readFileSync(new URL('storybook.json', fixture), 'utf8')
const storybook = parseStorybookDocument(JSON.parse(bookSource) as unknown)
const simulation = JSON.parse(readFileSync(new URL('simulation-cases.json', fixture), 'utf8')) as {
  cases: { id: string; playerInput: string; inputIntent?: InputIntent; must: string[]; mustNot: string[] }[]
}
const cases = simulation.cases.filter(item => item.id.startsWith('performance-') || item.id.startsWith('cognition-'))
const variants = [
  { id: 'baseline', presets: [] },
  { id: 'restrained-natural', presets: ['director-restrained', 'actor-natural'] },
  { id: 'literary-taciturn', presets: ['director-literary', 'actor-taciturn'] },
  { id: 'brisk-distant', presets: ['director-brisk', 'actor-distant'] },
]
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const artifactRoot = fileURLToPath(new URL(`../../../../.artifacts/moonshadow-performance/${stamp}/`, import.meta.url))
const live = (process.env.DEEPSEEK_API_KEY?.trim().length ?? 0) > 0
const limits = {
  maxTokens: Number(process.env.DSH_ROLEPLAY_EVAL_MAX_TOKENS ?? 4096),
  elapsedMs: Number(process.env.DSH_ROLEPLAY_EVAL_TIMEOUT_MS ?? 180_000),
}
for (const [name, value] of Object.entries(limits)) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Evaluation ${name} must be a positive integer`)
}

describe('Moonshadow Ledger live performance comparison', { concurrent: false }, () => {
  for (const scenario of cases) for (const variant of (scenario.id.startsWith('cognition-') ? variants.slice(0, 1) : variants)) {
    it.skipIf(!live)(`${scenario.id} [${variant.id}]`, { timeout: limits.elapsedMs + 60_000, retry: 0 }, async () => {
      const output = join(artifactRoot, scenario.id, variant.id)
      await mkdir(output, { recursive: true })
      const root = await mkdtemp(join(tmpdir(), 'dsh-moonshadow-performance-'))
      vi.stubEnv('DSH_SNAPSHOT', 'record')
      let scaffold: WebScaffold | undefined
      try {
        scaffold = await launchWebScaffold({
          extraOverlayPath: fileURLToPath(new URL('../../roleplay-web-profile/tests/fixtures/legacy-profile/cordis.patch.yml', import.meta.url)),
          extraInstallAnchors: [fileURLToPath(new URL('../../roleplay-web-profile/tests/fixtures/legacy-profile/package.json', import.meta.url))],
          directoryPickerMode: 'overlay', extraEntryOverrides: [
            { id: 'story-home', config: { root } },
            { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions') } },
            { id: 'storage-json', config: { root: join(root, 'storages') } },
            { id: 'roleplay-directory-picker-native', disabled: true },
            { id: 'roleplay-directory-picker-controller', disabled: true },
          ],
        })
        const { ctx } = scaffold
        const story = await ctx.storyRegistry.create(`月影账簿：${scenario.id} / ${variant.id}`)
        await writeFile(ctx.storyHome.storyPath(story.id, 'world', 'storybook.json'), bookSource, 'utf8')
        await writeFile(ctx.storyHome.storyPath(story.id, 'world', 'opening.md'),
          readFileSync(new URL('opening.md', fixture), 'utf8'), 'utf8')
        for (const id of variant.presets) {
          const preset = STYLE_PRESETS.find(item => item.id === id)
          if (preset === undefined) throw new Error(`Unknown evaluation preset: ${id}`)
          const recipients = preset.profile.kind === 'director' ? ['director']
            : storybook.characters.map(actor => `actor:${actor.actorId}`)
          for (const key of recipients) await ctx.storyController.updateStyle({
            storyId: story.id, scope: 'story', key, profile: preset.profile,
            expectedStoryPromptRevision: story.promptOverrides.revision,
          })
        }
        const model = process.env.DSH_ROLEPLAY_EVAL_MODEL ?? 'deepseek-v4-flash'
        const { agent: director } = await ctx.agentLoop.createAgent(ctx, {
          sessionId: SessionId(`moonshadow-${scenario.id}-${variant.id}`),
          agentOptions: { provider: 'deepseek-official', model, maxTokens: limits.maxTokens },
          meta: { cwd: scaffold.workspaceCwd, agentPreset: 'storyweaver' },
          setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'storyweaver') },
        })
        await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
        let timedOut = false
        let runFailure: unknown
        const started = performance.now()
        const timer = setTimeout(() => {
          timedOut = true
          director.cancel({ kind: 'hook', reason: 'performance evaluation elapsed limit' })
        }, limits.elapsedMs)
        try {
          director.followup(createUserMessage({ content: [{ type: 'text', text: scenario.playerInput }],
            source: { kind: 'user', ...(scenario.inputIntent === undefined ? {} : { inputIntent: scenario.inputIntent }) },
          }))
          await director.whenIdle()
        } catch (error) {
          runFailure = error
        } finally { clearTimeout(timer) }
        const elapsedMs = performance.now() - started
        const sessions = story.sessions.map((registration) => {
          const session = ctx.sessions.get(registration.sessionId)
          if (session === undefined) throw new Error(`Missing evaluation Session: ${registration.sessionId}`)
          return session
        })
        for (const [index, session] of sessions.entries()) {
          await writeFile(join(output, `session.${index}.jsonl`),
            [session.header, ...session.events].map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8')
        }
        await writeFile(join(output, 'story-record.json'), JSON.stringify(ctx.storyRegistry.exportRecord(story.id)), 'utf8')
        let exportFailure: unknown
        try {
          const exported = await ctx.storyController.exportPackage({ storyId: story.id })
          await writeFile(join(output, 'story-package.json'), exported.packageJson, 'utf8')
        } catch (error) { exportFailure = error }
        const controlledActor = scenario.inputIntent === undefined ? undefined : parseStructuredPlayerDirective(
          scenario.inputIntent, scenario.playerInput, storybook.characters.map(actor => actor.actorId),
        )?.embodiedActor
        const ownershipViolations = controlledActor === undefined ? [] : story.world.events.filter(event =>
          (event.kind === 'actor-speech' || event.kind === 'actor-action') && event.actorId === controlledActor)
        const objectiveInjuryUpdated = scenario.id !== 'performance-injury' ? undefined
          : story.world.dynamicState.entries.some(entry => entry.definition.id === 'shadowheart:authored:身体'
            && entry.active && entry.revision > 1 && entry.origin === 'director'
            && entry.value !== storybook.characters.find(actor => actor.actorId === 'shadowheart')?.state
              .find(item => item.definition.id === entry.definition.id)?.value)
        await writeFile(join(output, 'review.json'), JSON.stringify({
          case: scenario, variant, model, timedOut, limits,
          ...(exportFailure === undefined ? {} : { exportError: exportFailure instanceof Error
            ? exportFailure.message : 'Package export failed; see the test runner error' }),
          storybookSha256: createHash('sha256').update(bookSource).digest('hex'),
          metrics: performanceMetrics(sessions.map(session => session.events), elapsedMs),
          sessionIndex: story.sessions, worldEvents: story.world.events,
          checks: { ownershipViolations, objectiveInjuryUpdated },
          humanReview: performanceReview(),
        }, null, 2) + '\n', 'utf8')
        if (runFailure !== undefined) throw runFailure
        if (exportFailure !== undefined) throw exportFailure
        expect(timedOut, `Timed out; retained evidence: ${output}`).toBe(false)
        expect(ownershipViolations, `Player-controlled Actor acted autonomously; retained evidence: ${output}`).toEqual([])
        if (objectiveInjuryUpdated !== undefined) expect(objectiveInjuryUpdated,
          `Narrated injury did not update objective state; retained evidence: ${output}`).toBe(true)
        expect(director.session.events.findLast(event => event.type === 'turn/end')?.data.reason,
          `Director did not finish; retained evidence: ${output}`).toEqual({ kind: 'completed' })
        expect(sessions.some(session => session.events.some(event => event.type === 'actor/commit'
          && event.data.operations.some(operation => operation.type === 'actor/turn-closed'))),
        `No completed NPC response; retained evidence: ${output}`).toBe(true)
      } finally {
        try { await scaffold?.close() }
        finally {
          vi.unstubAllEnvs()
          await rm(root, { recursive: true, force: true })
        }
      }
    })
  }
})
