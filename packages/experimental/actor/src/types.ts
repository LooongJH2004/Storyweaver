import type { ActorContextView } from '@deepseek-ai/dsh-roleplay-core'
/** Public Actor records and Harness-owned execution event declarations. */
export * from '@deepseek-ai/dsh-roleplay-core/actor-model'
import type { ActorId, ActorMemoryId, ActorDescriptor, ActorThoughtRecord, ActorEmotionRecord, ActorBeliefSnapshot, ActorRelationshipSnapshot, ActorMemoryRecord, ActorMemoryReleaseRecord, ActorTurningPointSnapshot, ActorGoalSnapshot, ActorIntentionRecord, ActorExpressionRecord, ActorActionRecord, ActorTurnCloseReason, ActorTurnPosture, ActorDiscussionIntent, ActorContinuityRequest, PlayerInterventionRecord } from '@deepseek-ai/dsh-roleplay-core/actor-model'
import type { StateChange } from '@deepseek-ai/dsh-roleplay-core/dynamic-state'

/** Host-authorized inputs for one character; the Actor never queries a Story registry. */
export interface ActorNarrativePerspective {
  readonly actorIds: readonly string[]
  readonly knowledge: import('@deepseek-ai/dsh-roleplay-core/knowledge').KnowledgeState
  readonly entityRefs: readonly string[]
  readonly sourceRefs: readonly string[]
  readonly targets: Readonly<Record<string, string>>
  readonly initialRefs: Readonly<Record<string, string>>
}
/** Harness composition resolves membership before granting narrative read access. */
export interface ActorNarrativeReader {
  read(sessionId: import('@deepseek-ai/dsh-session/types').SessionId, actorId: ActorId): ActorNarrativePerspective | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** All validated changes from one NPC commit, durably accepted as a single event. */
    'actor/commit': { version: 1; operations: { type: string; data: import('@deepseek-ai/dsh-session/types').JsonValue }[] }
    /** Initial personal cognition captured once, with no inheritance from past public events. */
    'actor/knowledge-initialized': { version: 1; actorId: ActorId; state: import('@deepseek-ai/dsh-roleplay-core/knowledge').KnowledgeState }
    /** Atomic private knowledge revision with host-captured source permissions. */
    'actor/knowledge-changed': { version: 1; actorId: ActorId; changes: import('@deepseek-ai/dsh-roleplay-core/knowledge').KnowledgeChange[]; authority: import('@deepseek-ai/dsh-roleplay-core/knowledge').KnowledgeAuthority }
    /** Records a validated batch of new private fields and exact-revision value changes. */
    'actor/state-changed': { version: 1; actorId: ActorId; actorIds: string[]; origin: 'actor' | 'player' | 'author'; changes: StateChange[] }

    /** Binds one fresh Session to a stable Actor identity and its initial author configuration. */
    'actor/descriptor': { version: 1; actor: ActorDescriptor }
    /** Author-owned presentation and capability update; stable fictional identity cannot change. */
    'actor/configuration': { version: 1; expectedRevision: number; actor: ActorDescriptor }
    /** Fictional inner activity explicitly chosen by the Actor. */
    'actor/thought': { version: 1; thought: ActorThoughtRecord }
    /** Records one private emotional occurrence and its intensity, subject, cause, and impulse. */
    'actor/emotion': { version: 1; emotion: ActorEmotionRecord }
    /** Records one complete revision of an Actor's subjective belief and confidence. */
    'actor/belief': { version: 1; belief: ActorBeliefSnapshot }
    /** Records one complete revision of a private relationship dimension toward a subject. */
    'actor/relationship': { version: 1; relationship: ActorRelationshipSnapshot }
    /** One explicit core-memory creation. */
    'actor/memory': { version: 1; memory: ActorMemoryRecord }
    /** Records a semantic memory-release request and the active memories selected by the host. */
    'actor/memory-release': { version: 1; release: ActorMemoryReleaseRecord }
    /** Tombstone for one active memory; the source event remains auditable. */
    'actor/memory-forgotten': {
      version: 1
      actorId: ActorId
      memoryId: ActorMemoryId
      reason?: string
    }
    /** Whole goal snapshot with contiguous revisions. */
    'actor/goal': { version: 1; goal: ActorGoalSnapshot }
    /** One scheduled future intention. */
    'actor/intention': { version: 1; intention: ActorIntentionRecord }
    /** One revision of an Actor-owned meaningful character turning point. */
    'actor/turning-point': { version: 1; turningPoint: ActorTurningPointSnapshot }
    /** One speech intent; an environment adapter decides who hears it. */
    'actor/expression': { version: 1; expression: ActorExpressionRecord }
    /** One action intent; an environment adapter decides its outcome. */
    'actor/action-intent': { version: 1; action: ActorActionRecord }
    /** Explicit Actor turn completion, separate from the generic loop boundary. */
    'actor/turn-closed': {
      version: 1
      actorId: ActorId
      turn: number
      reason: ActorTurnCloseReason
      posture?: ActorTurnPosture
      nextImpulse?: string
      discussion?: ActorDiscussionIntent
      continuity?: readonly ActorContinuityRequest[]
    }
    /**
     * Audit-only branch boundary restoring the Actor projection to an earlier
     * committed Session prefix. Superseded raw events remain durable but are
     * excluded from subsequent private-state folds.
     */
    'actor/state-rewind': {
      version: 1
      afterEventSeq: number
      reason: 'story-rewrite'
    }
    /** Player-authored control, world intervention, or embodied role action. */
    'actor/player-intervention': { version: 1; intervention: PlayerInterventionRecord }
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Frozen narrative input and its version; the request header records the complete model request. */
    'roleplay/execution-request': { attempt: string; context: ActorContextView | import('@deepseek-ai/dsh-roleplay-core/types').DirectorContextView }
    /** A receipt acknowledges committed fiction, independent of delivery or later execution failure. */
    'roleplay/execution-receipt': { attempt: string; commitId: string; instanceId: string; revision: number }
    /** Technical failure after invocation, including any already accepted narrative receipt. */
    'roleplay/execution-diagnostic': { attempt: string; message: string; committed: boolean }
  }
}
