/** Historical request indexing preserves retries, preparations, and narrative perspective ownership. */
import { expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createMessage } from '@deepseek-ai/dsh-llm'
import type { InstanceId, ActorContextView } from '@deepseek-ai/dsh-roleplay-core/types'
import { indexExecutionRequests } from '../src/execution-request-index.ts'

it('distinguishes prepared requests, streamed replies, retries, and later narrative revisions', () => {
  const instanceId = 'A' as InstanceId
  const context: ActorContextView = { instanceId, actorId: 'a', revision: 2, configurationRevision: 1,
    templateVersionId: 'v1', text: 'Private context', sources: [], sections: [] }
  const session = Session.create(SessionId('requests'))
  session.append('roleplay/execution-request', { attempt: 'first', context })
  session.append('step/start', { turn: 1, step: 1 })
  const prepared = session.append('request/header', { header: { config: { provider: 'mock', model: 'mock' } }, reason: 'initial' })
  const scope = { instanceId, actorId: 'a', revision: 2 }
  expect(indexExecutionRequests(session.events, scope)[0]?.summary.status).toBe('prepared')
  session.append('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'finish', reason: { kind: 'stop' } } })
  const retry = session.append('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'finish', reason: { kind: 'stop' } } })
  session.append('step/start', { turn: 1, step: 2 })
  const secondStep = session.append('assistant/chunk', { turn: 1, step: 2, chunk: { type: 'finish', reason: { kind: 'stop' } } })
  const indexed = indexExecutionRequests(session.events, scope)
  expect(indexed.map(entry => entry.summary.requestId)).toEqual([secondStep.seq, retry.seq, prepared.seq])
  expect(indexed.every(entry => entry.summary.status === 'response-recorded')).toBe(true)
  expect(indexExecutionRequests(session.events, { ...scope, actorId: 'b' })).toEqual([])
  expect(indexExecutionRequests(session.events, { ...scope, instanceId: 'B' as InstanceId })).toEqual([])
  expect(indexExecutionRequests(session.events, { ...scope, revision: 1 })).toEqual([])
  session.append('roleplay/execution-request', { attempt: 'later', context: { ...context, revision: 4 } })
  session.append('step/start', { turn: 2, step: 1 })
  session.append('request/header', { header: { config: { provider: 'mock', model: 'next' } }, reason: 'series' })
  expect(indexExecutionRequests(session.events, scope)).toEqual(indexed)
  expect(indexExecutionRequests(session.events, { ...scope, revision: 4 })[0]?.summary).toMatchObject({ attempt: 'later', status: 'prepared', model: 'next' })
})

it('uses native complete-turn accounting for every tool step without counting usage samples twice', () => {
  const instanceId = 'usage' as InstanceId
  const session = Session.create(SessionId('usage'))
  const context: ActorContextView = { instanceId, actorId: 'a', revision: 2, configurationRevision: 1,
    templateVersionId: 'v1', text: '', sources: [], sections: [] }
  session.append('roleplay/execution-request', { attempt: 'one-turn', context })
  session.append('turn/start', { turn: 1 })
  for (const step of [1, 2]) {
    session.append('step/start', { turn: 1, step })
    session.append('request/header', { header: { config: { provider: 'mock', model: 'mock' } }, reason: 'initial' })
    session.append('assistant/chunk', { turn: 1, step, chunk: { type: 'text-delta', index: 0, text: 'answer' } })
    const usage = { inputTokens: 10, cacheReadTokens: 50, outputTokens: 5, reasoningTokens: 3, totalTokens: 65 }
    session.append('assistant/chunk', { turn: 1, step, chunk: { type: 'usage', usage } })
    session.append('assistant/chunk', { turn: 1, step, chunk: { type: 'finish', reason: { kind: 'stop' } } })
    session.append('assistant/message', { turn: 1, step, usage, message: createMessage({
      role: 'assistant', content: [], source: { kind: 'model', provider: 'mock', model: 'mock' },
    }) }, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step })
  }
  const scope = { instanceId, revision: 2, actorId: 'a' }
  expect(indexExecutionRequests(session.events, scope)[0]?.summary.turnUsage).toBeUndefined()
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const requests = indexExecutionRequests(session.events, scope)
  expect(requests).toHaveLength(2)
  for (const entry of requests) expect(entry.summary).toMatchObject({ turnRequestCount: 2,
    turnUsage: { uncachedInputTokens: 20, cacheReadTokens: 100, outputTokens: 10, reasoningTokens: 6, totalTokens: 130 } })
  const timed = session.events.map((event) => {
    const step = 'step' in event.data ? event.data.step : 0
    const offset = event.type === 'assistant/chunk' ? 100 : event.type === 'assistant/message' ? 600 : 0
    return { ...event, time: step * 1000 + offset }
  })
  expect(indexExecutionRequests(timed, scope).every(entry => entry.summary.turnTiming?.ttftMs === 100
    && entry.summary.turnTiming.tokensPerSecond === 10)).toBe(true)
})
