/** Review and retrieval use narrative records, never execution sessions or reconstructed logs. */
import { retentionReviewSchema, narrativeRecallSchema, type RetentionReviewInput, type NarrativeRecallInput } from './command-inputs.ts'
import { correctContextNote, editContextProposal, reviewContextProposals, pinContextSource, proposeContextUpdate, revokeContextNote, type ContextUpdateUnit } from './context-retention.ts'
import { indexedRetention, narrativeOriginals, narrativeNotes, sourceRevisionRange, compareOriginals } from './retention-records.ts'
import { personOf, replace, json } from './world.ts'
import { compareRecordKeys, RoleplayError } from './records.ts'
import type { CommandScope, NarrativeCommit, NarrativeReader, NarrativeWriter, InstanceId, RetentionReviewView, NarrativeRecallView } from './types.ts'

/** Player approval is a separate transaction; actor proposals join their accepted turn. */
export class RetentionApplication {
  constructor(private readonly writer: NarrativeWriter) {}

  /** Edit, approve, reject, or pin under player authority and the reviewed story revision. */
  review(scope: CommandScope, input: RetentionReviewInput): NarrativeCommit {
    const update = retentionReviewSchema.parse(input)
    return this.writer.execute({ ...scope, kind: 'retention.review', input: json(update) }, (snapshot) => {
      if (scope.principal.kind !== 'player') throw new RoleplayError('invalid', 'Only the player may review context retention')
      if (update.owner !== 'director') personOf(snapshot, update.owner.slice('actor:'.length))
      const state = indexedRetention(snapshot, update.owner)
      const viewer = update.owner
      const next = update.operation === 'correct' ? correctContextNote(state, viewer, scope.id, update.id, update.revision, update.content)
        : update.operation === 'policy' ? { ...state, activation: update.activation, revision: state.revision + 1 }
          : update.operation === 'edit' ? editContextProposal(state, update.id, update.revision, update.unit)
            : update.operation === 'review' ? reviewContextProposals(state, update.reviews)
              : update.operation === 'revoke' ? revokeContextNote(state, update.id, update.revision, viewer)
                : pinContextSource(state, update.sourceId, viewer, update.pinned)
      return { events: [replace('retention', update.owner, next)], result: { retentionRevision: next.revision } }
    })
  }

  /** A fenced director may propose only summaries of objective records and accepted behavior. */
  propose(scope: CommandScope, units: readonly ContextUpdateUnit[]): NarrativeCommit {
    return this.writer.execute({ ...scope, kind: 'retention.propose', input: json(units) }, (snapshot) => {
      if (scope.principal.kind !== 'director') throw new RoleplayError('invalid', 'Director proposals require director authority')
      const next = proposeContextUpdate(indexedRetention(snapshot, 'director'), 'director', `${scope.principal.attempt}:r${snapshot.instance.revision + 1}`, scope.principal.attempt, units)
      return { events: [replace('retention', 'director', next)], result: { retentionRevision: next.revision } }
    })
  }
}

/** Explicit perspective queries filter before search, ordering, pagination, and text budgeting. */
export class RetentionQueries {
  constructor(private readonly reader: NarrativeReader, private readonly pageLimit: number, private readonly characters: number) {
    if (![pageLimit, characters].every(value => Number.isSafeInteger(value) && value > 0)) throw new RoleplayError('invalid', 'Recall budgets must be positive integers')
  }

  /** Author review is independent of actor provisioning and can inspect an exact historical revision. */
  review(instanceId: InstanceId, owner: string, revision?: number): RetentionReviewView {
    const snapshot = revision === undefined ? this.reader.snapshot(instanceId) : this.reader.replay(instanceId, revision)
    if (owner !== 'director') personOf(snapshot, owner.slice('actor:'.length))
    return { instanceId, owner, revision: snapshot.instance.revision, retention: indexedRetention(snapshot, owner) }
  }

  /** The caller supplies a host-authenticated owner; model arguments can only search and page. */
  recall(instanceId: InstanceId, owner: string, input: NarrativeRecallInput, revision?: number): NarrativeRecallView {
    const query = narrativeRecallSchema.parse(input)
    if (query.limit > this.pageLimit) throw new RoleplayError('invalid', 'Recall pagination exceeds its configured bounds')
    const snapshot = revision === undefined ? this.reader.snapshot(instanceId) : this.reader.replay(instanceId, revision)
    const words = query.query.toLowerCase().split(/\s+/u).filter(Boolean)
    const originals = new Map(narrativeOriginals(snapshot, owner).map(item => [item.id, item]))
    const notes = narrativeNotes(snapshot, owner).map(note => ({
      id: `retention:${note.id}:r${note.revision}`, kind: note.episode === undefined ? 'context-summary' : 'episode-summary',
      revision: note.revision, revisionScope: 'record' as const, order: 0,
      text: JSON.stringify({ ...note, sourceRevisionRange: sourceRevisionRange(note.sourceIds, originals) }),
    }))
    const noteOrder = new Map(notes.map((note, index) => [note.id, index]))
    const reference = query.query.trim()
    const selected = [...originals.values(), ...notes]
      .filter(item => words.every(word => item.text.toLowerCase().includes(word) || item.id.toLowerCase().includes(word)))
      .sort((a, b) => Number(b.id === reference) - Number(a.id === reference)
        || Number(noteOrder.has(b.id)) - Number(noteOrder.has(a.id))
        || (noteOrder.get(b.id) ?? -1) - (noteOrder.get(a.id) ?? -1)
        || Number(a.revisionScope === 'record') - Number(b.revisionScope === 'record')
        || (a.revisionScope === 'record' ? compareRecordKeys(a.id, b.id) : compareOriginals(b, a)))
    const entries: NarrativeRecallView['entries'][number][] = []
    let available = this.characters
    let continuation: NarrativeRecallView['continuation']
    const first = selected[query.offset]
    if (query.sourceId !== undefined && first?.id !== query.sourceId) throw new RoleplayError('conflict', 'Recall page changed; repeat the query at its original revision')
    for (const item of selected.slice(query.offset, query.offset + query.limit)) {
      if (available === 0) break
      const characterOffset = entries.length === 0 ? query.characterOffset ?? 0 : 0
      if (characterOffset > item.text.length) throw new RoleplayError('invalid', 'Recall character offset exceeds the original')
      const text = item.text.slice(characterOffset, characterOffset + available)
      const truncated = characterOffset + text.length < item.text.length
      entries.push({ ...item, text, truncated, characterOffset })
      available -= text.length
      if (truncated) {
        continuation = { offset: query.offset + entries.length - 1, sourceId: item.id, characterOffset: characterOffset + text.length }
        break
      }
    }
    const next = query.offset + entries.length
    return { revision: snapshot.instance.revision, entries, total: selected.length,
      nextOffset: continuation?.offset ?? (next < selected.length ? next : null),
      ...(continuation === undefined ? {} : { continuation }) }
  }
}
