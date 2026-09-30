import { npcEventRef } from '../src/director.ts'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import ActorService, { ActorId } from '@deepseek-ai/dsh-experimental-actor'
import * as ToolActor from '@deepseek-ai/dsh-experimental-tool-actor'
import { createAssistantMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import StoryHome from '@deepseek-ai/dsh-story-home'
import { MockAdapter, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import StoryRegistry, { DirectorRunAttemptId } from '../src/index.ts'

const contexts: Context[] = []
const roots: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function harness() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-story-director-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(new MemoryMediaPool()))
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  await ctx.plugin(StoryHome, { root })
  await ctx.plugin(StoryRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(ActorService)
  await ctx.plugin(ToolActor)
  const adapter = new MockAdapter([
    toolCallResponse('commit-call', 'npc_commit_turn', {
      behavior: [
        { kind: 'speech', text: '灯不是我点的。', to: ['门外的人'], delivery: 'spoken' },
        { kind: 'action', attempt: '把手按在生锈的门闩上。', target: '仓库门闩' },
      ], posture: 'waiting',
    }),
  ])
  ctx.llm.registerAdapter(['mock'], adapter)

  const story = await ctx.storyRegistry.create('雾港来信')
  const sceneSession = ctx.sessions.create(SessionId('director-scene'))
  await ctx.storyRegistry.attachSession(story.id, sceneSession.id, 'scene')
  const actor = ctx.agentLoop.create(SessionId('actor-lin'), { provider: 'mock', model: 'mock' })
  await ctx.storyRegistry.attachSession(story.id, actor.session.id, 'actor', 'lin')
  await ctx.storyRegistry.stageScene(story.id, {
    expectedWorldRevision: 0,
    sceneId: 'fog-harbor-warehouse',
    location: '旧码头仓库外',
    summary: '林岚独自在旧码头仓库外。',
    presentActorIds: ['lin'],
  })
  ctx.actors.bind(actor, {
    id: ActorId('lin'),
    displayName: '林岚',
    persona: '谨慎，不愿暴露自己害怕黑暗。',
    capabilities: ['speak', 'act', 'reflect'],
  })
  return { actor, ctx, sceneSession, story }
}

describe('Story Director to NPC Actor loop', () => {
  it('keeps approved facts and unresolved conditions when a new Brief omits them', async () => {
    const { ctx, sceneSession, story } = await harness()
    const original = story.world.events[0]!
    await ctx.storyRegistry.recordContext(story.id, [{ id: original.id, sceneId: 'fog-harbor-warehouse', kind: original.kind,
      scopes: ['director'], order: 0, locator: { kind: 'world', eventId: original.id } }], {
      scope: 'director', submissionId: 'approved-baseline', turnId: 'first-turn', units: [{
        sourceIds: [original.id], disposition: 'represented', reason: '保留场景事实与未决条件', changes: [
          { operation: 'add', kind: 'fact', text: '林岚守在仓库外。', sourceIds: [original.id] },
          { operation: 'add', kind: 'question', text: '仓库的钥匙由谁保管？', sourceIds: [original.id] },
        ],
      }],
    })
    await ctx.storyRegistry.reviewContext(story.id, [{ id: 'approved-baseline:0', revision: 1, approve: true }])
    for (let revision = 0; revision < 2; revision++) {
      await ctx.storyRegistry.commitDirectorBrief(story.id, sceneSession.id, {
        expectedLedgerRevision: revision, sceneSessionId: sceneSession.id, situation: '只更新本次局势。',
        establishedFacts: [], openThreads: [], actorBriefs: [{ actorId: 'lin', perceptions: ['看见仓库。'], uncertainties: [] }],
      })
      expect(story.plotLedger.establishedFacts).toEqual(['林岚守在仓库外。'])
      expect(story.plotLedger.openThreads).toEqual(['仓库的钥匙由谁保管？'])
    }
  })

  it('admits only NPC tool-backed speech and action to the durable Plot Ledger', async () => {
    const { actor, ctx, sceneSession, story } = await harness()
    await ctx.storyRegistry.commitDirectorBrief(story.id, sceneSession.id, {
      expectedLedgerRevision: 0,
      sceneSessionId: sceneSession.id,
      situation: '深夜的仓库门内亮着灯，林岚站在门外。',
      establishedFacts: ['林岚没有看见点灯的人。'],
      openThreads: ['仓库里是谁？'],
      actorBriefs: [{
        actorId: 'lin',
        perceptions: ['门缝有灯光，门闩生锈。'],
        uncertainties: ['灯光的来源。'],
      }],
    })
    sceneSession.append('turn/start', { turn: 1 })
    sceneSession.append('step/start', { turn: 1, step: 1 })
    sceneSession.append('assistant/message', {
      turn: 1,
      step: 1,
      message: createAssistantMessage({
        content: [{ type: 'text', text: '林岚说：“我进去。”随后推开了门。' }],
        source: { provider: 'mock', model: 'mock' },
      }),
    }, { surfaceOp: 'append' })
    await ctx.sessions.flush(sceneSession)
    expect(story.plotLedger).toMatchObject({ revision: 1, pendingNpcEvents: [] })

    const actorBrief = story.plotLedger.latestBrief?.actorBriefs[0]
    if (actorBrief === undefined) throw new Error('expected an Actor Brief')
    await ctx.storyRegistry.beginDirectorDispatch(story.id, sceneSession.id, 0, [{
      actorId: 'lin',
      attemptId: DirectorRunAttemptId('attempt-lin-1'),
      actorSessionId: actor.session.id,
      afterEventSeq: actor.session.events.at(-1)?.seq ?? -1,
    }])

    actor.followup(createUserMessage({
      content: [{ type: 'text', text: JSON.stringify(actorBrief) }],
      source: { kind: 'user' },
    }))
    await actor.whenIdle()
    await ctx.sessions.flush(actor.session)

    expect(story.sessions.find(item => item.sessionId === actor.session.id)?.actorStateRevision)
      .toBe(actor.session.events.findLast(event => event.type.startsWith('actor/'))?.seq)
    expect(story.plotLedger.revision).toBe(3)
    expect(story.plotLedger.pendingNpcEvents).toEqual([
      expect.objectContaining({
        kind: 'speech',
        actorId: 'lin',
        sessionId: actor.session.id,
        text: '灯不是我点的。',
      }),
      expect.objectContaining({
        kind: 'action-intent',
        actorId: 'lin',
        sessionId: actor.session.id,
        description: '把手按在生锈的门闩上。',
      }),
    ])
    expect(story.plotLedger.pendingNpcEvents.every(event =>
      event.toolCallEventSeq < event.actorEventSeq)).toBe(true)
    await ctx.storyRegistry.settleDirectorDispatch(story.id, sceneSession.id, [{
      actorId: 'lin',
      attemptId: DirectorRunAttemptId('attempt-lin-1'),
      generation: 1,
      status: 'completed',
      eventRefs: story.plotLedger.pendingNpcEvents.map(event =>
        npcEventRef(event)),
    }])
    expect(story.plotLedger.directorRun?.status).toBe('completed')

    expect(() => ctx.actors.speak(actor, { text: '这句绕过了 NPC 工具。' }))
      .toThrow(/has no matching open NPC tool call/)
    expect(() => ctx.actors.act(actor, { description: '这次行动也绕过了 NPC 工具。' }))
      .toThrow(/has no matching open NPC tool call/)
    await ctx.sessions.flush(actor.session)
    expect(story.plotLedger.revision).toBe(3)
    expect(story.plotLedger.pendingNpcEvents).toHaveLength(2)

    const beforePrivateState = story.sessions.find(item => item.sessionId === actor.session.id)?.actorStateRevision ?? 0
    ctx.actors.reflect(actor, { content: '门后的灯光不像油灯。' })
    await ctx.sessions.flush(actor.session)
    expect(story.sessions.find(item => item.sessionId === actor.session.id)?.actorStateRevision)
      .toBeGreaterThan(beforePrivateState)
    expect(story.plotLedger.revision).toBe(3)

    await ctx.storyRegistry.commitDirectorBrief(story.id, sceneSession.id, {
      expectedLedgerRevision: 3,
      sceneSessionId: sceneSession.id,
      situation: '林岚在门外发声，并试探了门闩。',
      establishedFacts: ['林岚否认点灯。'],
      openThreads: ['仓库里是谁？'],
      actorBriefs: [{
        actorId: 'lin',
        perceptions: ['门闩触感粗糙。'],
        uncertainties: ['是否要继续等待。'],
      }],
    })
    expect(story.plotLedger.revision).toBe(4)
    expect(story.plotLedger.pendingNpcEvents).toEqual([])
    expect(story.plotLedger.latestBrief?.sourceNpcEvents).toHaveLength(2)
  })

  it('drops NPC tool events that arrive after their owned attempt is cancelled', async () => {
    const { actor, ctx, sceneSession, story } = await harness()
    await ctx.storyRegistry.commitDirectorBrief(story.id, sceneSession.id, {
      expectedLedgerRevision: 0,
      sceneSessionId: sceneSession.id,
      situation: '林岚站在门外。',
      establishedFacts: [],
      openThreads: ['门后有什么？'],
      actorBriefs: [{ actorId: 'lin', perceptions: ['看见门。'], uncertainties: ['门后情况。'] }],
    })
    await ctx.storyRegistry.beginDirectorDispatch(story.id, sceneSession.id, 0, [{
      actorId: 'lin',
      attemptId: DirectorRunAttemptId('attempt-lin-cancelled'),
      actorSessionId: actor.session.id,
      afterEventSeq: actor.session.events.at(-1)?.seq ?? -1,
    }])
    await ctx.storyRegistry.cancelDirectorRunActor(story.id, 1, 'lin')

    actor.session.append('turn/start', { turn: 1 })
    actor.session.append('step/start', { turn: 1, step: 1 })
    actor.session.append('tool/call', {
      turn: 1,
      step: 1,
      callId: ToolCallId('late-speech'),
      name: 'npc_speak',
      arguments: '{}',
    })
    ctx.actors.speak(actor, { text: '这是一条取消后的迟到响应。' })
    await ctx.sessions.flush(actor.session)

    expect(story.plotLedger.revision).toBe(1)
    expect(story.plotLedger.pendingNpcEvents).toEqual([])
    expect(story.plotLedger.directorRun).toMatchObject({
      status: 'awaiting_retry',
      actors: [{ status: 'cancelled', eventRefs: [] }],
    })
  })
})
