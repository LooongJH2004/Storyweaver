/** Real-model invitation followed by an explicit player decision in an isolated instance. */
import type {} from '../src/index.ts'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, vi } from 'vitest'
import type { BookId, CommandId, CommandScope, Document } from '@deepseek-ai/dsh-roleplay-core'
import { parseStorybookDocument } from '@deepseek-ai/dsh-roleplay-core/storybook'
import { discussionsOf } from '@deepseek-ai/dsh-roleplay-core/world'
import { launchWebScaffold } from '../../../../apps/web/tests/scaffold.ts'
import { savePerformanceArtifacts } from './performance-artifacts.ts'
import { performanceUsage } from './performance-usage.ts'

const model = process.env.DSH_ROLEPLAY_EVAL_MODEL ?? 'deepseek-v4-flash'
const reasoningEffort = process.env.DSH_ROLEPLAY_EVAL_REASONING_EFFORT ?? 'low'
const document = parseStorybookDocument({ schemaVersion: 6, id: 'invitation-probe', title: '角色主动邀请',
  directorPrompt: '让人物自己商议，不代替人物发言。', directorGuidance: {}, commonKnowledge: [],
  characters: [
    { id: 'guide', appearance: '背着绳索的向导', goal: '你打算召集眼前两名同伴共同商议木箱过桥的分工，听完双方意见再行动，不替他们作决定。' },
    { id: 'porter', appearance: '戴草帽的搬运工', goal: '保护木箱，愿意和同伴商议分工。' },
    { id: 'scout', appearance: '穿灰衣的探路人', goal: '观察桥面，愿意和同伴商议分工。' },
  ].map(actor => ({ actorId: actor.id, displayName: actor.appearance, appearance: actor.appearance,
    publicPersona: '做事务实，愿意听同伴的意见。', rolePrompt: actor.goal,
    capabilities: ['speak', 'act'], actingGuidance: {}, initialKnowledge: [] })),
})

it.skipIf(!process.env.DEEPSEEK_API_KEY?.trim())('A real actor proposes a discussion without starting it',
  { timeout: 150000, retry: 0 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-live-invitation-'))
    const output = fileURLToPath(new URL(`../../../../.artifacts/independent-invitation/${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url))
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
            provider: 'deepseek-official', model, consolidationThreshold: 0, directorConsolidationThreshold: 0,
            queryPageLimit: 100, notificationIntervalMs: 100,
            recallCharacterLimit: 24000,
            characterLimits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
              maxActiveGoals: 32, maxScheduledIntentions: 32 },
            directorCommandLimit: 24, discussionTurnLimit: 24, maxContextUpdateUnits: 16 } },
        ],
      })
      const { ctx } = scaffold
      const draft = ctx.roleplayBooks.saveDraft({ id: 'invitation-probe' as BookId, expectedRevision: 0,
        title: '角色主动邀请', resources: [], document: JSON.parse(JSON.stringify(document)) as Document })
      const version = ctx.roleplayBooks.publish(draft.id, draft.revision)
      const id = ctx.roleplayInstances.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId }).instance.id
      const scope = (): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
        expectedRevision: ctx.roleplayHistory.snapshot(id).instance.revision, principal: { kind: 'player' } })
      ctx.roleplayPeople.stage(scope(), { id: 'bridge', location: '桥头', present: ['guide', 'porter', 'scout'], appearances: [] })
      const content = '你和戴草帽的搬运工、穿灰衣的探路人站在木桥前。一个沉重木箱放在脚边，绳索在你肩上。桥上没有人，两名同伴都在等你安排。你们还没有开始搬箱。'
      ctx.roleplayWorld.observe(scope(), { summary: '桥头', content, state: [],
        shared: { actorIds: ['guide', 'porter', 'scout'], kind: 'observation', content, sourceRefs: [] }, deliveries: [] })
      await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
        selection: { provider: 'deepseek-official', model, reasoningEffort } })
      let failure: unknown; let timedOut = false
      const started = performance.now()
      const timer = setTimeout(() => {
        timedOut = true
        void ctx.roleplayRuntime.abort(id, Number.MAX_SAFE_INTEGER, 'Evaluation deadline').catch(() => {
          // Record the deadline even if abort races completion; cleanup closes the execution.
        })
      }, 120000)
      try { await ctx.roleplayRuntime.run(scope(), 'guide') }
      catch (error) { failure = error } finally { clearTimeout(timer) }
      const before = ctx.roleplayPlay.read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 100 })
      const pendingState = discussionsOf(ctx.roleplayHistory.snapshot(id))
      const invitation = before.discussionRequests?.find(request => request.status === 'pending')
      if (invitation !== undefined) ctx.roleplayDiscussions.control(scope(), { operation: 'request', requestId: invitation.id,
        expectedRequestRevision: invitation.revision, decision: 'accept', reason: 'Explicit player acceptance in the evaluation.' })
      const snapshot = ctx.roleplayHistory.snapshot(id)
      const sessions = ctx.agents.list().map(agent => ({ id: agent.session.id, events: agent.session.events }))
        .filter(session => session.events.some(event => event.type === 'roleplay/execution-request' && event.data.context.instanceId === id))
      const errors = await savePerformanceArtifacts(output, { model, reasoningEffort, document: version.document,
        elapsedMs: performance.now() - started, timedOut, failure: failure instanceof Error ? failure.message : failure ?? null,
        beforeAcceptance: before, pendingState, afterAcceptance: discussionsOf(snapshot), usageByPurpose: performanceUsage(sessions),
        humanReview: { status: 'unreviewed', boundedInvitation: null },
      }, { archive: () => ctx.roleplayTransfer.export(id, snapshot.instance.revision),
        usage: () => ctx.roleplayExecutionHistory.usage(id) })
      expect(errors, output).toEqual([])
      expect(timedOut, output).toBe(false)
      if (failure !== undefined) throw failure
      expect(invitation, output).toBeDefined()
      expect(pendingState.discussions).toEqual([])
      expect(pendingState.requests).toHaveLength(1)
      expect(pendingState.requests?.[0]?.participantIds.toSorted()).toEqual(['guide', 'porter', 'scout'])
      expect(discussionsOf(snapshot).discussions).toHaveLength(1)
      expect(discussionsOf(snapshot).requests?.[0]?.status).toBe('accepted')
      expect(discussionsOf(snapshot).discussions[0]?.participantIds.toSorted()).toEqual(['guide', 'porter', 'scout'])
    } finally { await scaffold?.close(); await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs() }
  })
