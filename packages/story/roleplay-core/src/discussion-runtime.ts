import { playerActor } from './player-control.ts'
import { pendingWorldAttempts } from './world-attempts.ts'
/** Bounded discussion scheduling depends on a character executor port, never on Agent objects. */
import { currentDiscussion } from './discussions.ts'
import { canonical, entity, RoleplayError } from './records.ts'
import { json, replace, discussionRunSchema } from './world.ts'
import type { ActorRuntime } from './runtime.ts'
import type { NarrativeCommands } from './commands.ts'
import type { CommandId, CommandScope, InstanceId, NarrativeCommit, NarrativeSnapshot, RuntimeValues } from './types.ts'

export { discussionRunSchema } from './world.ts'
/** A bounded run returns an explicit stopping reason, not invented percentage progress. */
export type { DiscussionRunView } from './types.ts'
import type { DiscussionRunView } from './types.ts'

/** Execute floor owners serially so every request sees the previous accepted narrative revision. */
export class DiscussionRuntime {
  private readonly running = new Map<InstanceId, { commandId: CommandId; fingerprint: string; done: Promise<DiscussionRunView> }>()
  constructor(private readonly commands: NarrativeCommands, private readonly actors: Pick<ActorRuntime, 'run' | 'cancel' | 'prepareDiscussion' | 'consolidateDiscussion'>,
    private readonly values: RuntimeValues, private readonly turnLimit: number) {
    if (!Number.isSafeInteger(turnLimit) || turnLimit < 1) throw new RoleplayError('invalid', 'Discussion turn limit must be a positive integer')
  }

  /**
   * Advance preparation and public speech until a real stop condition or configured bound.
   * @param scope - host authorization and the current narrative revision.
   * @returns durable run state, which includes accepted preparations and speech turns.
   */
  advance(scope: CommandScope): Promise<DiscussionRunView> {
    const fingerprint = canonical(scope)
    const running = this.running.get(scope.instanceId)
    if (running !== undefined) {
      if (running.commandId !== scope.id) return Promise.reject(new RoleplayError('conflict', 'Discussion is already advancing'))
      if (running.fingerprint !== fingerprint) return Promise.reject(new RoleplayError('duplicate-command', 'Running command identity was reused'))
      return running.done
    }
    const done = this.perform(scope).finally(() => { this.running.delete(scope.instanceId) })
    this.running.set(scope.instanceId, { commandId: scope.id, fingerprint, done })
    return done
  }

  private async perform(scope: CommandScope): Promise<DiscussionRunView> {
    const opened = this.commands.execute({ ...scope, kind: 'discussion.run', input: { turnLimit: this.turnLimit } }, (snapshot) => {
      if (scope.principal.kind !== 'player' && scope.principal.kind !== 'director') throw new RoleplayError('invalid', 'Only the host may advance a discussion')
      if (currentDiscussion(snapshot) === undefined) throw new RoleplayError('invalid', 'No unfinished discussion')
      const previous = entity(snapshot, { collection: 'run', id: 'discussion' })
      if (previous !== undefined && discussionRunSchema.parse(previous).status === 'running') {
        throw new RoleplayError('conflict', 'Pause the previous discussion attempt before continuing')
      }
      const run: DiscussionRunView = { id: this.values.id(), epoch: snapshot.instance.epoch, status: 'running', completedTurns: 0 }
      return { events: [replace('run', 'discussion', run)], result: json(run) }
    })
    const attempt = discussionRunSchema.parse(opened.result)
    let current = this.read(scope.instanceId)
    if (current.id !== attempt.id || current.epoch !== attempt.epoch) throw new RoleplayError('stale-execution', 'Discussion attempt was superseded')
    if (current.status !== 'running') return current
    try {
      while (current.completedTurns < this.turnLimit) {
        const snapshot = this.commands.snapshot(scope.instanceId)
        if (snapshot.instance.epoch !== attempt.epoch) throw new RoleplayError('stale-execution', 'Discussion was interrupted')
        const discussion = currentDiscussion(snapshot)
        if (discussion === undefined) return this.finish(snapshot, current, 'completed')
        if (discussion.status === 'awaiting-player') return this.finish(snapshot, current, 'waiting-player')
        if (discussion.status === 'summarizing') {
          await this.actors.consolidateDiscussion({ ...scope, id: `${attempt.id}:consolidation` as CommandId,
            expectedRevision: snapshot.instance.revision })
          const after = this.commands.snapshot(scope.instanceId)
          if (after.instance.epoch !== attempt.epoch) throw new RoleplayError('stale-execution', 'Discussion consolidation was interrupted')
          return this.finish(after, current, 'awaiting-director')
        }
        if (pendingWorldAttempts(snapshot).some(item => discussion.participantIds.includes(item.actorId))) {
          return this.finish(snapshot, current, 'awaiting-director')
        }
        const pending = discussion.preparationPendingIds?.slice(0, this.turnLimit - current.completedTurns) ?? []
        if (pending.length > 0) {
          await this.actors.prepareDiscussion({ instanceId: scope.instanceId, id: `${attempt.id}:${current.completedTurns}` as CommandId,
            expectedRevision: snapshot.instance.revision, principal: { kind: 'director', epoch: attempt.epoch, attempt: attempt.id } }, pending)
          const after = this.commands.snapshot(scope.instanceId)
          if (after.instance.epoch !== attempt.epoch) throw new RoleplayError('stale-execution', 'Discussion was interrupted')
          current = this.finish(after, { ...current, completedTurns: current.completedTurns + pending.length }, 'running')
          continue
        }
        const actorId = discussion.preparationPendingIds?.[0] ?? discussion.currentSpeakerId
        if (actorId === undefined) throw new RoleplayError('invalid', 'Discussion has no eligible floor owner')
        if (actorId === playerActor(snapshot)) return this.finish(snapshot, current, 'waiting-player')
        await this.actors.run({ instanceId: scope.instanceId, id: `${attempt.id}:${current.completedTurns}` as CommandId,
          expectedRevision: snapshot.instance.revision, principal: { kind: 'director', epoch: attempt.epoch, attempt: attempt.id } }, actorId)
        const after = this.commands.snapshot(scope.instanceId)
        if (after.instance.epoch !== attempt.epoch) throw new RoleplayError('stale-execution', 'Discussion was interrupted')
        current = this.finish(after, { ...current, completedTurns: current.completedTurns + 1 }, 'running')
      }
      return this.finish(this.commands.snapshot(scope.instanceId), current, 'yielded')
    } catch (error) {
      const snapshot = this.commands.snapshot(scope.instanceId)
      if (snapshot.instance.epoch === attempt.epoch) this.finish(snapshot, current, 'failed', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /** Pause invalidates the old execution epoch before asking the model adapter to cancel. */
  pause(scope: CommandScope, reason: string): NarrativeCommit { return this.actors.cancel(scope, reason) }

  /** Read the run projection without restoring any technical execution session. */
  read(instanceId: InstanceId): DiscussionRunView {
    return discussionRunSchema.parse(entity(this.commands.snapshot(instanceId), { collection: 'run', id: 'discussion' }))
  }

  private finish(snapshot: NarrativeSnapshot, current: DiscussionRunView, status: DiscussionRunView['status'], failure?: string): DiscussionRunView {
    const next = { ...current, status, ...(failure === undefined ? {} : { failure }) }
    this.commands.execute({ instanceId: snapshot.instance.id, expectedRevision: snapshot.instance.revision,
      id: this.values.id() as CommandId, principal: { kind: 'system', operation: 'discussion-progress' }, kind: 'discussion.progress', input: json(next) }, () => ({
      events: [replace('run', 'discussion', next)], result: null,
    }))
    return next
  }
}
