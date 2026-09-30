import type { DirectorOutline } from './outline-model.ts'
import type { ResolvedSettings } from './settings.ts'
import type { StyleProfile, StyleOverrides } from './style.ts'
import type { DynamicState } from './dynamic-state.ts'
import type { ActorPrivateView } from './actor-model.ts'
import type { StoryCharacter } from './characters.ts'
/** Framework-independent narrative commands, records, and persistence ports. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Independent fictional world; every runtime key belongs to exactly one. */
export type InstanceId = Branded<'StoryId'>
/** Editable authoring lineage, never a running world. */
export type BookId = Branded<'RoleplayBookId'>
/** Immutable published baseline. */
export type TemplateVersionId = Branded<'TemplateVersionId'>
/** Stable retry identity supplied by the initiating host. */
export type CommandId = Branded<'RoleplayCommandId'>
/** Stable address of one accepted narrative transaction. */
export type CommitId = Branded<'RoleplayCommitId'>
/** A portable JSON payload contains no runtime objects. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
/** Materialized business data is independent from execution logs. */
export type Document = Record<string, Json>

/** An entity key is meaningful only in its enclosing instance. */
export interface EntityKey { readonly collection: string; readonly id: string }
/** An immutable resource carries its content digest and portable bytes. */
export interface Resource { readonly path: string; readonly digest: string; readonly base64: string }
/** Host adapter verifies portable resource paths, bytes, and digests before publication or import. */
export interface ResourceVerifier { verify(resources: readonly Resource[]): void }
/** One immutable authored baseline, retained while any instance references it. */
export interface TemplateVersion {
  readonly id: TemplateVersionId
  readonly bookId: BookId
  readonly number: number
  readonly title: string
  readonly document: Document
  readonly resources: readonly Resource[]
  readonly publishedAt: string
}
/** Mutable author draft. Publication snapshots it instead of mutating a version. */
export interface BookDraft {
  readonly id: BookId
  readonly revision: number
  readonly title: string
  readonly document: Document
  readonly resources: readonly Resource[]
  readonly latestVersionId?: TemplateVersionId
  readonly deleted: boolean
}
/** Instance authority and execution fence. No query consults the latest book. */
export interface Instance {
  readonly id: InstanceId
  readonly templateVersionId: TemplateVersionId
  readonly revision: number
  readonly epoch: number
  readonly createdAt: string
  readonly deleted: boolean
}
/** Entity replacement/removal is an explicit event; absence is never an initial-value fallback. */
export type NarrativeEvent =
  | { readonly type: 'entity.replaced'; readonly key: EntityKey; readonly value: Json }
  | { readonly type: 'entity.removed'; readonly key: EntityKey }
  | { readonly type: 'instance.removed'; readonly reason: string }
  | { readonly type: 'execution.invalidated'; readonly reason: string }
  | { readonly type: 'history.restored'; readonly targetRevision: number; readonly reason: string; readonly preserveContextRecipe?: true }
/** Host-authenticated origin; model JSON never constructs this record. */
export type Principal =
  | { readonly kind: 'player' }
  | { readonly kind: 'director'; readonly attempt: string; readonly epoch: number }
  | { readonly kind: 'actor'; readonly actorId: string; readonly attempt: string; readonly epoch: number }
  | { readonly kind: 'system'; readonly operation: string }
/** Commands bind retry identity to the complete original request. */
export interface Command {
  readonly id: CommandId
  readonly instanceId: InstanceId
  readonly expectedRevision: number
  readonly principal: Principal
  readonly kind: string
  readonly input: Json
}
/** Host supplies identity and retry metadata separately from model-authored arguments. */
export type CommandScope = Omit<Command, 'kind' | 'input'>
/** One accepted transaction, retained even after a rewind. */
export interface NarrativeCommit {
  readonly id: CommitId
  readonly command: Command
  readonly revision: number
  readonly events: readonly NarrativeEvent[]
  readonly result: Json
  readonly committedAt: string
}
/** Replayable snapshot: a business revision and its instance-scoped entities. */
export interface NarrativeSnapshot {
  readonly instance: Instance
  readonly entities: readonly { readonly key: EntityKey; readonly value: Json }[]
}
/** Transport work is durable but is not a second narrative authority. */
export interface PendingDelivery {
  readonly commitId: CommitId
  readonly instanceId: InstanceId
  readonly revision: number
  readonly attempts: number
  readonly lastError?: string
}
/** Synchronous transaction view prevents awaiting a model while holding a storage transaction. */
export interface Transaction {
  get<T>(scope: string, collection: string, key: string): T | undefined
  put<T>(scope: string, collection: string, key: string, value: T): void
  remove(scope: string, collection: string, key: string): void
  scan<T>(scope: string, collection: string): readonly { readonly key: string; readonly value: T }[]
}
/** Provider must roll back every write when operation throws. */
export interface RoleplayStore {
  read<T>(operation: (transaction: Transaction) => T): T
  transaction<T>(operation: (transaction: Transaction) => T): T
  close(): void
}
/** Non-determinism belongs to the composition root, not domain rules. */
export interface RuntimeValues { now(): string; id(): string }
/** Pure domain handler receives one consistent detached snapshot. */
export interface CommandHandler {
  (snapshot: NarrativeSnapshot): { readonly events: readonly NarrativeEvent[]; readonly result: Json }
}
/** Read-only business revisions required by current and historical perspective queries. */
export interface NarrativeReader {
  snapshot(id: InstanceId): NarrativeSnapshot
  replay(id: InstanceId, revision: number): NarrativeSnapshot
}
/** A use case can commit domain outcomes without access to storage records or runtime objects. */
export interface NarrativeWriter {
  execute(command: Command, handler: CommandHandler): NarrativeCommit
}

/** The actor perspective requires an explicit player-selected character. */
export type PlayAudience = { readonly kind: 'observer' } | { readonly kind: 'actor'; readonly actorId: string }
/** Player-only identity annotation. Never use this view to assemble model context. */
export interface PlayerPersonLabel {
  readonly label: string
  readonly trueName?: string
  /** Objective character description for player-facing headers, separate from encounter labels. */
  readonly appearance?: string
}
/** Fictional output stores its published label; later recognition only adds an annotation. */
export interface PlayRow {
  readonly id: string
  readonly revision: number
  readonly order: number
  readonly kind: 'narration' | 'speech' | 'action' | 'perception' | 'direction'
  readonly perception?: 'observation' | 'claim' | 'report'
  readonly origin?: 'actor' | 'player'
  readonly text: string
  readonly speaker?: PlayerPersonLabel & { readonly ref: string; readonly actorId?: string }
  readonly recognizedAs?: string
}
/** UI reads an explicit execution phase rather than inferring it from model prose. */
export interface PlayView {
  /** Unpublished public prose only; draft settlement and perceptions remain private. */
  readonly narrationDraft?: { readonly attempt: string
    readonly revision: number
    readonly text: string
    readonly status: 'pending' | 'exhausted'
    readonly characters: number
    readonly minimum: number
    readonly target: number }
  /** Persistent player ownership in this run; independent of reading perspective. */
  readonly playerActorId?: string | null
  /** The controlled participant currently owns the public discussion floor. */
  readonly playerTurn?: boolean
  /** Author-inspection coordinates for the latest discussion; contents stay in execution history. */
  readonly discussionPreparation?: {
    readonly id: string
    readonly topic: string
    readonly completed: number
    readonly total: number
    readonly beforeRevision?: number
    readonly actors: readonly {
      readonly actorId: string
      readonly label: string
      readonly ready: boolean
      readonly revision?: number
      readonly attempt?: string
    }[]
  }
  /** Chronological discussion boundaries, including completed discussions. */
  readonly discussionPreparations?: readonly NonNullable<PlayView['discussionPreparation']>[]
  readonly discussionMaxRounds?: number
  /** Invitation proposals for player review; actor audiences see only their own requests. */
  readonly discussionRequests?: readonly {
    readonly id: string
    readonly revision: number
    readonly requester: PlayerPersonLabel
    readonly topic: string
    readonly opening: string
    readonly status: 'pending' | 'deferred'
    readonly reason?: string | undefined
  }[]
  /** Host-selected active execution, independent of the player's selected audience. */
  readonly activeActorId?: string
  readonly title?: string
  readonly premise?: string
  readonly failure?: string
  readonly instanceId: InstanceId
  readonly templateVersionId: string
  readonly revision: number
  readonly scene: { readonly id: string; readonly location: string }
  readonly people: readonly (PlayerPersonLabel & { readonly ref: string; readonly actorId?: string })[]
  readonly phase: 'director-preparing' | 'ready' | 'character-responding' | 'discussion-running' | 'waiting-player' | 'awaiting-director' | 'paused' | 'failed'
  readonly rows: readonly PlayRow[]
  readonly total: number
  readonly discussion?: {
    readonly id: string
    readonly topic: string
    readonly status: 'active' | 'awaiting-player' | 'summarizing' | 'completed' | 'cancelled'
    readonly round: number
    readonly maxRounds: number
    /** Public opportunities include passes; preparation does not consume this budget. */
    readonly publicTurns?: { readonly used: number; readonly total: number; readonly remaining: number }
    /** Accepted private preparation counts; no stances or private content. */
    readonly preparation?: { readonly completed: number; readonly total: number }
  }
}


/** Host metadata accompanies logged requests; only text is sent to the Actor. */
export interface ActorContextView {
  readonly instanceId: InstanceId
  readonly revision: number
  readonly templateVersionId: string
  readonly configurationRevision: number
  readonly actorId: string
  /** Frozen author-granted capabilities; absent only in older recorded request metadata. */
  readonly capabilities?: readonly import('./actor-model.ts').ActorCapability[]
  readonly text: string
  readonly sources: readonly string[]
  readonly sections: readonly import('./context-recipe.ts').RenderedContextSection[]
}
/** Query input is a business revision, independent from model-session restoration. */
export interface PerspectiveRequest { readonly instanceId: InstanceId
  readonly actorId: string
  readonly revision?: number
  readonly query: string }

/** Author-only person page includes settings unavailable in a play perspective. */
export interface AuthorPeopleView { readonly revision: number; readonly entries: readonly StoryCharacter[]; readonly total: number }


/** Author review presents the complete proposed document and its pinned source revision. */
export interface ExtractionPreview { readonly instanceId: InstanceId
  readonly revision: number
  readonly document: Document }


/** A bounded execution result records the actual stop reason and accepted turns. */
export interface DiscussionRunView {
  readonly id: string
  readonly epoch: number
  readonly status: 'running' | 'waiting-player' | 'awaiting-director' | 'yielded' | 'completed' | 'paused' | 'failed'
  readonly completedTurns: number
  readonly failure?: string | undefined
}

/** Observer-visible identity search never exposes author records. */
export interface KnownPeopleView { readonly revision: number
  readonly entries: readonly { readonly ref: string; readonly label: string }[]
  readonly total: number }

/** Author inspection of current private records is independent of execution sessions. */
export interface CharacterCognitionView { readonly instanceId: InstanceId
  readonly revision: number
  readonly actorId: string
  readonly current: ActorPrivateView }

/** Accepted fictional changes can require another attempt to cancel their older technical executions. */
export interface CommandEffectResult { readonly commit: NarrativeCommit; readonly execution: 'cancelled' | 'pending'; readonly diagnostic?: string }

/** Director requests carry author visibility and can never be reused as actor context. */
export interface DirectorContextView {
  readonly instanceId: InstanceId
  readonly revision: number
  readonly templateVersionId: string
  readonly configurationRevision: number
  readonly role: 'director'
  readonly text: string
  readonly sources: readonly string[]
  readonly sections: readonly import('./context-recipe.ts').RenderedContextSection[]
}
/** Director preparation and dispatch remain distinct from technical Session status. */
export interface DirectorRunView {
  readonly consolidationSources?: readonly string[] | undefined
  readonly id: string
  readonly epoch: number
  readonly status: 'preparing' | 'dispatching' | 'completed' | 'paused' | 'failed'
  readonly actors: readonly string[]
  readonly advanceDiscussion: boolean
  readonly completedActors: number
  readonly failure?: string | undefined
}

/** Notifications reveal only the accepted instance revision, never private event payloads. */
export interface InstanceChange { readonly instanceId: InstanceId; readonly commitId: CommitId; readonly revision: number }
/** Transport consumers query their own authorized view after a revision notice. */
export interface InstanceChanges { subscribe(instanceId: InstanceId, listener: (change: InstanceChange) => void): () => void }

/** Restoration reports the accepted commit separately from technical cancellation. */
export type RestoreResult = CommandEffectResult

/** Exact author draft revision and resource content submitted for saving. */
export interface BookDraftInput {
  readonly id: BookId
  readonly expectedRevision: number
  readonly title: string
  readonly document: Document
  readonly resources: readonly Resource[]
}
/** Bounded author search does not expose storage or execution query interfaces. */
export interface AuthorPeopleQuery {
  readonly query: string
  readonly location?: string
  readonly offset: number
  readonly limit: number
}
/** A current or historical play page is explicitly scoped to one audience. */
export interface PlayQueryRequest {
  readonly instanceId: InstanceId
  readonly audience: PlayAudience
  readonly revision?: number
  readonly offset: number
  readonly limit: number
}

/** Library navigation uses the original version label and current instance title. */
export interface InstanceOverview extends Instance {
  readonly title: string
  readonly book: { readonly id: BookId; readonly title: string; readonly version: number }
}
/** One editor's resolved style, including current-scene guidance and its effective source. */
export interface AuthorStyleView {
  readonly key: string
  readonly profile: StyleProfile
  readonly source: 'storybook' | 'story'
  readonly sceneInstruction: string
}
/** Author workspace configuration is a typed query, separate from fictional play and initial character data. */
export interface AuthorWorkspaceView {
  readonly instance: InstanceOverview
  readonly configurationRevision: number
  readonly settings: ResolvedSettings
  readonly scene: { readonly id: string; readonly location: string; readonly present: readonly string[] }
  readonly styles: StyleOverrides
  readonly director: AuthorStyleView
  readonly actor?: AuthorStyleView & { readonly actorId: string; readonly label: string }
  readonly contextRecipe: import('./context-recipe.ts').ContextRecipe
  readonly outline: DirectorOutline
  readonly worldState: DynamicState
}
/** Player-only selection handles are never included in character model contexts. */
export interface EmbodimentChoicesView {
  readonly revision: number
  /** Player-only roster for ownership, including people outside the current scene. */
  readonly controlEntries: readonly (PlayerPersonLabel & { readonly actorId: string; readonly inScene: boolean })[]
  readonly entries: readonly (PlayerPersonLabel & { readonly actorId: string })[]
}
/** Author-only retention review includes original pointers and pending proposal history. */
export interface RetentionReviewView {
  readonly instanceId: InstanceId
  readonly revision: number
  readonly owner: string
  readonly retention: import('./context-retention.ts').StoryContextRetention
}
/** Bounded original retrieval reports truncation explicitly and retains source identity. */
export interface NarrativeRecallView {
  /** Continue the same original before advancing the record offset. */
  readonly continuation?: { readonly offset: number; readonly sourceId: string; readonly characterOffset: number }
  readonly revision: number
  readonly entries: readonly {
    readonly id: string
    readonly kind: string
    readonly revision: number
    /** Record-local versions have no implied story timestamp. Omission denotes a story revision. */
    readonly revisionScope?: 'record'
    readonly order?: number
    readonly text: string
    readonly truncated: boolean
    readonly characterOffset?: number
  }[]
  readonly total: number
  readonly nextOffset: number | null
}

/** Author-selected diagnostic ownership; technical session IDs stay inside the adapter. */
export interface ExecutionHistoryScope {
  readonly instanceId: InstanceId
  readonly revision: number
  readonly actorId?: string
}
/** Live diagnostics select an instance/person, never an arbitrary execution Session. */
export interface ExecutionLiveRequest { readonly instanceId: InstanceId; readonly actorId?: string }
/** Live author diagnostics carry the current checked narrative scope and recorded request, if present. */
export interface ExecutionLiveView {
  readonly scope: ExecutionHistoryScope
  readonly request: ExecutionRequestDetail | null
  /** Earlier steps in the same execution remain inspectable while its next step streams. */
  readonly previousResponses?: readonly { readonly requestId: number; readonly step: number; readonly response: ExecutionResponseView }[]
}
/** A recorded preparation is distinct from evidence that a response actually arrived. */
/** Whole-story execution accounting, independent of transcript paging and perspective. */
export interface ExecutionUsageTotals {
  readonly stats: {
    turns: number
    steps: number
    llmMs: number
    toolMs: number
    ttftMs: number
    ttftSteps: number
    decodeMs: number
    decodeTokens: number
  }
  readonly usage: {
    uncachedInputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    outputTokens: number
  }
}

export interface ExecutionRequestSummary {
  readonly requestId: number
  readonly evidenceId?: string
  readonly attempt: string
  readonly revision: number
  readonly configurationRevision: number
  readonly turn: number
  readonly step: number
  readonly provider: string
  readonly model: string
  readonly status: 'prepared' | 'response-recorded'
  /** Native accounting for the complete technical turn, repeated across its request steps. */
  readonly turnUsage?: ExecutionTokenUsage
  /** Native whole-turn performance; absent parts indicate missing recorded samples, not zero. */
  readonly turnTiming?: { readonly ttftMs?: number; readonly tokensPerSecond?: number }
  readonly turnRequestCount?: number
}
/** Provider-reported buckets projected by the execution adapter, without Session dependencies. */
export interface ExecutionTokenUsage {
  readonly uncachedInputTokens: number
  readonly outputTokens: number
  readonly totalTokens: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  readonly reasoningTokens?: number
  readonly routes?: readonly { readonly provider: string; readonly model: string }[]
}
/** Bounded diagnostics carry the exact selected ownership and narrative boundary. */
export interface ExecutionRequestPage {
  readonly scope: ExecutionHistoryScope
  readonly entries: readonly ExecutionRequestSummary[]
  readonly total: number
  readonly nextOffset: number | null
}
/** Request bodies come from historical execution evidence, never current context assembly. */
export interface ExecutionRequestDetail {
  readonly scope: ExecutionHistoryScope
  readonly request: ExecutionRequestSummary
  readonly requestJson: string
  readonly response?: ExecutionResponseView
}

/** Recorded model output is diagnostic evidence and has no narrative authority. */
export interface ExecutionResponseView {
  readonly state: 'pending' | 'streaming' | 'finished'
  readonly text: string
  readonly reasoning: string
  readonly toolCalls: readonly { readonly id: string; readonly name: string; readonly arguments: string }[]
  readonly finishReason?: string
}

/** Retry status distinguishes a committed command from a terminal execution attempt. */
export interface CommandStatus {
  readonly acceptedRevision: number | null
  readonly execution: 'none' | 'running' | 'completed' | 'failed' | 'cancelled'
}
/** Serializable execution route preferences carry no credentials or session identity. */
export interface ExecutionModelSelection { provider: string; model: string; reasoningEffort?: string }
/** Host settings revision for the next execution; these preferences are not fictional facts. */
export interface ExecutionModelView { selection: ExecutionModelSelection; revision: number; writable: boolean }

export type { MemoryJob } from './memory-queue.ts'
