/** Narrative character changes contain no execution-protocol names or log coordinates. */
import type { ActorId, ActorMemoryId, ActorDescriptor, ActorThoughtRecord, ActorEmotionRecord, ActorBeliefSnapshot, ActorRelationshipSnapshot, ActorMemoryRecord, ActorMemoryReleaseRecord, ActorTurningPointSnapshot, ActorGoalSnapshot, ActorIntentionRecord, ActorExpressionRecord, ActorActionRecord, ActorTurnCloseReason, ActorTurnPosture, ActorDiscussionIntent, ActorContinuityRequest, PlayerInterventionRecord } from './actor-model.ts'
import type { StateChange } from './dynamic-state.ts'

/** Accepted character payloads, independent of a Session event envelope. */
export interface CharacterChangeMap {
  /** Initial personal cognition captured once, with no inheritance from past public events. */
  'knowledge.initialized': { version: 1; actorId: ActorId; state: import('./knowledge.ts').KnowledgeState }
  /** Atomic private knowledge revision with host-captured source permissions. */
  'knowledge.changed': { version: 1; actorId: ActorId; changes: import('./knowledge.ts').KnowledgeChange[]; authority: import('./knowledge.ts').KnowledgeAuthority }
  /** Records a validated batch of new private fields and exact-revision value changes. */
  'state.changed': { version: 1; actorId: ActorId; actorIds: string[]; origin: 'actor' | 'player' | 'author'; changes: StateChange[] }

  /** Establishes a stable character identity and its initial author configuration. */
  'character.defined': { version: 1; actor: ActorDescriptor }
  /** Author-owned presentation and capability update; stable fictional identity cannot change. */
  'character.configured': { version: 1; expectedRevision: number; actor: ActorDescriptor }
  /** Fictional inner activity explicitly chosen by the Actor. */
  'thought.recorded': { version: 1; thought: ActorThoughtRecord }
  /** Records one private emotional occurrence and its intensity, subject, cause, and impulse. */
  'emotion.recorded': { version: 1; emotion: ActorEmotionRecord }
  /** Records one complete revision of an Actor's subjective belief and confidence. */
  'belief.revised': { version: 1; belief: ActorBeliefSnapshot }
  /** Records one complete revision of a private relationship dimension toward a subject. */
  'relationship.revised': { version: 1; relationship: ActorRelationshipSnapshot }
  /** One explicit core-memory creation. */
  'memory.recorded': { version: 1; memory: ActorMemoryRecord }
  /** Records a semantic memory-release request and the active memories selected by the host. */
  'memory.released': { version: 1; release: ActorMemoryReleaseRecord }
  /** Tombstone for one active memory; the source event remains auditable. */
  'memory.forgotten': {
    version: 1
    actorId: ActorId
    memoryId: ActorMemoryId
    reason?: string
  }
  /** Whole goal snapshot with contiguous revisions. */
  'goal.revised': { version: 1; goal: ActorGoalSnapshot }
  /** One scheduled future intention. */
  'intention.recorded': { version: 1; intention: ActorIntentionRecord }
  /** One revision of an Actor-owned meaningful character turning point. */
  'turning-point.revised': { version: 1; turningPoint: ActorTurningPointSnapshot }
  /** One speech intent; an environment adapter decides who hears it. */
  'speech.expressed': { version: 1; expression: ActorExpressionRecord }
  /** One action intent; an environment adapter decides its outcome. */
  'action.attempted': { version: 1; action: ActorActionRecord }
  /** Explicit Actor turn completion, separate from the generic loop boundary. */
  'character.turn-closed': {
    version: 1
    actorId: ActorId
    turn: number
    reason: ActorTurnCloseReason
    posture?: ActorTurnPosture
    nextImpulse?: string
    discussion?: ActorDiscussionIntent
    continuity?: readonly ActorContinuityRequest[]
  }
  /** Player-authored control, world intervention, or embodied role action. */
  'player.intervened': { version: 1; intervention: PlayerInterventionRecord }
}
/** Closed set of character changes projected by the domain. */
export type CharacterChangeType = keyof CharacterChangeMap
/** Domain changes are parsed before projection; no execution metadata is required. */
export type CharacterChange = { [K in CharacterChangeType]: { type: K; data: CharacterChangeMap[K] } }[CharacterChangeType]
