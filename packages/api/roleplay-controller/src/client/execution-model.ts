/** The API client owns the execution-settings mirror and orders concurrent reads. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ExecutionModelSelection, ExecutionModelView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { RoleplayRemote } from './index.ts'

/** Last reviewed execution settings and the status of the latest read or write. */
export interface ExecutionModelSnapshot { view: ExecutionModelView | null; loading: boolean; error: string | null }
/** Settings errors preserve the prior reviewed value so component drafts can be retained. */
export class ExecutionModelMirror {
  readonly snapshot = createSnapshotStore<ExecutionModelSnapshot>({ view: null, loading: false, error: null })
  private generation = 0
  private disposed = false
  constructor(private readonly remote: Pick<RoleplayRemote, 'executionModel' | 'selectExecutionModel'>) {}
  /** @returns Completion after the latest host preference is mirrored. */
  refresh(): Promise<void> { return this.perform(() => this.remote.executionModel()) }
  /** @param revision - Reviewed host settings revision.
   * @param selection - Exact model route selected by the player.
   * @returns Completion after the successful write is mirrored; rejects while preserving a failed draft.
   */
  save(revision: number, selection: ExecutionModelSelection): Promise<void> {
    return this.perform(() => this.remote.selectExecutionModel({ expectedRevision: revision, selection }))
  }
  /** Prevent pending responses from changing a disposed mirror. */
  dispose(): void { this.disposed = true; this.generation++ }
  private current(generation: number): boolean { return !this.disposed && generation === this.generation }
  private async perform(operation: () => ReturnType<RoleplayRemote['executionModel']>): Promise<void> {
    if (this.disposed) throw new Error('Execution model mirror is disposed')
    const generation = ++this.generation
    this.snapshot.update((state) => { state.loading = true; state.error = null })
    try {
      const result = await operation()
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      if (this.current(generation)) this.snapshot.set({ view: result.value, loading: false, error: null })
    } catch (error) {
      if (this.current(generation)) this.snapshot.update((state) => {
        state.loading = false; state.error = String(error)
      })
      throw error
    }
  }
}
