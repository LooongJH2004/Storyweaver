/** A play stream owns cancellation and coalesces notices without replaying private events. */
import { expect, it } from 'vitest'
import { PlayFeed } from '../src/play-feed.ts'
import type { InstanceId, CommitId, InstanceChange, PlayView } from '@deepseek-ai/dsh-roleplay-core'

it('starts from current truth, coalesces updates and cleans up an aborted slow reader', async () => {
  const id = 'instance' as InstanceId
  const listeners = new Set<(change: InstanceChange) => void>()
  let revision = 0
  const feed = new PlayFeed({ subscribe: (_id, callback) => { listeners.add(callback); return () => { listeners.delete(callback) } } }, {
    read: request => ({ instanceId: request.instanceId, templateVersionId: 'version', revision, scene: { id: 'scene', location: 'Inn' },
      people: [], phase: 'ready', rows: [], total: 0 } satisfies PlayView),
  })
  const signal = new AbortController()
  const iterator = feed.follow({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 10 }, signal.signal)[Symbol.asyncIterator]()
  const initial = await iterator.next()
  expect(initial.done ? undefined : initial.value.revision).toBe(0)
  const waiting = iterator.next()
  for (const next of [1, 2, 3]) {
    revision = next
    for (const listener of listeners) listener({ instanceId: id, revision, commitId: String(next) as CommitId })
  }
  const next = await waiting
  expect(next.done ? undefined : next.value.revision).toBe(3)
  signal.abort()
  expect(listeners.size).toBe(0)
  expect((await iterator.next()).done).toBe(true)
  feed.dispose()
})

it('removes subscriptions when a query fails', async () => {
  let count = 0
  const changes = { subscribe: () => { count++; return () => { count-- } } }
  const feed = new PlayFeed(changes, { read: () => { throw new Error('Unavailable audience') } })
  const iterator = feed.follow({ instanceId: 'instance' as InstanceId, audience: { kind: 'observer' }, offset: 0, limit: 10 },
    new AbortController().signal)[Symbol.asyncIterator]()
  await expect(iterator.next()).rejects.toThrow('Unavailable audience')
  expect(count).toBe(0)
  feed.dispose()
})

it('settles a waiting subscriber when the RPC entry is disposed', async () => {
  const listeners = new Set<() => void>()
  const feed = new PlayFeed({ subscribe: (_id, _listener) => {
    const remove = () => { listeners.delete(remove) }; listeners.add(remove); return remove
  } }, { read: request => ({ instanceId: request.instanceId, templateVersionId: 'version', revision: 0,
    scene: { id: '', location: '' }, people: [], phase: 'ready', rows: [], total: 0 }) })
  const iterator = feed.follow({ instanceId: 'instance' as InstanceId, audience: { kind: 'observer' }, offset: 0, limit: 10 },
    new AbortController().signal)[Symbol.asyncIterator]()
  await iterator.next()
  const pending = iterator.next()
  feed.dispose()
  expect((await pending).done).toBe(true)
  expect(listeners.size).toBe(0)
})
