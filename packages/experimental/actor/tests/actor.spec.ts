import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { stateFieldReference } from '@deepseek-ai/dsh-story'
import { stateDefinitionSchema, stateChangeSchema } from '@deepseek-ai/dsh-story/state'
import ActorService, { ActorId } from '../src/index.ts'

async function setup(config: ConstructorParameters<typeof ActorService>[1] = {}) {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(ActorService, config)
  const agent = ctx.agentLoop.create(SessionId('keeper-session'), { provider: 'unused', model: 'unused' })
  const descriptor = {
    id: ActorId('keeper'),
    displayName: 'The Keeper',
    persona: 'Protect the archive, distrust fire, and remember promises.',
    capabilities: ['speak', 'act', 'reflect', 'memory', 'goals', 'schedule'] as const,
  }
  ctx.actors.bind(agent, { ...descriptor, capabilities: [...descriptor.capabilities] })
  return { ctx, agent }
}

describe('ActorService', () => {
  it('keeps hidden author field identities out of state-validation errors and rejects without writing', async () => {
    const { ctx, agent } = await setup()
    const definition = stateDefinitionSchema.parse({ id: 'keeper:hidden-oracle:trust', name: 'Trust',
      description: 'Current confidence', group: 'Relationships', type: 'number', owner: 'actor', actorId: 'keeper',
      minimum: 0, maximum: 1, guidance: 'Change with perceived evidence.' })
    ctx.actors.initializeState(agent, [{ definition, value: 0.5 }], ['keeper'])
    const length = agent.session.events.length
    const fieldId = stateFieldReference(definition.id)
    const change = stateChangeSchema.parse({ fieldId, expectedRevision: 1, value: 2, reason: 'A claim', sourceRefs: [] })
    let message = ''
    try { ctx.actors.changeState(agent, [change]) } catch (error) { message = (error as Error).message }
    expect(message).toContain(fieldId)
    expect(message).not.toContain('hidden-oracle')
    expect(message).toContain('configured bounds')
    expect(agent.session.events).toHaveLength(length)
    await ctx.fiber.dispose()
  })

  it('revises author configuration atomically while preserving identity, state and rewind-independent settings', async () => {
    const { ctx, agent } = await setup()
    const original = ctx.actors.modelContext(agent).descriptor
    const boundary = agent.session.events.at(-1)!.seq
    ctx.actors.remember(agent, { content: 'An event after the rewind boundary.' })
    const changed = { ...original, displayName: 'Revised Keeper', persona: 'A newly authored persona.', capabilities: ['speak' as const] }
    expect(ctx.actors.configure(agent, 0, changed)).toBe(1)
    expect(ctx.actors.modelContext(agent).descriptor).toEqual(changed)
    expect(ctx.actors.modelContext(agent).memories).toHaveLength(1)
    expect(() => ctx.actors.reflect(agent, { content: 'No reflection grant.' })).toThrow('capability')
    expect(ctx.actors.configure(agent, 1, changed)).toBe(1)
    expect(agent.session.events.filter(event => event.type === 'actor/configuration')).toHaveLength(1)
    const length = agent.session.events.length
    expect(() => ctx.actors.configure(agent, 0, original)).toThrow('Stale')
    expect(() => ctx.actors.configure(agent, 1, { ...changed, id: ActorId('another') })).toThrow('identity')
    expect(() => { ctx.actors.transaction(agent, () => ctx.actors.configure(agent, 1, original)) }).toThrow('transaction')
    expect(agent.session.events).toHaveLength(length)
    agent.session.append('actor/state-rewind', { version: 1, afterEventSeq: boundary, reason: 'story-rewrite' })
    expect(ctx.actors.modelContextEvents(agent.session.events).descriptor).toEqual(changed)
    expect(ctx.actors.modelContext(agent).memories).toHaveLength(0)
    expect(() => ctx.actors.reflect(agent, { content: 'Rewind must not restore a revoked grant.' })).toThrow('capability')
    await ctx.fiber.dispose()
  })

  it('lets an Actor remember, recall, forget, and remain privately auditable', async () => {
    const { ctx, agent } = await setup()
    const thought = ctx.actors.reflect(agent, { content: 'Mira may be testing my loyalty.' })
    const first = ctx.actors.remember(agent, {
      content: 'Mira returned the brass key.',
      importance: 4,
      tags: ['mira', 'key'],
      sourceRefs: [thought.id],
    })
    ctx.actors.remember(agent, { content: 'The west stair creaks.', tags: ['archive'] })

    expect(ctx.actors.recall(agent, { query: 'mira' })).toEqual([first])
    const forgotten = ctx.actors.forget(agent, { memoryId: first.id, reason: 'A magical price.' })
    expect(forgotten.status).toBe('forgotten')
    expect(ctx.actors.recall(agent, { query: 'mira' })).toEqual([])
    expect(ctx.actors.playerInspect(agent).memories).toContainEqual(expect.objectContaining({
      id: first.id,
      status: 'forgotten',
      forgottenReason: 'A magical price.',
    }))
    expect(ctx.actors.modelContext(agent).memories.map(memory => memory.id)).not.toContain(first.id)
  })

  it('records player direction, world intervention, speech, and action with player provenance', async () => {
    const { ctx, agent } = await setup()
    const control = Session.create(SessionId('story-control'))
    const direction = ctx.actors.playerChooseDirection(control, 'The eclipse arrives before dawn.')
    const world = ctx.actors.playerInterveneWorld(control, 'The eastern bridge collapses.')
    const speech = ctx.actors.playerSpeakAs(agent, {
      text: 'Nobody enters the archive.',
      audience: ['guard'],
      delivery: 'spoken',
    })
    const action = ctx.actors.playerActAs(agent, {
      description: 'Locks the iron gate.',
      target: 'iron gate',
    })

    expect(direction.kind).toBe('story-direction')
    expect(world.kind).toBe('world-intervention')
    expect(speech.expression).toMatchObject({ origin: 'player', playerInterventionId: speech.intervention.id })
    expect(action.action).toMatchObject({ origin: 'player', playerInterventionId: action.intervention.id })
    const privateView = ctx.actors.playerInspect(agent)
    expect(privateView.expressions.at(-1)?.origin).toBe('player')
    expect(privateView.actions.at(-1)?.origin).toBe('player')
    expect(control.events.filter(event => event.type === 'actor/player-intervention')).toHaveLength(2)
  })

  it('resolves semantic NPC state changes without exposing persistence identities to callers', async () => {
    const { ctx, agent } = await setup()
    const memory = ctx.actors.remember(agent, {
      content: 'Mira noticed the false seal on the archive letter.',
      importance: 4,
      meaning: 'She may expose the archive.',
    })
    const release = ctx.actors.releaseMemory(agent, {
      about: 'Mira noticing the false seal',
      mode: 'suppress',
      reason: 'Denial is easier.',
    })
    const firstBelief = ctx.actors.believe(agent, {
      proposition: 'Mira knows the seal is false.', stance: 'suspect', confidence: 2,
    })
    const revisedBelief = ctx.actors.believe(agent, {
      proposition: 'Mira knows the seal is false.', stance: 'believe', confidence: 5,
    })
    const firstRelationship = ctx.actors.relate(agent, {
      target: 'Mira', dimension: 'trust', shift: -1, reason: 'She concealed what she saw.',
    })
    const revisedRelationship = ctx.actors.relate(agent, {
      target: 'Mira', dimension: 'trust', shift: -2, reason: 'She returned with a witness.',
    })
    const goal = ctx.actors.changeGoal(agent, {
      operation: 'adopt', goal: 'Keep Mira away from the lower archive.', priority: 4,
    })
    const reprioritized = ctx.actors.changeGoal(agent, {
      operation: 'reprioritize', goal: 'Keep Mira away from the lower archive.', priority: 5,
    })

    expect(release.matchedMemoryIds).toEqual([memory.id])
    expect(ctx.actors.modelContext(agent).memories).toEqual([])
    expect(revisedBelief).toMatchObject({ id: firstBelief.id, revision: 2, stance: 'believe' })
    expect(revisedRelationship).toMatchObject({ id: firstRelationship.id, revision: 2, value: -3 })
    expect(reprioritized).toMatchObject({ id: goal.id, revision: 2, priority: 5, status: 'active' })
    expect(ctx.actors.playerInspect(agent).memoryReleases).toEqual([release])
  })

  it('enforces fresh isolated Sessions and archives the least-important oldest memory at capacity', async () => {
    const { ctx, agent } = await setup({ maxCoreMemories: 2 })
    expect(ctx.actors.bind(agent, ctx.actors.membership(agent).descriptor)).toBe(ctx.actors.membership(agent))
    const first = ctx.actors.remember(agent, { content: 'Old low-priority memory.', importance: 2 })
    const secondMemory = ctx.actors.remember(agent, { content: 'New low-priority memory.', importance: 2 })
    const thirdMemory = ctx.actors.remember(agent, { content: 'High-priority replacement.', importance: 4 })
    expect(ctx.actors.recall(agent)).toEqual([thirdMemory, secondMemory])
    expect(ctx.actors.playerInspect(agent).memories).toContainEqual(expect.objectContaining({
      id: first.id, status: 'forgotten', forgottenReason: 'core-memory-capacity',
    }))

    const second = ctx.agentLoop.create(SessionId('second-session'), { provider: 'unused', model: 'unused' })
    const secondMembership = ctx.actors.bind(second, {
      id: ActorId('keeper'),
      displayName: 'Duplicate',
      persona: 'Conflicting identity.',
      capabilities: [],
    })
    expect(secondMembership.agent).toBe(second)
    expect(ctx.actors.find(ActorId('keeper'))).toBeUndefined()
  })
  it('publishes a full commit once, rolls back late failures, and folds the same state after reload and rewind', async () => {
    const { ctx, agent } = await setup()
    const boundary = agent.session.events.at(-1)!.seq
    const before = agent.session.events.length
    expect(() =>{  ctx.actors.transaction(agent, () => {
      ctx.actors.initializeState(agent, [], ['keeper'])
      ctx.actors.remember(agent, { content: 'This must roll back', importance: 3 })
      throw new Error('late validation failure')
    }) }).toThrow('late validation failure')
    expect(agent.session.events).toHaveLength(before)
    expect(ctx.actors.isStateInitialized(agent)).toBe(false)
    ctx.actors.transaction(agent, () => {
      ctx.actors.initializeState(agent, [], ['keeper'])
      ctx.actors.remember(agent, { content: 'One committed memory', importance: 3 })
    })
    expect(agent.session.events).toHaveLength(before + 1)
    expect(agent.session.events.at(-1)?.type).toBe('actor/commit')
    const restoredEvents = JSON.parse(JSON.stringify(agent.session.events)) as typeof agent.session.events
    expect(ctx.actors.playerInspectEvents(restoredEvents)).toEqual(ctx.actors.playerInspect(agent))
    agent.session.append('actor/state-rewind', { version: 1, afterEventSeq: boundary, reason: 'story-rewrite' })
    expect(ctx.actors.isStateInitialized(agent)).toBe(false)
    expect(ctx.actors.playerInspect(agent).memories).toEqual([])
    ctx.actors.initializeState(agent, [], ['keeper'])
    expect(ctx.actors.isStateInitialized(agent)).toBe(true)
  })

  it('initializes authored lifecycle records atomically without granting model mutation capabilities', async () => {
    const { ctx } = await setup()
    const actor = ctx.agentLoop.create(SessionId('authored-only'), { provider: 'unused', model: 'unused' })
    ctx.actors.bind(actor, { id: ActorId('authored'), displayName: 'Authored', persona: 'Keep a promise.', capabilities: [] })
    const before = actor.session.events.length
    expect(() => { ctx.actors.initializeState(actor, [], ['authored'], {
      memories: [{ content: 'Must roll back.' }], goals: [{ description: 'Invalid priority', priority: 6 }],
    }) }).toThrow()
    expect(actor.session.events).toHaveLength(before)
    expect(ctx.actors.isStateInitialized(actor)).toBe(false)
    const context = {
      memories: [{ content: 'Remember the promise.' }], goals: [{ description: 'Keep the promise.' }],
      intentions: [{ description: 'Return at dawn.', trigger: { kind: 'soon' as const } }],
    }
    ctx.actors.initializeState(actor, [], ['authored'], context)
    ctx.actors.initializeState(actor, [], ['authored'], context)
    expect(actor.session.events).toHaveLength(before + 1)
    const state = ctx.actors.playerInspect(actor)
    expect(state.memories).toHaveLength(1)
    expect(state.goals).toHaveLength(1)
    expect(state.intentions).toHaveLength(1)
    expect(() => ctx.actors.remember(actor, { content: 'Not granted.' })).toThrow()
    expect(() => ctx.actors.setGoal(actor, { description: 'Not granted.' })).toThrow()
    expect(() => ctx.actors.schedule(actor, context.intentions[0]!)).toThrow()
  })

})
