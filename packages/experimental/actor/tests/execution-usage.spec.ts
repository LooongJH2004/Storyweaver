/** Native accounting keeps provider buckets, sample denominators and durable history intact. */
import { expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createMessage } from '@deepseek-ai/dsh-llm'
import { sumExecutionUsage } from '../src/execution-usage.ts'

function log(id: string, latency: number, decode: number, output: number) {
  const session = Session.create(SessionId(id))
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'Hello' } })
  const usage = { inputTokens: 20, cacheReadTokens: 70, cacheWriteTokens: 10, outputTokens: output, reasoningTokens: 2 }
  session.append('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'usage', usage } })
  session.append('assistant/message', { turn: 1, step: 1, usage, message: createMessage({ role: 'assistant', content: [],
    source: { kind: 'model', provider: 'mock', model: 'mock' } }) }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  return { id, events: session.events.map(event => ({ ...event, time: event.type === 'step/start' ? 1000
    : event.type === 'assistant/chunk' ? 1000 + latency : 1000 + latency + decode })) }
}

it('combines director and actor sessions once, replacing intermediate usage and weighting native timing', () => {
  const director = log('director', 200, 1000, 10), actor = log('actor', 800, 3000, 90)
  const result = sumExecutionUsage([director, actor, director])
  expect(result.usage).toEqual({ uncachedInputTokens: 40, cacheReadTokens: 140, cacheWriteTokens: 20, outputTokens: 100 })
  expect(result.stats).toMatchObject({ turns: 2, steps: 2, ttftMs: 1000, ttftSteps: 2, decodeMs: 4000, decodeTokens: 100 })
  expect(result.stats.decodeTokens / (result.stats.decodeMs / 1000)).toBe(25)
  expect(sumExecutionUsage([director, { ...director, events: director.events.slice(0, 2) }])).toEqual(sumExecutionUsage([director]))
})

it('does not invent timing samples or billing for a cancelled call', () => {
  const session = Session.create(SessionId('cancelled'))
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const result = sumExecutionUsage([{ id: session.id, events: session.events }])
  expect(result.stats).toMatchObject({ steps: 1, ttftSteps: 0, decodeMs: 0 })
  expect(result.usage.outputTokens).toBe(0)
})
