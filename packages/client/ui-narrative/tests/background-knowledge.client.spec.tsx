// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { BookFields } from '../src/client/BookFields.tsx'
import { en } from '../src/client/locales.ts'
import { parseStorybookDocument } from '@deepseek-ai/dsh-roleplay-core/storybook'

afterEach(cleanup)

it('saves explicit empty knowledge and personal knowledge without changing private judgments or the shared book', () => {
  const book = parseStorybookDocument({ schemaVersion: 6, id: 'world', title: 'World', directorPrompt: '', directorGuidance: {}, commonKnowledge: ['The moon is blue.'],
    characters: [{ actorId: 'visitor', displayName: 'Visitor', publicPersona: 'A newcomer.', rolePrompt: '',
      actingGuidance: {}, capabilities: ['memory', 'speak'], initialKnowledge: [{ text: 'I came from Earth.' }] }] })
  let saved = JSON.stringify(book)
  const messages: Record<string, string> = en
  function Editor() {
    const [source, setSource] = useState(saved)
    return <BookFields source={source} t={key => messages[key] ?? key} change={(next) => { saved = next; setSource(next) }} />
  }
  render(<Editor />)
  fireEvent.click(screen.getByRole('button', { name: 'Characters' }))
  fireEvent.click(screen.getByRole('button', { name: 'Private cognition and memories' }))
  const toggle = screen.getByLabelText('Inherit the storybook’s shared knowledge')
  expect(toggle).toHaveProperty('checked', true)
  fireEvent.click(toggle)
  expect(parseStorybookDocument(JSON.parse(saved)).characters[0]?.commonKnowledge).toEqual([])
  const input = screen.getByLabelText('This character’s initial ordinary knowledge')
  fireEvent.change(input, { target: { value: 'Electric trains exist on Earth.\n' } })
  fireEvent.blur(input)
  const personal = parseStorybookDocument(JSON.parse(saved))
  expect(personal.characters[0]?.commonKnowledge).toEqual(['Electric trains exist on Earth.'])
  expect(personal.characters[0]?.initialKnowledge).toEqual(book.characters[0]?.initialKnowledge)
  expect(personal.commonKnowledge).toEqual(['The moon is blue.'])
  fireEvent.click(toggle)
  expect(parseStorybookDocument(JSON.parse(saved)).characters[0]?.commonKnowledge).toBeNull()
})
