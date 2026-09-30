/** Browser-safe Story Remote vocabulary. Physical paths are intentionally absent. */

import type { DynamicState, StateChange } from '@deepseek-ai/dsh-story/types'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  DirectorBriefInput,
  DirectorOutline,
  DirectorOutlinePlayerInput,
  PlotLedger,
  ActorWorldSettlementInput,
  PlayerActionInput,
  PlayerDirectionInput,
  PlayerSpeechInput,
  PlayerWorldInterventionInput,
  StoryContextRecipe,
  StoryDiscussionState,
  StoryId,
  StorySessionRole,
  StoryMemoryProposalInput,
  StoryMemoryUpdateInput,
  StoryMemoryState,
  StoryPromptOverrides,
  StoryWorldState,
} from '@deepseek-ai/dsh-story/types'

export type {
  DirectorBrief,
  DirectorBriefInput,
  DirectorOutline,
  DirectorOutlinePlayerInput,
  PlotLedger,
  PlotLedgerNpcEvent,
  ActorPerception,
  ActorWorldSettlementInput,
  PlayerActionInput,
  PlayerDirectionInput,
  PlayerSpeechInput,
  PlayerWorldInterventionInput,
  StoryContextRecipe,
  StoryContextRecipeSection,
  StoryDiscussion,
  StoryDiscussionState,
  StoryDiscussionTurn,
  StoryId,
  StorySessionRole,
  StoryMemoryEntry,
  StoryMemoryProposalInput,
  StoryMemoryUpdateInput,
  StoryMemoryState,
  StoryPromptOverrides,
  StoryWorldState,
  WorldEvent,
  WorldPatchOperation,
} from '@deepseek-ai/dsh-story/types'

/** One active Actor and its private Session. */
export interface StoryActorView {
  readonly actorId: string
  readonly sessionId: SessionId
  /** Monotonic durable signal for refetching this Actor's private projection. */
  readonly stateRevision: number
}

/** Browser-safe god-view projection of one autonomous character. Persistence identities are omitted. */
export interface StoryActorStateFacet {
  /** Stable semantic key; `state:*` keys are storybook-authored extensions. */
  readonly key: string
  /** Storybook-authored display label for an extension facet. */
  readonly label?: string
  readonly values: readonly string[]
}

export type StoryActorTurningPointStatus = 'tentative' | 'integrated' | 'reversed' | 'rejected'
export type StoryActorTurningPointDimension = 'belief' | 'goal' | 'relationship' | 'conflict' | 'identity' | 'memory'

/** One durable, player-reviewable change in a character's subjective journey. */
export interface StoryActorTurningPointView {
  readonly id: string
  readonly revision: number
  readonly trigger: string
  readonly interpretation: string
  readonly significance: 3 | 4 | 5
  readonly status: StoryActorTurningPointStatus
  readonly changes: readonly {
    readonly dimension: StoryActorTurningPointDimension
    readonly subject: string
    readonly before?: string
    readonly after: string
  }[]
  readonly sourceRefs: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}

/** Browser-safe god-view projection of one defined or running character. Persistence identities are omitted. */
export interface StoryActorStateView {
  readonly dynamicState: DynamicState
  readonly actorId: string
  readonly displayName: string
  readonly persona: string
  readonly lifecycle: 'defined' | 'active'
  readonly facets: readonly StoryActorStateFacet[]
  readonly emotions: readonly {
    readonly emotion: string
    readonly intensity: number
    readonly toward: readonly string[]
    readonly cause?: string
    readonly impulse?: string
  }[]
  readonly beliefs: readonly {
    readonly proposition: string
    readonly stance: string
    readonly confidence: number
  }[]
  readonly relationships: readonly {
    readonly target: string
    readonly dimension: string
    readonly value: number
    readonly reason: string
  }[]
  readonly memories: readonly {
    readonly content: string
    readonly importance: number
    readonly meaning?: string
    readonly status: 'active' | 'forgotten'
  }[]
  readonly goals: readonly {
    readonly description: string
    readonly priority: number
    readonly status: 'active' | 'completed' | 'abandoned'
    readonly reason?: string
  }[]
  readonly intentions: readonly {
    readonly description: string
    readonly trigger: string
    readonly commitment: number
  }[]
  readonly turningPoints: readonly StoryActorTurningPointView[]
}

/** Complete active-cast state for the player's god-view panel. */
export interface StoryActorStatesValue {
  readonly actors: readonly StoryActorStateView[]
}

/** Explicit player perspective and paginated character workspace query. */
export interface StoryCharacterQuery {
  readonly storyId: StoryId
  readonly observerId?: string | undefined
  readonly authorView?: boolean | undefined
  readonly query?: string | undefined
  readonly mode?: 'scene' | 'related' | 'all' | undefined
  readonly offset?: number | undefined
}

/** Perspective labels and optional explicitly requested author configuration. */
export interface StoryCharacterWorkspaceValue {
  readonly revision: number
  readonly people: readonly { actorId: string; label: string; present: boolean }[]
  readonly next: number | null
  readonly records: readonly import('@deepseek-ai/dsh-story/types').StoryCharacter[]
  readonly knowledge: import('@deepseek-ai/dsh-story/types').KnowledgeState
  readonly encounters: readonly { ref: string; label: string }[]
}

/** Complete player-authored character revision; creation uses a host-generated identity. */
export interface StoryCharacterSaveRequest {
  readonly storyId: StoryId
  readonly expectedRevision: number
  readonly actorId?: string | undefined
  readonly definitionJson: string
  readonly importance: 'main' | 'supporting'
  readonly purpose: string
  readonly location: string
  readonly archived: boolean
}

/** Private player correction; every entry carries its own expected revision. */
export interface StoryKnowledgeUpdateRequest {
  readonly storyId: StoryId
  readonly actorId: string
  readonly changes: readonly import('@deepseek-ai/dsh-story/types').KnowledgeChange[]
}

/** Reviewable template collection, with explicit opt-in for runtime history. */
export interface StoryCharacterCollectRequest {
  readonly storyId: StoryId
  readonly actorId: string
  readonly targetStoryId: StoryId
  readonly expectedRevision: string
  readonly expectedCharacterRevision: number
  readonly includeKnowledge: boolean
  readonly includeState: boolean
  readonly includeMemories: boolean
  readonly preview: boolean
  /** Exact previewed content; confirmation rejects intervening runtime changes. */
  readonly expectedPreviewJson?: string | undefined
}

/** Complete replacement of one revisioned Actor turning point. */
export interface StoryUpdateActorTurningPointRequest {
  readonly storyId: StoryId
  readonly actorId: string
  readonly turningPointId: string
  readonly expectedRevision: number
  readonly trigger: string
  readonly interpretation: string
  readonly significance: 3 | 4 | 5
  readonly status: StoryActorTurningPointStatus
  readonly changes: StoryActorTurningPointView['changes']
  readonly sourceRefs: readonly string[]
}

/** Canonical editable storybook JSON and its optimistic-concurrency revision. */
export interface StorybookAuthoringValue {
  readonly revision: string
  readonly storybookJson: string
  readonly exists: boolean
  readonly contextDefaults: {
    readonly discussionSettings: { readonly maxRounds: number }
    readonly reasoningLanguage: string
    readonly contextRules: {
      readonly director: { readonly policy: string; readonly tools: string }
      readonly actor: { readonly policy: string; readonly tools: string }
    }
  }
}

/** One effective editable prompt with its storybook baseline and optional Story override. */
export interface StoryPromptValue {
  readonly storybookPrompt: string
  readonly storyOverride?: string | undefined
  readonly effectivePrompt: string
  readonly source: 'storybook' | 'story'
}

/** Effective private-reasoning language with its storybook baseline and optional Story override. */
export interface StoryReasoningLanguageValue {
  readonly storybookLanguage: string
  readonly storyOverride?: string | undefined
  readonly effectiveLanguage: string
  readonly source: 'storybook' | 'story'
}

/** Complete Director and per-Actor prompt settings for one Story run. */
/** Copy a profile into the book, override it for this run, or direct one scene audience. */
export type StoryStyleUpdateRequest = { readonly storyId: StoryId } & (
  | { readonly scope: 'storybook'; readonly expectedStorybookRevision: string; readonly key: string; readonly profile: import('@deepseek-ai/dsh-story/style').StyleProfile }
  | ({ readonly expectedStoryPromptRevision: number } & import('@deepseek-ai/dsh-story/style').StyleUpdate)
)

export interface StoryPromptSettingsValue {
  readonly styles: {
    readonly baselines: Readonly<Record<string, import('@deepseek-ai/dsh-story/style').StyleProfile>>
    readonly overrides: import('@deepseek-ai/dsh-story/style').StyleOverrides
    readonly sceneId?: string | undefined
  }
  readonly storyPromptRevision: number
  readonly storybookRevision: string
  readonly reasoningLanguage: StoryReasoningLanguageValue
  readonly creator: StoryPromptValue
  readonly director: StoryPromptValue
  readonly contextRules: {
    readonly director: {
      readonly policy: StoryPromptValue
      readonly tools: StoryPromptValue
    }
    readonly actor: {
      readonly policy: StoryPromptValue
      readonly tools: StoryPromptValue
    }
  }
  readonly actors: readonly (StoryPromptValue & {
    readonly actorId: string
    readonly displayName: string
  })[]
}

/** Update the shared reasoning-language baseline or only the current Story override. */
export type StoryReasoningLanguageUpdateRequest =
  | {
    readonly storyId: StoryId
    readonly scope: 'storybook'
    readonly expectedStorybookRevision: string
    readonly language: string
  }
  | {
    readonly storyId: StoryId
    readonly scope: 'story'
    readonly expectedStoryPromptRevision: number
    /** `undefined` clears the override and restores the storybook baseline. */
    readonly language?: string | undefined
  }

/** Update one policy/tool guidance baseline or only the current Story override. */
export type StoryContextRuleUpdateRequest =
  | {
    readonly storyId: StoryId
    readonly scope: 'storybook'
    readonly expectedStorybookRevision: string
    readonly target: 'director' | 'actor'
    readonly section: 'policy' | 'tools'
    readonly text: string
  }
  | {
    readonly storyId: StoryId
    readonly scope: 'story'
    readonly expectedStoryPromptRevision: number
    readonly target: 'director' | 'actor'
    readonly section: 'policy' | 'tools'
    /** `undefined` clears the override and restores the storybook baseline. */
    readonly text?: string | undefined
  }

/** Update one storybook baseline prompt or one Story-local override. */
export type StoryPromptUpdateRequest =
  | {
    readonly storyId: StoryId
    readonly scope: 'storybook'
    readonly expectedStorybookRevision: string
    readonly target: 'director' | 'actor'
    readonly actorId?: string | undefined
    readonly prompt: string
  }
  | {
    readonly storyId: StoryId
    readonly scope: 'story'
    readonly expectedStoryPromptRevision: number
    readonly target: 'director' | 'actor' | 'creator'
    readonly actorId?: string | undefined
    /** `undefined` clears the override and restores the storybook baseline. */
    readonly prompt?: string | undefined
  }

/** One independently explainable section in an effective Storyweaver model context. */
export interface StoryContextSection {
  readonly id: string
  readonly title: string
  readonly source: 'context-rule' | 'prompt' | 'reasoning-language' | 'custom' | 'storybook' | 'world' | 'memory' | 'discussion'
    | 'plot-ledger' | 'director-outline' | 'director-brief'
    | 'actor-state'
  readonly permission: 'player-editable' | 'runtime-derived'
  readonly role: 'system' | 'user' | 'assistant'
  readonly visibility: 'director-only' | 'actor-private'
  readonly reason: string
  readonly content: string
  readonly chars: number
  readonly estimatedTokens: number
}

/** Effective context preview after Storyweaver visibility filtering. */
export interface StoryContextPreviewValue {
  /** True when no current private Actor state exists; preview does not initialize it. */
  readonly pendingActorInitialization: boolean
  readonly audience: 'director' | 'actor'
  readonly actorId?: string | undefined
  readonly sections: readonly StoryContextSection[]
  readonly totalChars: number
  readonly estimatedTokens: number
}

/** Sender-serialized context that produced one Story-owned AI event. */
export interface StoryRequestContextPreviewValue {
  readonly retention?: { readonly recent: number; readonly pending: number; readonly notes: number; readonly archived: number }

  readonly sessionId: SessionId
  /** Event boundary used to select the producing request. */
  readonly beforeEventSeq: number
  /** `request/header` event whose stable fields were in force. */
  readonly headerSeq: number
  readonly turn: number
  readonly step: number
  readonly provider: string
  readonly model: string
  /** JSON produced by the sender's serializer; field order and message conversion are preserved. */
  readonly requestJson: string
}

/** One active Story projected to browser consumers. */
export interface StoryView {
  /** Current matters folded for each knowledge scope; the authenticated player may inspect all scopes. */
  readonly matters: {
    readonly public: readonly import('@deepseek-ai/dsh-story/types').StoryContinuityItem[]
    readonly actors: Readonly<Record<string, readonly import('@deepseek-ai/dsh-story/types').StoryContinuityItem[]>>
  }
  readonly storyId: StoryId
  /** Stable authored-setting identity shared by independent Story runs. */
  readonly templateId: string
  /** True for an authored-settings anchor that is not a runtime Story. */
  readonly templateOnly: boolean
  readonly title: string
  readonly premise: string
  readonly sceneSessionIds: readonly SessionId[]
  readonly currentSceneSessionId?: SessionId
  readonly controlSessionId?: SessionId
  readonly actors: readonly StoryActorView[]
  readonly plotLedger: PlotLedger
  readonly directorOutline: DirectorOutline
  readonly world: StoryWorldState
  readonly memory: StoryMemoryState
  readonly discussions: StoryDiscussionState
  readonly contextRecipe: StoryContextRecipe
  readonly createdAt: string
  readonly updatedAt: string
}

/** Create a fresh Story aggregate. */
export interface StoryCreateRequest {
  readonly title?: string
  readonly premise?: string
}

/** Story creation result. */
export interface StoryCreateValue {
  readonly story: StoryView
}

/** Create a fresh independent Story run from one Story's authored baseline. */
export interface StoryCreateFromTemplateRequest {
  readonly sourceStoryId: StoryId
}

/** Delete one Story, optionally preserving its storybook when it is the final run. */
export interface StoryDeleteRequest extends StoryRequest {
  /** Preserve the final Story as an empty storybook anchor instead of removing the storybook. */
  readonly preserveTemplate?: boolean
}

/** Confirmation that one Story run left the active registry. */
export interface StoryDeleteValue {
  readonly storyId: StoryId
  /** Present when deleting the final run retained an empty storybook anchor. */
  readonly retainedTemplate?: StoryView
}

/** Story title mutation. */
export interface StoryRenameRequest {
  readonly storyId: StoryId
  readonly title: string
}

/** Story premise mutation. */
export interface StorySetPremiseRequest {
  readonly storyId: StoryId
  readonly premise: string
}

/** Story identity request. */
export interface StoryRequest {
  readonly storyId: StoryId
}

/** Exact-revision replacement of one player-authored storybook. */
export interface StorybookUpdateRequest {
  readonly storyId: StoryId
  readonly expectedRevision: string
  readonly storybookJson: string
}

/** Import one standalone storybook as a new authored-settings template. */
export interface StorybookImportRequest {
  readonly storybookJson: string
}

/** Select a Director or one Actor for effective-context inspection. */
export interface StoryContextPreviewRequest {
  readonly storyId: StoryId
  readonly audience: 'director' | 'actor'
  readonly actorId?: string | undefined
}

/** Locate one producing model request without copying its large context into Story events. */
export interface StoryRequestContextPreviewRequest {
  readonly storyId: StoryId
  readonly sessionId: SessionId
  readonly beforeEventSeq: number
}

/** Session identity request for Story-owned scene archival. */
export interface StorySessionRequest {
  readonly sessionId: SessionId
}

/** Current-scene mutation. */
export interface StorySelectSceneRequest {
  readonly storyId: StoryId
  readonly sessionId: SessionId
}

/** Strict Director planning commit addressed through a Story-owned Session. */
export interface StoryDirectorBriefRequest {
  readonly storyId: StoryId
  readonly directorSessionId: SessionId
  readonly brief: DirectorBriefInput
}

/** Exact-revision player control for one durable Director Run. */
export interface StoryDirectorRunRequest {
  readonly storyId: StoryId
  readonly expectedRunRevision: number
}

/** Exact-revision player control for one Actor inside a durable Director Run. */
export interface StoryDirectorRunActorRequest extends StoryDirectorRunRequest {
  readonly actorId: string
}

/** Complete player-authored Director Outline replacement over an exact revision. */
export interface StoryDirectorOutlineUpdateRequest {
  readonly storyId: StoryId
  readonly expectedRevision: number
  readonly outline: DirectorOutlinePlayerInput
  readonly reason: string
}

/** Player decision for one queued Director Outline suggestion. */
export interface StoryDirectorOutlineSuggestionRequest {
  readonly storyId: StoryId
  readonly expectedRevision: number
  readonly suggestionId: string
  readonly accept: boolean
}

/** Typed PlayerAuthority direction operation. */
export interface StoryChooseDirectionRequest {
  readonly storyId: StoryId
  readonly input: PlayerDirectionInput
}

/** Typed PlayerAuthority world intervention. */
export interface StoryInterveneWorldRequest {
  readonly storyId: StoryId
  readonly input: PlayerWorldInterventionInput
}

/** Typed PlayerAuthority embodied speech. */
export interface StorySpeakAsRequest {
  readonly storyId: StoryId
  readonly input: PlayerSpeechInput
}

/** Typed PlayerAuthority embodied action. */
export interface StoryActAsRequest {
  readonly storyId: StoryId
  readonly input: PlayerActionInput
}

/** Director settlement of one captured Actor event. */
export interface StorySettleActorWorldEventRequest {
  readonly storyId: StoryId
  readonly input: ActorWorldSettlementInput
}

/** Create one reviewable long-story memory proposal. */
export interface StoryProposeMemoryRequest {
  readonly storyId: StoryId
  readonly input: StoryMemoryProposalInput
}

/** Review one long-story memory proposal. */
export interface StoryReviewMemoryRequest {
  readonly storyId: StoryId
  readonly expectedRevision: number
  readonly memoryId: string
  readonly approve: boolean
}

/** Replace player-editable content in one durable memory entry. */
export interface StoryUpdateMemoryRequest {
  readonly storyId: StoryId
  readonly input: StoryMemoryUpdateInput
}

/** Begin one durable bounded group discussion. */
export interface StoryStartDiscussionRequest {
  readonly storyId: StoryId
  readonly expectedRevision: number
  readonly topic: string
  readonly participantIds: readonly string[]
  readonly maxRounds: number
}

/** Queue one participant for the discussion floor. */
export interface StoryRequestDiscussionFloorRequest {
  readonly storyId: StoryId
  readonly expectedRevision: number
  readonly discussionId: string
  readonly actorId: string
}

/** Pause automatic discussion dispatch for a player speech or conclusion request. */
export interface StoryRequestDiscussionInterventionRequest {
  readonly storyId: StoryId
  readonly expectedRevision: number
  readonly discussionId: string
  readonly intervention: 'speak' | 'conclude'
}

/** Clear an acknowledged player discussion request and resume automatic dispatch. */
export interface StoryClearDiscussionInterventionRequest {
  readonly storyId: StoryId
  readonly expectedRevision: number
  readonly discussionId: string
}

/** Record one turn from the exact current discussion speaker. */
export interface StoryRecordDiscussionTurnRequest {
  readonly storyId: StoryId
  readonly expectedRevision: number
  readonly discussionId: string
  readonly speakerId: string
  readonly text: string
  readonly sourceEventRef?: string | undefined
}

/** Complete or cancel one durable discussion. */
export interface StoryCloseDiscussionRequest {
  readonly storyId: StoryId
  readonly expectedRevision: number
  readonly discussionId: string
  readonly status: 'completed' | 'cancelled'
}

/** Exact-revision safe Context Recipe replacement. */
export interface StoryUpdateContextRecipeRequest {
  readonly storyId: StoryId
  readonly expectedRevision: number
  readonly director: StoryContextRecipe['director']
  readonly actor: StoryContextRecipe['actor']
}

/** One complete version-5 Story Package session log. */
export interface StoryPackageSessionV5 {
  readonly sessionId: string
  readonly role: StorySessionRole
  readonly actorId?: string | undefined
  readonly actorStateRevision?: number | undefined
  readonly createdAt: string
  readonly archivedAt?: string | undefined
  readonly header: {
    readonly createdAt: number
    readonly agentPreset?: string | undefined
  }
  readonly events: readonly SessionEvent[]
}

/** One portable managed Story asset encoded inside the JSON package. */
export interface StoryPackageFileV5 {
  readonly path: string
  readonly dataBase64: string
}

/** Portable, path-free complete Story Package contract. */
export interface StoryPackageV5 {
  readonly checkpoints: import('@deepseek-ai/dsh-story/types').StoryTurnCheckpointFile
  readonly format: 'dsh-roleplay-story-package'
  readonly version: 5
  readonly exportedAt: string
  readonly story: {
    readonly title: string
    readonly premise: string
    readonly currentSceneSessionId?: string | undefined
    readonly plotLedger: PlotLedger
    readonly directorOutline: DirectorOutline
    readonly world: StoryWorldState
    readonly memory: StoryMemoryState
    readonly discussions: StoryDiscussionState
    readonly contextRecipe: StoryContextRecipe
    readonly promptOverrides: StoryPromptOverrides
  }
  readonly storybookJson: string
  readonly files: readonly StoryPackageFileV5[]
  readonly sessions: readonly StoryPackageSessionV5[]
}

/** Exported Story Package JSON and summary. */
export interface StoryPackageExportValue {
  readonly packageJson: string
  readonly byteLength: number
  readonly sessionCount: number
}

/** Import one complete Story Package under fresh Story and Session identities. */
export interface StoryPackageImportRequest {
  readonly packageJson: string
}

/** Complete changed Story projection. */
export interface StoryValue {
  readonly story: StoryView
}

/** Complete reconnect baseline. */
export interface StoryBaseline {
  readonly items: readonly StoryView[]
}

/** One Story change after a baseline. */
export type StoryFollowIncrement =
  | { readonly type: 'upsert'; readonly story: StoryView }
  | { readonly type: 'remove'; readonly storyId: StoryId }

/** Story state stream; every generation starts with one baseline. */
export type StoryFollowFrame =
  | { readonly type: 'baseline'; readonly value: StoryBaseline }
  | StoryFollowIncrement

/** Atomic player review of complete source-processing units. */
export interface StoryContextReviewRequest {
  readonly storyId: StoryId
  readonly reviews: readonly { readonly id: string; readonly revision: number; readonly approve: boolean }[]
}
/** Edit a pending unit while its proposal revision remains current. */
export interface StoryContextEditRequest {
  readonly storyId: StoryId
  readonly id: string
  readonly revision: number
  readonly unit: import('@deepseek-ai/dsh-story/types').ContextUpdateUnit
}
/** Explicit original retention for one knowledge scope. */
export interface StoryContextPinRequest {
  readonly storyId: StoryId
  readonly sourceId: string
  readonly scope: string
  readonly pinned: boolean
}
/** Authenticated player inspection; model recall uses its own narrower audience checks. */
export interface StoryContextSourceRequest { readonly storyId: StoryId; readonly sourceId: string }
/** Exact original source content. */
export interface StoryContextSourceValue { readonly id: string; readonly text: string }

/** Player revision of private or world-owned dynamic fields. */
export interface StoryStateUpdateRequest {
  readonly storyId: StoryId
  readonly actorId: string
  readonly owner: 'actor' | 'world'
  readonly expectedWorldRevision?: number
  readonly changes: readonly StateChange[]
}
