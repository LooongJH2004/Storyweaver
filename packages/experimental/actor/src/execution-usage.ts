/** Combine native accounting across technical sessions without averaging averages. */
import { deriveSessionStats } from '@deepseek-ai/dsh-session-stats'
import { deriveSessionTokenUsage } from '@deepseek-ai/dsh-token-meter'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ExecutionUsageTotals } from '@deepseek-ai/dsh-roleplay-core/types'

/** @param logs - Authorized native logs; duplicate exported copies share a session identity.
 * @returns Whole-story sums, preserving timing denominators and disjoint billing buckets.
 */
export function sumExecutionUsage(logs: readonly { id: string; events: readonly SessionEvent[] }[]): ExecutionUsageTotals {
  const unique = new Map<string, readonly SessionEvent[]>()
  for (const log of logs) if (log.events.length >= (unique.get(log.id)?.length ?? 0)) unique.set(log.id, log.events)
  const stats = deriveSessionStats([]), usage = deriveSessionTokenUsage([])
  for (const events of unique.values()) {
    const timing = deriveSessionStats(events), tokens = deriveSessionTokenUsage(events)
    for (const key of Object.keys(stats) as Array<keyof typeof stats>) stats[key] += timing[key]
    for (const key of Object.keys(usage) as Array<keyof typeof usage>) usage[key] += tokens[key]
  }
  return { stats, usage }
}
