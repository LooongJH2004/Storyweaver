/** Read the native whole-log projection without mounting a Session or Agent. */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { sessionStatsProjectionDefinition as definition } from './projection.ts'
import type { SessionStatsProjection } from './types.ts'

/** @param events - Complete durable log, including retries and superseded turns.
 * @returns Native counts and timing totals with their original sample denominators.
 */
export function deriveSessionStats(events: readonly SessionEvent[]): SessionStatsProjection {
  let state: Parameters<typeof definition.apply>[0] = definition.init()
  for (const event of events) state = definition.apply(state, event)
  return definition.wire.view(state)
}
