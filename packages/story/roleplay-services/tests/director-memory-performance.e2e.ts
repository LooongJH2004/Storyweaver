/** Fixed world records isolate native director consolidation from discussion generation. */
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

it.skipIf(!process.env.DEEPSEEK_API_KEY?.trim())('consolidates fixed director records through the native command envelope',
  { timeout: 150000, retry: 0 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-director-memory-'))
    const output = fileURLToPath(new URL(`../../../../.artifacts/director-memory/${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url))
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
            provider: 'deepseek-official', model, consolidationThreshold: 0, directorConsolidationThreshold: 2,
            consolidationBatchLimit: 1, queryPageLimit: 100, notificationIntervalMs: 100,
            recallCharacterLimit: 24000,
            characterLimits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
              maxActiveGoals: 32, maxScheduledIntentions: 32 },
            directorCommandLimit: 24, discussionTurnLimit: 24, maxContextUpdateUnits: 16 } },
        ],
      })
      const { ctx } = scaffold
      const draft = ctx.roleplayBooks.saveDraft({ id: 'director-memory' as BookId, expectedRevision: 0,
        title: '导演记忆', resources: [], document: { schemaVersion: 6, id: 'director-memory', title: '导演记忆',
          directorPrompt: '忠于已经结算的事实，不添加事件或代替演员行动。', directorGuidance: {},
          characters: [{ actorId: 'keeper', displayName: '店主', appearance: '店主', publicPersona: '认真保管物品。',
            rolePrompt: '', capabilities: ['speak'], actingGuidance: {} }] } })
      const version = ctx.roleplayBooks.publish(draft.id, draft.revision)
      const id = ctx.roleplayInstances.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId }).instance.id
      const scope = (): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
        expectedRevision: ctx.roleplayHistory.snapshot(id).instance.revision, principal: { kind: 'player' } })
      ctx.roleplayPeople.stage(scope(), { id: 'inn', location: '客栈', present: ['keeper'], appearances: [] })
      for (const content of ['客人把钥匙交给店主，店主将钥匙放进柜中。双方约定翌日清晨归还，归还尚未发生。',
        '次日清晨，店主将钥匙交回，客人已经接过。归还完成，钥匙不在柜中。']) {
        ctx.roleplayWorld.observe(scope(), { summary: '钥匙寄存', content, deliveries: [], state: [] })
      }
      const before = ctx.roleplayHistory.snapshot(id)
      const factIds = before.entities.filter(item => item.key.collection === 'facts').map(item => item.key.id)
      await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
        selection: { provider: 'deepseek-official', model, reasoningEffort } })
      const started = performance.now()
      let failure: unknown; let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        void ctx.roleplayDirector.abort(id, Number.MAX_SAFE_INTEGER, 'Evaluation deadline').catch(() => {
          // Completion may race the deadline; the scaffold still owns final cleanup.
        })
      }, 120000)
      try { await ctx.roleplayDirector.run(scope(), '本回合无需新增事件、旁白或角色回应。直接结束本回合，不调度演员，不推进讨论。') }
      catch (error) { failure = error } finally { clearTimeout(timer) }
      const snapshot = ctx.roleplayHistory.snapshot(id)
      const sessions = ctx.agents.list().map(agent => ({ id: agent.session.id, events: agent.session.events }))
        .filter(session => session.events.some(event => event.type === 'roleplay/execution-request' && event.data.context.instanceId === id))
      const requests = sessions.flatMap(session => session.events).filter(event => event.type === 'roleplay/execution-request')
        .map(event => event.data.context)
      const retention = ctx.roleplayRetentionViews.review(id, 'director')
      const errors = await savePerformanceArtifacts(output, { model, reasoningEffort, elapsedMs: performance.now() - started,
        timedOut, failure: failure instanceof Error ? failure.message : failure ?? null, factIds,
        retention, usageByPurpose: performanceUsage(sessions), executionSettings: { directorConsolidationThreshold: 2,
          consolidationBatchLimit: 1, memoryActivation: 'review' }, humanReview: { status: 'unreviewed' },
      }, { archive: () => ctx.roleplayTransfer.export(id, snapshot.instance.revision),
        usage: () => ctx.roleplayExecutionHistory.usage(id) })
      expect(errors, output).toEqual([])
      expect(timedOut, output).toBe(false)
      if (failure !== undefined) throw failure
      expect(requests.some(request => 'actorId' in request)).toBe(false)
      expect(requests.filter(request => request.sections.some(section => section.id === 'consolidation'))).toHaveLength(1)
      expect(snapshot.entities.filter(item => ['facts', 'behavior', 'narration'].includes(item.key.collection)))
        .toEqual(before.entities.filter(item => ['facts', 'behavior', 'narration'].includes(item.key.collection)))
      expect(retention.retention.notes).toEqual([])
      expect(retention.retention.proposals.length).toBeGreaterThan(0)
      expect(retention.retention.proposals.every(proposal => proposal.status === 'proposed')).toBe(true)
      expect(retention.retention.proposals.flatMap(proposal => proposal.unit.sourceIds).toSorted()).toEqual(factIds.toSorted())
    } finally { await scaffold?.close(); await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs() }
  })
