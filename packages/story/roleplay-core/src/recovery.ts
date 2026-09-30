/** Fictional history restoration owns its commit point; execution recovery is a separate port. */
import { castOf } from './world.ts'
import { RoleplayError } from './records.ts'
import type { NarrativeCommands } from './commands.ts'
import type { CommandScope, CommandId, DirectorRunView, InstanceId, Json, RestoreResult, NarrativeSnapshot } from './types.ts'

/** Technical coordinates and cancellation never become the source of fictional state. */
export interface ExecutionRecovery {
  capture(instanceId: InstanceId, actorIds: readonly string[]): Promise<Json>
  cancel(instanceId: InstanceId, beforeEpoch: number, reason: string): Promise<void>
}

/** Checkpoint/rewrite commands need no live Actor to inspect or restore character records. */
export class RecoveryApplication {
  constructor(private readonly narrative: NarrativeCommands, private readonly execution: ExecutionRecovery) {}

  /** Save a narrative boundary with independently captured execution evidence. */
  async checkpoint(scope: CommandScope, name: string): Promise<NarrativeSnapshot> {
    if (scope.principal.kind !== 'player') throw new RoleplayError('invalid', 'Only the player may save a checkpoint')
    const existing = this.narrative.checkpoints(scope.instanceId).find(item => item.name === name)
    if (existing !== undefined) {
      if (existing.revision !== scope.expectedRevision) throw new RoleplayError('conflict', 'Checkpoint already names another revision')
      return this.narrative.replay(scope.instanceId, existing.revision)
    }
    const snapshot = this.narrative.snapshot(scope.instanceId)
    if (snapshot.instance.revision !== scope.expectedRevision) throw new RoleplayError('conflict', 'Checkpoint revision changed')
    const coordinates = await this.execution.capture(scope.instanceId, castOf(snapshot).entries.map(item => item.definition.actorId))
    return this.narrative.checkpoint(scope.instanceId, name, scope.expectedRevision, coordinates)
  }

  /** Remove a run from the library, retaining its commits and invalidating late execution. */
  async remove(scope: CommandScope, reason: string): Promise<RestoreResult> {
    const receipt = this.narrative.execute({ ...scope, kind: 'instance.remove', input: { reason } }, () => {
      if (scope.principal.kind !== 'player') throw new RoleplayError('invalid', 'Only the player may remove an instance')
      return { events: [{ type: 'instance.removed', reason }], result: {} }
    })
    const removed = this.narrative.replay(scope.instanceId, receipt.revision)
    try { await this.execution.cancel(scope.instanceId, removed.instance.epoch, reason) }
    catch (error) { return { commit: receipt, execution: 'pending', diagnostic: String(error) } }
    return { commit: receipt, execution: 'cancelled' }
  }

  /** Replace a player direction using the currently saved context recipe; retain discarded fiction in history. */
  async rewrite(scope: CommandScope, targetRevision: number, instruction: string,
    resume: (scope: CommandScope, instruction: string) => Promise<DirectorRunView>): Promise<DirectorRunView> {
    if (!Number.isSafeInteger(targetRevision) || targetRevision < 1 || targetRevision > scope.expectedRevision)
      throw new RoleplayError('invalid', 'Select an existing player direction to rewrite')
    const source = this.narrative.replay(scope.instanceId, targetRevision)
    if (!source.entities.some(item => item.key.collection === 'player-input' && typeof item.value === 'object'
      && item.value !== null && !Array.isArray(item.value) && item.value.revision === targetRevision))
      throw new RoleplayError('invalid', 'The selected revision is not a player direction')
    const restored = await this.restore({ ...scope, id: `rewrite-restore:${scope.id}` as CommandId }, targetRevision - 1,
      `Rewrite player direction: ${instruction}`, true)
    if (restored.execution === 'pending') throw new RoleplayError('conflict', 'History restored; execution cancellation is pending. Retry the same edit.')
    return resume({ ...scope, id: `rewrite-resume:${scope.id}` as CommandId, expectedRevision: restored.commit.revision }, instruction)
  }

  /** Append restoration first; even a late execution result is then rejected by the new epoch. */
  async restore(scope: CommandScope, targetRevision: number, reason: string, preserveContextRecipe = false): Promise<RestoreResult> {
    const receipt = this.narrative.restore({ ...scope, kind: 'instance.restore', input: { targetRevision, reason,
      ...preserveContextRecipe ? { preserveContextRecipe: true } : {} } }, targetRevision, reason, preserveContextRecipe)
    const restored = this.narrative.replay(scope.instanceId, receipt.revision)
    try { await this.execution.cancel(scope.instanceId, restored.instance.epoch, reason) }
    catch (error) { return { commit: receipt, execution: 'pending', diagnostic: error instanceof Error ? error.message : String(error) } }
    return { commit: receipt, execution: 'cancelled' }
  }
}
