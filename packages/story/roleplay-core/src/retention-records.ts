/** Narrative originals and retained notes are scoped without parsing execution logs. */
import { activeContextNotes, contextSourceCanArchive, emptyContextRetention, indexContextSources, storyContextRetentionSchema,
  type ContextSource, type StoryContextRetention } from './context-retention.ts'
import { castOf, knowledgeOf, stateOf, lifecycleFor, lifecycleRecordsFor, lifecycleSourceRef,
  publishedBehaviorSchema, factSchema, personOf, playerDirectionSchema, narrationSchema } from './world.ts'
import { projectIdentityReferences } from './characters.ts'
import { perceivedEvidenceFor } from './perceived-evidence.ts'
import { entity, compareRecordKeys } from './records.ts'
import { z } from 'zod'
import type { NarrativeSnapshot } from './types.ts'

/** Retention owners distinguish a director from an actor whose identity is literally director. */
export const retentionOwnerSchema = z.string().regex(/^(director|actor:.+)$/u)
/** Originals retain source identity; personal record versions do not imply story chronology. */
export interface NarrativeOriginal {
  readonly id: string
  readonly kind: string
  readonly revision: number
  readonly revisionScope?: 'record'
  readonly order?: number
  readonly text: string
}

/** Order story events chronologically, then undated personal records by stable identity.
 * @param left - First original.
 * @param right - Second original.
 * @returns Ascending order without comparing versions of independent personal records.
 */
export function compareOriginals(left: NarrativeOriginal, right: NarrativeOriginal): number {
  return Number(left.revisionScope === 'record') - Number(right.revisionScope === 'record')
    || (left.revisionScope === 'record' ? 0 : left.revision - right.revision || (left.order ?? 0) - (right.order ?? 0))
    || compareRecordKeys(left.id, right.id)
}

/** Preserve evidence ordering separately from the version of a retained note.
 * @param sourceIds - Nonempty sources of an owner-visible note.
 * @param originals - Original records admitted for that same owner and snapshot.
 * @returns Inclusive story revision range, or null for undated sources.
 * Missing sources violate the projection invariant.
 */
export function sourceRevisionRange(sourceIds: readonly string[], originals: ReadonlyMap<string, NarrativeOriginal>) {
  const revisions = sourceIds.map((id) => {
    const original = originals.get(id)
    if (original === undefined) throw new Error('Visible retained note has an unavailable source')
    return original.revisionScope === 'record' ? null : original.revision
  })
  if (revisions.some(revision => revision === null)) return null
  const known = revisions.filter(revision => revision !== null)
  return { from: Math.min(...known), to: Math.max(...known) }
}
/** An absent retention record has no notes; it never falls back to a storybook memory. */
export function retentionOf(snapshot: NarrativeSnapshot, owner: string): StoryContextRetention {
  retentionOwnerSchema.parse(owner)
  const stored = entity(snapshot, { collection: 'retention', id: owner })
  return stored === undefined ? emptyContextRetention() : storyContextRetentionSchema.parse(stored)
}
/** Enumerate only the selected perspective's originals before any search, ranking or pagination. */
export function narrativeOriginals(snapshot: NarrativeSnapshot, owner: string, includeForgotten = false): NarrativeOriginal[] {
  retentionOwnerSchema.parse(owner)
  const entries: NarrativeOriginal[] = []
  if (owner === 'director') {
    for (const item of snapshot.entities) {
      if (item.key.collection === 'player-input') {
        const direction = playerDirectionSchema.parse(item.value)
        entries.push({ id: `player-input:${direction.id}`, kind: 'player-direction', revision: direction.revision, text: direction.text })
      }
      if (item.key.collection === 'narration') {
        const narration = narrationSchema.parse(item.value)
        for (const [viewer, text] of Object.entries(narration.texts)) entries.push({ id: `narration:${narration.id}:${viewer}`,
          kind: 'published-narration', revision: narration.revision, text })
      }
      if (item.key.collection === 'facts') {
        const fact = factSchema.parse(item.value)
        entries.push({ id: item.key.id, kind: 'settled-fact', revision: fact.revision,
          text: (fact.settles?.length ?? 0) === 0 ? fact.content : JSON.stringify({ content: fact.content, settles: fact.settles }) })
      }
      if (item.key.collection === 'behavior') {
        const behavior = publishedBehaviorSchema.parse(item.value)
        const content = behavior.behavior.kind === 'speech'
          ? { kind: 'speech', text: behavior.behavior.text, delivery: behavior.behavior.delivery, addressedTo: behavior.targets }
          : { kind: 'action-attempt', attempt: behavior.behavior.attempt, targets: behavior.targets }
        entries.push({ id: behavior.id, kind: behavior.behavior.kind === 'speech' ? 'claim' : 'action-attempt',
          revision: behavior.revision, order: behavior.order,
          text: JSON.stringify({ actorId: behavior.actorId, origin: behavior.origin, sceneId: behavior.sceneId, ...content }) })
      }
    }
  } else {
    const actorId = owner.slice('actor:'.length)
    personOf(snapshot, actorId)
    for (const item of perceivedEvidenceFor(snapshot, actorId)) {
      entries.push({ id: item.id, kind: item.behavior?.kind === 'action' ? 'action-attempt' : item.kind,
        revision: item.revision, order: item.order,
        text: item.behavior === undefined && (item.respondsTo?.length ?? 0) === 0 ? item.content : JSON.stringify(item) })
    }
    const knowledge = knowledgeOf(snapshot, actorId)
    const forgottenKnowledge = new Set(knowledge.entries.filter(item => item.status === 'forgotten').map(item => item.id))
    for (const item of knowledge.history.filter(item => includeForgotten || !forgottenKnowledge.has(item.id))) entries.push({ id: `knowledge:${item.id}:r${item.revision}`,
      kind: 'personal-judgment', revision: item.revision, revisionScope: 'record', text: item.text })
    for (const item of stateOf(snapshot, actorId).history) entries.push({ id: `state:${item.definition.id}:r${item.revision}`,
      kind: 'personal-state', revision: item.revision, revisionScope: 'record',
      text: `${item.definition.name}: ${JSON.stringify(item.value)} — ${item.reason}` })
    const lifecycle = lifecycleFor(snapshot, actorId)
    const forgotten = new Set([...lifecycle.memories.values()].filter(item => item.status === 'forgotten').map(item => item.record.id))
    for (const item of lifecycleRecordsFor(snapshot, actorId)) {
      if (item.change.type === 'memory.forgotten'
        || !includeForgotten && item.change.type === 'memory.recorded' && forgotten.has(item.change.data.memory.id)) continue
      entries.push({ id: lifecycleSourceRef(item.change), kind: item.change.type, revision: item.revision,
        text: JSON.stringify(projectIdentityReferences(item.change.data, castOf(snapshot), actorId, id => id)) })
    }
  }
  return [...new Map(entries.map(item => [item.id, item])).values()]
    .sort(compareOriginals)
}
/** Index immutable original identities at proposal time, preserving the existing source order. */
export function indexedRetention(snapshot: NarrativeSnapshot, owner: string): StoryContextRetention {
  const sources: ContextSource[] = narrativeOriginals(snapshot, owner).map(item => ({ id: item.id, sceneId: 'narrative',
    kind: item.kind, scopes: [owner], order: 0, locator: { kind: 'world', eventId: item.id } }))
  return indexContextSources(retentionOf(snapshot, owner), sources)
}
/** Explicit forgetting prevents approved summaries from resurrecting an unavailable source. */
export function narrativeNotes(snapshot: NarrativeSnapshot, owner: string) {
  const available = new Set(narrativeOriginals(snapshot, owner).map(item => item.id))
  return activeContextNotes(retentionOf(snapshot, owner), owner)
    .filter(note => note.sourceIds.every(id => available.has(id)))
}

/** Render approved briefs and complete pins; recall retains note provenance and episode details. */
export function appendRetention(snapshot: NarrativeSnapshot, owner: string,
  add: (label: string, value: unknown, source: string) => boolean): ReadonlySet<string> {
  const retention = retentionOf(snapshot, owner)
  const originals = new Map(narrativeOriginals(snapshot, owner).map(item => [item.id, item]))
  if (retention.activation === 'automatic') add('MEMORY ACTIVATION POLICY',
    'Your new valid context_update units take effect automatically. Existing pending proposals still await player review. Preserve subjective interpretation and source coverage; the player can inspect or disable effective notes.', 'retention:policy')
  for (const pin of retention.pins) {
    const original = originals.get(pin.sourceId)
    if (original !== undefined) add('PINNED ORIGINAL', original, original.id)
  }
  const included = new Set<string>()
  const notes = narrativeNotes(snapshot, owner)
  if (notes.length > 0) add('USING RETAINED NOTES',
    'These notes preserve earlier understanding at their recorded source revisions. Active means retained, not proof that every described condition or obligation still applies. Use later received evidence to distinguish current duties from completed promises and expired contingencies. Keep past terms as history; do not renew them merely by recalling them. An attempt alone does not establish completion, and a new agreement requires new evidence. Before revising or resolving a note with a detailReference, recall its details unless already present. Update the episode together with the brief when new evidence answers a stored question or changes an interpretation. A nonzero unresolvedCount means questions remain stored in those details; setting status=resolved does not remove them. Preserve the past experience, revise the current interpretation, and submit the complete episode with answered questions removed from unresolved.', 'retention:guidance')
  for (const note of notes) {
    const reference = `retention:${note.id}:r${note.revision}`
    const { id, revision, kind, status, text, episode } = note
    const content = { id, revision, kind, status, text, sourceRevisionRange: sourceRevisionRange(note.sourceIds, originals),
      ...(episode === undefined ? {} : { topic: episode.topic, unresolvedCount: episode.unresolved.length, detailReference: reference }) }
    const automatic = retention.proposals.findLast(proposal => proposal.status === 'approved'
      && proposal.retainedNoteIds.includes(note.id))?.activation === 'automatic'
    if (add(automatic ? 'AUTOMATIC CONTEXT NOTE — preserves its original epistemic kind'
      : 'PLAYER-APPROVED CONTEXT NOTE — preserves its original epistemic kind', content, reference)) included.add(note.id)
  }
  // A disabled retention section cannot hide originals behind an absent replacement note.
  return new Set(retention.sources.filter(source => contextSourceCanArchive(retention, source.id, owner)
    && retention.proposals.some(proposal => proposal.status === 'approved' && proposal.unit.sourceIds.includes(source.id)
      && (proposal.unit.disposition === 'archive' || proposal.retainedNoteIds.every(id => included.has(id)))))
    .map(source => source.id))
}
