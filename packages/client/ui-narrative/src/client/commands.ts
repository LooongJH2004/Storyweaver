/** Browser command attempts retain their identity after an uncertain transport response. */
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { CommandId } from '@deepseek-ai/dsh-roleplay-core/types'

/** One user operation can retry its exact request; a changed payload receives a new identity. */
export class CommandAttempts {
  private readonly pending = new Map<string, CommandId>()
  private readonly revisions = new Map<string, number>()
  /** A feed may advance after acceptance but before the original RPC response arrives.
   * @param intent - operation and payload, excluding the moving current revision.
   * @param revision - revision reviewed for the first attempt.
   * @param execute - sends the frozen revision and command identity.
   * @returns the original accepted result on an exact retry.
   */
  async atRevision<T>(intent: object, revision: number, execute: (id: CommandId, revision: number) => Promise<T>): Promise<T> {
    const key = JSON.stringify(intent)
    const reviewed = this.revisions.get(key) ?? revision
    this.revisions.set(key, reviewed)
    const result = await this.run({ intent, revision: reviewed }, id => execute(id, reviewed))
    this.revisions.delete(key)
    return result
  }
  /** Run an immutable request and retain only unsuccessful attempts.
   * @param payload - complete command payload, including its reviewed revision.
   * @param execute - typed RPC callback.
   * @returns the accepted command result.
   */
  async run<T>(payload: object, execute: (id: CommandId) => Promise<T>): Promise<T> {
    const key = JSON.stringify(payload)
    const id = this.pending.get(key) ?? randomUUID() as CommandId
    this.pending.set(key, id)
    const result = await execute(id)
    this.pending.delete(key)
    return result
  }

  /** Release only an attempt whose rejection or terminal execution the application has confirmed.
   * @param intent - the unchanged operation and payload.
   * @param revision - revision frozen for that failed command.
   * @param id - original command identity, protecting a subsequent attempt from late responses.
   */
  retryable(intent: object, revision: number, id: CommandId): void {
    const key = JSON.stringify(intent)
    const payload = JSON.stringify({ intent, revision })
    if (this.pending.get(payload) !== id || this.revisions.get(key) !== revision) return
    this.pending.delete(payload)
    this.revisions.delete(key)
  }
}
