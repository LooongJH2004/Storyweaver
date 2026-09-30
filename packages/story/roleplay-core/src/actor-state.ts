import type { ActorMemoryView, ActorPrivateView } from './actor-model.ts'
/** Strict replay fold for Actor and PlayerAuthority log-only events. */

import { z } from 'zod'
import { emptyKnowledge, applyKnowledgeChanges, knowledgeChangeSchema, knowledgeAuthoritySchema, knowledgeStateSchema,
  type KnowledgeState } from './knowledge.ts'
import { emptyDynamicState, applyStateChanges, stateChangeSchema } from './dynamic-state.ts'
import type { DynamicState } from './dynamic-state.ts'
import { actorContinuityRequestSchema } from './actor-continuity.ts'
import type { CharacterChange, CharacterChangeMap, CharacterChangeType } from './actor-events.ts'
import {
  ActorActionId,
  ActorBeliefId,
  ActorEmotionId,
  ActorExpressionId,
  ActorGoalId,
  ActorId,
  ActorIntentionId,
  ActorMemoryId,
  ActorMemoryReleaseId,
  ActorRelationshipId,
  ActorThoughtId,
  ActorTurningPointId,
  PlayerInterventionId,
} from './actor-model.ts'
import type {
  ActorActionRecord,
  ActorBeliefSnapshot,
  ActorDescriptor,
  ActorEmotionRecord,
  ActorExpressionRecord,
  ActorGoalSnapshot,
  ActorIntentionRecord,
  ActorMemoryRecord,
  ActorMemoryReleaseRecord,
  ActorRelationshipSnapshot,
  ActorThoughtRecord,
  ActorTurningPointSnapshot,
  ActorTurnCloseReason,
  PlayerInterventionRecord,
} from './actor-model.ts'

const nonEmpty = z.string().min(1)
const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const positiveSafeInteger = nonNegativeSafeInteger.min(1)
const actorIdSchema = nonEmpty.transform(ActorId)
const thoughtIdSchema = nonEmpty.transform(ActorThoughtId)
const emotionIdSchema = nonEmpty.transform(ActorEmotionId)
const beliefIdSchema = nonEmpty.transform(ActorBeliefId)
const relationshipIdSchema = nonEmpty.transform(ActorRelationshipId)
const memoryIdSchema = nonEmpty.transform(ActorMemoryId)
const memoryReleaseIdSchema = nonEmpty.transform(ActorMemoryReleaseId)
const turningPointIdSchema = nonEmpty.transform(ActorTurningPointId)
const goalIdSchema = nonEmpty.transform(ActorGoalId)
const intentionIdSchema = nonEmpty.transform(ActorIntentionId)
const expressionIdSchema = nonEmpty.transform(ActorExpressionId)
const actionIdSchema = nonEmpty.transform(ActorActionId)
const interventionIdSchema = nonEmpty.transform(PlayerInterventionId)
const capabilitySchema = z.enum(['speak', 'act', 'reflect', 'memory', 'goals', 'schedule'])
const speechDeliverySchema = z.enum(['spoken', 'whispered', 'written'])
const speechIntentSchema = z.enum([
  'sincere', 'question', 'command', 'promise', 'proposal', 'threat', 'comfort', 'lie', 'mislead', 'evade',
])

const actorDescriptorSchema = z.object({
  id: actorIdSchema,
  displayName: nonEmpty,
  persona: nonEmpty,
  capabilities: z.array(capabilitySchema),
}).strict().superRefine((value, issue) => {
  if (new Set(value.capabilities).size !== value.capabilities.length) {
    issue.addIssue({ code: 'custom', message: 'actor capabilities must be unique' })
  }
}) as z.ZodType<ActorDescriptor>

const thoughtSchema = z.object({
  id: thoughtIdSchema,
  actorId: actorIdSchema,
  content: nonEmpty,
  about: z.array(nonEmpty),
  conclusion: nonEmpty.optional(),
}).strict() as z.ZodType<ActorThoughtRecord>

const emotionSchema = z.object({
  id: emotionIdSchema,
  actorId: actorIdSchema,
  emotion: nonEmpty,
  intensity: z.number().int().min(1).max(5),
  toward: z.array(nonEmpty),
  cause: nonEmpty.optional(),
  impulse: nonEmpty.optional(),
}).strict() as z.ZodType<ActorEmotionRecord>

const beliefSchema = z.object({
  id: beliefIdSchema,
  actorId: actorIdSchema,
  revision: positiveSafeInteger,
  proposition: nonEmpty,
  stance: z.enum(['believe', 'suspect', 'doubt', 'disbelieve', 'uncertain']),
  confidence: z.number().int().min(1).max(5),
  about: z.array(nonEmpty),
}).strict() as z.ZodType<ActorBeliefSnapshot>

const relationshipSchema = z.object({
  id: relationshipIdSchema,
  actorId: actorIdSchema,
  revision: positiveSafeInteger,
  target: nonEmpty,
  dimension: z.enum([
    'trust', 'affection', 'fear', 'respect', 'resentment', 'loyalty', 'suspicion', 'dependence',
  ]),
  value: z.number().int().min(-5).max(5),
  reason: nonEmpty,
}).strict() as z.ZodType<ActorRelationshipSnapshot>

const memorySchema = z.object({
  id: memoryIdSchema,
  actorId: actorIdSchema,
  content: nonEmpty,
  importance: z.number().int().min(1).max(5),
  tags: z.array(nonEmpty),
  sourceRefs: z.array(nonEmpty),
  meaning: nonEmpty.optional(),
}).strict() as z.ZodType<ActorMemoryRecord>

const memoryReleaseSchema = z.object({
  id: memoryReleaseIdSchema,
  actorId: actorIdSchema,
  about: nonEmpty,
  mode: z.enum(['fade', 'suppress', 'reject', 'let-go']),
  reason: nonEmpty.optional(),
  matchedMemoryIds: z.array(memoryIdSchema),
}).strict() as z.ZodType<ActorMemoryReleaseRecord>

const turningPointChangeSchema = z.object({
  dimension: z.enum(['belief', 'goal', 'relationship', 'conflict', 'identity', 'memory']),
  subject: nonEmpty,
  before: nonEmpty.optional(),
  after: nonEmpty,
}).strict()

const turningPointSchema = z.object({
  id: turningPointIdSchema,
  actorId: actorIdSchema,
  revision: positiveSafeInteger,
  trigger: nonEmpty,
  interpretation: nonEmpty,
  significance: z.number().int().min(3).max(5),
  status: z.enum(['tentative', 'integrated', 'reversed', 'rejected']),
  changes: z.array(turningPointChangeSchema).min(1).max(16),
  sourceRefs: z.array(nonEmpty).max(64),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict() as z.ZodType<ActorTurningPointSnapshot>

const goalSchema = z.object({
  id: goalIdSchema,
  actorId: actorIdSchema,
  revision: positiveSafeInteger,
  description: nonEmpty,
  priority: z.number().int().min(1).max(5),
  status: z.enum(['active', 'completed', 'abandoned']),
  reason: nonEmpty.optional(),
}).strict() as z.ZodType<ActorGoalSnapshot>

const triggerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('soon') }).strict(),
  z.object({ kind: z.literal('world-time'), at: nonEmpty }).strict(),
  z.object({ kind: z.literal('event'), when: nonEmpty }).strict(),
  z.object({ kind: z.literal('condition'), condition: nonEmpty }).strict(),
])

const intentionSchema = z.object({
  id: intentionIdSchema,
  actorId: actorIdSchema,
  description: nonEmpty,
  trigger: triggerSchema,
  commitment: z.number().int().min(1).max(5),
  status: z.literal('scheduled'),
}).strict() as z.ZodType<ActorIntentionRecord>

const actorExpressionSchema = z.object({
  id: expressionIdSchema,
  actorId: actorIdSchema,
  origin: z.literal('actor'),
  text: nonEmpty,
  audience: z.array(nonEmpty),
  delivery: speechDeliverySchema,
  tone: nonEmpty.optional(),
  intent: speechIntentSchema.optional(),
}).strict()
const playerExpressionSchema = z.object({
  id: expressionIdSchema,
  actorId: actorIdSchema,
  origin: z.literal('player'),
  playerInterventionId: interventionIdSchema,
  text: nonEmpty,
  audience: z.array(nonEmpty),
  delivery: speechDeliverySchema,
  tone: nonEmpty.optional(),
  intent: speechIntentSchema.optional(),
}).strict()
const expressionSchema = z.discriminatedUnion('origin', [actorExpressionSchema, playerExpressionSchema]) as z.ZodType<ActorExpressionRecord>

const actorActionSchema = z.object({
  id: actionIdSchema,
  actorId: actorIdSchema,
  origin: z.literal('actor'),
  description: nonEmpty,
  target: nonEmpty.optional(),
  purpose: nonEmpty.optional(),
  manner: nonEmpty.optional(),
}).strict()
const playerActionSchema = z.object({
  id: actionIdSchema,
  actorId: actorIdSchema,
  origin: z.literal('player'),
  playerInterventionId: interventionIdSchema,
  description: nonEmpty,
  target: nonEmpty.optional(),
  purpose: nonEmpty.optional(),
  manner: nonEmpty.optional(),
}).strict()
const actionSchema = z.discriminatedUnion('origin', [actorActionSchema, playerActionSchema]) as z.ZodType<ActorActionRecord>

const playerInterventionSchema = z.discriminatedUnion('kind', [
  z.object({ id: interventionIdSchema, kind: z.literal('story-direction'), content: nonEmpty }).strict(),
  z.object({ id: interventionIdSchema, kind: z.literal('world-intervention'), content: nonEmpty }).strict(),
  z.object({
    id: interventionIdSchema,
    kind: z.literal('embody-speech'),
    targetActorId: actorIdSchema,
    content: nonEmpty,
    audience: z.array(nonEmpty),
    delivery: speechDeliverySchema,
  }).strict(),
  z.object({
    id: interventionIdSchema,
    kind: z.literal('embody-action'),
    targetActorId: actorIdSchema,
    content: nonEmpty,
    target: nonEmpty.optional(),
  }).strict(),
]) as z.ZodType<PlayerInterventionRecord>

const descriptorEventSchema = z.object({ version: z.literal(1),
  actor: actorDescriptorSchema }).strict() as z.ZodType<CharacterChangeMap['character.defined']>
const thoughtEventSchema = z.object({ version: z.literal(1),
  thought: thoughtSchema }).strict() as z.ZodType<CharacterChangeMap['thought.recorded']>
const emotionEventSchema = z.object({ version: z.literal(1),
  emotion: emotionSchema }).strict() as z.ZodType<CharacterChangeMap['emotion.recorded']>
const beliefEventSchema = z.object({ version: z.literal(1),
  belief: beliefSchema }).strict() as z.ZodType<CharacterChangeMap['belief.revised']>
const relationshipEventSchema = z.object({ version: z.literal(1),
  relationship: relationshipSchema }).strict() as z.ZodType<CharacterChangeMap['relationship.revised']>
const memoryEventSchema = z.object({ version: z.literal(1),
  memory: memorySchema }).strict() as z.ZodType<CharacterChangeMap['memory.recorded']>
const memoryReleaseEventSchema = z.object({ version: z.literal(1),
  release: memoryReleaseSchema }).strict() as z.ZodType<CharacterChangeMap['memory.released']>
const forgottenEventSchema = z.object({
  version: z.literal(1),
  actorId: actorIdSchema,
  memoryId: memoryIdSchema,
  reason: nonEmpty.optional(),
}).strict() as z.ZodType<CharacterChangeMap['memory.forgotten']>
const goalEventSchema = z.object({ version: z.literal(1), goal: goalSchema }).strict() as z.ZodType<CharacterChangeMap['goal.revised']>
const intentionEventSchema = z.object({ version: z.literal(1),
  intention: intentionSchema }).strict() as z.ZodType<CharacterChangeMap['intention.recorded']>
const turningPointEventSchema = z.object({ version: z.literal(1),
  turningPoint: turningPointSchema }).strict() as z.ZodType<CharacterChangeMap['turning-point.revised']>
const expressionEventSchema = z.object({ version: z.literal(1),
  expression: expressionSchema }).strict() as z.ZodType<CharacterChangeMap['speech.expressed']>
const actionEventSchema = z.object({ version: z.literal(1),
  action: actionSchema }).strict() as z.ZodType<CharacterChangeMap['action.attempted']>
const turnClosedEventSchema = z.object({
  version: z.literal(1),
  actorId: actorIdSchema,
  turn: positiveSafeInteger,
  reason: z.enum(['yield', 'forget', 'implicit-silence']),
  posture: z.enum(['finished', 'silent', 'watching', 'waiting', 'hesitating', 'withdrawing']).optional(),
  nextImpulse: nonEmpty.optional(),
  continuity: z.array(actorContinuityRequestSchema).optional(),
  discussion: z.object({
    stance: nonEmpty.optional(),
    eagerness: z.enum(['low', 'medium', 'high']),
    action: z.enum(['speak', 'pass', 'conclude']),
    nextSpeakerId: nonEmpty.optional(),
  }).optional(),
}).strict() as z.ZodType<CharacterChangeMap['character.turn-closed']>
const interventionEventSchema = z.object({
  version: z.literal(1),
  intervention: playerInterventionSchema,
}).strict() as z.ZodType<CharacterChangeMap['player.intervened']>

/** Lifecycle changes use the same validators in execution adapters and narrative commands. */
export const characterLifecycleChangeSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('thought.recorded'), data: thoughtEventSchema }),
  z.strictObject({ type: z.literal('memory.recorded'), data: memoryEventSchema }),
  z.strictObject({ type: z.literal('memory.released'), data: memoryReleaseEventSchema }),
  z.strictObject({ type: z.literal('memory.forgotten'), data: forgottenEventSchema }),
  z.strictObject({ type: z.literal('goal.revised'), data: goalEventSchema }),
  z.strictObject({ type: z.literal('intention.recorded'), data: intentionEventSchema }),
  z.strictObject({ type: z.literal('turning-point.revised'), data: turningPointEventSchema }),
])
/** Private lifecycle mutation, excluding identity, world, and execution authority. */
export type CharacterLifecycleChange = z.infer<typeof characterLifecycleChangeSchema>

/** One memory plus its current tombstone projection. */
export interface ActorMemoryFold {
  readonly record: ActorMemoryRecord
  status: 'active' | 'forgotten'
  forgottenReason?: string
}

/** Mutable internal state reconstructed from one narrative character history. */
export interface ActorFoldState {
  knowledge: KnowledgeState
  dynamicState: DynamicState
  stateActorIds?: readonly string[]
  descriptor?: ActorDescriptor
  configurationRevision: number
  readonly thoughts: ActorThoughtRecord[]
  readonly thoughtIds: Set<ActorThoughtId>
  readonly emotions: ActorEmotionRecord[]
  readonly emotionIds: Set<ActorEmotionId>
  readonly beliefs: Map<ActorBeliefId, ActorBeliefSnapshot>
  readonly relationships: Map<ActorRelationshipId, ActorRelationshipSnapshot>
  readonly memories: Map<ActorMemoryId, ActorMemoryFold>
  readonly memoryReleases: ActorMemoryReleaseRecord[]
  readonly memoryReleaseIds: Set<ActorMemoryReleaseId>
  readonly turningPoints: Map<ActorTurningPointId, ActorTurningPointSnapshot>
  readonly goals: Map<ActorGoalId, ActorGoalSnapshot>
  readonly intentions: Map<ActorIntentionId, ActorIntentionRecord>
  readonly expressions: ActorExpressionRecord[]
  readonly expressionIds: Set<ActorExpressionId>
  readonly actions: ActorActionRecord[]
  readonly actionIds: Set<ActorActionId>
  readonly playerInterventions: PlayerInterventionRecord[]
  readonly interventionsById: Map<PlayerInterventionId, PlayerInterventionRecord>
  readonly closedTurns: Map<number, ActorTurnCloseReason>
  currentTurn?: number
}

/**
 * Construct an empty Actor projection.
 * @returns mutable state ready to receive one Actor narrative character history.
 */
export function emptyActorFoldState(): ActorFoldState {
  return {
    knowledge: emptyKnowledge(),
    dynamicState: emptyDynamicState(),
    configurationRevision: 0,
    thoughts: [],
    thoughtIds: new Set(),
    emotions: [],
    emotionIds: new Set(),
    beliefs: new Map(),
    relationships: new Map(),
    memories: new Map(),
    memoryReleases: [],
    memoryReleaseIds: new Set(),
    turningPoints: new Map(),
    goals: new Map(),
    intentions: new Map(),
    expressions: [],
    expressionIds: new Set(),
    actions: [],
    actionIds: new Set(),
    playerInterventions: [],
    interventionsById: new Map(),
    closedTurns: new Map(),
  }
}

/** Decode one persisted payload and retain the schema failure as its cause. */
function parsePersisted<T>(type: CharacterChangeType, schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value)
  } catch (error: unknown) {
    throw new Error(`persisted Actor ${type} payload is invalid`, { cause: error })
  }
}

/** Require this character projection's stable Actor identity and return its current configuration. */
function requireDescriptor(state: ActorFoldState, actorId: ActorId, type: CharacterChangeType): ActorDescriptor {
  const descriptor = state.descriptor
  if (descriptor === undefined) throw new Error(`${type} precedes character.defined`)
  if (descriptor.id !== actorId) throw new Error(`${type} actor "${actorId}" does not match descriptor "${descriptor.id}"`)
  return descriptor
}

/**
 * Apply one contiguous event to an Actor projection.
 * @param state - mutable Actor projection being reconstructed.
 * @param event - next accepted character change in narrative order.
 */
export function applyCharacterChange(state: ActorFoldState, event: CharacterChange): void {
  switch (event.type) {
    case 'knowledge.initialized': {
      const data = parsePersisted(event.type, z.strictObject({ version: z.literal(1), actorId: actorIdSchema,
        state: knowledgeStateSchema }), event.data)
      requireDescriptor(state, data.actorId, event.type)
      if (state.knowledge.initialized) throw new Error('Knowledge is already initialized')
      state.knowledge = data.state
      return
    }
    case 'knowledge.changed': {
      const data = parsePersisted(event.type, z.strictObject({ version: z.literal(1), actorId: actorIdSchema,
        changes: z.array(knowledgeChangeSchema), authority: knowledgeAuthoritySchema }), event.data)
      requireDescriptor(state, data.actorId, event.type)
      state.knowledge = applyKnowledgeChanges(state.knowledge, data.changes, data.authority)
      return
    }
    case 'state.changed': {
      const data = parsePersisted(event.type, z.strictObject({
        version: z.literal(1), actorId: actorIdSchema, actorIds: z.array(nonEmpty),
        origin: z.enum(['actor', 'player', 'author']), changes: z.array(stateChangeSchema),
      }), event.data)
      requireDescriptor(state, data.actorId, event.type)
      if (data.changes.some(change => change.definition !== undefined
        && (change.definition.owner !== 'actor' || change.definition.actorId !== data.actorId))) {
        throw new Error('Private state events cannot contain another owner')
      }
      state.stateActorIds = data.actorIds
      state.dynamicState = applyStateChanges(state.dynamicState, data.changes,
        data.origin === 'actor' ? { kind: 'actor', actorId: data.actorId } : { kind: data.origin }, data.actorIds)
      return
    }
    case 'character.configured': {
      const data = parsePersisted(event.type, z.strictObject({ version: z.literal(1),
        expectedRevision: nonNegativeSafeInteger, actor: actorDescriptorSchema }), event.data)
      requireDescriptor(state, data.actor.id, event.type)
      if (data.expectedRevision !== state.configurationRevision) throw new Error('Stale Actor configuration revision')
      state.descriptor = data.actor
      state.configurationRevision += 1
      return
    }
    case 'character.defined': {
      const { actor } = parsePersisted(event.type, descriptorEventSchema, event.data)
      if (state.descriptor !== undefined) throw new Error('character.defined may appear only once')
      state.descriptor = actor
      return
    }
    case 'thought.recorded': {
      const { thought } = parsePersisted(event.type, thoughtEventSchema, event.data)
      requireDescriptor(state, thought.actorId, event.type)
      if (state.thoughtIds.has(thought.id)) throw new Error(`actor thought "${thought.id}" is duplicated`)
      state.thoughtIds.add(thought.id)
      state.thoughts.push(thought)
      return
    }
    case 'emotion.recorded': {
      const { emotion } = parsePersisted(event.type, emotionEventSchema, event.data)
      requireDescriptor(state, emotion.actorId, event.type)
      if (state.emotionIds.has(emotion.id)) throw new Error(`actor emotion "${emotion.id}" is duplicated`)
      state.emotionIds.add(emotion.id)
      state.emotions.push(emotion)
      return
    }
    case 'belief.revised': {
      const { belief } = parsePersisted(event.type, beliefEventSchema, event.data)
      requireDescriptor(state, belief.actorId, event.type)
      const prior = state.beliefs.get(belief.id)
      if (prior === undefined) {
        if (belief.revision !== 1) throw new Error(`actor belief "${belief.id}" must begin at revision 1`)
      } else {
        if (belief.revision !== prior.revision + 1) throw new Error(`actor belief "${belief.id}" revision is not contiguous`)
        if (belief.proposition !== prior.proposition) throw new Error(`actor belief "${belief.id}" changed its proposition`)
      }
      state.beliefs.set(belief.id, belief)
      return
    }
    case 'relationship.revised': {
      const { relationship } = parsePersisted(event.type, relationshipEventSchema, event.data)
      requireDescriptor(state, relationship.actorId, event.type)
      const prior = state.relationships.get(relationship.id)
      if (prior === undefined) {
        if (relationship.revision !== 1) throw new Error(`actor relationship "${relationship.id}" must begin at revision 1`)
      } else {
        if (relationship.revision !== prior.revision + 1) throw new Error(`actor relationship "${relationship.id}" revision is not contiguous`)
        if (relationship.target !== prior.target || relationship.dimension !== prior.dimension) {
          throw new Error(`actor relationship "${relationship.id}" changed its subject`)
        }
      }
      state.relationships.set(relationship.id, relationship)
      return
    }
    case 'memory.recorded': {
      const { memory } = parsePersisted(event.type, memoryEventSchema, event.data)
      requireDescriptor(state, memory.actorId, event.type)
      if (state.memories.has(memory.id)) throw new Error(`actor memory "${memory.id}" is duplicated`)
      state.memories.set(memory.id, { record: memory, status: 'active' })
      return
    }
    case 'memory.released': {
      const { release } = parsePersisted(event.type, memoryReleaseEventSchema, event.data)
      requireDescriptor(state, release.actorId, event.type)
      if (state.memoryReleaseIds.has(release.id)) throw new Error(`actor memory release "${release.id}" is duplicated`)
      for (const memoryId of release.matchedMemoryIds) {
        const memory = state.memories.get(memoryId)
        if (memory === undefined) throw new Error(`actor memory "${memoryId}" is released before creation`)
        if (memory.status === 'forgotten') throw new Error(`actor memory "${memoryId}" is released twice`)
        memory.status = 'forgotten'
        if (release.reason !== undefined) memory.forgottenReason = release.reason
      }
      state.memoryReleaseIds.add(release.id)
      state.memoryReleases.push(release)
      return
    }
    case 'memory.forgotten': {
      const forgotten = parsePersisted(event.type, forgottenEventSchema, event.data)
      requireDescriptor(state, forgotten.actorId, event.type)
      const memory = state.memories.get(forgotten.memoryId)
      if (memory === undefined) throw new Error(`actor memory "${forgotten.memoryId}" is forgotten before creation`)
      if (memory.status === 'forgotten') throw new Error(`actor memory "${forgotten.memoryId}" is forgotten twice`)
      memory.status = 'forgotten'
      if (forgotten.reason !== undefined) memory.forgottenReason = forgotten.reason
      return
    }
    case 'goal.revised': {
      const { goal } = parsePersisted(event.type, goalEventSchema, event.data)
      requireDescriptor(state, goal.actorId, event.type)
      const prior = state.goals.get(goal.id)
      if (prior === undefined) {
        if (goal.revision !== 1 || goal.status !== 'active') {
          throw new Error(`actor goal "${goal.id}" must begin active at revision 1`)
        }
      } else {
        if (goal.revision !== prior.revision + 1) throw new Error(`actor goal "${goal.id}" revision is not contiguous`)
        if (prior.status !== 'active' || !['active', 'completed', 'abandoned'].includes(goal.status)) {
          throw new Error(`actor goal "${goal.id}" has an invalid ${prior.status} -> ${goal.status} transition`)
        }
        if (goal.description !== prior.description) {
          throw new Error(`actor goal "${goal.id}" changed its description`)
        }
      }
      state.goals.set(goal.id, goal)
      return
    }
    case 'intention.recorded': {
      const { intention } = parsePersisted(event.type, intentionEventSchema, event.data)
      requireDescriptor(state, intention.actorId, event.type)
      if (state.intentions.has(intention.id)) throw new Error(`actor intention "${intention.id}" is duplicated`)
      state.intentions.set(intention.id, intention)
      return
    }
    case 'turning-point.revised': {
      const { turningPoint } = parsePersisted(event.type, turningPointEventSchema, event.data)
      requireDescriptor(state, turningPoint.actorId, event.type)
      const prior = state.turningPoints.get(turningPoint.id)
      if (prior === undefined) {
        if (turningPoint.revision !== 1) throw new Error(`actor turning point "${turningPoint.id}" must begin at revision 1`)
        if (turningPoint.status !== 'tentative' && turningPoint.status !== 'integrated') {
          throw new Error(`actor turning point "${turningPoint.id}" must begin tentative or integrated`)
        }
      } else {
        if (turningPoint.revision !== prior.revision + 1) {
          throw new Error(`actor turning point "${turningPoint.id}" revision is not contiguous`)
        }
        if (turningPoint.createdAt !== prior.createdAt) {
          throw new Error(`actor turning point "${turningPoint.id}" changed its creation time`)
        }
      }
      state.turningPoints.set(turningPoint.id, turningPoint)
      return
    }
    case 'player.intervened': {
      const { intervention } = parsePersisted(event.type, interventionEventSchema, event.data)
      if (state.interventionsById.has(intervention.id)) {
        throw new Error(`player intervention "${intervention.id}" is duplicated`)
      }
      if (intervention.kind === 'embody-speech' || intervention.kind === 'embody-action') {
        requireDescriptor(state, intervention.targetActorId, event.type)
      }
      state.interventionsById.set(intervention.id, intervention)
      state.playerInterventions.push(intervention)
      return
    }
    case 'speech.expressed': {
      const { expression } = parsePersisted(event.type, expressionEventSchema, event.data)
      requireDescriptor(state, expression.actorId, event.type)
      if (state.expressionIds.has(expression.id)) throw new Error(`actor expression "${expression.id}" is duplicated`)
      if (expression.origin === 'player') {
        const intervention = state.interventionsById.get(expression.playerInterventionId)
        if (intervention?.kind !== 'embody-speech' || intervention.targetActorId !== expression.actorId) {
          throw new Error(`player expression "${expression.id}" has no matching embodied-speech intervention`)
        }
        if (intervention.content !== expression.text
          || intervention.delivery !== expression.delivery
          || intervention.audience.join('\u0000') !== expression.audience.join('\u0000')) {
          throw new Error(`player expression "${expression.id}" diverges from its intervention`)
        }
      }
      state.expressionIds.add(expression.id)
      state.expressions.push(expression)
      return
    }
    case 'action.attempted': {
      const { action } = parsePersisted(event.type, actionEventSchema, event.data)
      requireDescriptor(state, action.actorId, event.type)
      if (state.actionIds.has(action.id)) throw new Error(`actor action "${action.id}" is duplicated`)
      if (action.origin === 'player') {
        const intervention = state.interventionsById.get(action.playerInterventionId)
        if (intervention?.kind !== 'embody-action' || intervention.targetActorId !== action.actorId) {
          throw new Error(`player action "${action.id}" has no matching embodied-action intervention`)
        }
        if (intervention.content !== action.description || intervention.target !== action.target) {
          throw new Error(`player action "${action.id}" diverges from its intervention`)
        }
      }
      state.actionIds.add(action.id)
      state.actions.push(action)
      return
    }
    case 'character.turn-closed': {
      const closure = parsePersisted(event.type, turnClosedEventSchema, event.data)
      requireDescriptor(state, closure.actorId, event.type)
      if (state.currentTurn !== closure.turn) {
        throw new Error(`actor turn closure ${closure.turn} does not match open turn ${String(state.currentTurn)}`)
      }
      if (state.closedTurns.has(closure.turn)) throw new Error(`actor turn ${closure.turn} is closed twice`)
      state.closedTurns.set(closure.turn, closure.reason)
      return
    }
    /* v8 ignore next 2 -- CharacterChangeType is closed and every member is handled above. */
    default:
      return
  }
}

/** Present all player-visible private records from a pure character projection. */
export function inspectCharacter(state: ActorFoldState): ActorPrivateView {
  if (state.descriptor === undefined) throw new Error('Character state is missing its descriptor')
  const memories: ActorMemoryView[] = [...state.memories.values()].map(memory => ({
    ...memory.record,
    status: memory.status,
    ...(memory.forgottenReason === undefined ? {} : { forgottenReason: memory.forgottenReason }),
  }))
  return {
    descriptor: state.descriptor,
    knowledge: structuredClone(state.knowledge),
    dynamicState: structuredClone(state.dynamicState),
    thoughts: [...state.thoughts],
    emotions: [...state.emotions],
    beliefs: [...state.beliefs.values()],
    relationships: [...state.relationships.values()],
    memories,
    memoryReleases: [...state.memoryReleases],
    turningPoints: [...state.turningPoints.values()],
    goals: [...state.goals.values()],
    intentions: [...state.intentions.values()],
    expressions: [...state.expressions],
    actions: [...state.actions],
    playerInterventions: [...state.playerInterventions],
  }
}
