/** A fixed personal history isolates real consolidation from director and discussion generation. */
import type {} from '../src/index.ts'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, vi } from 'vitest'
import type { BookId, CommandId, CommandScope, Document } from '@deepseek-ai/dsh-roleplay-core'
import { parseStorybookDocument } from '@deepseek-ai/dsh-roleplay-core/storybook'
import { evidenceFor } from '@deepseek-ai/dsh-roleplay-core/world'
import { launchWebScaffold } from '../../../../apps/web/tests/scaffold.ts'
import { MockAdapter, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { savePerformanceArtifacts } from './performance-artifacts.ts'
import { performanceUsage, performanceExecutions } from './performance-usage.ts'

const model = process.env.DSH_ROLEPLAY_EVAL_MODEL ?? 'deepseek-v4-flash'
const reasoningEffort = process.env.DSH_ROLEPLAY_EVAL_REASONING_EFFORT ?? 'low'
const historyFormat = process.env.DSH_ROLEPLAY_EVAL_HISTORY_FORMAT ?? 'narrated'
if (!['narrated', 'attributed', 'interrupted'].includes(historyFormat)) throw new Error('History format must be narrated, attributed or interrupted')
const timeoutMs = Number(process.env.DSH_ROLEPLAY_EVAL_TIMEOUT_MS ?? 240000)
if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Evaluation timeout must be a positive integer')
const history = [
  '店主当面对你说：「旧告示说红石一碰水就化，我没有试过。」你答应先观察再决定存放办法。',
  historyFormat === 'interrupted'
    ? '你的手还没碰到材料，托盘自行倾斜，标着红石的同一块材料滑进清水。你没有接住，也没有把它放进水里。材料沉在盆底，没有消失。'
    : '你看见标着红石的同一块材料滑进清水。材料沉在盆底，没有消失。',
  '你守着水盆看了半个时辰，材料仍完整，水仍清澈。期间没人换过材料或水。',
  '你把材料取出放在干托盘上。店主问你明天是否还要完全照旧告示办。',
]
const privateClue = 'PRIVATE-OTHER-ONLY: 店主独自发现告示背面署名为青岚，你没有见到告示背面。'
const consolidationThreshold = history.length + (historyFormat === 'narrated' ? 0 : 1)
const document = parseStorybookDocument({ schemaVersion: 6, id: 'memory-probe', title: '记忆整理验证',
  directorPrompt: '只提供人物能够感知的结果。', directorGuidance: {}, commonKnowledge: [],
  characters: ['learner', 'keeper'].map(actorId => ({ actorId, displayName: actorId === 'learner' ? '学徒' : '店主',
    appearance: actorId === 'learner' ? '穿围裙的学徒' : '年长的店主', publicPersona: '认真，愿意根据亲眼经历改进做法。',
    rolePrompt: '保管材料，区分别人的说法与自己的观察。表达简洁，有理由时作出选择。',
    capabilities: ['speak', 'act', 'reflect', 'memory', 'goals'],
    actingGuidance: { lengthPreference: process.env.DSH_ROLEPLAY_EVAL_ACTOR_LENGTH ?? '' }, initialKnowledge: [] })),
})

it.skipIf(!process.env.DEEPSEEK_API_KEY?.trim())('Fixed history is retained before a later choice',
  { timeout: timeoutMs + 60000, retry: 0 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-live-memory-'))
    const output = fileURLToPath(new URL(`../../../../.artifacts/independent-memory/${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url))
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
          { id: 'roleplay-services', config: { databasePath: join(root, 'narrative.sqlite'), journalMode: 'wal', busyTimeoutMs: 1000,
            provider: 'deepseek-official', model, consolidationThreshold, consolidationBatchLimit: 1,
            directorConsolidationThreshold: 0, queryPageLimit: 100, notificationIntervalMs: 100,
            recallCharacterLimit: 24000,
            characterLimits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
              maxActiveGoals: 32, maxScheduledIntentions: 32 },
            directorCommandLimit: 24, discussionTurnLimit: 24, maxContextUpdateUnits: 16 } },
        ],
      })
      const { ctx } = scaffold
      await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
        selection: { provider: 'deepseek-official', model, reasoningEffort } })
      const draft = ctx.roleplayBooks.saveDraft({ id: 'memory-probe' as BookId, expectedRevision: 0,
        title: '记忆整理验证', resources: [], document: JSON.parse(JSON.stringify(document)) as Document })
      const version = ctx.roleplayBooks.publish(draft.id, draft.revision)
      const id = ctx.roleplayInstances.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId }).instance.id
      const scope = (): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
        expectedRevision: ctx.roleplayHistory.snapshot(id).instance.revision, principal: { kind: 'player' } })
      ctx.roleplayPeople.stage(scope(), { id: 'workshop', location: '作坊', present: ['learner', 'keeper'], appearances: [] })
      const observe = (actorId: string, content: string) => ctx.roleplayWorld.observe(scope(), {
        summary: '作坊见闻', content, deliveries: [{ actorId, content, kind: 'observation', sourceRefs: [] }], state: [],
      })
      if (historyFormat !== 'narrated') {
        if (historyFormat === 'interrupted') observe('learner', history[0]!)
        const dispose = ctx.llm.registerAdapter(['memory-history-fixture'], new MockAdapter([
          historyFormat === 'interrupted'
            ? toolCallResponse('catch-attempt', 'npc_commit_turn', { posture: 'waiting', behavior: [
              { kind: 'action', attempt: '伸手接住正滑向水盆的红石材料，想让它留在干处。', visibility: 'public', await_result: true },
            ] })
            : toolCallResponse('keeper-statement', 'npc_commit_turn', { posture: 'watching', behavior: [
              { kind: 'speech', text: '旧告示说红石一碰水就化，我没有试过。', delivery: 'spoken' },
            ] }),
        ]))
        try {
          await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
            selection: { provider: 'memory-history-fixture', model: 'mock' } })
          await ctx.roleplayRuntime.run(scope(), historyFormat === 'interrupted' ? 'learner' : 'keeper')
        } finally { dispose() }
        await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
          selection: { provider: 'deepseek-official', model, reasoningEffort } })
        if (historyFormat === 'interrupted') {
          const attempt = evidenceFor(ctx.roleplayHistory.snapshot(id), 'learner').find(item => item.behavior?.kind === 'action')!
          ctx.roleplayWorld.observe(scope(), { summary: '没接住材料', content: history[1]!, settles: [attempt.id], state: [],
            deliveries: [{ actorId: 'learner', content: history[1]!, kind: 'observation', sourceRefs: [] }] })
          for (const content of history.slice(2)) observe('learner', content)
        } else {
          const speech = evidenceFor(ctx.roleplayHistory.snapshot(id), 'learner')[0]
          expect(speech?.behavior?.kind).toBe('speech')
          expect(speech?.content).toBe('旧告示说红石一碰水就化，我没有试过。')
          observe('learner', '你答应先观察再决定存放办法。')
          for (const content of history.slice(1)) observe('learner', content)
        }
      } else for (const content of history) observe('learner', content)
      observe('keeper', privateClue)
      const historySourceIds = evidenceFor(ctx.roleplayHistory.snapshot(id), 'learner').map(item => item.id)
      expect(historySourceIds).toHaveLength(consolidationThreshold)
      ctx.roleplayRetention.review(scope(), { owner: 'actor:learner', operation: 'policy', activation: 'automatic' })
      const initialRevision = ctx.roleplayHistory.snapshot(id).instance.revision
      const started = performance.now()
      let failure: unknown
      let timedOut = false
      let afterConsolidation: unknown = null
      let followupRevision: number | undefined
      let consolidatedSourceIds: string[] = []
      let supportingSourceIds: string[] = []
      let unrepresentedSourceIds: string[] = []
      const recallChecks: unknown[] = []
      const timer = setTimeout(() => {
        timedOut = true
        void ctx.roleplayRuntime.abort(id, Number.MAX_SAFE_INTEGER, 'Evaluation deadline')
          .catch(() => { /* The awaited execution records the failure. */ })
      }, timeoutMs)
      try {
        await ctx.roleplayRuntime.run(scope(), 'learner')
        const retained = ctx.roleplayRetentionViews.review(id, 'actor:learner')
        afterConsolidation = structuredClone(retained)
        const noteSources = [...new Set(retained.retention.notes.flatMap(note => note.sourceIds))]
        const processed = new Set(retained.retention.proposals.filter(proposal => proposal.status === 'approved'
          && proposal.unit.disposition === 'represented').flatMap(proposal => proposal.unit.sourceIds))
        const received = new Set(evidenceFor(ctx.roleplayHistory.snapshot(id), 'learner').map(item => item.id))
        consolidatedSourceIds = noteSources.filter(source => processed.has(source))
        supportingSourceIds = noteSources.filter(source => !processed.has(source) && received.has(source))
        expect(retained.retention.notes.length, 'The experience must produce effective memory').toBeGreaterThan(0)
        const archivedSources = new Set(retained.retention.proposals
          .filter(proposal => proposal.status === 'approved' && proposal.unit.disposition === 'archive')
          .flatMap(proposal => proposal.unit.sourceIds))
        unrepresentedSourceIds = historySourceIds.filter(source => !consolidatedSourceIds.includes(source) && !archivedSources.has(source))
        for (const note of retained.retention.notes) {
          const query = `retention:${note.id}:r${note.revision}`
          const own = ctx.roleplayRetentionViews.recall(id, 'actor:learner', { query, offset: 0, limit: 1 }, retained.revision)
          const other = ctx.roleplayRetentionViews.recall(id, 'actor:keeper', { query, offset: 0, limit: 1 }, retained.revision)
          recallChecks.push({ query, own, other })
          expect(own.entries[0]?.id).toBe(query)
          expect(other.entries).toEqual([])
        }
        observe('learner', '次日清晨，干燥的材料还在托盘上。店主问：「今天准备怎么放？为什么？」请自行决定。')
        followupRevision = ctx.roleplayHistory.snapshot(id).instance.revision
        await ctx.roleplayRuntime.run(scope(), 'learner')
      } catch (error) { failure = error } finally { clearTimeout(timer) }
      const snapshot = ctx.roleplayHistory.snapshot(id)
      const sessions = ctx.agents.list().map((agent) => {
        const start = agent.session.events.findIndex(event => event.type === 'roleplay/execution-request'
          && event.data.context.instanceId === id && event.data.context.revision >= initialRevision)
        return { id: agent.session.id, events: start < 0 ? [] : agent.session.events.slice(start) }
      }).filter(session => session.events.length > 0)
      const requests = sessions.flatMap(session => session.events).filter(event => event.type === 'roleplay/execution-request')
        .map(event => event.data.context).filter(context => context.instanceId === id)
      const privateConsolidationRequests = requests.filter(request => request.sections.some(section => section.id === 'consolidation')).length
      const followup = requests.find(request => followupRevision !== undefined && request.revision >= followupRevision
        && !request.sections.some(section => section.id === 'consolidation'))
      const followupEvidence = followup?.sections.filter(section => section.id === 'evidence') ?? []
      const coveredOriginalsStillIncluded = consolidatedSourceIds.filter(id =>
        followupEvidence.some(section => section.sources.includes(id)))
      const unrepresentedOriginalsMissing = unrepresentedSourceIds.filter(id =>
        !followupEvidence.some(section => section.sources.includes(id)))
      const supportingOriginalsMissing = supportingSourceIds.filter(id =>
        !followupEvidence.some(section => section.sources.includes(id)))
      const errors = await savePerformanceArtifacts(output, { model, reasoningEffort, historyFormat,
        initialRevision, history, historySourceIds,
        usageScope: 'Executions at or after initialRevision; whole-instance usage includes controlled setup.',
        privateConsolidationRequests, document: version.document,
        elapsedMs: performance.now() - started, timedOut, failure: failure instanceof Error ? failure.message : failure ?? null,
        executionSettings: { consolidationThreshold, consolidationBatchLimit: 1, directorConsolidationThreshold: 0 },
        afterConsolidation, recallChecks, memories: ctx.roleplayRetentionViews.review(id, 'actor:learner'),
        followupContext: { revision: followup?.revision ?? null, consolidatedSourceIds, coveredOriginalsStillIncluded,
          unrepresentedSourceIds, unrepresentedOriginalsMissing,
          supportingSourceIds, supportingOriginalsMissing,
          sections: followup?.sections.filter(section => ['evidence', 'retention', 'lifecycle', 'subjective-state'].includes(section.id)) ?? [] },
        usageByPurpose: performanceUsage(sessions), executionUsage: performanceExecutions(sessions),
        play: ctx.roleplayPlay.read({ instanceId: id, audience: { kind: 'observer' }, revision: snapshot.instance.revision, offset: 0, limit: 100 }),
        humanReview: { status: 'unreviewed', conciseUnderstanding: null, revisedBelief: null, laterChoice: null },
      }, { archive: () => ctx.roleplayTransfer.export(id, snapshot.instance.revision),
        usage: () => ctx.roleplayExecutionHistory.usage(id) })
      expect(errors, output).toEqual([])
      expect(timedOut, output).toBe(false)
      if (failure !== undefined) throw failure
      for (const request of requests) expect(request.text, output).not.toContain(privateClue)
      for (const request of requests.filter(request => request.sections.some(section => section.id === 'consolidation'))) {
        expect(request.sections.some(section => ['style', 'scene-style', 'performance'].includes(section.id)), output).toBe(false)
      }
      expect(afterConsolidation, output).not.toBeNull()
      expect(followup, 'The later response needs an archived ordinary request').toBeDefined()
      expect(coveredOriginalsStillIncluded, 'Effective summaries must replace covered unpinned originals').toEqual([])
      expect(unrepresentedOriginalsMissing, 'This small history fits the evidence budget: unrepresented originals must remain available').toEqual([])
      expect(supportingOriginalsMissing, 'Supporting event citations do not process those originals').toEqual([])
    } finally {
      await scaffold?.close()
      vi.unstubAllEnvs()
      // Only the directory returned by mkdtemp is removed; artifacts are outside it.
      await rm(root, { recursive: true, force: true })
    }
  })
