/** Shared definitions, validation, and revisioned changes for fictional state. */
import { z } from 'zod'
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity of an authored or generated state field. */
export type StateFieldId = Branded<'StateFieldId'>
const text = z.string().trim().min(1)
const fieldId = text.transform(value => value as StateFieldId)

/** Values supported by the state editor and the model submission tools. */
export const stateValueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(text)])
/** Persistable state value, independent of its display control. */
export type StateValue = z.infer<typeof stateValueSchema>

/** Author-owned field semantics shared by tools, context, and forms. */
export const stateDefinitionSchema = z.strictObject({
  id: fieldId,
  name: text,
  description: text,
  group: text,
  type: z.enum(['text', 'number', 'boolean', 'choice', 'tags']),
  owner: z.enum(['actor', 'world']),
  actorId: text,
  targetActorId: text.optional(),
  targetPersonRef: text.optional(),
  audience: z.array(text).default([]),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  options: z.array(text).optional(),
  guidance: z.string(),
}).superRefine((value, ctx) => {
  if (new Set(value.audience).size !== value.audience.length || value.owner === 'actor' && value.audience.length > 0) {
    ctx.addIssue({ code: 'custom', message: 'Only world fields declare an audience; subjective state is private to its owner' })
  }
  if (value.minimum !== undefined && value.maximum !== undefined && value.minimum > value.maximum) {
    ctx.addIssue({ code: 'custom', message: 'minimum exceeds maximum' })
  }
  if (value.type !== 'number' && (value.minimum !== undefined || value.maximum !== undefined)) {
    ctx.addIssue({ code: 'custom', message: 'only number fields have numeric bounds' })
  }
  if (value.type === 'choice' && (value.options?.length ?? 0) === 0) {
    ctx.addIssue({ code: 'custom', message: 'choice fields require options' })
  }
  if (value.options !== undefined && (value.type !== 'choice' && value.type !== 'tags'
    || new Set(value.options).size !== value.options.length)) {
    ctx.addIssue({ code: 'custom', message: 'options must be unique and belong to choice or tags fields' })
  }
})
/** Complete definition of one state field. */
export type StateDefinition = z.infer<typeof stateDefinitionSchema>

/** One revision of a field, including tombstones and its human-readable cause. */
export const stateEntrySchema = z.strictObject({
  definition: stateDefinitionSchema,
  revision: z.number().int().positive(),
  value: stateValueSchema,
  active: z.boolean(),
  reason: text,
  sourceRefs: z.array(text),
  origin: z.enum(['author', 'actor', 'director', 'player']),
}).superRefine((entry, ctx) => {
  try { validateStateValue(entry.definition, entry.value) }
  catch (error) { ctx.addIssue({ code: 'custom', message: error instanceof Error ? error.message : String(error) }) }
})
/** Revisioned current value displayed to the player. */
export type StateEntry = z.infer<typeof stateEntrySchema>

/** Exact-revision mutation; definitions are supplied only for creation or player editing. */
export const stateChangeSchema = z.strictObject({
  fieldId,
  expectedRevision: z.number().int().nonnegative(),
  definition: stateDefinitionSchema.optional(),
  value: stateValueSchema.optional(),
  active: z.boolean().optional(),
  reason: text,
  sourceRefs: z.array(text),
})
/** State mutation accepted by the host. */
export type StateChange = z.infer<typeof stateChangeSchema>

/** Initial authored value; it is consumed once when an independent story starts. */
export const stateInitialValueSchema = z.strictObject({ definition: stateDefinitionSchema, value: stateValueSchema })
/** Initial authored state field and value. */
export type StateInitialValue = z.infer<typeof stateInitialValueSchema>

/** JSON tool vocabulary, shared by Director and Actor consumers. */
export const stateChangesToolParameter = {
  type: 'array', description: 'Only material state changes. Reuse existing fieldId and exact revision. For a new field use revision 0 and supply its definition and initial value. Never redefine an existing field.',
  items: { type: 'object', additionalProperties: false, properties: {
    fieldId: { type: 'string', required: true }, expectedRevision: { type: 'integer', required: true },
    reason: { type: 'string', required: true },
    sourceRefs: { type: 'array', required: true,
      description: 'Copy exact id values from RECEIVED EVIDENCE or sourceRef values from personal records. Discussion recap IDs, participant IDs and discussion IDs are not evidence sources. Use [] when this subjective change has no cited source.', items: { type: 'string' } },
    active: { type: 'boolean' },
    value: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'array', items: { type: 'string' } }] },
    definition: { type: 'object', description: 'New fields only (expectedRevision=0). Omit this entire object for an existing field; do not copy its displayed definition. The new definition uses id, not fieldId, and id must equal the outer fieldId.', additionalProperties: false, properties: {
      id: { type: 'string', required: true, description: 'Same value as the outer fieldId. This key is named id.' }, name: { type: 'string', required: true },
      description: { type: 'string', required: true }, group: { type: 'string', required: true },
      type: { type: 'string', required: true, enum: ['text', 'number', 'boolean', 'choice', 'tags'] },
      owner: { type: 'string', required: true, enum: ['actor', 'world'] },
      actorId: { type: 'string', required: true }, targetActorId: { type: 'string' },
      audience: { type: 'array', description: 'World fields only: characters allowed to perceive this fact. Subjective fields must use an empty list.', items: { type: 'string' } },
      minimum: { type: 'number' }, maximum: { type: 'number' },
      options: { type: 'array', items: { type: 'string' } }, guidance: { type: 'string', required: true },
    } },
  } },
} as const

/** Current state and append-only field revision history. */
export const dynamicStateSchema = z.strictObject({
  version: z.literal(1),
  entries: z.array(stateEntrySchema),
  history: z.array(stateEntrySchema),
}).superRefine((state, ctx) => {
  const latest = new Map<string, StateEntry>()
  for (const entry of state.history) {
    if (entry.revision !== (latest.get(entry.definition.id)?.revision ?? 0) + 1) ctx.addIssue({ code: 'custom',
      message: 'State history revisions must be consecutive' })
    latest.set(entry.definition.id, entry)
  }
  if (state.entries.length !== latest.size || new Set(state.entries.map(entry => entry.definition.id)).size !== state.entries.length) {
    ctx.addIssue({ code: 'custom', message: 'State current entries must match history fields' })
  }
  for (const entry of state.entries) if (JSON.stringify(entry) !== JSON.stringify(latest.get(entry.definition.id))) {
    ctx.addIssue({ code: 'custom', message: 'Current state must match the latest retained revision' })
  }
})
/** Current state and retained revision history. */
export type DynamicState = z.infer<typeof dynamicStateSchema>

/**
 * Create an empty explicitly initialized state store.
 * @returns an independent empty store.
 */
export function emptyDynamicState(): DynamicState { return { version: 1, entries: [], history: [] } }

/**
 * Instantiate author definitions without sharing mutable state with a template.
 * @param initial - initial definitions and values.
 * @param actorIds - complete story cast.
 * @returns a validated independent store.
 */
export function initializeDynamicState(initial: readonly StateInitialValue[], actorIds: readonly string[]): DynamicState {
  return applyStateChanges(emptyDynamicState(), initial.map(item => ({
    fieldId: item.definition.id, expectedRevision: 0, definition: item.definition, value: item.value,
    reason: item.definition.description, sourceRefs: ['storybook'],
  })), { kind: 'author' }, actorIds)
}

/**
 * Validate a complete value against its author-owned definition.
 * @param definition - field type and optional bounds.
 * @param value - candidate value from a model, player, or durable record.
 */
export function validateStateValue(definition: StateDefinition, value: StateValue): void {
  const valid = definition.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
    && (definition.minimum === undefined || value >= definition.minimum)
    && (definition.maximum === undefined || value <= definition.maximum)
    : definition.type === 'boolean' ? typeof value === 'boolean'
      : definition.type === 'tags' ? Array.isArray(value) && new Set(value).size === value.length
        && (definition.options === undefined || value.every(item => definition.options?.includes(item)))
        : typeof value === 'string' && (definition.type !== 'choice' || definition.options?.includes(value) === true)
  if (!valid) throw new Error(`Invalid value for '${definition.name}' (${definition.id}); expected ${definition.type} within its configured bounds/options`)
}

/** Actor writes are private; Director writes concern world state; trusted player edits may change definitions. */
export type StateAuthority = { kind: 'actor'; actorId: string } | { kind: 'director' | 'player' | 'author' }

/**
 * Prepare an entire batch without mutating the supplied store.
 * @param current - authoritative current projection.
 * @param changes - complete batch, validated before publication.
 * @param authority - server-derived writer identity, never model-supplied.
 * @param actorIds - actual story cast used to validate subject references.
 * @returns the committed projection; an error leaves current untouched.
 */
export function applyStateChanges(current: DynamicState, changes: readonly StateChange[],
  authority: StateAuthority, actorIds: readonly string[]): DynamicState {
  const entries = new Map(current.entries.map(entry => [entry.definition.id, entry]))
  const history = [...current.history]
  const touched = new Set<StateFieldId>()
  for (const input of changes) {
    const change = stateChangeSchema.parse(input)
    if (touched.has(change.fieldId)) throw new Error(`Duplicate change for ${change.fieldId}`)
    touched.add(change.fieldId)
    const previous = entries.get(change.fieldId)
    if ((previous?.revision ?? 0) !== change.expectedRevision) throw new Error(`Stale state revision for ${change.fieldId}`)
    const definition = change.definition ?? previous?.definition
    if (definition === undefined || definition.id !== change.fieldId) throw new Error('New fields require a matching definition')
    if (definition.audience.some(id => !actorIds.includes(id)) || !actorIds.includes(definition.actorId)
      || definition.targetActorId !== undefined && !actorIds.includes(definition.targetActorId)) {
      throw new Error('State references an unknown character')
    }
    if (authority.kind === 'actor' && (definition.owner !== 'actor' || definition.actorId !== authority.actorId
      || previous !== undefined && (previous.definition.owner !== 'actor' || previous.definition.actorId !== authority.actorId))) {
      throw new Error('Actors may only change their own subjective state')
    }
    if (authority.kind === 'director' && (definition.owner !== 'world' || previous !== undefined && previous.definition.owner !== 'world')) {
      throw new Error('Directors may only change world-owned state')
    }
    if (previous !== undefined && (definition.owner !== previous.definition.owner || definition.actorId !== previous.definition.actorId)) {
      throw new Error('State ownership cannot change; create a new field in the intended scope')
    }
    if (previous !== undefined && change.definition !== undefined
      && authority.kind !== 'player' && authority.kind !== 'author') {
      throw new Error('Models cannot redefine existing state fields; reuse the field id')
    }
    if (previous !== undefined && change.definition !== undefined) {
      validateStateValue(definition, previous.value)
    }
    if ([...entries.values()].some(entry => entry.definition.id !== definition.id
      && entry.definition.owner === definition.owner && entry.definition.actorId === definition.actorId
      && entry.definition.targetActorId === definition.targetActorId
      && entry.definition.name.normalize('NFKC').toLocaleLowerCase() === definition.name.normalize('NFKC').toLocaleLowerCase())) {
      throw new Error(`A field named '${definition.name}' already exists in this scope; reuse its id`)
    }
    const value = change.value ?? previous?.value
    if (value === undefined) throw new Error('New state fields require a value')
    validateStateValue(definition, value)
    const entry: StateEntry = {
      definition, revision: change.expectedRevision + 1, value,
      active: change.active ?? previous?.active ?? true, reason: change.reason,
      sourceRefs: change.sourceRefs, origin: authority.kind,
    }
    entries.set(change.fieldId, entry)
    history.push(entry)
  }
  return { version: 1, entries: [...entries.values()], history }
}

/**
 * Render current state without reintroducing deleted or initial values.
 * @param state - authoritative current state.
 * @returns model-readable values with the ids and constraints needed for changes.
 */
export function renderDynamicState(state: DynamicState): string {
  return state.entries.filter(entry => entry.active).map(({ definition: field, revision, value, reason }) =>
    `${field.group} / ${field.name}: ${Array.isArray(value) ? value.join('、') : String(value)}\n`
    + `${field.description}\n${field.guidance}\n原因: ${reason}\n`
    + JSON.stringify({ fieldId: field.id, revision, type: field.type, owner: field.owner,
      actorId: field.actorId, targetActorId: field.targetActorId, minimum: field.minimum,
      maximum: field.maximum, options: field.options }),
  ).join('\n\n')
}

/**
 * Render only objective fields whose author or world authority granted this character visibility.
 * @param state - authoritative world state with its retained history.
 * @param actorId - current model audience.
 * @returns current perceivable facts; hidden values and historical reasons are excluded.
 */
export function renderPerceivedState(state: DynamicState, actorId: string): string {
  return renderDynamicState({ ...state, entries: state.entries.filter(entry => entry.definition.owner === 'world'
    && entry.definition.audience.includes(actorId)) })
}

/**
 * Resolve model-visible field and person references through the current observer capability.
 * @param changes - parsed model deltas using visible references.
 * @param state - current owner state, including inactive definitions.
 * @param resolvePerson - authenticated observer reference resolver.
 * @param reference - stable field reference formatter shared with context rendering.
 * @returns canonical deltas for domain ownership and revision validation.
 */
export function resolveStateReferences(changes: readonly StateChange[], state: DynamicState,
  resolvePerson: (ref: string) => string, reference: (id: string) => string): StateChange[] {
  return changes.map((change) => {
    const existing = state.entries.find(item => reference(item.definition.id) === change.fieldId)
    const definition = change.definition === undefined ? undefined : { ...change.definition,
      actorId: resolvePerson(change.definition.actorId),
      audience: change.definition.audience.map(resolvePerson),
      ...(change.definition.targetActorId === undefined ? {} : { targetActorId: resolvePerson(change.definition.targetActorId),
        targetPersonRef: change.definition.targetActorId }) }
    return { ...change, fieldId: existing?.definition.id ?? change.fieldId,
      ...(definition === undefined ? {} : { definition: { ...definition, id: existing?.definition.id ?? definition.id } }) }
  })
}
