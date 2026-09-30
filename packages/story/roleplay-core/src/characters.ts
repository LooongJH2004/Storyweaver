/** Story-local people and observer-local identity references. */
import type { RuntimeValues } from './types.ts'
import { z } from 'zod'
import { storybookActorDefinitionSchema, type StorybookDocument } from './storybook.ts'
import { applyKnowledgeChanges, emptyKnowledge, knowledgeStateSchema, type KnowledgeState, type KnowledgeId,
  type PersonReference } from './knowledge.ts'

const text = z.string().trim().min(1)
/** Persisted person definition; the template is provenance, never shared runtime state. */
export const storyCharacterSchema = z.strictObject({
  definition: storybookActorDefinitionSchema, revision: z.number().int().positive(),
  origin: z.enum(['storybook', 'director', 'player']), templateActorId: text.optional(),
  importance: z.enum(['main', 'supporting']), purpose: text, sourceRefs: z.array(text),
  location: z.string(), archived: z.boolean(), createdAt: z.iso.datetime(),
})
/** One independent person's definition and creation basis. */
export type StoryCharacter = z.infer<typeof storyCharacterSchema>
/** A perceptible identity, which may represent only hearsay or a disguise. */
export const encounterSchema = z.strictObject({
  ref: text.transform(value => value as PersonReference), observerId: text, actorId: text.optional(), appearanceKey: text,
  label: text, sceneId: z.string(), sourceRefs: z.array(text), createdAt: z.iso.datetime(),
})
/** Host-only binding; actorId and appearanceKey never enter Actor prompts. */
export type CharacterEncounter = z.infer<typeof encounterSchema>
/** Recipient-specific evidence; mentioned people need no world identity or Actor session. */
export const perceptionDeliverySchema = z.strictObject({ actorId: text, content: text,
  clues: z.array(z.strictObject({ key: text, label: text })).optional(),
})
/** Director-authored evidence, never a forced subjective judgment. */
export type PerceptionDelivery = z.input<typeof perceptionDeliverySchema>
/** Complete restorable story-local registry and cognition projections. */
export const storyCharactersSchema = z.strictObject({
  initialized: z.boolean(), revision: z.number().int().nonnegative(),
  entries: z.array(storyCharacterSchema), history: z.array(storyCharacterSchema),
  encounters: z.array(encounterSchema), knowledge: z.record(text, knowledgeStateSchema),
  commonKnowledge: z.array(text),
}).superRefine((state, context) => {
  const people = new Set(state.entries.map(item => item.definition.actorId))
  const refs = new Set(state.encounters.map(item => item.ref))
  if (people.size !== state.entries.length || refs.size !== state.encounters.length) context.addIssue({ code: 'custom',
    message: 'Duplicate person or encounter identity' })
  for (const encounter of state.encounters) {
    if ((encounter.observerId !== 'observer' && !people.has(encounter.observerId))
      || (encounter.actorId !== undefined && !people.has(encounter.actorId))) context.addIssue({ code: 'custom',
      message: 'Encounter references an unregistered person' })
  }
  for (const [observer, knowledge] of Object.entries(state.knowledge)) {
    if (observer !== 'observer' && !people.has(observer)) context.addIssue({ code: 'custom',
      message: 'Knowledge owner is not registered' })
    const owned = new Set(state.encounters.filter(item => item.observerId === observer).map(item => item.ref))
    if ([...knowledge.entries, ...knowledge.history].some(item => item.entityRefs.some(ref => !owned.has(ref)))) context.addIssue({ code: 'custom', message: 'Knowledge references another perspective' })
  }
})
/** Current people, author seeds, and commit-derived private projections. */
export type StoryCharacters = z.infer<typeof storyCharactersSchema>

/**
 * Create the pre-initialization registry baseline.
 * @returns an empty, explicitly uninitialized story cast.
 */
export function emptyStoryCharacters(): StoryCharacters {
  return { initialized: false, revision: 0, entries: [], history: [], encounters: [], knowledge: {}, commonKnowledge: [] }
}

/**
 * Instantiate authored people once. Identity knowledge is explicit and does not follow roster membership.
 * @param state - Existing story-local registry.
 * @param book - Authored starting definitions.
 * @returns initialized registry; an initialized empty cast stays empty.
 */
export function initializeStoryCharacters(state: StoryCharacters, book: StorybookDocument, values: RuntimeValues): StoryCharacters {
  if (state.initialized) return state
  let next = { ...state, initialized: true, commonKnowledge: [...book.commonKnowledge] }
  for (const definition of book.characters) {
    const entry: StoryCharacter = { definition: structuredClone(definition), revision: 1,
      origin: 'storybook', templateActorId: definition.actorId,
      importance: definition.actorId === book.protagonistActorId ? 'main' : 'supporting',
      purpose: 'Authored starting character', sourceRefs: ['storybook'], location: '', archived: false,
      createdAt: values.now() }
    next = { ...next, entries: [...next.entries, entry], history: [...next.history, entry] }
  }
  for (const entry of next.entries) next = seedCharacterKnowledge(next, entry, values)
  return { ...next, revision: 1 }
}

/**
 * Seed personal knowledge for a new person without inheriting historical public events.
 * @param state - Registry including the person.
 * @param person - Newly created definition.
 * @returns registry with explicit author-only initial evidence.
 */
export function seedCharacterKnowledge(state: StoryCharacters, person: StoryCharacter, values: RuntimeValues): StoryCharacters {
  const observerId = person.definition.actorId
  const encounters = [...state.encounters]
  const initial = [...person.definition.initialKnowledge,
    ...person.definition.privateContext.perspective.map(text => ({ text, kind: 'belief' as const, attitude: 'believed' as const, targetActorId: undefined, label: undefined }))]
  const changes = initial.map((item) => {
    let encounter = encounters.find(value => value.observerId === observerId && value.actorId === item.targetActorId && value.appearanceKey === 'ordinary')
    if ((item.targetActorId !== undefined || item.kind === 'identity') && encounter === undefined) {
      encounter = { ref: `person-${values.id()}` as PersonReference, observerId, ...(item.targetActorId === undefined ? {} : { actorId: item.targetActorId }),
        appearanceKey: 'ordinary', label: item.label ?? '未具名的人物', sceneId: '', sourceRefs: ['storybook'], createdAt: person.createdAt }
      encounters.push(encounter)
    }
    return { id: `judgment-${values.id()}` as KnowledgeId, expectedRevision: 0, text: item.text,
      kind: item.kind, attitude: item.attitude, acquisition: 'authored' as const,
      entityRefs: encounter === undefined ? [] : [encounter.ref], sourceRefs: ['storybook'],
      status: 'active' as const, reason: 'Authored initial knowledge', replaces: [],
      ...(item.label === undefined ? {} : { label: item.label }) }
  })
  const knowledge = applyKnowledgeChanges(emptyKnowledge(), changes, { origin: 'author', sourceRefs: [],
    entityRefs: encounters.filter(item => item.observerId === observerId).map(item => item.ref) })
  return { ...state, encounters, knowledge: { ...state.knowledge, [observerId]: knowledge } }
}

/**
 * Assign perception references for a physical scene. A new disguise gets a different reference.
 * @param state - Story cast.
 * @param sceneId - Current physical scene.
 * @param presentIds - People physically present.
 * @param appearances - Optional changed visible appearances; keys are world identities.
 * @returns registry with preserved previous identity lines and newly encountered appearances.
 */
export function frameStoryCharacters(state: StoryCharacters, sceneId: string, presentIds: readonly string[],
  appearances: readonly { actorId: string; key: string; label: string }[], values: RuntimeValues): StoryCharacters {
  const encounters = state.encounters.map(item => ({ ...item, sceneId: '' }))
  for (const observerId of ['observer', ...presentIds]) {
    for (const actorId of presentIds) {
      if (observerId === actorId) continue
      const person = state.entries.find(entry => entry.definition.actorId === actorId)
      if (person === undefined) {
        if (state.initialized) throw new Error('Scene references an unregistered person')
        continue
      }
      const appearance = appearances.find(item => item.actorId === actorId)
      const appearanceKey = appearance?.key ?? 'ordinary'
      const previous = encounters.find(item => item.observerId === observerId
        && item.actorId === actorId && item.appearanceKey === appearanceKey)
      const label = appearance?.label ?? person.definition.appearance
      if (previous === undefined) encounters.push({ ref: `person-${values.id()}` as PersonReference, observerId, actorId,
        appearanceKey, label, sceneId, sourceRefs: [], createdAt: values.now() })
      else encounters.splice(encounters.indexOf(previous), 1, { ...previous, sceneId })
    }
  }
  return { ...state, revision: state.revision + 1, encounters }
}

/**
 * Resolve a person's visible label using only the selected observer's active judgments.
 * @param encounter - Visible identity clue.
 * @param knowledge - Observer's own judgments.
 * @returns known or self-claimed label, otherwise the perceptible description.
 */
export function encounterLabel(encounter: CharacterEncounter, knowledge: KnowledgeState): string {
  const belief = knowledge.entries.findLast(item => item.kind === 'identity' && item.entityRefs.includes(encounter.ref)
    && item.status === 'active' && item.attitude === 'believed')
  return belief?.label ?? encounter.label
}

/**
 * Return current routable people without exposing canonical identities or appearance correlations.
 * @param state - Host registry.
 * @param observerId - Actor identity or explicit spectator.
 * @param sceneId - Current scene.
 * @param presentIds - Current physical cast.
 * @returns model-safe references and labels; unrelated people are absent.
 */
export function visibleCharacters(
  state: StoryCharacters, observerId: string, sceneId: string, presentIds: readonly string[],
): { ref: PersonReference; label: string }[] {
  const selected = new Map<string, CharacterEncounter>()
  for (const encounter of state.encounters) {
    if (encounter.observerId === observerId && encounter.sceneId === sceneId && encounter.actorId !== undefined
      && presentIds.includes(encounter.actorId)) selected.set(encounter.actorId, encounter)
  }
  return [...selected.values()].map(encounter => ({ ref: encounter.ref,
    label: encounterLabel(encounter, state.knowledge[observerId] ?? emptyKnowledge()) }))
}

/**
 * Resolve an observer reference at the authority boundary without matching names.
 * @param state - Host registry.
 * @param observerId - Authenticated observer.
 * @param ref - Model-supplied person reference.
 * @returns canonical target; unknown or hearsay-only people cannot be routed.
 */
export function resolvePersonReference(state: StoryCharacters, observerId: string, ref: string): string {
  if (ref === 'self') return observerId
  const encounter = state.encounters.find(item => item.observerId === observerId && item.ref === ref)
  if (encounter?.actorId === undefined) throw new Error('Person reference is unavailable in your perspective')
  return encounter.actorId
}

/**
 * Project structural identity fields while leaving spoken and authored prose untouched.
 * @param value - Structured context or tool payload.
 * @param state - Host cast.
 * @param observerId - Authenticated Actor.
 * @returns detached payload with opaque observer references; unknown identities are hidden.
 */
export function projectIdentityReferences(value: unknown, state: StoryCharacters, observerId: string,
  stateFieldReference: (id: string) => string): unknown {
  const refs = new Map<string, string>()
  for (const item of state.encounters) if (item.observerId === observerId && item.actorId !== undefined
    && (!refs.has(item.actorId) || item.sceneId !== '')) refs.set(item.actorId, item.ref)
  refs.set(observerId, 'self')
  const ids = new Set(state.entries.map(item => item.definition.actorId))
  const identityKeys = new Set(['actorId', 'targetActorId', 'observerId', 'speakerId', 'nextSpeakerId', 'sourceActorId',
    'target', 'participants', 'present', 'audience', 'targets', 'actorIds'])
  const visit = (item: unknown, identity = false): unknown => {
    if (typeof item === 'string') return identity && ids.has(item) ? refs.get(item) ?? 'unidentified' : item
    if (Array.isArray(item)) return item.map(child => visit(child, identity))
    if (item !== null && typeof item === 'object') {
      const record = item as Record<string, unknown>
      const field = typeof record.owner === 'string' && typeof record.type === 'string' && typeof record.id === 'string'
      return Object.fromEntries(Object.entries(record).map(([key, child]) => [ids.has(key) ? refs.get(key) ?? 'unidentified' : key,
        field && key === 'id' ? stateFieldReference(String(child))
          : key === 'fieldId' && typeof child === 'string' ? stateFieldReference(child)
            : key === 'targetActorId' && typeof record.targetPersonRef === 'string' ? record.targetPersonRef : visit(child,
              identityKeys.has(key))]))
    }
    return item
  }
  return visit(value)
}

/**
 * Freeze speaker references at delivery for historical projections.
 * @param state - Registry at delivery.
 * @param actorId - Actual speaker.
 * @returns immutable observer-local speaker references.
 */
export function historicalPersonReferences(state: StoryCharacters, actorId: string): Record<string, string> {
  const refs: Record<string, string> = { [actorId]: 'self' }
  for (const item of state.encounters) if (item.actorId === actorId && item.sceneId !== '') refs[item.observerId] = item.ref
  return refs
}

/**
 * Capture labels at an event's publication point, before later recognition can change them.
 * @param state - Registry including the current encounters and personal judgments.
 * @param actorId - Event's actual speaker.
 * @returns observer-specific historical labels without changing the event's prose.
 */
export function historicalCharacterLabels(state: StoryCharacters, actorId: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const encounter of state.encounters) {
    if (encounter.actorId === actorId && encounter.sceneId !== '') result[encounter.observerId]
      = encounterLabel(encounter, state.knowledge[encounter.observerId] ?? emptyKnowledge())
  }
  return result
}

/**
 * Render explicit narrative person mentions; exact speech is never passed through this function.
 * @param content - Narration containing [[person:actorId]] mentions.
 * @param state - Host cast.
 * @param observerId - Actor or spectator whose labels apply.
 * @returns perspective-specific prose; unresolved mentions remain anonymous.
 */
export function renderPerspectiveText(content: string, state: StoryCharacters, observerId: string): string {
  return content.replace(/\[\[person:([^\]]+)\]\]/gu, (_whole: string, actorId: string) => {
    if (actorId === observerId) return '你'
    const encounter = state.encounters.findLast(item => item.actorId === actorId && item.observerId === observerId && item.sceneId !== '')
    return encounter === undefined ? '未具名的人物' : encounterLabel(encounter, state.knowledge[observerId] ?? emptyKnowledge())
  })
}
