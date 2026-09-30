/** Memory contexts retain one frozen perspective without performance instructions. */
import { consolidationBackground } from './consolidation-context.ts'
import { consolidationSourceAliases } from './context-retention.ts'
import { renderConsolidationSources, consolidationWindow, consolidationPendingAttempts } from './consolidation-sources.ts'
import { narrativeOriginals } from './retention-records.ts'
import { pendingWorldAttempts } from './world-attempts.ts'
import type { ActorContextView, DirectorContextView, NarrativeSnapshot } from './types.ts'
import type { MemoryJob } from './memory-queue.ts'

export function memoryContext(context: ActorContextView | DirectorContextView, job: MemoryJob, snapshot: NarrativeSnapshot): {
  context: ActorContextView | DirectorContextView
  aliases: Readonly<Record<string, string>>
} {
  const aliases = consolidationSourceAliases(job.sourceIds)
  const available = narrativeOriginals(snapshot, job.owner)
  const originals = available.filter(item => job.sourceIds.includes(item.id)).map(item => ({ ...item,
    sourceRef: Object.entries(aliases).find(([, id]) => id === item.id)?.[0] }))
  const pending = consolidationPendingAttempts(originals, pendingWorldAttempts(snapshot)
    .filter(item => job.owner === 'director' || item.actorId === job.owner.slice(6)))
  const content = `[BACKGROUND MEMORY CONSOLIDATION]
This private job does not advance the story. Call memory_submit with context_update covering every assigned source exactly once. Group related evidence into lasting understanding rather than one note per line. Actors retain their own experience, interpretation, impact and unresolved questions. Directors retain established situations, attributed commitments and unresolved consequences, not private actor knowledge. Keep a concise takeaway in text and supporting experience in episode details. Preserve who acted: witnessing something does not mean you performed it. A claim is not proof; an attempted action is not a completed result. Preserve uncertainty, negation, quantities and deadlines relative to the original event. Recall existing detailReference before revising an episode; update the complete episode and remove answered questions from unresolved. Do not invent dates or hidden facts. The snapshot is frozen: later fiction may have advanced while you work. Source aliases apply only to unit/change sourceIds; use original IDs for recall. Additional admitted recalled evidence may support a note change, but unit.sourceIds must cover only the assigned batch. Submit the batch once, then stop.
${renderConsolidationSources(originals, pending.flatMap(section => section.sources))}`
  const sections = [...consolidationBackground(context.sections),
    { id: 'consolidation', role: 'user' as const, content, sources: job.sourceIds }, ...pending, ...consolidationWindow(originals, available)]
  return { aliases, context: { ...context, sections, text: sections.map(section => section.content).join('\n\n'),
    sources: sections.flatMap(section => section.sources) } }
}
