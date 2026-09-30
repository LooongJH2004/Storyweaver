import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage, ToolCallId, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import { SessionId } from '@deepseek-ai/dsh-session'
import { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import ActorService, { ActorId, foldActor } from '../../actor/src/index.ts'
import * as toolActor from '../src/index.ts'

const ALL_CAPABILITIES = ['speak', 'act', 'reflect', 'memory', 'goals', 'schedule'] as const

async function setup(script: ConstructorParameters<typeof MockAdapter>[0]) {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(ActorService)
  await ctx.plugin(toolActor)
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  const agent = ctx.agentLoop.create(SessionId('actor-tool-session'), { provider: 'mock', model: 'mock' })
  ctx.actors.bind(agent, {
    id: ActorId('keeper'),
    displayName: 'The Keeper',
    persona: 'Guard the archive and distrust fire.',
    capabilities: [...ALL_CAPABILITIES],
  })
  ctx.actors.initializeState(agent, [], ['keeper', 'mira'])
  return { ctx, agent, adapter }
}

function send(agent: Awaited<ReturnType<typeof setup>>['agent'], text: string): void {
  agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
}

describe('dsh-experimental-tool-actor', () => {
  it('composes a real AgentLoop where only one committed transaction can speak and close', async () => {
    const { ctx, agent, adapter } = await setup([
      toolCallResponse('commit-1', 'npc_commit_turn', {
        behavior: [{
          kind: 'speech', text: 'The archive is closed.', to: ['visitor'],
          delivery: 'spoken', tone: 'firm', intent: 'sincere',
        }],
        posture: 'watching',
      }),
    ])

    const scope = scopeOf(agent.ctx)
    if (scope === undefined) throw new Error('expected Actor scope')
    const assembly = await ctx.systemPrompt.assemble({ scope })
    expect(assembly.tools.map(tool => tool.name).sort()).toEqual([...toolActor.NPC_TOOL_NAMES].sort())
    const prompt = renderPrompt(assembly)
    expect(prompt).toContain('not the narrator, world director, player')
    expect(prompt).toContain('Use only a supplied read-only recall tool')
    expect(prompt).toContain('is a delta, not a restatement')
    expect(prompt).toContain('quote every string')
    expect(prompt).toContain('Never use conclude merely because your own answer')
    const commitSchema = assembly.tools.find(tool => tool.name === 'npc_commit_turn')?.parameters
    expect(JSON.stringify(commitSchema)).toContain('Every item must choose exactly one explicit shape')
    expect(JSON.stringify(commitSchema)).toContain('"oneOf"')

    send(agent, 'A visitor knocks at the archive door.')
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(1)
    const state = foldActor(agent.session.events)
    expect(state.expressions).toEqual([expect.objectContaining({
      origin: 'actor',
      text: 'The archive is closed.',
    })])
    expect(state.closedTurns.get(1)).toBe('yield')
  })

  it('repairs text-only output with one explicit empty npc_commit_turn', async () => {
    const { agent, adapter } = await setup([
      textResponse('I tell the visitor to leave.'),
      toolCallResponse('silent-1', 'npc_commit_turn', {
        turning_points: [],
        behavior: [],
        posture: 'silent',
      }),
    ])
    send(agent, 'A visitor knocks.')
    await agent.whenIdle()

    const state = foldActor(agent.session.events)
    expect(adapter.requests).toHaveLength(2)
    expect(state.expressions).toEqual([])
    expect(state.closedTurns.get(1)).toBe('yield')
    expect(JSON.stringify(agent.session.events)).toContain('NPC TURN SUBMISSION REQUIRED')
  })

  it('accepts a minimal routine turn and ignores descriptive intent on an action', async () => {
    const { agent } = await setup([
      toolCallResponse('watch-1', 'npc_commit_turn', {
        behavior: [{ kind: 'action', attempt: 'Watch the visitor cross the archive.', intent: 'watch' }],
        posture: 'watching',
      }),
    ])
    send(agent, 'A visitor crosses the archive.')
    await agent.whenIdle()

    const state = foldActor(agent.session.events)
    expect(state.actions).toEqual([expect.objectContaining({
      description: 'Watch the visitor cross the archive.',
    })])
    expect(state.closedTurns.get(1)).toBe('yield')
  })

  it('returns an actionable correction for malformed commit JSON', async () => {
    const malformed = [
      { type: 'block-start' as const, index: 0, blockType: 'tool-call' as const },
      {
        type: 'block-end' as const,
        index: 0,
        block: {
          type: 'tool-call' as const,
          id: ToolCallId('broken-1'),
          name: 'npc_commit_turn',
          arguments: '{"behavior":[],"posture":waiting}',
        },
      },
      { type: 'finish' as const, reason: { kind: 'tool-calls' as const } },
    ] satisfies StreamChunk[]
    const { agent } = await setup([
      malformed,
      toolCallResponse('fixed-1', 'npc_commit_turn', { behavior: [], posture: 'waiting' }),
    ])
    send(agent, 'Wait by the archive door.')
    await agent.whenIdle()

    expect(JSON.stringify(agent.session.events)).toContain('received malformed JSON')
    expect(foldActor(agent.session.events).closedTurns.get(1)).toBe('yield')
  })

  it('leaves the turn unclosed when the bounded correction still omits npc_commit_turn', async () => {
    const { agent, adapter } = await setup([
      textResponse('I should answer the visitor.'),
      textResponse('I still answer only as assistant prose.'),
    ])
    send(agent, 'A visitor knocks.')
    await agent.whenIdle()

    const state = foldActor(agent.session.events)
    expect(adapter.requests).toHaveLength(2)
    expect(state.expressions).toEqual([])
    expect(state.closedTurns.has(1)).toBe(false)
  })

  it.each(['object', 'string'])('identifies a %s arguments wrapper without committing it', async (kind) => {
    const intended = { posture: 'waiting', behavior: [{ kind: 'speech', text: 'Wait here.' }] }
    const wrapped = { arguments: kind === 'string' ? JSON.stringify(intended) : intended }
    const { agent, adapter } = await setup([
      toolCallResponse('wrapped', 'npc_commit_turn', wrapped),
      toolCallResponse('corrected', 'npc_commit_turn', intended),
    ])
    send(agent, 'Wait by the door.')
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(2)
    expect(JSON.stringify(adapter.requests[1]?.messages)).toContain('Remove the arguments wrapper')
    expect(JSON.stringify(adapter.requests[1]?.messages)).not.toContain('missing required property')
    expect(foldActor(agent.session.events).expressions).toEqual([
      expect.objectContaining({ text: 'Wait here.' }),
    ])
    expect(foldActor(agent.session.events).closedTurns.get(1)).toBe('yield')
  })

  it('keeps a fixed submission schema even when a capability is absent', async () => {
    const ctx = new Context()
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(ActorService)
    await ctx.plugin(toolActor)
    const agent = ctx.agentLoop.create(SessionId('quiet-actor'), { provider: 'unused', model: 'unused' })
    ctx.actors.bind(agent, {
      id: ActorId('silent-witness'),
      displayName: 'Silent Witness',
      persona: 'Observes but cannot directly act.',
      capabilities: ['reflect', 'memory'],
    })
    const scope = scopeOf(agent.ctx)
    if (scope === undefined) throw new Error('expected Actor scope')
    const names = (await ctx.systemPrompt.assemble({ scope })).tools.map(tool => tool.name)
    expect(names).toEqual(['npc_commit_turn'])
  })

  it('turns natural roleplaying calls into private state without exposing persistence ids', async () => {
    const { ctx, agent } = await setup([
      toolCallResponse('commit-state-1', 'npc_commit_turn', {
        state_changes: [{
          fieldId: 'keeper:wary', expectedRevision: 0, value: 4, reason: 'She noticed the seal.', sourceRefs: [],
          definition: { id: 'keeper:wary', name: 'wary', description: 'Fear of being exposed', group: 'emotion',
            type: 'number', owner: 'actor', actorId: 'keeper', minimum: 1, maximum: 5, guidance: 'Update after material change' },
        }],
        memories: [{ content: 'Mira noticed the false seal.', importance: 4, meaning: 'She may expose the archive.' }],
        released_memories: [{
          about: 'Mira noticing the false seal', mode: 'suppress', reason: 'Fear makes denial easier.',
        }],
        goals: [{ operation: 'adopt', goal: 'Keep Mira away from the lower archive.', priority: 5 }],
        intentions: [{
          intention: 'Move the false seal after midnight.', trigger_kind: 'world-time',
          trigger: 'after midnight', commitment: 4,
        }],
        behavior: [],
        posture: 'watching',
        next_impulse: 'Watch Mira leave.',
      }),
    ])

    send(agent, 'Mira studies the seal and says nothing.')
    await agent.whenIdle()

    const state = foldActor(agent.session.events)
    expect(state.dynamicState.entries[0]).toMatchObject({ value: 4, definition: { name: 'wary' } })
    expect(state.memoryReleases.at(-1)?.matchedMemoryIds).toHaveLength(1)
    expect([...state.memories.values()].at(-1)?.status).toBe('forgotten')
    expect([...state.goals.values()].at(-1)).toMatchObject({ status: 'active', priority: 5 })
    expect([...state.intentions.values()].at(-1)).toMatchObject({ commitment: 4 })
    expect(state.closedTurns.get(1)).toBe('yield')

    const scope = scopeOf(agent.ctx)
    if (scope === undefined) throw new Error('expected Actor scope')
    const prompt = renderPrompt(await ctx.systemPrompt.assemble({ scope }))
    expect(prompt).not.toContain('memory-release-')
    expect(prompt).not.toContain('memory-')
    expect(prompt).not.toContain('belief-')
  })
})
