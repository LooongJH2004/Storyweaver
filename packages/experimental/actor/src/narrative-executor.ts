import { defineTool } from '@deepseek-ai/dsh-tools'
import { HarnessExecutionSessions } from './execution-session.ts'
import type { NpcTurnInput } from '@deepseek-ai/dsh-roleplay-core/npc-turn'
/** Harness execution owns Agent sessions and request evidence, never character state. */
import { createHash } from 'node:crypto'
import type { AgentOptions, AgentRegistry, AgentSetup, ModelSelection } from '@deepseek-ai/dsh-agent'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import type { ActorExecutor, Json } from '@deepseek-ai/dsh-roleplay-core'
import { narrativeRecallDescriptions } from '@deepseek-ai/dsh-roleplay-core'
import { NPC_TURN_PARAMETERS, npcTurnParameters, NPC_TURN_POLICY, NPC_ACCEPTED_SCHEMA, NPC_COMMIT_CORRECTION } from '@deepseek-ai/dsh-roleplay-core/npc-protocol'
import { NPC_CONSOLIDATION_POLICY, NPC_CONSOLIDATION_CORRECTION } from '@deepseek-ai/dsh-roleplay-core/npc-protocol'

/** Storage and composition operations available only to the execution adapter. */
export interface HarnessActorOptions {
  readonly sessionNamespace?: 'background-memory'
  readonly agentOptions: AgentOptions
  /** Optional host settings sampled once per execution; omitted deployments use fixed agent options. */
  selection?(): ModelSelection
  readonly setup: AgentSetup
  /** Report only definite absence; corrupt or unreadable histories must reject. */
  exists(sessionId: SessionId): Promise<boolean>
  flush(session: Session): Promise<void>
}

/** Resolve a technical session by both domain scopes without opening it. */
export function actorExecutionSessionId(instanceId: string, actorId: string): SessionId {
  return SessionId(`roleplay-${createHash('sha256').update(JSON.stringify([instanceId, actorId])).digest('hex')}`)
}

/** Director execution keys cannot collide with a character whose ID happens to be director. */
export function directorExecutionSessionId(instanceId: string): SessionId {
  return SessionId(`roleplay-${createHash('sha256').update(JSON.stringify([instanceId, 'director', 'execution'])).digest('hex')}`)
}

/** Actor protocol delegates technical session ownership to the shared Harness adapter. */
export class HarnessActorExecutor implements ActorExecutor {
  private readonly sessions: HarnessExecutionSessions<NpcTurnInput>
  constructor(agents: Pick<AgentRegistry, 'create' | 'resume'>, options: HarnessActorOptions) {
    this.sessions = new HarnessExecutionSessions(agents, options, {
      tools: (execute, request) => [defineTool({ name: 'npc_commit_turn', description: 'Submit the complete character turn once. Accepted changes are committed together.',
        parameters: request.context.sections.some(section => section.id === 'consolidation')
          ? { posture: { ...NPC_TURN_PARAMETERS.posture, enum: ['silent'], description: 'Required silent disposition for private memory consolidation.' },
            context_update: { ...NPC_TURN_PARAMETERS.context_update, required: true,
              description: 'Required memory consolidation covering exactly the assigned sources across these units.' } }
          : npcTurnParameters('actorId' in request.context ? request.context.capabilities : undefined),
        output: { schema: NPC_ACCEPTED_SCHEMA, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
        execute: async (input, execution) => { await execute(input, execution); return { accepted: true as const } },
      })],
      policy: request => request.context.sections.some(section => section.id === 'consolidation')
        ? NPC_CONSOLIDATION_POLICY : NPC_TURN_POLICY,
      correction: request => request.context.sections.some(section => section.id === 'consolidation')
        ? NPC_CONSOLIDATION_CORRECTION : NPC_COMMIT_CORRECTION, summary: 'Current character perspective',
    })
  }
  execute(request: Parameters<ActorExecutor['execute']>[0], signal: AbortSignal,
    submit: Parameters<ActorExecutor['execute']>[2], recall: Parameters<ActorExecutor['execute']>[3]): Promise<void> {
    return this.sessions.execute(request, signal, (_callId, input) => ({
      commit: submit(input), result: { accepted: true }, complete: true,
    }), guard => [defineTool({ name: 'narrative_recall',
      description: 'Search your own original evidence, personal records and effective memory summaries, including summaries omitted from the current context. Search a topic or copy a retention reference to read its details. Missing context is not forgetting. A summary is your retained understanding, not proof of world truth. Claims remain claims; results never grant another perspective. Query and page within the current frozen request. When a result includes continuation, copy its offset, sourceId and characterOffset into the next call with the same query to read the rest of the record.',
      parameters: {
        query: { type: 'string', required: true,
          description: narrativeRecallDescriptions.query },
        offset: { type: 'integer', required: true, description: narrativeRecallDescriptions.offset },
        limit: { type: 'integer', required: true },
        sourceId: { type: 'string', description: narrativeRecallDescriptions.sourceId },
        characterOffset: { type: 'integer', description: narrativeRecallDescriptions.characterOffset },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: (input, execution) => { guard(execution); return Promise.resolve(JSON.parse(JSON.stringify(recall(input))) as Json) },
    })])
  }
  /** Cancel and release owned technical sessions. */
  dispose(): Promise<void> { return this.sessions.dispose() }
}


/** Private memory jobs use a distinct technical session and submit durable queue results only. */
export class HarnessMemoryExecutor {
  private readonly sessions: HarnessExecutionSessions<{ context_update: NpcTurnInput['context_update'] }>
  constructor(agents: Pick<AgentRegistry, 'create' | 'resume'>, options: HarnessActorOptions) {
    this.sessions = new HarnessExecutionSessions(agents, { ...options, sessionNamespace: 'background-memory' }, {
      tools: execute => [defineTool({ name: 'memory_submit', description: 'Save this complete memory batch for later integration. This does not advance the story.',
        parameters: { context_update: { ...NPC_TURN_PARAMETERS.context_update, required: true } },
        output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
        execute: async (input, execution) => { await execute(input, execution); return { queued: true } },
      })],
      policy: 'This is private background memory work. Only memory_submit and narrative_recall are available. Submit the complete assigned batch once. Public behavior, world changes and dialogue are forbidden. A saved result is awaiting integration, not a new fictional event.',
      correction: 'Submit context_update with memory_submit, covering every assigned source exactly once.',
      summary: 'Background memory consolidation',
    })
  }
  execute(request: { attempt: string; context: import('@deepseek-ai/dsh-roleplay-core').ActorContextView | import('@deepseek-ai/dsh-roleplay-core').DirectorContextView },
    signal: AbortSignal, submit: (input: NonNullable<NpcTurnInput['context_update']>) => void,
    recall: (input: import('@deepseek-ai/dsh-roleplay-core/command-inputs').NarrativeRecallInput) => import('@deepseek-ai/dsh-roleplay-core').NarrativeRecallView): Promise<void> {
    return this.sessions.execute(request, signal, (_id, input) => {
      if (input.context_update === undefined) throw new Error('context_update is required')
      submit(input.context_update)
      return { result: { queued: true }, complete: true }
    }, guard => [defineTool({ name: 'narrative_recall', description: 'Read only this memory job’s frozen perspective, including original evidence and retained details.',
      parameters: { query: { type: 'string', required: true }, offset: { type: 'integer', required: true }, limit: { type: 'integer', required: true },
        sourceId: { type: 'string' }, characterOffset: { type: 'integer' } },
      output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: (input, execution) => { guard(execution); return Promise.resolve(JSON.parse(JSON.stringify(recall(input))) as Json) },
    })])
  }
  dispose(): Promise<void> { return this.sessions.dispose() }
}

/** Memory sessions remain separate from foreground sessions for the same fictional owner. */
export function backgroundMemorySessionId(instanceId: string, actorId?: string): SessionId {
  const identity = actorId === undefined ? [instanceId, 'director', 'execution'] : [instanceId, actorId]
  return SessionId(`roleplay-${createHash('sha256').update(JSON.stringify([...identity, 'background-memory'])).digest('hex')}`)
}
