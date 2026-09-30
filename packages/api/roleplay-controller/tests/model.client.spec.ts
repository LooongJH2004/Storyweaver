/** Browser query mirrors reject stale audience data and preserve exact author revisions. */
import { expect, it, vi } from 'vitest'
import { RoleplayBrowserModel, type PlaySubscription } from '../src/client/model.ts'
import type { RoleplayRemote } from '../src/client/index.ts'
import type { RemoteStreamItem } from '@deepseek-ai/dsh-api-gateway/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { AuthorWorkspaceView, InstanceOverview, InstanceId, PlayView, TemplateVersionId, BookId } from '@deepseek-ai/dsh-roleplay-core/types'
import type { EmbodimentChoicesView } from '@deepseek-ai/dsh-roleplay-core/types'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
const ok = <T>(value: T): RemoteResult<T> => ({ ok: true, value })
const instance = (id: string): InstanceOverview => ({ id: id as InstanceId, templateVersionId: 'v1' as TemplateVersionId,
  revision: 0, epoch: 0, createdAt: '2026-09-07T00:00:00Z', deleted: false, title: id,
  book: { id: 'book' as BookId, title: 'Ledger', version: 1 } })
const view = (id: string, revision: number, secret = ''): PlayView => ({ instanceId: id as InstanceId,
  templateVersionId: 'v1', revision, scene: { id: 'inn', location: 'Inn' }, people: [], phase: 'ready',
  rows: secret === '' ? [] : [{ id: 'row', revision, order: 0, kind: 'narration', text: secret }], total: secret === '' ? 0 : 1 })
const request = (id: string) => ({ instanceId: id as InstanceId, audience: { kind: 'observer' as const }, offset: 0, limit: 20 })

function channel() {
  const queue: RemoteStreamItem<PlayView>[] = []
  let waiter: ((result: IteratorResult<RemoteStreamItem<PlayView>>) => void) | undefined
  let closed = false
  const dispose = vi.fn(async () => { closed = true; waiter?.({ done: true, value: undefined }); waiter = undefined })
  const stream: PlaySubscription = { dispose, [Symbol.asyncIterator]: () => ({ next: () => {
    const value = queue.shift()
    if (value !== undefined) return Promise.resolve({ done: false as const, value })
    if (closed) return Promise.resolve({ done: true as const, value: undefined })
    return new Promise<IteratorResult<RemoteStreamItem<PlayView>>>((resolve) => { waiter = resolve })
  } }) }
  return { stream, dispose, send(value: PlayView) {
    const accept = vi.fn()
    const item = { generation: 1, value, signal: new AbortController().signal, accept }
    if (waiter === undefined) queue.push(item)
    else { const waiting = waiter; waiter = undefined; waiting({ done: false, value: item }) }
    return accept
  } }
}
function remote(overrides: Partial<Pick<RoleplayRemote, 'books' | 'instances' | 'play' | 'authorWorkspace' | 'characters' | 'embodimentChoices'>> = {}) {
  return { embodimentChoices: async ({ revision }: { revision?: number }) => ok({
    revision: revision ?? 0, entries: [], controlEntries: [],
  }),
  books: async () => ok([]), instances: async () => ok([]), play: async () => ok(view('A', 0)),
  authorWorkspace: async () => { throw new Error('Unexpected author request') },
  characters: async () => { throw new Error('Unexpected character request') }, ...overrides }
}

it('keeps character choices in the API mirror and rejects a late response from another instance', async () => {
  const pending = deferred<RemoteResult<EmbodimentChoicesView>>()
  const a = channel(); const b = channel(); const streams = [a, b]
  const model = new RoleplayBrowserModel(remote({ embodimentChoices: async ({ instanceId, revision }) => instanceId === 'A'
    ? pending.promise : ok({ revision: revision!, controlEntries: [{ actorId: 'off-b', label: 'B off scene', inScene: false }],
      entries: [{ actorId: 'b', label: 'A masked visitor' }] }) }), () => streams.shift()!.stream)
  model.follow(request('A')); a.send(view('A', 1)); await Promise.resolve()
  model.follow(request('B')); b.send(view('B', 1))
  await vi.waitFor(() => { expect(model.play.getSnapshot().choices?.entries[0]?.actorId).toBe('b') })
  pending.resolve(ok({ revision: 1, entries: [{ actorId: 'a', label: 'PRIVATE-A' }],
    controlEntries: [{ actorId: 'off-a', label: 'A off scene', inScene: false }] }))
  await pending.promise; await Promise.resolve()
  expect(model.play.getSnapshot().choices?.entries).toEqual([{ actorId: 'b', label: 'A masked visitor' }])
  expect(model.play.getSnapshot().choices?.controlEntries).toEqual([{ actorId: 'off-b', label: 'B off scene', inScene: false }])
  await model.dispose()
})

it('clears old private views immediately and ignores late stream frames after an audience switch', async () => {
  const a = channel(); const b = channel(); const c = channel()
  const streams = [a, b, c]
  const model = new RoleplayBrowserModel(remote(), () => streams.shift()!.stream)
  model.follow({ ...request('A'), audience: { kind: 'actor', actorId: 'a' } })
  const accepted = a.send(view('A', 1, 'ONLY-A-KNOWS'))
  await Promise.resolve()
  expect(accepted).toHaveBeenCalledOnce()
  expect(model.play.getSnapshot().view?.rows[0]?.text).toBe('ONLY-A-KNOWS')
  a.send(view('A', 2, 'LATE-A'))
  model.follow({ ...request('A'), audience: { kind: 'actor', actorId: 'b' } })
  expect(model.play.getSnapshot().view).toBeNull()
  await Promise.resolve()
  expect(model.play.getSnapshot().view).toBeNull()
  b.send(view('A', 3, 'ONLY-B-KNOWS'))
  await Promise.resolve()
  const stable = model.play.getSnapshot()
  expect(model.play.getSnapshot()).toBe(stable)
  expect(stable.view?.rows[0]?.text).toBe('ONLY-B-KNOWS')
  b.send(view('A', 2, 'STALE'))
  await Promise.resolve()
  expect(model.play.getSnapshot().error).toContain('regressed')
  expect(model.play.getSnapshot().view?.revision).toBe(3)
  model.follow(request('B'))
  c.send(view('A', 4, 'WRONG-INSTANCE'))
  await Promise.resolve()
  expect(model.play.getSnapshot().error).toContain('changed instance')
  expect(model.play.getSnapshot().view).toBeNull()
  await model.dispose()
  expect(a.dispose).toHaveBeenCalledOnce(); expect(b.dispose).toHaveBeenCalledOnce(); expect(c.dispose).toHaveBeenCalledOnce()
  expect(() => { model.follow(request('A')) }).toThrow('disposed')
})

it('does not let a delayed library or historical response overwrite a newer query', async () => {
  const oldList = deferred<RemoteResult<readonly InstanceOverview[]>>()
  const oldHistory = deferred<RemoteResult<PlayView>>()
  let calls = 0
  const live = channel()
  const model = new RoleplayBrowserModel(remote({ instances: () => ++calls === 1 ? oldList.promise : Promise.resolve(ok([instance('B')])),
    play: () => oldHistory.promise }), () => live.stream)
  const first = model.refreshLibrary()
  await model.refreshLibrary()
  oldList.resolve(ok([instance('A')]))
  await first
  expect(model.library.getSnapshot().instances.map(item => item.id)).toEqual(['B'])
  const history = model.history({ ...request('A'), revision: 1 })
  model.follow(request('B'))
  oldHistory.resolve(ok(view('A', 1, 'OLD-PRIVATE-VIEW')))
  await history
  expect(model.play.getSnapshot().view).toBeNull()
  live.send(view('B', 5))
  await Promise.resolve()
  expect(model.play.getSnapshot().view?.instanceId).toBe('B')
  await model.dispose()
})

it('keeps last usable library state on failure and binds author people to the captured workspace revision', async () => {
  const workspace = { instance: { ...instance('A'), revision: 4 } } as AuthorWorkspaceView
  const characters = vi.fn(async (input: Parameters<RoleplayRemote['characters']>[0]) => ok({ revision: input.revision!, entries: [], total: 0 }))
  let fail = false
  const model = new RoleplayBrowserModel(remote({ instances: async () => {
    if (fail) throw new Error('Disconnected')
    return ok([instance('A')])
  }, authorWorkspace: async () => ok(workspace), characters }), () => channel().stream)
  await model.refreshLibrary()
  fail = true
  await model.refreshLibrary()
  expect(model.library.getSnapshot().instances).toHaveLength(1)
  expect(model.library.getSnapshot().error).toBe('Disconnected')
  await model.inspectAuthor({ instanceId: 'A' as InstanceId, query: { query: '', offset: 0, limit: 20 } })
  expect(characters.mock.calls[0]?.[0].revision).toBe(4)
  expect(model.author.getSnapshot().people?.revision).toBe(4)
  await model.dispose()
})

it('invalidates author pulls on disposal and reports failed or mismatched historical requests without fictional progress', async () => {
  const pending = deferred<RemoteResult<AuthorWorkspaceView>>()
  const model = new RoleplayBrowserModel(remote({ authorWorkspace: () => pending.promise,
    play: async () => ok(view('A', 3)) }), () => channel().stream)
  await model.history({ ...request('A'), revision: 1 })
  expect(model.play.getSnapshot().error).toContain('does not match')
  expect(model.play.getSnapshot().view).toBeNull()
  const author = model.inspectAuthor({ instanceId: 'A' as InstanceId, query: { query: '', offset: 0, limit: 20 } })
  const before = model.author.getSnapshot()
  await model.dispose()
  pending.resolve(ok({ instance: instance('A') } as AuthorWorkspaceView))
  await author
  expect(model.author.getSnapshot()).toBe(before)
})


it('reports subscription cleanup failures instead of claiming a successful disposal', async () => {
  const live = channel()
  const model = new RoleplayBrowserModel(remote(), () => ({ ...live.stream, dispose: async () => {
    await live.stream.dispose()
    throw new Error('Carrier close failed')
  } }))
  model.follow(request('A'))
  await expect(model.dispose()).rejects.toThrow('subscription disposal failed')
})

it('retains the reviewed workspace during a same-person refresh but clears it when changing perspective', async () => {
  const workspace = { instance: { ...instance('A'), revision: 4 } } as AuthorWorkspaceView
  const pending = deferred<RemoteResult<AuthorWorkspaceView>>()
  let count = 0
  const model = new RoleplayBrowserModel(remote({ authorWorkspace: async () => ++count === 1 ? ok(workspace) : pending.promise,
    characters: async () => ok({ revision: 4, entries: [], total: 0 }) }), () => channel().stream)
  const query = { instanceId: 'A' as InstanceId, actorId: 'keeper', query: { query: '', offset: 0, limit: 20 } }
  await model.inspectAuthor(query)
  const refreshing = model.inspectAuthor(query)
  expect(model.author.getSnapshot()).toMatchObject({ workspace, loading: true })
  const switching = model.inspectAuthor({ ...query, actorId: 'stranger' })
  expect(model.author.getSnapshot().workspace).toBeNull()
  pending.resolve(ok(workspace))
  await Promise.all([refreshing, switching]); await model.dispose()
})
