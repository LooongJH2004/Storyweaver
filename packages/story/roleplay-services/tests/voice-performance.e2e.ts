/** Isolated real-model actor voice probe; run explicitly with a configured credential store. */
import type {} from '../src/index.ts'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, vi } from 'vitest'
import type { BookId, CommandId, CommandScope, Document } from '@deepseek-ai/dsh-roleplay-core'
import { parseStorybookDocument } from '@deepseek-ai/dsh-roleplay-core/storybook'
import { initialContextRecipe } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import { pendingWorldAttempts } from '../../roleplay-core/src/world-attempts.ts'
import { launchWebScaffold } from '../../../../apps/web/tests/scaffold.ts'
import { parseCredentialsDocument } from '../../../credentials/credentials-local/src/index.ts'

const credentialStore = process.env.DSH_ROLEPLAY_EVAL_CREDENTIAL_STORE
const baselineGuidancePath = process.env.DSH_ROLEPLAY_VOICE_BASELINE_GUIDANCE
const continuation = process.env.DSH_ROLEPLAY_VOICE_CONTINUATION === '1'
const stage = process.env.DSH_ROLEPLAY_VOICE_STAGE ?? 'manual'
const model = process.env.DSH_ROLEPLAY_EVAL_MODEL ?? 'deepseek-v4-flash'
const reasoningEffort = process.env.DSH_ROLEPLAY_EVAL_REASONING_EFFORT
const cases = [
  { id: 'child', scene: '码头', participants: ['child', 'ferryman', 'stranger'],
    persona: '八岁，第一次到海边，话多，好奇，常先说眼前看到的东西。',
    goal: '想弄清小船还能不能靠岸，也想帮忙，但不知道当地潮水的规律。',
    observation: '傍晚，蓝灯突然暗了。水没过最低一级石阶，小船随着水抬高。你看见摆渡人正在系缆绳；一个背包的陌生人问：“这船现在还能上吗？”' },
  { id: 'ferryman', scene: '码头', participants: ['child', 'ferryman', 'stranger'],
    persona: '在码头摆渡多年，说话直白，关心人有没有站稳，少讲道理。',
    goal: '尽量让想上船的人安全登船；知道低阶漫水时不要踩那一级。',
    observation: '傍晚，蓝灯突然暗了。水没过最低一级石阶，小船随着水抬高。你手里正拿着缆绳；一个背包的陌生人问：“这船现在还能上吗？”' },
  { id: 'innkeeper', scene: '旅店', participants: ['innkeeper', 'guest'],
    persona: '经营小旅店多年，精明但不冷淡，说话简短，习惯先说能做的事。',
    goal: '照看柜台，也愿意帮客人保管东西，但不会替客人决定。',
    observation: '夜里，店里只有你和一位客人。客人把一把钥匙放在柜台边，问：“能帮我收着吗？明早我来拿。”你还没有碰钥匙，也还没答应。' },
] as const
const cast = [
  { actorId: 'child', displayName: '小禾', appearance: '八岁的小孩', publicPersona: cases[0].persona,
    rolePrompt: cases[0].goal },
  { actorId: 'ferryman', displayName: '摆渡人', appearance: '手里拿着缆绳的摆渡人', publicPersona: cases[1].persona,
    rolePrompt: cases[1].goal },
  { actorId: 'stranger', displayName: '客人', appearance: '背包的陌生人', publicPersona: '想乘船过岸。', rolePrompt: '' },
  { actorId: 'innkeeper', displayName: '店主', appearance: '柜台后的店主', publicPersona: cases[2].persona,
    rolePrompt: cases[2].goal },
  { actorId: 'guest', displayName: '客人', appearance: '带钥匙的客人', publicPersona: '次日早晨要取回钥匙。', rolePrompt: '' },
]

it.skipIf(credentialStore === undefined)('compares three actor voices from independent story instances',
  { timeout: 240000, retry: 0 }, async () => {
    if (credentialStore === undefined) throw new Error('Credential store is required for this probe')
    const root = await mkdtemp(join(tmpdir(), 'dsh-live-voice-'))
    const output = fileURLToPath(new URL(`../../../../.artifacts/voice-performance/${stage}/`, import.meta.url))
    await mkdir(output, { recursive: true })
    const credential = parseCredentialsDocument(await readFile(credentialStore, 'utf8'), credentialStore)
      .refs.get('DEEPSEEK_API_KEY')
    if (credential === undefined) throw new Error('DeepSeek credential is not configured in the requested store')
    vi.stubEnv('DEEPSEEK_API_KEY', credential)
    vi.stubEnv('DSH_SNAPSHOT', 'record')
    const baselineGuidance = baselineGuidancePath === undefined ? undefined : await readFile(baselineGuidancePath, 'utf8')
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
            provider: 'deepseek-official', model, consolidationThreshold: 0, directorConsolidationThreshold: 0,
            queryPageLimit: 40, notificationIntervalMs: 100,
            recallCharacterLimit: 16000,
            characterLimits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
              maxActiveGoals: 32, maxScheduledIntentions: 32 },
            directorCommandLimit: 12, discussionTurnLimit: 12, maxContextUpdateUnits: 8 } },
        ],
      })
      const { ctx } = scaffold
      await ctx.roleplayExecutionModel.save({ expectedRevision: ctx.roleplayExecutionModel.read().revision,
        selection: { provider: 'deepseek-official', model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) } })
      const report: Record<string, unknown> = { stage, model, reasoningEffort, continuation, cases: [] }
      for (const scenario of cases) {
        const defaultRecipe = initialContextRecipe()
        const contextRecipe = baselineGuidance === undefined ? undefined : { ...defaultRecipe,
          actor: defaultRecipe.actor.map(section => section.id === 'performance'
            ? { ...section, content: baselineGuidance.trim() } : section) }
        const document = parseStorybookDocument({ schemaVersion: 6, id: `voice-${scenario.id}`, title: `口吻测试：${scenario.id}`,
          directorPrompt: '', directorGuidance: {}, commonKnowledge: [], ...(contextRecipe === undefined ? {} : { contextRecipe }),
          characters: cast.filter(character => (scenario.participants as readonly string[]).includes(character.actorId))
            .map(character => ({ ...character, actingGuidance: {}, capabilities: ['speak', 'act'], initialKnowledge: [] })),
        })
        const draft = ctx.roleplayBooks.saveDraft({ id: `voice-${scenario.id}` as BookId, expectedRevision: 0,
          title: `口吻测试：${scenario.id}`, resources: [], document: JSON.parse(JSON.stringify(document)) as Document })
        const version = ctx.roleplayBooks.publish(draft.id, draft.revision)
        const id = ctx.roleplayInstances.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId }).instance.id
        const scope = (): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
          expectedRevision: ctx.roleplayHistory.snapshot(id).instance.revision, principal: { kind: 'player' } })
        ctx.roleplayPeople.stage(scope(), { id: scenario.scene, location: scenario.scene,
          present: [...scenario.participants], appearances: [] })
        ctx.roleplayWorld.observe(scope(), { summary: '眼前情形', content: scenario.observation, state: [],
          shared: { actorIds: [scenario.id], kind: 'observation', content: scenario.observation, sourceRefs: [] }, deliveries: [] })
        const started = performance.now()
        let failure: unknown
        try { await ctx.roleplayRuntime.run(scope(), scenario.id) } catch (error) { failure = error }
        if (failure === undefined && continuation && scenario.id === 'ferryman') {
          const next = '船被绳子拉到岸边，但仍随着水轻轻晃。背包人站在上一级石阶，问：“我先把包给你？”'
          ctx.roleplayWorld.observe(scope(), { summary: '船靠近岸边', content: next,
            settles: pendingWorldAttempts(ctx.roleplayHistory.snapshot(id)).map(item => item.id), state: [],
            shared: { actorIds: [...scenario.participants], kind: 'observation', content: next, sourceRefs: [] }, deliveries: [] })
          try { await ctx.roleplayRuntime.run(scope(), scenario.id) } catch (error) { failure = error }
        }
        const view = ctx.roleplayPlay.read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 40 })
        const sessions = ctx.agents.list().map(agent => agent.session)
          .filter(session => session.events.some(event => event.type === 'roleplay/execution-request' && event.data.context.instanceId === id))
        const row = { id: scenario.id, observation: scenario.observation, persona: scenario.persona, goal: scenario.goal,
          elapsedMs: Math.round(performance.now() - started), failure: failure instanceof Error ? failure.message : failure ?? null,
          play: view, requests: sessions.flatMap(session => session.events
            .filter(event => event.type === 'roleplay/execution-request').map(event => event.data.context)),
          usage: await ctx.roleplayExecutionHistory.usage(id) }
        ;(report.cases as unknown[]).push(row)
        await writeFile(join(output, 'review.json'), JSON.stringify(report, null, 2) + '\n')
        if (failure !== undefined) throw failure
      }
      expect((report.cases as unknown[])).toHaveLength(cases.length)
    } finally { await scaffold?.close(); await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs() }
  })
