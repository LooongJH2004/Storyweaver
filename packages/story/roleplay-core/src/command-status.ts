/** Retry decisions distinguish committed fiction from terminal execution attempts. */
import type { NarrativeCommands } from './commands.ts'
import { entity } from './records.ts'
import { directorRunSchema, discussionRunSchema, executionSchema } from './world.ts'
import type { CommandId, InstanceId, CommandStatus } from './types.ts'

/** Resolve accepted identities without asking an Actor or parsing a Session. */
export class CommandStatusQueries {
  constructor(private readonly narrative: Pick<NarrativeCommands, 'snapshot' | 'receipt'>) {}

  /** Inspect only the command stored in the selected independent instance. */
  read(instanceId: InstanceId, commandId: CommandId): CommandStatus {
    const snapshot = this.narrative.snapshot(instanceId)
    const receipt = this.narrative.receipt(instanceId, commandId)
    if (receipt === undefined) return { acceptedRevision: null, execution: 'none' }
    const result = { acceptedRevision: receipt.revision }
    if (receipt.command.kind === 'execution.open') {
      const opened = executionSchema.parse(receipt.result)
      if (this.narrative.receipt(instanceId, `turn:${opened.attempt}` as CommandId) !== undefined)
        return { ...result, execution: 'completed' }
      const current = executionSchema.safeParse(entity(snapshot, { collection: 'execution', id: opened.actorId }))
      if (!current.success || current.data.attempt !== opened.attempt || snapshot.instance.epoch !== opened.epoch)
        return { ...result, execution: 'cancelled' }
      return { ...result, execution: current.data.status === 'committed' ? 'completed' : current.data.status }
    }
    if (receipt.command.kind === 'director.open' || receipt.command.kind === 'discussion.run') {
      const schema = receipt.command.kind === 'director.open' ? directorRunSchema : discussionRunSchema
      const opened = schema.parse(receipt.result)
      if (receipt.command.kind === 'director.open') {
        if (this.narrative.receipt(instanceId, `director-result:${opened.id}` as CommandId) !== undefined)
          return { ...result, execution: 'completed' }
        if (this.narrative.receipt(instanceId, `director-failure:${opened.id}` as CommandId) !== undefined)
          return { ...result, execution: 'failed' }
      }
      const current = schema.safeParse(entity(snapshot, { collection: 'run', id: receipt.command.kind === 'director.open' ? 'director' : 'discussion' }))
      if (!current.success || current.data.id !== opened.id || snapshot.instance.epoch !== opened.epoch)
        return { ...result, execution: 'cancelled' }
      const status = current.data.status
      return { ...result, execution: status === 'failed' ? 'failed' : status === 'paused' ? 'cancelled'
        : ['running', 'preparing', 'dispatching'].includes(status) ? 'running' : 'completed' }
    }
    return { ...result, execution: 'none' }
  }
}
