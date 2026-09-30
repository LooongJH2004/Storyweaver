import { expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { InstanceId } from '@deepseek-ai/dsh-roleplay-core'
import { createMessage } from '@deepseek-ai/dsh-llm'
import { performanceUsage, performanceExecutions } from './performance-usage.ts'

it('separates multi-step consolidation from performance and preserves unknown calls without duplicate billing', () => {
  const session = Session.create(SessionId('cost-split'))
  const addCall = (turn: number, step: number, output: number) => {
    session.append('turn/start', { turn })
    session.append('step/start', { turn, step })
    const usage = { inputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 0, outputTokens: output }
    session.append('assistant/chunk', { turn, step, chunk: { type: 'usage', usage } })
    session.append('assistant/message', { turn, step, usage, message: createMessage({ role: 'assistant', content: [],
      source: { kind: 'model', provider: 'mock', model: 'mock' } }) }, { surfaceOp: 'append' })
    session.append('step/end', { turn, step })
    session.append('turn/end', { turn, reason: { kind: 'completed' } })
  }
  const base = { instanceId: 'story' as InstanceId, revision: 1, configurationRevision: 1, templateVersionId: 'book', text: '', sources: [] }
  addCall(1, 1, 1)
  session.append('roleplay/execution-request', { attempt: 'actor', context: { ...base, actorId: 'keeper', sections: [] } })
  addCall(2, 1, 2)
  session.append('roleplay/execution-request', { attempt: 'memory', context: { ...base, actorId: 'keeper',
    sections: [{ id: 'consolidation', role: 'user', content: 'PRIVATE MEMORY CONSOLIDATION', sources: ['seen-door', 'heard-promise'] }] } })
  addCall(3, 1, 3); addCall(3, 2, 4)
  session.append('roleplay/execution-request', { attempt: 'director', context: { ...base, role: 'director', sections: [] } })
  addCall(4, 1, 5)
  const log = { id: session.id, events: session.events }
  const usage = performanceUsage([log, log, { ...log, events: session.events.slice(0, 4) }])
  expect(usage.actor.usage).toMatchObject({ uncachedInputTokens: 10, cacheReadTokens: 20, outputTokens: 2 })
  expect(usage.consolidation.usage).toMatchObject({ uncachedInputTokens: 20, cacheReadTokens: 40, outputTokens: 7 })
  expect(usage.director.usage.outputTokens).toBe(5)
  expect(usage.unclassified.usage.outputTokens).toBe(1)
  expect(usage.consolidation.stats.ttftSteps).toBe(0)
  const executions = performanceExecutions([log, log, { ...log, events: session.events.slice(0, 4) }])
  expect(executions.map(({ attempt, owner, assignedSources, usage }) => ({ attempt, owner, assignedSources, output: usage.outputTokens })))
    .toEqual([{ attempt: null, owner: null, assignedSources: 0, output: 1 },
      { attempt: 'actor', owner: 'actor:keeper', assignedSources: 0, output: 2 },
      { attempt: 'memory', owner: 'actor:keeper', assignedSources: 2, output: 7 },
      { attempt: 'director', owner: 'director', assignedSources: 0, output: 5 }])
  expect(executions.reduce((sum, item) => sum + item.usage.outputTokens, 0)).toBe(15)
})
