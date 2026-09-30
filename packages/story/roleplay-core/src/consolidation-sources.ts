/** Render admitted memory sources without JSON-encoding their text a second time. */
import type { NarrativeOriginal } from './retention-records.ts'
import type { RenderedContextSection } from './context-recipe.ts'

/** Preserve unresolved host feedback for assigned attempts without importing other events.
 * @param assigned - Frozen owner-visible batch originals.
 * @param pending - Pending attempts already visible to this owner at the same revision.
 * @returns A status-only section for the intersection; absence never asserts success.
 */
export function consolidationPendingAttempts(assigned: readonly NarrativeOriginal[],
  pending: readonly { readonly id: string }[]): RenderedContextSection[] {
  const pendingIds = new Set(pending.map(item => item.id))
  const sources = assigned.filter(item => item.kind === 'action-attempt' && pendingIds.has(item.id)).map(item => item.id)
  return sources.length === 0 ? [] : [{ id: 'consolidation-pending', role: 'user', sources,
    content: '[ASSIGNED ATTEMPTS STILL AWAITING WORLD FEEDBACK]\n'
      + JSON.stringify({ sourceIds: sources })
      + '\nThese attempts have no accepted result at this request revision. Remember the attempt or intention, not a completed outcome. This status does not mean failure. Absence from this list does not establish success; use the received result when available.' }]
}

/**
 * Keep reference metadata separate from verbatim original text.
 * @param sources Frozen owner-visible sources in their supplied order, with execution-local aliases.
 * @param pendingSourceIds Assigned attempts still awaiting feedback at this request revision.
 * @returns One metadata header and fenced original per source; text and reference values are unchanged.
 */
export function renderConsolidationSources(sources: readonly (NarrativeOriginal & { readonly sourceRef?: string | undefined })[],
  pendingSourceIds: readonly string[] = []): string {
  const pending = new Set(pendingSourceIds)
  return sources.map(({ text, ...reference }) => {
    let fenceLength = 3
    for (const match of text.matchAll(/`+/gu)) fenceLength = Math.max(fenceLength, match[0].length + 1)
    const fence = '`'.repeat(fenceLength)
    const metadata = reference.kind === 'action-attempt' && pending.has(reference.id)
      ? { ...reference, resultStatus: 'awaiting-world-feedback' } : reference
    return `${JSON.stringify(metadata)}\n${fence}\n${text}\n${fence}`
  }).join('\n\n')
}

/**
 * Expose the next later original as a recall pointer, without exposing its text or processing it.
 * @param assigned Originals assigned to this private batch.
 * @param available Owner-admitted event originals at the frozen request revision, using story revisions and event order.
 * @returns An optional source-window section; personal record versions must not be compared as story revisions.
 */
export function consolidationWindow(assigned: readonly NarrativeOriginal[],
  available: readonly NarrativeOriginal[]): RenderedContextSection[] {
  const compare = (left: NarrativeOriginal, right: NarrativeOriginal) =>
    left.revision - right.revision || (left.order ?? 0) - (right.order ?? 0)
  if (assigned.some(source => source.revisionScope === 'record')) return []
  const last = [...assigned].sort(compare).at(-1)
  if (last === undefined) return []
  const later = available.filter(source => source.revisionScope !== 'record' && compare(source, last) > 0).sort(compare)
  const next = later[0]
  if (next === undefined) return []
  const { id, kind, revision, order } = next
  return [{ id: 'consolidation-window', role: 'user', sources: [id],
    content: '[LATER RECORDS AVAILABLE FOR RECALL]\n'
      + JSON.stringify({ batchThrough: { revision: last.revision, order: last.order }, laterOriginalCount: later.length,
        nextOriginal: { id, kind, revision, order } })
      + '\nThis batch is earlier than other records you can recall. Before treating an old question or obligation as still open, check later evidence when needed. Put nextOriginal.id in the recall query to start reading after this batch. This pointer is not evidence of an outcome. Keep processed unit.sourceIds unchanged; cite any recalled supporting original only in the note change sourceIds.' }]
}
