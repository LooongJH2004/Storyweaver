/** Authored versions and independently seeded worlds; no runtime-to-template writes. */
import type {
  BookDraft, BookId, CommandId, Document, Instance, InstanceId, NarrativeSnapshot,
  Resource, ResourceVerifier, RoleplayStore, RuntimeValues, TemplateVersion, TemplateVersionId,
} from './types.ts'
import { canonical, compareRecordKeys, entityKey, RoleplayError } from './records.ts'
import { readSnapshot, writeSnapshot } from './commands.ts'
import { contextRecipeSchema, initialContextRecipe, legacyContextRecipe, type ContextRecipe } from './context-recipe.ts'

/** Authoring edits create drafts; publication is immutable and explicitly selected at creation. */
export class StorybookLibrary {
  constructor(private readonly store: RoleplayStore, private readonly values: RuntimeValues,
    private readonly resources: ResourceVerifier,
    private readonly preparePublication: (input: { title: string; document: Document }) => Document) {}

  /** Read initial values for new books; this never resolves an existing book or instance.
   * @returns A detached recipe with the defaults revision used for saving.
   */
  contextDefaults(): ContextRecipe {
    return this.store.read(tx => contextRecipeSchema.parse(tx.get('library', 'defaults', 'context-recipe') ?? initialContextRecipe()))
  }

  /** Save the complete reviewed recipe at its revision without modifying books or live instances.
   * @param input - Initial values and the last-read defaults revision.
   * @returns The saved defaults with an incremented revision.
   */
  saveContextDefaults(input: ContextRecipe): ContextRecipe {
    const recipe = contextRecipeSchema.parse(input)
    return this.store.transaction((tx) => {
      const current = contextRecipeSchema.parse(tx.get('library', 'defaults', 'context-recipe') ?? initialContextRecipe())
      if (recipe.revision !== current.revision) throw new RoleplayError('conflict', 'System context defaults changed; reload before saving')
      const saved = { ...recipe, revision: current.revision + 1 }
      tx.put('library', 'defaults', 'context-recipe', saved)
      return saved
    })
  }

  /** Save author content and copy initial context only when the book is first created.
   * @param input - Reviewed draft revision, document and embedded resources.
   * @returns The independent saved draft with a new revision.
   */
  saveDraft(input: { id: BookId; expectedRevision: number; title: string; document: Document; resources: readonly Resource[] }): BookDraft {
    canonical(input)
    this.resources.verify(input.resources)
    return this.store.transaction((tx) => {
      const previous = tx.get<BookDraft>('library', 'drafts', input.id)
      if ((previous?.revision ?? 0) !== input.expectedRevision) throw new RoleplayError('conflict', 'Storybook draft revision changed')
      if (previous?.deleted === true) throw new RoleplayError('not-found', 'Storybook was removed from the author library')
      const document = structuredClone(input.document)
      if (document.schemaVersion === 6 && document.contextRecipe === undefined) {
        const recipe = previous === undefined
          ? contextRecipeSchema.parse(tx.get('library', 'defaults', 'context-recipe') ?? initialContextRecipe())
          : contextRecipeSchema.parse(previous.document.contextRecipe ?? legacyContextRecipe())
        document.contextRecipe = JSON.parse(canonical({ ...recipe, revision: 0 })) as Document
      }
      const draft: BookDraft = { id: input.id, revision: input.expectedRevision + 1, title: input.title,
        document, resources: structuredClone(input.resources), deleted: false,
        ...(previous?.latestVersionId === undefined ? {} : { latestVersionId: previous.latestVersionId }) }
      tx.put('library', 'drafts', draft.id, draft)
      return draft
    })
  }

  /** Preview the normalized immutable content before publication at its exact draft revision. */
  previewPublication(id: BookId, expectedRevision: number): BookDraft {
    const draft = this.draft(id)
    if (draft === undefined || draft.deleted) throw new RoleplayError('not-found', 'Storybook draft is unavailable')
    if (draft.revision !== expectedRevision) throw new RoleplayError('conflict', 'Storybook draft revision changed')
    const document = this.preparePublication({ title: draft.title, document: structuredClone(draft.document) })
    canonical(document)
    return { ...draft, document }
  }

  publish(id: BookId, expectedRevision: number): TemplateVersion {
    return this.store.transaction((tx) => {
      const draft = tx.get<BookDraft>('library', 'drafts', id)
      if (draft === undefined || draft.deleted) throw new RoleplayError('not-found', 'Storybook draft is unavailable')
      if (draft.revision !== expectedRevision) throw new RoleplayError('conflict', 'Storybook draft revision changed')
      const previous = draft.latestVersionId === undefined ? undefined : tx.get<TemplateVersion>('library', 'versions',
        draft.latestVersionId)
      const document = this.preparePublication({ title: draft.title, document: structuredClone(draft.document) })
      canonical(document)
      const version: TemplateVersion = { id: this.values.id() as TemplateVersionId, bookId: id,
        number: (previous?.number ?? 0) + 1, title: draft.title, document: structuredClone(document),
        resources: structuredClone(draft.resources), publishedAt: this.values.now() }
      tx.put('library', 'versions', version.id, version)
      tx.put('library', 'drafts', id, { ...draft, revision: draft.revision + 1, latestVersionId: version.id })
      return version
    })
  }

  version(id: TemplateVersionId): TemplateVersion {
    const value = this.store.read(tx => tx.get<TemplateVersion>('library', 'versions', id))
    if (value === undefined) throw new RoleplayError('not-found', 'Published storybook version is unavailable')
    return value
  }
  draft(id: BookId): BookDraft | undefined { return this.store.read(tx => tx.get<BookDraft>('library', 'drafts', id)) }
  list(): readonly BookDraft[] { return this.store.read(tx => tx.scan<BookDraft>('library',
    'drafts').map(row => row.value).filter(item => !item.deleted)) }
  instances(): readonly Instance[] { return this.store.read(tx => tx.scan<Instance>('library',
    'instances').map(row => row.value).filter(item => !item.deleted)
    .sort((left, right) => compareRecordKeys(left.createdAt, right.createdAt) || compareRecordKeys(left.id, right.id))) }

  createStory(input: { templateVersionId: TemplateVersionId; commandId: CommandId },
    initialize: (version: TemplateVersion, instanceId: InstanceId) => NarrativeSnapshot['entities']): NarrativeSnapshot {
    return this.store.transaction((tx) => {
      const prior = tx.get<{ input: typeof input; id: InstanceId }>('library', 'creations', input.commandId)
      if (prior !== undefined) {
        if (canonical(prior.input) !== canonical(input)) throw new RoleplayError('duplicate-command',
          'Creation command identity was reused')
        const initial = tx.get<NarrativeSnapshot>(prior.id, 'history', 'initial')
        if (initial === undefined) throw new RoleplayError('invalid', 'Created story baseline is unavailable')
        return initial
      }
      const version = tx.get<TemplateVersion>('library', 'versions', input.templateVersionId)
      if (version === undefined) throw new RoleplayError('not-found', 'Select a published storybook version')
      const id = `story-${this.values.id()}` as InstanceId
      const snapshot: NarrativeSnapshot = { instance: { id, templateVersionId: version.id, revision: 0, epoch: 0,
        createdAt: this.values.now(), deleted: false }, entities: structuredClone(initialize(structuredClone(version),
        id)).slice().sort((a, b) => compareRecordKeys(entityKey(a.key), entityKey(b.key))) }
      canonical(snapshot)
      writeSnapshot(tx, snapshot)
      tx.put(id, 'history', 'initial', snapshot)
      tx.put('library', 'creations', input.commandId, { input, id })
      return snapshot
    })
  }

  /** Create a reviewable draft from selected instance material at an exact story revision. */
  extract(input: { instanceId: InstanceId; expectedRevision: number; commandId: CommandId; selection: Document; title: string },
    build: (snapshot: NarrativeSnapshot) => Document): BookDraft {
    return this.store.transaction((tx) => {
      const prior = tx.get<{ input: typeof input; draft: BookDraft }>('library', 'extractions', input.commandId)
      if (prior !== undefined) {
        if (canonical(prior.input) !== canonical(input)) throw new RoleplayError('duplicate-command', 'Extraction identity was reused')
        return prior.draft
      }
      const snapshot = readSnapshot(tx, input.instanceId)
      if (snapshot.instance.revision !== input.expectedRevision) throw new RoleplayError('conflict',
        'Story revision changed before extraction')
      const id = this.values.id() as BookId
      const draft: BookDraft = { id, revision: 1, title: input.title, document: build(snapshot), resources: [], deleted: false }
      tx.put('library', 'drafts', id, draft)
      tx.put('library', 'extractions', input.commandId, { input, draft })
      return draft
    })
  }

  remove(id: BookId, expectedRevision: number): void {
    this.store.transaction((tx) => {
      const draft = tx.get<BookDraft>('library', 'drafts', id)
      if (draft === undefined) throw new RoleplayError('not-found', 'Storybook draft is unavailable')
      if (draft.revision !== expectedRevision) throw new RoleplayError('conflict', 'Storybook draft revision changed')
      tx.put('library', 'drafts', id, { ...draft, deleted: true, revision: draft.revision + 1 })
    })
  }
}
