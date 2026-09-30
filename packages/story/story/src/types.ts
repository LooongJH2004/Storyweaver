import type { StoryDiscussionState } from '@deepseek-ai/dsh-roleplay-core/discussion-model'
/** Browser-safe Story identity and Host-domain read contracts. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { JsonValue, SessionId } from '@deepseek-ai/dsh-session/types'

/** Opaque stable identity of one Story aggregate. */
export type StoryId = Branded<'StoryId'>

/** Semantic role of a Session inside a Story. */
export type StorySessionRole = 'control' | 'scene' | 'actor'

/** One Session's durable ownership inside a Story. */
export interface StorySessionRegistration {
  readonly sessionId: SessionId
  readonly role: StorySessionRole
  /** Stable fictional Actor identity; present exactly for actor-role Sessions. */
  readonly actorId?: string | undefined
  /** Latest durable Actor-domain Session event; present only for Actor Sessions. */
  readonly actorStateRevision?: number | undefined
  readonly createdAt: string
  /** ISO archive instant; archived Sessions remain auditable but disappear from active views. */
  readonly archivedAt?: string | undefined
}

export type { KnowledgeId, PersonReference, KnowledgeState, KnowledgeEntry, KnowledgeChange, KnowledgeAuthority, InitialKnowledge } from '@deepseek-ai/dsh-roleplay-core/knowledge'
export type { StoryCharacters, StoryCharacter, CharacterEncounter } from '@deepseek-ai/dsh-roleplay-core/characters'

/** Location and semantic role of one Session known to the registry. */
export interface StorySessionOwner {
  readonly storyId: StoryId
  readonly role: StorySessionRole
  readonly actorId?: string | undefined
  readonly archived: boolean
}

/** One persistent NPC speech or action accepted from an Actor tool event. */
export type PlotLedgerNpcEvent =
  | {
    readonly kind: 'speech'
    readonly ledgerRevision: number
    readonly actorId: string
    readonly sessionId: SessionId
    readonly actorEventSeq: number
    readonly operationIndex?: number | undefined
    readonly toolCallEventSeq: number
    readonly text: string
    readonly audience: readonly string[]
    readonly delivery: 'spoken' | 'whispered' | 'written'
  }
  | {
    readonly kind: 'action-intent'
    readonly ledgerRevision: number
    readonly actorId: string
    readonly sessionId: SessionId
    readonly actorEventSeq: number
    readonly operationIndex?: number | undefined
    readonly toolCallEventSeq: number
    readonly description: string
    readonly target?: string | undefined
  }

/** Model-stream fragments that are safe to mirror into a player-only Actor attempt projection. */
export type StoryActorStreamChunk =
  | { readonly type: 'text-delta'; readonly index: number; readonly text: string }
  | { readonly type: 'reasoning-delta'; readonly index: number; readonly text: string }
  | {
    readonly type: 'tool-call-delta'
    readonly index: number
    readonly id: string
    readonly name?: string | undefined
    readonly argumentsDelta: string
  }

/** Actor-specific information supplied by a Director without choosing that Actor's response. */
export interface DirectorActorBrief {
  readonly actorId: string
  readonly perceptions: readonly string[]
  readonly uncertainties: readonly string[]
}

/** Strict caller input for one Director planning commit. */
export interface DirectorBriefInput {
  readonly expectedLedgerRevision: number
  readonly sceneSessionId: SessionId
  readonly situation: string
  readonly establishedFacts: readonly string[]
  readonly openThreads: readonly string[]
  readonly actorBriefs: readonly DirectorActorBrief[]
}

/** Durable Director planning record. It describes context but grants no character speech or action authority. */
export interface DirectorBrief {
  readonly sourceLedgerRevision: number
  readonly ledgerRevision: number
  readonly directorSessionId: SessionId
  readonly sceneSessionId: SessionId
  readonly situation: string
  readonly establishedFacts: readonly string[]
  readonly openThreads: readonly string[]
  readonly actorBriefs: readonly DirectorActorBrief[]
  /** NPC tool events considered by this planning commit. */
  readonly sourceNpcEvents: readonly PlotLedgerNpcEvent[]
  readonly createdAt: string
}

/** Durable lifecycle of one Director Brief and its autonomous Actor dispatches. */
export type DirectorRunStatus =
  | 'brief_committed'
  | 'dispatching'
  | 'paused'
  | 'awaiting_retry'
  | 'completed'
  | 'cancelled'

/** Opaque ownership identity of one Actor dispatch attempt. */
export type DirectorRunAttemptId = Branded<'DirectorRunAttemptId'>

/** Serializable failure retained for one resumable Actor dispatch. */
export interface DirectorRunFailure {
  readonly code: string
  readonly message: string
}

/** Latest durable ownership interval for one Actor dispatch generation. */
export interface DirectorRunAttempt {
  readonly attemptId: DirectorRunAttemptId
  readonly generation: number
  readonly actorSessionId: SessionId
  /** Last durable Actor Session event before this attempt was dispatched. */
  readonly afterEventSeq: number
  readonly startedAt: string
}

/** Host-minted ownership fields used to begin one Actor attempt. */
export interface DirectorActorDispatchAttemptInput {
  readonly actorId: string
  readonly attemptId: DirectorRunAttemptId
  readonly actorSessionId: SessionId
  readonly afterEventSeq: number
}

/** Per-Actor checkpoint inside one Director run. */
export interface DirectorRunActor {
  readonly actorId: string
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled'
  readonly attempts: number
  /** Monotonic attempt ownership generation; zero before the first dispatch. */
  readonly generation: number
  /** Latest attempt, retained after settlement for audit and idempotency. */
  readonly attempt?: DirectorRunAttempt | undefined
  /** Stable `sessionId:actorEventSeq` references already accepted for this run. */
  readonly eventRefs: readonly string[]
  readonly failure?: DirectorRunFailure | undefined
}

/** Latest durable orchestration checkpoint. Completed runs remain available for audit. */
export interface DirectorRun {
  readonly id: string
  /** Exact optimistic-concurrency revision for player control operations. */
  readonly revision: number
  readonly briefLedgerRevision: number
  readonly directorSessionId: SessionId
  readonly sceneSessionId: SessionId
  readonly status: DirectorRunStatus
  readonly actors: readonly DirectorRunActor[]
  readonly createdAt: string
  readonly updatedAt: string
}

/** Host-owned result used to settle one attempted Actor dispatch. */
export interface DirectorActorDispatchOutcome {
  readonly actorId: string
  readonly attemptId: DirectorRunAttemptId
  readonly generation: number
  readonly status: 'completed' | 'failed'
  readonly eventRefs: readonly string[]
  readonly failure?: DirectorRunFailure | undefined
}

/** Host orchestration provider used by player and Director control surfaces. */
export interface DirectorRunExecutor {
  /**
   * Resume unfinished Actors over an exact Run revision.
   * @param storyId - Story whose Run resumes.
   * @param expectedRunRevision - Exact current Run revision.
   * @returns the Story after selected Actors settle.
   */
  resume(storyId: StoryId, expectedRunRevision: number): Promise<Story>
  /**
   * Retry one failed or cancelled Actor over an exact Run revision.
   * @param storyId - Story whose Actor retries.
   * @param expectedRunRevision - Exact current Run revision.
   * @param actorId - Failed or cancelled Actor identity.
   * @returns the Story after the Actor settles.
   */
  retryActor(storyId: StoryId, expectedRunRevision: number, actorId: string): Promise<Story>
  /**
   * Pause a Run and abort all active attempts over an exact revision.
   * @param storyId - Story whose Run pauses.
   * @param expectedRunRevision - Exact current Run revision.
   * @returns the paused Story checkpoint.
   */
  pause(storyId: StoryId, expectedRunRevision: number): Promise<Story>
  /**
   * Cancel a Run terminally over an exact revision.
   * @param storyId - Story whose Run is cancelled.
   * @param expectedRunRevision - Exact current Run revision.
   * @returns the terminally cancelled Story checkpoint.
   */
  cancel(storyId: StoryId, expectedRunRevision: number): Promise<Story>
  /**
   * Skip one incomplete Actor over an exact Run revision.
   * @param storyId - Story whose Actor is skipped.
   * @param expectedRunRevision - Exact current Run revision.
   * @param actorId - Incomplete Actor identity.
   * @returns the changed Story checkpoint.
   */
  skipActor(storyId: StoryId, expectedRunRevision: number, actorId: string): Promise<Story>
  /**
   * Cancel one running Actor attempt over an exact Run revision.
   * @param storyId - Story whose Actor attempt is cancelled.
   * @param expectedRunRevision - Exact current Run revision.
   * @param actorId - Running Actor identity.
   * @returns the changed resumable Story checkpoint.
   */
  cancelActor(storyId: StoryId, expectedRunRevision: number, actorId: string): Promise<Story>
}

/** Current durable orchestration state for one Story. Actor logs remain the source of NPC behavior. */
export interface PlotLedger {
  readonly revision: number
  readonly situation: string
  readonly establishedFacts: readonly string[]
  readonly openThreads: readonly string[]
  readonly pendingNpcEvents: readonly PlotLedgerNpcEvent[]
  readonly latestBrief?: DirectorBrief | undefined
  readonly directorRun?: DirectorRun | undefined
}

export type { DirectorOutlineAuthor, DirectorOutlineUpdateMode, DirectorOutlineItemIdentity, DirectorOutlineTextItem, DirectorStoryArc, DirectorPlotBeat, DirectorForeshadow, DirectorMystery, DirectorNarrativeClock, DirectorOutlinePlayerInput, DirectorOutlinePatchInput, DirectorOutlineSuggestion, DirectorOutlineRevision, DirectorOutline } from '@deepseek-ai/dsh-roleplay-core/outline-model'
import type { DirectorOutline } from '@deepseek-ai/dsh-roleplay-core/outline-model'

/** A path-addressed, schema-checked mutation of authoritative world facts. */
export type WorldPatchOperation =
  | { readonly op: 'set'; readonly path: readonly string[]; readonly value: JsonValue }
  | { readonly op: 'remove'; readonly path: readonly string[] }

/** Source and outcome of one authoritative world transition. */
export interface WorldEvent {
  readonly speakerRefs?: Readonly<Record<string, string>> | undefined
  readonly identityLabels?: Readonly<Record<string, string>> | undefined
  readonly id: string
  readonly revision: number
  readonly kind: 'player-direction' | 'player-world-intervention' | 'player-speech' | 'player-action'
    | 'actor-speech' | 'actor-action' | 'director-scene' | 'director-narration'
  readonly summary: string
  readonly status: 'established' | 'rejected'
  readonly source: 'player' | 'actor' | 'director'
  readonly actorId?: string | undefined
  readonly sourceEventRef?: string | undefined
  readonly patch: readonly WorldPatchOperation[]
  readonly audience: readonly string[]
  readonly createdAt: string
}

/** Host-managed physical cast of the currently framed scene. */
export interface StorySceneCast {
  readonly schemaVersion: 1
  readonly sceneId: string
  readonly location: string
  readonly presentActorIds: readonly string[]
}

/** Exact-revision Director request that changes the physical scene cast. */
export interface DirectorSceneCastInput {
  readonly perceptions?: readonly import('@deepseek-ai/dsh-roleplay-core/characters').PerceptionDelivery[] | undefined
  readonly appearances?: readonly { actorId: string; key: string; label: string }[] | undefined
  readonly expectedWorldRevision: number
  readonly sceneId: string
  readonly location: string
  readonly summary: string
  readonly presentActorIds: readonly string[]
}

/** Exact-revision Director narration that advances the objective world without impersonating an Actor. */
export interface DirectorNarrationInput {
  readonly perceptions?: readonly import('@deepseek-ai/dsh-roleplay-core/characters').PerceptionDelivery[] | undefined
  readonly stateChanges?: { readonly changes: readonly import('@deepseek-ai/dsh-roleplay-core/dynamic-state').StateChange[]; readonly actorIds: readonly string[] }
  readonly expectedWorldRevision: number
  /** Stable idempotency key owned by the current Director Brief. */
  readonly sourceEventRef: string
  /** Concise canonical event summary retained in World State and Actor perceptions. */
  readonly summary: string
  readonly audience: readonly string[]
  readonly patch: readonly WorldPatchOperation[]
}

/** Actor-scoped knowledge delivery derived from an established world event. */
export interface ActorPerception {
  readonly id: string
  readonly worldRevision: number
  readonly actorId: string
  readonly sourceEventId: string
  readonly content: string
  readonly createdAt: string
}

/** Durable authoritative world state and its actor-specific delivery ledger. */
export interface StoryWorldState {
  readonly characters: import('@deepseek-ai/dsh-roleplay-core/characters').StoryCharacters
  readonly dynamicState: import('@deepseek-ai/dsh-roleplay-core/dynamic-state').DynamicState
  readonly stateInitialized: boolean
  readonly context: import('@deepseek-ai/dsh-roleplay-core/context-retention').StoryContextRetention
  readonly revision: number
  readonly facts: Readonly<Record<string, JsonValue>>
  readonly events: readonly WorldEvent[]
  readonly perceptions: readonly ActorPerception[]
  /** Source-backed changes to promises, conditions, questions, and clues. */
  readonly continuity: readonly StoryContinuityChange[]
}

/** One immutable, audience-scoped change to an ongoing story matter. */
export interface StoryContinuityChange {
  readonly id: string
  readonly actorId: string
  readonly operation: 'keep' | 'respond' | 'resolve' | 'revise' | 'withdraw'
  readonly kind: 'promise' | 'condition' | 'question' | 'clue'
  readonly itemId: string
  readonly sourceEventId: string
  readonly text: string
  readonly audience: readonly string[]
  readonly private: boolean
  readonly createdAt: string
}

/** Host-resolved Actor annotation; the source must already be established and visible. */
export interface StoryContinuityInput {
  readonly id: string
  readonly operation: StoryContinuityChange['operation']
  readonly kind?: StoryContinuityChange['kind'] | undefined
  readonly itemId?: string | undefined
  readonly sourceEventId: string
  readonly private: boolean
}

/** Current interpretation of an ongoing matter for one permitted viewer. */
export interface StoryContinuityItem {
  readonly id: string
  readonly actorId: string
  readonly kind: StoryContinuityChange['kind']
  readonly status: 'open' | 'resolved' | 'withdrawn'
  readonly text: string
  readonly sourceEventIds: readonly string[]
  readonly private: boolean
}

/** Exact-revision input shared by the typed PlayerAuthority operations. */
export interface PlayerAuthorityBaseInput {
  readonly expectedWorldRevision: number
  readonly audience: readonly string[]
}

/** Player-selected narrative direction. It guides the Director but does not impersonate an Actor. */
export interface PlayerDirectionInput extends PlayerAuthorityBaseInput {
  readonly direction: string
}

/** Player-authored authoritative change to world facts. */
export interface PlayerWorldInterventionInput extends PlayerAuthorityBaseInput {
  readonly summary: string
  readonly patch: readonly WorldPatchOperation[]
}

/** Player-authored speech embodied as one named character. */
export interface PlayerSpeechInput extends PlayerAuthorityBaseInput {
  readonly actorId: string
  readonly text: string
  readonly delivery: 'spoken' | 'whispered' | 'written'
}

/** Player-authored action embodied as one named character. */
export interface PlayerActionInput extends PlayerAuthorityBaseInput {
  readonly actorId: string
  readonly description: string
  readonly target?: string | undefined
  readonly patch: readonly WorldPatchOperation[]
}

/** One Director decision for an Actor behavior event captured by the Plot Ledger. */
export interface ActorWorldSettlement {
  readonly sourceEventRef: string
  readonly accepted: boolean
  readonly summary: string
  readonly audience: readonly string[]
  readonly patch: readonly WorldPatchOperation[]
}

/** Atomic Director settlement for one or more Actor behavior events at one world revision. */
export interface ActorWorldSettlementBatchInput {
  readonly expectedWorldRevision: number
  readonly settlements: readonly ActorWorldSettlement[]
}

/** Exact-revision convenience input for callers that settle one Actor behavior event. */
export interface ActorWorldSettlementInput extends ActorWorldSettlement {
  readonly expectedWorldRevision: number
}

/** One long-story summary with an explicit review and supersession lifecycle. */
export interface StoryMemoryEntry {
  readonly id: string
  readonly revision: number
  readonly kind: 'scene' | 'arc'
  readonly status: 'proposed' | 'approved' | 'rejected' | 'superseded'
  readonly title: string
  /** Omniscient continuity available only to the Director. */
  readonly directorSummary: string
  /** Shared recollection containing only facts available to the whole active cast. */
  readonly publicSummary: string
  /** Subjective recollection available only to the matching Actor. */
  readonly actorMemories: Readonly<Record<string, string>>
  readonly eventRefs: readonly string[]
  /** Exact approved entries replaced after coverage validation. */
  readonly replaces: readonly string[]
  /** Actors who shared the public recollection when it was proposed. */
  readonly publicAudience: readonly string[]
  readonly proposedBy: 'player' | 'director' | 'system'
  readonly createdAt: string
  readonly reviewedAt?: string | undefined
  readonly supersededBy?: string | undefined
}

/** Durable reviewed long-story memory. */
export interface StoryMemoryState {
  readonly revision: number
  readonly entries: readonly StoryMemoryEntry[]
}

/** Strict proposal input; proposals are never model-visible as established memory before approval. */
export interface StoryMemoryProposalInput {
  readonly expectedRevision: number
  readonly kind: 'scene' | 'arc'
  readonly title: string
  readonly directorSummary: string
  readonly publicSummary: string
  readonly actorMemories: Readonly<Record<string, string>>
  readonly eventRefs: readonly string[]
  readonly replaces?: readonly string[] | undefined
  readonly publicAudience?: readonly string[] | undefined
  readonly proposedBy: 'player' | 'director' | 'system'
}

/** Exact-revision replacement of player-editable content in one durable memory entry. */
export interface StoryMemoryUpdateInput {
  readonly expectedRevision: number
  readonly memoryId: string
  readonly kind: 'scene' | 'arc'
  readonly title: string
  readonly directorSummary: string
  readonly publicSummary: string
  readonly actorMemories: Readonly<Record<string, string>>
  readonly eventRefs: readonly string[]
  readonly replaces?: readonly string[] | undefined
}

export type { StoryDiscussionTurn, StoryDiscussionParticipantIntent, StoryDiscussion, StoryDiscussionState } from '@deepseek-ai/dsh-roleplay-core/discussion-model'

/** Host-rendered Storyweaver context section ids. */
export type StoryBuiltinContextSectionId =
  | 'policy' | 'tools' | 'identity' | 'reasoning-language' | 'director-prompt' | 'actor-prompt'
  | 'director-reasoning-mode' | 'actor-reasoning-mode'
  | 'storybook' | 'world' | 'memory'
  | 'plot-ledger' | 'director-outline' | 'director-brief' | 'discussion' | 'actor-state' | 'style' | 'scene-style'

/** Configurable Storyweaver context section id; schemas enforce built-ins or the strict `custom:*` form. */
export type StoryContextSectionId = string

/** Actual model-message identity assigned to one context module. */
export type StoryContextMessageRole = 'system' | 'user' | 'assistant'

/** Editable baseline rule text stored in the storybook and optionally overridden per Story. */
export type StoryContextRuleKey = 'director-policy' | 'director-tools' | 'actor-policy' | 'actor-tools'

/** One ordered context section definition. */
export interface StoryContextRecipeSection {
  readonly id: StoryContextSectionId
  readonly enabled: boolean
  readonly role: StoryContextMessageRole
  /** Player-facing title for an editable reasoning-mode or custom module. */
  readonly title?: string | undefined
  /** Exact model-facing body for an editable reasoning-mode or custom module. */
  readonly content?: string | undefined
}

/** Player-editable context assembly recipe. Host permissions remain code-enforced. */
export interface StoryContextRecipe {
  readonly revision: number
  readonly director: readonly StoryContextRecipeSection[]
  readonly actor: readonly StoryContextRecipeSection[]
}

/** Story-domain state restored when a scene history rewrite returns to a player-turn checkpoint. */
export interface StoryRuntimeSnapshot {
  readonly plotLedger: PlotLedger
  readonly directorOutline: DirectorOutline
  readonly world: StoryWorldState
  readonly memory: StoryMemoryState
  readonly discussions: StoryDiscussionState
}

/** Full current context sections, before request batching and sender serialization. */
export interface StoryContextSnapshot {
  readonly sections: readonly {
    readonly id: StoryContextSectionId
    readonly title?: string
    readonly role: StoryContextMessageRole
    /** Complete section text, including the runtime's heading. */
    readonly content: string
  }[]
  /** Preview never creates lifecycle records or an Actor Session. */
  readonly pendingActorInitialization: boolean
}

/** Read-only runtime context provider shared by actual requests and configuration preview. */
export interface StoryContextRenderer {
  /**
   * Render current effective sections using the configured runtime projection.
   * @param storyId - Exact Story to inspect.
   * @param audience - Director or private Actor recipient.
   * @param actorId - Required identity for an Actor recipient.
   * @returns current sections; uninitialized Actor state is explicitly absent.
   */
  render(storyId: StoryId, audience: 'director' | 'actor', actorId?: string): Promise<StoryContextSnapshot>
}

/** Revision-checked objective state mutation and its perceptible audience. */
export interface WorldStateChangeInput {
  readonly expectedWorldRevision: number
  readonly changes: readonly import('@deepseek-ai/dsh-roleplay-core/dynamic-state').StateChange[]
  readonly actorIds: readonly string[]
  readonly audience: readonly string[]
  readonly summary: string
  readonly origin: 'director' | 'player'
  readonly sourceEventRef?: string
}

/** Portable scene-turn checkpoints and exact Actor log boundaries. */
export interface StoryTurnCheckpointFile {
  readonly version: 3
  readonly entries: readonly {
    readonly sceneSessionId: string
    readonly userMessageSeq: number
    readonly createdAt: string
    readonly snapshot: StoryRuntimeSnapshot
    readonly actorSurfaceEnds: Readonly<Record<string, number | null>>
    readonly actorEventEnds: Readonly<Record<string, number | null>>
  }[]
}

/** Story-local prompt replacements layered after the storybook defaults and locked system policy. */
export interface StoryPromptOverrides {
  readonly styles: import('@deepseek-ai/dsh-roleplay-core/style').StyleOverrides
  readonly revision: number
  readonly creatorPrompt?: string | undefined
  readonly directorPrompt?: string | undefined
  readonly reasoningLanguage?: string | undefined
  readonly actorPrompts: Readonly<Record<string, string>>
  readonly contextRules: Readonly<Partial<Record<StoryContextRuleKey, string>>>
}

/** Read-only authoritative Story entity exposed by the Host registry. */
export interface Story {
  readonly id: StoryId
  /** Stable authored-setting identity shared by independent Story runs. */
  readonly templateId: string
  /** Whether this record retains authored settings without representing a runtime Story. */
  readonly templateOnly: boolean
  readonly title: string
  readonly premise: string
  readonly sessions: readonly StorySessionRegistration[]
  readonly currentSceneSessionId: SessionId | undefined
  readonly createdAt: string
  readonly updatedAt: string
  readonly archivedAt: string | undefined
  readonly plotLedger: PlotLedger
  readonly directorOutline: DirectorOutline
  readonly world: StoryWorldState
  readonly memory: StoryMemoryState
  readonly discussions: StoryDiscussionState
  readonly contextRecipe: StoryContextRecipe
  readonly promptOverrides: StoryPromptOverrides
  /** Active scene Sessions in manual, newest-first order. */
  readonly sceneSessionIds: readonly SessionId[]
  /** Active control Session when one has been registered. */
  readonly controlSessionId: SessionId | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Read-only scene projection of behavior whose authority remains the referenced NPC Actor tool event. */
    'story/npc-event-projected': {
      readonly version: 1
      readonly event: PlotLedgerNpcEvent
    }
    /** Player-visible prose for one authoritative Director narration event. */
    'story/director-narration-projected': {
      readonly version: 1
      readonly worldEventId: string
      readonly worldRevision: number
      readonly briefLedgerRevision: number
      readonly turn: number
      readonly step: number
      readonly content: string
    }
    /** Player-visible scene projection of a private Actor model response's reasoning block. */
    'story/actor-reasoning-projected': {
      readonly version: 1
      readonly actorId: string
      readonly actorSessionId: SessionId
      readonly attemptId: DirectorRunAttemptId
      readonly generation: number
      readonly assistantEventSeq: number
      readonly blockIndex: number
      readonly content: string
    }
    /** Start of one player-visible autonomous Actor attempt in the current scene. */
    'story/actor-attempt-started': {
      readonly displayLabel?: string | undefined
      readonly perspectiveLabels?: Readonly<Record<string, string>> | undefined
      readonly version: 1 | 2
      readonly actorId: string
      readonly actorSessionId: SessionId
      readonly attemptId: DirectorRunAttemptId
      readonly generation: number
      /** Owning Scene turn. Version 1 records omitted it and inherited stream position. */
      readonly turn?: number
      /** Owning Scene step. Version 1 records omitted it and inherited stream position. */
      readonly step?: number
    }
    /** Incremental private model output mirrored from the Actor Session while an attempt is running. */
    'story/actor-attempt-chunk-projected': {
      readonly version: 1 | 2
      readonly actorId: string
      readonly actorSessionId: SessionId
      readonly attemptId: DirectorRunAttemptId
      readonly generation: number
      /** Owning Scene turn. In version 1 this field incorrectly held the Actor-local turn. */
      readonly turn: number
      /** Owning Scene step. In version 1 this field incorrectly held the Actor-local step. */
      readonly step: number
      /** Actor-local model turn, separated from the Scene transcript coordinates in version 2. */
      readonly actorTurn?: number
      /** Actor-local model step, separated from the Scene transcript coordinates in version 2. */
      readonly actorStep?: number
      readonly chunk: StoryActorStreamChunk
    }
    /** Authoritative completion of one Actor attempt, including only accepted world-facing events. */
    'story/actor-attempt-settled': {
      readonly version: 1 | 2
      readonly actorId: string
      readonly actorSessionId: SessionId
      readonly attemptId: DirectorRunAttemptId
      readonly generation: number
      /** Owning Scene turn. Version 1 records omitted it and inherited stream position. */
      readonly turn?: number
      /** Owning Scene step. Version 1 records omitted it and inherited stream position. */
      readonly step?: number
      readonly status: 'completed' | 'failed'
      readonly events: readonly PlotLedgerNpcEvent[]
      readonly failure?: { readonly code: string; readonly message: string } | undefined
    }
  }
}

export type { ContextSource, ContextNote, ContextProposal, ContextUpdateUnit, StoryContextRetention } from '@deepseek-ai/dsh-roleplay-core/context-retention'

export type { StateFieldId, StateValue, StateDefinition, StateEntry, StateChange, StateInitialValue, DynamicState, StateAuthority } from '@deepseek-ai/dsh-roleplay-core/dynamic-state'

export type { StyleProfile, StyleOverrides, StylePreset } from '@deepseek-ai/dsh-roleplay-core/style'
