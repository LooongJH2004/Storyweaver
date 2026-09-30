import { actorOperationEvents } from '@deepseek-ai/dsh-experimental-actor'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import type {} from '@deepseek-ai/dsh-agent-presets'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { deriveTurnTokenUsage } from '@deepseek-ai/dsh-token-meter'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import StoryRegistry, { type Story, type StoryId } from '@deepseek-ai/dsh-story'
import StoryHome from '@deepseek-ai/dsh-story-home'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import ActorService, { ActorId, foldActor } from '../../actor/src/index.ts'
import * as toolActor from '../../tool-actor/src/index.ts'
import * as toolDirector from '../src/index.ts'
import { sourceText } from '../src/context-sources.ts'

const contexts: Context[] = []
const roots: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function harness(
  script: ConstructorParameters<typeof MockAdapter>[0],
  config: toolDirector.Config = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-tool-director-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(new MemoryMediaPool()))
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  await ctx.plugin(StoryHome, { root })
  await ctx.plugin(StoryRegistry)
  await ctx.plugin(ActorService)
  await ctx.plugin(toolActor)
  ctx.provide('agentPresets', { mount: () => Promise.resolve() } as never)
  ctx.provide('sessionPersistence', {
    inspect: () => Promise.reject(new Error('test expected a live Actor Session')),
    prepare: () => Promise.reject(new Error('test expected a live Actor Session')),
  } as never)
  const directorPlugin = await ctx.plugin(toolDirector, config)
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter, directorPlugin }
}

function narration(id: string, expectedWorldRevision = 1) {
  return toolCallResponse(id, 'director_narrate', {
    expected_world_revision: expectedWorldRevision,
    text: '<p>雨声骤然压低。</p><p>**账簿**在桌面上翻过一页。</p>',
    summary: '雨势增强，账簿自行翻过一页。',
    audience_actor_ids: ['shadowheart'], perceptions: ['shadowheart'].map(actorId => ({ actorId, content: '雨势增强，账簿自行翻过一页。' })),
    patch: [],
  })
}

async function installStorybook(ctx: Context, storyId: StoryId): Promise<void> {
  await writeFile(ctx.storyHome.storyPath(storyId, 'world', 'storybook.json'), JSON.stringify({
    schemaVersion: 6,
    id: 'test-storybook',
    title: '月影账簿',
    directorPrompt: '以克制的都市奇幻方式推进。',
    reasoningLanguage: '简体中文',
    worldTruth: { secret: '只有导演知道的世界真相' },
    discussionSettings: { maxRounds: 4 },
    directorGuidance: { narrativeStyle: '以克制的都市奇幻笔触推进。' },
    characters: [
      {
        actorId: 'shadowheart',
        displayName: '影心',
        publicPersona: '克制、警惕记忆操控的牧师。',
        rolePrompt: '严格限定在影心的私有感知与判断中。',
        state: [],
        capabilities: ['speak', 'act', 'reflect', 'memory', 'goals', 'schedule'],
        privateContext: {
          perspective: ['红线来自莎尔旧仪式。'],
        },
        actingGuidance: { speechStyle: '短句、冷峻反问。' },
      },
      {
        actorId: 'astarion',
        displayName: '阿斯代伦',
        publicPersona: '敏锐、擅长用玩笑掩饰戒心。',
        rolePrompt: '严格限定在阿斯代伦的私有感知与判断中。',
        state: [],
        capabilities: ['speak', 'act', 'reflect', 'memory', 'goals', 'schedule'],
        privateContext: { perspective: ['他不信任账簿上的空白。'] },
        actingGuidance: { speechStyle: '轻佻但保持警觉。' },
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        actorId: `ensemble-${String(index + 1)}`,
        displayName: `群像角色${String(index + 1)}`,
        publicPersona: '仅在进入当前场景后参与叙事。',
        rolePrompt: '只依据自己的感知与目标行动。',
        state: [],
        capabilities: ['speak', 'act', 'reflect'],
        privateContext: { perspective: [`群像角色${String(index + 1)}的私有信息。`] },
        actingGuidance: { speechStyle: '简洁。' },
      })),
    ],
  }), 'utf8')
  await writeFile(
    ctx.storyHome.storyPath(storyId, 'world', 'opening.md'),
    '账簿翻开，第四行仍是空白。',
    'utf8',
  )
}

async function installMinimalOutline(ctx: Context, storyId: StoryId): Promise<void> {
  await ctx.storyRegistry.replaceDirectorOutline(storyId, 0, {
    updateMode: 'auto_unlocked',
    premise: '围绕当前冲突形成可调整的长期计划。',
    premiseLocked: false,
    themes: [], hardConstraints: [], arcs: [], beats: [], foreshadows: [], mysteries: [], clocks: [],
  }, '测试用 Director 初稿')
}

async function stageTestScene(
  ctx: Context,
  storyId: StoryId,
  presentActorIds: readonly string[] = ['shadowheart'],
): Promise<void> {
  const story = ctx.storyRegistry.get(storyId)
  if (story === undefined) throw new Error(`Story '${storyId}' is missing`)
  await ctx.storyRegistry.stageScene(storyId, {
    expectedWorldRevision: story.world.revision,
    sceneId: 'moonshadow-private-room',
    location: '酒馆包厢',
    summary: '账簿与在场众人同处酒馆包厢。',
    presentActorIds,
  })
}

describe('Storyweaver Director runtime', () => {
  it.each(['ordinary', 'preparation', 'floor'])('rejects player-owned Briefs and recovered %s dispatch from logged intent, then releases ownership on a new input', async (phase) => {
    const { ctx } = await harness([])
    const story = await ctx.storyRegistry.create('玩家沉默')
    await installStorybook(ctx, story.id)
    await installMinimalOutline(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-player-ownership'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    await stageTestScene(ctx, story.id, ['shadowheart', 'astarion'])
    const input = (turn: number, text: string, structured = false): void => {
      director.session.append('turn/start', { turn })
      director.session.append('user/message', createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'user', ...(structured ? { inputIntent: { kind: 'storyweaver', payload: { mode: 'embody', actorId: 'shadowheart' } } } : {}) },
      }), { surfaceOp: 'append' })
    }
    const brief = () => ctx.tools.execute({
      signal: new AbortController().signal, callId: ToolCallId('player-brief'), name: 'director_commit_brief', agent: director,
      arguments: { expected_ledger_revision: story.plotLedger.revision, situation: '影心保持沉默。',
        actor_briefs: ['shadowheart', 'astarion'].map(actor_id => ({ actor_id, perceptions: ['红线晃动。'], uncertainties: [] })) },
    })
    input(1, '影心没有回答，只把手收回斗篷下。', true)
    expect(await brief()).toMatchObject({ isError: true })
    expect(story.plotLedger.revision).toBe(0)
    expect(story.sessions.filter(item => item.role === 'actor')).toEqual([])
    input(2, '【重试】恢复这次推进。')
    expect(await brief()).toMatchObject({ isError: true })
    input(3, '【旁观推进】')
    expect(await brief()).toMatchObject({ isError: false })
    if (phase !== 'ordinary') {
      await ctx.storyRegistry.startDiscussion(story.id, { expectedRevision: 0, topic: '是否剪断红线？',
        participantIds: ['shadowheart', 'astarion'], maxRounds: 2, initiatedBy: 'director' })
      const discussion = story.discussions.discussions[0]!
      if (phase === 'floor') {
        await ctx.storyRegistry.skipDirectorRunActor(story.id, story.plotLedger.directorRun!.revision, 'shadowheart')
        await ctx.storyRegistry.skipDirectorRunActor(story.id, story.plotLedger.directorRun!.revision, 'astarion')
        await ctx.storyRegistry.completeDiscussionPreparation(story.id, discussion.id, 'shadowheart', { eagerness: 'high' })
        await ctx.storyRegistry.completeDiscussionPreparation(story.id, discussion.id, 'astarion', { eagerness: 'low' })
        expect(story.discussions.discussions[0]!.currentSpeakerId).toBe('shadowheart')
      }
    }
    input(4, '【代演角色：影心】影心仍旧沉默。')
    const runBefore = JSON.stringify(story.plotLedger.directorRun)
    await expect(ctx.directorRuns.resume(story.id, story.plotLedger.directorRun!.revision))
      .rejects.toThrow('Player controls shadowheart')
    expect(JSON.stringify(story.plotLedger.directorRun)).toBe(runBefore)
    expect(story.world.events.filter(event => event.kind === 'actor-speech')).toEqual([])
  })

  it.each(['complete', 'pause', 'retry', 'skip'])('starts both private preparations before either finishes; mode=%s', async (mode) => {
    const { ctx, adapter } = await harness([], { preparationConcurrency: 2 })
    const story = await ctx.storyRegistry.create('并行准备')
    await installStorybook(ctx, story.id)
    await installMinimalOutline(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('parallel-director'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.id, 'scene')
    director.session.append('turn/start', { turn: 1 })
    director.session.append('step/start', { turn: 1, step: 1 })
    await stageTestScene(ctx, story.id, ['shadowheart', 'astarion'])
    const call = async (name: string, args: object) => {
      const result = await ctx.tools.execute({ name, arguments: args, agent: director,
        callId: ToolCallId(name), signal: new AbortController().signal })
      expect(result.isError, JSON.stringify(result)).toBe(false)
    }
    await call('director_commit_brief', { expected_ledger_revision: 0, situation: '讨论红线。',
      actor_briefs: ['shadowheart', 'astarion'].map(actor_id => ({ actor_id, perceptions: ['看见红线。'], uncertainties: [] })) })
    await call('director_narrate', { expected_world_revision: 1, text: '红线绷紧。', summary: '红线绷紧。', audience_actor_ids: ['shadowheart', 'astarion'], perceptions: ['shadowheart', 'astarion'].map(actorId => ({ actorId, content: '雨势增强，账簿自行翻过一页。' })), patch: [] })
    await call('director_start_discussion', { expected_discussion_revision: 0, topic: '是否剪断？', participant_ids: ['shadowheart', 'astarion'] })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const entered: string[] = []
    const requests: typeof adapter.requests = []
    const calls = new Map<string, number>()
    vi.spyOn(adapter, 'stream').mockImplementation(async function* (options) {
      requests.push(options)
      const actorId = ctx.storyRegistry.storyForSession(SessionId(String(options.sessionId)))?.actorId
      if (actorId === undefined) throw new Error('Only Actor requests expected')
      const count = calls.get(actorId) ?? 0
      calls.set(actorId, count + 1)
      if (count === 0) {
        entered.push(actorId)
        await Promise.race([gate, new Promise<void>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
        })])
      }
      if (mode === 'retry' && actorId === 'astarion' && count === 0) throw new Error('Transient preparation failure')
      const preparation = story.discussions.discussions[0]?.preparationPendingIds?.includes(actorId) === true
      yield* toolCallResponse(`${actorId}-${count}`, 'npc_commit_turn', {
        posture: 'waiting', behavior: preparation ? [] : [{ kind: 'speech', text: '先确认来源，再决定。' }],
        ...(preparation ? {} : { context_update: [{ sourceIds: ['$behavior:0'], disposition: 'represented', reason: '条件需保留', changes: [{ operation: 'add', kind: 'condition', text: '条件原文待审核', sourceIds: ['$behavior:0'] }] }] }),
        discussion: { stance: actorId === 'astarion' ? '先确认来源。' : '先等待。', eagerness: actorId === 'astarion' ? 'high' : 'low', action: preparation ? 'pass' : 'conclude' },
      })
    })
    const dispatch = ctx.directorRuns.resume(story.id, story.plotLedger.directorRun!.revision)
    const settled = dispatch.catch((error: unknown) => error)
    await expect.poll(() => entered.length).toBe(2)
    expect(story.discussions.discussions[0]?.currentSpeakerId).toBeUndefined()
    expect(story.discussions.discussions[0]?.turns).toEqual([])
    if (mode === 'pause') {
      await ctx.directorRuns.pause(story.id, story.plotLedger.directorRun!.revision)
      release()
      await settled
      expect(story.plotLedger.directorRun?.status).toBe('paused')
      expect(story.discussions.discussions[0]?.preparationPendingIds).toHaveLength(2)
      expect(story.world.continuity).toEqual([])
    } else {
      if (mode === 'skip') await ctx.directorRuns.skipActor(story.id, story.plotLedger.directorRun!.revision, 'shadowheart')
      release()
      await dispatch
      if (mode === 'retry') {
        expect(story.discussions.discussions[0]?.turns).toEqual([])
        expect(story.discussions.discussions[0]?.preparationPendingIds).toEqual(['astarion'])
        await ctx.directorRuns.retryActor(story.id, story.plotLedger.directorRun!.revision, 'astarion')
      }
      expect(story.discussions.discussions[0]?.turns).toEqual([expect.objectContaining({ speakerId: 'astarion', action: 'conclude' })])
      expect(story.discussions.discussions[0]?.preparationPendingIds).toBeUndefined()
      const actorRequests = requests.filter(request => request.sessionId === story.sessions.find(item => item.actorId === 'astarion')?.sessionId)
      expect(actorRequests).toHaveLength(mode === 'retry' ? 3 : 2)
      expect(actorRequests[0]?.tools).toEqual(actorRequests[1]?.tools)
      expect(actorRequests[0]?.tools?.map(tool => tool.name).sort()).toEqual(['npc_commit_turn', 'npc_recall_knowledge', 'roleplay_recall'])
      expect(story.world.context.proposals).toEqual([expect.objectContaining({ scope: 'actor:astarion', status: 'proposed' })])
      expect(story.world.context.notes).toEqual([])
    }
  })

  it('uses the player-authored round limit and exposes durable discussion progress', async () => {
    const { ctx } = await harness([])
    const story = await ctx.storyRegistry.create('玩家讨论上限')
    await installStorybook(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-discussion-limit'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    await stageTestScene(ctx, story.id, ['shadowheart', 'astarion'])

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('discussion-player-limit'),
      name: 'director_start_discussion',
      agent: director,
      arguments: {
        expected_discussion_revision: 0,
        topic: '是否应当剪断红线？',
        participant_ids: ['shadowheart', 'astarion'],
      },
    })

    expect(result.isError).toBe(false)
    expect(story.discussions.discussions[0]).toMatchObject({ maxRounds: 4, round: 1, turns: [] })
  })

  it('runs a discussion autonomously through multiple speakers and summarizes it in the same player turn', async () => {
    const runtime: { story?: Story } = {}
    const actorDiscussionTurn = (
      id: string,
      stance: string,
      eagerness: 'low' | 'medium' | 'high',
      action: 'speak' | 'pass' | 'conclude',
      text?: string,
      nextSpeakerId?: string,
    ) => () => toolCallResponse(id, 'npc_commit_turn', {
      behavior: text === undefined ? [] : [{
        kind: 'speech', text, to: [], delivery: 'spoken', intent: 'proposal',
      }],
      turning_points: [],
      posture: text === undefined ? 'waiting' : 'finished',
      discussion: {
        stance, eagerness, action,
        ...(nextSpeakerId === undefined ? {} : { next_speaker_id: runtime.story!.world.characters.encounters.find(item => item.observerId === 'shadowheart' && item.actorId === nextSpeakerId)!.ref }),
      },
    })
    const { ctx, adapter } = await harness([
      toolCallResponse('brief-discussion', 'director_commit_brief', {
        expected_ledger_revision: 0,
        situation: '影心与阿斯代伦围绕红线争执。',
        actor_briefs: [
          { actor_id: 'shadowheart', perceptions: ['阿斯代伦正观察红线。'], uncertainties: [] },
          { actor_id: 'astarion', perceptions: ['影心阻止任何人碰红线。'], uncertainties: [] },
        ],
      }),
      narration('narrate-discussion'),
      toolCallResponse('start-discussion', 'director_start_discussion', {
        expected_discussion_revision: 0,
        topic: '是否应当剪断红线？',
        participant_ids: ['shadowheart', 'astarion'],
      }),
      textResponse('讨论已开始，等待主持人喚醒参与者。'),
      textResponse('影心仍持有发言权，继续等待。'),
      toolCallResponse('dispatch-discussion', 'director_dispatch_actors', {}),
      toolCallResponse('invalid-prep-shadowheart', 'npc_commit_turn', {
        behavior: [{
          kind: 'speech', text: '我先公开表态。', to: [], delivery: 'spoken', intent: 'proposal',
        }],
        posture: 'waiting',
      }),
      actorDiscussionTurn('prep-shadowheart', '不能冒险剪断。', 'high', 'pass'),
      actorDiscussionTurn('prep-astarion', '先弄清它连接着什么。', 'medium', 'pass'),
      actorDiscussionTurn('speak-shadowheart', '不能冒险剪断。', 'high', 'speak', '先查清红线的另一端。', 'astarion'),
      actorDiscussionTurn('speak-astarion', '先弄清它连接着什么。', 'medium', 'conclude', '难得意见一致：先追踪，再动刀。'),
      () => narration('summarize-discussion', runtime.story?.world.revision ?? -1),
      () => {
        const discussion = runtime.story?.discussions.discussions[0]
        if (discussion === undefined) throw new Error('Discussion was not created before summary resolution')
        return toolCallResponse('resolve-discussion', 'director_resolve_discussion', {
          expected_discussion_revision: runtime.story!.discussions.revision,
          discussion_id: discussion.id,
          action: 'complete',
        })
      },
    ], { preparationConcurrency: 1 })
    const story = await ctx.storyRegistry.create('自主群组讨论')
    runtime.story = story
    await installStorybook(ctx, story.id)
    await installMinimalOutline(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-autonomous-discussion'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    await stageTestScene(ctx, story.id, ['shadowheart', 'astarion'])

    director.followup(createUserMessage({
      content: [{ type: 'text', text: '【旁观推进】让他们自行讨论红线该怎么处理。' }], source: { kind: 'user' },
    }))
    await director.whenIdle()

    expect(story.discussions.discussions[0]).toMatchObject({
      status: 'completed',
      turns: [
        expect.objectContaining({ speakerId: 'shadowheart', action: 'speak' }),
        expect.objectContaining({ speakerId: 'astarion', action: 'conclude' }),
      ],
    })
    expect(director.session.events.filter(event => event.type === 'story/director-narration-projected')).toHaveLength(2)
    const directorRequests = adapter.requests.filter(request => request.sessionId === director.id)
    expect(directorRequests).toHaveLength(8)
    expect(story.plotLedger.directorRun).toMatchObject({ status: 'completed' })
    expect(JSON.stringify(story.plotLedger.pendingNpcEvents)).not.toContain('我先公开表态。')
    expect(adapter.requests.some(request => JSON.stringify(request.messages).includes(
      'Private discussion preparation must use empty behavior',
    ))).toBe(true)
    expect(adapter.requests.some(request => JSON.stringify(request.messages).includes(
      'PRIVATE PREPARATION MODE — this overrides ordinary turn behavior',
    ))).toBe(true)
    expect(adapter.requests.some(request => JSON.stringify(request.messages).includes(
      'PUBLIC FLOOR MODE — npc_commit_turn must include discussion',
    ))).toBe(true)
    expect(adapter.requests.filter(request => request.sessionId === director.id).some(request => (
      JSON.stringify(request.messages).includes('[HOST DISCUSSION CONCLUSION]')
    ))).toBe(true)
    const hostMessages = director.session.events.filter(event => (
      event.type === 'user/message' && event.data.source.kind === 'plugin'
    )).map(event => event.type === 'user/message'
      ? event.data.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
      : '')
    expect(hostMessages.filter(message => message.includes('[HOST ADVANCEMENT CONTINUATION]'))).toHaveLength(0)
    expect(hostMessages.filter(message => message.includes('[HOST DISCUSSION CONTINUATION]'))).toHaveLength(2)
    expect(hostMessages.filter(message => message.includes('[HOST POST-DISCUSSION ADVANCEMENT]'))).toHaveLength(0)
    const conclusion = hostMessages.find(message => message.includes('[HOST DISCUSSION CONCLUSION]'))
    expect(conclusion).toContain(`expected_world_revision=${String(story.world.revision - 1)}`)
    expect(conclusion).toContain(`expected_discussion_revision=${String(story.discussions.revision - 1)}`)
  })

  it('rejects discussion completion until the Director has narrated its summary', async () => {
    const { ctx } = await harness([])
    const story = await ctx.storyRegistry.create('讨论总结门禁')
    await installStorybook(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-discussion-summary-gate'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    const shadowheart = ctx.agentLoop.create(SessionId('actor-summary-gate-shadowheart'), { provider: 'mock', model: 'mock' })
    const astarion = ctx.agentLoop.create(SessionId('actor-summary-gate-astarion'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, shadowheart.session.id, 'actor', 'shadowheart')
    await ctx.storyRegistry.attachSession(story.id, astarion.session.id, 'actor', 'astarion')
    await stageTestScene(ctx, story.id, ['shadowheart', 'astarion'])

    let changed = await ctx.storyRegistry.startDiscussion(story.id, {
      expectedRevision: 0,
      topic: '是否应当剪断红线？',
      participantIds: ['shadowheart', 'astarion'],
      maxRounds: 1,
      initiatedBy: 'director',
    })
    const discussionId = changed.discussions.discussions[0]?.id
    if (discussionId === undefined) throw new Error('expected discussion')
    changed = await ctx.storyRegistry.updateDiscussionParticipantIntent(
      story.id, changed.discussions.revision, discussionId, 'shadowheart',
      { stance: '不能冒险剪断。', eagerness: 'high', action: 'pass' },
    )
    changed = await ctx.storyRegistry.updateDiscussionParticipantIntent(
      story.id, changed.discussions.revision, discussionId, 'astarion',
      { stance: '先查清连接。', eagerness: 'medium', action: 'pass' },
    )
    changed = await ctx.storyRegistry.recordDiscussionTurn(story.id, {
      expectedRevision: changed.discussions.revision,
      discussionId,
      speakerId: 'shadowheart',
      text: '先查清红线的另一端。',
      action: 'speak',
    })
    changed = await ctx.storyRegistry.recordDiscussionTurn(story.id, {
      expectedRevision: changed.discussions.revision,
      discussionId,
      speakerId: 'astarion',
      text: '同意，先追踪再动刀。',
      action: 'conclude',
    })
    expect(changed.discussions.discussions[0]?.status).toBe('summarizing')

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('resolve-without-summary'),
      name: 'director_resolve_discussion',
      agent: director,
      arguments: {
        expected_discussion_revision: changed.discussions.revision,
        discussion_id: discussionId,
        action: 'complete',
      },
    })

    expect(result.isError).toBe(true)
    expect(result.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n'))
      .toContain('requires director_narrate')
    expect(story.discussions.discussions[0]?.status).toBe('summarizing')
  })

  it('rejects the first Brief until the Director has drafted a non-empty Outline', async () => {
    const { ctx } = await harness([])
    const story = await ctx.storyRegistry.create('月影账簿')
    await installStorybook(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-outline-first'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('brief-before-outline'),
      name: 'director_commit_brief',
      agent: director,
      arguments: {
        expected_ledger_revision: 0,
        situation: '账簿在桌上自行翻开。',
        actor_briefs: [],
      },
    })

    expect(result.isError).toBe(true)
    expect(result.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n'))
      .toContain('Director Outline is empty')
    expect(story.directorOutline.revision).toBe(0)
    expect(story.plotLedger.latestBrief).toBeUndefined()
  })

  it('injects the Story Bible in the saved default context order', async () => {
    const { ctx } = await harness([])
    const story = await ctx.storyRegistry.create('月影账簿')
    await installStorybook(ctx, story.id)
    await ctx.storyRegistry.replaceDirectorOutline(story.id, 0, {
      updateMode: 'auto_unlocked',
      premise: '测试长期意图',
      premiseLocked: false,
      themes: [{ id: 'theme-trust', text: '信任需要代价', locked: false }],
      hardConstraints: [{ id: 'constraint-choice', text: '不得替角色决定', locked: true }],
      arcs: [{
        id: 'arc-ledger', title: '账簿追索', intent: '寻找第四个名字', status: 'active', locked: false,
        tensions: ['真相与安全冲突'], desiredQuestions: ['谁写下名字？'], completionSignals: ['找到执笔者'],
      }],
      beats: [{
        id: 'beat-thread', arcId: 'arc-ledger', title: '红线绷紧', intent: '迫使众人选择',
        status: 'armed', priority: 4, locked: false,
        prerequisiteLedgerFacts: [], prerequisiteBeatIds: [], triggerConditions: ['众人触碰账簿'],
        externalPressure: ['红线收紧'], revealCandidates: ['红线连接名字'], exitConditions: ['作出决定'],
        fallbackOptions: ['留下标记'], resolvedByEventRefs: [],
      }],
      foreshadows: [{
        id: 'foreshadow-ink', title: '银色墨迹', narrativePurpose: '提示执笔者仍在附近',
        status: 'planned', seedCandidates: ['窗边墨点'], intendedPayoff: '定位执笔者',
        revealConditions: ['月光照到账簿'], earliestBeatId: 'beat-thread', latestBeatId: 'beat-thread',
        ambiguityNotes: ['也可能是旧墨'], dependencyIds: [], plantedEventRefs: [], payoffEventRefs: [],
        locked: false,
      }],
      mysteries: [{
        id: 'mystery-fourth', question: '第四个名字属于谁？', status: 'open', answerIntent: '',
        evidenceEventRefs: [], locked: false,
      }],
      clocks: [{
        id: 'clock-thread', title: '红线断裂', progress: 0, limit: 4, trigger: '每次错误触碰',
        consequence: '账簿吞没一个名字', status: 'active', locked: false,
      }],
    }, '测试初始化')

    const rendered = await toolDirector.renderDirectorContext(ctx, story)
    expect(rendered).toContain('只有导演知道的世界真相')
    expect(rendered).toContain('以克制的都市奇幻笔触推进')
    expect(rendered).toContain('账簿翻开，第四行仍是空白。')
    const outlineIndex = rendered.indexOf('[DIRECTOR OUTLINE — PRIVATE')
    expect(outlineIndex).toBeLessThan(rendered.indexOf('[PLOT LEDGER'))
    const outlineText = rendered.slice(outlineIndex, rendered.indexOf('[PLOT LEDGER'))
    expect(outlineText).toContain('测试长期意图')
    expect(outlineText).toContain('"tool_input_base"')
    expect(outlineText).toContain('"expected_revision": 1')
    expect(outlineText).toContain('"hard_constraints"')
    expect(outlineText).toContain('"desired_questions"')
    expect(outlineText).toContain('"prerequisite_ledger_facts"')
    expect(outlineText).toContain('"narrative_purpose"')
    expect(outlineText).toContain('"answer_intent"')
    expect(outlineText).toContain('"clock-thread"')
    expect(outlineText).toContain('"read_only_governance"')
    expect(outlineText).not.toContain('"pendingSuggestions"')
    expect(outlineText).not.toContain('"history"')
    expect(outlineText).not.toContain('"source"')
    expect(outlineText).not.toContain('"locked"')
    expect(rendered).toContain('[导演简短思维链]')
  })

  it('keeps unapproved Director originals beyond the recent minimum without exposing the perception ledger', async () => {
    const { ctx } = await harness([])
    const story = await ctx.storyRegistry.create('导演世界投影')
    await installStorybook(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-world-projection'), { provider: 'mock', model: 'mock' })
    const actor = ctx.agentLoop.create(SessionId('actor-world-projection'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    await ctx.storyRegistry.attachSession(story.id, actor.session.id, 'actor', 'shadowheart')
    await stageTestScene(ctx, story.id)
    for (let index = 1; index <= 5; index += 1) {
      await ctx.storyRegistry.narrate(story.id, {
        expectedWorldRevision: story.world.revision,
        sourceEventRef: `projection-${String(index)}`,
        summary: `世界投影事件-${String(index)}`,
        audience: ['shadowheart'],
        patch: [],
      })
    }

    const rendered = await toolDirector.renderDirectorContext(ctx, story, { directorRecentEventLimit: 2, contextBatchSize: 1 })
    const worldStart = rendered.indexOf('[WORLD STATE')
    const worldTail = rendered.slice(worldStart)
    const worldEnd = worldTail.indexOf('\n\n[', 1)
    const world = worldEnd === -1 ? worldTail : worldTail.slice(0, worldEnd)
    expect(world).toContain('世界投影事件-4')
    expect(world).toContain('世界投影事件-5')
    expect(world).toContain('世界投影事件-1')
    expect(world).toContain('"archived": 0')
    expect(world).not.toContain('"perceptions"')
    expect(world).not.toContain('"sourceEventId"')
  })

  it('retains all unreviewed discussion sources once in chronological order', async () => {
    const { ctx } = await harness([])
    const story = await ctx.storyRegistry.create('讨论投影')
    await installStorybook(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-discussion-projection'), { provider: 'mock', model: 'mock' })
    const shadowheart = ctx.agentLoop.create(SessionId('actor-discussion-projection-shadowheart'), { provider: 'mock', model: 'mock' })
    const astarion = ctx.agentLoop.create(SessionId('actor-discussion-projection-astarion'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    await ctx.storyRegistry.attachSession(story.id, shadowheart.session.id, 'actor', 'shadowheart')
    await ctx.storyRegistry.attachSession(story.id, astarion.session.id, 'actor', 'astarion')
    await stageTestScene(ctx, story.id, ['shadowheart', 'astarion'])
    let changed = await ctx.storyRegistry.startDiscussion(story.id, {
      expectedRevision: 0,
      topic: '怎样处置账簿？',
      participantIds: ['shadowheart', 'astarion'],
      maxRounds: 10,
    })
    const discussionId = changed.discussions.discussions[0]?.id
    if (discussionId === undefined) throw new Error('expected discussion')
    for (const actorId of ['shadowheart', 'astarion']) {
      changed = await ctx.storyRegistry.updateDiscussionParticipantIntent(
        story.id,
        changed.discussions.revision,
        discussionId,
        actorId,
        { stance: `${actorId}的立场`, eagerness: 'medium', action: 'pass' },
      )
    }
    for (let index = 1; index <= 5; index += 1) {
      const discussion = changed.discussions.discussions[0]
      const speakerId = discussion?.currentSpeakerId
      if (speakerId === undefined) throw new Error('expected current discussion speaker')
      changed = await ctx.storyRegistry.recordDiscussionTurn(story.id, {
        expectedRevision: changed.discussions.revision,
        discussionId,
        speakerId,
        text: `讨论发言-${String(index)}-${speakerId}`,
        action: 'speak',
      })
    }

    const rendered = await toolDirector.renderDirectorContext(ctx, story, { discussionRecentTurnLimit: 2 })
    const discussionStart = rendered.indexOf('[DURABLE GROUP DISCUSSION]')
    const discussionText = rendered.slice(discussionStart)
    for (const index of [1, 2, 3, 4, 5]) expect(rendered).toContain(`讨论发言-${String(index)}-`)
    expect(rendered.indexOf('讨论发言-1-')).toBeLessThan(rendered.indexOf('讨论发言-5-'))
    expect(discussionText).not.toContain('讨论发言-1-')

  })

  it('keeps unreviewed Actor perceptions while retaining the current brief and private state', async () => {
    const { ctx, adapter } = await harness([
      toolCallResponse('brief-bounded-actor', 'director_commit_brief', {
        expected_ledger_revision: 0,
        situation: '账簿仍在桌面。',
        actor_briefs: [{
          actor_id: 'shadowheart',
          perceptions: ['这是仅属于当前调度的观察。'],
          uncertainties: ['红线下一刻是否会收紧。'],
        }],
      }),
      narration('narrate-bounded-actor', 5),
      toolCallResponse('dispatch-bounded-actor', 'director_dispatch_actors', {}),
      toolCallResponse('commit-bounded-actor', 'npc_commit_turn', {
        behavior: [], turning_points: [], posture: 'watching',
      }),
    ], { actorRecentPerceptionLimit: 2, contextBatchSize: 1 })
    const story = await ctx.storyRegistry.create('演员主观投影')
    await installStorybook(ctx, story.id)
    await installMinimalOutline(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-bounded-actor'), { provider: 'mock', model: 'mock' })
    const actor = ctx.agentLoop.create(SessionId('actor-bounded-actor'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    await ctx.storyRegistry.attachSession(story.id, actor.session.id, 'actor', 'shadowheart')
    ctx.actors.bind(actor, {
      id: ActorId('shadowheart'),
      displayName: '影心',
      persona: '克制、警惕记忆操控的牧师。',
      capabilities: ['speak', 'act', 'reflect', 'memory', 'goals', 'schedule'],
    })
    ctx.actors.speak(actor, {
      text: '这句没有进入世界投影的私密低语必须由影心自己记得。',
      audience: ['astarion'],
      delivery: 'whispered',
    })
    await stageTestScene(ctx, story.id)
    for (let index = 1; index <= 4; index += 1) {
      await ctx.storyRegistry.narrate(story.id, {
        expectedWorldRevision: story.world.revision,
        sourceEventRef: `actor-history-${String(index)}`,
        summary: `演员旧感知-${String(index)}`,
        audience: ['shadowheart'],
        patch: [],
      })
    }

    director.followup(createUserMessage({
      content: [{ type: 'text', text: '【旁观推进】' }], source: { kind: 'user' },
    }))
    await director.whenIdle()

    const request = adapter.requests.find(item => item.sessionId === actor.session.id)
    if (request === undefined) throw new Error('expected Actor request')
    const context = request.messages.flatMap(message => message.content.flatMap(block => (
      block.type === 'text' ? [block.text] : []
    ))).join('\n')
    expect(context).toContain('moonshadow-private-room')
    expect(context).toContain('雨势增强，账簿自行翻过一页。')
    expect(context).toContain('演员旧感知-1')
    expect(context).toContain('"archived": 0')
    expect(context).toContain('这是仅属于当前调度的观察。')
    expect(context).not.toContain('deliveredPerceptions')
    expect(context).toContain('perception-')
    expect(context).toContain('recentSelfSpeech')
    expect(context).toContain('这句没有进入世界投影的私密低语必须由影心自己记得。')
    expect(context).not.toContain('ALREADY ACCEPTED EVENTS IN THIS DIRECTOR RUN')
  })

  it('keeps a large Storybook dormant and provisions only present spotlight Actors', async () => {
    const { ctx } = await harness([])
    const story = await ctx.storyRegistry.create('群像调度')
    await installStorybook(ctx, story.id)
    await installMinimalOutline(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-ensemble'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    await stageTestScene(ctx, story.id, ['shadowheart', 'astarion', 'ensemble-1'])

    const absent = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('brief-absent-ensemble'),
      name: 'director_commit_brief',
      agent: director,
      arguments: {
        expected_ledger_revision: 0,
        situation: '三人在包厢观察账簿。',
        actor_briefs: [{
          actor_id: 'ensemble-2',
          perceptions: ['远处似乎有人翻动账簿。'],
          uncertainties: ['声音来源。'],
        }],
      },
    })
    expect(absent.isError).toBe(true)
    expect(story.sessions.filter(session => session.role === 'actor')).toEqual([])

    const committed = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('brief-present-spotlight'),
      name: 'director_commit_brief',
      agent: director,
      arguments: {
        expected_ledger_revision: 0,
        situation: '三人在包厢观察账簿。',
        actor_briefs: [{
          actor_id: 'shadowheart',
          perceptions: ['红线正在轻微颤动。'],
          uncertainties: ['颤动是否来自魔法。'],
        }],
      },
    })
    expect(committed.isError).toBe(false)
    expect(story.sessions.filter(session => session.role === 'actor').map(session => session.actorId))
      .toEqual(['shadowheart'])
  })

  it('keeps low-frequency story context cacheable and verbose player control turn-local', async () => {
    const { ctx, adapter } = await harness([textResponse('恢复请求已收到。')])
    const story = await ctx.storyRegistry.create('缓存与回合指令')
    await installStorybook(ctx, story.id)
    await installMinimalOutline(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-cache-directive'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')

    director.followup(createUserMessage({
      content: [{ type: 'text', text: '【恢复推进】只恢复未完成角色。' }],
      source: { kind: 'user' },
    }))
    await director.whenIdle()

    const request = adapter.requests[0]
    if (request === undefined) throw new Error('expected Director request')
    const textAt = (needle: string): number => request.messages.findIndex(message => (
      message.content.some(block => block.type === 'text' && block.text.includes(needle))
    ))
    expect(textAt('[DIRECTOR OUTLINE — PRIVATE')).toBeLessThan(textAt('【恢复推进】只恢复未完成角色。'))
    expect(textAt('[WORLD STATE')).toBeLessThan(textAt('【恢复推进】只恢复未完成角色。'))
    expect(JSON.stringify(request.messages)).toContain('[TURN-LOCAL PLAYER CONTROL: RESUME]')
    const durable = JSON.stringify(director.session.deriveMessages())
    expect(durable).toContain('【恢复推进】只恢复未完成角色。')
    expect(durable).not.toContain('[TURN-LOCAL PLAYER CONTROL: RESUME]')
    expect(durable).toContain('只恢复未完成角色。')
  })

  it('repairs a prose-only Director completion with authoritative narration', async () => {
    const { ctx } = await harness([
      textResponse('雨声仍在继续。'),
      toolCallResponse('brief-repair', 'director_commit_brief', {
        expected_ledger_revision: 0,
        situation: '账簿在雨声里保持翻开。',
        actor_briefs: [{
          actor_id: 'shadowheart',
          perceptions: ['雨声变密，账簿仍然摊开。'],
          uncertainties: ['第四行是否即将显字。'],
        }],
      }),
      toolCallResponse('narrate-repair', 'director_narrate', {
        expected_world_revision: 1,
        text: '雨点骤然变密，空白的第四行洇开一小团墨迹。',
        summary: '第四行出现墨迹。',
        audience_actor_ids: [], perceptions: [].map(actorId => ({ actorId, content: '雨势增强，账簿自行翻过一页。' })),
        patch: [],
      }),
      textResponse(''),
    ])
    const story = await ctx.storyRegistry.create('旁白修复')
    await installStorybook(ctx, story.id)
    await installMinimalOutline(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-narration-repair'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    await stageTestScene(ctx, story.id)

    director.followup(createUserMessage({
      content: [{ type: 'text', text: '我检查账簿的第四行。' }],
      source: { kind: 'user' },
    }))
    await director.whenIdle()

    expect(director.session.events.find(event => event.type === 'story/director-narration-projected'))
      .toMatchObject({ data: { content: '雨点骤然变密，空白的第四行洇开一小团墨迹。' } })
  })

  it('does not count a failed dispatch as completed spectate advancement', async () => {
    const { ctx } = await harness([
      toolCallResponse('dispatch-too-early', 'director_dispatch_actors', {}),
      textResponse('调度已经完成。'),
      toolCallResponse('brief-after-failed-dispatch', 'director_commit_brief', {
        expected_ledger_revision: 0,
        situation: '影心观察账簿上的红线。',
        actor_briefs: [{
          actor_id: 'shadowheart',
          perceptions: ['红线正在绷紧。'],
          uncertainties: ['红线连接着什么。'],
        }],
      }),
      narration('narrate-after-failed-dispatch'),
      toolCallResponse('dispatch-after-repair', 'director_dispatch_actors', {}),
      toolCallResponse('actor-after-repair', 'npc_commit_turn', {
        behavior: [], turning_points: [], posture: 'watching',
      }),
    ])
    const story = await ctx.storyRegistry.create('失败调度纠偏')
    await installStorybook(ctx, story.id)
    await installMinimalOutline(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-failed-dispatch-repair'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    await stageTestScene(ctx, story.id)

    director.followup(createUserMessage({
      content: [{ type: 'text', text: '【旁观推进】' }], source: { kind: 'user' },
    }))
    await director.whenIdle()

    expect(story.plotLedger.directorRun).toMatchObject({ status: 'completed' })
    const hostMessages = director.session.events.filter(event => (
      event.type === 'user/message' && event.data.source.kind === 'plugin'
    ))
    expect(hostMessages.some(event => event.type === 'user/message'
      && event.data.content.some(block => block.type === 'text'
        && block.text.includes('[HOST ADVANCEMENT CONTINUATION]')))).toBe(true)
  })

  it.each([false, true])('projects accepted behavior and child billing with repair=%s', async (repair) => {
    const { ctx, adapter } = await harness([
      toolCallResponse('brief-1', 'director_commit_brief', {
        expected_ledger_revision: 0,
        situation: '账簿在桌上自行翻开。',
        actor_briefs: [{
          actor_id: 'shadowheart',
          perceptions: ['账簿自行翻开，红线仍系在封面。'],
          uncertainties: ['弥菈是否听见同样的低语。'],
        }],
      }),
      narration('narrate-1'),
      toolCallResponse('dispatch-1', 'director_dispatch_actors', {}),
      ...repair ? [toolCallResponse('wrapped-commit', 'npc_commit_turn', {
        arguments: JSON.stringify({ posture: 'watching', behavior: [] }),
      })] : [],
      toolCallResponse('commit-1', 'npc_commit_turn', {
        behavior: [{
          kind: 'speech', text: '别碰它。', to: [],
          delivery: 'spoken', tone: '低沉', intent: 'command',
        }],
        turning_points: [],
        posture: 'watching',
      }),
    ].map(chunks => chunks.map(chunk => chunk.type === 'usage' ? {
      type: 'usage' as const,
      usage: { inputTokens: 10, cacheReadTokens: 5, cacheWriteTokens: 0, outputTokens: 5, totalTokens: 20 },
    } : chunk)))
    const story = await ctx.storyRegistry.create('月影账簿')
    await installStorybook(ctx, story.id)
    await installMinimalOutline(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-moonshadow'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    await stageTestScene(ctx, story.id)

    director.followup(createUserMessage({
      content: [{ type: 'text', text: '【旁观推进】让角色自行回应。' }],
      source: { kind: 'user' },
    }))
    await director.whenIdle()

    const actorRegistration = story.sessions.find(item => item.role === 'actor')
    expect(actorRegistration).toMatchObject({ actorId: 'shadowheart' })
    const actor = actorRegistration === undefined ? undefined : ctx.agents.get(actorRegistration.sessionId)
    if (actor === undefined) throw new Error('expected live Actor')
    const actorRequests = adapter.requests.filter(request => request.sessionId === actor.session.id)
    expect(actorRequests).toHaveLength(repair ? 2 : 1)
    const actorContext = JSON.stringify(actorRequests[0]?.messages)
    expect(actorContext).toContain('红线来自莎尔旧仪式')
    expect(actorContext).toContain('短句、冷峻反问')
    expect(actorContext).not.toContain('只有导演知道的世界真相')
    expect(actorContext).not.toContain('DIRECTOR OUTLINE')

    expect(story.plotLedger.pendingNpcEvents).toEqual([expect.objectContaining({
      kind: 'speech', actorId: 'shadowheart', text: '别碰它。',
    })])
    expect(story.world.events.find(event => event.kind === 'actor-speech'))
      .toMatchObject({ status: 'established', actorId: 'shadowheart' })
    expect(director.session.events.find(event => event.type === 'story/actor-attempt-settled'))
      .toMatchObject({ data: { events: [expect.objectContaining({ kind: 'speech', text: '别碰它。' })] } })
    const directorRequests = adapter.requests.filter(request => request.sessionId === director.id)
    expect(directorRequests).toHaveLength(3)
    const directorMessages = JSON.stringify(directorRequests[0]?.messages)
    expect(directorMessages).toContain('只有导演知道的世界真相')
    const directorTools = directorRequests[0]?.tools ?? []
    expect(directorTools.find(tool => tool.name === 'director_update_outline')?.description)
      .toContain('tool_input_base')
    expect(directorTools.find(tool => tool.name === 'director_commit_brief')?.description)
      .toContain('exactly actor_id, perceptions, and uncertainties')
    expect(directorTools.find(tool => tool.name === 'director_start_discussion')?.description)
      .toContain('bare spectate-advancement request or an opening scene does not by itself require a discussion')
    expect(director.session.events.find(event => event.type === 'story/director-narration-projected'))
      .toMatchObject({ data: { content: '雨声骤然压低。\n\n**账簿**在桌面上翻过一页。' } })
    expect(story.plotLedger.directorRun).toMatchObject({
      status: 'completed',
      actors: [{ actorId: 'shadowheart', status: 'completed', attempts: 1 }],
    })
    const billings = director.session.events.filter(event => event.type === 'token-meter/child-turn-usage')
    expect(billings).toHaveLength(1)
    expect(billings[0]).toMatchObject({ data: {
      turn: 1, childSessionId: actor.session.id, childTurn: 1,
      usage: { totalTokens: repair ? 40 : 20, cacheReadTokens: repair ? 10 : 5 },
    } })
    const start = director.session.events.find(event => event.type === 'turn/start')
    expect(start).toBeDefined()
    const billedTurn = director.session.events.slice(start?.seq)
    const expected = { totalTokens: repair ? 100 : 80, cacheReadTokens: repair ? 25 : 20 }
    expect(deriveTurnTokenUsage(billedTurn)).toMatchObject(expected)
    expect(deriveTurnTokenUsage(JSON.parse(JSON.stringify(billedTurn)) as SessionEvent[])).toMatchObject(expected)
  })

  it('accepts an explicitly committed empty Actor behavior as silence', async () => {
    const { ctx } = await harness([
      toolCallResponse('brief-silent', 'director_commit_brief', {
        expected_ledger_revision: 0,
        situation: '影心听见同伴讨论账簿上的旧结法。',
        actor_briefs: [{
          actor_id: 'shadowheart',
          perceptions: ['同伴正在等待她亮出更多底牌。'],
          uncertainties: ['现在开口是否会泄露太多。'],
        }],
      }),
      narration('narrate-silent'),
      toolCallResponse('dispatch-silent', 'director_dispatch_actors', {}),
      textResponse('（心想：现在保持沉默更有利。）'),
      toolCallResponse('commit-silent', 'npc_commit_turn', {
        turning_points: [],
        behavior: [],
        posture: 'silent',
      }),
    ])
    const story = await ctx.storyRegistry.create('沉默也是选择')
    await installStorybook(ctx, story.id)
    await installMinimalOutline(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-implicit-silence'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    await stageTestScene(ctx, story.id)

    director.followup(createUserMessage({
      content: [{ type: 'text', text: '【旁观推进】让角色自行判断是否回应。' }],
      source: { kind: 'user' },
    }))
    await director.whenIdle()

    const registration = story.sessions.find(item => item.actorId === 'shadowheart')
    const actor = registration === undefined ? undefined : ctx.agents.get(registration.sessionId)
    expect((actor === undefined ? undefined : actorOperationEvents(actor.session.events).findLast(event => event.type === 'actor/turn-closed')))
      .toMatchObject({ data: { reason: 'yield', posture: 'silent' } })
    expect(story.plotLedger.pendingNpcEvents).toEqual([])
    expect(story.plotLedger.directorRun).toMatchObject({
      status: 'completed',
      actors: [{ actorId: 'shadowheart', status: 'completed', attempts: 1 }],
    })
  })

  it('automatically establishes accepted action attempts without inferring consequences', async () => {
    const { ctx } = await harness([
      toolCallResponse('brief-action', 'director_commit_brief', {
        expected_ledger_revision: 0,
        situation: '账簿在桌上自行翻开。',
        actor_briefs: [{
          actor_id: 'shadowheart',
          perceptions: ['红线近在手边。'],
          uncertainties: ['触碰是否会触发术式。'],
        }],
      }),
      narration('narrate-action'),
      toolCallResponse('dispatch-action', 'director_dispatch_actors', {}),
      toolCallResponse('commit-action', 'npc_commit_turn', {
        behavior: [{
          kind: 'action', attempt: '伸手靠近红线，在触及前停下',
          target: '账簿封面的红线',
        }],
        turning_points: [],
        posture: 'watching',
      }),
    ])
    const story = await ctx.storyRegistry.create('自动确立行动尝试')
    await installStorybook(ctx, story.id)
    await installMinimalOutline(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-auto-action'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    await stageTestScene(ctx, story.id)

    director.followup(createUserMessage({
      content: [{ type: 'text', text: '【旁观推进】让影心自行判断。' }],
      source: { kind: 'user' },
    }))
    await director.whenIdle()

    const actionEvent = story.world.events.find(event => event.kind === 'actor-action')
    expect(actionEvent).toMatchObject({
      status: 'established',
      actorId: 'shadowheart',
      patch: [],
      audience: ['shadowheart'],
    })
    expect(actionEvent?.summary).toContain('attempts: 伸手靠近红线')
    expect(story.world.facts).not.toHaveProperty('redThreadTouched')
  })

  it('resumes only failed Actors without duplicating Briefs', async () => {
    const { ctx, adapter } = await harness([
      toolCallResponse('brief-retry', 'director_commit_brief', {
        expected_ledger_revision: 0,
        situation: '账簿在桌上自行翻开。',
        actor_briefs: [{
          actor_id: 'shadowheart',
          perceptions: ['账簿自行翻开，红线仍系在封面。'],
          uncertainties: ['低语来自哪里。'],
        }],
      }),
      narration('narrate-retry'),
      toolCallResponse('dispatch-retry-1', 'director_dispatch_actors', {}),
      textResponse('我暂时无法继续。'),
      textResponse('仍然无法提交。'),
      toolCallResponse('dispatch-retry-2', 'director_dispatch_actors', {}),
      toolCallResponse('commit-retry-2', 'npc_commit_turn', {
        behavior: [], turning_points: [], posture: 'watching',
      }),
    ])
    const story = await ctx.storyRegistry.create('月影账簿')
    await installStorybook(ctx, story.id)
    await installMinimalOutline(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-retry'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    await stageTestScene(ctx, story.id)

    director.followup(createUserMessage({
      content: [{ type: 'text', text: '【旁观推进】' }], source: { kind: 'user' },
    }))
    await director.whenIdle()
    expect(story.plotLedger.directorRun).toMatchObject({
      briefLedgerRevision: 1,
      status: 'awaiting_retry',
      actors: [{ actorId: 'shadowheart', status: 'failed', attempts: 1 }],
    })
    expect(director.session.events.filter(event => event.type === 'story/npc-event-projected'))
      .toHaveLength(0)

    director.followup(createUserMessage({
      content: [{ type: 'text', text: '【恢复推进】只恢复未完成角色。' }], source: { kind: 'user' },
    }))
    await director.whenIdle()

    expect(story.plotLedger.revision).toBe(1)
    expect(story.plotLedger.latestBrief?.ledgerRevision).toBe(1)
    expect(story.plotLedger.directorRun).toMatchObject({
      briefLedgerRevision: 1,
      status: 'completed',
      actors: [{ actorId: 'shadowheart', status: 'completed', attempts: 2 }],
    })
    expect(director.session.events.filter(event => event.type === 'story/npc-event-projected'))
      .toHaveLength(0)
    const actorSessionId = story.sessions.find(item => item.role === 'actor')?.sessionId
    const actorRequests = adapter.requests.filter(request => request.sessionId === actorSessionId)
    expect(actorRequests).toHaveLength(3)
    expect(JSON.stringify(actorRequests[1]?.messages)).toContain('我暂时无法继续。')
    const resumedActorRequest = JSON.stringify(actorRequests[2]?.messages)
    expect(resumedActorRequest).toContain('[ACTOR DISPATCH]')
    expect(resumedActorRequest).not.toContain('我暂时无法继续。')
    expect(resumedActorRequest).not.toContain('仍然无法提交。')
    const resumedDirectorRequest = JSON.stringify(
      adapter.requests.filter(request => request.sessionId === director.session.id).at(-1)?.messages,
    )
    expect(resumedDirectorRequest).toContain('[TURN-LOCAL PLAYER CONTROL: RESUME]')
    expect(resumedDirectorRequest).not.toContain('brief-retry')
    expect(resumedDirectorRequest).not.toContain('dispatch-retry-1')
  })

  it('rewrites Actor history without exposing the reroll or retaining superseded private state', async () => {
    const brief = (id: string) => toolCallResponse(id, 'director_commit_brief', {
      expected_ledger_revision: 0,
      situation: '账簿在桌上自行翻开。',
      actor_briefs: [{
        actor_id: 'shadowheart',
        perceptions: ['账簿自行翻开，红线仍系在封面。'],
        uncertainties: ['弥菈是否听见同样的低语。'],
      }],
    })
    const actorTurn = (id: string, thought: string, speech: string) => () => toolCallResponse(id, 'npc_commit_turn', {
      thoughts: [{ content: thought, about: ['账簿'] }],
      behavior: [{ kind: 'speech', text: speech, to: [], intent: 'sincere' }],
      turning_points: [],
      posture: 'watching',
    })
    const { ctx, adapter } = await harness([
      brief('brief-original'),
      narration('narrate-original'),
      toolCallResponse('dispatch-original', 'director_dispatch_actors', {}),
      actorTurn('actor-original', '我已经回答过这个问题。', '这是被撤销分支里的回答。'),
      brief('brief-rewritten'),
      narration('narrate-rewritten'),
      toolCallResponse('dispatch-rewritten', 'director_dispatch_actors', {}),
      actorTurn('actor-rewritten', '我只知道此刻眼前发生的事。', '这是当前分支里的回答。'),
    ])
    const story = await ctx.storyRegistry.create('月影账簿')
    await installStorybook(ctx, story.id)
    await installMinimalOutline(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-rewrite-isolation'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    await stageTestScene(ctx, story.id)

    director.followup(createUserMessage({
      content: [{ type: 'text', text: '【旁观推进】第一次推进。' }], source: { kind: 'user' },
    }))
    await director.whenIdle()
    const firstPlayerSeq = director.session.events.find(event => (
      event.type === 'user/message' && event.data.source.kind === 'user'
    ))?.seq
    if (firstPlayerSeq === undefined) throw new Error('expected first player message')

    await agentEvents(ctx, director).serial('agent/history-rewrite', { beforeSeq: firstPlayerSeq })
    director.followup(createUserMessage({
      content: [{ type: 'text', text: '【旁观推进】重新推进。' }],
      source: { kind: 'user', rewriteBeforeSeq: firstPlayerSeq } as never,
    }))
    await director.whenIdle()

    const actorRegistration = story.sessions.find(item => item.role === 'actor')
    const actor = actorRegistration === undefined ? undefined : ctx.agents.get(actorRegistration.sessionId)
    if (actor === undefined) throw new Error('expected live Actor')
    const requests = adapter.requests.filter(request => request.sessionId === actor.session.id)
    expect(requests).toHaveLength(2)
    const rewrittenRequest = JSON.stringify(requests[1])
    expect(rewrittenRequest).not.toContain('STORY TURN REWIND')
    expect(rewrittenRequest).not.toContain('superseded')
    expect(rewrittenRequest).not.toContain('我已经回答过这个问题')
    expect(rewrittenRequest).not.toContain('这是被撤销分支里的回答')

    const state = foldActor(actor.session.events)
    expect(state.thoughts.map(item => item.content)).toEqual(['我只知道此刻眼前发生的事。'])
    expect(state.expressions.map(item => item.text)).toEqual(['这是当前分支里的回答。'])
    const activeOriginals = await Promise.all(story.world.context.sources.map(source => sourceText(ctx, story, source)))
    expect(activeOriginals.join('\n')).not.toContain('这是被撤销分支里的回答')
    expect(activeOriginals.join('\n')).not.toContain('第一次推进。')
    expect(activeOriginals.join('\n')).toContain('这是当前分支里的回答。')
  })

  it('bounds retained turn checkpoints and rejects an unavailable non-initial rewrite', async () => {
    const { ctx } = await harness([
      textResponse('第一回合已处理。'),
      textResponse('第二回合已处理。'),
      textResponse('第三回合已处理。'),
      textResponse('第四回合已处理。'),
    ], { storyTurnCheckpointLimit: 2 })
    const story = await ctx.storyRegistry.create('检查点保留上限')
    await installStorybook(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-checkpoint-limit'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')

    for (const text of ['第一回合', '第二回合', '第三回合', '第四回合']) {
      director.followup(createUserMessage({
        content: [{ type: 'text', text }], source: { kind: 'user' },
      }))
      await director.whenIdle()
    }

    const userMessageSeqs = director.session.events
      .filter(event => event.type === 'user/message' && event.data.source.kind === 'user')
      .map(event => event.seq)
    const checkpointFile = JSON.parse(await readFile(
      ctx.storyHome.storyPath(story.id, '.runtime', 'turn-checkpoints.json'),
      'utf8',
    )) as { entries: Array<{ userMessageSeq: number }> }
    expect(checkpointFile.entries.map(entry => entry.userMessageSeq)).toEqual(userMessageSeqs.slice(-2))

    await expect(agentEvents(ctx, director).serial('agent/history-rewrite', {
      beforeSeq: userMessageSeqs[1]!,
    })).rejects.toThrow('Story rewrite checkpoint for user message seq')
  })

  it('composes durable memory proposals and discussion ownership through Director tools', async () => {
    const { ctx } = await harness([
      toolCallResponse('memory-1', 'director_propose_memory', {
        expected_memory_revision: 0,
        kind: 'scene',
        title: '空白第四行',
        director_summary: '账簿自行翻到仍为空白的第四行。',
        public_summary: '账簿自行翻到仍为空白的第四行。',
        actor_memories: [{ actor_id: 'shadowheart', note: '影心怀疑红线连接着旧仪式。' }],
        event_refs: [],
      }),
      toolCallResponse('discussion-1', 'director_start_discussion', {
        expected_discussion_revision: 0,
        topic: '是否应当剪断红线？',
        participant_ids: ['shadowheart', 'astarion'],
      }),
      textResponse('等待影心取得发言权。'),
    ])
    const story = await ctx.storyRegistry.create('月影账簿')
    await installStorybook(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-operations'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    const shadowheart = ctx.agentLoop.create(SessionId('actor-operations-shadowheart'), { provider: 'mock', model: 'mock' })
    const astarion = ctx.agentLoop.create(SessionId('actor-operations-astarion'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, shadowheart.session.id, 'actor', 'shadowheart')
    await ctx.storyRegistry.attachSession(story.id, astarion.session.id, 'actor', 'astarion')
    await stageTestScene(ctx, story.id, ['shadowheart', 'astarion'])

    director.followup(createUserMessage({
      content: [{ type: 'text', text: '建立摘要提案并开始讨论。' }], source: { kind: 'user' },
    }))
    await director.whenIdle()

    expect(story.memory.entries).toEqual([expect.objectContaining({
      status: 'proposed', title: '空白第四行', proposedBy: 'director',
    })])
    expect(story.discussions.discussions).toEqual([expect.objectContaining({
      status: 'active', preparationPendingIds: ['shadowheart', 'astarion'], participantIds: ['shadowheart', 'astarion'],
      maxRounds: 4,
    })])
    const prerequisiteContinuation = director.session.events.find(event => (
      event.type === 'user/message' && event.data.source.kind === 'plugin'
      && event.data.content.some(block => block.type === 'text'
        && block.text.includes('[HOST DISCUSSION CONTINUATION]'))
    ))
    const prerequisiteText = prerequisiteContinuation?.type === 'user/message'
      ? prerequisiteContinuation.data.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
      : ''
    expect(prerequisiteText).toContain('Actor dispatch prerequisites are incomplete')
    expect(prerequisiteText).toContain(`expected_ledger_revision=${String(story.plotLedger.revision)}`)
    expect(prerequisiteText).toContain(`expected_world_revision=${String(story.world.revision)}`)
    const rendered = await toolDirector.renderDirectorContext(ctx, story)
    expect(rendered).toContain('\"turnBudget\": 8')
    expect(rendered).toContain('\"turnsRemaining\": 8')
    expect(rendered).toContain('\"phase\": \"preparing\"')
  })

  it('cancels the running Actor attempt and keeps its checkpoint free of late events', async () => {
    const { ctx, adapter } = await harness([{ hangAfter: [{
      type: 'usage', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 20, cacheReadTokens: 5 },
    }] }])
    const story = await ctx.storyRegistry.create('月影账簿')
    await installStorybook(ctx, story.id)
    const director = ctx.agentLoop.create(SessionId('scene-cancel'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    const actor = ctx.agentLoop.create(SessionId('actor-cancel'), { provider: 'mock', model: 'mock' })
    await ctx.storyRegistry.attachSession(story.id, actor.session.id, 'actor', 'shadowheart')
    await stageTestScene(ctx, story.id)
    await ctx.storyRegistry.commitDirectorBrief(story.id, director.id, {
      expectedLedgerRevision: 0,
      sceneSessionId: director.session.id,
      situation: '账簿停在空白的第四行。',
      establishedFacts: ['影心正在观察账簿。'],
      openThreads: ['红线是否会自行松开。'],
      actorBriefs: [{
        actorId: 'shadowheart',
        perceptions: ['红线轻微颤动。'],
        uncertainties: ['颤动是否来自魔法。'],
      }],
    })
    const initialRun = story.plotLedger.directorRun
    if (initialRun === undefined) throw new Error('expected committed Director Run')

    director.session.append('turn/start', { turn: 1 })
    director.session.append('step/start', { turn: 1, step: 1 })
    const dispatch = ctx.directorRuns.resume(story.id, initialRun.revision)
    await vi.waitFor(() => {
      expect(story.plotLedger.directorRun?.actors[0]).toMatchObject({ status: 'running', attempts: 1 })
      expect(adapter.requests).toHaveLength(1)
    })
    const runningRun = story.plotLedger.directorRun
    if (runningRun === undefined) throw new Error('expected running Director Run')
    await ctx.directorRuns.cancelActor(story.id, runningRun.revision, 'shadowheart')
    await dispatch

    expect(story.plotLedger.directorRun).toMatchObject({
      status: 'awaiting_retry',
      actors: [{ actorId: 'shadowheart', status: 'cancelled', attempts: 1, eventRefs: [] }],
    })
    expect(story.plotLedger.pendingNpcEvents).toEqual([])
    expect(director.session.events.some(event => event.type === 'story/npc-event-projected')).toBe(false)
    expect(director.session.events.find(event => event.type === 'token-meter/child-turn-usage'))
      .toMatchObject({ data: { turn: 1, childSessionId: actor.session.id, usage: { totalTokens: 20 } } })
  })
})

it('releases the narrative perspective provider when Director integration is disposed', async () => {
  const { ctx, directorPlugin } = await harness([])
  expect(ctx.get('actorNarrative')).toBeDefined()
  await directorPlugin.dispose()
  expect(ctx.get('actorNarrative')).toBeUndefined()
  await ctx.plugin(toolDirector)
  expect(ctx.get('actorNarrative')).toBeDefined()
})
