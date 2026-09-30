/** Diagnostic replies remain request-scoped and never inherit a following retry's output. */
import { expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { executionResponse } from '../src/execution-response.ts'

it('keeps incomplete reasoning and tool drafts separate from request completion and later responses', () => {
  const session = Session.create(SessionId('response'))
  const header = session.append('request/header', { header: { config: { provider: 'mock', model: 'mock' } }, reason: 'initial' })
  const chunk = (value: Parameters<typeof session.append<'assistant/chunk'>>[1]['chunk']) =>
    session.append('assistant/chunk', { turn: 1, step: 1, chunk: value })
  expect(executionResponse(session.events, header.seq).state).toBe('pending')
  chunk({ type: 'reasoning-delta', index: 0, text: 'A private hypothesis.' })
  chunk({ type: 'text-delta', index: 1, text: 'An unaccepted draft.' })
  expect(executionResponse(session.events, header.seq)).toMatchObject({ state: 'streaming',
    text: 'An unaccepted draft.', reasoning: 'A private hypothesis.' })
  chunk({ type: 'finish', reason: { kind: 'stop' } })
  const retry = chunk({ type: 'text-delta', index: 0, text: 'Another attempt.' })
  const first = executionResponse(session.events, header.seq)
  expect(first).toMatchObject({ state: 'finished', finishReason: 'stop', text: 'An unaccepted draft.' })
  expect(JSON.stringify(first)).not.toContain('Another attempt')
  expect(executionResponse(session.events, retry.seq)).toMatchObject({ state: 'streaming', text: 'Another attempt.' })
  session.append('step/start', { turn: 2, step: 1 })
  chunk({ type: 'text-delta', index: 0, text: 'A later turn.' })
  expect(executionResponse(session.events, retry.seq).text).toBe('Another attempt.')
})
