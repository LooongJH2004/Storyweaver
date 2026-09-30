/** Only the Harness adapter interprets request headers and response chunk boundaries. */
import type {} from './types.ts'
import { deriveTurnTokenUsage } from '@deepseek-ai/dsh-token-meter/client'
import { deriveTurnPerformance } from '@deepseek-ai/dsh-session-stats'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ExecutionHistoryScope, ExecutionRequestSummary } from '@deepseek-ai/dsh-roleplay-core/types'

/** Adapter coordinates are never accepted directly from a browser as Session identities. */
export interface IndexedExecutionRequest {
  readonly summary: ExecutionRequestSummary
  readonly beforeEventSeq: number
}

/**
 * Index recorded preparations and responses, including multiple provider attempts in one step.
 * @param events - complete execution log, including superseded turns.
 * @param scope - authorized instance, person, and latest allowed narrative revision.
 * @returns newest preparations first, with stable coordinates for later inspection.
 */
export function indexExecutionRequests(events: readonly SessionEvent[], scope: ExecutionHistoryScope): IndexedExecutionRequest[] {
  const result: IndexedExecutionRequest[] = []
  let execution: Extract<SessionEvent, { type: 'roleplay/execution-request' }>['data'] | undefined
  let header: Extract<SessionEvent, { type: 'request/header' }>['data']['header'] | undefined
  let step: { turn: number; step: number } | undefined
  let pending: number | undefined
  let streaming = false
  const append = (requestId: number, beforeEventSeq: number, status: ExecutionRequestSummary['status']): number | undefined => {
    if (execution === undefined || header === undefined || step === undefined) return undefined
    const context = execution.context
    if (context.instanceId !== scope.instanceId || context.revision > scope.revision
      || ('actorId' in context ? context.actorId !== scope.actorId : scope.actorId !== undefined)) return undefined
    result.push({ beforeEventSeq, summary: { requestId, ...step, status, attempt: execution.attempt,
      revision: context.revision, configurationRevision: context.configurationRevision,
      provider: header.config.provider, model: header.config.model } })
    return result.length - 1
  }
  for (const event of events) {
    if (event.type === 'roleplay/execution-request') {
      execution = event.data; pending = undefined; streaming = false
    } else if (event.type === 'step/start') {
      step = event.data; pending = undefined; streaming = false
    } else if (event.type === 'request/header') {
      header = event.data.header; pending = append(event.seq, event.seq + 1, 'prepared'); streaming = false
    } else if (event.type === 'assistant/chunk') {
      if (!streaming) {
        const entry = pending === undefined ? undefined : result[pending]
        if (entry === undefined || pending === undefined) append(event.seq, event.seq, 'response-recorded')
        else result[pending] = { ...entry, summary: { ...entry.summary, status: 'response-recorded' } }
        pending = undefined
      }
      streaming = event.data.chunk.type !== 'finish'
    }
  }
  const turns = new Map<number, ReturnType<typeof deriveTurnTokenUsage>>()
  let start = 0
  for (const [index, event] of events.entries()) {
    if (event.type === 'turn/start') start = index
    if (event.type === 'turn/end') turns.set(event.data.turn, deriveTurnTokenUsage(events.slice(start, index + 1)))
  }
  const counts = new Map<number, number>()
  const timing = deriveTurnPerformance(events)
  for (const entry of result) counts.set(entry.summary.turn, (counts.get(entry.summary.turn) ?? 0) + 1)
  return result.reverse().map((entry) => {
    const usage = turns.get(entry.summary.turn)
    const turnTiming = timing.get(entry.summary.turn)
    return { ...entry, summary: { ...entry.summary, turnRequestCount: counts.get(entry.summary.turn) ?? 0,
      ...(usage === undefined ? {} : { turnUsage: usage }),
      ...(turnTiming === undefined ? {} : { turnTiming }) } }
  })
}
