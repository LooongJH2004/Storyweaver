/** Imported evidence never falls through to another instance's live session. */
import { expect, it } from 'vitest'
import type { InstanceId, Json } from '@deepseek-ai/dsh-roleplay-core/types'
import { portableRequests } from '../src/portable-requests.ts'

const body = { format: 'harness-request-evidence-v1', instanceId: 'source', actorId: 'keeper',
  request: { requestId: 8, attempt: 'old-attempt', revision: 3, configurationRevision: 0, turn: 1, step: 1,
    provider: 'mock', model: 'mock', status: 'response-recorded' }, body: { kind: 'recorded', json: 'original private input' } } satisfies Json

it('filters archived requests by person and historical revision inside the supplied destination evidence', () => {
  const scope = { instanceId: 'destination' as InstanceId, revision: 3, actorId: 'keeper' }
  const evidence = [{ id: 'source-session:request:8', content: body }]
  expect(portableRequests(scope, evidence)[0]).toMatchObject({ summary: { evidenceId: evidence[0]!.id }, body: body.body })
  expect(portableRequests({ ...scope, actorId: 'stranger' }, evidence)).toEqual([])
  expect(portableRequests({ instanceId: scope.instanceId, revision: 3 }, evidence)).toEqual([])
  expect(portableRequests({ ...scope, revision: 2 }, evidence)).toEqual([])
  expect(portableRequests(scope, [])).toEqual([])
})

it('rejects malformed recognized evidence and leaves unrelated raw logs opaque', () => {
  const scope = { instanceId: 'destination' as InstanceId, revision: 3, actorId: 'keeper' }
  expect(() => portableRequests(scope, [{ id: 'invalid', content: { ...body, body: { kind: 'recorded', json: 42 } } }])).toThrow()
  expect(portableRequests(scope, [{ id: 'raw', content: { format: 'harness-session-evidence', session: {} } }])).toEqual([])
})

it('preserves native turn timing in portable evidence and leaves missing historical samples absent', () => {
  const scope = { instanceId: 'destination' as InstanceId, revision: 3, actorId: 'keeper' }
  const turnTiming = { ttftMs: 0, tokensPerSecond: 25.5 }
  const evidence = { ...body, request: { ...body.request, turnTiming } }
  expect(portableRequests(scope, [{ id: 'timed', content: evidence }])[0]?.summary.turnTiming).toEqual(turnTiming)
  expect(portableRequests(scope, [{ id: 'old', content: body }])[0]?.summary.turnTiming).toBeUndefined()
})
