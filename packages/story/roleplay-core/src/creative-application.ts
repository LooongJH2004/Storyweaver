/** User-owned global publication and instance binding commands. */
import { z } from 'zod'
import { NarrativeCommands, readSnapshot } from './commands.ts'
import { canonical, RoleplayError } from './records.ts'
import { json } from './world.ts'
import { recipeOf, type ContextRecipe } from './context-recipe.ts'
import { creativeModuleSchema, creativeModules, creativeBindings, creativeValue, creativeEvents, assertCreativeIdle,
  creativeBookId, readGlobalCreative, storybookRecipe, globalCreativeSchema, validateCreativeValue, type CreativeBindings, type GlobalCreativeSettings } from './creative-settings.ts'
import type { RoleplayStore, RuntimeValues, InstanceId, CommandId, CommandScope, NarrativeCommit, BookId, BookDraft } from './types.ts'

/** One read snapshot of story sources and the concrete values available for synchronization. */
export interface CreativeSettingsView {
  bookId: BookId
  instanceRevision: number
  bindings: CreativeBindings
  global: GlobalCreativeSettings
  /** Saved effective context; pending shared updates have not been applied. */
  recipe: ContextRecipe
  /** Baseline frozen when this story was created, independent of later book publications. */
  storybook: ContextRecipe
}
const creativeSourceFields = {
  source: z.enum(['local', 'storybook', 'global', 'copy-global']),
  expectedBindingRevision: z.number().int().nonnegative(), expectedGlobalRevision: z.number().int().nonnegative(),
}
/** One reviewed source choice applies to either one module or an atomic selection. */
export const creativeSourceInputSchema = z.union([
  z.strictObject({ ...creativeSourceFields, module: creativeModuleSchema }),
  z.strictObject({ ...creativeSourceFields, modules: z.array(creativeModuleSchema).min(1).max(creativeModules.length)
    .refine(modules => new Set(modules).size === modules.length, 'Select each module only once') }),
])
export type CreativeSourceInput = z.infer<typeof creativeSourceInputSchema>
export interface PublishCreativeInput {
  bookId: BookId
  commandId: CommandId
  expectedGlobalRevision: number
  modules: GlobalCreativeSettings['modules']
  fromInstance?: { instanceId: InstanceId; expectedRevision: number }
}
export class CreativeSettingsApplication {
  constructor(private readonly store: RoleplayStore, private readonly commands: NarrativeCommands,
    private readonly values: RuntimeValues) {}
  /** Read saved defaults without changing a story or materializing a newer global version. */
  global(bookId: BookId): GlobalCreativeSettings { return this.store.read(tx => readGlobalCreative(tx, bookId)) }
  /** Read sources and concrete preview values without synchronizing them.
   * @param instanceId - Story whose owning book and pinned version scope this comparison.
   * @returns Saved effective and pinned recipes, retained independent values, and latest book sharing.
   */
  read(instanceId: InstanceId): CreativeSettingsView {
    return this.store.read((tx) => {
      const snapshot = readSnapshot(tx, instanceId)
      return { bookId: creativeBookId(tx, snapshot), instanceRevision: snapshot.instance.revision,
        bindings: creativeBindings(snapshot), global: readGlobalCreative(tx, creativeBookId(tx, snapshot)),
        recipe: recipeOf(snapshot), storybook: storybookRecipe(snapshot) }
    })
  }
  /** Publish selected saved modules atomically. Existing instance values and subscriptions are untouched. */
  publish(raw: PublishCreativeInput): GlobalCreativeSettings {
    const input = z.strictObject({ bookId: z.string().min(1), commandId: z.string().min(1),
      expectedGlobalRevision: z.number().int().nonnegative(),
      modules: globalCreativeSchema.shape.modules,
      fromInstance: z.strictObject({ instanceId: z.string().min(1), expectedRevision: z.number().int().nonnegative() }).optional(),
    }).parse(raw)
    if (Object.keys(input.modules).length === 0) throw new RoleplayError('invalid', 'Select at least one creative module to publish')
    return this.store.transaction((tx) => {
      const book = tx.get<BookDraft>('library', 'drafts', input.bookId)
      if (book === undefined || book.deleted) throw new RoleplayError('not-found', 'Storybook is unavailable')
      const namespace = `creative-book:${input.bookId}`
      const fingerprint = canonical(input)
      const old = tx.get<{ fingerprint: string; value: GlobalCreativeSettings }>(namespace, 'commands', input.commandId)
      if (old !== undefined) {
        if (old.fingerprint !== fingerprint) throw new RoleplayError('duplicate-command', 'Global command identity was reused')
        return old.value
      }
      const current = readGlobalCreative(tx, input.bookId as BookId)
      if (current.revision !== input.expectedGlobalRevision) throw new RoleplayError('conflict', 'Global creative settings changed; review the latest version')
      if (input.fromInstance !== undefined) {
        const snapshot = readSnapshot(tx, input.fromInstance.instanceId as InstanceId)
        if (creativeBookId(tx, snapshot) !== input.bookId) throw new RoleplayError('invalid', 'An instance can publish only to its own storybook')
        if (snapshot.instance.revision !== input.fromInstance.expectedRevision) throw new RoleplayError('conflict', 'Story changed; reload saved settings before publishing')
        for (const key of creativeModules) if (Object.hasOwn(input.modules, key)
          && canonical(input.modules[key]) !== canonical(creativeValue(recipeOf(snapshot), key))) {
          throw new RoleplayError('conflict', 'Save instance edits before publishing them globally')
        }
      }
      for (const key of creativeModules) if (input.modules[key] !== undefined) validateCreativeValue(key, input.modules[key])
      const next: GlobalCreativeSettings = { schemaVersion: 1, revision: current.revision + 1,
        modules: { ...current.modules, ...input.modules }, updatedAt: this.values.now() }
      tx.put(namespace, 'settings', 'current', next)
      tx.put(namespace, 'versions', String(next.revision), next)
      tx.put(namespace, 'commands', input.commandId, { fingerprint, value: next })
      return next
    })
  }
  /** Apply all selected source changes atomically at reviewed revisions, retaining independent backups. */
  bind(scope: CommandScope, raw: CreativeSourceInput): NarrativeCommit {
    const input = creativeSourceInputSchema.parse(raw)
    return this.commands.execute({ ...scope, kind: 'configuration.creative-source', input: json(input) }, (snapshot) => {
      if (scope.principal.kind !== 'player') throw new RoleplayError('invalid', 'Only the player may select creative sources')
      assertCreativeIdle(snapshot)
      const bindings = creativeBindings(snapshot)
      if (bindings.revision !== input.expectedBindingRevision) throw new RoleplayError('conflict', 'Creative sources changed; reload before saving')
      const modules = 'module' in input ? [input.module] : input.modules
      const global = this.store.read(tx => readGlobalCreative(tx, creativeBookId(tx, snapshot)))
      if ((input.source === 'global' || input.source === 'copy-global') && global.revision !== input.expectedGlobalRevision) {
        throw new RoleplayError('conflict', 'Global creative settings changed; review before applying')
      }
      for (const module of modules) {
        const binding = bindings.modules[module]
        if (input.source === 'global' || input.source === 'copy-global') {
          const value = global.modules[module]
          if (value === undefined) throw new RoleplayError('invalid', 'Set this global module before following or copying it')
          validateCreativeValue(module, value)
          bindings.modules[module] = input.source === 'global'
            ? { ...binding, source: 'global', appliedGlobalRevision: global.revision, appliedGlobalValue: value, followPaused: false }
            : { source: 'local', localValue: value }
        } else bindings.modules[module] = { ...binding, source: input.source, followPaused: false }
      }
      return { events: creativeEvents(snapshot, bindings), result: { bindingRevision: bindings.revision + 1 } }
    })
  }
}
