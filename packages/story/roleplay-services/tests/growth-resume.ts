/** Select a completed learning boundary without replaying the entire opening scenario. */
import { z } from 'zod'

const phase = z.object({ id: z.string(), instruction: z.string() })
const enteredPhase = phase.extend({
  startRevision: z.number().int().nonnegative(), endRevision: z.number().int().nonnegative(), completed: z.boolean(),
  perceptions: z.array(z.object({ actorId: z.string(), requestRevision: z.number().int().nonnegative().nullable(),
    evidence: z.array(z.object({ revision: z.number().int().nonnegative(), behavior: z.unknown().optional() }).loose()) })),
}).loose()
const reportSchema = z.object({
  scenario: z.string(), floorPolicy: z.enum(['eagerness', 'balanced']), model: z.string(), reasoningEffort: z.string(),
  memoryActivation: z.enum(['automatic', 'review']).optional(),
  bookHash: z.string(), executionSettings: z.record(z.string(), z.unknown()),
  collection: z.literal('complete'), collectionErrors: z.array(z.unknown()).length(0),
  timedOut: z.boolean(), failure: z.unknown(),
  document: z.object({ characters: z.array(z.object({ actorId: z.string() })).min(1) }).loose(),
  growthPlan: z.array(phase).min(1), growthPhases: z.array(enteredPhase),
})

/**
 * Validate report evidence and select only the next incomplete phase.
 * @param input - A completed artifact report, never a live process snapshot.
 * @returns The next phase, its restore boundary and verified earlier phases.
 */
export function planGrowthResume(input: unknown) {
  const report = reportSchema.parse(input)
  if (!report.timedOut && report.failure !== null) throw new Error('Resolve the prior non-timeout failure before continuing')
  const actors = report.document.characters.map(actor => actor.actorId)
  const completed = []
  for (const planned of report.growthPlan) {
    const entries = report.growthPhases.filter(item => item.id === planned.id)
    if (entries.length > 1) throw new Error('Ambiguous phase history')
    const entry = entries[0]
    const verified = entry?.completed === true && actors.every(actor => entry.perceptions.some(item =>
      item.actorId === actor && item.requestRevision !== null && item.requestRevision > entry.startRevision
      && item.requestRevision <= entry.endRevision && item.evidence.some(evidence =>
        evidence.behavior === undefined && evidence.revision > entry.startRevision
        && evidence.revision <= (item.requestRevision ?? -1))))
    if (verified) { completed.push(entry); continue }
    const revision = entry?.startRevision ?? completed.at(-1)?.endRevision
    if (revision === undefined) throw new Error('No recorded learning boundary to resume')
    return { report, phase: planned, revision, completed }
  }
  throw new Error('All recorded learning phases are complete')
}
