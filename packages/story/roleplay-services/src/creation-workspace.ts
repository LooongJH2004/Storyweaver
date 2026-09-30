/** Author task preferences are separate from book documents and live story instances. */
import { isAbsolute } from 'node:path'
import { stat } from 'node:fs/promises'
import { z } from 'zod'
import type { BookId, RoleplayStore } from '@deepseek-ai/dsh-roleplay-core/types'
import type { StorybookLibrary } from '@deepseek-ai/dsh-roleplay-core'

const preferences = z.strictObject({ revision: z.number().int().nonnegative(), cwd: z.string().nullable(),
  prompt: z.string(), role: z.enum(['system', 'user', 'assistant']), enabled: z.boolean() })
/** Saved author guidance and explicitly selected local workspace. */
export type CreationPreferences = z.infer<typeof preferences>
const initial: CreationPreferences = { revision: 0, cwd: null, prompt: 'Collaborate with the player to develop settings, characters, private knowledge, opening scenes, dynamic states, performance guidance, and context rules. Preserve the player’s creative intent and ask focused questions when needed.', role: 'system', enabled: true }

/** Application owner for independent creation defaults and per-book task overrides. */
export class CreationWorkspace {
  constructor(private readonly store: RoleplayStore, private readonly books: StorybookLibrary) {}
  /** Resolve a task or workspace default without writing during reads. */
  read(bookId?: BookId): CreationPreferences {
    if (bookId !== undefined) { const book = this.books.draft(bookId); if (book === undefined || book.deleted) throw new Error('Storybook draft is unavailable') }
    const saved = this.store.read(tx => tx.get<CreationPreferences>('creation', bookId === undefined ? 'defaults' : 'tasks', bookId ?? 'current'))
    if (saved !== undefined) return preferences.parse(saved)
    return bookId === undefined ? { ...initial } : { ...this.read(), revision: 0, cwd: null }
  }
  /** Save explicit guidance; the task workspace becomes immutable after its first save. */
  async save(bookId: BookId | undefined, input: CreationPreferences): Promise<CreationPreferences> {
    const next = preferences.parse(input)
    if (next.cwd !== null && (!isAbsolute(next.cwd) || !(await stat(next.cwd)).isDirectory())) throw new Error('Select an existing absolute local directory')
    return this.store.transaction((tx) => {
      const current = this.read(bookId)
      if (current.revision !== next.revision) throw new Error('Creation preferences changed; reload before saving')
      if (bookId !== undefined && current.revision > 0 && current.cwd !== next.cwd) throw new Error('A creation task keeps its original workspace; start a new task to select another directory')
      const saved = { ...next, revision: next.revision + 1 }
      tx.put('creation', bookId === undefined ? 'defaults' : 'tasks', bookId ?? 'current', saved)
      return saved
    })
  }
}
