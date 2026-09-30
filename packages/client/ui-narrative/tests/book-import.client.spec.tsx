// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BookImport, readBookImport } from '../src/client/BookImport.tsx'
import { en } from '../src/client/locales.ts'
import type { NarrativeProps } from '../src/client/contract.ts'

afterEach(cleanup)

it('preserves document and resource bytes while distinguishing malformed packages and run archives', () => {
  const document = { schemaVersion: 6, title: 'The inn', characters: [] }
  const resources = [{ path: 'cover.png', digest: 'sha256:stored', base64: 'YQ==' }]
  expect(readBookImport(JSON.stringify(document))).toEqual({ document, resources: [] })
  expect(readBookImport(JSON.stringify({ format: 'storyweaver-book', version: 1, document, resources }))).toEqual({ document, resources })
  expect(() => readBookImport('null')).toThrow('importObjectError')
  expect(() => readBookImport('{')).toThrow(SyntaxError)
  expect(() => readBookImport('{"formatVersion":1,"initial":{}}')).toThrow('importWrongArchive')
  expect(() => readBookImport('{"format":"storyweaver-book","version":2}')).toThrow('importVersionError')
  expect(() => readBookImport('{"format":"storyweaver-book","version":1,"document":null}')).toThrow('importDocumentError')
})

it('keeps a rejected import available for retry and opens only an accepted draft', async () => {
  const saveBook = vi.fn<NarrativeProps['saveBook']>().mockRejectedValueOnce(new Error('characters.0.appearance is missing')).mockImplementation(async input => ({ ...input, revision: 1, deleted: false }))
  const done = vi.fn()
  const importing = vi.fn()
  // This isolated dialog consumes only locale, save, close and completion callbacks.
  const props = { t: (key: keyof typeof en) => en[key], saveBook, actions: { importBooks: importing } } as unknown as NarrativeProps
  render(<BookImport {...props} done={done} />)
  fireEvent.click(screen.getByText('Or paste JSON'))
  fireEvent.change(screen.getByLabelText('Storybook document JSON'), { target: { value: '{"schemaVersion":6,"title":"The inn","characters":[]}' } })
  fireEvent.click(screen.getByRole('button', { name: 'Inspect import' }))
  expect(saveBook).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Validate and import draft' }))
  await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('characters.0.appearance') })
  expect(done).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Validate and import draft' }))
  await waitFor(() => { expect(done).toHaveBeenCalledOnce() })
  expect(saveBook.mock.calls[0]?.[0].id).toBe(saveBook.mock.calls[1]?.[0].id)
  expect(importing).toHaveBeenCalledWith(false)
})
