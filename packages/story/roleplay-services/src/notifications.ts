/** Durable outbox delivery supplies content-free revision notices to transport consumers. */
import type { NarrativeDeliveries, InstanceChanges, InstanceId, InstanceChange } from '@deepseek-ai/dsh-roleplay-core'

/** One owned timer drains accepted commits serially; delivery failures remain in the outbox. */
export class NarrativeNotifications implements InstanceChanges {
  private readonly listeners = new Map<InstanceId, Set<(change: InstanceChange) => void>>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private pending: Promise<void> | undefined
  private stopped = false

  constructor(private readonly deliveries: Pick<NarrativeDeliveries, 'drain'>, private readonly intervalMs: number,
    private readonly failed: (error: unknown) => void) {
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) throw new Error('Notification interval must be a positive integer')
    this.schedule()
  }

  /** Subscribe by instance; no private event content crosses this notification channel. */
  subscribe(instanceId: InstanceId, listener: (change: InstanceChange) => void): () => void {
    if (this.stopped) throw new Error('Narrative notifications are disposed')
    let listeners = this.listeners.get(instanceId)
    if (listeners === undefined) { listeners = new Set(); this.listeners.set(instanceId, listeners) }
    listeners.add(listener)
    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      listeners.delete(listener)
      if (listeners.size === 0) this.listeners.delete(instanceId)
    }
  }

  /** Stop future delivery and wait for the current outbox transaction sequence before closing storage. */
  async dispose(): Promise<void> {
    this.stopped = true
    if (this.timer !== undefined) clearTimeout(this.timer)
    await this.pending
    this.listeners.clear()
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      this.pending = this.deliveries.drain((commit) => {
        const change: InstanceChange = { instanceId: commit.command.instanceId, commitId: commit.id, revision: commit.revision }
        for (const listener of this.listeners.get(change.instanceId) ?? []) listener(change)
        return Promise.resolve()
      }).catch(this.failed).finally(() => { if (!this.stopped) this.schedule() })
    }, this.intervalMs)
  }
}
