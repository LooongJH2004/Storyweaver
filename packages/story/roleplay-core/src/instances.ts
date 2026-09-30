/** Version-pinned instance creation is independent of execution-session provisioning. */
import { StorybookLibrary } from './library.ts'
import { initializeWorld } from './world.ts'
import type { CommandId, InstanceId, NarrativeSnapshot, NarrativeReader, RuntimeValues, TemplateVersionId } from './types.ts'

/** Instance creation consumes the published baseline once; restart never copies runtime data. */
export class InstanceApplication {
  constructor(private readonly books: StorybookLibrary, private readonly queries: NarrativeReader,
    private readonly values: RuntimeValues) {}

  /** Create one independent instance, retryable under a stable host command identity. */
  createStory(input: { templateVersionId: TemplateVersionId; commandId: CommandId }): NarrativeSnapshot {
    return this.books.createStory(input, version => initializeWorld(version, this.values))
  }

  /** Restart from the original published version, even after a newer publication exists. */
  restart(input: { instanceId: InstanceId; commandId: CommandId }): NarrativeSnapshot {
    const source = this.queries.snapshot(input.instanceId)
    return this.createStory({ templateVersionId: source.instance.templateVersionId, commandId: input.commandId })
  }
}
