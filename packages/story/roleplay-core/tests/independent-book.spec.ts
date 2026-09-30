/** Version publication must not prescribe tools absent from the independent execution protocol. */
import { expect, it } from 'vitest'
import { prepareIndependentBook } from '../src/independent-book.ts'
import { DEFAULT_STORYBOOK_CONTEXT_RULES } from '../src/storybook-defaults.ts'
import { parseStorybookDocument } from '../src/storybook.ts'

const draft = { title: 'Ledger', document: { schemaVersion: 6, id: 'ledger', title: 'Old title', characters: [],
  directorPrompt: '', directorGuidance: {} } }

it('previews the independent tools while leaving the original author draft unchanged', () => {
  const original = structuredClone(draft)
  const book = parseStorybookDocument(prepareIndependentBook(draft))
  expect(book.title).toBe('Ledger')
  expect(book.contextRules.director.tools).toContain('director_command')
  expect(book.contextRules.director.tools).toContain('director_observe')
  expect(book.contextRules.director.tools).not.toContain('director_stage_scene')
  expect(book.contextRules.actor.tools).toContain('narrative_recall')
  expect(book.contextRules.actor.tools).not.toContain('roleplay_recall')
  expect(draft).toEqual(original)
  expect(prepareIndependentBook({ title: draft.title, document: prepareIndependentBook(draft) })).toEqual(prepareIndependentBook(draft))
})

it('preserves explicit author guidance and rejects non-JSON story settings', () => {
  const book = parseStorybookDocument(prepareIndependentBook({ ...draft, document: { ...draft.document,
    contextRules: { ...DEFAULT_STORYBOOK_CONTEXT_RULES, director: { ...DEFAULT_STORYBOOK_CONTEXT_RULES.director, tools: 'My deliberate custom tools wording.' } } } }))
  expect(book.contextRules.director.tools).toBe('My deliberate custom tools wording.')
  expect(() => parseStorybookDocument({ ...draft.document, setting: { clock: () => 0 } })).toThrow()
})
