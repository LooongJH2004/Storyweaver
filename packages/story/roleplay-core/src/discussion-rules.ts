/** Pure discussion floor and lifecycle rules shared by narrative and Harness adapters. */
import { z } from 'zod'
import { StoryRoleplayError } from './roleplay-error.ts'
import type { RuntimeValues } from './types.ts'
import type { StoryDiscussion, StoryDiscussionState } from './discussion-model.ts'
export type * from './discussion-model.ts'
const isoDate = z.iso.datetime()
const nonblank = (maximum: number): z.ZodString => z.string().trim().min(1).max(maximum)
const nonblankText = z.string().trim().min(1)
const uniqueStrings = (maximumItems: number, maximumLength = 160) => z.array(nonblank(maximumLength)).max(maximumItems).refine(items => new Set(items).size === items.length, 'values must be unique')

export const storyDiscussionTurnSchema = z.object({
  identityLabels: z.record(z.string(), z.string()).optional(),
  speakerRefs: z.record(z.string(), z.string()).optional(),
  id: nonblank(200),
  speakerId: nonblank(160),
  text: z.string(),
  action: z.enum(['speak', 'pass', 'conclude']).optional(),
  sourceEventRef: nonblank(240).optional(),
  round: z.number().int().positive(),
  createdAt: isoDate,
})

export const storyDiscussionSchema: z.ZodType<StoryDiscussion> = z.object({
  id: nonblank(200),
  revision: z.number().int().positive(),
  topic: nonblankText,
  participantIds: uniqueStrings(24),
  status: z.enum(['active', 'awaiting-player', 'summarizing', 'completed', 'cancelled']),
  currentSpeakerId: nonblank(160).optional(),
  floorQueue: uniqueStrings(24),
  preparationPendingIds: uniqueStrings(24).optional(),
  preparationExemptIds: uniqueStrings(24).optional(),
  participantIntents: z.record(nonblank(160), z.object({
    stance: nonblankText.optional(),
    eagerness: z.enum(['low', 'medium', 'high']),
    action: z.enum(['speak', 'pass', 'conclude']).optional(),
    nextSpeakerId: nonblank(160).optional(),
    updatedAt: isoDate,
  })).optional(),
  round: z.number().int().positive(),
  maxRounds: z.number().int().min(1).max(20),
  floorPolicy: z.enum(['balanced', 'eagerness']).optional(),
  initiatedBy: z.enum(['director', 'player']).optional(),
  playerIntervention: z.enum(['speak', 'conclude']).optional(),
  turns: z.array(storyDiscussionTurnSchema),
  createdAt: isoDate,
  updatedAt: isoDate,
})

export const storyDiscussionStateSchema: z.ZodType<StoryDiscussionState> = z.object({
  revision: z.number().int().nonnegative(),
  discussions: z.array(storyDiscussionSchema),
  requests: z.array(z.object({
    id: nonblank(200), revision: z.number().int().positive(), actorId: nonblank(160), sceneId: nonblank(200),
    topic: nonblankText, opening: nonblankText, participantIds: uniqueStrings(24).min(2),
    status: z.enum(['pending', 'deferred', 'accepted', 'declined']), sourceRef: nonblank(240),
    discussionId: nonblank(200).optional(), reason: nonblankText.optional(), createdAt: isoDate, updatedAt: isoDate,
  })).optional(),
}).transform((state) => {
  // The schema permits explicitly unset optional fields; durable projections omit those keys.
  return JSON.parse(JSON.stringify(state)) as StoryDiscussionState
})

/** @returns an empty durable discussion ledger. */
export function emptyStoryDiscussions(): StoryDiscussionState {
  return { revision: 0, discussions: [] }
}

function requireDiscussionRevision(state: StoryDiscussionState, expected: number): void {
  if (state.revision !== expected) {
    throw new StoryRoleplayError(
      'STALE_DISCUSSION_REVISION',
      `Discussion revision ${String(expected)} is stale; current revision is ${String(state.revision)}`,
    )
  }
}

function activeDiscussion(state: StoryDiscussionState, discussionId: string): StoryDiscussion {
  const discussion = state.discussions.find(item => item.id === discussionId)
  if (discussion === undefined) {
    throw new StoryRoleplayError('INVALID_DISCUSSION_STATE', `Discussion '${discussionId}' does not exist`)
  }
  return discussion
}

/** Begin one bounded group discussion. */
export function startStoryDiscussion(
  state: StoryDiscussionState,
  input: {
    readonly expectedRevision: number
    readonly topic: string
    readonly participantIds: readonly string[]
    readonly maxRounds: number
    readonly floorPolicy?: 'balanced' | 'eagerness' | undefined
    readonly initiatedBy?: 'director' | 'player' | undefined
    readonly playerActorId?: string | null | undefined
  },
  values: RuntimeValues,
): StoryDiscussionState {
  storyDiscussionStateSchema.parse(state)
  requireDiscussionRevision(state, input.expectedRevision)
  if (state.discussions.some(item => (
    item.status === 'active' || item.status === 'awaiting-player' || item.status === 'summarizing'
  ))) {
    throw new StoryRoleplayError('INVALID_DISCUSSION_STATE', 'Another discussion is still active')
  }
  const participantIds = uniqueStrings(24).min(2).parse(input.participantIds)
  const topic = nonblankText.parse(input.topic)
  const maxRounds = z.number().int().min(1).max(20).parse(input.maxRounds)
  const revision = state.revision + 1
  const now = values.now()
  const discussion: StoryDiscussion = {
    id: `discussion-${values.id()}`,
    revision: 1,
    topic,
    participantIds,
    status: 'active',
    floorQueue: [],
    preparationPendingIds: participantIds.filter(id => id !== input.playerActorId),
    ...(input.playerActorId != null && participantIds.includes(input.playerActorId)
      ? { preparationExemptIds: [input.playerActorId] } : {}),
    participantIntents: {},
    round: 1,
    maxRounds,
    ...(input.floorPolicy === undefined ? {} : { floorPolicy: input.floorPolicy }),
    initiatedBy: input.initiatedBy ?? 'director',
    turns: [],
    createdAt: now,
    updatedAt: now,
  }
  return storyDiscussionStateSchema.parse({ ...state, revision, discussions: [...state.discussions, discussion] })
}

/** Persist one participant's autonomous floor preference before its behavior is established. */
export function updateDiscussionParticipantIntent(
  state: StoryDiscussionState,
  expectedRevision: number,
  discussionId: string,
  actorId: string,
  intent: {
    readonly stance?: string | undefined
    readonly eagerness: 'low' | 'medium' | 'high'
    readonly action: 'speak' | 'pass' | 'conclude'
    readonly nextSpeakerId?: string | undefined
  },
  values: RuntimeValues,
): StoryDiscussionState {
  storyDiscussionStateSchema.parse(state)
  requireDiscussionRevision(state, expectedRevision)
  const current = activeDiscussion(state, discussionId)
  const preparationPendingIds = current.preparationPendingIds ?? []
  if (current.status !== 'active' || (preparationPendingIds.length === 0 && current.currentSpeakerId !== actorId)) {
    throw new StoryRoleplayError('INVALID_DISCUSSION_STATE', `Actor '${actorId}' does not own this discussion floor`)
  }
  if (intent.nextSpeakerId !== undefined && (
    intent.nextSpeakerId === actorId || !current.participantIds.includes(intent.nextSpeakerId)
  )) {
    throw new StoryRoleplayError('INVALID_DISCUSSION_STATE', `Actor '${intent.nextSpeakerId}' cannot receive this discussion floor`)
  }
  const now = values.now()
  if (preparationPendingIds.length > 0) {
    if (!preparationPendingIds.includes(actorId)) {
      throw new StoryRoleplayError(
        'INVALID_DISCUSSION_STATE',
        `Actor '${actorId}' does not own this discussion preparation slot`,
      )
    }
    if (intent.action !== 'pass' || intent.nextSpeakerId !== undefined) {
      throw new StoryRoleplayError(
        'INVALID_DISCUSSION_STATE',
        'Discussion preparation requires action=pass and cannot hand off the public floor',
      )
    }
    const remaining = preparationPendingIds.filter(id => id !== actorId)
    const participantIntents = {
      ...current.participantIntents,
      [actorId]: {
        ...(intent.stance === undefined ? {} : { stance: nonblankText.parse(intent.stance) }),
        eagerness: intent.eagerness,
        updatedAt: now,
      },
    }
    const eagernessScore = { low: 1, medium: 2, high: 3 } as const
    const openingSpeaker = current.participantIds.toSorted((left, right) => (
      eagernessScore[participantIntents[right]?.eagerness ?? 'medium']
      - eagernessScore[participantIntents[left]?.eagerness ?? 'medium']
      || current.participantIds.indexOf(left) - current.participantIds.indexOf(right)
    ))[0]
    return storyDiscussionStateSchema.parse({
      ...state,
      revision: state.revision + 1,
      discussions: state.discussions.map(item => item.id === discussionId ? {
        ...item,
        revision: item.revision + 1,
        currentSpeakerId: remaining.length === 0 ? openingSpeaker : undefined,
        preparationPendingIds: remaining.length === 0 ? undefined : remaining,
        participantIntents,
        updatedAt: now,
      } : item),
    })
  }
  return storyDiscussionStateSchema.parse({
    ...state,
    revision: state.revision + 1,
    discussions: state.discussions.map(item => item.id === discussionId ? {
      ...item,
      revision: item.revision + 1,
      participantIntents: {
        ...item.participantIntents,
        [actorId]: {
          ...(intent.stance === undefined ? {} : { stance: nonblankText.parse(intent.stance) }),
          eagerness: intent.eagerness,
          action: intent.action,
          ...(intent.nextSpeakerId === undefined ? {} : { nextSpeakerId: intent.nextSpeakerId }),
          updatedAt: now,
        },
      },
      updatedAt: now,
    } : item),
  })
}

/** Pause automatic discussion dispatch for one explicit player request. */
export function requestDiscussionIntervention(
  state: StoryDiscussionState,
  expectedRevision: number,
  discussionId: string,
  intervention: 'speak' | 'conclude',
  values: RuntimeValues,
): StoryDiscussionState {
  storyDiscussionStateSchema.parse(state)
  requireDiscussionRevision(state, expectedRevision)
  const current = activeDiscussion(state, discussionId)
  if (current.status !== 'active') {
    throw new StoryRoleplayError(
      'INVALID_DISCUSSION_STATE',
      `Discussion '${discussionId}' is not currently advancing`,
    )
  }
  if (current.playerIntervention === intervention) return state
  const now = values.now()
  return storyDiscussionStateSchema.parse({
    ...state,
    revision: state.revision + 1,
    discussions: state.discussions.map(item => item.id === discussionId
      ? {
        ...item,
        revision: item.revision + 1,
        status: 'awaiting-player',
        playerIntervention: intervention,
        updatedAt: now,
      }
      : item),
  })
}

/** Clear one acknowledged player intervention so automatic floor dispatch can continue. */
export function clearDiscussionIntervention(
  state: StoryDiscussionState,
  expectedRevision: number,
  discussionId: string,
  values: RuntimeValues,
): StoryDiscussionState {
  storyDiscussionStateSchema.parse(state)
  requireDiscussionRevision(state, expectedRevision)
  const current = activeDiscussion(state, discussionId)
  if (current.playerIntervention === undefined) return state
  const { playerIntervention: _playerIntervention, ...resumed } = current
  const now = values.now()
  return storyDiscussionStateSchema.parse({
    ...state,
    revision: state.revision + 1,
    discussions: state.discussions.map(item => item.id === discussionId
      ? { ...resumed, revision: item.revision + 1, status: 'active', updatedAt: now }
      : item),
  })
}

/** Queue a participant for the next floor without creating an in-memory watchdog. */
export function requestDiscussionFloor(
  state: StoryDiscussionState,
  expectedRevision: number,
  discussionId: string,
  actorId: string,
  values: RuntimeValues,
): StoryDiscussionState {
  storyDiscussionStateSchema.parse(state)
  requireDiscussionRevision(state, expectedRevision)
  const current = activeDiscussion(state, discussionId)
  if (current.status !== 'active' || !current.participantIds.includes(actorId)) {
    throw new StoryRoleplayError('INVALID_DISCUSSION_STATE', `Actor '${actorId}' cannot request this floor`)
  }
  if (current.currentSpeakerId === actorId || current.floorQueue.includes(actorId)) return state
  const now = values.now()
  return storyDiscussionStateSchema.parse({
    ...state,
    revision: state.revision + 1,
    discussions: state.discussions.map(item => item.id === discussionId
      ? { ...item, revision: item.revision + 1, floorQueue: [...item.floorQueue, actorId], updatedAt: now }
      : item),
  })
}

/** Record the exact current speaker's turn and durably advance floor ownership. */
export function recordDiscussionTurn(
  state: StoryDiscussionState,
  input: {
    readonly expectedRevision: number
    readonly discussionId: string
    readonly speakerId: string
    readonly text: string
    readonly action?: 'speak' | 'pass' | 'conclude' | undefined
    readonly sourceEventRef?: string | undefined
    readonly identityLabels?: Readonly<Record<string, string>>
    readonly speakerRefs?: Readonly<Record<string, string>>
  },
  values: RuntimeValues,
): StoryDiscussionState {
  storyDiscussionStateSchema.parse(state)
  requireDiscussionRevision(state, input.expectedRevision)
  const current = activeDiscussion(state, input.discussionId)
  if ((current.preparationPendingIds?.length ?? 0) > 0) {
    throw new StoryRoleplayError(
      'INVALID_DISCUSSION_STATE',
      'Discussion speech cannot begin before every participant declares a stance and eagerness',
    )
  }
  if (current.status !== 'active' || current.currentSpeakerId !== input.speakerId) {
    throw new StoryRoleplayError(
      'INVALID_DISCUSSION_STATE',
      `Actor '${input.speakerId}' does not own the current discussion floor`,
    )
  }
  if (input.sourceEventRef !== undefined
    && current.turns.some(turn => turn.sourceEventRef === input.sourceEventRef)) return state
  const text = z.string().parse(input.text)
  const declared = current.participantIntents?.[input.speakerId]
  const action = input.action ?? declared?.action ?? (text.trim() === '' ? 'pass' : 'speak')
  if (action === 'speak' && text.trim() === '') {
    throw new StoryRoleplayError('INVALID_DISCUSSION_STATE', 'A discussion speech requires non-empty text')
  }
  const queue = current.floorQueue.filter(actorId => actorId !== input.speakerId)
  const requestedNext = declared?.nextSpeakerId
  const candidates = current.participantIds.filter(actorId => actorId !== input.speakerId)
  const speakCounts = new Map(current.participantIds.map(actorId => [
    actorId,
    current.turns.filter(turn => turn.speakerId === actorId).length,
  ]))
  const eagernessScore = { low: 1, medium: 2, high: 3 } as const
  const defaultNext = candidates.toSorted((left, right) => {
    const leftIntent = current.participantIntents?.[left]
    const rightIntent = current.participantIntents?.[right]
    if (current.floorPolicy === 'balanced') {
      // Opportunities include passes: silence does not repeatedly claim the next floor.
      return (speakCounts.get(left) ?? 0) - (speakCounts.get(right) ?? 0)
        || eagernessScore[rightIntent?.eagerness ?? 'medium'] - eagernessScore[leftIntent?.eagerness ?? 'medium']
        || current.participantIds.indexOf(left) - current.participantIds.indexOf(right)
    }
    const leftScore = eagernessScore[leftIntent?.eagerness ?? 'medium'] * 100 - (speakCounts.get(left) ?? 0) * 40
    const rightScore = eagernessScore[rightIntent?.eagerness ?? 'medium'] * 100 - (speakCounts.get(right) ?? 0) * 40
    return rightScore - leftScore || current.participantIds.indexOf(left) - current.participantIds.indexOf(right)
  })[0]
  const nextSpeakerId = requestedNext ?? queue[0] ?? defaultNext
  const nextQueue = queue[0] === nextSpeakerId ? queue.slice(1) : queue
  const turnCount = current.turns.length + 1
  const nextRound = Math.floor(turnCount / current.participantIds.length) + 1
  const budgetReached = turnCount >= current.maxRounds * current.participantIds.length
  const status = action === 'conclude' || budgetReached
    ? 'summarizing' as const
    : 'active' as const
  const now = values.now()
  const participantIntents = { ...current.participantIntents }
  const retained = participantIntents[input.speakerId]
  if (retained !== undefined) {
    participantIntents[input.speakerId] = {
      ...(retained.stance === undefined ? {} : { stance: retained.stance }),
      eagerness: retained.eagerness,
      updatedAt: retained.updatedAt,
    }
  }
  return storyDiscussionStateSchema.parse({
    ...state,
    revision: state.revision + 1,
    discussions: state.discussions.map(item => item.id === input.discussionId
      ? {
        ...item,
        revision: item.revision + 1,
        status,
        ...(status === 'active' && nextSpeakerId !== undefined
          ? { currentSpeakerId: nextSpeakerId }
          : { currentSpeakerId: undefined }),
        floorQueue: nextQueue,
        participantIntents,
        round: Math.min(nextRound, item.maxRounds),
        turns: [...item.turns, {
          id: `discussion-turn-${values.id()}`,
          speakerId: input.speakerId,
          identityLabels: input.identityLabels,
          speakerRefs: input.speakerRefs,
          text,
          action,
          ...(input.sourceEventRef === undefined ? {} : { sourceEventRef: input.sourceEventRef }),
          round: item.round,
          createdAt: now,
        }],
        updatedAt: now,
      }
      : item),
  })
}

/** Complete or cancel a discussion at an exact durable revision. */
export function closeStoryDiscussion(
  state: StoryDiscussionState,
  expectedRevision: number,
  discussionId: string,
  status: 'completed' | 'cancelled',
  values: RuntimeValues,
): StoryDiscussionState {
  storyDiscussionStateSchema.parse(state)
  requireDiscussionRevision(state, expectedRevision)
  const current = activeDiscussion(state, discussionId)
  if (current.status === 'completed' || current.status === 'cancelled') return state
  const now = values.now()
  return storyDiscussionStateSchema.parse({
    ...state,
    revision: state.revision + 1,
    discussions: state.discussions.map(item => item.id === discussionId
      ? {
        ...item,
        revision: item.revision + 1,
        status,
        currentSpeakerId: undefined,
        floorQueue: [],
        playerIntervention: undefined,
        updatedAt: now,
      }
      : item),
  })
}
