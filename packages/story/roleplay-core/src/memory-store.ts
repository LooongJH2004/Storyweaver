/* eslint-disable typescript/no-unnecessary-type-parameters -- Record decoding is selected by the application's scoped storage contract. */
/** Detached transactional storage for command and failure tests without Cordis. */
import type { RoleplayStore, Transaction } from './types.ts'
import { canonical, compareRecordKeys } from './records.ts'

/** In-memory provider preserves the same rollback and read-isolation contract as SQLite. */
export class MemoryRoleplayStore implements RoleplayStore {
  private records = new Map<string, unknown>()
  private closed = false
  private writing = false
  private reading = 0
  private draft: Map<string, unknown> | undefined
  /** Optional deterministic failure injected before publication, never after partial changes. */
  beforeCommit?: (() => void) | undefined

  read<T>(operation: (transaction: Transaction) => T): T {
    if (this.closed) throw new Error('Narrative store is closed')
    const view = this.view(this.draft ?? this.records, false)
    this.reading++
    try {
      const result = operation(view.transaction)
      if (result instanceof Promise) throw new Error('Narrative reads must be synchronous')
      return result
    } finally { view.release(); this.reading-- }
  }
  transaction<T>(operation: (transaction: Transaction) => T): T {
    if (this.writing || this.reading > 0) throw new Error('Narrative transactions cannot nest')
    if (this.closed) throw new Error('Narrative store is closed')
    this.writing = true
    const draft = structuredClone(this.records)
    this.draft = draft
    const view = this.view(draft, true)
    try {
      const result = operation(view.transaction)
      if (result instanceof Promise) throw new Error('Narrative transactions must be synchronous')
      this.beforeCommit?.()
      this.records = draft
      return result
    } finally { view.release(); this.writing = false; this.draft = undefined }
  }
  close(): void {
    if (this.writing || this.reading > 0) throw new Error('Narrative store cannot close during a transaction')
    this.closed = true
  }

  private view(records: Map<string, unknown>, writable: boolean): { transaction: Transaction; release(): void } {
    let active = true
    const check = (write = false): void => {
      if (this.closed || !active) throw new Error('Narrative transaction is closed')
      if (write && !writable) throw new Error('Read-only narrative transaction')
    }
    const key = (scope: string, collection: string, id: string): string => JSON.stringify([scope, collection, id])
    return { release: () => { active = false }, transaction: {
      get: <T>(scope: string, collection: string, id: string): T | undefined => {
        check(); return structuredClone(records.get(key(scope, collection, id))) as T | undefined
      },
      put: (scope, collection, id, value) => { check(true); records.set(key(scope, collection, id), JSON.parse(canonical(value))) },
      remove: (scope, collection, id) => { check(true); records.delete(key(scope, collection, id)) },
      scan: <T>(scope: string, collection: string) => {
        check()
        return [...records].flatMap(([encoded, value]) => {
          const parts = JSON.parse(encoded) as [string, string, string]
          return parts[0] === scope && parts[1] === collection ? [{ key: parts[2], value: structuredClone(value) as T }] : []
        }).sort((a, b) => compareRecordKeys(a.key, b.key))
      },
    } }
  }
}
