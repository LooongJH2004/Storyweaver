import { parseStorybookDocument } from '@deepseek-ai/dsh-roleplay-core/storybook'
/** SQLite durability and rollback use the same application as memory tests. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { StorybookLibrary, canonical, NarrativeCommands, NarrativeDeliveries, NarrativeArchives, initializeWorld } from '@deepseek-ai/dsh-roleplay-core'
import type { BookId, CommandId } from '@deepseek-ai/dsh-roleplay-core'
import { SqliteRoleplayStore, embeddedResourceVerifier } from '../src/index.ts'
import { MemoryRoleplayStore } from '@deepseek-ai/dsh-roleplay-core'
import type { Transaction } from '@deepseek-ai/dsh-roleplay-core'

describe('SQLite narrative provider', () => {
  it.each(['memory', 'sqlite'] as const)('keeps nested read semantics and transaction ownership equal for %s', (kind) => {
    const store = kind === 'memory' ? new MemoryRoleplayStore() : new SqliteRoleplayStore({ path: ':memory:', journalMode: 'delete', busyTimeoutMs: 1000 })
    store.transaction((tx) => {
      tx.put('a', 'items', 'one', 'staged')
      expect(store.read(read => read.get('a', 'items', 'one'))).toBe('staged')
      expect(() => store.close()).toThrow('during a transaction')
    })
    store.read(() => {
      expect(() => store.transaction(() => undefined)).toThrow('cannot nest')
      expect(store.read(tx => tx.get('a', 'items', 'one'))).toBe('staged')
      expect(() => store.close()).toThrow('during a transaction')
    })
    expect(() => store.transaction((tx) => { tx.put('a', 'items', 'one', 'discarded'); throw new Error('abort') })).toThrow('abort')
    expect(store.read(tx => tx.get('a', 'items', 'one'))).toBe('staged')
    store.close()
  })

  it('preserves pinned resource bytes through export/import and rejects changed or unsafe resources', () => {
    const store = new MemoryRoleplayStore()
    let sequence = 0
    const values = { id: () => `resource-${++sequence}`, now: () => '2026-09-07T00:00:00.000Z' }
    const library = new StorybookLibrary(store, values, embeddedResourceVerifier, ({ document }) => document)
    const bytes = Buffer.from('A drawing of the inn.')
    const resource = { path: 'assets/inn.txt', digest: createHash('sha256').update(bytes).digest('hex'), base64: bytes.toString('base64') }
    const draft = library.saveDraft({ id: 'resource-book' as BookId, expectedRevision: 0, title: 'Illustrated inn', document: JSON.parse(canonical(parseStorybookDocument({ schemaVersion: 6, id: 'inn', title: 'Illustrated inn', characters: [], directorPrompt: '', directorGuidance: {} }))) as import('@deepseek-ai/dsh-roleplay-core/types').Document, resources: [resource] })
    const version = library.publish(draft.id, draft.revision)
    const instance = library.createStory({ templateVersionId: version.id, commandId: 'resource-create' as CommandId }, version => initializeWorld(version, values))
    const archives = new NarrativeArchives(store, values, embeddedResourceVerifier)
    const exported = archives.export(instance.instance.id, [])
    const imported = archives.import(exported, 'resource-import' as CommandId)
    expect(library.version(imported.instance.templateVersionId).resources).toEqual([resource])
    expect(() => archives.import({ ...exported, template: { ...exported.template, resources: [{ ...resource, base64: Buffer.from('Changed').toString('base64') }] } }, 'bad-resource' as CommandId)).toThrow('digest')
    for (const path of ['../inn.txt', 'C:/inn.txt', 'assets/CON.txt', 'assets/inn.txt.']) {
      expect(() => embeddedResourceVerifier.verify([{ ...resource, path }])).toThrow('relative path')
    }
    expect(() => embeddedResourceVerifier.verify([resource, { ...resource, path: 'ASSETS/INN.TXT' }])).toThrow('repeats a path')
    expect(library.instances()).toHaveLength(2)
    store.close()
  })

  it('keeps multi-record reads consistent while another connection commits and preserves foreign files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'roleplay-isolation-'))
    const config = { path: join(root, 'narrative.sqlite'), journalMode: 'wal' as const, busyTimeoutMs: 100 }
    const one = new SqliteRoleplayStore(config); const two = new SqliteRoleplayStore(config)
    try {
      one.transaction((tx) => { tx.put('A', 'values', 'head', 1); tx.put('A', 'values', 'body', 'before') })
      one.read((tx) => {
        expect(tx.get('A', 'values', 'head')).toBe(1)
        two.transaction((other) => { other.put('A', 'values', 'head', 2); other.put('A', 'values', 'body', 'after') })
        expect(tx.get('A', 'values', 'body')).toBe('before')
      })
      expect(one.read(tx => tx.get('A', 'values', 'body'))).toBe('after')
      const foreign = new DatabaseSync(join(root, 'foreign.sqlite'))
      foreign.exec('CREATE TABLE original(value TEXT); INSERT INTO original VALUES (\'keep\'); PRAGMA user_version = 1;')
      expect(() => new SqliteRoleplayStore({ ...config, path: join(root, 'foreign.sqlite') })).toThrow('Unsupported')
      expect(foreign.prepare('SELECT value FROM original').get()?.value).toBe('keep')
      foreign.close()
    } finally { one.close(); two.close(); await rm(root, { recursive: true, force: true }) }
  })
  it.each(['memory', 'sqlite'])('releases transaction capabilities and rejects async writes in %s', (backend) => {
    const store = backend === 'memory' ? new MemoryRoleplayStore() : new SqliteRoleplayStore({ path: ':memory:', journalMode: 'wal', busyTimeoutMs: 100 })
    let captured!: Transaction
    try {
      store.transaction((tx) => { captured = tx; tx.put('A', 'records', 'one', 1) })
      expect(() => captured.put('B', 'records', 'late', 2)).toThrow('closed')
      expect(() => store.transaction((tx) => { tx.put('A', 'records', 'bad', 3); return Promise.resolve() })).toThrow('synchronous')
      expect(store.read(tx => tx.get('A', 'records', 'bad'))).toBeUndefined()
      expect(() => store.transaction(tx => tx.put('A', 'records', 'infinite', Infinity))).toThrow('finite JSON')
    } finally { store.close() }
  })
  it('reopens an independently replayable world and its pending delivery after an interrupted client', async () => {
    const root = await mkdtemp(join(tmpdir(), 'roleplay-store-'))
    const path = join(root, 'narrative.sqlite')
    let sequence = 0
    const values = { id: () => `${++sequence}`, now: () => '2026-09-07T00:00:00.000Z' }
    let store = new SqliteRoleplayStore({ path, journalMode: 'wal', busyTimeoutMs: 100 })
    try {
      const library = new StorybookLibrary(store, values, embeddedResourceVerifier, ({ document }) => document)
      const draft = library.saveDraft({ id: 'book' as BookId, expectedRevision: 0, title: 'Inn', document: {}, resources: [] })
      const version = library.publish(draft.id, draft.revision)
      const initial = library.createStory({ templateVersionId: version.id, commandId: 'create' as CommandId }, () => [])
      const commands = new NarrativeCommands(store, values)
      const request = { id: 'commit' as CommandId, instanceId: initial.instance.id, expectedRevision: 0,
        principal: { kind: 'player' as const }, kind: 'correct-knowledge', input: 'The stranger may be lying.' }
      const accepted = commands.execute(request, () => ({ events: [{ type: 'entity.replaced',
        key: { collection: 'knowledge', id: 'observer' }, value: { claim: request.input } }], result: 'accepted' }))
      expect(() => store.transaction((tx) => { tx.put(initial.instance.id, 'entities', 'bad', {}); throw new Error('rollback') })).toThrow('rollback')
      store.close(); store = new SqliteRoleplayStore({ path, journalMode: 'wal', busyTimeoutMs: 100 })
      const reopened = new NarrativeCommands(store, values)
      expect(reopened.replay(initial.instance.id, 1)).toEqual(reopened.snapshot(initial.instance.id))
      expect(new NarrativeDeliveries(store).pending()).toMatchObject([{ commitId: accepted.id }])
      expect(reopened.execute(request, () => { throw new Error('duplicate ran') })).toEqual(accepted)
      expect(store.read(tx => tx.get(initial.instance.id, 'entities', 'bad'))).toBeUndefined()
      expect(() => store.read(tx => tx.put('bad', 'bad', 'bad', {}))).toThrow('Read-only')
    } finally { store.close(); await rm(root, { recursive: true, force: true }) }
  })
})
