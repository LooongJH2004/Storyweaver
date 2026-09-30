/** Real-model discussion comparisons preserve artifacts for human review; skipped cases are not quality evidence. */
import type {} from '../src/index.ts'
import { performanceUsage, performanceExecutions } from './performance-usage.ts'
import { savePerformanceArtifacts } from './performance-artifacts.ts'
import { performanceRows } from './performance-play.ts'
import { performanceDiscussions } from './performance-discussions.ts'
import { planGrowthResume } from './growth-resume.ts'
import { growthPerceptions } from './growth-perception.ts'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { parseStorybookDocument } from '@deepseek-ai/dsh-roleplay-core/storybook'
import { discussionsOf } from '@deepseek-ai/dsh-roleplay-core/world'
import type { BookId, CommandId, CommandScope, Document, Json } from '@deepseek-ai/dsh-roleplay-core'
import { launchWebScaffold } from '../../../../apps/web/tests/scaffold.ts'

interface PerformanceScenario {
  id: string
  topic: string
  observation: string
  next: string
  actors: { id: string; name: string; persona: string; goal: string; commonKnowledge?: string[] }[]
  later?: { id: string; instruction: string }[]
}

const scenarios: PerformanceScenario[] = [
  { id: 'A1-artifact', topic: '遗迹正在坍塌，该如何处置祭坛上的神器？',
    observation: '石屑从拱顶落下。祭坛上的神器仍在原处，通向外面的门尚未关闭。',
    next: '远处又传来一次落石声。根据刚才的讨论给出环境反馈，让相关人物自行选择下一步；不要替角色达成共识。',
    actors: [
      { id: 'breaker', name: '砚', persona: '急切，认为神器会带来灾难。', goal: '设法摧毁神器，但不要替别人决定或假定已经成功。' },
      { id: 'keeper', name: '岚', persona: '谨慎，重视保存历史。', goal: '保护神器，认真回应摧毁它的理由。' },
      { id: 'scout', name: '禾', persona: '话少，重视同伴生命。', goal: '找到撤离办法，让同伴离开遗迹。' },
    ] },
  { id: 'A2-promise', topic: '客人想将钥匙交给店主保管，双方需要说清哪些条件？',
    observation: '夜里的旅店很安静。客人手中有一把钥匙，店主站在柜台后。',
    next: '把场景推进到次日清晨。客人准备出门。只提供清晨可感知的环境变化，随后让双方自行从记忆中决定如何处理钥匙；不要向角色重述、总结或提示昨夜的具体条款，不要在旁白中替角色行动，也不要凭空制造失窃或危机。',
    actors: [
      { id: 'keeper', name: '店主', persona: '可靠但不喜欢模糊的承诺。', goal: '弄清保管要求，再决定如何答应。' },
      { id: 'guest', name: '客人', persona: '疲惫，礼貌，次日要早行。', goal: '妥善保管钥匙，并在清晨取回。' },
    ] },
  { id: 'A5-counterevidence', topic: '墙上的告示说红石遇清水立刻溶化，应该据此把红石放在哪里？',
    observation: '作坊墙上贴着一张旧告示，上面写着「红石遇清水立刻溶化，务必避水」。桌上有一块标着红石的材料、一盆清水和干燥的托盘。两人都能看见告示和材料，尚未亲眼见过这块材料遇水。',
    next: '安排一个可见的意外：桌上这块标着红石的材料滑进清水盆。两人持续观察，过了半个时辰，材料仍完整，盆中水保持清澈。将这些观察投递给双方，让他们自行决定材料如何放置。不要宣布告示真假，不替角色修订信念，不暗示隐藏魔法或更换了材料。',
    actors: [
      { id: 'apprentice', name: '学徒', persona: '做事认真，初来作坊，倾向相信前人留下的告示。',
        goal: '保管好材料，根据自己的经历学习它的性质；没有亲见的说法保留来源。' },
      { id: 'craftsperson', name: '匠人', persona: '重视实际观察，愿意与学徒讨论，也承认自己没用过这块材料。',
        goal: '找到适当的存放办法，区分告示的说法与亲眼观察，不冒充全知。' },
    ] },
  { id: 'A7-first-tide', topic: '码头蓝灯逐渐变暗，三人要不要继续走到低处看船？',
    observation: '三人站在码头上方的石阶旁，低处停着小船。岸边一盏蓝色的灯正在变暗，水面还在最低一级石阶下面。没有人向他们解释灯光的意义。',
    next: '让三人在各自可见的位置经历涨潮：水先淹过最低一级石阶，随后逼近下一阶，小船随水升高，蓝灯完全暗下。投递他们能够观察的变化，让他们自己决定下一步。不要宣布蓝灯的原理，不替他们总结规律，也不要替角色行动。',
    actors: [
      { id: 'newcomer', name: '远客', persona: '刚从地球来到这里，善于联想，却不熟悉当地事物。',
        commonKnowledge: ['在地球，我乘过电动列车，见过用电池供电的灯。'],
        goal: '认识眼前的码头并找船，遇到陌生事物可以询问；把地球经验作为类比而非这个世界的定论。' },
      { id: 'child', name: '小禾', persona: '八岁，第一次到海边，喜欢蹲下来观察水和船。', commonKnowledge: [],
        goal: '想近看小船，依据眼前经历与听到的话学习，不凭空熟悉潮汐和灯的原理。' },
      { id: 'native', name: '渡工', persona: '在这里摆渡多年，说话直白，关心脚下是否稳当。',
        commonKnowledge: ['我在这座码头多次见过蓝灯暗下后水漫上低阶，但不知道灯为什么这样变化。'],
        goal: '照顾同行的人，按自己的本地经验决定路线，必要时解释自己见过什么。' },
    ] },
]
const firstTide = scenarios.find(scenario => scenario.id === 'A7-first-tide')!
const spacedLearning = { ...firstTide, id: 'A7-spaced-tide', later: [
  { id: 'repeat', instruction: '三天后，三人在同一码头再次相遇。蓝灯开始变暗，最低一级台阶还露在水面上，小船轻轻起伏。只投递当前可见变化，让人物自行决定等候、观察或接近水边，不向他们重述上次经历或提示灯与水的关系。' },
  { id: 'counterexample', instruction: '又过一天，三人同在这座码头。水面低且平稳，蓝灯原本明亮。一名无名路人当着三人的面把不透光的罩布罩在灯外，灯的可见亮光消失；接下来一刻钟，水位没有升高。投递可见过程和时间流逝，不替人物解释灯的原理，不替他们否定或修改先前判断。' },
  { id: 'transfer', instruction: '两个月后，三人到达另一座陌生码头。这里没有蓝灯，只有一盏红色的普通悬灯；水正在逐渐漫上低处石阶，小船随水升高。让三人感知眼前情形并自行决定如何接近船只，不赋予他们当地常识、灯的用途或未经历的知识，不替他们总结经验。' },
] }
const decadeLearning: PerformanceScenario = { ...spacedLearning, id: 'A7-decade-growth',
  actors: firstTide.actors.map(actor => actor.id === 'child' ? { ...actor,
    persona: '故事开始时八岁，第一次到海边，喜欢观察水和船。这是成长起点；此后按实际获知的时间和年龄生活，不能凭年龄编造未提供的受教育经历或世界知识。',
  } : actor.id === 'newcomer' ? { ...actor,
    persona: '故事开始时刚从地球来到这里，善于联想。当时不熟悉当地事物；后来依据实际经历学习，不把时间跳跃当作已经学会未提供的知识。',
  } : actor),
  later: spacedLearning.later.map(phase => phase.id === 'transfer' ? { ...phase,
    instruction: '十年后，三人再次同行，到达另一座从未去过的码头。小禾现在十八岁，其余两人也年长了十岁；将时间与年龄变化明确投递给各自角色，但不要补写这十年里的学习、职业、关系或冒险经历。眼前没有蓝灯，只有一盏红色的普通悬灯；水正在漫上低处石阶，小船随水升高。让人物依靠先前实际经历和眼前观察自行决定怎样接近船只，不提示旧灯的规律，不赋予新码头常识，不替他们总结成长。',
  } : phase),
}
const policies = ['eagerness', 'balanced'] as const
const live = Boolean(process.env.DEEPSEEK_API_KEY?.trim())
const timeoutMs = Number(process.env.DSH_ROLEPLAY_EVAL_TIMEOUT_MS ?? 240000)
const model = process.env.DSH_ROLEPLAY_EVAL_MODEL ?? 'deepseek-v4-flash'
const reasoningEffort = process.env.DSH_ROLEPLAY_EVAL_REASONING_EFFORT ?? 'low'
const actorLengthPreference = process.env.DSH_ROLEPLAY_EVAL_ACTOR_LENGTH?.trim() || undefined
const consolidationThreshold = Number(process.env.DSH_ROLEPLAY_EVAL_CONSOLIDATION_THRESHOLD ?? 4)
if (!Number.isSafeInteger(consolidationThreshold) || consolidationThreshold < 1) {
  throw new Error('Evaluation consolidation threshold must be a positive integer')
}
const executionSettings = { consolidationThreshold, consolidationBatchLimit: 2, directorConsolidationThreshold: consolidationThreshold,
  worldFeedbackLimit: 2, directorCommandLimit: 24, discussionTurnLimit: 24, maxContextUpdateUnits: 16 }
if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Evaluation timeout must be a positive integer')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outputRoot = fileURLToPath(new URL(`../../../../.artifacts/independent-discussion/${stamp}/`, import.meta.url))
const resumePath = process.env.DSH_ROLEPLAY_EVAL_RESUME_REPORT
const resume = resumePath === undefined ? undefined : planGrowthResume(JSON.parse(await readFile(resumePath, 'utf8')))
const memoryActivation = process.env.DSH_ROLEPLAY_EVAL_MEMORY_POLICY ?? resume?.report.memoryActivation ?? 'automatic'
if (memoryActivation !== 'automatic' && memoryActivation !== 'review') throw new Error('Evaluation memory policy must be automatic or review')
const resumeArchive = resumePath === undefined ? undefined
  : JSON.parse(await readFile(join(dirname(resumePath), 'archive.json'), 'utf8')) as Json

// Parse every authored variant even when credentials are absent.
const cases = [...scenarios, spacedLearning, decadeLearning].flatMap(scenario => policies.map(floorPolicy => ({ scenario, floorPolicy,
  document: parseStorybookDocument({ schemaVersion: 6, id: scenario.id, title: scenario.id,
    directorPrompt: '忠于角色已经做出的选择。把行动尝试与结果分开，提供可感知的结果；不替人物发言。',
    directorGuidance: {}, discussionSettings: { maxRounds: 2, floorPolicy },
    commonKnowledge: ['人物只能根据自己见闻和已有知识作判断。'],
    characters: scenario.actors.map(actor => ({ actorId: actor.id, displayName: actor.name, appearance: actor.name,
      publicPersona: actor.persona, rolePrompt: actor.goal, capabilities: ['speak', 'act', 'reflect', 'memory', 'goals', 'schedule'],
      ...('commonKnowledge' in actor ? { commonKnowledge: actor.commonKnowledge } : {}),
      actingGuidance: actorLengthPreference === undefined ? {} : { lengthPreference: actorLengthPreference },
      initialKnowledge: scenario.actors.filter(other => other.id !== actor.id)
        .map(other => ({ text: `认识${other.name}。`, kind: 'identity', attitude: 'believed', targetActorId: other.id, label: other.name })) })),
  }),
})))
if (resume !== undefined && !cases.some(item =>
  item.scenario.id === resume.report.scenario && item.floorPolicy === resume.report.floorPolicy)) {
  throw new Error('The resume report has no matching authored scenario and policy')
}

describe('Independent discussion live comparison', { concurrent: false }, () => {
  for (const { scenario, floorPolicy, document } of cases) it.skipIf(!live
    || resume !== undefined && (resume.report.scenario !== scenario.id || resume.report.floorPolicy !== floorPolicy))(`${scenario.id} [${floorPolicy}]`,
    { timeout: timeoutMs + 60000, retry: 0 }, async () => {
      const root = await mkdtemp(join(tmpdir(), 'dsh-live-discussion-'))
      const output = join(outputRoot, scenario.id, floorPolicy)
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
              provider: 'deepseek-official', model, ...executionSettings,
              queryPageLimit: 100, notificationIntervalMs: 100,
              recallCharacterLimit: 24000,
              characterLimits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
                maxActiveGoals: 32, maxScheduledIntentions: 32 },
            } },
          ],
        })
        const { ctx } = scaffold
        await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
          selection: { provider: 'deepseek-official', model, reasoningEffort } })
        const draft = ctx.roleplayBooks.saveDraft({ id: scenario.id as BookId, expectedRevision: 0, title: scenario.id,
          resources: [], document: JSON.parse(JSON.stringify(document)) as Document })
        const version = ctx.roleplayBooks.publish(draft.id, draft.revision)
        if (resume !== undefined) {
          expect(resume.report.bookHash).toBe(createHash('sha256').update(JSON.stringify(version.document)).digest('hex'))
          expect(resume.report.model).toBe(model)
          expect(resume.report.reasoningEffort).toBe(reasoningEffort)
          expect(resume.report.executionSettings).toEqual(executionSettings)
          expect(resume.report.growthPlan).toEqual(scenario.later)
        }
        const id = resumeArchive === undefined
          ? ctx.roleplayInstances.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId }).instance.id
          : ctx.roleplayTransfer.import(resumeArchive, randomUUID() as CommandId).id
        const scope = (): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
          expectedRevision: ctx.roleplayHistory.snapshot(id).instance.revision, principal: { kind: 'player' } })
        const actorIds = scenario.actors.map(actor => actor.id)
        if (resume === undefined) {
          ctx.roleplayPeople.stage(scope(), { id: scenario.id, location: scenario.id, present: actorIds, appearances: [] })
          ctx.roleplayWorld.observe(scope(), { summary: scenario.topic, content: scenario.observation, narration: scenario.observation,
            shared: { actorIds, content: scenario.observation, kind: 'observation', sourceRefs: [] }, deliveries: [], state: [] })
          for (const owner of [...actorIds.map(actorId => `actor:${actorId}`), 'director']) ctx.roleplayRetention.review(scope(),
            { owner, operation: 'policy', activation: memoryActivation })
          ctx.roleplayDiscussions.start(scope(), { topic: scenario.topic, participantIds: actorIds, maxRounds: 2 })
        } else {
          const restored = await ctx.roleplayRecovery.restore(scope(), resume.revision, 'Resume isolated learning evaluation at its saved boundary')
          expect(restored.execution).toBe('cancelled')
          const prior = ctx.roleplayHistory.replay(id, resume.revision)
          expect(ctx.roleplayHistory.snapshot(id).entities.filter(item => item.key.collection === 'retention'))
            .toEqual(prior.entities.filter(item => item.key.collection === 'retention'))
        }
        const started = performance.now()
        let failure: unknown
        let timedOut = false
        let followupRevision: number | undefined = resume === undefined ? undefined : ctx.roleplayHistory.snapshot(id).instance.revision
        const memoryView = () => [...actorIds.map(actorId => `actor:${actorId}`), 'director']
          .map(owner => ctx.roleplayRetentionViews.review(id, owner))
        for (const view of memoryView()) expect(view.retention.activation ?? 'review').toBe(memoryActivation)
        let initialMemories: ReturnType<typeof memoryView> | null = null
        const growthPlan = scenario.later ?? []
        const growthPhases: Record<string, unknown>[] = [...resume?.completed ?? []]
        const playView = () => ctx.roleplayPlay.read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 100 })
        const timer = setTimeout(() => {
          timedOut = true
          void ctx.roleplayDirector.abort(id, Number.MAX_SAFE_INTEGER, 'Evaluation deadline').catch(() => { /* Failure is captured by the awaited run. */ })
        }, timeoutMs)
        try {
          if (resume === undefined) {
            const discussion = await ctx.roleplayDiscussionRuntime.advance(scope())
            expect(discussion.status).toBe('awaiting-director')
            // Awaiting-director can mean an action needs settlement, not that the exchange is finished.
            for (let feedback = 0; playView().discussion !== undefined && feedback < 6; feedback++) {
              await ctx.roleplayDirector.summarizeDiscussion(scope())
            }
            expect(playView().discussion, 'Initial discussion must finish before the later scene').toBeUndefined()
            followupRevision = ctx.roleplayHistory.snapshot(id).instance.revision
            initialMemories = structuredClone(memoryView())
            await ctx.roleplayDirector.run(scope(), scenario.next)
          } else {
            initialMemories = structuredClone(memoryView())
          }
          for (const phase of resume === undefined ? growthPlan : [resume.phase]) {
            const startRevision = ctx.roleplayHistory.snapshot(id).instance.revision
            const before = structuredClone(memoryView())
            let completed = false
            try {
              await ctx.roleplayDirector.run(scope(), phase.instruction)
              completed = true
            } finally {
              const endRevision = ctx.roleplayHistory.snapshot(id).instance.revision
              const perceptions = actorIds.map((actorId) => {
                const request = ctx.agents.list().flatMap(agent => agent.session.events)
                  .filter(event => event.type === 'roleplay/execution-request').map(event => event.data.context)
                  .filter(context => context.instanceId === id && 'actorId' in context && context.actorId === actorId
                    && context.revision > startRevision && context.revision <= endRevision
                    && !context.sections.some(section => section.id === 'consolidation'))
                  .sort((left, right) => left.revision - right.revision)[0]
                const received = growthPerceptions(request, startRevision)
                return { actorId, requestRevision: request?.revision ?? null, evidence: received }
              })
              growthPhases.push({ ...phase, startRevision, endRevision, completed, before,
                perceptionEvidenceBasis: 'recorded-execution-context',
                after: structuredClone(memoryView()), perceptions })
              if (completed) for (const actor of perceptions) {
                expect(actor.requestRevision, `${phase.id}: ${actor.actorId} needs a response request`).not.toBeNull()
                expect(actor.evidence.length, `${phase.id}: ${actor.actorId} needs fresh perception`).toBeGreaterThan(0)
              }
            }
          }
        } catch (error) { failure = error } finally { clearTimeout(timer) }
        const snapshot = ctx.roleplayHistory.snapshot(id)
        const readPage = (offset: number) => ctx.roleplayPlay.read({ instanceId: id, audience: { kind: 'observer' },
          revision: snapshot.instance.revision, offset, limit: 100 })
        const firstPage = readPage(0)
        let play = firstPage
        let playPaginationError: string | null = null
        try { play = { ...firstPage, rows: performanceRows(offset => offset === 0 ? firstPage : readPage(offset)) } }
        catch (error) {
          failure ??= error
          playPaginationError = error instanceof Error ? error.message : String(error)
        }
        const followupPerceptions = actorIds.map((actorId) => {
          const requests = ctx.agents.list().flatMap(agent => agent.session.events)
            .filter(event => event.type === 'roleplay/execution-request')
            .map(event => event.data.context)
            .filter(context => context.instanceId === id && 'actorId' in context && context.actorId === actorId
              && followupRevision !== undefined && context.revision > followupRevision
              && !context.sections.some(section => section.id === 'consolidation'))
            .sort((left, right) => left.revision - right.revision)
          const requestRevision = requests[0]?.revision
          return { actorId, requestRevision: requestRevision ?? null,
            evidence: followupRevision === undefined ? [] : growthPerceptions(requests[0], followupRevision) }
        })
        const sessions = ctx.agents.list().filter(agent => agent.session.events.some(event =>
          event.type === 'roleplay/execution-request' && event.data.context.instanceId === id))
          .map(agent => ({ id: agent.session.id, events: agent.session.events }))
        const collectionErrors = await savePerformanceArtifacts(output, { scenario: scenario.id, floorPolicy, model, reasoningEffort,
          executionSettings, actorLengthPreference: actorLengthPreference ?? null, memoryActivation,
          resume: resume === undefined ? null : { parentReport: resumePath, parentRevision: resume.revision,
            phase: resume.phase.id, restoredRevision: followupRevision },
          allGrowthPhasesComplete: growthPlan.length === 0 ? null : !timedOut && failure === undefined
            && growthPlan.every(phase => growthPhases.some(item => item.id === phase.id && item.completed === true)),
          followupPerceptionEvidenceBasis: 'recorded-execution-context', followupPerceptions, growthPlan, growthPhases,
          followupInstruction: resume?.phase.instruction ?? scenario.next,
          elapsedMs: performance.now() - started, timedOut, followupRevision: followupRevision ?? null,
          failure: failure === undefined ? null : failure instanceof Error ? failure.message : JSON.stringify(failure),
          bookHash: createHash('sha256').update(JSON.stringify(version.document)).digest('hex'), document: version.document,
          usageByPurpose: performanceUsage(sessions), executionUsage: performanceExecutions(sessions),
          play, playPaginationError, discussions: performanceDiscussions(discussionsOf(snapshot).discussions),
          initialMemories, memories: memoryView(),
          humanReview: { status: 'unreviewed', responsiveness: null, repetition: null, characterVoice: null,
            laterChoicesAffected: null, unsupportedKnowledge: null, forcedConsensus: null, evidence: [] },
        }, { archive: () => ctx.roleplayTransfer.export(id, snapshot.instance.revision),
          usage: () => ctx.roleplayExecutionHistory.usage(id) })
        expect(timedOut, output).toBe(false)
        if (failure !== undefined) throw failure
        expect(collectionErrors, output).toEqual([])
        // No player approves notes in this fixture. A review-mode run must not silently test automatic replacement.
        if (memoryActivation === 'review') for (const view of [...initialMemories ?? [], ...memoryView()]) {
          expect(view.retention.activation ?? 'review', `${view.owner}: saved review policy`).toBe('review')
          expect(view.retention.notes, `${view.owner}: unapproved summaries cannot become retained notes`).toEqual([])
          expect(view.retention.proposals.every(proposal => proposal.status === 'proposed'),
            `${view.owner}: no player review occurred in this scenario`).toBe(true)
        }
        if (actorLengthPreference !== undefined) for (const actorId of actorIds) {
          const request = sessions.flatMap(session => session.events)
            .filter(event => event.type === 'roleplay/execution-request').map(event => event.data.context)
            .find(context => 'actorId' in context && context.actorId === actorId
              && !context.sections.some(section => section.id === 'consolidation'))
          expect(request?.text, `${actorId} must receive the authored length preference`).toContain(actorLengthPreference)
        }
        expect(play.rows.some(row => row.kind === 'speech'), output).toBe(true)
        expect(play.rows.some(row => row.revision > followupRevision!
          && (row.kind === 'speech' || row.kind === 'action')), 'Later scene must contain an actor response').toBe(true)
        if (scenario.id !== 'A1-artifact') for (const actor of followupPerceptions) {
          expect(actor.evidence.length, `${actor.actorId} needs fresh world perception before the follow-up response`).toBeGreaterThan(0)
        }
        if (scenario.id.startsWith('A7-')) for (const actor of scenario.actors) {
          const first = ctx.agents.list().flatMap(agent => agent.session.events)
            .filter(event => event.type === 'roleplay/execution-request')
            .map(event => event.data.context)
            .filter(context => context.instanceId === id && 'actorId' in context && context.actorId === actor.id)
            .sort((left, right) => left.revision - right.revision)[0]
          expect(first, `${actor.id} needs an initial request`).toBeDefined()
          for (const other of scenario.actors) if ('commonKnowledge' in other) {
            for (const knowledge of other.commonKnowledge ?? []) {
              if (other.id === actor.id) expect(first!.text).toContain(knowledge)
              else expect(first!.text).not.toContain(knowledge)
            }
          }
        }
      } finally {
        await scaffold?.close(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true })
      }
    })
})
