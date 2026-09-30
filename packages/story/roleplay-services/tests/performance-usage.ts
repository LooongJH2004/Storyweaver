/** Attribute native evaluation costs using the recorded execution context, never model prose. */
import type {} from '@deepseek-ai/dsh-experimental-actor/types'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { sumExecutionUsage } from '@deepseek-ai/dsh-experimental-actor/src/execution-usage.ts'

/** Split accepted and failed request costs without counting duplicate exported sessions.
 * @param logs - Authorized complete execution logs for one evaluation instance.
 * @returns Native totals per execution purpose, including unclassified calls.
 */
export function performanceUsage(logs: readonly { id: string; events: readonly SessionEvent[] }[]) {
  const unique = new Map<string, readonly SessionEvent[]>()
  for (const log of logs) if (log.events.length >= (unique.get(log.id)?.length ?? 0)) unique.set(log.id, log.events)
  const groups = { actor: new Map<string, SessionEvent[]>(), director: new Map<string, SessionEvent[]>(),
    consolidation: new Map<string, SessionEvent[]>(), unclassified: new Map<string, SessionEvent[]>() }
  for (const [id, events] of unique) {
    let purpose: keyof typeof groups = 'unclassified'
    for (const event of events) {
      if (event.type === 'roleplay/execution-request') purpose = event.data.context.sections.some(section => section.id === 'consolidation')
        ? 'consolidation' : 'actorId' in event.data.context ? 'actor' : 'director'
      const group = groups[purpose]
      if (!group.has(id)) group.set(id, [])
      group.get(id)!.push(event)
    }
  }
  const sum = (group: Map<string, SessionEvent[]>) => sumExecutionUsage([...group].map(([id, events]) => ({ id, events })))
  return { actor: sum(groups.actor), director: sum(groups.director), consolidation: sum(groups.consolidation),
    unclassified: sum(groups.unclassified) }
}

/** Attribute each execution, including failed calls, to its actual owner and assigned memory batch.
 * @param logs - Authorized complete execution logs for one evaluation instance.
 * @returns Per-execution native usage; unassigned pre-request events remain visible.
 */
export function performanceExecutions(logs: readonly { id: string; events: readonly SessionEvent[] }[]) {
  const unique = new Map<string, readonly SessionEvent[]>()
  for (const log of logs) if (log.events.length >= (unique.get(log.id)?.length ?? 0)) unique.set(log.id, log.events)
  return [...unique].flatMap(([id, events]) => {
    const segments: {
      attempt: string | null
      owner: string | null
      revision: number | null
      purpose: string
      assignedSources: number
      events: SessionEvent[]
    }[] = []
    for (const event of events) {
      if (event.type === 'roleplay/execution-request') {
        const { context, attempt } = event.data
        const batch = context.sections.find(section => section.id === 'consolidation')
        segments.push({ attempt, owner: 'actorId' in context ? `actor:${context.actorId}` : 'director', revision: context.revision,
          purpose: batch === undefined ? 'actorId' in context ? 'actor' : 'director' : 'consolidation',
          assignedSources: batch?.sources.length ?? 0, events: [] })
      }
      if (segments.length === 0) segments.push({ attempt: null, owner: null, revision: null,
        purpose: 'unclassified', assignedSources: 0, events: [] })
      segments.at(-1)!.events.push(event)
    }
    return segments.map(({ events, ...execution }) => ({ sessionId: id, ...execution,
      ...sumExecutionUsage([{ id, events }]) }))
  })
}
