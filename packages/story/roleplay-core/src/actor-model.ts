/** Public identities, event records, requests, and projections for autonomous Actors. */

import type { DynamicState } from './dynamic-state.ts'
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable fictional Actor identity, independent from display name and live Session id. */
export type ActorId = Branded<'ActorId'>
/**
 * Brand one validated Actor identity.
 * @param value - validated stable identity text.
 * @returns branded Actor identity.
 */
export function ActorId(value: string): ActorId { return value as ActorId }

/** Stable identity of one fictional inner reflection. */
export type ActorThoughtId = Branded<'ActorThoughtId'>
/**
 * Brand one generated thought identity.
 * @param value - generated stable identity text.
 * @returns branded thought identity.
 */
export function ActorThoughtId(value: string): ActorThoughtId { return value as ActorThoughtId }

/** Stable identity of one fictional emotion occurrence. */
export type ActorEmotionId = Branded<'ActorEmotionId'>
/**
 * Brand one generated emotion identity.
 * @param value - generated stable identity text.
 * @returns branded emotion identity.
 */
export function ActorEmotionId(value: string): ActorEmotionId { return value as ActorEmotionId }

/** Stable identity shared by the revisions of one subjective belief. */
export type ActorBeliefId = Branded<'ActorBeliefId'>
/**
 * Brand one generated belief identity.
 * @param value - generated stable identity text.
 * @returns branded belief identity.
 */
export function ActorBeliefId(value: string): ActorBeliefId { return value as ActorBeliefId }

/** Stable identity shared by the revisions of one relationship dimension. */
export type ActorRelationshipId = Branded<'ActorRelationshipId'>
/**
 * Brand one generated relationship identity.
 * @param value - generated stable identity text.
 * @returns branded relationship identity.
 */
export function ActorRelationshipId(value: string): ActorRelationshipId { return value as ActorRelationshipId }

/** Stable identity of one semantic request to release a memory. */
export type ActorMemoryReleaseId = Branded<'ActorMemoryReleaseId'>
/**
 * Brand one generated memory-release identity.
 * @param value - generated stable identity text.
 * @returns branded memory-release identity.
 */
export function ActorMemoryReleaseId(value: string): ActorMemoryReleaseId { return value as ActorMemoryReleaseId }

/** Stable identity of one explicit core memory. */
export type ActorMemoryId = Branded<'ActorMemoryId'>
/**
 * Brand one generated memory identity.
 * @param value - generated stable identity text.
 * @returns branded memory identity.
 */
export function ActorMemoryId(value: string): ActorMemoryId { return value as ActorMemoryId }

/** Stable identity shared by revisions of one meaningful character turning point. */
export type ActorTurningPointId = Branded<'ActorTurningPointId'>
/**
 * Brand one validated turning-point identity.
 * @param value - validated stable identity text.
 * @returns branded turning-point identity.
 */
export function ActorTurningPointId(value: string): ActorTurningPointId { return value as ActorTurningPointId }

/** Stable identity of one Actor goal. */
export type ActorGoalId = Branded<'ActorGoalId'>
/**
 * Brand one generated goal identity.
 * @param value - generated stable identity text.
 * @returns branded goal identity.
 */
export function ActorGoalId(value: string): ActorGoalId { return value as ActorGoalId }

/** Stable identity of one future intention. */
export type ActorIntentionId = Branded<'ActorIntentionId'>
/**
 * Brand one generated intention identity.
 * @param value - generated stable identity text.
 * @returns branded intention identity.
 */
export function ActorIntentionId(value: string): ActorIntentionId { return value as ActorIntentionId }

/** Stable identity of one spoken expression. */
export type ActorExpressionId = Branded<'ActorExpressionId'>
/**
 * Brand one generated expression identity.
 * @param value - generated stable identity text.
 * @returns branded expression identity.
 */
export function ActorExpressionId(value: string): ActorExpressionId { return value as ActorExpressionId }

/** Stable identity of one intended world action. */
export type ActorActionId = Branded<'ActorActionId'>
/**
 * Brand one generated action identity.
 * @param value - generated stable identity text.
 * @returns branded action identity.
 */
export function ActorActionId(value: string): ActorActionId { return value as ActorActionId }

/** Stable identity of one player-authored intervention. */
export type PlayerInterventionId = Branded<'PlayerInterventionId'>
/**
 * Brand one generated player intervention identity.
 * @param value - generated stable identity text.
 * @returns branded player intervention identity.
 */
export function PlayerInterventionId(value: string): PlayerInterventionId { return value as PlayerInterventionId }

/** Actor-owned model-facing behavior groups. Yield is always installed. */
export type ActorCapability = 'speak' | 'act' | 'reflect' | 'memory' | 'goals' | 'schedule'

/** Stable character identity and revisioned author configuration. */
export interface ActorDescriptor {
  readonly id: ActorId
  readonly displayName: string
  readonly persona: string
  readonly capabilities: ActorCapability[]
}

/** Deployment limits for Actor-owned state and model context. */
export interface Config {
  /** Maximum simultaneously active core memories retained by one Actor. */
  readonly maxCoreMemories?: number
  /** Maximum active memories returned by one recall call. */
  readonly maxRecallResults?: number
  /** Maximum UTF-8 bytes accepted in any complete Actor text field. */
  readonly maxTextBytes?: number
  /** Maximum tags, source references, or intended audience names on one record. */
  readonly maxSourceRefs?: number
  /** Maximum simultaneously active goals retained by one Actor. */
  readonly maxActiveGoals?: number
  /** Maximum scheduled intentions retained by the foundation projection. */
  readonly maxScheduledIntentions?: number
}

/** Persisted fictional inner activity. It is not hidden chain-of-thought. */
export interface ActorThoughtRecord {
  readonly id: ActorThoughtId
  readonly actorId: ActorId
  readonly content: string
  readonly about: string[]
  readonly conclusion?: string | undefined
}

/** One private emotional occurrence; aggregation and decay are projection concerns. */
export interface ActorEmotionRecord {
  readonly id: ActorEmotionId
  readonly actorId: ActorId
  readonly emotion: string
  readonly intensity: number
  readonly toward: string[]
  readonly cause?: string | undefined
  readonly impulse?: string | undefined
}

/** One Actor's subjective posture toward a proposition, never a world-truth verdict. */
export type ActorBeliefStance = 'believe' | 'suspect' | 'doubt' | 'disbelieve' | 'uncertain'

/** Current revision of one subjective proposition, explicitly distinct from world truth. */
export interface ActorBeliefSnapshot {
  readonly id: ActorBeliefId
  readonly actorId: ActorId
  readonly revision: number
  readonly proposition: string
  readonly stance: ActorBeliefStance
  readonly confidence: number
  readonly about: string[]
}

/** Supported private dimensions whose revisions describe one Actor's relationship to a subject. */
export type ActorRelationshipDimension =
  | 'trust'
  | 'affection'
  | 'fear'
  | 'respect'
  | 'resentment'
  | 'loyalty'
  | 'suspicion'
  | 'dependence'

/** Current revision of one Actor's private relationship dimension toward another subject. */
export interface ActorRelationshipSnapshot {
  readonly id: ActorRelationshipId
  readonly actorId: ActorId
  readonly revision: number
  readonly target: string
  readonly dimension: ActorRelationshipDimension
  /** Accumulated bounded value from -5 through 5. */
  readonly value: number
  readonly reason: string
}

/** Explicit core memory selected by the Actor. */
export interface ActorMemoryRecord {
  readonly id: ActorMemoryId
  readonly actorId: ActorId
  readonly content: string
  readonly importance: number
  readonly tags: string[]
  readonly sourceRefs: string[]
  readonly meaning?: string | undefined
}

/** Semantic posture an Actor takes when deliberately releasing an active memory. */
export type ActorMemoryReleaseMode = 'fade' | 'suppress' | 'reject' | 'let-go'

/** Semantic memory-release intent plus the memories selected by the host resolver. */
export interface ActorMemoryReleaseRecord {
  readonly id: ActorMemoryReleaseId
  readonly actorId: ActorId
  readonly about: string
  readonly mode: ActorMemoryReleaseMode
  readonly reason?: string | undefined
  readonly matchedMemoryIds: ActorMemoryId[]
}

/** Player/host view of memory including its active or forgotten projection. */
export interface ActorMemoryView extends ActorMemoryRecord {
  readonly status: 'active' | 'forgotten'
  readonly forgottenReason?: string
}

/** Durable state domain changed by one meaningful character turning point. */
export type ActorTurningPointDimension =
  | 'belief'
  | 'goal'
  | 'relationship'
  | 'conflict'
  | 'identity'
  | 'memory'

/** One player-readable before/after consequence within a character turning point. */
export interface ActorTurningPointChange {
  readonly dimension: ActorTurningPointDimension
  readonly subject: string
  readonly before?: string | undefined
  readonly after: string
}

/** Current revision of one Actor-owned interpretation of a meaningful change. */
export interface ActorTurningPointSnapshot {
  readonly id: ActorTurningPointId
  readonly actorId: ActorId
  readonly revision: number
  readonly trigger: string
  readonly interpretation: string
  readonly significance: number
  readonly status: 'tentative' | 'integrated' | 'reversed' | 'rejected'
  readonly changes: ActorTurningPointChange[]
  readonly sourceRefs: string[]
  readonly createdAt: string
  readonly updatedAt: string
}

/** Whole goal value; abandonment appends a contiguous new revision. */
export interface ActorGoalSnapshot {
  readonly id: ActorGoalId
  readonly actorId: ActorId
  readonly revision: number
  readonly description: string
  readonly priority: number
  readonly status: 'active' | 'completed' | 'abandoned'
  readonly reason?: string
}

/** Minimal scheduler trigger for the foundation slice. */
export interface ActorWorldTimeTrigger {
  readonly kind: 'world-time'
  readonly at: string
}

/** Deferred condition attached to one durable future intention. */
export type ActorIntentionTrigger =
  | { readonly kind: 'soon' }
  | ActorWorldTimeTrigger
  | { readonly kind: 'event'; readonly when: string }
  | { readonly kind: 'condition'; readonly condition: string }

/** One durable future intention. Execution is delegated to a later scheduler package. */
export interface ActorIntentionRecord {
  readonly id: ActorIntentionId
  readonly actorId: ActorId
  readonly description: string
  readonly trigger: ActorIntentionTrigger
  readonly commitment: number
  readonly status: 'scheduled'
}

/** How an expression is meant to be delivered in the fictional world. */
export type ActorSpeechDelivery = 'spoken' | 'whispered' | 'written'

/** Actor-authored or player-embodied speech intent. */
export type ActorExpressionRecord =
  | {
    readonly id: ActorExpressionId
    readonly actorId: ActorId
    readonly origin: 'actor'
    readonly text: string
    readonly audience: string[]
    readonly delivery: ActorSpeechDelivery
    readonly tone?: string | undefined
    readonly intent?: ActorSpeechIntent | undefined
  }
  | {
    readonly id: ActorExpressionId
    readonly actorId: ActorId
    readonly origin: 'player'
    readonly playerInterventionId: PlayerInterventionId
    readonly text: string
    readonly audience: string[]
    readonly delivery: ActorSpeechDelivery
    readonly tone?: string | undefined
    readonly intent?: ActorSpeechIntent | undefined
  }

/** Actor-authored or player-embodied action intent. */
export type ActorActionRecord =
  | {
    readonly id: ActorActionId
    readonly actorId: ActorId
    readonly origin: 'actor'
    readonly description: string
    readonly target?: string
    readonly purpose?: string | undefined
    readonly manner?: string | undefined
  }
  | {
    readonly id: ActorActionId
    readonly actorId: ActorId
    readonly origin: 'player'
    readonly playerInterventionId: PlayerInterventionId
    readonly description: string
    readonly target?: string
    readonly purpose?: string | undefined
    readonly manner?: string | undefined
  }

/** Explicit reason an Actor declared its current turn complete. */
export type ActorTurnCloseReason = 'yield' | 'forget' | 'implicit-silence'

/** Optional communicative intent attached to Actor-authored or player-embodied speech. */
export type ActorSpeechIntent =
  | 'sincere'
  | 'question'
  | 'command'
  | 'promise'
  | 'proposal'
  | 'threat'
  | 'comfort'
  | 'lie'
  | 'mislead'
  | 'evade'

/** Observable posture reported when an Actor closes its autonomous turn. */
export type ActorTurnPosture = 'finished' | 'silent' | 'watching' | 'waiting' | 'hesitating' | 'withdrawing'

/** Autonomous preference reported by an Actor while it owns a discussion floor. */
export interface ActorDiscussionIntent {
  readonly stance?: string | undefined
  readonly eagerness: 'low' | 'medium' | 'high'
  readonly action: 'speak' | 'pass' | 'conclude'
  readonly nextSpeakerId?: string | undefined
}

/** Source references selected by an Actor for an ongoing matter; text stays in the original event. */
export interface ActorContinuityRequest {
  readonly operation: 'keep' | 'respond' | 'resolve' | 'revise' | 'withdraw'
  readonly kind?: 'promise' | 'condition' | 'question' | 'clue' | undefined
  readonly itemId?: string | undefined
  readonly behaviorIndex?: number | undefined
  readonly eventId?: string | undefined
}

/** Player event independent from any Actor, or explicitly embodied through one. */
export type PlayerInterventionRecord =
  | {
    readonly id: PlayerInterventionId
    readonly kind: 'story-direction'
    readonly content: string
  }
  | {
    readonly id: PlayerInterventionId
    readonly kind: 'world-intervention'
    readonly content: string
  }
  | {
    readonly id: PlayerInterventionId
    readonly kind: 'embody-speech'
    readonly targetActorId: ActorId
    readonly content: string
    readonly audience: string[]
    readonly delivery: ActorSpeechDelivery
  }
  | {
    readonly id: PlayerInterventionId
    readonly kind: 'embody-action'
    readonly targetActorId: ActorId
    readonly content: string
    readonly target?: string
  }

/** Complete private projection available to trusted PlayerAuthority hosts. */
export interface ActorPrivateView {
  readonly knowledge: import('./knowledge.ts').KnowledgeState
  readonly dynamicState: DynamicState
  readonly descriptor: ActorDescriptor
  readonly thoughts: ActorThoughtRecord[]
  readonly emotions: ActorEmotionRecord[]
  readonly beliefs: ActorBeliefSnapshot[]
  readonly relationships: ActorRelationshipSnapshot[]
  readonly memories: ActorMemoryView[]
  readonly memoryReleases: ActorMemoryReleaseRecord[]
  readonly turningPoints: ActorTurningPointSnapshot[]
  readonly goals: ActorGoalSnapshot[]
  readonly intentions: ActorIntentionRecord[]
  readonly expressions: ActorExpressionRecord[]
  readonly actions: ActorActionRecord[]
  readonly playerInterventions: PlayerInterventionRecord[]
}

/** Bounded state inserted into the Actor's dynamic policy prompt. */
export interface ActorModelContext {
  readonly knowledge: import('./knowledge.ts').KnowledgeState
  readonly dynamicState: DynamicState
  readonly descriptor: ActorDescriptor
  readonly memories: ActorMemoryRecord[]
  readonly journey: ActorTurningPointSnapshot[]
  readonly emotions: ActorEmotionRecord[]
  readonly beliefs: ActorBeliefSnapshot[]
  readonly relationships: ActorRelationshipSnapshot[]
  readonly goals: ActorGoalSnapshot[]
  readonly intentions: ActorIntentionRecord[]
  readonly recentExpressions: ActorExpressionRecord[]
  readonly recentActions: ActorActionRecord[]
}

/** Request to persist fictional inner activity. */
export interface ReflectRequest {
  readonly content: string
  readonly about?: readonly string[]
  readonly conclusion?: string
}
/** Request to record one private emotional occurrence. */
export interface FeelRequest {
  readonly emotion: string
  readonly intensity: number
  readonly toward?: readonly string[]
  readonly cause?: string
  readonly impulse?: string
}
/** Request to create or revise one subjective belief. */
export interface BelieveRequest {
  readonly proposition: string
  readonly stance: ActorBeliefStance
  readonly confidence?: number
  readonly about?: readonly string[]
}
/** Request to shift one private relationship dimension. */
export interface RelateRequest {
  readonly target: string
  readonly dimension: ActorRelationshipDimension
  readonly shift: -2 | -1 | 1 | 2
  readonly reason: string
}
/** Request to deliberately form one core memory. */
export interface RememberRequest {
  readonly content: string
  readonly importance?: number
  readonly tags?: readonly string[]
  readonly sourceRefs?: readonly string[]
  readonly meaning?: string
}
/** Active-memory query. */
export interface RecallRequest { readonly query?: string; readonly limit?: number }
/** Request to tombstone one active memory. */
export interface ForgetRequest { readonly memoryId: ActorMemoryId; readonly reason?: string }
/** Model-friendly semantic memory release; the host resolves matching records. */
export interface ReleaseMemoryRequest {
  readonly about: string
  readonly mode?: ActorMemoryReleaseMode
  readonly reason?: string
}

/** Request to persist one significant Actor-owned interpretation of material state changes. */
export interface RecordTurningPointRequest {
  readonly trigger: string
  readonly interpretation: string
  readonly significance: number
  readonly changes: readonly ActorTurningPointChange[]
  readonly sourceRefs?: readonly string[]
  readonly status?: 'tentative' | 'integrated'
}

/** Exact-revision player replacement of one visible character turning point. */
export interface UpdateTurningPointRequest {
  readonly turningPointId: ActorTurningPointId
  readonly expectedRevision: number
  readonly trigger: string
  readonly interpretation: string
  readonly significance: number
  readonly status: 'tentative' | 'integrated' | 'reversed' | 'rejected'
  readonly changes: readonly ActorTurningPointChange[]
  readonly sourceRefs: readonly string[]
}
/** Request to create one active goal. */
export interface SetGoalRequest { readonly description: string; readonly priority?: number }
/** Authored lifecycle records instantiated once, independently of model mutation capabilities. */
export interface ActorInitialContext {
  readonly memories?: readonly RememberRequest[]
  readonly goals?: readonly SetGoalRequest[]
  readonly intentions?: readonly ScheduleIntentionRequest[]
}
/** Request to abandon one active goal. */
export interface AbandonGoalRequest { readonly goalId: ActorGoalId; readonly reason?: string }
/** Request to schedule one future intention. */
export interface ScheduleIntentionRequest {
  readonly description: string
  readonly trigger: ActorIntentionTrigger
  readonly commitment?: number
}
/** Request to speak through the fictional-world output seam. */
export interface SpeakRequest {
  readonly text: string
  readonly audience?: readonly string[]
  readonly delivery?: ActorSpeechDelivery
  readonly tone?: string
  readonly intent?: ActorSpeechIntent
}
/** Request to attempt a fictional-world action. */
export interface ActRequest {
  readonly description: string
  readonly target?: string
  readonly purpose?: string
  readonly manner?: string
}

/** Whole-goal transition requested by the model-friendly Actor tool. */
export type ActorGoalOperation = 'adopt' | 'pursue' | 'reprioritize' | 'complete' | 'abandon'
/** Request to adopt, revise, complete, or abandon one goal by description. */
export interface ChangeGoalRequest {
  readonly operation: ActorGoalOperation
  readonly goal: string
  readonly priority?: number
  readonly reason?: string
}

/** Result of the player speaking through an Actor with preserved provenance. */
export interface PlayerSpeechResult {
  readonly intervention: Extract<PlayerInterventionRecord, { kind: 'embody-speech' }>
  readonly expression: Extract<ActorExpressionRecord, { origin: 'player' }>
}

/** Result of the player acting through an Actor with preserved provenance. */
export interface PlayerActionResult {
  readonly intervention: Extract<PlayerInterventionRecord, { kind: 'embody-action' }>
  readonly action: Extract<ActorActionRecord, { origin: 'player' }>
}
