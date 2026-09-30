/** Native contrast: retained terms must be interpreted against an observed outcome, not note status alone. */
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
import { performanceUsage } from './performance-usage.ts'

const model = process.env.DSH_ROLEPLAY_EVAL_MODEL ?? 'deepseek-v4-flash'
const reasoningEffort = process.env.DSH_ROLEPLAY_EVAL_REASONING_EFFORT ?? 'low'
const brief = '我答应替客人保管钥匙，只交还本人；若三天后他仍未取回，我就封匣、贴日期继续保存。'
const document = parseStorybookDocument({ schemaVersion: 6, id: 'conditional-memory', title: '条件性记忆对照',
  directorPrompt: '提供本人可见情况，不替人物决定。', directorGuidance: {}, commonKnowledge: [],
  characters: [{ actorId: 'keeper', displayName: '店主', appearance: '围着旧围裙的店主',
    publicPersona: '可靠，处理完一件事就继续日常生意。', rolePrompt: '按已知情况处理寄存，自己决定此刻要做什么。',
    capabilities: ['speak', 'act', 'memory'], actingGuidance: {}, initialKnowledge: [] }],
})

for (const returned of [false, true]) it.skipIf(!process.env.DEEPSEEK_API_KEY?.trim())(
  `Conditional custody memory with returned=${returned}`, { timeout: 150000, retry: 0 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-conditional-memory-'))
    const output = fileURLToPath(new URL(`../../../../.artifacts/conditional-memory/${new Date().toISOString().replace(/[:.]/g, '-')}/${returned ? 'returned' : 'unreturned'}/`, import.meta.url))
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
      const draft = ctx.roleplayBooks.saveDraft({ id: 'conditional-memory' as BookId, expectedRevision: 0,
        title: '条件性记忆对照', resources: [], document: JSON.parse(JSON.stringify(document)) as Document })
      const version = ctx.roleplayBooks.publish(draft.id, draft.revision)
      const id = ctx.roleplayInstances.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId }).instance.id
      const scope = (): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
        expectedRevision: ctx.roleplayHistory.snapshot(id).instance.revision, principal: { kind: 'player' } })
      ctx.roleplayPeople.stage(scope(), { id: 'inn', location: '旅店柜台', present: ['keeper'], appearances: [] })
      const observe = (content: string) => ctx.roleplayWorld.observe(scope(), { summary: '寄存见闻', content,
        deliveries: [{ actorId: 'keeper', content, kind: 'observation', sourceRefs: [] }], state: [] })
      observe('三天前，你与客人说定：钥匙由你保管，只还本人；若三天后仍未取回，就封匣贴日期继续保存。你已把钥匙收入木匣。')
      const source = evidenceFor(ctx.roleplayHistory.snapshot(id), 'keeper').at(-1)!.id
      ctx.roleplayRetention.review(scope(), { owner: 'actor:keeper', operation: 'policy', activation: 'automatic' })
      ctx.llm.registerAdapter(['conditional-seed'], new MockAdapter([toolCallResponse('seed', 'npc_commit_turn', {
        posture: 'watching', context_update: [{ sourceIds: [source], disposition: 'represented', reason: 'Controlled prior memory.',
          changes: [{ operation: 'add', kind: 'promise', text: brief, sourceIds: [source] }] }],
      })]))
      await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
        selection: { provider: 'conditional-seed', model: 'mock' } })
      await ctx.roleplayRuntime.run(scope(), 'keeper')
      observe(returned
        ? '第二天，你亲手把钥匙交给客人本人；他收进衣袋，向你道谢后离开。今天是第三天傍晚，那只木匣敞着，里面是空的，柜台上有纸、浆糊和笔。'
        : '这三天没有人来取钥匙，你也没有把钥匙交给任何人。今天是第三天傍晚，钥匙仍在那只木匣里，柜台上有纸、浆糊和笔。')
      const initialRevision = ctx.roleplayHistory.snapshot(id).instance.revision
      const context = ctx.roleplayViews.actorContext({ instanceId: id, actorId: 'keeper', query: '' })
      expect(context.text).toContain(brief)
      expect(context.text).toContain('Active means retained, not proof that every described condition or obligation still applies.')
      await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
        selection: { provider: 'deepseek-official', model, reasoningEffort } })
      let failure: unknown; let timedOut = false
      const started = performance.now()
      const timer = setTimeout(() => {
        timedOut = true
        void ctx.roleplayRuntime.abort(id, Number.MAX_SAFE_INTEGER, 'Evaluation deadline').catch(() => {
          // The deadline is recorded even if abort races completion; scaffold cleanup still closes the execution.
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
      const errors = await savePerformanceArtifacts(output, { returned, model, reasoningEffort, initialRevision, context,
        seed: { kind: 'mock-adapter', brief }, elapsedMs: performance.now() - started, timedOut,
        failure: failure instanceof Error ? failure.message : failure ?? null, usageByPurpose: performanceUsage(sessions),
        memories: ctx.roleplayRetentionViews.review(id, 'actor:keeper'),
        play: ctx.roleplayPlay.read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 100 }),
        humanReview: { status: 'unreviewed', conditionalChoice: null, unsupportedCompletion: null },
      }, { archive: () => ctx.roleplayTransfer.export(id, snapshot.instance.revision),
        usage: () => ctx.roleplayExecutionHistory.usage(id) })
      expect(errors, output).toEqual([])
      expect(timedOut, output).toBe(false)
      if (failure !== undefined) throw failure
      expect(sessions.flatMap(session => session.events).some(event => event.type === 'roleplay/execution-request'
        && event.data.context.text.includes(brief))).toBe(true)
    } finally { await scaffold?.close(); await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs() }
  })
