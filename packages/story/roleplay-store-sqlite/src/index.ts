/* eslint-disable typescript/no-unnecessary-type-parameters -- Record decoding is selected by the application's scoped storage contract. */
/** One dedicated SQLite database owns roleplay commits and their atomic projections. */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { canonical, compareRecordKeys } from '@deepseek-ai/dsh-roleplay-core'
import type { RoleplayStore, Transaction } from '@deepseek-ai/dsh-roleplay-core'
export { embeddedResourceVerifier } from './resources.ts'

/** Dedicated narrative database version; older databases are never silently converted. */
export const ROLEPLAY_SQLITE_VERSION = 1
/** SQLite application identity prevents confusing a general KV database with narrative data. */
export const ROLEPLAY_SQLITE_APPLICATION_ID = 0x52504c59
/** Explicit deployment policy for a dedicated narrative connection. */
export interface SqliteRoleplayConfig {
  readonly path: string
  readonly journalMode: 'wal' | 'delete' | 'truncate' | 'persist'
  readonly busyTimeoutMs: number
}

/** Atomic provider for narrative records, published baselines, and the delivery outbox. */
export class SqliteRoleplayStore implements RoleplayStore {
  private readonly database: DatabaseSync
  private writing = false
  private reading = false
  private closed = false

  constructor(config: SqliteRoleplayConfig) {
    const { path } = config
    if (!['wal', 'delete', 'truncate', 'persist'].includes(config.journalMode)
      || !Number.isSafeInteger(config.busyTimeoutMs) || config.busyTimeoutMs < 0 || config.busyTimeoutMs > 2_147_483_647) {
      throw new Error('Invalid narrative SQLite journal or lock timeout policy')
    }
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.database = new DatabaseSync(path)
    try {
      const version = Number(this.database.prepare('PRAGMA user_version').get()?.user_version)
      const applicationId = Number(this.database.prepare('PRAGMA application_id').get()?.application_id)
      const objects = this.database.prepare("SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all()
      const pristine = version === 0 && applicationId === 0 && objects.length === 0
      if (!pristine && (version !== ROLEPLAY_SQLITE_VERSION || applicationId !== ROLEPLAY_SQLITE_APPLICATION_ID
        || objects.length !== 1 || objects[0]?.name !== 'narrative_records' || objects[0].type !== 'table')) {
        throw new Error(`Unsupported roleplay database version ${version}; preserve the original and select a new data directory`)
      }
      this.database.exec(`PRAGMA busy_timeout = ${config.busyTimeoutMs}; PRAGMA journal_mode = ${config.journalMode}; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;`)
      if (pristine) this.database.exec(`BEGIN IMMEDIATE; CREATE TABLE narrative_records (
        scope TEXT NOT NULL, collection TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)),
        PRIMARY KEY(scope, collection, key)
      ) WITHOUT ROWID; PRAGMA application_id = ${ROLEPLAY_SQLITE_APPLICATION_ID}; PRAGMA user_version = ${ROLEPLAY_SQLITE_VERSION}; COMMIT;`)
    } catch (error) { this.database.close(); throw error }
  }

  read<T>(operation: (transaction: Transaction) => T): T {
    if (this.closed) throw new Error('Narrative store is closed')
    const view = this.view(false)
    const owned = !this.reading && !this.writing
    if (owned) { this.database.exec('BEGIN'); this.reading = true }
    try {
      const result = operation(view.transaction)
      if (result instanceof Promise) throw new Error('Narrative reads must be synchronous')
      return result
    } finally {
      view.release()
      if (owned) { this.database.exec('ROLLBACK'); this.reading = false }
    }
  }
  transaction<T>(operation: (transaction: Transaction) => T): T {
    if (this.closed) throw new Error('Narrative store is closed')
    if (this.writing || this.reading) throw new Error('Narrative transactions cannot nest')
    this.writing = true
    let started = false
    const view = this.view(true)
    try {
      this.database.exec('BEGIN IMMEDIATE')
      started = true
      const result = operation(view.transaction)
      if (result instanceof Promise) throw new Error('Narrative transactions must be synchronous')
      this.database.exec('COMMIT')
      started = false
      return result
    } catch (error) {
      if (started) this.database.exec('ROLLBACK')
      throw error
    } finally { view.release(); this.writing = false }
  }
  close(): void {
    if (this.writing || this.reading) throw new Error('Narrative store cannot close during a transaction')
    if (!this.closed) { this.database.close(); this.closed = true }
  }

  private view(writable: boolean): { transaction: Transaction; release(): void } {
    let active = true
    const check = (write = false): void => {
      if (this.closed || !active) throw new Error('Narrative transaction is closed')
      if (write && !writable) throw new Error('Read-only narrative transaction')
    }
    return { release: () => { active = false }, transaction: {
      get: <T>(scope: string, collection: string, key: string): T | undefined => {
        check()
        const row = this.database.prepare('SELECT value FROM narrative_records WHERE scope = ? AND collection = ? AND key = ?')
          .get(scope, collection, key)
        return row === undefined ? undefined : JSON.parse(String(row.value)) as T
      },
      put: (scope, collection, key, value) => {
        check(true)
        this.database.prepare('INSERT INTO narrative_records(scope,collection,key,value) VALUES (?,?,?,?) ON CONFLICT(scope,collection,key) DO UPDATE SET value = excluded.value')
          .run(scope, collection, key, canonical(value))
      },
      remove: (scope, collection, key) => {
        check(true)
        this.database.prepare('DELETE FROM narrative_records WHERE scope = ? AND collection = ? AND key = ?').run(scope, collection, key)
      },
      scan: <T>(scope: string, collection: string) => {
        check()
        return this.database.prepare('SELECT key,value FROM narrative_records WHERE scope = ? AND collection = ? ORDER BY key')
          .all(scope, collection).map(row => ({ key: String(row.key), value: JSON.parse(String(row.value)) as T }))
          .sort((a, b) => compareRecordKeys(a.key, b.key))
      },
    } }
  }
}
