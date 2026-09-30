/** Reconnecting play streams use authoritative query views rather than exposing domain event payloads. */
import type { InstanceChanges, PlayQueries, PlayView } from '@deepseek-ai/dsh-roleplay-core'
import type { PlayFollowRequest } from './types.ts'

/** Slow readers coalesce revision notices and read a fresh bounded, audience-filtered snapshot. */
export class PlayFeed {
  private readonly lifetime = new AbortController()
  constructor(private readonly changes: InstanceChanges, private readonly queries: Pick<PlayQueries, 'read'>) {}

  /** Yield an opening snapshot and subsequent revisions; every reconnect starts from current truth. */
  async *follow(request: PlayFollowRequest, signal: AbortSignal): AsyncIterable<PlayView> {
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    combined.throwIfAborted()
    let revision = -1
    let dirty = true
    let wake: (() => void) | undefined
    const changed = (): void => { dirty = true; wake?.() }
    const remove = this.changes.subscribe(request.instanceId, changed)
    const abort = (): void => { remove(); changed() }
    combined.addEventListener('abort', abort, { once: true })
    try {
      while (!combined.aborted) {
        if (dirty) {
          dirty = false
          const view = this.queries.read(request)
          if (view.revision > revision) { revision = view.revision; yield view }
          continue
        }
        await new Promise<void>((resolve) => { wake = resolve })
        wake = undefined
      }
    } finally {
      combined.removeEventListener('abort', abort)
      if (!combined.aborted) remove()
    }
  }

  /** Close all waiting streams when the owning RPC entry is disposed. */
  dispose(): void { this.lifetime.abort('Play feed disposed') }
}
