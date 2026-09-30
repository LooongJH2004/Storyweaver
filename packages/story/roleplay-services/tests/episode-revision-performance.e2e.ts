/** A seeded unresolved episode isolates native detail recall and revision. */
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
import { evidenceFor } from '@deepseek-ai/dsh-roleplay-core/world'

it.skipIf(!process.env.DEEPSEEK_API_KEY?.trim())('revises a seeded unresolved episode after receiving its answer',
  { timeout: 150000, retry: 0 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-episode-revision-'))
    const output = fileURLToPath(new URL(`../../../../.artifacts/episode-revision/${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url))
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
            provider: 'deepseek-official', model, consolidationThreshold: 0, directorConsolidationThreshold: 0,
            consolidationBatchLimit: 1, queryPageLimit: 100, notificationIntervalMs: 100,
            recallCharacterLimit: 24000,
            characterLimits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
              maxActiveGoals: 32, maxScheduledIntentions: 32 },
            directorCommandLimit: 24, discussionTurnLimit: 24, maxContextUpdateUnits: 16 } },
        ],
      })
      const { ctx } = scaffold
      const draft = ctx.roleplayBooks.saveDraft({ id: 'episode-revision' as BookId, expectedRevision: 0,
        title: '记忆修订', resources: [], document: { schemaVersion: 6, id: 'episode-revision', title: '记忆修订',
          directorPrompt: '只投递当事人可感知的信息。', directorGuidance: {}, commonKnowledge: [],
          characters: [{ actorId: 'keeper', displayName: '店主', appearance: '店主', publicPersona: '认真保管物品。',
            rolePrompt: '根据自己的经历作出选择，发现旧认识过时时更新自己的记忆。',
            capabilities: ['speak', 'memory', 'reflect'], actingGuidance: {} }] } })
      const version = ctx.roleplayBooks.publish(draft.id, draft.revision)
      const id = ctx.roleplayInstances.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId }).instance.id
      const scope = (): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
        expectedRevision: ctx.roleplayHistory.snapshot(id).instance.revision, principal: { kind: 'player' } })
      ctx.roleplayPeople.stage(scope(), { id: 'inn', location: '客栈', present: ['keeper'], appearances: [] })
      const observe = (content: string) => ctx.roleplayWorld.observe(scope(), { summary: '钥匙归还', content,
        deliveries: [{ actorId: 'keeper', content, kind: 'observation', sourceRefs: [] }], state: [] })
      observe('客人托你保管铜钥匙，说会明早来取。钥匙在柜中，你还不知道他几点到。')
      const original = evidenceFor(ctx.roleplayHistory.snapshot(id), 'keeper')[0]!.id
      ctx.roleplayRetention.review(scope(), { owner: 'actor:keeper', operation: 'policy', activation: 'automatic' })
      const dispose = ctx.llm.registerAdapter(['episode-seed'], new MockAdapter([
        toolCallResponse('seed', 'npc_commit_turn', { posture: 'watching', context_update: [{
          sourceIds: [original], disposition: 'represented', reason: 'Keep the custody obligation.',
          changes: [{ operation: 'add', kind: 'question', text: '我代客人保管铜钥匙，尚不知他何时取回。', sourceIds: [original],
            episode: { topic: '铜钥匙何时归还', experience: '客人把铜钥匙交给我，约定明早来取。',
              interpretation: '我还不知道他几点到，需要等他的消息。',
              unresolved: ['客人几点来取铜钥匙？'] } }],
        }] }),
      ]))
      try {
        await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
          selection: { provider: 'episode-seed', model: 'mock' } })
        await ctx.roleplayRuntime.run(scope(), 'keeper')
      } finally { dispose() }
      const seeded = ctx.roleplayRetentionViews.review(id, 'actor:keeper').retention.notes[0]!
      observe('次日清晨七点，客人到场。你已从柜中拿出铜钥匙交还，客人已经接过并离开。钥匙不在你手里，寄存已经结束。')
      await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
        selection: { provider: 'deepseek-official', model, reasoningEffort } })
      const initialRevision = ctx.roleplayHistory.snapshot(id).instance.revision
      const started = performance.now()
      let failure: unknown; let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        void ctx.roleplayRuntime.abort(id, Number.MAX_SAFE_INTEGER, 'Evaluation deadline').catch(() => {
          // Completion can race the deadline; scaffold cleanup still owns shutdown.
        })
      }, 120000)
      try { await ctx.roleplayRuntime.run(scope(), 'keeper') }
      catch (error) { failure = error } finally { clearTimeout(timer) }
      const snapshot = ctx.roleplayHistory.snapshot(id)
      const sessions = ctx.agents.list().map((agent) => {
        const start = agent.session.events.findIndex(event => event.type === 'roleplay/execution-request'
          && event.data.context.instanceId === id && event.data.context.revision >= initialRevision)
        return { id: agent.session.id, events: start < 0 ? [] : agent.session.events.slice(start) }
      }).filter(session => session.events.length > 0)
      const retention = ctx.roleplayRetentionViews.review(id, 'actor:keeper')
      const revised = retention.retention.notes.find(note => note.id === seeded.id)
      const structural = { sameNoteRevised: (revised?.revision ?? 0) > seeded.revision,
        detailsUpdated: revised?.episode !== undefined && JSON.stringify(revised.episode) !== JSON.stringify(seeded.episode),
        noStoredOpenQuestions: revised?.episode?.unresolved.length === 0 }
      const errors = await savePerformanceArtifacts(output, { model, reasoningEffort, elapsedMs: performance.now() - started,
        timedOut, failure: failure instanceof Error ? failure.message : failure ?? null, seeded, retention, structural,
        usageByPurpose: performanceUsage(sessions), initialRevision,
        scope: 'Controlled seed; native ordinary actor response only. Automatic activation is fixture-only.',
        humanReview: { status: 'unreviewed', correctAnswer: null, preservesPastExperience: null },
      }, { archive: () => ctx.roleplayTransfer.export(id, snapshot.instance.revision),
        usage: () => ctx.roleplayExecutionHistory.usage(id) })
      expect(errors, output).toEqual([])
      expect(timedOut, output).toBe(false)
      if (failure !== undefined) throw failure
      expect(structural, output).toEqual({ sameNoteRevised: true, detailsUpdated: true, noStoredOpenQuestions: true })
    } finally { await scaffold?.close(); await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs() }
  })
