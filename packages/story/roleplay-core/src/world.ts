import { legacyContextRecipe } from './context-recipe.ts'
import { emptyDirectorOutline } from './outline-rules.ts'
import { emptyStoryDiscussions, storyDiscussionStateSchema } from './discussion-rules.ts'
/** Instance-owned people, evidence, and private cognition, independent of execution protocols. */
import { z } from 'zod'
import { storyCharacterSchema, encounterSchema, emptyStoryCharacters, initializeStoryCharacters,
  type StoryCharacters } from './characters.ts'
import { dynamicStateSchema, initializeDynamicState } from './dynamic-state.ts'
import { knowledgeStateSchema, emptyKnowledge } from './knowledge.ts'
import { parseStorybookDocument, type StorybookActorDefinition } from './storybook.ts'
import { ActorId, ActorMemoryId, ActorGoalId, ActorIntentionId } from './actor-model.ts'
import { applyCharacterChange, characterLifecycleChangeSchema, emptyActorFoldState, type CharacterLifecycleChange } from './actor-state.ts'
import { canonical, entity, RoleplayError } from './records.ts'
import type { Json, NarrativeEvent, NarrativeSnapshot, RuntimeValues, TemplateVersion } from './types.ts'

const text = z.string().trim().min(1)
/** Fixed technical lookup boundary for one participant's private discussion preparation. */
export const preparationRecordSchema = z.strictObject({ discussionId: text, actorId: text, attempt: text,
  revision: z.number().int().nonnegative() })
/** An objective settlement keeps its own identity and publication revision. */
export const factSchema = z.strictObject({ id: text, summary: text, content: text, revision: z.number().int().positive(),
  settles: z.array(text).optional() })
/** Model targets remain observer references until this command's host authorization. */
export const behaviorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('speech'), text, to: z.array(text), delivery: z.enum(['spoken', 'whispered', 'written']),
    tone: text.optional(), intent: text.optional() }),
  z.strictObject({ kind: z.literal('action'), attempt: text, target: text.optional(), purpose: text.optional(), manner: text.optional(),
    visibility: z.enum(['public', 'concealed']).optional(), awaitResult: z.boolean().optional() }),
])
/** Accepted behavior freezes every receiving audience's identity projection. */
export const publishedBehaviorSchema = z.strictObject({ id: text, actorId: text, origin: z.enum(['actor', 'player']), order: z.number().int().nonnegative(),
  behavior: behaviorSchema,
  targets: z.array(text), audience: z.array(text), labels: z.record(text, z.string()), references: z.record(text, text),
  sceneId: z.string(), revision: z.number().int().positive() })
/** Narration is explicitly published; objective facts alone do not become spectator knowledge. */
export const narrationSchema = z.strictObject({ id: text, revision: z.number().int().positive(), texts: z.record(text, text) })
/** Player instructions are interface history, never character evidence or settled world facts. */
export const playerDirectionSchema = z.strictObject({ id: text, revision: z.number().int().positive(), text: z.string() })
/** Names describe only what this recipient knew when the event was delivered. */
const perceivedPersonSchema = z.strictObject({ ref: text, label: text })
/** Public behavior details freeze names and targets in the recipient's perspective at delivery. */
export const perceivedBehaviorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('speech'), speaker: perceivedPersonSchema, delivery: z.enum(['spoken', 'whispered', 'written']),
    addressedTo: z.array(perceivedPersonSchema).optional() }),
  z.strictObject({ kind: z.literal('action'), actor: perceivedPersonSchema, target: perceivedPersonSchema.optional() }),
])
/** Optional behavior details distinguish existing text-only deliveries from fully attributed events. */
export const evidenceSchema = z.strictObject({
  id: text, recipient: text, content: text, kind: z.enum(['observation', 'claim', 'report']),
  sourceRefs: z.array(text), personRefs: z.array(text), revision: z.number().int().positive(),
  behavior: perceivedBehaviorSchema.optional(),
  order: z.number().int().nonnegative().optional(),
  respondsTo: z.array(text).optional(),
})
/** Audience-specific evidence, retained even after its source leaves the current scene. */
export type Evidence = z.infer<typeof evidenceSchema>
/** Physical attendance is separate from importance, response scheduling, and Actor sessions. */
export const sceneSchema = z.strictObject({ id: z.string(), location: z.string(), present: z.array(text) })
/** Current execution fence, created by the host before invoking a model. */
export const executionSchema = z.strictObject({
  actorId: text, attempt: text, epoch: z.number().int().nonnegative(),
  status: z.enum(['running', 'committed', 'cancelled', 'failed']),
  consolidationSources: z.array(text).min(1).optional(),
})

/** Serialize a domain value without silently discarding unsupported content. */
export function json(value: unknown): Json { return JSON.parse(canonical(value)) as Json }
/** Build an explicit entity event; shared by command handlers and initialization. */
export function replace(collection: string, id: string, value: unknown): NarrativeEvent {
  return { type: 'entity.replaced', key: { collection, id }, value: json(value) }
}
/** Read one person's private state; no template fallback is permitted. */
export function knowledgeOf(snapshot: NarrativeSnapshot, actorId: string) {
  const value = entity(snapshot, { collection: 'knowledge', id: actorId })
  return value === undefined ? emptyKnowledge() : knowledgeStateSchema.parse(value)
}
/** Reconstruct domain records for pure identity rules, without Session data. */
export function castOf(snapshot: NarrativeSnapshot): StoryCharacters {
  const cast = emptyStoryCharacters()
  cast.initialized = true
  cast.revision = snapshot.instance.revision
  for (const item of snapshot.entities) {
    if (item.key.collection === 'people') cast.entries.push(storyCharacterSchema.parse(item.value))
    if (item.key.collection === 'encounters') cast.encounters.push(encounterSchema.parse(item.value))
    if (item.key.collection === 'knowledge') cast.knowledge[item.key.id] = knowledgeStateSchema.parse(item.value)
  }
  cast.commonKnowledge = z.array(text).parse(entity(snapshot, { collection: 'setting', id: 'commonKnowledge' }) ?? [])
  return cast
}
/** Resolve a registered person solely within the command's instance. */
export function personOf(snapshot: NarrativeSnapshot, actorId: string) {
  const value = entity(snapshot, { collection: 'people', id: actorId })
  if (value === undefined) throw new RoleplayError('not-found', 'Person is unavailable in this story')
  return storyCharacterSchema.parse(value)
}
/** Current dynamic fields for exactly one authority scope. */
export function stateOf(snapshot: NarrativeSnapshot, owner: string) {
  return dynamicStateSchema.parse(entity(snapshot, { collection: 'state', id: owner }))
}
/** Scene changes never derive attendance from a book's roster. */
export function sceneOf(snapshot: NarrativeSnapshot) {
  return sceneSchema.parse(entity(snapshot, { collection: 'scene', id: 'current' }))
}
/** Filter ownership before making any evidence available to retrieval or validation. */
export function evidenceFor(snapshot: NarrativeSnapshot, actorId: string): Evidence[] {
  return snapshot.entities.filter(item => item.key.collection === `evidence:${actorId}`)
    .map(item => evidenceSchema.parse(item.value))
}
/** Accepted private lifecycle changes retain narrative ordering and stable record references. */
export const lifecycleRecordSchema = z.strictObject({ revision: z.number().int().nonnegative(),
  index: z.number().int().nonnegative(), change: characterLifecycleChangeSchema })
/** Retrieve only one owner's lifecycle history, including explicit memory release. */
export function lifecycleRecordsFor(snapshot: NarrativeSnapshot, actorId: string) {
  return snapshot.entities.filter(item => item.key.collection === `lifecycle:${actorId}`).map(item => lifecycleRecordSchema.parse(item.value))
    .sort((a, b) => a.revision - b.revision || a.index - b.index)
}
/** A record revision remains addressable after forgetting, compression, or further edits. */
export function lifecycleSourceRef(change: CharacterLifecycleChange): string {
  switch (change.type) {
    case 'thought.recorded': return `thought:${change.data.thought.id}`
    case 'memory.recorded': return `memory:${change.data.memory.id}`
    case 'memory.released': return `memory-release:${change.data.release.id}`
    case 'memory.forgotten': return `memory:${change.data.memoryId}`
    case 'goal.revised': return `goal:${change.data.goal.id}:r${change.data.goal.revision}`
    case 'intention.recorded': return `intention:${change.data.intention.id}`
    case 'turning-point.revised': return `turning-point:${change.data.turningPoint.id}:r${change.data.turningPoint.revision}`
  }
}
/** Reconstruct memories, goals, intentions, and journey with the same rules as the Actor adapter. */
export function lifecycleFor(snapshot: NarrativeSnapshot, actorId: string) {
  const definition = personOf(snapshot, actorId).definition
  const state = emptyActorFoldState()
  applyCharacterChange(state, { type: 'character.defined', data: { version: 1, actor: { id: ActorId(actorId),
    displayName: definition.displayName, persona: definition.publicPersona, capabilities: definition.capabilities } } })
  for (const item of lifecycleRecordsFor(snapshot, actorId)) applyCharacterChange(state, item.change)
  return state
}
/** Instantiate selected author lifecycle settings once, with no execution dependency. */
export function seedCharacterLifecycle(definition: StorybookActorDefinition, values: RuntimeValues): CharacterLifecycleChange[] {
  const actorId = ActorId(definition.actorId)
  return [
    ...definition.privateContext.coreMemories.map(item => ({ type: 'memory.recorded' as const, data: { version: 1 as const, memory: {
      id: ActorMemoryId(values.id()), actorId, content: item.content, importance: item.importance, tags: [], sourceRefs: ['storybook'],
      ...(item.meaning === undefined ? {} : { meaning: item.meaning }),
    } } })),
    ...definition.privateContext.goals.map(item => ({ type: 'goal.revised' as const, data: { version: 1 as const, goal: {
      id: ActorGoalId(values.id()), actorId, description: item.description, priority: item.priority, revision: 1, status: 'active' as const,
      ...(item.reason === undefined ? {} : { reason: item.reason }),
    } } })),
    ...definition.privateContext.intentions.map(item => ({ type: 'intention.recorded' as const, data: { version: 1 as const, intention: {
      id: ActorIntentionId(values.id()), actorId, description: item.description, commitment: item.commitment, status: 'scheduled' as const,
      trigger: { kind: 'condition' as const, condition: item.trigger },
    } } })),
  ]
}
/** Instantiate the pinned book once; new characters never inherit old evidence deliveries. */
export function initializeWorld(version: TemplateVersion, values: RuntimeValues): NarrativeSnapshot['entities'] {
  const book = parseStorybookDocument(version.document)
  const cast = initializeStoryCharacters(emptyStoryCharacters(), book, values)
  const ids = cast.entries.map(person => person.definition.actorId)
  const entries: { key: { collection: string; id: string }; value: Json }[] = []
  const add = (collection: string, id: string, value: unknown): void => { entries.push({ key: { collection, id }, value: json(value) }) }
  add('context-recipe', 'current', book.contextRecipe === undefined ? legacyContextRecipe() : { ...book.contextRecipe, revision: 0 })
  add('planning', 'current', emptyDirectorOutline(values))
  add('setting', 'book', book)
  add('setting', 'overrides', {})
  add('setting', 'commonKnowledge', book.commonKnowledge)
  add('scene', 'current', { id: '', location: '', present: [] })
  add('style', 'current', { profiles: {} })
  add('configuration', 'revision', 0)
  add('discussions', 'current', emptyStoryDiscussions())
  add('state', 'world', initializeDynamicState(book.characters.flatMap(person => person.state).filter(item => item.definition.owner === 'world'), ids))
  for (const person of cast.entries) {
    const actorId = person.definition.actorId
    add('people', actorId, person)
    add('knowledge', actorId, cast.knowledge[actorId])
    add('state', actorId, initializeDynamicState(person.definition.state.filter(item => item.definition.owner === 'actor'), ids))
    for (const [index, change] of seedCharacterLifecycle(person.definition, values).entries()) {
      add(`lifecycle:${actorId}`, `0:${index}`, { revision: 0, index, change })
    }
  }
  for (const encounter of cast.encounters) add('encounters', encounter.ref, encounter)
  return entries
}

/** Read durable floor ownership independently from execution attempts. */
export function discussionsOf(snapshot: NarrativeSnapshot) {
  return storyDiscussionStateSchema.parse(entity(snapshot, { collection: 'discussions', id: 'current' }))
}

/** Current control state is distinct from a character's posture or technical Session phase. */
export const discussionRunSchema = z.strictObject({ id: z.string(), epoch: z.number().int().nonnegative(),
  status: z.enum(['running', 'waiting-player', 'awaiting-director', 'yielded', 'completed', 'paused', 'failed']),
  completedTurns: z.number().int().nonnegative(), failure: z.string().optional() })

/** A director's response plan and execution fence belong to its story instance. */
export const directorRunSchema = z.strictObject({ id: z.string().min(1), epoch: z.number().int().nonnegative(),
  consolidationSources: z.array(z.string().min(1)).min(1).optional(),
  status: z.enum(['preparing', 'dispatching', 'completed', 'paused', 'failed']), actors: z.array(z.string().min(1)),
  advanceDiscussion: z.boolean(), completedActors: z.number().int().nonnegative(), failure: z.string().optional() })

/** Invalidate old model attempts in the same transaction as pause, restoration or player intervention. */
export function invalidateExecutions(snapshot: NarrativeSnapshot, reason: string): NarrativeEvent[] {
  const director = entity(snapshot, { collection: 'run', id: 'director' })
  const discussion = entity(snapshot, { collection: 'run', id: 'discussion' })
  return [{ type: 'execution.invalidated', reason },
    ...(director === undefined ? [] : [replace('run', 'director', { ...directorRunSchema.parse(director), status: 'paused' })]),
    ...(discussion === undefined ? [] : [replace('run', 'discussion', { ...discussionRunSchema.parse(discussion), status: 'paused' })]),
    ...snapshot.entities.filter(item => item.key.collection === 'execution')
      .map(item => replace('execution', item.key.id, { ...executionSchema.parse(item.value), status: 'cancelled' })),
  ]
}
