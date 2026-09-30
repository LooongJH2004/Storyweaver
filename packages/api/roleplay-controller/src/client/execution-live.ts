/** Live execution mirrors own subscription lifetimes and never mix author perspectives. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { RemoteStreamItem } from '@deepseek-ai/dsh-api-gateway/client'
import type { ExecutionLiveRequest, ExecutionLiveView } from '@deepseek-ai/dsh-roleplay-core/types'

/** The Gateway supervises reconnection; the mirror owns the selected diagnostic audience. */
export interface ExecutionSubscription extends AsyncIterable<RemoteStreamItem<ExecutionLiveView>> { dispose(): Promise<void> }
/** Technical drafts remain separate from the accepted play mirror. */
export interface ExecutionLiveSnapshot {
  readonly request: ExecutionLiveRequest | null
  readonly view: ExecutionLiveView | null
  readonly loading: boolean
  readonly error: string | null
}

/** Subscribe only on explicit author inspection and clear private output before switching. */
export class ExecutionLiveModel {
  private readonly state = createSnapshotStore<ExecutionLiveSnapshot>({ request: null, view: null, loading: false, error: null })
  readonly snapshot = this.state
  private generation = 0
  private disposed = false
  private stream: ExecutionSubscription | undefined
  private readonly closing = new Set<Promise<void>>()
  private readonly failures: unknown[] = []
  constructor(private readonly open: (request: ExecutionLiveRequest) => ExecutionSubscription) {}

  /** Switch diagnostic ownership before opening its technical stream. */
  follow(request: ExecutionLiveRequest): void {
    if (this.disposed) throw new Error('Live execution mirror disposed')
    this.stop()
    const generation = this.generation
    this.state.set({ request, view: null, loading: true, error: null })
    try {
      const stream = this.open(request)
      this.stream = stream
      void this.consume(stream, request, generation)
    } catch (error) { this.failed(generation, error) }
  }

  /** Closing a diagnostic panel immediately clears its private content. */
  stop(): void {
    this.generation++
    const stream = this.stream; this.stream = undefined
    if (stream !== undefined) this.close(stream)
    this.state.set({ request: null, view: null, loading: false, error: null })
  }

  /** Wait for owned subscriptions to close before releasing the client service. */
  async dispose(): Promise<void> {
    this.disposed = true; this.stop()
    await Promise.allSettled(this.closing)
    if (this.failures.length > 0) throw new AggregateError(this.failures, 'Execution subscription disposal failed')
  }

  private async consume(stream: ExecutionSubscription, request: ExecutionLiveRequest, generation: number): Promise<void> {
    let revision = -1
    try {
      for await (const frame of stream) {
        if (this.disposed || generation !== this.generation) return
        const view = frame.value
        if (view.scope.instanceId !== request.instanceId || view.scope.actorId !== request.actorId || view.scope.revision < revision
          || view.request !== null && (view.request.scope.instanceId !== request.instanceId
            || view.request.scope.actorId !== request.actorId || view.request.scope.revision !== view.scope.revision))
          throw new Error('Live execution changed its narrative perspective')
        revision = view.scope.revision
        this.state.set({ request, view, loading: false, error: null }); frame.accept()
      }
      if (!this.disposed && generation === this.generation) throw new Error('Execution stream ended before cancellation')
    } catch (error) { this.failed(generation, error) }
    finally { if (this.stream === stream) { this.stream = undefined; this.close(stream) } }
  }

  private failed(generation: number, error: unknown): void {
    if (!this.disposed && generation === this.generation) this.state.update((state) => {
      Object.assign(state, { loading: false, error: error instanceof Error ? error.message : String(error) })
    })
  }
  private close(stream: ExecutionSubscription): void {
    const closing = stream.dispose().finally(() => { this.closing.delete(closing) })
    this.closing.add(closing)
    void closing.catch((error: unknown) => { this.failures.push(error) })
  }
}
