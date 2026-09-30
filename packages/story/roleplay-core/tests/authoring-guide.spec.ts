/** The AI handoff template must remain executable against the supported book format. */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseStorybookDocument } from '../src/storybook.ts'
import { prepareIndependentBook } from '../src/independent-book.ts'
import type { Document } from '../src/types.ts'

const guide = readFileSync(new URL('../../../../docs/storybook-json-editing-guide.zh.md', import.meta.url), 'utf8')
const template = guide.match(/```json\r?\n([\s\S]*?)\r?\n```/u)?.[1]
if (template === undefined) throw new Error('The authoring guide needs a complete JSON template')
const book = parseStorybookDocument(JSON.parse(template))

it('validates the handoff template and its independent publication preview', () => {
  expect(book.schemaVersion).toBe(6)
  expect(book.protagonistActorId).toBeNull()
  expect(book.characters[0]?.initialKnowledge[0]?.targetActorId).toBe('courier')
  expect(book.characters[0]?.state[0]?.value).toBe(3)
  expect(book.characters[1]?.initialKnowledge).toEqual([])
  const published = parseStorybookDocument(prepareIndependentBook({ title: book.title, document: JSON.parse(template) as Document }))
  expect(published.contextRules.director.tools).toContain('director_command')
  expect(published.contextRules.actor.tools).toContain('npc_commit_turn')
  expect(published.contextRules.actor.tools).not.toContain('roleplay_recall')
})

it.each([4, 5])('rejects obsolete schema version %s in an otherwise valid template', (schemaVersion) => {
  expect(() => parseStorybookDocument({ ...book, schemaVersion })).toThrow()
})

it.each([undefined, null, '', '   '])('preserves an unspecified protagonist (%s) through normalization and publication', (protagonistActorId) => {
  const input = { ...book, protagonistActorId }
  const parsed = parseStorybookDocument(input)
  expect(parsed.protagonistActorId).toBeNull()
  expect(parsed.characters).toHaveLength(2)
  const document = JSON.parse(JSON.stringify(input)) as Document
  expect(parseStorybookDocument(prepareIndependentBook({ title: book.title, document })).protagonistActorId).toBeNull()
  expect(parseStorybookDocument(parsed)).toEqual(parsed)
})

it('retains a selected character, clears it explicitly, and rejects dangling protagonist references', () => {
  const selected = parseStorybookDocument({ ...book, protagonistActorId: 'courier' })
  expect(selected.protagonistActorId).toBe('courier')
  expect(parseStorybookDocument({ ...selected, protagonistActorId: null }).protagonistActorId).toBeNull()
  expect(() => parseStorybookDocument({ ...book, protagonistActorId: 'missing-person' })).toThrow('unknown protagonist actorId')
})

it('rejects old state objects and private cognition fields', () => {
  const actor = book.characters[0]!
  expect(() => parseStorybookDocument({ ...book, characters: [{ ...actor, state: {} }, book.characters[1]] })).toThrow()
  for (const field of ['beliefs', 'relationships', 'initialEmotion']) {
    expect(() => parseStorybookDocument({ ...book,
      characters: [{ ...actor, privateContext: { ...actor.privateContext, [field]: [] } }, book.characters[1]],
    })).toThrow()
  }
})

it('rejects unknown identity references and mismatched initial state values', () => {
  const actor = book.characters[0]!
  expect(() => parseStorybookDocument({ ...book, characters: [{ ...actor,
    initialKnowledge: [{ text: 'Unknown person', kind: 'identity', label: 'Unknown', targetActorId: 'missing' }],
  }, book.characters[1]] })).toThrow()
  expect(() => parseStorybookDocument({ ...book, characters: [{ ...actor,
    state: [{ ...actor.state[0], value: 6 }],
  }, book.characters[1]] })).toThrow()
})
