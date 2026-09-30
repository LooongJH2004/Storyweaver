/** A seeded pending action isolates native consolidation from action-generation variance. */
import type {} from '../src/index.ts'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, vi } from 'vitest'
import type { BookId, CommandId, CommandScope } from '@deepseek-ai/dsh-roleplay-core'
import { launchWebScaffold } from '../../../../apps/web/tests/scaffold.ts'
import { savePerformanceArtifacts } from './performance-artifacts.ts'
import { performanceUsage } from './performance-usage.ts'
import { MockAdapter, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { pendingWorldAttempts } from '@deepseek-ai/dsh-roleplay-core/world-attempts'

it.skipIf(!process.env.DEEPSEEK_API_KEY?.trim())('consolidates an unfinished attempt without host settlement',
  { timeout: 150000, retry: 0 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-pending-attempt-'))
    const output = fileURLToPath(new URL(`../../../../.artifacts/pending-attempt/${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url))
    await mkdir(output, { recursive: true })
    const model = process.env.DSH_ROLEPLAY_EVAL_MODEL ?? 'deepseek-v4-flash'
    const reasoningEffort = process.env.DSH_ROLEPLAY_EVAL_REASONING_EFFORT ?? 'low'
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
          { id: 'roleplay-services', config: { databasePath: join(root, 'narrative.sqlite'), journalMode: 'wal', busyTimeoutMs: 1000,
            provider: 'deepseek-official', model, consolidationThreshold: 1, directorConsolidationThreshold: 0,
            consolidationBatchLimit: 1, queryPageLimit: 100, notificationIntervalMs: 100,
            recallCharacterLimit: 24000,
            characterLimits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
              maxActiveGoals: 32, maxScheduledIntentions: 32 },
            directorCommandLimit: 24, discussionTurnLimit: 24, maxContextUpdateUnits: 16 } },
        ],
      })
      const { ctx } = scaffold
      const draft = ctx.roleplayBooks.saveDraft({ id: 'pending-attempt' as BookId, expectedRevision: 0,
        title: '记忆修订', resources: [], document: { schemaVersion: 6, id: 'pending-attempt', title: '记忆修订',
          directorPrompt: '只投递当事人可感知的信息。', directorGuidance: {}, commonKnowledge: [],
          characters: [{ actorId: 'keeper', displayName: '店主', appearance: '店主', publicPersona: '认真保管物品。',
            rolePrompt: '根据自己的经历作出选择，发现旧认识过时时更新自己的记忆。',
            capabilities: ['speak', 'act', 'memory', 'reflect'], actingGuidance: {} }] } })
      const version = ctx.roleplayBooks.publish(draft.id, draft.revision)
      const id = ctx.roleplayInstances.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId }).instance.id
      const scope = (): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
        expectedRevision: ctx.roleplayHistory.snapshot(id).instance.revision, principal: { kind: 'player' } })
      ctx.roleplayPeople.stage(scope(), { id: 'inn', location: '客栈', present: ['keeper'], appearances: [] })
      ctx.roleplayRetention.review(scope(), { owner: 'actor:keeper', operation: 'policy', activation: 'automatic' })
      const seed = new MockAdapter([toolCallResponse('seed', 'npc_commit_turn', { posture: 'waiting',
        behavior: [{ kind: 'action', visibility: 'public', await_result: true,
          attempt: '我试着把沉重的木箱抬上柜台，想看看自己能否抬得动。' }] })])
      const stream = seed.stream.bind(seed)
      seed.stream = async function* (options) {
        yield* stream(options)
        await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
          selection: { provider: 'deepseek-official', model, reasoningEffort } })
      }
      const dispose = ctx.llm.registerAdapter(['attempt-seed'], seed)
      await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
        selection: { provider: 'attempt-seed', model: 'mock' } })
      const initialRevision = ctx.roleplayHistory.snapshot(id).instance.revision
      const started = performance.now()
      let failure: unknown; let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        void ctx.roleplayRuntime.abort(id, Number.MAX_SAFE_INTEGER, 'Evaluation deadline').catch(() => {
          // Completion can race the deadline; scaffold cleanup still owns shutdown.
        })
      }, 120000)
      let foregroundElapsedMs = 0
      try {
        await ctx.roleplayRuntime.run(scope(), 'keeper')
        foregroundElapsedMs = performance.now() - started
        expect(ctx.roleplayMemoryQueue.list(id).some(job => job.status === 'queued')).toBe(true)
        await vi.waitFor(() => {
          const jobs = ctx.roleplayMemoryQueue.list(id)
          const failed = jobs.find(job => job.status === 'failed')
          if (failed !== undefined) throw new Error(failed.error)
          expect(jobs.some(job => job.status === 'applied')).toBe(true)
        }, { timeout: 110000, interval: 250 })
      }
      catch (error) { failure = error } finally { clearTimeout(timer); dispose() }
      const snapshot = ctx.roleplayHistory.snapshot(id)
      const sessions = ctx.agents.list().map((agent) => {
        const start = agent.session.events.findIndex(event => event.type === 'roleplay/execution-request'
          && event.data.context.instanceId === id && event.data.context.revision >= initialRevision)
        return { id: agent.session.id, events: start < 0 ? [] : agent.session.events.slice(start) }
      }).filter(session => session.events.length > 0)
      const retention = ctx.roleplayRetentionViews.review(id, 'actor:keeper')
      const pending = pendingWorldAttempts(snapshot)
      const requests = sessions.flatMap(session => session.events).filter(event => event.type === 'roleplay/execution-request')
      const privateRequests = requests.filter(event => event.type === 'roleplay/execution-request'
        && event.data.context.sections.some(section => section.id === 'consolidation'))
      const structural = { pendingCount: pending.length, noteCount: retention.retention.notes.length,
        inlineStatusVisible: privateRequests.some(event => event.type === 'roleplay/execution-request'
          && event.data.context.sections.some(section => section.id === 'consolidation'
            && section.content.includes('"resultStatus":"awaiting-world-feedback"'))) }
      const errors = await savePerformanceArtifacts(output, { model, reasoningEffort, elapsedMs: performance.now() - started,
        foregroundElapsedMs, jobs: ctx.roleplayMemoryQueue.list(id), timedOut,
        failure: failure instanceof Error ? failure.message : failure ?? null, pending, retention, structural,
        usageByPurpose: performanceUsage(sessions), initialRevision,
        scope: 'Controlled action seed; native private consolidation only. Automatic activation is fixture-only.',
        humanReview: { status: 'unreviewed', preservesAttemptUncertainty: null, inventsCompletion: null },
      }, { archive: () => ctx.roleplayTransfer.export(id, snapshot.instance.revision),
        usage: () => ctx.roleplayExecutionHistory.usage(id) })
      expect(errors, output).toEqual([])
      expect(timedOut, output).toBe(false)
      if (failure !== undefined) throw failure
      expect(structural, output).toEqual({ pendingCount: 1, noteCount: 1, inlineStatusVisible: true })
    } finally { await scaffold?.close(); await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs() }
  })
