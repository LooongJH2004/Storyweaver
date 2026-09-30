/** Actor evidence retains observable attribution without exposing behavior authors' private intent. */
import { evidenceFor, publishedBehaviorSchema, type Evidence } from './world.ts'
import { compareRecordKeys } from './records.ts'
import type { NarrativeSnapshot } from './types.ts'

/**
 * Render received events with frozen identities and their original speech or action text.
 * @param snapshot - Frozen request state containing the accepted source behavior.
 * @param actorId - Authenticated recipient, filtered before attribution.
 * @returns Model-safe content and ordering; old target identities are never inferred from later recognition.
 */
export function perceivedEvidenceFor(snapshot: NarrativeSnapshot, actorId: string) {
  const sources = new Map(snapshot.entities.filter(item => item.key.collection === 'behavior').map(item => [item.key.id, item.value]))
  return evidenceFor(snapshot, actorId).map(evidence => renderEvidence(evidence, sources.get(evidence.id)))
}

function renderEvidence(evidence: Evidence, stored: NarrativeSnapshot['entities'][number]['value'] | undefined) {
  const source = stored === undefined ? undefined : publishedBehaviorSchema.parse(stored)
  let behavior = evidence.behavior
  if (behavior === undefined && source !== undefined) {
    const ref = source.references[evidence.recipient]
    const label = ref === 'self' ? '你' : source.labels[evidence.recipient]
    if (ref !== undefined && label !== undefined) behavior = source.behavior.kind === 'speech'
      ? { kind: 'speech', speaker: { ref, label }, delivery: source.behavior.delivery }
      : { kind: 'action', actor: { ref, label } }
  }
  return { id: evidence.id, revision: evidence.revision, order: source?.order ?? evidence.order ?? 0,
    kind: evidence.kind,
    ...(behavior === undefined ? {} : { behavior }),
    content: evidence.content, personRefs: evidence.personRefs,
    ...(evidence.respondsTo === undefined ? {} : { respondsTo: evidence.respondsTo }),
    ...(source !== undefined && evidence.behavior === undefined ? { addressing: 'Not recorded in this recipient perspective.' } : {}) }
}

/**
 * Compare received events in fictional order, including behavior order within a single commit.
 * @param left - First event's publication coordinates.
 * @param right - Second event's publication coordinates.
 * @returns Negative when the first event precedes the second.
 */
export function comparePerceivedEvents(left: { revision: number; order: number; id: string },
  right: { revision: number; order: number; id: string }): number {
  return left.revision - right.revision || left.order - right.order || compareRecordKeys(left.id, right.id)
}
