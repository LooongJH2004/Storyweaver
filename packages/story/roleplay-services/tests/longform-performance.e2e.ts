/** Explicit real-model probe using the authored multi-character long-form storybook. */
import type {} from '../src/index.ts'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, vi } from 'vitest'
import type { BookId, CommandId, CommandScope, Document } from '@deepseek-ai/dsh-roleplay-core'
import { parseStorybookDocument } from '@deepseek-ai/dsh-roleplay-core/storybook'
import { initialContextRecipe } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import { pendingWorldAttempts } from '../../roleplay-core/src/world-attempts.ts'
import { launchWebScaffold } from '../../../../apps/web/tests/scaffold.ts'
import { parseCredentialsDocument } from '../../../credentials/credentials-local/src/index.ts'

const credentialStore = process.env.DSH_ROLEPLAY_EVAL_CREDENTIAL_STORE
const baselineGuidancePath = process.env.DSH_ROLEPLAY_LONGFORM_BASELINE_GUIDANCE
const stage = process.env.DSH_ROLEPLAY_LONGFORM_STAGE ?? 'manual'
const provider = 'deepseek-official'
const model = process.env.DSH_ROLEPLAY_EVAL_MODEL ?? 'deepseek-v4-flash'
const reasoningEffort = process.env.DSH_ROLEPLAY_EVAL_REASONING_EFFORT ?? 'low'
const continuation = process.env.DSH_ROLEPLAY_LONGFORM_CONTINUATION === '1'
const laterPressure = continuation && process.env.DSH_ROLEPLAY_LONGFORM_LATER_PRESSURE === '1'
const directorProbe = laterPressure && process.env.DSH_ROLEPLAY_LONGFORM_DIRECTOR === '1'
const voiceScene = process.env.DSH_ROLEPLAY_LONGFORM_VOICE_SCENE === '1'
const voiceSceneCue = voiceScene && process.env.DSH_ROLEPLAY_LONGFORM_VOICE_CUE === '1'
const voiceSceneDirector = voiceScene && process.env.DSH_ROLEPLAY_LONGFORM_VOICE_DIRECTOR === '1'
const voiceAuthorFocus = voiceScene && process.env.DSH_ROLEPLAY_LONGFORM_VOICE_AUTHOR_FOCUS === '1'
const directorInstruction = process.env.DSH_ROLEPLAY_LONGFORM_DIRECTOR_INSTRUCTION ?? ''
const actorFacingBeat = process.env.DSH_ROLEPLAY_LONGFORM_ACTOR_BEAT ?? ''
const fixture = process.env.DSH_ROLEPLAY_LONGFORM_FIXTURE ?? fileURLToPath(new URL(
  '../../../experimental/roleplay-web-profile/tests/fixtures/storybooks/embers-and-morningstar/storybook.json', import.meta.url))
const actors = ['mashiro', 'ren', 'baldu', 'elia', 'nono'] as const

it.skipIf(credentialStore === undefined)('performs the long-form opening with five distinct characters',
  { timeout: 600000, retry: 0 }, async () => {
    if (credentialStore === undefined) throw new Error('Credential store is required for this probe')
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(stage)) throw new Error(`Invalid long-form stage: ${stage}`)
    const output = fileURLToPath(new URL(`../../../../.artifacts/longform-performance/${stage}/`, import.meta.url))
    const credential = parseCredentialsDocument(await readFile(credentialStore, 'utf8'), credentialStore)
      .refs.get('DEEPSEEK_API_KEY')
    if (credential === undefined) throw new Error('DeepSeek credential is not configured in the requested store')
    await mkdir(dirname(output), { recursive: true })
    await mkdir(output)
    const root = await mkdtemp(join(tmpdir(), 'dsh-longform-'))
    vi.stubEnv('DEEPSEEK_API_KEY', credential)
    vi.stubEnv('DSH_SNAPSHOT', 'record')
    const baselineGuidance = baselineGuidancePath === undefined ? undefined : await readFile(baselineGuidancePath, 'utf8')
    const baselineGuidanceSha256 = baselineGuidance === undefined ? null
      : createHash('sha256').update(baselineGuidance).digest('hex')
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
            provider, model, consolidationThreshold: 0, directorConsolidationThreshold: 0,
            queryPageLimit: 100, notificationIntervalMs: 100, recallCharacterLimit: 24000,
            characterLimits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
              maxActiveGoals: 32, maxScheduledIntentions: 32 },
            directorCommandLimit: 24, discussionTurnLimit: 24, maxContextUpdateUnits: 16,
            reactiveDirectorLimit: 1 } },
        ],
      })
      const { ctx } = scaffold
      await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
        selection: { provider, model, reasoningEffort } })
      const fixtureText = await readFile(fixture, 'utf8')
      const fixtureSha256 = createHash('sha256').update(fixtureText).digest('hex')
      const source = JSON.parse(fixtureText) as unknown
      const original = parseStorybookDocument(source)
      const authored = voiceAuthorFocus ? parseStorybookDocument({ ...original,
        beats: [{ volume: 1, id: 'kitchen-letter', candidate: '出发前的公会厨房里，诺诺的信纸被汤洇开“我不怕”；队友可能察觉，也可能让他自己收起。沉默、回避或关照都能改变彼此的距离，这顿饭没有必须完成的事务。' },
          ...original.beats],
        directorPrompt: original.directorPrompt + ' 本书开场的当前一拍是公会厨房里的湿信。先让眼前人物对信纸与彼此作出一次可见回应，或选择不触碰它；诺诺可以隐瞒，不要求他解释。等这次互动自然收束，再让公会交付护送委托与黑匣。',
      }) : original
      const recipe = initialContextRecipe()
      const document = baselineGuidance === undefined ? authored : { ...authored, contextRecipe: { ...recipe,
        actor: recipe.actor.map(section => section.id === 'performance'
          ? { ...section, content: baselineGuidance.trim() } : section) } }
      const draft = ctx.roleplayBooks.saveDraft({ id: 'embers-and-morningstar' as BookId, expectedRevision: 0,
        title: original.title, resources: [], document: JSON.parse(JSON.stringify(document)) as Document })
      const version = ctx.roleplayBooks.publish(draft.id, draft.revision)
      const id = ctx.roleplayInstances.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId }).instance.id
      const scope = (): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
        expectedRevision: ctx.roleplayHistory.snapshot(id).instance.revision, principal: { kind: 'player' } })
      ctx.roleplayPeople.stage(scope(), { id: voiceScene ? 'guild-kitchen' : 'guild-yard',
        location: voiceScene ? '石楠埠公会厨房' : '石楠埠公会院', present: [...actors], appearances: [] })
      const observation = voiceScene
        ? '出发前的傍晚，五人坐在公会厨房躲雨，灶上煮着淡得见底的麦汤。诺诺把一张折好的信纸压在汤碗下；纸边只露出“我不怕”三个字，一滴汤把“怕”字洇开了。雷恩刚挂好湿斗篷，真白在桌角给地图补空白，巴尔德把一只缺口木碗翻过来看底。艾莉娅也在场。旁人看不见信的其他内容，也没人催他们讨论任务。'
        : '初冬清晨，公会把一只封着七角纹蜡印的温热黑匣放上护送车，委托书写“密封炉芯”，目的地灰隘。'
        + '柜台员照名册介绍在场的领路人柊真白、药师艾莉娅、工匠巴尔德、护卫雷恩和跑腿诺诺。'
        + '车刚推出院门，左轮的铁箍脱落，木轴露出新裂口；公会没有空车。北路午后可能降雪。'
        + '柜台员问谁负责安排修车与出发。此时无人知道黑匣里有什么。'
      ctx.roleplayWorld.observe(scope(), { summary: voiceScene ? '公会厨房里的湿信' : '公会院的护送准备',
        content: observation, state: [],
        shared: { actorIds: [...actors], kind: 'observation', content: observation, sourceRefs: [] }, deliveries: [] })
      if (voiceSceneCue) ctx.roleplayConfiguration.setStyle(scope(), { scope: 'scene', sceneId: 'guild-kitchen',
        key: 'actor:nono', instruction: '你压在汤碗下的信纸被汤洇开了“怕”字。此刻你更在意这张纸和别人会不会看见它；要藏、要说、要转开话题都由你决定。让这个在意影响你接下来做的事，不用向大家解释整封信。' })
      const report: Record<string, unknown> = { stage, provider, model, reasoningEffort, continuation, laterPressure, voiceScene,
        directorInstruction, actorFacingBeat, fixtureSha256, baselineGuidanceSha256,
        voiceSceneCue, voiceSceneDirector, voiceAuthorFocus, directorProbe, fixture, observation, cases: [] }
      const runActor = async (actorId: typeof actors[number], phase: string) => {
        const started = performance.now()
        const requestRevision = ctx.roleplayHistory.snapshot(id).instance.revision
        let failure: unknown
        try { await ctx.roleplayRuntime.run(scope(), actorId) } catch (error) { failure = error }
        const view = ctx.roleplayPlay.read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 100 })
        const sessions = ctx.agents.list().map(agent => agent.session)
          .filter(session => session.events.some(event => event.type === 'roleplay/execution-request'
            && event.data.context.instanceId === id && 'actorId' in event.data.context && event.data.context.actorId === actorId
            && event.data.context.revision >= requestRevision))
        expect(sessions.length, `Missing recorded actor request for ${phase}:${actorId}`).toBeGreaterThan(0)
        ;(report.cases as unknown[]).push({ phase, actorId, elapsedMs: Math.round(performance.now() - started),
          failure: failure instanceof Error ? failure.message : failure ?? null, play: view,
          sessions: sessions.map(session => ({ id: session.id, events: session.events.filter(event => [
            'roleplay/execution-request', 'roleplay/execution-receipt', 'assistant/message', 'tool/call', 'tool/result',
          ].includes(event.type)) })),
          usage: await ctx.roleplayExecutionHistory.usage(id) })
        await writeFile(join(output, 'review.json'), JSON.stringify(report, null, 2) + '\n')
        if (failure !== undefined) throw failure
      }
      const openingOrder: Array<typeof actors[number]> = voiceScene
        ? ['nono', 'elia', 'baldu', 'ren', 'mashiro'] : [...actors]
      if (!voiceSceneDirector) for (const actorId of openingOrder) await runActor(actorId, 'opening')
      if (continuation) {
        const next = '检查和试放的结果已经明确：左轮木轴的裂纹向轴心延伸，现有铁箍不能承受上坡；右轮未见新裂口，车还留在公会院。'
          + '黑匣封蜡与捆绳完好，匣底车板没有明显干裂；匣子为何温热仍未知。'
          + '诺诺在驿站废料堆只找到弯钉、破镰刀头和一截尺寸过大的锈箍；公会院子的人没有找到备用轴材。'
          + '铁匠铺门口的筐、后巷车行的营业和库存都还未核实。午后的第一片雪已经落下。'
        ctx.roleplayWorld.observe(scope(), { summary: '检查结果与初雪', content: next, state: [],
          settles: pendingWorldAttempts(ctx.roleplayHistory.snapshot(id)).map(item => item.id),
          shared: { actorIds: [...actors], kind: 'observation', content: next, sourceRefs: [] }, deliveries: [] })
        for (const actorId of actors) await runActor(actorId, 'after-feedback')
      }
      if (laterPressure) {
        const dilemma = '午后，药材商队推着另一辆车进院，车上的老人发热且畏寒，车夫想赶在封雪前去白桦驿。'
          + '车夫扶着车辕说：“这根备用轴要是借给你们，我的车路上再坏，他就得在雪里等。”'
          + '那根轴的尺寸可能合用，但车夫还没有同意借出或交换；药师尚未检查老人。'
          + '同时灰隘送来急信：炉星塔停了，诊疗所今夜可能缺热。公会柜台问护送队接下来怎么安排。'
          + '车行库存、老人病情和灰隘实际缺热量仍未知。'
        ctx.roleplayWorld.observe(scope(), { summary: '病人、备用轴与灰隘急信', content: dilemma, state: [],
          shared: { actorIds: [...actors], kind: 'observation', content: dilemma, sourceRefs: [] }, deliveries: [] })
        for (const actorId of actors) await runActor(actorId, 'new-pressure')
      }
      if (directorProbe || voiceSceneDirector) {
        const startRevision = ctx.roleplayHistory.snapshot(id).instance.revision
        await writeFile(join(output, 'before-director.json'),
          JSON.stringify(await ctx.roleplayTransfer.export(id, startRevision)) + '\n')
        const started = performance.now()
        let result: Awaited<ReturnType<typeof ctx.roleplayDirector.run>> | undefined
        let failure: unknown
        try { result = await ctx.roleplayDirector.run(scope(), directorInstruction, actorFacingBeat) } catch (error) { failure = error }
        const sessions = ctx.agents.list().map(agent => agent.session)
          .filter(session => session.events.some(event => event.type === 'roleplay/execution-request'
            && event.data.context.instanceId === id && 'role' in event.data.context
            && event.data.context.role === 'director' && event.data.context.revision >= startRevision))
        report.director = { startRevision, endRevision: ctx.roleplayHistory.snapshot(id).instance.revision,
          elapsedMs: Math.round(performance.now() - started), result,
          failure: failure instanceof Error ? failure.message : failure ?? null,
          usage: await ctx.roleplayExecutionHistory.usage(id),
          play: ctx.roleplayPlay.read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 100 }),
          sessions: sessions.map(session => ({ id: session.id, events: session.events.filter(event => [
            'roleplay/execution-request', 'roleplay/execution-receipt', 'assistant/message', 'tool/call', 'tool/result',
          ].includes(event.type)) })) }
        await writeFile(join(output, 'review.json'), JSON.stringify(report, null, 2) + '\n')
        if (failure !== undefined) throw failure
        expect(result?.status).toBe('completed')
      }
      await writeFile(join(output, 'story-archive.json'), JSON.stringify(await ctx.roleplayTransfer.export(id,
        ctx.roleplayHistory.snapshot(id).instance.revision), null, 2) + '\n')
      expect((report.cases as unknown[])).toHaveLength(voiceSceneDirector ? 0
        : actors.length * (1 + Number(continuation) + Number(laterPressure)))
    } finally { await scaffold?.close(); await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs() }
  })
