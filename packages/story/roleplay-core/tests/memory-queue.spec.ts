import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRoleplayStore, NarrativeCommands, StorybookLibrary, initializeWorld, WorldApplication,
  MemoryQueue, RetentionApplication, NarrativeArchives } from '../src/index.ts'
import { parseStorybookDocument } from '../src/storybook.ts'
import { retentionOf } from '../src/retention-records.ts'
import { json } from '../src/world.ts'
import type { BookId, CommandId, CommandScope, MemoryGenerator, MemoryJob } from '../src/index.ts'
import type { ContextUpdateUnit } from '../src/context-retention.ts'

afterEach(() => { vi.useRealTimers() })
function setup() {
  vi.useFakeTimers()
  let serial = 0
  const values = { id: () => `job-${++serial}`, now: () => new Date().toISOString() }
  const store = new MemoryRoleplayStore()
  const commands = new NarrativeCommands(store, values)
  const resources = { verify: () => {} }
  const books = new StorybookLibrary(store, values, resources, ({ document }) => document)
  const book = parseStorybookDocument({ schemaVersion: 6, id: 'book', title: 'Book', directorPrompt: '', directorGuidance: {}, characters: [] })
  const draft = books.saveDraft({ id: 'book' as BookId, expectedRevision: 0, title: 'Book',
    document: json(book) as Record<string, ReturnType<typeof json>>, resources: [] })
  const version = books.publish(draft.id, draft.revision)
  const id = books.createStory({ templateVersionId: version.id, commandId: values.id() as CommandId },
    version => initializeWorld(version, values)).instance.id
  const scope = (): CommandScope => ({ id: values.id() as CommandId, instanceId: id, expectedRevision: commands.snapshot(id).instance.revision, principal: { kind: 'player' } })
  const world = new WorldApplication(commands, values)
  world.observe(scope(), { summary: 'Bell', content: 'The bell rings.', deliveries: [], state: [] })
  let busy = false
  const queue = (generator: MemoryGenerator) => new MemoryQueue(store, commands, values, generator, () => busy,
    { actorThreshold: 1, directorThreshold: 1, batchLimit: 1, intervalMs: 10 }, (error) => { throw error })
  return { id, commands, store, values, scope, world, queue, setBusy: (value: boolean) => { busy = value }, resources }
}
function units(job: MemoryJob): ContextUpdateUnit[] {
  return [{ sourceIds: job.sourceIds, disposition: 'represented', reason: 'Keep the signal.', changes: [
    { operation: 'add', kind: 'fact', text: 'The bell rang.', sourceIds: job.sourceIds },
  ] }]
}
it('continues foreground work while memory runs and integrates only when idle; archive preserves reviewed proposals', async () => {
  const s = setup()
  let finish: (() => void) | undefined
  const generate = vi.fn<MemoryGenerator['generate']>((job, _snapshot, _signal, submit) => new Promise((resolve) => {
    finish = () => { submit(units(job)); resolve() }
  }))
  const queue = s.queue({ generate }); queue.start()
  const before = s.commands.snapshot(s.id).instance.revision
  queue.enqueue(s.id, 'director'); queue.enqueue(s.id, 'director')
  expect(queue.list(s.id)).toHaveLength(1)
  expect(s.commands.snapshot(s.id).instance.revision).toBe(before)
  await vi.advanceTimersByTimeAsync(10)
  expect(queue.list(s.id)[0]?.status).toBe('running')
  s.setBusy(true)
  s.world.observe(s.scope(), { summary: 'Rain', content: 'Rain begins.', deliveries: [], state: [] })
  finish!()
  await vi.advanceTimersByTimeAsync(10)
  expect(queue.list(s.id)[0]?.status).toBe('ready')
  expect(retentionOf(s.commands.snapshot(s.id), 'director').proposals).toEqual([])
  s.setBusy(false)
  await vi.advanceTimersByTimeAsync(10)
  expect(queue.list(s.id)[0]?.status).toBe('applied')
  const retained = retentionOf(s.commands.snapshot(s.id), 'director')
  expect(retained.proposals[0]?.status).toBe('proposed')
  expect(retained.notes).toEqual([])
  const archives = new NarrativeArchives(s.store, s.values, s.resources)
  const imported = archives.import(archives.export(s.id, []), s.values.id() as CommandId)
  expect(retentionOf(imported, 'director').proposals).toEqual(retained.proposals)
  await queue.dispose()
})
it('preserves player memory changes and permits explicit regeneration after a conflict', async () => {
  const s = setup()
  let finish: (() => void) | undefined
  const queue = s.queue({ generate: (job, _snapshot, _signal, submit) => new Promise((resolve) => {
    finish = () => { submit(units(job)); resolve() }
  }) }); queue.start(); queue.enqueue(s.id, 'director')
  await vi.advanceTimersByTimeAsync(10)
  new RetentionApplication(s.commands).review(s.scope(), { owner: 'director', operation: 'policy', activation: 'automatic' })
  finish!(); await vi.advanceTimersByTimeAsync(10)
  expect(queue.list(s.id)[0]?.status).toBe('superseded')
  expect(retentionOf(s.commands.snapshot(s.id), 'director').notes).toEqual([])
  queue.retry(s.id, queue.list(s.id)[0]!.id)
  expect(queue.list(s.id).some(job => job.status === 'queued')).toBe(true)
  await queue.dispose()
})
it('recovers interrupted jobs after restart without forgetting the pending batch', async () => {
  const s = setup()
  const first = s.queue({ generate: (_job, _snapshot, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { reject(new Error('stopped')) }, { once: true })
  }) }); first.start(); first.enqueue(s.id, 'director')
  await vi.advanceTimersByTimeAsync(10); await first.dispose()
  const second = s.queue({ generate: async (job, _snapshot, _signal, submit) => { submit(units(job)) } })
  second.start(); await vi.advanceTimersByTimeAsync(30)
  expect(second.list(s.id)[0]).toMatchObject({ status: 'applied', attempts: 2 })
  await second.dispose()
})
it('discards a ready result when the player restores earlier history', async () => {
  const s = setup()
  const queue = s.queue({ generate: async (job, _snapshot, _signal, submit) => { s.setBusy(true); submit(units(job)) } })
  queue.start(); queue.enqueue(s.id, 'director'); await vi.advanceTimersByTimeAsync(10)
  const restore = { ...s.scope(), kind: 'history.restore', input: { targetRevision: 0, reason: 'Undo' } }
  s.commands.restore(restore, 0, 'Undo'); s.setBusy(false)
  await vi.advanceTimersByTimeAsync(10)
  expect(queue.list(s.id)[0]?.status).toBe('cancelled')
  expect(retentionOf(s.commands.snapshot(s.id), 'director').notes).toEqual([])
  await queue.dispose()
})
