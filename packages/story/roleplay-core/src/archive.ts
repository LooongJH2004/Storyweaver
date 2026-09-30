import { pauseCreative } from './creative-settings.ts'
import { parseStorybookDocument } from './storybook.ts'
import { validateWorld, validateImportedAuthority } from './world-validation.ts'
/** Portable archives preserve narrative history while importing into a fresh instance scope. */
import { z } from 'zod'
import { canonical, entity, project, RoleplayError } from './records.ts'
import { readSnapshot, replayIn, writeSnapshot } from './commands.ts'
import type { BookId, CommandId, CommitId, InstanceId, Json, NarrativeCommit, NarrativeSnapshot, ResourceVerifier,
  RoleplayStore, RuntimeValues, TemplateVersion, TemplateVersionId } from './types.ts'

const text = z.string().min(1)
const json = z.json()
const key = z.strictObject({ collection: text, id: text })
const principal = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('player') }),
  z.strictObject({ kind: z.literal('actor'), actorId: text, attempt: text, epoch: z.number().int().nonnegative() }),
  z.strictObject({ kind: z.literal('director'), attempt: text, epoch: z.number().int().nonnegative() }),
  z.strictObject({ kind: z.literal('system'), operation: text }),
])
const instance = z.strictObject({ id: text, templateVersionId: text, revision: z.number().int().nonnegative(),
  epoch: z.number().int().nonnegative(), createdAt: z.iso.datetime(), deleted: z.boolean() })
const event = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('entity.replaced'), key, value: json }),
  z.strictObject({ type: z.literal('entity.removed'), key }),
  z.strictObject({ type: z.literal('instance.removed'), reason: text }),
  z.strictObject({ type: z.literal('execution.invalidated'), reason: text }),
  z.strictObject({ type: z.literal('history.restored'), targetRevision: z.number().int().nonnegative(), reason: text, preserveContextRecipe: z.literal(true).optional() })
    .transform(({ preserveContextRecipe, ...event }) => ({ ...event,
      ...preserveContextRecipe ? { preserveContextRecipe: true as const } : {} })),
])
/** Imported JSON is validated before any durable write; format upgrades are explicit. */
export const narrativeArchiveSchema = z.strictObject({
  formatVersion: z.literal(1),
  template: z.strictObject({ id: text, bookId: text, number: z.number().int().positive(), title: text, document: z.record(text, json),
    resources: z.array(z.strictObject({ path: text, digest: text, base64: z.string() })), publishedAt: z.iso.datetime() }),
  initial: z.strictObject({ instance, entities: z.array(z.strictObject({ key, value: json })) }),
  commits: z.array(z.strictObject({ id: text, revision: z.number().int().positive(), committedAt: z.iso.datetime(),
    events: z.array(event), result: json,
    command: z.strictObject({ id: text, instanceId: text, expectedRevision: z.number().int().nonnegative(), principal,
      kind: text, input: json }) })),
  checkpoints: z.array(z.strictObject({ name: text, revision: z.number().int().nonnegative(), execution: json })),
  executionEvidence: z.array(z.strictObject({ id: text, content: json })),
})
/** Execution evidence remains opaque adapter data; it never reconstructs narrative state. */
export type NarrativeArchive = z.infer<typeof narrativeArchiveSchema>

/** Domain archive service imports all records atomically into an independent world. */
export class NarrativeArchives {
  constructor(private readonly store: RoleplayStore, private readonly values: RuntimeValues,
    private readonly resources: ResourceVerifier) {}

  /** Read imported execution evidence in one instance without installing it as a live session. */
  evidence(instanceId: InstanceId): readonly { id: string; content: Json }[] {
    return this.store.read((tx) => {
      readSnapshot(tx, instanceId)
      return tx.scan<Json>(instanceId, 'execution-evidence').map(row => ({ id: row.key, content: row.value }))
    })
  }

  export(instanceId: InstanceId, executionEvidence: NarrativeArchive['executionEvidence']): NarrativeArchive {
    return this.store.read((tx) => {
      const snapshot = readSnapshot(tx, instanceId)
      const evidence = new Map(tx.scan<Json>(instanceId, 'execution-evidence').map(row => [row.key, row.value]))
      for (const item of executionEvidence) {
        if (evidence.has(item.id) && canonical(evidence.get(item.id)) !== canonical(item.content)) throw new RoleplayError('conflict', 'Execution evidence identity has different content')
        evidence.set(item.id, item.content)
      }
      return narrativeArchiveSchema.parse({ formatVersion: 1,
        template: tx.get('library', 'versions', snapshot.instance.templateVersionId), initial: tx.get(instanceId, 'history', 'initial'),
        commits: tx.scan<NarrativeCommit>(instanceId, 'commits').map(row => row.value).sort((a, b) => a.revision - b.revision),
        checkpoints: tx.scan<{ revision: number; execution: Json }>(instanceId, 'checkpoints').map(row => ({ name: row.key,
          ...row.value })), executionEvidence: [...evidence].map(([id, content]) => ({ id, content })) })
    })
  }

  import(input: unknown, commandId: CommandId): NarrativeSnapshot {
    const archive = narrativeArchiveSchema.parse(input)
    this.resources.verify(archive.template.resources)
    const fingerprint = canonical(archive)
    return this.store.transaction((tx) => {
      const previous = tx.get<{ fingerprint: string; instanceId: InstanceId }>('library', 'imports', commandId)
      if (previous !== undefined) {
        if (previous.fingerprint !== fingerprint) throw new RoleplayError('duplicate-command', 'Archive import identity was reused')
        return readSnapshot(tx, previous.instanceId)
      }
      const initial = archive.initial
      if (initial.instance.revision !== 0 || initial.instance.templateVersionId !== archive.template.id) throw new RoleplayError('invalid', 'Archive baseline does not match its published book')
      if (new Set(archive.commits.map(item => item.id)).size !== archive.commits.length
        || new Set(archive.commits.map(item => item.command.id)).size !== archive.commits.length
        || new Set(archive.checkpoints.map(item => item.name)).size !== archive.checkpoints.length) throw new RoleplayError('invalid', 'Archive repeats an accepted identity')
      const id = `story-${this.values.id()}` as InstanceId
      const versionId = this.values.id() as TemplateVersionId
      const template: TemplateVersion = { ...archive.template, id: versionId, bookId: this.values.id() as BookId }
      tx.put('library', 'versions', versionId, template)
      const baseline: NarrativeSnapshot = { ...initial, instance: { ...initial.instance, id, templateVersionId: versionId } }
      if (canonical(entity(baseline, { collection: 'setting', id: 'book' })) !== canonical(parseStorybookDocument(template.document))) {
        throw new RoleplayError('invalid', 'Archive opening settings differ from the pinned book version')
      }
      validateWorld(baseline)
      let validationSnapshot = baseline
      writeSnapshot(tx, baseline)
      tx.put(id, 'history', 'initial', baseline)
      for (const [index, original] of archive.commits.entries()) {
        if (original.revision !== index + 1 || original.command.expectedRevision !== index
          || original.command.instanceId !== initial.instance.id) {
          throw new RoleplayError('invalid', 'Archive has inconsistent command scope or revision')
        }
        const commit: NarrativeCommit = { ...original, id: this.values.id() as CommitId,
          command: { ...original.command, id: this.values.id() as CommandId, instanceId: id } }
        validateImportedAuthority(commit, validationSnapshot)
        tx.put(id, 'commits', String(commit.revision), commit)
        tx.put(id, 'commands', commit.command.id, commit)
        tx.put(id, 'import-provenance', commit.id, { instanceId: initial.instance.id, commitId: original.id,
          commandId: original.command.id })
        validationSnapshot = commit.events.some(event => event.type === 'history.restored')
          ? replayIn(tx, id, commit.revision) : project(validationSnapshot, commit.events)
        validationSnapshot = { ...validationSnapshot, instance: { ...validationSnapshot.instance, revision: commit.revision } }
        validateWorld(validationSnapshot)
      }
      let snapshot = replayIn(tx, id, archive.commits.length)
      // Imported execution is evidence only. A new host must start a fresh attempt.
      const revision = snapshot.instance.revision + 1
      const invalidation: NarrativeCommit = { id: this.values.id() as CommitId, revision, committedAt: this.values.now(),
        command: { id: this.values.id() as CommandId, instanceId: id, expectedRevision: revision - 1,
          principal: { kind: 'system', operation: 'import' }, kind: 'instance.imported',
          input: { originalInstanceId: initial.instance.id } },
        events: [{ type: 'execution.invalidated', reason: 'Imported into an independent instance' },
          ...pauseCreative(snapshot.entities).filter(item => item.key.collection === 'creative-settings').map(item => ({ type: 'entity.replaced' as const, key: item.key, value: item.value })),
          ...snapshot.entities.filter(item => (item.key.collection === 'execution' || item.key.collection === 'run')).map(item => ({ type: 'entity.removed' as const, key: item.key }))], result: null }
      tx.put(id, 'commits', String(revision), invalidation)
      tx.put(id, 'commands', invalidation.command.id, invalidation)
      snapshot = replayIn(tx, id, revision)
      writeSnapshot(tx, snapshot)
      for (const checkpoint of archive.checkpoints) {
        if (checkpoint.revision > archive.commits.length) throw new RoleplayError('invalid', 'Checkpoint references unavailable history')
        tx.put(id, 'checkpoints', checkpoint.name, { revision: checkpoint.revision, execution: null })
        tx.put(id, 'execution-evidence', `checkpoint:${checkpoint.name}`, checkpoint.execution)
      }
      for (const evidence of archive.executionEvidence) tx.put(id, 'execution-evidence', evidence.id, evidence.content)
      tx.put('library', 'imports', commandId, { fingerprint, instanceId: id })
      return snapshot
    })
  }
}
