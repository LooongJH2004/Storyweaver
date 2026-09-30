/** Live perception judgment is evaluated separately from scripted transport checks. */
import type {} from '../src/index.ts'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, vi } from 'vitest'
import type { BookId, CommandId, CommandScope } from '@deepseek-ai/dsh-roleplay-core'
import { pendingWorldAttempts } from '../../roleplay-core/src/world-attempts.ts'
import { launchWebScaffold } from '../../../../apps/web/tests/scaffold.ts'
import { MockAdapter, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { savePerformanceArtifacts } from './performance-artifacts.ts'
import { performanceExecutions, performanceUsage } from './performance-usage.ts'
import { growthPerceptions } from './growth-perception.ts'

const model = process.env.DSH_ROLEPLAY_EVAL_MODEL ?? 'deepseek-v4-flash'
const reasoningEffort = process.env.DSH_ROLEPLAY_EVAL_REASONING_EFFORT ?? 'low'
const timeoutMs = Number(process.env.DSH_ROLEPLAY_EVAL_TIMEOUT_MS ?? 240000)
if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Evaluation timeout must be a positive integer')

it.skipIf(!process.env.DEEPSEEK_API_KEY?.trim())('A3/A4: settles a private search and routes its visible results',
  { timeout: timeoutMs + 60000, retry: 0 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-live-perception-'))
    const output = fileURLToPath(new URL(`../../../../.artifacts/independent-perception/${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url))
    await mkdir(output, { recursive: true })
    vi.stubEnv('DSH_SNAPSHOT', 'record')
    let scaffold: Awaited<ReturnType<typeof launchWebScaffold>> | undefined
    try {
      scaffold = await launchWebScaffold({
        extraOverlayPath: fileURLToPath(new URL('../../../experimental/roleplay-web-profile/cordis.patch.yml', import.meta.url)),
        extraInstallAnchors: [fileURLToPath(new URL('../../../experimental/roleplay-web-profile/package.json', import.meta.url))],
        directoryPickerMode: 'overlay', extraEntryOverrides: [
          { id: 'story-home', config: { root } },
          { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions') } },
          { id: 'storage-json', config: { root: join(root, 'storages') } },
          { id: 'roleplay-services', config: {
            databasePath: join(root, 'narrative.sqlite'), journalMode: 'wal', busyTimeoutMs: 1000,
            provider: 'deepseek-official', model, consolidationThreshold: 0, directorConsolidationThreshold: 0,
            worldFeedbackLimit: 2, directorCommandLimit: 24, discussionTurnLimit: 16, maxContextUpdateUnits: 16,
            queryPageLimit: 100, notificationIntervalMs: 100,
            recallCharacterLimit: 24000,
            characterLimits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
              maxActiveGoals: 32, maxScheduledIntentions: 32 },
          } },
        ],
      })
      const { ctx } = scaffold
      const draft = ctx.roleplayBooks.saveDraft({ id: 'private-search' as BookId, expectedRevision: 0,
        title: '私下调查', resources: [], document: { schemaVersion: 6, id: 'private-search', title: '私下调查',
          directorPrompt: '忠于给定的空间位置和可见范围。结算已有尝试，再让人物自己回应。', directorGuidance: {},
          characters: [
            { actorId: 'inspector', displayName: '阿砚', appearance: '蹲在书桌旁的年轻人', publicPersona: '谨慎，好奇。',
              rolePrompt: '私下查看书桌底部，先弄清自己的发现；尚未决定前不向同行透露。', actingGuidance: {}, capabilities: ['speak', 'act', 'memory'] },
            { actorId: 'witness', displayName: '小禾', appearance: '站在门边的孩子', publicPersona: '八岁，喜欢听钟声。',
              rolePrompt: '在门边等同行，只根据自己看到听到的事回应。', actingGuidance: {}, capabilities: ['speak', 'act', 'memory'] },
          ] } })
      const version = ctx.roleplayBooks.publish(draft.id, draft.revision)
      const id = ctx.roleplayInstances.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId }).instance.id
      const scope = (): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
        expectedRevision: ctx.roleplayHistory.snapshot(id).instance.revision, principal: { kind: 'player' } })
      ctx.roleplayPeople.stage(scope(), { id: 'hall', location: '安静的大厅', present: ['inspector', 'witness'], appearances: [] })
      const concealed = '我低下头，避开门边同行的视线，查看书桌底部是否有贴着的东西。'
      const seed = ctx.llm.registerAdapter(['perception-seed'], new MockAdapter([
        toolCallResponse('seed-attempt', 'npc_commit_turn', { posture: 'waiting', behavior: [
          { kind: 'action', attempt: concealed, visibility: 'concealed', await_result: true },
        ] }),
      ]))
      await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
        selection: { provider: 'perception-seed', model: 'mock' } })
      try { await ctx.roleplayRuntime.run(scope(), 'inspector') } finally { seed() }
      const seededAttempt = pendingWorldAttempts(ctx.roleplayHistory.snapshot(id))[0]!
      expect(seededAttempt).toBeDefined()
      await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
        selection: { provider: 'deepseek-official', model, reasoningEffort } })
      const initialRevision = ctx.roleplayHistory.snapshot(id).instance.revision
      const instruction = '结算当前查看桌底的尝试：阿砚实际看见一小块蓝色封蜡，清楚印着「青鹭-731」。只有他的角度能看见；门边的小禾看不到桌底，也没注意到他的隐蔽动作。与此同时，大厅的钟响一声，两人都听见。按各自可感知的内容投递结果，让两人自己回应；不要替人物共享私人发现，不增加突发危机。'
      const started = performance.now()
      let failure: unknown; let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        void ctx.roleplayDirector.abort(id, Number.MAX_SAFE_INTEGER, 'Evaluation deadline').catch(() => {})
      }, timeoutMs)
      try { await ctx.roleplayDirector.run(scope(), instruction) }
      catch (error) { failure = error } finally { clearTimeout(timer) }
      const snapshot = ctx.roleplayHistory.snapshot(id)
      const sessions = ctx.agents.list().map((agent) => {
        const start = agent.session.events.findIndex(event => event.type === 'roleplay/execution-request'
          && event.data.context.instanceId === id && event.data.context.revision >= initialRevision)
        return { id: agent.session.id, events: start < 0 ? [] : agent.session.events.slice(start) }
      }).filter(session => session.events.length > 0)
      const requests = sessions.flatMap(session => session.events).filter(event => event.type === 'roleplay/execution-request')
        .map(event => event.data.context)
      const perceptions = ['inspector', 'witness'].map((actorId) => {
        const context = requests.filter(context => 'actorId' in context && context.actorId === actorId
          && !context.sections.some(section => section.id === 'consolidation'))
          .sort((a, b) => a.revision - b.revision)[0]
        return { actorId, context: context ?? null, evidence: growthPerceptions(context, initialRevision) }
      })
      const pendingAttempts = pendingWorldAttempts(snapshot)
      const errors = await savePerformanceArtifacts(output, {
        model, reasoningEffort, initialRevision, instruction, document: version.document,
        seed: { kind: 'mock-adapter', attempt: seededAttempt }, executionSettings: { consolidationThreshold: 0,
          directorConsolidationThreshold: 0, worldFeedbackLimit: 2 },
        elapsedMs: performance.now() - started, timedOut, failure: failure instanceof Error ? failure.message : failure ?? null,
        perceptions, pendingAttempts, usageByPurpose: performanceUsage(sessions), executionUsage: performanceExecutions(sessions),
        play: ctx.roleplayPlay.read({ instanceId: id, audience: { kind: 'observer' }, revision: snapshot.instance.revision, offset: 0, limit: 100 }),
        humanReview: { status: 'unreviewed', visibility: null, responsiveness: null, repetition: null },
      }, { archive: () => ctx.roleplayTransfer.export(id, snapshot.instance.revision),
        usage: () => ctx.roleplayExecutionHistory.usage(id) })
      expect(errors, output).toEqual([])
      expect(timedOut, output).toBe(false)
      if (failure !== undefined) throw failure
      expect(pendingAttempts.map(item => item.id), output).not.toContain(seededAttempt.id)
      for (const actor of perceptions) expect(actor.evidence.length, `${output}: ${actor.actorId} needs a fresh observation`).toBeGreaterThan(0)
      expect(JSON.stringify(perceptions[0]!.evidence), output).toContain('青鹭-731')
      expect(JSON.stringify(perceptions[1]!.evidence), output).not.toContain('青鹭-731')
      expect(perceptions[1]!.context?.text, 'Private findings must not leak through the inspector\'s subsequent action text').not.toContain('青鹭-731')
    } finally {
      await scaffold?.close()
      vi.unstubAllEnvs()
      await rm(root, { recursive: true, force: true })
    }
  })
