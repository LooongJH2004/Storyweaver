/** Per-turn readings reuse the native sessionStats fold, including token-delta and retry semantics. */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { sessionStatsProjectionDefinition } from './projection.ts'

/** Native latency and decode throughput for one completed technical turn. */
export interface TurnPerformance {
  /** First entered step's first-token latency; absent when that step has no recorded first token. */
  readonly ttftMs?: number
  /** Sum of reported output tokens divided by summed decode seconds for the same timed steps. */
  readonly tokensPerSecond?: number
}

/**
 * Derive completed-turn performance without treating absent samples as zero or averaging step rates.
 * @param events - Complete durable execution history, including turn and step boundaries.
 * @returns Available native readings keyed by technical turn; incomplete turns are excluded.
 */
export function deriveTurnPerformance(events: readonly SessionEvent[]): Map<number, TurnPerformance> {
  const result = new Map<number, TurnPerformance>()
  let state: Parameters<typeof sessionStatsProjectionDefinition.apply>[0] = sessionStatsProjectionDefinition.init()
  let turn: number | undefined
  let firstStep: number | undefined
  let ttftMs: number | undefined
  for (const event of events) {
    if (event.type === 'turn/start') {
      turn = event.data.turn
      state = sessionStatsProjectionDefinition.init()
      firstStep = undefined
      ttftMs = undefined
    }
    if (turn === undefined) continue
    if (event.type === 'step/start' && firstStep === undefined) firstStep = event.data.step
    const previous = state
    state = sessionStatsProjectionDefinition.apply(state, event)
    if (event.type === 'assistant/message' && event.data.step === firstStep && state.ttftSteps > previous.ttftSteps) {
      ttftMs = state.ttftMs - previous.ttftMs
    }
    if (event.type === 'turn/end' && event.data.turn === turn) {
      result.set(turn, { ...(ttftMs === undefined ? {} : { ttftMs }),
        ...(state.decodeMs > 0 ? { tokensPerSecond: state.decodeTokens / (state.decodeMs / 1000) } : {}) })
      turn = undefined
    }
  }
  return result
}
