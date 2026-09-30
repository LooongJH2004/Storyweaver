/** Business behavior without a Cordis tree, model, Session, or browser. */
import { describe, expect, it, vi } from 'vitest'
import { MemoryRoleplayStore, NarrativeCommands, NarrativeDeliveries, StorybookLibrary, entity } from '../src/index.ts'
import type { BookId, Command, CommandId, NarrativeSnapshot } from '../src/index.ts'

function setup() {
  let serial = 0
  const values = { id: () => `id-${++serial}`, now: () => '2026-09-07T00:00:00.000Z' }
  const store = new MemoryRoleplayStore()
  const library = new StorybookLibrary(store, values, { verify: (resources) => { if (resources.length > 0) throw new Error('Fixture contains no resources') } }, ({ document }) => document)
  const commands = new NarrativeCommands(store, values)
  const id = 'book' as BookId
  const draft = library.saveDraft({ id, expectedRevision: 0, title: 'An unspecified inn', document: { premise: 'There is an inn.' }, resources: [] })
  const version = library.publish(id, draft.revision)
  const create = (key: string): NarrativeSnapshot => library.createStory({ templateVersionId: version.id, commandId: key as CommandId },
    published => [{ key: { collection: 'setting', id: 'baseline' }, value: published.document }])
  return { store, library, commands, version, id, create }
}
function command(snapshot: NarrativeSnapshot, id: string, input: Command['input'] = null): Command {
  return { id: id as CommandId, instanceId: snapshot.instance.id, expectedRevision: snapshot.instance.revision,
    principal: { kind: 'player' }, kind: 'test-edit', input }
}

describe('independent narrative worlds', () => {
  it('reads the current revision without scanning commits and preserves older revision queries after edits', () => {
    const { store, commands, create } = setup()
    const initial = create('projection')
    const key = { collection: 'people', id: 'innkeeper' }
    commands.execute(command(initial, 'name'), () => ({ events: [{ type: 'entity.replaced', key, value: 'Mira' }], result: null }))
    const current = commands.snapshot(initial.instance.id)
    const collections: string[] = []
    const read = store.read.bind(store)
    vi.spyOn(store, 'read').mockImplementation(operation => read(tx => operation({ ...tx,
      scan: (scope, collection) => { collections.push(collection); return tx.scan(scope, collection) },
    })))
    expect(commands.replay(initial.instance.id, current.instance.revision)).toEqual(current)
    expect(collections).not.toContain('commits')
    commands.execute(command(current, 'rename'), () => ({ events: [{ type: 'entity.replaced', key, value: 'Other' }], result: null }))
    expect(commands.replay(initial.instance.id, current.instance.revision)).toEqual(current)
    expect(collections).toContain('commits')
    expect(commands.replay(initial.instance.id, 0)).toEqual(initial)
    expect(() => commands.replay(initial.instance.id, 99)).toThrow('unavailable')
    expect(() => commands.replay(initial.instance.id, -1)).toThrow('Invalid story history revision')
  })

  it('keeps incompatible instance settings independent across publication and library deletion', () => {
    const { library, commands, version, id, create } = setup()
    const a = create('A'); const b = create('B')
    const key = { collection: 'people', id: 'innkeeper' }
    commands.execute(command(a, 'a-change', 'veteran'), () => ({ events: [{ type: 'entity.replaced', key, value: 'Veteran' }], result: null }))
    commands.execute(command(b, 'b-change', 'sisters'), () => ({ events: [{ type: 'entity.replaced', key, value: ['Sister 1', 'Sister 2'] }], result: null }))
    const draft = library.saveDraft({ id, expectedRevision: library.draft(id)!.revision, title: 'New background', document: { premise: 'No inn exists.' }, resources: [] })
    const next = library.publish(id, draft.revision)
    library.remove(id, library.draft(id)!.revision)
    expect(library.list()).toEqual([])
    expect(library.version(version.id).document).toEqual({ premise: 'There is an inn.' })
    expect(next.id).not.toBe(version.id)
    expect(entity(commands.snapshot(a.instance.id), key)).toBe('Veteran')
    expect(entity(commands.snapshot(b.instance.id), key)).toEqual(['Sister 1', 'Sister 2'])
    expect(commands.snapshot(a.instance.id).instance.templateVersionId).toBe(version.id)
    expect(create('A').instance.id).toBe(a.instance.id)
  })

  it('rolls back a failed durable commit and rejects duplicate IDs with different payloads', () => {
    const { store, commands, create } = setup(); const a = create('A')
    const request = command(a, 'edit', { name: 'Mira' })
    const handler = () => ({ events: [{ type: 'entity.replaced' as const, key: { collection: 'people', id: 'p' }, value: 'Mira' }], result: 'saved' })
    store.beforeCommit = () => { throw new Error('disk failure') }
    expect(() => commands.execute(request, handler)).toThrow('disk failure')
    expect(commands.snapshot(a.instance.id)).toEqual(a)
    store.beforeCommit = undefined
    const committed = commands.execute(request, handler)
    expect(commands.execute(request, () => { throw new Error('must not execute twice') })).toEqual(committed)
    expect(() => commands.execute({ ...request, input: { name: 'Other' } }, handler)).toThrow('different content')
    expect(() => commands.execute({ ...request, id: 'stale' as CommandId }, handler)).toThrow('revision changed')
    expect(commands.replay(a.instance.id, 1)).toEqual(commands.snapshot(a.instance.id))
  })

  it('retains committed state when notification fails, then retries the same receipt', async () => {
    const { store, commands, create } = setup(); const a = create('A')
    const commit = commands.execute(command(a, 'edit'), () => ({ events: [], result: 'accepted' }))
    const deliveries = new NarrativeDeliveries(store)
    await deliveries.drain(() => Promise.reject(new Error('connection lost')))
    expect(deliveries.pending()).toMatchObject([{ commitId: commit.id, attempts: 1 }])
    expect(commands.snapshot(a.instance.id).instance.revision).toBe(1)
    const received: string[] = []
    await deliveries.drain((receipt) => { received.push(receipt.id); return Promise.resolve() })
    expect(received).toEqual([commit.id])
    expect(deliveries.pending()).toEqual([])
  })

  it('restores by compensation, fences late execution, and never revives removed initial values', () => {
    const { commands, create } = setup(); const a = create('A')
    const key = { collection: 'setting', id: 'baseline' }
    commands.execute(command(a, 'delete'), () => ({ events: [{ type: 'entity.removed', key }], result: null }))
    expect(entity(commands.snapshot(a.instance.id), key)).toBeUndefined()
    const after = commands.snapshot(a.instance.id)
    commands.restore(command(after, 'restore', { targetRevision: 0, reason: 'Player undo' }), 0, 'Player undo')
    const restored = commands.snapshot(a.instance.id)
    expect(entity(restored, key)).toEqual({ premise: 'There is an inn.' })
    expect(commands.replay(a.instance.id, 1).entities).toEqual([])
    expect(commands.replay(a.instance.id, 2)).toEqual(restored)
    expect(() => commands.execute({ ...command(restored, 'late'), principal: { kind: 'actor', actorId: 'p', attempt: 'old', epoch: 0 } },
      () => ({ events: [], result: null }))).toThrow('no longer current')
  })
})

it('publishes normalized defaults once and rolls back invalid publication without touching its draft', () => {
  const store = new MemoryRoleplayStore()
  let serial = 0
  let preference = 'restrained'
  const books = new StorybookLibrary(store, { id: () => `publication-${++serial}`, now: () => '2026-09-07T00:00:00.000Z' },
    { verify: () => {} }, ({ title, document }) => {
      if (document.invalid === true) throw new Error('Invalid authored content')
      return { preference, ...document, title }
    })
  const draft = books.saveDraft({ id: 'book' as BookId, title: 'Pinned title', expectedRevision: 0, document: {}, resources: [] })
  const preview = books.previewPublication(draft.id, draft.revision)
  expect(books.draft(draft.id)?.document).toEqual({})
  const published = books.publish(draft.id, draft.revision)
  expect(published.document).toEqual(preview.document)
  preference = 'quick'
  expect(books.version(published.id).document).toEqual({ preference: 'restrained', title: 'Pinned title' })
  const invalid = books.saveDraft({ ...draft, expectedRevision: books.draft(draft.id)!.revision, document: { invalid: true } })
  expect(() => books.publish(invalid.id, invalid.revision)).toThrow('Invalid authored content')
  expect(books.draft(draft.id)).toEqual(invalid)
  expect(books.version(published.id)).toEqual(published)
  store.close()
})
