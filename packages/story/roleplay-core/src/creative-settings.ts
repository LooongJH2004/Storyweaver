export * from './creative-modules.ts'
import { creativeBindingsSchema, creativeModules, creativeValue, applyCreativeValue, globalCreativeSchema, validateCreativeValue, type CreativeBindings, type GlobalCreativeSettings } from './creative-modules.ts'
/** Saved creative module sources; historical resolution never consults current global defaults. */
import { z } from 'zod'
import { contextRecipeSchema, legacyContextRecipe, resolveContextRecipe, recipeOf, type ContextRecipe } from './context-recipe.ts'
import { entity, canonical, RoleplayError } from './records.ts'
import { json, replace } from './world.ts'
import type { NarrativeSnapshot, NarrativeEvent, Transaction, Command, BookId, TemplateVersion } from './types.ts'

export function creativeBindings(snapshot: NarrativeSnapshot): CreativeBindings {
  const stored = entity(snapshot, { collection: 'creative-settings', id: 'current' })
  if (stored !== undefined) return creativeBindingsSchema.parse(stored)
  const recipe = recipeOf(snapshot)
  return { schemaVersion: 1, revision: 0, modules: Object.fromEntries(creativeModules.map(key => [key,
    { source: 'local', localValue: creativeValue(recipe, key) }])) as CreativeBindings['modules'] }
}
export function storybookRecipe(snapshot: NarrativeSnapshot): ContextRecipe {
  const book = z.object({ contextRecipe: contextRecipeSchema.optional() }).parse(entity(snapshot, { collection: 'setting', id: 'book' }))
  return resolveContextRecipe(book.contextRecipe ?? legacyContextRecipe())
}
export function materializeCreative(snapshot: NarrativeSnapshot, bindings: CreativeBindings): ContextRecipe {
  let recipe = recipeOf(snapshot)
  for (const key of creativeModules) {
    const binding = bindings.modules[key]
    const value = binding.source === 'local' ? binding.localValue : binding.source === 'storybook'
      ? creativeValue(storybookRecipe(snapshot), key) : binding.appliedGlobalValue
    if (value === undefined) throw new RoleplayError('invalid', 'Following module has no applied global snapshot')
    recipe = applyCreativeValue(recipe, key, value)
  }
  return contextRecipeSchema.parse(recipe)
}
/** Resolve the owning library book from its immutable version, never from model-authored document IDs. */
export function creativeBookId(tx: Transaction, snapshot: NarrativeSnapshot): BookId {
  const version = tx.get<TemplateVersion>('library', 'versions', snapshot.instance.templateVersionId)
  if (version === undefined) throw new RoleplayError('not-found', 'Storybook version is unavailable')
  return version.bookId
}
export function readGlobalCreative(tx: Transaction, bookId: BookId): GlobalCreativeSettings {
  return globalCreativeSchema.parse(tx.get(`creative-book:${bookId}`, 'settings', 'current')
    ?? { schemaVersion: 1, revision: 0, modules: {}, updatedAt: '' })
}
export function creativeEvents(snapshot: NarrativeSnapshot, bindings: CreativeBindings): NarrativeEvent[] {
  return [replace('creative-settings', 'current', { ...bindings, revision: bindings.revision + 1 }),
    replace('context-recipe', 'current', { ...materializeCreative(snapshot, bindings), revision: recipeOf(snapshot).revision + 1 }),
    replace('configuration', 'revision', snapshot.instance.revision + 1)]
}
export function assertCreativeIdle(snapshot: NarrativeSnapshot): void {
  if (snapshot.entities.some(item => ['run', 'execution'].includes(item.key.collection)
    && z.looseObject({ status: z.string() }).parse(item.value).status.match(/^(preparing|dispatching|running|executing)$/u))) {
    throw new RoleplayError('conflict', 'Wait for the current story execution to finish before applying configuration')
  }
}
/** Synchronization is part of the original accepted player command, never a background write. */
export function synchronizeCreative(command: Command, snapshot: NarrativeSnapshot, tx: Transaction): NarrativeEvent[] {
  if (command.principal.kind !== 'player' || entity(snapshot, { collection: 'creative-settings', id: 'current' }) === undefined) return []
  const boundary = ['world.observe', 'player.embody', 'player.pass', 'player.control'].includes(command.kind)
    || command.kind === 'director.open' && z.object({ playerInput: z.boolean() }).parse(command.input).playerInput
  if (!boundary || entity(snapshot, { collection: 'creative-settings', id: 'current' }) === undefined) return []
  const bindings = creativeBindings(snapshot); const global = readGlobalCreative(tx, creativeBookId(tx, snapshot))
  let changed = false
  for (const key of creativeModules) {
    const binding = bindings.modules[key]
    if (binding.source !== 'global' || binding.followPaused || binding.appliedGlobalRevision === global.revision) continue
    const value = global.modules[key]
    if (value === undefined) throw new RoleplayError('invalid', 'Followed global module is unavailable; choose an independent configuration')
    validateCreativeValue(key, value)
    bindings.modules[key] = { ...binding, appliedGlobalRevision: global.revision, appliedGlobalValue: value }
    changed = true
  }
  return changed ? creativeEvents(snapshot, bindings) : []
}
/** Saved local values survive ordinary recipe editing; other sources cannot be overwritten by stale editors. */
export function localCreativeEdits(snapshot: NarrativeSnapshot, recipe: ContextRecipe): NarrativeEvent[] {
  if (entity(snapshot, { collection: 'creative-settings', id: 'current' }) === undefined) return []
  const bindings = creativeBindings(snapshot)
  for (const key of creativeModules) {
    const binding = bindings.modules[key]; const next = creativeValue(recipe, key)
    if (binding.source === 'local') binding.localValue = next
    else if (canonical(next) !== canonical(creativeValue(recipeOf(snapshot), key))) {
      throw new RoleplayError('conflict', 'Make this creative module independent before editing it')
    }
  }
  return [replace('creative-settings', 'current', { ...bindings, revision: bindings.revision + 1 })]
}
export function pauseCreative(entities: NarrativeSnapshot['entities']): NarrativeSnapshot['entities'] {
  return entities.map((item) => {
    if (item.key.collection !== 'creative-settings') return item
    const bindings = creativeBindingsSchema.parse(item.value)
    for (const key of creativeModules) if (bindings.modules[key].source === 'global') bindings.modules[key].followPaused = true
    return { ...item, value: json(bindings) }
  })
}
