/** Native billing totals for read-only consumers of complete historical logs. */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { tokenUsageProjectionDefinition as definition } from './usage-projection.ts'
import type { TokenUsageProjection } from './projection.ts'

/** @param events - Complete durable log; intermediate and assembled usage share the native replacement semantics.
 * @returns Disjoint input buckets and total output; reasoning is already part of output.
 */
export function deriveSessionTokenUsage(events: readonly SessionEvent[]): TokenUsageProjection {
  let state: Parameters<typeof definition.apply>[0] = definition.init()
  for (const event of events) state = definition.apply(state, event)
  return definition.wire.view(state)
}
