import { synchronizeCreative, pauseCreative } from './creative-settings.ts'
/** Durable command application, independent of model and transport lifecycles. */
import type {
  Command, CommandHandler, CommitId, Instance, InstanceId, Json, NarrativeCommit,
  NarrativeSnapshot, PendingDelivery, RoleplayStore, RuntimeValues, Transaction,
} from './types.ts'
import { canonical, entityKey, project, RoleplayError } from './records.ts'

/** Read one current world within an existing storage transaction. */
export function readSnapshot(tx: Transaction, id: InstanceId, includeDeleted = false): NarrativeSnapshot {
  const instance = tx.get<Instance>('library', 'instances', id)
  if (instance === undefined || (instance.deleted && !includeDeleted)) throw new RoleplayError('not-found', 'Story instance is unavailable')
  return { instance, entities: tx.scan<NarrativeSnapshot['entities'][number]>(id, 'entities').map(row => row.value) }
}

/** Publish a validated projection inside the same transaction as its event record. */
export function writeSnapshot(tx: Transaction, snapshot: NarrativeSnapshot): void {
  const id = snapshot.instance.id
  const keys = new Set(snapshot.entities.map(item => entityKey(item.key)))
  if (keys.size !== snapshot.entities.length) throw new RoleplayError('invalid', 'Narrative snapshot repeats an entity')
  for (const row of tx.scan(id, 'entities')) if (!keys.has(row.key)) tx.remove(id, 'entities', row.key)
  for (const item of snapshot.entities) tx.put(id, 'entities', entityKey(item.key), item)
  tx.put('library', 'instances', id, snapshot.instance)
}

/** A rewrite rolls back fiction while retaining the recipe saved before that rewrite. */
function restoredEntities(current: NarrativeSnapshot, target: NarrativeSnapshot, preserveContextRecipe = false): NarrativeSnapshot['entities'] {
  if (!preserveContextRecipe) return pauseCreative(target.entities)
  const entities = target.entities.filter(item => !['context-recipe', 'creative-settings'].includes(item.key.collection)).map(item =>
    item.key.collection === 'configuration' && item.key.id === 'revision' ? { ...item, value: current.instance.revision + 1 } : item)
  return [...entities, ...current.entities.filter(item => ['context-recipe', 'creative-settings'].includes(item.key.collection))]
}

/** Pure replay reads authoritative commits rather than Session projections. */
export function replayIn(tx: Transaction, id: InstanceId, through: number): NarrativeSnapshot {
  const initial = tx.get<NarrativeSnapshot>(id, 'history', 'initial')
  if (initial === undefined) throw new RoleplayError('not-found', 'Story history is unavailable')
  if (!Number.isSafeInteger(through) || through < 0) throw new RoleplayError('invalid', 'Invalid story history revision')
  let snapshot = initial
  const versions = new Map<number, NarrativeSnapshot>([[0, initial]])
  const commits = tx.scan<NarrativeCommit>(id, 'commits').map(row => row.value).sort((a, b) => a.revision - b.revision)
  for (const commit of commits) {
    if (commit.revision > through) break
    if (commit.revision !== snapshot.instance.revision + 1) throw new RoleplayError('invalid', 'Narrative history has a revision gap')
    for (const event of commit.events) {
      if (event.type === 'history.restored') {
        const target = versions.get(event.targetRevision)
        if (target === undefined) throw new RoleplayError('invalid', 'Narrative restore references unavailable history')
        snapshot = { instance: snapshot.instance, entities: restoredEntities(snapshot, target, event.preserveContextRecipe) }
      }
      // Replay owns immutable decoded records. Share untouched records between historical
      // versions rather than deep-copying the entire world for every individual event.
      snapshot = project(snapshot, [event], true)
    }
    snapshot = { ...snapshot, instance: { ...snapshot.instance, revision: commit.revision } }
    versions.set(commit.revision, snapshot)
  }
  if (snapshot.instance.revision !== through) throw new RoleplayError('not-found', 'Story history revision is unavailable')
  return structuredClone(snapshot)
}

/** Each accepted command has one commit point and a retryable notification. */
export class NarrativeCommands {
  constructor(private readonly store: RoleplayStore, private readonly values: RuntimeValues,
    private readonly validateCreativeContext?: (snapshot: NarrativeSnapshot, command: Command) => void) {}

  /** Validate and commit once; a lost response cannot cause a second application. */
  execute(command: Command, handler: CommandHandler): NarrativeCommit {
    // Canonicalization also rejects incomplete wire values before any mutation.
    const fingerprint = canonical(command)
    return this.store.transaction((tx) => {
      const previous = tx.get<NarrativeCommit>(command.instanceId, 'commands', command.id)
      if (previous !== undefined) {
        if (canonical(previous.command) !== fingerprint) throw new RoleplayError('duplicate-command', 'Command identity was reused for different content')
        return previous
      }
      const snapshot = readSnapshot(tx, command.instanceId)
      if (snapshot.instance.revision !== command.expectedRevision) throw new RoleplayError('conflict', 'Story revision changed; reload before submitting')
      if ('epoch' in command.principal && snapshot.instance.epoch !== command.principal.epoch) {
        throw new RoleplayError('stale-execution', 'This execution attempt is no longer current')
      }
      const synchronized = synchronizeCreative(command, snapshot, tx)
      const handled = handler(structuredClone(project(snapshot, synchronized)))
      const accepted = { ...handled, events: [...synchronized, ...handled.events] }
      canonical(accepted)
      if (accepted.events.some(event => event.type === 'instance.removed') && command.principal.kind !== 'player') throw new RoleplayError('invalid', 'Only the player may remove an instance')
      const restores = accepted.events.filter(event => event.type === 'history.restored')
      if (restores.length > 0 && (accepted.events.length !== 1 || command.principal.kind !== 'player')) {
        throw new RoleplayError('invalid', 'History restoration is a separate player command')
      }
      const restore = restores[0]
      const base = restore === undefined ? snapshot : {
        instance: snapshot.instance,
        entities: restoredEntities(snapshot, replayIn(tx, command.instanceId, restore.targetRevision), restore.preserveContextRecipe),
      }
      if (restore !== undefined && restore.targetRevision > snapshot.instance.revision) throw new RoleplayError('invalid', 'Cannot restore future history')
      const projected = project(base, accepted.events)
      if (accepted.events.some(event => event.type === 'entity.replaced' && event.key.collection === 'creative-settings')) {
        this.validateCreativeContext?.(projected, command)
      }
      const revision = snapshot.instance.revision + 1
      const commit: NarrativeCommit = { id: this.values.id() as CommitId, command: structuredClone(command),
        revision, events: structuredClone(accepted.events), result: structuredClone(accepted.result), committedAt: this.values.now() }
      if (restore !== undefined) writeSnapshot(tx, { ...projected, instance: { ...projected.instance, revision } })
      else {
        for (const event of accepted.events) {
          if (event.type === 'entity.replaced') tx.put(command.instanceId, 'entities', entityKey(event.key), { key: event.key, value: event.value })
          else if (event.type === 'entity.removed') tx.remove(command.instanceId, 'entities', entityKey(event.key))
        }
        tx.put('library', 'instances', command.instanceId, { ...projected.instance, revision })
      }
      tx.put(command.instanceId, 'commits', String(revision), commit)
      tx.put(command.instanceId, 'commands', command.id, commit)
      tx.put<PendingDelivery>('delivery', 'pending', commit.id, {
        commitId: commit.id, instanceId: command.instanceId, revision, attempts: 0,
      })
      return commit
    })
  }

  /** Read a detached current world; no Actor session needs to exist. */
  snapshot(id: InstanceId): NarrativeSnapshot { return this.store.read(tx => readSnapshot(tx, id)) }
  /** Look up accepted work by stable retry identity, without re-running its producer. */
  receipt(id: InstanceId, commandId: Command['id']): NarrativeCommit | undefined {
    return this.store.read(tx => tx.get<NarrativeCommit>(id, 'commands', commandId))
  }
  /** Read the committed projection at its current revision; reconstruct older revisions from history. */
  replay(id: InstanceId, revision: number): NarrativeSnapshot {
    return this.store.read((tx) => {
      const current = tx.get<Instance>('library', 'instances', id)
      // The revision check and projection read share one transaction, including for deleted worlds.
      if (current !== undefined && current.revision === revision) return readSnapshot(tx, id, true)
      return replayIn(tx, id, revision)
    })
  }
  /** Restore by compensation; discarded continuations remain in physical history. */
  restore(command: Command, targetRevision: number, reason: string, preserveContextRecipe = false): NarrativeCommit {
    const options = preserveContextRecipe ? { preserveContextRecipe: true as const } : {}
    if (command.principal.kind !== 'player' || canonical(command.input) !== canonical({ targetRevision, reason, ...options })) {
      throw new RoleplayError('invalid', 'Restore command must bind the player-selected history and reason')
    }
    return this.execute(command, () => ({ events: [{ type: 'history.restored', targetRevision, reason, ...options }], result: { targetRevision } }))
  }
  /** List immutable narrative boundaries without consulting an execution session. */
  checkpoints(id: InstanceId): readonly { name: string; revision: number; execution: Json }[] {
    return this.store.read((tx) => { readSnapshot(tx, id); return tx.scan<{ revision: number; execution: Json }>(id, 'checkpoints')
      .map(item => ({ name: item.key, ...item.value })) })
  }
  /** Save a reusable business boundary; technical execution coordinates are optional adapter data. */
  checkpoint(id: InstanceId, name: string, expectedRevision: number, execution: Json = null): NarrativeSnapshot {
    return this.store.transaction((tx) => {
      const snapshot = readSnapshot(tx, id)
      if (snapshot.instance.revision !== expectedRevision) throw new RoleplayError('conflict', 'Checkpoint revision changed')
      if (tx.get(id, 'checkpoints', name) !== undefined) throw new RoleplayError('conflict', 'Checkpoint already exists')
      tx.put(id, 'checkpoints', name, { revision: expectedRevision, execution })
      return snapshot
    })
  }
}

/** Drain notifications after commit; sink delivery must deduplicate by commit identity. */
export class NarrativeDeliveries {
  constructor(private readonly store: RoleplayStore) {}
  pending(): readonly PendingDelivery[] { return this.store.read(tx => tx.scan<PendingDelivery>('delivery', 'pending').map(row => row.value)) }
  async drain(sink: (commit: NarrativeCommit) => Promise<void>): Promise<void> {
    for (const delivery of this.pending()) {
      const commit = this.store.read(tx => tx.get<NarrativeCommit>(delivery.instanceId, 'commits', String(delivery.revision)))
      if (commit === undefined) throw new RoleplayError('invalid', 'Delivery references missing narrative commit')
      try { await sink(commit) }
      catch (error: unknown) {
        this.store.transaction((tx) => {
          const current = tx.get<PendingDelivery>('delivery', 'pending', delivery.commitId)
          if (current !== undefined) tx.put('delivery', 'pending', delivery.commitId, { ...current,
            attempts: current.attempts + 1, lastError: error instanceof Error ? error.message : 'Notification failed' })
        })
        continue
      }
      this.store.transaction((tx) => { tx.remove('delivery', 'pending', delivery.commitId) })
    }
  }
}
