/** Framework-independent non-canonical planning records. */
/** Author that committed one Director Outline revision. */
export type DirectorOutlineAuthor = 'player' | 'director' | 'system'

/** Director-controlled update policy selected by the player. */
export type DirectorOutlineUpdateMode = 'auto_unlocked' | 'review_all'

/** Shared ownership fields for one independently editable outline item. */
export interface DirectorOutlineItemIdentity {
  readonly id: string
  readonly source: DirectorOutlineAuthor
  readonly locked: boolean
}

/** One theme or hard constraint in the Director Outline. */
export interface DirectorOutlineTextItem extends DirectorOutlineItemIdentity {
  readonly text: string
}

/** One medium- or long-range narrative arc that never prescribes character choices. */
export interface DirectorStoryArc extends DirectorOutlineItemIdentity {
  readonly title: string
  readonly intent: string
  readonly status: 'planned' | 'active' | 'resolved' | 'abandoned'
  readonly tensions: readonly string[]
  readonly desiredQuestions: readonly string[]
  readonly completionSignals: readonly string[]
}

/** One candidate world-facing beat. Character behavior fields are intentionally absent. */
export interface DirectorPlotBeat extends DirectorOutlineItemIdentity {
  readonly arcId?: string | undefined
  readonly title: string
  readonly intent: string
  readonly status: 'candidate' | 'armed' | 'active' | 'resolved' | 'skipped' | 'retired'
  readonly priority: number
  readonly prerequisiteLedgerFacts: readonly string[]
  readonly prerequisiteBeatIds: readonly string[]
  readonly triggerConditions: readonly string[]
  readonly externalPressure: readonly string[]
  readonly revealCandidates: readonly string[]
  readonly exitConditions: readonly string[]
  readonly fallbackOptions: readonly string[]
  readonly resolvedByEventRefs: readonly string[]
}

/** One planned clue and payoff. Planned content is not a world fact. */
export interface DirectorForeshadow extends DirectorOutlineItemIdentity {
  readonly title: string
  readonly narrativePurpose: string
  readonly status: 'planned' | 'available' | 'planted' | 'reinforced' | 'paid_off' | 'abandoned'
  readonly seedCandidates: readonly string[]
  readonly intendedPayoff: string
  readonly revealConditions: readonly string[]
  readonly earliestBeatId?: string | undefined
  readonly latestBeatId?: string | undefined
  readonly ambiguityNotes: readonly string[]
  readonly dependencyIds: readonly string[]
  readonly plantedEventRefs: readonly string[]
  readonly payoffEventRefs: readonly string[]
}

/** One unresolved narrative question tracked separately from canonical Ledger facts. */
export interface DirectorMystery extends DirectorOutlineItemIdentity {
  readonly question: string
  readonly status: 'open' | 'answered' | 'retired'
  readonly answerIntent: string
  readonly evidenceEventRefs: readonly string[]
}

/** One explicit pacing clock in the non-canonical Director plan. */
export interface DirectorNarrativeClock extends DirectorOutlineItemIdentity {
  readonly title: string
  readonly progress: number
  readonly limit: number
  readonly trigger: string
  readonly consequence: string
  readonly status: 'active' | 'paused' | 'resolved'
}

/** Player-editable content accepted as one complete Outline replacement. */
export interface DirectorOutlinePlayerInput {
  readonly updateMode: DirectorOutlineUpdateMode
  readonly premise: string
  readonly premiseLocked: boolean
  readonly themes: readonly Omit<DirectorOutlineTextItem, 'source'>[]
  readonly hardConstraints: readonly Omit<DirectorOutlineTextItem, 'source'>[]
  readonly arcs: readonly Omit<DirectorStoryArc, 'source'>[]
  readonly beats: readonly Omit<DirectorPlotBeat, 'source'>[]
  readonly foreshadows: readonly Omit<DirectorForeshadow, 'source'>[]
  readonly mysteries: readonly Omit<DirectorMystery, 'source'>[]
  readonly clocks: readonly Omit<DirectorNarrativeClock, 'source'>[]
}

/** Director-authored category replacement over an exact Outline revision. */
export interface DirectorOutlinePatchInput {
  readonly expectedRevision: number
  readonly reason: string
  readonly premise?: string | undefined
  readonly themes?: readonly Omit<DirectorOutlineTextItem, 'source' | 'locked'>[] | undefined
  readonly hardConstraints?: readonly Omit<DirectorOutlineTextItem, 'source' | 'locked'>[] | undefined
  readonly arcs?: readonly Omit<DirectorStoryArc, 'source' | 'locked'>[] | undefined
  readonly beats?: readonly Omit<DirectorPlotBeat, 'source' | 'locked'>[] | undefined
  readonly foreshadows?: readonly Omit<DirectorForeshadow, 'source' | 'locked'>[] | undefined
  readonly mysteries?: readonly Omit<DirectorMystery, 'source' | 'locked'>[] | undefined
  readonly clocks?: readonly Omit<DirectorNarrativeClock, 'source' | 'locked'>[] | undefined
}

/** One Director proposal awaiting player acceptance in review-all mode. */
export interface DirectorOutlineSuggestion {
  readonly id: string
  readonly baseRevision: number
  readonly reason: string
  readonly patch: DirectorOutlinePatchInput
  readonly createdAt: string
}

/** Compact durable audit entry for one Outline revision. */
export interface DirectorOutlineRevision {
  readonly revision: number
  readonly author: DirectorOutlineAuthor
  readonly reason: string
  readonly changedSections: readonly string[]
  readonly createdAt: string
}

/** Durable, player-visible, Actor-private and non-canonical Director plan. */
export interface DirectorOutline {
  readonly schemaVersion: 1
  readonly revision: number
  readonly updateMode: DirectorOutlineUpdateMode
  readonly premise: string
  readonly premiseLocked: boolean
  readonly themes: readonly DirectorOutlineTextItem[]
  readonly hardConstraints: readonly DirectorOutlineTextItem[]
  readonly arcs: readonly DirectorStoryArc[]
  readonly beats: readonly DirectorPlotBeat[]
  readonly foreshadows: readonly DirectorForeshadow[]
  readonly mysteries: readonly DirectorMystery[]
  readonly clocks: readonly DirectorNarrativeClock[]
  readonly pendingSuggestions: readonly DirectorOutlineSuggestion[]
  readonly history: readonly DirectorOutlineRevision[]
  readonly updatedAt: string
  readonly updatedBy: DirectorOutlineAuthor
}
