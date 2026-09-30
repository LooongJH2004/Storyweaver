/** Replay one saved story boundary to inspect Director choices without rerunning the cast. */
import type {} from '../src/index.ts'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, vi } from 'vitest'
import type { CommandId, CommandScope } from '@deepseek-ai/dsh-roleplay-core'
import { resolveInstanceSettings } from '@deepseek-ai/dsh-roleplay-core/settings'
import { DEFAULT_STORYBOOK_CONTEXT_RULES } from '@deepseek-ai/dsh-roleplay-core/storybook-defaults'
import { initialContextRecipe, recipeOf } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import { launchWebScaffold } from '../../../../apps/web/tests/scaffold.ts'
import { parseCredentialsDocument } from '../../../credentials/credentials-local/src/index.ts'

const credentialStore = process.env.DSH_ROLEPLAY_EVAL_CREDENTIAL_STORE
const archivePath = process.env.DSH_ROLEPLAY_LONGFORM_REPLAY_ARCHIVE
const stage = process.env.DSH_ROLEPLAY_LONGFORM_STAGE ?? 'director-replay'
const model = process.env.DSH_ROLEPLAY_EVAL_MODEL ?? 'deepseek-v4-flash'
const reasoningEffort = process.env.DSH_ROLEPLAY_EVAL_REASONING_EFFORT ?? 'low'
const refreshDirectorGuidance = process.env.DSH_ROLEPLAY_LONGFORM_REFRESH_DIRECTOR_GUIDANCE === '1'
const directorGuidancePath = process.env.DSH_ROLEPLAY_LONGFORM_DIRECTOR_GUIDANCE
const continuationRuns = Math.max(1, Number(process.env.DSH_ROLEPLAY_LONGFORM_DIRECTOR_RUNS ?? '1'))
const fixedBoundary = process.env.DSH_ROLEPLAY_LONGFORM_FIXED_BOUNDARY === '1'

it.skipIf(credentialStore === undefined || archivePath === undefined)('replays the Director from a saved long-form story boundary',
  { timeout: 480000, retry: 0 }, async () => {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(stage)) throw new Error(`Invalid director replay stage: ${stage}`)
    if (fixedBoundary && (continuationRuns !== 1 || refreshDirectorGuidance || directorGuidancePath !== undefined)) {
      throw new Error('Fixed boundary replay requires one Director run and no guidance refresh')
    }
    const output = fileURLToPath(new URL(`../../../../.artifacts/longform-performance/${stage}/`, import.meta.url))
    await mkdir(dirname(output), { recursive: true })
    await mkdir(output)
    const credential = parseCredentialsDocument(await readFile(credentialStore!, 'utf8'), credentialStore!)
      .refs.get('DEEPSEEK_API_KEY')
    if (credential === undefined) throw new Error('DeepSeek credential is not configured in the requested store')
    const root = await mkdtemp(join(tmpdir(), 'dsh-director-replay-'))
    vi.stubEnv('DEEPSEEK_API_KEY', credential)
    vi.stubEnv('DSH_SNAPSHOT', 'record')
    let scaffold: Awaited<ReturnType<typeof launchWebScaffold>> | undefined
    try {
      scaffold = await launchWebScaffold({
        extraOverlayPath: fileURLToPath(new URL('../../../experimental/roleplay-web-profile/cordis.patch.yml', import.meta.url)),
        extraInstallAnchors: [fileURLToPath(new URL('../../../experimental/roleplay-web-profile/package.json', import.meta.url))],
        directoryPickerMode: 'overlay', extraEntryOverrides: [
          { id: 'credentials', config: { path: credentialStore, watch: false } },
          { id: 'story-home', config: { root } },
          { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions') } },
          { id: 'storage-json', config: { root: join(root, 'storages') } },
          { id: 'roleplay-services', config: { databasePath: join(root, 'narrative.sqlite'), journalMode: 'wal', busyTimeoutMs: 1000,
            provider: 'deepseek-official', model, consolidationThreshold: 0, directorConsolidationThreshold: 0,
            queryPageLimit: 100, notificationIntervalMs: 100, recallCharacterLimit: 24000,
            characterLimits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
              maxActiveGoals: 32, maxScheduledIntentions: 32 },
            directorCommandLimit: 24, discussionTurnLimit: 24, maxContextUpdateUnits: 16 } },
        ],
      })
      const { ctx } = scaffold
      await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
        selection: { provider: 'deepseek-official', model, reasoningEffort } })
      const archiveBytes = await readFile(archivePath!)
      const boundarySha256 = createHash('sha256').update(archiveBytes).digest('hex')
      const archive = JSON.parse(archiveBytes.toString('utf8')) as Awaited<ReturnType<typeof ctx.roleplayTransfer.export>>
      const id = ctx.roleplayTransfer.import(archive, randomUUID() as CommandId).id
      const scope = (): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
        expectedRevision: ctx.roleplayHistory.snapshot(id).instance.revision, principal: { kind: 'player' } })
      const initialArchiveRevision = ctx.roleplayHistory.snapshot(id).instance.revision
      const usageBefore = await ctx.roleplayExecutionHistory.usage(id)
      if (fixedBoundary) {
        const settings = resolveInstanceSettings(ctx.roleplayHistory.snapshot(id))
        ctx.roleplayConfiguration.setSettings(scope(), { reason: 'Replay with the current build Director policy',
          overrides: { ...settings.overrides, contextRules: { ...settings.effective.contextRules,
            director: { ...settings.effective.contextRules.director,
              policy: DEFAULT_STORYBOOK_CONTEXT_RULES.director.policy } } } })
      }
      const installedDirectorPolicy = resolveInstanceSettings(ctx.roleplayHistory.snapshot(id))
        .effective.contextRules.director.policy
      if (fixedBoundary) expect(installedDirectorPolicy).toBe(DEFAULT_STORYBOOK_CONTEXT_RULES.director.policy)
      const directorPolicySha256 = createHash('sha256').update(installedDirectorPolicy).digest('hex')
      if (refreshDirectorGuidance || directorGuidancePath !== undefined) {
        const recipe = recipeOf(ctx.roleplayHistory.snapshot(id))
        const content = directorGuidancePath === undefined
          ? initialContextRecipe().director.find(section => section.id === 'performance')?.content
          : await readFile(directorGuidancePath, 'utf8')
        if (content === undefined) throw new Error('Missing current Director creative default')
        ctx.roleplayConfiguration.setRecipe(scope(), { ...recipe, director: recipe.director.map(section =>
          section.id === 'performance' ? { ...section, content } : section) })
      }
      const startRevision = ctx.roleplayHistory.snapshot(id).instance.revision
      const started = performance.now()
      let result: Awaited<ReturnType<typeof ctx.roleplayDirector.run>> | undefined
      let failure: unknown
      const runs: Array<{
        startRevision: number
        endRevision: number
        elapsedMs: number
        result: typeof result
        failure: string | null
      }> = []
      for (let index = 0; index < continuationRuns; index += 1) {
        const runStartRevision = ctx.roleplayHistory.snapshot(id).instance.revision
        const runStarted = performance.now()
        try { result = await ctx.roleplayDirector.run(scope(), '') } catch (error) { failure = error }
        runs.push({ startRevision: runStartRevision, endRevision: ctx.roleplayHistory.snapshot(id).instance.revision,
          elapsedMs: Math.round(performance.now() - runStarted), result,
          failure: failure instanceof Error ? failure.message : failure == null ? null : String(failure) })
        if (failure !== undefined || result?.status !== 'completed') break
      }
      const firstPage = ctx.roleplayPlay.read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 100 })
      const rows = [...firstPage.rows]
      while (rows.length < firstPage.total) {
        const page = ctx.roleplayPlay.read({ instanceId: id, audience: { kind: 'observer' },
          offset: rows.length, limit: 100 })
        if (page.rows.length === 0) break
        rows.push(...page.rows)
      }
      const play = { ...firstPage, rows }
      const usageAfter = await ctx.roleplayExecutionHistory.usage(id)
      const usageDelta = { ...usageAfter, usage: Object.fromEntries(Object.entries(usageAfter.usage)
        .map(([key, value]) => [key, value - (usageBefore.usage[key as keyof typeof usageBefore.usage] ?? 0)])) }
      const report = { stage, archivePath, boundarySha256, directorPolicySha256,
        provider: 'deepseek-official', model, reasoningEffort,
        directorRuns: continuationRuns, directorInstruction: '', refreshDirectorGuidance, fixedBoundary,
        directorGuidancePath, initialArchiveRevision, runStartRevision: startRevision, startRevision,
        endRevision: ctx.roleplayHistory.snapshot(id).instance.revision, elapsedMs: Math.round(performance.now() - started),
        result, failure: failure instanceof Error ? failure.message : failure ?? null, runs,
        usageBefore, usageAfter, usageDelta,
        play,
        sessions: ctx.agents.list().map(agent => agent.session)
          .filter(session => session.events.some(event => event.type === 'roleplay/execution-request'
            && event.data.context.instanceId === id && 'role' in event.data.context
            && event.data.context.role === 'director' && event.data.context.revision >= startRevision))
          .map(session => ({ id: session.id,
            events: session.events.filter(event => [
              'roleplay/execution-request', 'roleplay/execution-receipt', 'assistant/message', 'tool/call', 'tool/result',
            ].includes(event.type)) })) }
      await writeFile(join(output, 'director-replay.json'), JSON.stringify(report, null, 2) + '\n')
      await writeFile(join(output, 'after-director.json'),
        JSON.stringify(await ctx.roleplayTransfer.export(id, ctx.roleplayHistory.snapshot(id).instance.revision), null, 2) + '\n')
      if (failure !== undefined) throw failure
      expect(result?.status).toBe('completed')
    } finally { await scaffold?.close(); await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs() }
  })
