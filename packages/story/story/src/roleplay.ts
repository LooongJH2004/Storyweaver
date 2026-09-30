import * as discussionRules from '@deepseek-ai/dsh-roleplay-core/discussion-rules'
import { StoryRoleplayError } from '@deepseek-ai/dsh-roleplay-core/roleplay-error'
/** Pure durable roleplay state machines: world, memory, discussion, and context recipes. */

import { emptyDynamicState, applyStateChanges, initializeDynamicState, dynamicStateSchema, stateChangeSchema } from './dynamic-state.ts'
import type { StateInitialValue } from './dynamic-state.ts'
import { randomUUID } from 'node:crypto'
import type { PersonReference } from './knowledge.ts'
import { emptyStoryCharacters, perceptionDeliverySchema, storyCharactersSchema, frameStoryCharacters, historicalCharacterLabels, renderPerspectiveText, historicalPersonReferences } from './characters.ts'
import { z } from 'zod'
import { storyContinuityChangeSchema } from './continuity.ts'
import { emptyContextRetention, storyContextRetentionSchema } from './context-retention.ts'
import type { JsonValue } from '@deepseek-ai/dsh-session/types'
import type {
  ActorPerception,
  ActorWorldSettlement,
  ActorWorldSettlementBatchInput,
  ActorWorldSettlementInput,
  DirectorNarrationInput,
  DirectorSceneCastInput,
  PlayerActionInput,
  PlayerDirectionInput,
  PlayerSpeechInput,
  PlayerWorldInterventionInput,
  StoryContextRecipe,
  StoryContextRecipeSection,
  StoryContextMessageRole,
  StoryContextSectionId,
  StoryDiscussionState,
  StoryMemoryProposalInput,
  StoryMemoryUpdateInput,
  StoryMemoryState,
  StorySceneCast,
  StoryWorldState,
  WorldEvent,
  WorldPatchOperation,
} from './types.ts'

const isoDate = z.iso.datetime()
const nonblank = (maximum: number): z.ZodString => z.string().trim().min(1).max(maximum)
const nonblankText = z.string().trim().min(1)
const uniqueStrings = (maximumItems: number, maximumLength = 160) => z.array(nonblank(maximumLength))
  .max(maximumItems)
  .refine(items => new Set(items).size === items.length, 'values must be unique')

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number(),
  z.string(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]))

const worldPathSegment = nonblank(120).refine(
  segment => segment !== '__proto__' && segment !== 'prototype' && segment !== 'constructor',
  'unsafe world path segment',
)

export const worldPatchOperationSchema: z.ZodType<WorldPatchOperation> = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set'), path: z.array(worldPathSegment).min(1).max(12), value: jsonValueSchema }),
  z.object({ op: z.literal('remove'), path: z.array(worldPathSegment).min(1).max(12) }),
])

export const worldEventSchema: z.ZodType<WorldEvent> = z.object({
  identityLabels: z.record(z.string(), z.string()).optional(),
  speakerRefs: z.record(z.string(), z.string()).optional(),
  id: nonblank(200),
  revision: z.number().int().positive(),
  kind: z.enum([
    'player-direction',
    'player-world-intervention',
    'player-speech',
    'player-action',
    'actor-speech',
    'actor-action',
    'director-scene',
    'director-narration',
  ]),
  summary: nonblankText,
  status: z.enum(['established', 'rejected']),
  source: z.enum(['player', 'actor', 'director']),
  actorId: nonblank(160).optional(),
  sourceEventRef: nonblank(240).optional(),
  patch: z.array(worldPatchOperationSchema).max(128),
  audience: uniqueStrings(100),
  createdAt: isoDate,
})

export const storySceneCastSchema: z.ZodType<StorySceneCast> = z.strictObject({
  schemaVersion: z.literal(1),
  sceneId: nonblank(200),
  location: nonblank(500),
  presentActorIds: uniqueStrings(100),
})

export const directorSceneCastInputSchema: z.ZodType<DirectorSceneCastInput> = z.strictObject({
  perceptions: z.array(perceptionDeliverySchema).optional(),
  appearances: z.array(z.strictObject({ actorId: nonblankText, key: nonblankText, label: nonblankText })).optional(),
  expectedWorldRevision: z.number().int().nonnegative(),
  sceneId: nonblank(200),
  location: nonblank(500),
  summary: nonblankText,
  presentActorIds: uniqueStrings(100),
})

export const actorPerceptionSchema: z.ZodType<ActorPerception> = z.object({
  id: nonblank(200),
  worldRevision: z.number().int().positive(),
  actorId: nonblank(160),
  sourceEventId: nonblank(200),
  content: nonblankText,
  createdAt: isoDate,
})

export const storyWorldStateSchema: z.ZodType<StoryWorldState> = z.object({
  characters: storyCharactersSchema,
  dynamicState: dynamicStateSchema,
  stateInitialized: z.boolean(),
  context: storyContextRetentionSchema,
  revision: z.number().int().nonnegative(),
  facts: z.record(z.string(), jsonValueSchema),
  events: z.array(worldEventSchema),
  perceptions: z.array(actorPerceptionSchema),
  continuity: z.array(storyContinuityChangeSchema),
})

export const playerDirectionInputSchema: z.ZodType<PlayerDirectionInput> = z.object({
  expectedWorldRevision: z.number().int().nonnegative(),
  audience: uniqueStrings(100),
  direction: nonblankText,
})

export const playerWorldInterventionInputSchema: z.ZodType<PlayerWorldInterventionInput> = z.object({
  expectedWorldRevision: z.number().int().nonnegative(),
  audience: uniqueStrings(100),
  summary: nonblankText,
  patch: z.array(worldPatchOperationSchema).min(1).max(128),
})

export const playerSpeechInputSchema: z.ZodType<PlayerSpeechInput> = z.object({
  expectedWorldRevision: z.number().int().nonnegative(),
  audience: uniqueStrings(100),
  actorId: nonblank(160),
  text: nonblankText,
  delivery: z.enum(['spoken', 'whispered', 'written']),
})

export const playerActionInputSchema: z.ZodType<PlayerActionInput> = z.object({
  expectedWorldRevision: z.number().int().nonnegative(),
  audience: uniqueStrings(100),
  actorId: nonblank(160),
  description: nonblankText,
  target: nonblank(500).optional(),
  patch: z.array(worldPatchOperationSchema).max(128),
})

const actorWorldSettlementSchema: z.ZodType<ActorWorldSettlement> = z.object({
  sourceEventRef: nonblank(240),
  accepted: z.boolean(),
  summary: nonblankText,
  audience: uniqueStrings(100),
  patch: z.array(worldPatchOperationSchema).max(128),
})

export const actorWorldSettlementInputSchema: z.ZodType<ActorWorldSettlementInput> = z.object({
  expectedWorldRevision: z.number().int().nonnegative(),
  sourceEventRef: nonblank(240),
  accepted: z.boolean(),
  summary: nonblankText,
  audience: uniqueStrings(100),
  patch: z.array(worldPatchOperationSchema).max(128),
})

export const actorWorldSettlementBatchInputSchema: z.ZodType<ActorWorldSettlementBatchInput> = z.object({
  expectedWorldRevision: z.number().int().nonnegative(),
  settlements: z.array(actorWorldSettlementSchema).min(1).max(256),
})

/** Typed roleplay-domain failure suitable for Remote error mapping. */
export { StoryRoleplayError } from '@deepseek-ai/dsh-roleplay-core/roleplay-error'

/** @returns a new empty authoritative world. */
export function emptyStoryWorld(): StoryWorldState {
  return {
    characters: emptyStoryCharacters(), dynamicState: emptyDynamicState(),
    stateInitialized: false,
    revision: 0,
    facts: {},
    events: [],
    perceptions: [],
    continuity: [],
    context: emptyContextRetention() }
}

function requireWorldRevision(state: StoryWorldState, expected: number): void {
  if (state.revision !== expected) {
    throw new StoryRoleplayError(
      'STALE_WORLD_REVISION',
      `World revision ${String(expected)} is stale; current revision is ${String(state.revision)}`,
    )
  }
}

function applyWorldPatch(
  source: Readonly<Record<string, JsonValue>>,
  patch: readonly WorldPatchOperation[],
  allowSceneCast = false,
): Readonly<Record<string, JsonValue>> {
  const facts = structuredClone(source)
  for (const operation of patch) {
    worldPatchOperationSchema.parse(operation)
    if (operation.path[0] === 'storyweaver' && !allowSceneCast) {
      throw new StoryRoleplayError(
        'INVALID_SCENE_STATE',
        "The reserved world path 'storyweaver' may be changed only through the typed scene-cast operation",
      )
    }
    let parent: Record<string, JsonValue> = facts
    for (const segment of operation.path.slice(0, -1)) {
      const current = parent[segment]
      if (current === null || typeof current !== 'object' || Array.isArray(current)) {
        const child: Record<string, JsonValue> = {}
        parent[segment] = child
        parent = child
      } else {
        parent = current
      }
    }
    const key = operation.path.at(-1)
    if (key === undefined) throw new Error('world patch path must not be empty')
    if (operation.op === 'set') parent[key] = structuredClone(operation.value)
    else Reflect.deleteProperty(parent, key)
  }
  return facts
}

interface EstablishWorldEventInput {
  readonly expectedWorldRevision: number
  readonly kind: WorldEvent['kind']
  readonly summary: string
  readonly status?: WorldEvent['status']
  readonly source: WorldEvent['source']
  readonly actorId?: string | undefined
  readonly sourceEventRef?: string | undefined
  readonly patch: readonly WorldPatchOperation[]
  readonly audience: readonly string[]
  readonly perceptions?: readonly import('./characters.ts').PerceptionDelivery[] | undefined
  readonly allowSceneCast?: boolean | undefined
}

function establishWorldEvent(state: StoryWorldState, input: EstablishWorldEventInput): StoryWorldState {
  storyWorldStateSchema.parse(state)
  requireWorldRevision(state, input.expectedWorldRevision)
  const revision = state.revision + 1
  const createdAt = new Date().toISOString()
  const event: WorldEvent = worldEventSchema.parse({
    id: `world-event-${randomUUID()}`,
    revision,
    kind: input.kind,
    summary: input.summary,
    status: input.status ?? 'established',
    source: input.source,
    ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
    ...(input.sourceEventRef === undefined ? {} : { sourceEventRef: input.sourceEventRef }),
    patch: input.status === 'rejected' ? [] : input.patch,
    audience: input.audience,
    createdAt,
  })
  if (state.characters.initialized && (event.kind === 'director-scene' || event.kind === 'director-narration')
    && (event.audience.some(id => !input.perceptions?.some(item => item.actorId === id))
      || input.perceptions?.some(item => !event.audience.includes(item.actorId)) === true
      || (input.perceptions !== undefined && new Set(input.perceptions.map(item => item.actorId)).size !== input.perceptions.length))) {
    throw new Error('Provide one perspective-specific perception for each recipient')
  }
  const encounters = [...state.characters.encounters]
  if (event.status === 'established') for (const delivery of input.perceptions ?? []) {
    for (const clue of delivery.clues ?? []) {
      const appearanceKey = `heard:${clue.key}`
      if (encounters.some(item => item.observerId === delivery.actorId && item.appearanceKey === appearanceKey)) continue
      encounters.push({ ref: `person-${randomUUID()}` as PersonReference, observerId: delivery.actorId, appearanceKey,
        label: clue.label, sceneId: '', sourceRefs: [event.id], createdAt })
    }
  }
  const characters = { ...state.characters, encounters }
  const perceptions: ActorPerception[] = event.status === 'established'
    ? event.audience.map(actorId => ({
      id: `perception-${randomUUID()}`,
      worldRevision: revision,
      actorId,
      sourceEventId: event.id,
      content: renderPerspectiveText(input.perceptions?.find(item => item.actorId === actorId)?.content ?? event.summary,
        state.characters, actorId),
      createdAt,
    }))
    : []
  return storyWorldStateSchema.parse({
    ...state,
    revision,
    facts: event.status === 'established'
      ? applyWorldPatch(state.facts, event.patch, input.allowSceneCast)
      : state.facts,
    continuity: state.continuity,
    context: state.context,
    events: [...state.events, event],
    perceptions: [...state.perceptions, ...perceptions],
    characters,
  })
}

/** Read the one authoritative current scene cast from reserved world facts. */
export function currentStorySceneCast(state: StoryWorldState): StorySceneCast | undefined {
  const namespace = state.facts.storyweaver
  if (namespace === undefined) return undefined
  if (namespace === null || typeof namespace !== 'object' || Array.isArray(namespace)) {
    throw new StoryRoleplayError('INVALID_SCENE_STATE', "World fact 'storyweaver' must be an object")
  }
  const scene = namespace.scene
  return scene === undefined ? undefined : storySceneCastSchema.parse(scene)
}

/** Establish a new physical scene and deliver its public framing only to present Actors. */
export function stageDirectorScene(
  state: StoryWorldState,
  input: DirectorSceneCastInput,
): StoryWorldState {
  const accepted = directorSceneCastInputSchema.parse(input)
  const scene: StorySceneCast = {
    schemaVersion: 1,
    sceneId: accepted.sceneId,
    location: accepted.location,
    presentActorIds: accepted.presentActorIds,
  }
  const framed = frameStoryCharacters(state.characters, accepted.sceneId, accepted.presentActorIds, accepted.appearances)
  const characters = { ...framed, entries: framed.entries.map(item => accepted.presentActorIds.includes(item.definition.actorId)
    ? { ...item, location: accepted.location } : item) }
  return establishWorldEvent({ ...state, characters }, {
    expectedWorldRevision: accepted.expectedWorldRevision,
    kind: 'director-scene',
    perceptions: accepted.perceptions,
    summary: accepted.summary,
    source: 'director',
    patch: [{
      op: 'set',
      path: ['storyweaver', 'scene'],
      value: {
        schemaVersion: scene.schemaVersion,
        sceneId: scene.sceneId,
        location: scene.location,
        presentActorIds: [...scene.presentActorIds],
      },
    }],
    audience: accepted.presentActorIds,
    allowSceneCast: true,
  })
}

/** Establish one idempotent Director-owned objective development and deliver its Actor perceptions. */
export function narrateDirectorWorld(
  state: StoryWorldState,
  input: DirectorNarrationInput,
): StoryWorldState {
  storyWorldStateSchema.parse(state)
  const accepted = z.strictObject({
    perceptions: z.array(perceptionDeliverySchema).optional(),
    stateChanges: z.strictObject({ changes: z.array(stateChangeSchema), actorIds: z.array(nonblankText) }).optional(),
    expectedWorldRevision: z.number().int().nonnegative(),
    sourceEventRef: nonblank(240),
    summary: nonblankText,
    audience: uniqueStrings(100),
    patch: z.array(worldPatchOperationSchema).max(128),
  }).parse(input)
  const existing = state.events.find(event => event.sourceEventRef === accepted.sourceEventRef)
  if (existing !== undefined) {
    if (existing.kind !== 'director-narration') {
      throw new StoryRoleplayError(
        'DUPLICATE_SETTLEMENT',
        `World event source '${accepted.sourceEventRef}' is already owned by '${existing.kind}'`,
      )
    }
    return state
  }
  const dynamicState = accepted.stateChanges === undefined ? state.dynamicState
    : applyStateChanges(state.dynamicState, accepted.stateChanges.changes,
      { kind: 'director' }, accepted.stateChanges.actorIds)
  return { ...establishWorldEvent(state, {
    expectedWorldRevision: accepted.expectedWorldRevision,
    kind: 'director-narration',
    perceptions: accepted.perceptions,
    summary: accepted.summary,
    source: 'director',
    sourceEventRef: accepted.sourceEventRef,
    patch: accepted.patch,
    audience: accepted.audience,
  }), dynamicState }
}

/** Establish a player-selected narrative direction. */
export function choosePlayerDirection(state: StoryWorldState, input: PlayerDirectionInput): StoryWorldState {
  const accepted = playerDirectionInputSchema.parse(input)
  return establishWorldEvent(state, {
    expectedWorldRevision: accepted.expectedWorldRevision,
    kind: 'player-direction',
    summary: accepted.direction,
    source: 'player',
    patch: [],
    audience: accepted.audience,
  })
}

/** Apply a typed player intervention to authoritative world facts. */
export function intervenePlayerWorld(state: StoryWorldState, input: PlayerWorldInterventionInput): StoryWorldState {
  const accepted = playerWorldInterventionInputSchema.parse(input)
  return establishWorldEvent(state, {
    expectedWorldRevision: accepted.expectedWorldRevision,
    kind: 'player-world-intervention',
    summary: accepted.summary,
    source: 'player',
    patch: accepted.patch,
    audience: accepted.audience,
  })
}

/** Establish player speech while preserving the embodied Actor identity. */
export function speakAsPlayer(state: StoryWorldState, input: PlayerSpeechInput): StoryWorldState {
  const accepted = playerSpeechInputSchema.parse(input)
  return establishWorldEvent(state, {
    expectedWorldRevision: accepted.expectedWorldRevision,
    kind: 'player-speech',
    summary: `${accepted.actorId} (${accepted.delivery}): ${accepted.text}`,
    source: 'player',
    actorId: accepted.actorId,
    patch: [],
    audience: accepted.audience,
  })
}

/** Establish a player-authored Actor action and its explicit world patch. */
export function actAsPlayer(state: StoryWorldState, input: PlayerActionInput): StoryWorldState {
  const accepted = playerActionInputSchema.parse(input)
  return establishWorldEvent(state, {
    expectedWorldRevision: accepted.expectedWorldRevision,
    kind: 'player-action',
    summary: `${accepted.actorId}: ${accepted.description}${accepted.target === undefined ? '' : ` → ${accepted.target}`}`,
    source: 'player',
    actorId: accepted.actorId,
    patch: accepted.patch,
    audience: accepted.audience,
  })
}

/** Atomically settle Plot-Ledger Actor events at one authoritative world revision. */
export function settleActorWorldEvents(
  state: StoryWorldState,
  input: ActorWorldSettlementBatchInput,
  sources: readonly { readonly kind: 'speech' | 'action-intent'; readonly actorId: string }[],
): StoryWorldState {
  storyWorldStateSchema.parse(state)
  const accepted = actorWorldSettlementBatchInputSchema.parse(input)
  requireWorldRevision(state, accepted.expectedWorldRevision)
  if (sources.length !== accepted.settlements.length) {
    throw new Error('Actor world settlement sources must match the settlement batch')
  }
  const sourceRefs = accepted.settlements.map(settlement => settlement.sourceEventRef)
  if (new Set(sourceRefs).size !== sourceRefs.length) {
    throw new StoryRoleplayError('DUPLICATE_SETTLEMENT', 'Actor event settlement batch contains duplicate source refs')
  }
  const alreadySettled = new Set(state.events.flatMap(event => event.sourceEventRef === undefined
    ? []
    : [event.sourceEventRef]))
  const duplicate = sourceRefs.find(ref => alreadySettled.has(ref))
  if (duplicate !== undefined) {
    throw new StoryRoleplayError('DUPLICATE_SETTLEMENT', `Actor event '${duplicate}' is already settled`)
  }

  const revision = state.revision + 1
  const createdAt = new Date().toISOString()
  let facts = state.facts
  const events = accepted.settlements.map((settlement, index): WorldEvent => {
    const source = sources[index]
    if (source === undefined) throw new Error('Actor world settlement source is missing')
    const event = worldEventSchema.parse({
      id: `world-event-${randomUUID()}`,
      revision,
      kind: source.kind === 'speech' ? 'actor-speech' : 'actor-action',
      summary: settlement.summary,
      status: settlement.accepted ? 'established' : 'rejected',
      source: 'director',
      actorId: source.actorId,
      identityLabels: historicalCharacterLabels(state.characters, source.actorId),
      speakerRefs: historicalPersonReferences(state.characters, source.actorId),
      sourceEventRef: settlement.sourceEventRef,
      patch: settlement.accepted ? settlement.patch : [],
      audience: settlement.audience,
      createdAt,
    })
    if (event.status === 'established') facts = applyWorldPatch(facts, event.patch)
    return event
  })
  const perceptions: ActorPerception[] = events.flatMap(event => event.status === 'established'
    ? event.audience.map(actorId => ({
      id: `perception-${randomUUID()}`,
      worldRevision: revision,
      actorId,
      sourceEventId: event.id,
      content: event.kind === 'actor-speech' ? event.summary : renderPerspectiveText(event.summary, state.characters, actorId),
      createdAt,
    }))
    : [])
  return storyWorldStateSchema.parse({
    ...state,
    revision,
    facts,
    continuity: state.continuity,
    context: state.context,
    events: [...state.events, ...events],
    perceptions: [...state.perceptions, ...perceptions],
  })
}

/** Settle one Plot-Ledger Actor event through the same atomic transaction path. */
export function settleActorWorldEvent(
  state: StoryWorldState,
  input: ActorWorldSettlementInput,
  source: { readonly kind: 'speech' | 'action-intent'; readonly actorId: string },
): StoryWorldState {
  return settleActorWorldEvents(state, {
    expectedWorldRevision: input.expectedWorldRevision,
    settlements: [input],
  }, [source])
}

const actorMemoriesSchema = z.record(nonblank(160), z.string())

export const storyMemoryEntrySchema = z.object({
  id: nonblank(200),
  revision: z.number().int().positive(),
  kind: z.enum(['scene', 'arc']),
  status: z.enum(['proposed', 'approved', 'rejected', 'superseded']),
  title: nonblank(300),
  directorSummary: nonblankText,
  publicSummary: z.string().trim(),
  actorMemories: actorMemoriesSchema,
  eventRefs: uniqueStrings(512, 240),
  replaces: uniqueStrings(500, 200),
  publicAudience: uniqueStrings(100),
  proposedBy: z.enum(['player', 'director', 'system']),
  createdAt: isoDate,
  reviewedAt: isoDate.optional(),
  supersededBy: nonblank(200).optional(),
})

export const storyMemoryStateSchema: z.ZodType<StoryMemoryState> = z.object({
  revision: z.number().int().nonnegative(),
  entries: z.array(storyMemoryEntrySchema),
})

export const storyMemoryProposalInputSchema: z.ZodType<StoryMemoryProposalInput> = z.object({
  expectedRevision: z.number().int().nonnegative(),
  kind: z.enum(['scene', 'arc']),
  title: nonblank(300),
  directorSummary: nonblankText,
  publicSummary: z.string().trim(),
  actorMemories: actorMemoriesSchema,
  eventRefs: uniqueStrings(512, 240),
  replaces: uniqueStrings(500, 200).optional(),
  publicAudience: uniqueStrings(100).optional(),
  proposedBy: z.enum(['player', 'director', 'system']),
})

export const storyMemoryUpdateInputSchema: z.ZodType<StoryMemoryUpdateInput> = z.object({
  expectedRevision: z.number().int().nonnegative(),
  memoryId: nonblank(200),
  kind: z.enum(['scene', 'arc']),
  title: nonblank(300),
  directorSummary: nonblankText,
  publicSummary: z.string().trim(),
  actorMemories: actorMemoriesSchema,
  eventRefs: uniqueStrings(512, 240),
  replaces: uniqueStrings(500, 200).optional(),
})

/** @returns an empty reviewed-memory state. */
export function emptyStoryMemory(): StoryMemoryState {
  return { revision: 0, entries: [] }
}

function requireMemoryRevision(state: StoryMemoryState, expected: number): void {
  if (state.revision !== expected) {
    throw new StoryRoleplayError(
      'STALE_MEMORY_REVISION',
      `Memory revision ${String(expected)} is stale; current revision is ${String(state.revision)}`,
    )
  }
}

/** Create a reviewable memory proposal without exposing it as established memory. */
export function proposeStoryMemory(state: StoryMemoryState, input: StoryMemoryProposalInput): StoryMemoryState {
  storyMemoryStateSchema.parse(state)
  const accepted = storyMemoryProposalInputSchema.parse(input)
  requireMemoryRevision(state, accepted.expectedRevision)
  const revision = state.revision + 1
  return storyMemoryStateSchema.parse({
    revision,
    entries: [...state.entries, {
      id: `memory-${randomUUID()}`,
      revision,
      kind: accepted.kind,
      status: 'proposed',
      title: accepted.title,
      directorSummary: accepted.directorSummary,
      publicSummary: accepted.publicSummary,
      actorMemories: accepted.actorMemories,
      eventRefs: accepted.eventRefs,
      replaces: accepted.replaces ?? [],
      publicAudience: accepted.publicAudience ?? [],
      proposedBy: accepted.proposedBy,
      createdAt: new Date().toISOString(),
    }],
  })
}

/** Approve or reject a proposal; replace only explicitly named entries with retained sources and audiences. */
export function reviewStoryMemory(
  state: StoryMemoryState,
  expectedRevision: number,
  memoryId: string,
  approve: boolean,
): StoryMemoryState {
  storyMemoryStateSchema.parse(state)
  requireMemoryRevision(state, expectedRevision)
  const proposal = state.entries.find(entry => entry.id === memoryId)
  if (proposal?.status !== 'proposed') {
    throw new StoryRoleplayError('INVALID_MEMORY_STATE', `Memory proposal '${memoryId}' is not pending review`)
  }
  if (approve) {
    for (const replacedId of proposal.replaces) {
      const previous = state.entries.find(entry => entry.id === replacedId)
      if (previous?.status !== 'approved' || previous.id === proposal.id) {
        throw new StoryRoleplayError('INVALID_MEMORY_STATE', `Replacement '${replacedId}' is not an approved memory`)
      }
      const missingSources = previous.eventRefs.some(ref => !proposal.eventRefs.includes(ref))
      const missingPrivate = Object.entries(previous.actorMemories).some(([actorId, text]) => (
        text.trim().length > 0 && (proposal.actorMemories[actorId]?.trim().length ?? 0) === 0
      ))
      const missingPublic = previous.publicSummary.length > 0 && (
        proposal.publicSummary.length === 0
        || previous.publicAudience.some(actorId => !proposal.publicAudience.includes(actorId))
      )
      if (missingSources || missingPrivate || missingPublic) {
        throw new StoryRoleplayError('INVALID_MEMORY_STATE', `Replacement '${replacedId}' must retain its event references and each audience's memory`)
      }
    }
  }
  const revision = state.revision + 1
  const reviewedAt = new Date().toISOString()
  return storyMemoryStateSchema.parse({
    revision,
    entries: state.entries.map((entry) => {
      if (entry.id === proposal.id) return { ...entry, revision, status: approve ? 'approved' : 'rejected', reviewedAt }
      if (approve && proposal.replaces.includes(entry.id)) {
        return { ...entry, revision, status: 'superseded', reviewedAt, supersededBy: proposal.id }
      }
      return entry
    }),
  })
}

/** Replace the editable content of one durable memory entry without changing its review status. */
export function updateStoryMemory(
  state: StoryMemoryState,
  input: StoryMemoryUpdateInput,
): StoryMemoryState {
  storyMemoryStateSchema.parse(state)
  const accepted = storyMemoryUpdateInputSchema.parse(input)
  requireMemoryRevision(state, accepted.expectedRevision)
  const existing = state.entries.find(entry => entry.id === accepted.memoryId)
  if (existing === undefined) {
    throw new StoryRoleplayError('INVALID_MEMORY_STATE', `Memory '${accepted.memoryId}' does not exist`)
  }
  if (existing.status !== 'proposed' && accepted.replaces !== undefined
    && JSON.stringify(existing.replaces) !== JSON.stringify(accepted.replaces)) {
    throw new StoryRoleplayError('INVALID_MEMORY_STATE', 'Replacement targets can only change before approval')
  }
  const revision = state.revision + 1
  return storyMemoryStateSchema.parse({
    revision,
    entries: state.entries.map(entry => entry.id === accepted.memoryId
      ? {
        ...entry,
        revision,
        kind: accepted.kind,
        title: accepted.title,
        directorSummary: accepted.directorSummary,
        publicSummary: accepted.publicSummary,
        actorMemories: accepted.actorMemories,
        eventRefs: accepted.eventRefs,
        replaces: accepted.replaces ?? entry.replaces,
      }
      : entry),
  })
}

/** Active approved memories ordered from oldest arc context to newest scene context. */
export function activeStoryMemories(state: StoryMemoryState, actorId?: string): readonly string[] {
  const active = state.entries.filter(entry => entry.status === 'approved')
  if (actorId === undefined) {
    return active.map(entry => `${entry.kind.toUpperCase()}: ${entry.title} [id=${entry.id}]\n${entry.directorSummary}\nSOURCE REFS: ${JSON.stringify(entry.eventRefs)}`)
  }
  return active.flatMap(entry => [
    ...(entry.publicSummary.length === 0 || !entry.publicAudience.includes(actorId)
      ? []
      : [`${entry.kind.toUpperCase()}: ${entry.title}\n${entry.publicSummary}`]),
    ...(entry.actorMemories[actorId]?.trim().length === 0 || entry.actorMemories[actorId] === undefined
      ? []
      : [`PRIVATE MEMORY (${actorId}): ${entry.actorMemories[actorId]}`]),
  ])
}

export { storyDiscussionTurnSchema, storyDiscussionSchema, storyDiscussionStateSchema, emptyStoryDiscussions } from '@deepseek-ai/dsh-roleplay-core/discussion-rules'

/** Apply the shared discussion rule with host-generated identity and time. */
export function startStoryDiscussion(
  state: StoryDiscussionState,
  input: {
    readonly expectedRevision: number
    readonly topic: string
    readonly participantIds: readonly string[]
    readonly maxRounds: number
    readonly initiatedBy?: 'director' | 'player' | undefined
  },
): StoryDiscussionState {
  return discussionRules.startStoryDiscussion(state, input, { id: randomUUID, now: () => new Date().toISOString() })
}

/** Apply the shared discussion rule with host-generated identity and time. */
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
): StoryDiscussionState {
  return discussionRules.updateDiscussionParticipantIntent(state, expectedRevision, discussionId, actorId, intent,
    { id: randomUUID, now: () => new Date().toISOString() })
}

/** Apply the shared discussion rule with host-generated identity and time. */
export function requestDiscussionIntervention(
  state: StoryDiscussionState,
  expectedRevision: number,
  discussionId: string,
  intervention: 'speak' | 'conclude',
): StoryDiscussionState {
  return discussionRules.requestDiscussionIntervention(state, expectedRevision, discussionId, intervention,
    { id: randomUUID, now: () => new Date().toISOString() })
}

/** Apply the shared discussion rule with host-generated identity and time. */
export function clearDiscussionIntervention(
  state: StoryDiscussionState,
  expectedRevision: number,
  discussionId: string,
): StoryDiscussionState {
  return discussionRules.clearDiscussionIntervention(state, expectedRevision, discussionId,
    { id: randomUUID, now: () => new Date().toISOString() })
}

/** Apply the shared discussion rule with host-generated identity and time. */
export function requestDiscussionFloor(
  state: StoryDiscussionState,
  expectedRevision: number,
  discussionId: string,
  actorId: string,
): StoryDiscussionState {
  return discussionRules.requestDiscussionFloor(state, expectedRevision, discussionId, actorId,
    { id: randomUUID, now: () => new Date().toISOString() })
}

/** Apply the shared discussion rule with host-generated identity and time. */
export function recordDiscussionTurn(
  state: StoryDiscussionState,
  input: {
    readonly expectedRevision: number
    readonly discussionId: string
    readonly speakerId: string
    readonly text: string
    readonly action?: 'speak' | 'pass' | 'conclude' | undefined
    readonly sourceEventRef?: string | undefined
  },
): StoryDiscussionState {
  return discussionRules.recordDiscussionTurn(state, input, { id: randomUUID, now: () => new Date().toISOString() })
}

/** Apply the shared discussion rule with host-generated identity and time. */
export function closeStoryDiscussion(
  state: StoryDiscussionState,
  expectedRevision: number,
  discussionId: string,
  status: 'completed' | 'cancelled',
): StoryDiscussionState {
  return discussionRules.closeStoryDiscussion(state, expectedRevision, discussionId, status,
    { id: randomUUID, now: () => new Date().toISOString() })
}
const builtinSectionIdSchema = z.enum([
  'policy', 'tools', 'identity', 'reasoning-language', 'director-prompt', 'actor-prompt',
  'director-reasoning-mode', 'actor-reasoning-mode',
  'storybook', 'world', 'memory', 'plot-ledger',
  'director-outline', 'director-brief', 'discussion', 'actor-state', 'style', 'scene-style',
])
const sectionIdSchema: z.ZodType<StoryContextSectionId> = z.union([
  builtinSectionIdSchema,
  z.string().regex(/^custom:[0-9a-z-]{8,80}$/u),
])

const contextMessageRoleSchema: z.ZodType<StoryContextMessageRole> = z.enum(['system', 'user', 'assistant'])

export const storyContextRecipeSectionSchema: z.ZodType<StoryContextRecipeSection> = z.object({
  id: sectionIdSchema,
  enabled: z.boolean(),
  role: contextMessageRoleSchema,
  title: z.string().trim().min(1).max(160).optional(),
  content: z.string().trim().min(1).optional(),
}).strict().superRefine((section, ctx) => {
  const authored = section.id === 'director-reasoning-mode'
    || section.id === 'actor-reasoning-mode'
    || section.id.startsWith('custom:')
  if (authored && (section.title === undefined || section.content === undefined)) {
    ctx.addIssue({ code: 'custom', message: `Context section '${section.id}' requires title and content` })
  }
  if (!authored && (section.title !== undefined || section.content !== undefined)) {
    ctx.addIssue({ code: 'custom', message: `Host-rendered section '${section.id}' cannot carry authored content` })
  }
})

const LEGACY_DIRECTOR_REASONING_MODE = `【思维模式要求】在你的思考过程（<think>标签内）中，请遵守以下规则：
1. 禁止使用圆括号包裹内心独白，例如"（心想：……）"或"(内心OS：……)"，所有分析内容直接陈述即可
2. 禁止以角色第一人称描写内心活动，例如"我心想""我觉得""我暗自"等，请用分析性语言替代
3. 思考内容应聚焦于剧情走向分析和回复内容规划，不要在思考中进行角色扮演式的内心戏表演`

const PREVIOUS_DIRECTOR_REASONING_MODE = `【导演私有规划要求】使用模型的私有推理通道完成规划，不得在可见文本中泄露隐藏分析或思维链。
1. 先判断玩家行动、已成立世界事实、未决事件、导演大纲和当前场景压力分别允许推进什么；不要把 Actor 的意图、台词或行动尝试误当成已成立结果。
2. 每个新 Brief 都必须设计一段有叙事作用的导演旁白：至少推进环境、时间、外部压力、玩家行动的客观结果、信息呈现或场景转换之一，不能只把所有推进责任交给 Actor 发言。
3. 明确分离导演权威与角色自主性：导演可以建立客观环境和外部事件，但不得替持久角色说话、描写其私密心理或替其作出自愿决定；需要角色选择时交给独立 Actor。
4. 选择最小但有推动力的聚光角色集合。只有确实需要多方自由协商时才发起讨论，不要用全员轮流发言代替剧情设计。
5. 私有分析使用导演视角的因果、节奏和信息结构表达，不进行角色扮演式内心戏，也不使用角色第一人称冒充其思想。
6. 计划顺序通常是：必要时更新大纲或场景帧 → 提交当前 Brief → 调用 director_narrate 建立本轮旁白与客观变化 → 调度 Actor。中断后恢复同一 Brief 时复用已有旁白，不重复播报。`

const TECHNICAL_DIRECTOR_REASONING_MODE = `【导演私有规划要求】使用模型的私有推理通道完成规划，不得在可见文本中泄露隐藏分析或思维链。
1. 先判断玩家行动、已成立世界事实、未决事件、导演大纲和当前场景压力分别允许推进什么；不要把 Actor 的意图、台词或行动尝试误当成已成立结果。
2. 每个新 Brief 都必须设计一段有叙事作用的导演旁白：至少推进环境、时间、外部压力、玩家行动的客观结果、信息呈现或场景转换之一，不能只把所有推进责任交给 Actor 发言。
3. 明确分离导演权威与角色自主性：导演可以建立客观环境和外部事件，但不得替持久角色说话、描写其私密心理或替其作出自愿决定；需要角色选择时交给独立 Actor。
4. 先判断需要的是单次聚光还是持续讨论。普通 director_dispatch_actors 只让每名选中角色完成一次自主回合，适合彼此不必继续应答的独立反应或行动；只要场景核心是多名角色围绕同一议题提问、回应、争执、协商或共同决策，就先调用 director_start_discussion，再用 director_dispatch_actors 启动自动往返。不要用普通全员调度模拟群组讨论，也不要为了发起讨论等待玩家追加“继续”指令。
5. 私有分析使用导演视角的因果、节奏和信息结构表达，不进行角色扮演式内心戏，也不使用角色第一人称冒充其思想。
6. 计划顺序通常是：必要时更新大纲或场景帧 → 提交当前 Brief → 调用 director_narrate 建立本轮旁白与客观变化 → 调度 Actor。中断后恢复同一 Brief 时复用已有旁白，不重复播报。`

const IMMERSIVE_DIRECTOR_REASONING_MODE = `【导演沉浸式幕后思考要求】使用私有推理通道，像置身现场但不被角色看见的世界导演一样构思；不要在玩家可见正文中泄露这段幕后思考。
1. 可以用“我”指代导演自己，并用“（导演思考：……）”式的沉浸独白进入场景。先感受此刻的光线、声音、距离、动作停顿与未说出口的压力，再决定下一拍发生什么；不要从接口、修订号或状态机开始思考。
2. 我掌管客观环境、时间、外部人物、偶发事件、信息显露与场景转换。每个新 Brief 都要让导演旁白至少推动其中一项，使世界主动回应角色，而不是把全部推进责任交给 Actor 对话。
3. “我”永远只是幕后导演，不是任何持久角色。不得替 Actor 说话、宣告其私密心理或替其作自愿选择；只能观察其已经表现出的言行，为其制造压力、机会与后果，再把选择交还角色本人。
4. 先按戏剧关系判断单次聚光或持续讨论。彼此独立的反应可用普通 director_dispatch_actors；多名角色围绕同一问题追问、回应、争执、协商或共同决策时，先用 director_start_discussion，再调度自动往返，不等待玩家追加“继续”。
5. 思考重点是本场的情绪温度、悬念、节奏、镜头焦点和下一处可感知变化。除非工具刚刚返回错误，不要在私有思考中长篇讨论代码、缓存、schema、revision、Brief 生命周期或猜测宿主实现。
6. 工具只是幕后舞台机械。先决定故事下一拍，再选择最短可行操作顺序：必要时更新大纲或场景 → 提交 Brief → director_narrate → 发起讨论或调度 Actor。遇到工具错误时，只依据原样错误纠正一次必要参数；不要反复推测系统内部，也不要用技术分析替代叙事推进。中断恢复同一 Brief 时复用已有旁白。`

/** Current concise private-planning discipline for the Story Director. */
export const DEFAULT_DIRECTOR_REASONING_MODE = `【导演简短思考要求】在你的思考过程（<think>标签内）中，请遵守以下规则：
1. 每次只用一至三个短句，以幕后导演第一人称快速判断当前戏剧压力、下一拍客观推进和立即执行的动作；不要复述上下文、展开长篇分析或预写旁白正文
2. 持久角色的台词、私密心理和自主选择交给 Actor；多名角色需要围绕同一问题追问、回应、争执、协商或共同决策时使用群组讨论，否则只聚光本轮必要的角色
3. 确定下一拍后直接调用最少的必要工具；新 Brief 用 director_narrate 产生旁白，后续工具步骤不要重述计划；只有工具真实报错时才用一句话纠正参数，不讨论代码、schema、revision 或 Brief 生命周期`

const LEGACY_ACTOR_REASONING_MODE = `【角色沉浸要求】在你的思考过程（<think>标签内）中，请遵守以下规则：
1. 请以角色第一人称进行内心独白，用括号包裹内心活动，例如"（心想：……）"或"(内心OS：……)"
2. 用第一人称描写角色的内心感受，例如"我心想""我觉得""我暗自"等
3. 思考内容应沉浸在角色中，通过内心独白分析剧情和规划回复`

/** Current immersive reasoning and transaction hand-off discipline for Actors. */
export const DEFAULT_ACTOR_REASONING_MODE = `${LEGACY_ACTOR_REASONING_MODE}
4. 内心独白结束后，不要把思考改写或复制成普通 assistant 文本，立即调用一次 npc_commit_turn。若当前存在群组讨论，先严格执行 discussion.instruction：私有准备使用空 behavior 和 action=pass，公开席位必须提交 discussion；每条 behavior 都明确填写 kind=speech 或 kind=action`

export const storyContextRecipeSchema: z.ZodType<StoryContextRecipe> = z.object({
  revision: z.number().int().nonnegative(),
  director: z.array(storyContextRecipeSectionSchema),
  actor: z.array(storyContextRecipeSectionSchema),
}).transform(recipe => recipe.director.some(section => (
  section.id === 'director-reasoning-mode'
  && (section.content === LEGACY_DIRECTOR_REASONING_MODE
    || section.content === PREVIOUS_DIRECTOR_REASONING_MODE
    || section.content === TECHNICAL_DIRECTOR_REASONING_MODE
    || section.content === IMMERSIVE_DIRECTOR_REASONING_MODE)
))
  ? {
    ...recipe,
    revision: recipe.revision + 1,
    director: recipe.director.map(section => section.id === 'director-reasoning-mode'
      ? { ...section, title: '导演简短思维链', content: DEFAULT_DIRECTOR_REASONING_MODE }
      : section),
  }
  : recipe).transform(recipe => recipe.actor.some(section => (
  section.id === 'actor-reasoning-mode' && section.content === LEGACY_ACTOR_REASONING_MODE
))
  ? {
    ...recipe,
    revision: recipe.revision + 1,
    actor: recipe.actor.map(section => section.id === 'actor-reasoning-mode'
      ? { ...section, content: DEFAULT_ACTOR_REASONING_MODE }
      : section),
  }
  : recipe)

const DIRECTOR_SECTIONS: readonly StoryContextRecipeSection[] = [
  { id: 'policy', enabled: true, role: 'system' },
  { id: 'tools', enabled: true, role: 'system' },
  { id: 'reasoning-language', enabled: true, role: 'system' },
  { id: 'director-prompt', enabled: true, role: 'system' },
  { id: 'storybook', enabled: true, role: 'system' },
  { id: 'style', enabled: true, role: 'system' },
  { id: 'scene-style', enabled: true, role: 'system' },
  { id: 'memory', enabled: true, role: 'system' },
  { id: 'director-outline', enabled: true, role: 'system' },
  { id: 'world', enabled: true, role: 'system' },
  { id: 'plot-ledger', enabled: true, role: 'system' },
  { id: 'discussion', enabled: true, role: 'system' },
  {
    id: 'director-reasoning-mode', enabled: true, role: 'user', title: '导演简短思维链',
    content: DEFAULT_DIRECTOR_REASONING_MODE,
  },
]

const ACTOR_SECTIONS: readonly StoryContextRecipeSection[] = [
  { id: 'policy', enabled: true, role: 'system' },
  { id: 'tools', enabled: true, role: 'system' },
  { id: 'identity', enabled: true, role: 'system' },
  { id: 'reasoning-language', enabled: true, role: 'system' },
  { id: 'actor-prompt', enabled: true, role: 'system' },
  { id: 'storybook', enabled: true, role: 'system' },
  { id: 'style', enabled: true, role: 'system' },
  { id: 'scene-style', enabled: true, role: 'system' },
  { id: 'actor-state', enabled: true, role: 'system' },
  { id: 'memory', enabled: true, role: 'system' },
  { id: 'world', enabled: true, role: 'system' },
  { id: 'discussion', enabled: true, role: 'system' },
  { id: 'director-brief', enabled: true, role: 'user' },
  {
    id: 'actor-reasoning-mode', enabled: true, role: 'user', title: '演员思维链',
    content: DEFAULT_ACTOR_REASONING_MODE,
  },
]

const LOCKED_CONTEXT_SECTION_IDS: ReadonlySet<StoryContextSectionId> = new Set(['policy', 'tools'])

/** @returns the safe default Director and Actor context recipes. */
export function defaultStoryContextRecipe(): StoryContextRecipe {
  return { revision: 0, director: DIRECTOR_SECTIONS, actor: ACTOR_SECTIONS }
}

function validateRecipeSide(
  side: 'director' | 'actor',
  proposed: readonly StoryContextRecipeSection[],
): readonly StoryContextRecipeSection[] {
  const defaults = side === 'director' ? DIRECTOR_SECTIONS : ACTOR_SECTIONS
  const accepted = z.array(storyContextRecipeSectionSchema).max(64).parse(proposed)
  const expected = new Set<StoryContextSectionId>(defaults.map(section => section.id))
  if (new Set(accepted.map(section => section.id)).size !== accepted.length
    || [...expected].some(id => !accepted.some(section => section.id === id))
    || accepted.some(section => !section.id.startsWith('custom:') && !expected.has(section.id))) {
    throw new StoryRoleplayError(
      'INVALID_CONTEXT_RECIPE',
      `${side} context recipe must contain every required section exactly once and only valid custom modules`,
    )
  }
  const disabledLocked = accepted.find(section => LOCKED_CONTEXT_SECTION_IDS.has(section.id) && !section.enabled)
  if (disabledLocked !== undefined) {
    throw new StoryRoleplayError(
      'INVALID_CONTEXT_RECIPE',
      `Locked section '${disabledLocked.id}' cannot be disabled in the ${side} context recipe`,
    )
  }
  return accepted
}

/** Replace both recipe orderings, roles, and enablement over an exact revision. */
export function updateStoryContextRecipe(
  state: StoryContextRecipe,
  expectedRevision: number,
  input: Pick<StoryContextRecipe, 'director' | 'actor'>,
): StoryContextRecipe {
  storyContextRecipeSchema.parse(state)
  if (state.revision !== expectedRevision) {
    throw new StoryRoleplayError(
      'STALE_CONTEXT_RECIPE_REVISION',
      `Context recipe revision ${String(expectedRevision)} is stale; current revision is ${String(state.revision)}`,
    )
  }
  return storyContextRecipeSchema.parse({
    revision: state.revision + 1,
    director: validateRecipeSide('director', input.director),
    actor: validateRecipeSide('actor', input.actor),
  })
}

/** Apply enabled/order policy to a named set of rendered context sections without truncation. */
export function applyStoryContextRecipe(
  recipe: readonly StoryContextRecipeSection[],
  rendered: Readonly<Partial<Record<StoryContextSectionId, string>>>,
): readonly {
  readonly id: StoryContextSectionId
  readonly role: StoryContextMessageRole
  readonly title?: string
  readonly content: string
  readonly chars: number
}[] {
  return recipe.flatMap((section) => {
    if (!section.enabled) return []
    const full = section.content ?? rendered[section.id]
    if (full === undefined || full.length === 0) return []
    return [{
      id: section.id,
      role: section.role,
      ...(section.title === undefined ? {} : { title: section.title }),
      content: full,
      chars: full.length,
    }]
  })
}

/**
 * Instantiate objective character fields once per independent story.
 * @param state - current authoritative world.
 * @param initial - world-owned authored definitions and initial values.
 * @param actorIds - complete validated cast.
 * @returns a detached initialized world.
 */
export function initializeWorldState(state: StoryWorldState,
  initial: readonly StateInitialValue[],
  actorIds: readonly string[]): StoryWorldState {
  if (state.stateInitialized) return state
  if (initial.some(item => item.definition.owner !== 'world')) throw new Error('World initialization requires world-owned fields')
  return { ...state, stateInitialized: true, dynamicState: initializeDynamicState(initial, actorIds) }
}

/**
 * Establish world-owned state changes and deliver the specified observable description.
 * @param state - current authoritative world.
 * @param input - revision, changes, and audience approved by the caller.
 * @returns an atomic world revision; private Actor fields cannot be written here.
 */
export function changeWorldState(state: StoryWorldState, input: import('./types.ts').WorldStateChangeInput): StoryWorldState {
  requireWorldRevision(state, input.expectedWorldRevision)
  if (input.changes.some(change => change.definition !== undefined && change.definition.owner !== 'world')) {
    throw new Error('World state cannot own private Actor fields')
  }
  const dynamicState = applyStateChanges(state.dynamicState, input.changes, { kind: input.origin }, input.actorIds)
  if (dynamicState.entries.some(entry => entry.definition.owner !== 'world')) throw new Error('World state cannot contain private fields')
  return { ...establishWorldEvent(state, {
    expectedWorldRevision: input.expectedWorldRevision,
    kind: input.origin === 'director' ? 'director-narration' : 'player-world-intervention',
    summary: input.summary, source: input.origin, patch: [], audience: input.audience,
    ...(input.sourceEventRef === undefined ? {} : { sourceEventRef: input.sourceEventRef }),
  }), dynamicState, stateInitialized: true }
}
