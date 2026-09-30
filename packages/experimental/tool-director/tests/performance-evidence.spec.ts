import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { performanceMetrics, performanceReview } from './performance-evidence.ts'

function event(type: string, time: number, data: object = {}): SessionEvent {
  return { type, time, seq: time, data } as SessionEvent
}

describe('performance evidence', () => {
  it('keeps separate request clocks across concurrent Actors and reports incomplete accounting', () => {
    const metrics = performanceMetrics([
      [event('step/start', 100), event('assistant/message', 150, { usage: { inputTokens: 12, outputTokens: 4 } }),
        event('tool/call', 155), event('tool/result', 160, { error: { code: 'INVALID' } }),
        event('step/start', 165)],
      [event('step/start', 110), event('assistant/message', 130), event('tool/call', 131)],
      [event('token-meter/child-turn-usage', 170, { usage: { inputTokens: 12, outputTokens: 4 } })],
    ], 200)
    expect(metrics).toEqual({
      version: 2, elapsedMs: 200, steps: 3, modelResponses: 2, stepResponseMs: [50, 20], toolCalls: 2, toolResults: 1, toolFailures: 1,
      unfinishedToolCalls: 1, toolFailureRate: 1,
      tokenAccounting: { reportedResponses: 1, complete: false, inputTokens: 12, outputTokens: 4 },
    })
  })

  it('counts subsequent model steps even when provider context and header metadata are reused', () => {
    const metrics = performanceMetrics([[
      event('step/start', 10), event('request/header', 11), event('request/context', 12),
      event('assistant/message', 20, { usage: { inputTokens: 4, outputTokens: 2 } }),
      event('step/start', 30), event('assistant/message', 45, { usage: { inputTokens: 8, outputTokens: 3 } }),
    ]], 35)
    expect(metrics).toMatchObject({ steps: 2, modelResponses: 2, stepResponseMs: [10, 15],
      tokenAccounting: { reportedResponses: 2, complete: true, inputTokens: 12, outputTokens: 5 } })
  })

  it('does not invent zero token usage or a human verdict for an unmeasured run', () => {
    expect(performanceMetrics([], 0)).toMatchObject({
      toolFailureRate: null, tokenAccounting: { complete: false, inputTokens: null, outputTokens: null },
    })
    expect(performanceReview().criteria.every(criterion => criterion.result === null)).toBe(true)
  })

  it('preserves an authoritative zero usage report as complete accounting', () => {
    expect(performanceMetrics([
      [event('step/start', 1), event('assistant/message', 2, { usage: { inputTokens: 0, outputTokens: 0 } })],
    ], 1).tokenAccounting).toEqual({ reportedResponses: 1, complete: true, inputTokens: 0, outputTokens: 0 })
  })
})
