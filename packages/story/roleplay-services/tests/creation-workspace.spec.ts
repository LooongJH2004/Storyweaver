/** Task preferences bind explicit local access without mutating authored content. */
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { MemoryRoleplayStore, StorybookLibrary } from '@deepseek-ai/dsh-roleplay-core'
import type { BookId } from '@deepseek-ai/dsh-roleplay-core/types'
import { CreationWorkspace } from '../src/creation-workspace.ts'

it('copies defaults only on task creation, checks revisions and locks each chosen workspace', async () => {
  const store = new MemoryRoleplayStore()
  const books = new StorybookLibrary(store, { id: () => 'id', now: () => '2026-09-08' }, { verify() {} }, value => value.document)
  const book = books.saveDraft({ id: 'defaults' as BookId, expectedRevision: 0, title: 'Test', document: {}, resources: [] })
  const preferences = new CreationWorkspace(store, books)
  const initial = preferences.read()
  await preferences.save(undefined, { ...initial, prompt: 'Default A', role: 'user' })
  expect(preferences.read(book.id)).toMatchObject({ revision: 0, prompt: 'Default A', cwd: null })
  const task = await preferences.save(book.id, { ...preferences.read(book.id), cwd: tmpdir() })
  await preferences.save(undefined, { ...preferences.read(), prompt: 'Default B' })
  expect(preferences.read(book.id)).toEqual(task)
  await expect(preferences.save(book.id, { ...task, revision: 0 })).rejects.toThrow('changed')
  await expect(preferences.save(book.id, { ...task, cwd: null })).rejects.toThrow('original workspace')
  await expect(preferences.save(book.id, { ...task, cwd: 'relative' })).rejects.toThrow('absolute')
  expect(books.draft(book.id)).toEqual(book)
  await preferences.save(book.id, { ...task, enabled: false, prompt: 'Task-specific' })
  expect(preferences.read(book.id)).toMatchObject({ enabled: false, prompt: 'Task-specific', cwd: tmpdir() })
  books.remove(book.id, book.revision)
  expect(() => preferences.read(book.id)).toThrow('unavailable')
})
