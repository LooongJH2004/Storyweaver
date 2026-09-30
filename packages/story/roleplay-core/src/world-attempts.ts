/** Pending action results are derived from immutable behavior and settlement records. */
import { factSchema, publishedBehaviorSchema } from './world.ts'
import type { NarrativeSnapshot } from './types.ts'

/**
 * Find explicitly requested world feedback without exposing it to other characters.
 * @param snapshot - One frozen instance revision.
 * @returns original attempts not linked to an accepted settlement.
 */
export function pendingWorldAttempts(snapshot: NarrativeSnapshot) {
  const settled = new Set(snapshot.entities.filter(item => item.key.collection === 'facts')
    .flatMap(item => factSchema.parse(item.value).settles ?? []))
  return snapshot.entities.filter(item => item.key.collection === 'behavior')
    .map(item => publishedBehaviorSchema.parse(item.value))
    .filter(item => item.behavior.kind === 'action' && item.behavior.awaitResult === true && !settled.has(item.id))
    .sort((a, b) => a.revision - b.revision || a.order - b.order)
}
