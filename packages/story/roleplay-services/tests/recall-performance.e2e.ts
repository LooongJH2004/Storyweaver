/** A seeded memory isolates real on-demand reading from memory-generation quality. */
import type {} from '../src/index.ts'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, vi } from 'vitest'
import { materializeRequestHeaderAt } from '@deepseek-ai/dsh-session'
import type { BookId, CommandId, CommandScope, Document } from '@deepseek-ai/dsh-roleplay-core'
import { parseStorybookDocument } from '@deepseek-ai/dsh-roleplay-core/storybook'
import { evidenceFor } from '@deepseek-ai/dsh-roleplay-core/world'
import { launchWebScaffold } from '../../../../apps/web/tests/scaffold.ts'
import { MockAdapter, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { savePerformanceArtifacts } from './performance-artifacts.ts'
import { performanceExecutions, performanceUsage } from './performance-usage.ts'

const model = process.env.DSH_ROLEPLAY_EVAL_MODEL ?? 'deepseek-v4-flash'
const reasoningEffort = process.env.DSH_ROLEPLAY_EVAL_REASONING_EFFORT ?? 'low'
const timeoutMs = Number(process.env.DSH_ROLEPLAY_EVAL_TIMEOUT_MS ?? 240000)
if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Evaluation timeout must be a positive integer')
const procedure = '先按灰键三次，再将红轮逆时针转半圈，最后提起左侧铜扣。'
const brief = '我见过东侧匣锁的开法，具体顺序保存在那次经历里。'
const privateClue = 'PRIVATE-OTHER-ONLY: 西侧库门另有一把银钥匙，只有店主独自看见。'
const document = parseStorybookDocument({ schemaVersion: 6, id: 'precise-recall', title: '按需回忆验证',
  directorPrompt: '只提供可感知的环境。', directorGuidance: {}, commonKnowledge: [],
  characters: ['learner', 'keeper'].map(actorId => ({ actorId, displayName: actorId === 'learner' ? '学徒' : '店主',
    appearance: actorId === 'learner' ? '穿围裙的学徒' : '年长的店主', publicPersona: '认真，先弄清再动手。',
    rolePrompt: '你负责开启东侧匣锁，按自己知道的开法操作，不编造陌生机关的规则。',
    capabilities: ['speak', 'act', 'reflect', 'memory'], actingGuidance: {}, initialKnowledge: [] })),
})

for (const mode of ['mock', 'live'] as const) {
  it.skipIf(mode === 'live' && !process.env.DEEPSEEK_API_KEY?.trim())(`${mode}: reads a private episode before attempting the remembered procedure`,
    { timeout: timeoutMs + 60000, retry: 0 }, async () => {
      const root = await mkdtemp(join(tmpdir(), 'dsh-live-recall-'))
      const output = fileURLToPath(new URL(`../../../../.artifacts/independent-recall/${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url))
      await mkdir(output, { recursive: true })
      vi.stubEnv('DSH_SNAPSHOT', mode === 'mock' ? 'replay' : 'record')
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
              queryPageLimit: 100, notificationIntervalMs: 100,
              recallCharacterLimit: 24000,
              characterLimits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
                maxActiveGoals: 32, maxScheduledIntentions: 32 },
              directorCommandLimit: 24, discussionTurnLimit: 24, maxContextUpdateUnits: 16 } },
          ],
        })
        const { ctx } = scaffold
        const draft = ctx.roleplayBooks.saveDraft({ id: 'precise-recall' as BookId, expectedRevision: 0,
          title: '按需回忆验证', resources: [], document: JSON.parse(JSON.stringify(document)) as Document })
        const version = ctx.roleplayBooks.publish(draft.id, draft.revision)
        const id = ctx.roleplayInstances.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId }).instance.id
        const scope = (): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
          expectedRevision: ctx.roleplayHistory.snapshot(id).instance.revision, principal: { kind: 'player' } })
        const observe = (actorId: string, content: string) => ctx.roleplayWorld.observe(scope(), {
          summary: '匣锁见闻', content, deliveries: [{ actorId, content, kind: 'observation', sourceRefs: [] }], state: [],
        })
        ctx.roleplayPeople.stage(scope(), { id: 'workshop', location: '作坊', present: ['learner'], appearances: [] })
        observe('learner', `昨日，石匠只向你演示过东侧匣锁的开法：${procedure}`)
        observe('keeper', privateClue)
        const source = evidenceFor(ctx.roleplayHistory.snapshot(id), 'learner').at(-1)!.id
        ctx.roleplayRetention.review(scope(), { owner: 'actor:learner', operation: 'policy', activation: 'automatic' })
        const seed = new MockAdapter([toolCallResponse('seed-private-memory', 'npc_commit_turn', { posture: 'watching',
          context_update: [{ sourceIds: [source], disposition: 'represented', reason: 'Controlled recall fixture, not model-generated memory.',
            changes: [{ operation: 'add', kind: 'clue', text: brief, sourceIds: [source], episode: {
              topic: '东侧匣锁', experience: `我亲眼看过石匠演示：${procedure}`,
              interpretation: '我记得这只匣锁的开法，但不把它当作所有锁的规则。', impact: '轮到我操作时可以按所学尝试。', unresolved: [],
            } }] }] })])
        ctx.llm.registerAdapter(['recall-fixture'], seed)
        await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
          selection: { provider: 'recall-fixture', model: 'mock' } })
        await ctx.roleplayRuntime.run(scope(), 'learner')
        const retained = ctx.roleplayRetentionViews.review(id, 'actor:learner')
        const note = retained.retention.notes[0]!
        const noteRef = `retention:${note.id}:r${note.revision}`
        expect(ctx.roleplayRetentionViews.recall(id, 'actor:learner', { query: noteRef, offset: 0, limit: 1 }).entries[0]?.text).toContain(procedure)
        expect(ctx.roleplayRetentionViews.recall(id, 'actor:keeper', { query: noteRef, offset: 0, limit: 1 }).entries).toEqual([])
        observe('learner', '次日，你独自在东侧匣锁前。灰键、红轮和左侧铜扣都完好，匣盖合着。')
        const liveRevision = ctx.roleplayHistory.snapshot(id).instance.revision
        const context = ctx.roleplayViews.actorContext({ instanceId: id, actorId: 'learner', query: '' })
        expect(context.text).toContain(brief)
        expect(context.text).not.toContain(procedure)
        expect(context.text).not.toContain(privateClue)
        if (mode === 'mock') ctx.llm.registerAdapter(['recall-reader'], new MockAdapter([
          toolCallResponse('read-detail', 'narrative_recall', { query: noteRef, offset: 0, limit: 1 }),
          toolCallResponse('use-detail', 'npc_commit_turn', { posture: 'finished', behavior: [
            { kind: 'action', attempt: procedure, visibility: 'public', await_result: true },
          ] }),
        ]))
        await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
          selection: mode === 'mock' ? { provider: 'recall-reader', model: 'mock' }
            : { provider: 'deepseek-official', model, reasoningEffort } })
        const started = performance.now()
        let timedOut = false; let failure: unknown
        const timer = setTimeout(() => {
          timedOut = true
          void ctx.roleplayRuntime.abort(id, Number.MAX_SAFE_INTEGER, 'Evaluation deadline').catch(() => {})
        }, timeoutMs)
        try { await ctx.roleplayRuntime.run(scope(), 'learner') }
        catch (error) { failure = error } finally { clearTimeout(timer) }
        const snapshot = ctx.roleplayHistory.snapshot(id)
        const sessions = ctx.agents.list().map((agent) => {
          const events = agent.session.events
          const start = events.findIndex(event => event.type === 'roleplay/execution-request'
            && event.data.context.instanceId === id && event.data.context.revision >= liveRevision)
          const current = start < 0 ? [] : events.slice(start)
          const response = current.find(event => event.type === 'assistant/chunk')
          const modelRequest = response === undefined ? null : materializeRequestHeaderAt(events, response.seq).header
          return { id: agent.session.id, events: current, modelRequest }
        }).filter(session => session.events.length > 0)
        const events = sessions.flatMap(session => session.events)
        const request = events.find(event => event.type === 'roleplay/execution-request')
        const reads = events.filter(event => event.type === 'tool/call').filter(event => event.data.name === 'narrative_recall')
        const readIds = new Set(reads.map(event => event.data.callId))
        const results = events.filter(event => event.type === 'tool/result').flatMap(event => event.data.message.content)
          .filter(block => block.type === 'tool-result' && readIds.has(block.toolCallId) && !block.isError)
        const firstResult = events.findIndex(event => event.type === 'tool/result' && event.data.message.content.some(block =>
          block.type === 'tool-result' && readIds.has(block.toolCallId) && !block.isError))
        const commit = events.findIndex(event => event.type === 'tool/call' && event.data.name === 'npc_commit_turn')
        const errors = await savePerformanceArtifacts(output, { mode, model: mode === 'mock' ? 'mock' : model, reasoningEffort, liveRevision,
          elapsedMs: performance.now() - started, timedOut, failure: failure instanceof Error ? failure.message : failure ?? null,
          seed: { kind: 'mock-adapter', procedure, brief, source, noteRef, memory: retained },
          context, modelRequests: sessions.map(session => session.modelRequest),
          reads, results, firstResult, commit, document: version.document,
          usageByPurpose: performanceUsage(sessions), executionUsage: performanceExecutions(sessions),
          play: ctx.roleplayPlay.read({ instanceId: id, audience: { kind: 'observer' },
            revision: snapshot.instance.revision, offset: 0, limit: 100 }),
          humanReview: { status: 'unreviewed', exactProcedure: null, groundedAction: null },
        }, { archive: () => ctx.roleplayTransfer.export(id, snapshot.instance.revision),
          usage: () => ctx.roleplayExecutionHistory.usage(id) })
        expect(errors, output).toEqual([])
        expect(timedOut, output).toBe(false)
        if (failure !== undefined) throw failure
        expect(request?.data.context.text).toContain(brief)
        expect(request?.data.context.text).not.toContain(procedure)
        expect(request?.data.context.text).not.toContain(privateClue)
        expect(sessions).toHaveLength(1)
        expect(JSON.stringify(sessions[0]!.modelRequest)).toContain(brief)
        expect(JSON.stringify(sessions[0]!.modelRequest)).not.toContain(procedure)
        expect(JSON.stringify(sessions[0]!.modelRequest)).not.toContain(privateClue)
        expect(reads.length, 'The detail must be read through the native tool').toBeGreaterThan(0)
        expect(JSON.stringify(results), 'A successful read must supply the remembered detail').toContain(procedure)
        expect(firstResult).toBeGreaterThanOrEqual(0)
        expect(commit, 'The read result must precede the dependent commitment').toBeGreaterThan(firstResult)
      } finally {
        await scaffold?.close(); vi.unstubAllEnvs()
        await rm(root, { recursive: true, force: true })
      }
    })
}
