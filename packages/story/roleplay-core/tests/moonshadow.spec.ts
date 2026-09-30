/** The authored Moonshadow baseline publishes into independent instances without legacy tool dependencies. */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { MemoryRoleplayStore, StorybookLibrary, NarrativeCommands, NarrativeArchives, initializeWorld,
  prepareIndependentBook, PerspectiveQueries, PeopleApplication, canonical } from '../src/index.ts'
import type { BookId, CommandId, Document } from '../src/types.ts'
import { parseStorybookDocument } from '../src/storybook.ts'

it('publishes Moonshadow, isolates its cast and carries pinned opening resources through archive import', () => {
  const directory = new URL('../../../experimental/roleplay-web-profile/tests/fixtures/storybooks/moonshadow-ledger/', import.meta.url)
  const document = JSON.parse(readFileSync(new URL('storybook.json', directory), 'utf8')) as Document
  const opening = readFileSync(new URL('opening.md', directory))
  const resource = { path: 'opening.md', base64: opening.toString('base64'), digest: createHash('sha256').update(opening).digest('hex') }
  let serial = 0
  const values = { id: () => `moon-${++serial}`, now: () => '2026-09-07T00:00:00.000Z' }
  const store = new MemoryRoleplayStore()
  const books = new StorybookLibrary(store, values, { verify: () => {} }, prepareIndependentBook)
  const narrative = new NarrativeCommands(store, values)
  const draft = books.saveDraft({ id: 'moonshadow' as BookId, expectedRevision: 0,
    title: '月影账簿', document, resources: [resource] })
  const published = books.publish(draft.id, draft.revision)
  const book = parseStorybookDocument(published.document)
  expect(book.contextRules.director.tools).toContain('director_command')
  expect(book.contextRules.director.tools).not.toContain('director_dispatch_actors')
  const create = () => books.createStory({ templateVersionId: published.id, commandId: values.id() as CommandId },
    version => initializeWorld(version, values)).instance
  const a = create(); const b = create()
  const people = new PeopleApplication(narrative, values)
  people.stage({ instanceId: a.id, id: values.id() as CommandId, expectedRevision: a.revision, principal: { kind: 'player' } },
    { id: 'opening', location: '精灵之歌', present: book.characters.map(person => person.actorId), appearances: [] })
  const views = new PerspectiveQueries(narrative, 24000,
    id => `field-${id}`, 100)
  expect(views.authorPeople(a.id, { query: '', offset: 0, limit: 100 }).total).toBe(book.characters.length)
  expect(narrative.snapshot(b.id).instance.revision).toBe(0)
  for (const person of book.characters) {
    const context = views.actorContext({ instanceId: a.id, actorId: person.actorId, query: '' })
    expect(context.text).not.toContain('director_dispatch_actors')
    expect(context.text.length).toBeLessThanOrEqual(24000)
  }
  const archives = new NarrativeArchives(store, values, { verify: () => {} })
  const imported = archives.import(archives.export(a.id, []), values.id() as CommandId)
  expect(imported.instance.id).not.toBe(a.id)
  expect(books.version(imported.instance.templateVersionId).resources).toEqual([resource])
  expect(canonical(views.authorPeople(imported.instance.id, { query: '', offset: 0, limit: 100 }).entries))
    .toBe(canonical(views.authorPeople(a.id, { query: '', offset: 0, limit: 100 }).entries))
  store.close()
})
