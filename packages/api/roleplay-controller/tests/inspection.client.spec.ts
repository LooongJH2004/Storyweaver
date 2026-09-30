/** Author detail mirrors reject late private data and mixed narrative revisions. */
import { expect, it } from 'vitest'
import { RoleplayInspection } from '../src/client/inspection.ts'
import type { RoleplayRemote } from '../src/client/index.ts'
import type { InstanceId, ActorContextView } from '@deepseek-ai/dsh-roleplay-core/types'

const id = 'A' as InstanceId
function context(actorId: string): ActorContextView {
  return { instanceId: id, revision: 3, templateVersionId: 'v1', configurationRevision: 0, actorId,
    text: `private-${actorId}`, sources: [], sections: [] }
}
function remote(overrides: Partial<Pick<RoleplayRemote, 'cognition' | 'contextPreview'>> = {}) {
  return {
    cognition: async () => { throw new Error('Not requested') },
    retention: async () => ({ ok: true as const, value: { instanceId: id, revision: 3, owner: 'director',
      retention: { revision: 0, sources: [], notes: [], proposals: [], pins: [] } } }),
    contextPreview: async ({ actorId }: { actorId: string }) => ({ ok: true as const, value: context(actorId) }),
    directorContextPreview: async () => ({ ok: true as const, value: { ...context('director'), role: 'director' as const } }),
    checkpoints: async () => ({ ok: true as const, value: [{ name: 'Opening', revision: 0 }] }), ...overrides,
    recall: async () => ({ ok: true as const, value: { revision: 3, entries: [], total: 0, nextOffset: null } }),
    executionRequests: async (scope: { instanceId: InstanceId; revision: number; actorId?: string }) => ({ ok: true as const,
      value: { scope, entries: [], total: 0, nextOffset: null } }),
    executionRequest: async () => { throw new Error('Request unavailable') },
  }
}

it('clears private details immediately, rejects a late response, and stops publishing after disposal', async () => {
  let accept!: (result: Awaited<ReturnType<RoleplayRemote['contextPreview']>>) => void
  const model = new RoleplayInspection(remote({
    contextPreview: () => new Promise((resolve) => { accept = resolve }),
    cognition: async () => ({ ok: false, error: { code: 'internal', message: 'private query unavailable', details: {} } }),
  }))
  await model.inspect({ instanceId: id, revision: 3 })
  expect(model.snapshot.getSnapshot().context?.text).toBe('private-director')
  const obsolete = model.inspect({ instanceId: id, revision: 3, actorId: 'a' })
  expect(model.snapshot.getSnapshot().context).toBeNull()
  await model.inspect({ instanceId: id, revision: 3 })
  accept({ ok: true, value: context('a') }); await obsolete
  expect(model.snapshot.getSnapshot().context?.text).toBe('private-director')
  model.dispose()
  await expect(model.inspect({ instanceId: id, revision: 3 })).rejects.toThrow('disposed')
})

it('publishes no partial context when one response belongs to another revision', async () => {
  const model = new RoleplayInspection(remote())
  await model.inspect({ instanceId: id, revision: 4 })
  const result = model.snapshot.getSnapshot()
  expect(result.context).toBeNull()
  expect(result.retention).toBeNull()
  expect(result.error).toContain('revision changed')
})

it('discards historical request bodies after the inspected instance changes', async () => {
  let accept!: (value: Awaited<ReturnType<RoleplayRemote['executionRequest']>>) => void
  const model = new RoleplayInspection({ ...remote(), executionRequest: () => new Promise((resolve) => { accept = resolve }) })
  await model.inspect({ instanceId: id, revision: 3 })
  const pending = model.executionRequest(10)
  await model.inspect({ instanceId: 'B' as InstanceId, revision: 3 })
  accept({ ok: true, value: { scope: { instanceId: id, revision: 3 }, requestJson: 'PRIVATE-A',
    request: { requestId: 10, revision: 2, configurationRevision: 0, turn: 1, step: 1,
      status: 'response-recorded', provider: 'mock', model: 'mock', attempt: 'a' } } })
  await pending
  expect(model.snapshot.getSnapshot().actualRequest).toBeNull()
})

it('refuses a historical request page from another instance before publishing any entry', async () => {
  const model = new RoleplayInspection({ ...remote(), executionRequests: async () => ({ ok: true,
    value: { scope: { instanceId: 'B' as InstanceId, revision: 3 }, entries: [], total: 0, nextOffset: null } }) })
  await model.inspect({ instanceId: id, revision: 3 })
  await model.executionRequests(0, 10)
  expect(model.snapshot.getSnapshot().requests).toBeNull()
  expect(model.snapshot.getSnapshot().error).toContain('another narrative perspective')
})

it('opens recorded context without requesting current cognition, retention or context previews', async () => {
  const source = remote()
  const unexpected = async () => { throw new Error('Unrelated author query') }
  const model = new RoleplayInspection({ ...source, cognition: unexpected, contextPreview: unexpected,
    directorContextPreview: unexpected, retention: unexpected, checkpoints: unexpected })
  await model.inspectRecorded({ instanceId: id, revision: 3 }, 10)
  expect(model.snapshot.getSnapshot()).toMatchObject({ loading: false, error: null, context: null,
    cognition: null, retention: null, requests: { entries: [] } })
})

it('rejects a late recorded context after switching the selected perspective', async () => {
  let finish!: (value: Awaited<ReturnType<RoleplayRemote['executionRequests']>>) => void
  const source = remote()
  const model = new RoleplayInspection({ ...source, executionRequests: request => request.actorId === 'a'
    ? new Promise((resolve) => { finish = resolve }) : source.executionRequests(request) })
  const old = model.inspectRecorded({ instanceId: id, revision: 3, actorId: 'a' }, 10)
  await model.inspectRecorded({ instanceId: id, revision: 3, actorId: 'b' }, 10)
  finish({ ok: true, value: { scope: { instanceId: id, revision: 3, actorId: 'a' }, entries: [], total: 0, nextOffset: null } })
  await old
  expect(model.snapshot.getSnapshot().request?.actorId).toBe('b')
  expect(model.snapshot.getSnapshot().requests?.scope.actorId).toBe('b')
})
