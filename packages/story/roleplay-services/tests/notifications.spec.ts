/** Notification retries never repeat narrative commands or leak another instance's payload. */
import { expect, it, vi } from 'vitest'
import { NarrativeNotifications } from '../src/notifications.ts'
import { MemoryRoleplayStore, StorybookLibrary, NarrativeCommands, NarrativeDeliveries } from '@deepseek-ai/dsh-roleplay-core'
import type { BookId, CommandId, InstanceChange } from '@deepseek-ai/dsh-roleplay-core'

it('retries a failed consumer, filters instance scope and stops its owned timer on disposal', async () => {
  vi.useFakeTimers()
  let sequence = 0
  const values = { id: () => `notification-${++sequence}`, now: () => '2026-09-07T00:00:00.000Z' }
  const store = new MemoryRoleplayStore()
  const books = new StorybookLibrary(store, values, { verify: () => {} }, ({ document }) => document)
  const draft = books.saveDraft({ id: 'book' as BookId, expectedRevision: 0, title: 'Book', document: {}, resources: [] })
  const version = books.publish(draft.id, draft.revision)
  const a = books.createStory({ templateVersionId: version.id, commandId: 'a' as CommandId }, () => []).instance.id
  const b = books.createStory({ templateVersionId: version.id, commandId: 'b' as CommandId }, () => []).instance.id
  const commands = new NarrativeCommands(store, values)
  const deliveries = new NarrativeDeliveries(store)
  const failed = vi.fn()
  const notifications = new NarrativeNotifications(deliveries, 10, failed)
  const seen: InstanceChange[] = []
  let refuse = true
  const remove = notifications.subscribe(a, (change) => { if (refuse) { refuse = false; throw new Error('Consumer failed') }; seen.push(change) })
  try {
    for (const instanceId of [a, b]) commands.execute({ instanceId, id: values.id() as CommandId, expectedRevision: 0,
      principal: { kind: 'player' }, kind: 'test', input: null }, () => ({ events: [], result: { secret: 'PRIVATE' } }))
    await vi.advanceTimersByTimeAsync(10)
    expect(deliveries.pending()).toMatchObject([{ instanceId: a, attempts: 1, lastError: 'Consumer failed' }])
    expect(seen).toEqual([])
    await vi.advanceTimersByTimeAsync(10)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ instanceId: a, revision: 1 })
    expect(JSON.stringify(seen)).not.toContain('PRIVATE')
    expect(deliveries.pending()).toEqual([])
    expect(commands.snapshot(a).instance.revision).toBe(1)
    expect(failed).not.toHaveBeenCalled()
    remove(); remove()
    await notifications.dispose()
    expect(vi.getTimerCount()).toBe(0)
  } finally { await notifications.dispose(); store.close(); vi.useRealTimers() }
})
