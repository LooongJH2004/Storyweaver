/** One durable utterance in a moderated group discussion. */
export interface StoryDiscussionTurn {
  readonly identityLabels?: Readonly<Record<string, string>> | undefined
  readonly speakerRefs?: Readonly<Record<string, string>> | undefined
  readonly id: string
  readonly speakerId: string
  readonly text: string
  readonly action?: 'speak' | 'pass' | 'conclude' | undefined
  readonly sourceEventRef?: string | undefined
  readonly round: number
  readonly createdAt: string
}

/** Latest autonomous floor preference declared by one discussion participant. */
export interface StoryDiscussionParticipantIntent {
  readonly stance?: string | undefined
  readonly eagerness: 'low' | 'medium' | 'high'
  readonly action?: 'speak' | 'pass' | 'conclude' | undefined
  readonly nextSpeakerId?: string | undefined
  readonly updatedAt: string
}

/** One durable discussion with exact speaker ownership and bounded rounds. */
export interface StoryDiscussion {
  readonly id: string
  readonly revision: number
  readonly topic: string
  readonly participantIds: readonly string[]
  readonly status: 'active' | 'awaiting-player' | 'summarizing' | 'completed' | 'cancelled'
  readonly currentSpeakerId?: string | undefined
  readonly floorQueue: readonly string[]
  /** Participants still collecting private stance/eagerness before public speech begins. */
  readonly preparationPendingIds?: readonly string[] | undefined
  /** Player-owned participants who did not need an autonomous preparation. */
  readonly preparationExemptIds?: readonly string[] | undefined
  readonly participantIntents?: Readonly<Record<string, StoryDiscussionParticipantIntent>> | undefined
  readonly round: number
  readonly maxRounds: number
  /** Captured at start; missing values retain the historical eagerness-weighted rule. */
  readonly floorPolicy?: 'balanced' | 'eagerness' | undefined
  /** Whether the Director started the normal automatic flow or the player used the advanced override. */
  readonly initiatedBy?: 'director' | 'player' | undefined
  /** A player request that pauses further automatic Actor dispatch until the Director resolves it. */
  readonly playerIntervention?: 'speak' | 'conclude' | undefined
  readonly turns: readonly StoryDiscussionTurn[]
  readonly createdAt: string
  readonly updatedAt: string
}

/** Durable discussion history; at most one discussion may be active. */
export interface StoryDiscussionState {
  readonly revision: number
  readonly discussions: readonly StoryDiscussion[]
  readonly requests?: readonly DiscussionRequest[] | undefined
}

/** An actor's invitation proposal; accepting it is a separate host decision. */
export interface DiscussionRequest {
  readonly id: string
  readonly revision: number
  readonly actorId: string
  readonly sceneId: string
  readonly topic: string
  readonly opening: string
  readonly participantIds: readonly string[]
  readonly status: 'pending' | 'deferred' | 'accepted' | 'declined'
  readonly sourceRef: string
  readonly discussionId?: string | undefined
  readonly reason?: string | undefined
  readonly createdAt: string
  readonly updatedAt: string
}
