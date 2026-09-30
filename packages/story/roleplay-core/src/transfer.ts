/** Archive coordination collects execution evidence outside the narrative storage transaction. */
import { castOf, json } from './world.ts'
import { RoleplayError } from './records.ts'
import type { NarrativeArchives } from './archive.ts'
import type { CommandId, Instance, InstanceId, Json, NarrativeReader } from './types.ts'

/** Harness owns the interpretation and capture of complete technical logs. */
export interface ExecutionEvidenceReader {
  exportEvidence(instanceId: InstanceId, actorIds: readonly string[]): Promise<Array<{ id: string; content: Json }>>
}

/** Portable exports pin one narrative revision; imported evidence is never installed as a live session. */
export class NarrativeTransfer {
  constructor(private readonly narrative: NarrativeReader, private readonly archives: Pick<NarrativeArchives, 'export' | 'import'>,
    private readonly execution: ExecutionEvidenceReader) {}

  /** Capture evidence before exporting; concurrent narrative edits require a fresh export request. */
  async export(instanceId: InstanceId, expectedRevision: number): Promise<Json> {
    const snapshot = this.narrative.snapshot(instanceId)
    if (snapshot.instance.revision !== expectedRevision) throw new RoleplayError('conflict', 'Export revision changed')
    const evidence = await this.execution.exportEvidence(instanceId, castOf(snapshot).entries.map(item => item.definition.actorId))
    if (this.narrative.snapshot(instanceId).instance.revision !== expectedRevision) throw new RoleplayError('conflict', 'Story changed while collecting export evidence')
    return json(this.archives.export(instanceId, evidence))
  }

  /** Validate portable data and create one independent instance under a stable import identity. */
  import(archive: Json, commandId: CommandId): Instance { return this.archives.import(archive, commandId).instance }
}
