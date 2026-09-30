/** Author diagnostics delegate technical log interpretation to the execution adapter. */
import { RoleplayError } from './records.ts'
import { personOf } from './world.ts'
import type { NarrativeReader, ExecutionHistoryScope, ExecutionRequestPage, ExecutionRequestDetail, Json, InstanceId } from './types.ts'
import type { ExecutionLiveRequest, ExecutionLiveView } from './types.ts'
import type { ExecutionUsageTotals } from './types.ts'

/** Opaque imported records are selected by the narrative instance before adapter interpretation. */
export type ArchivedExecutionEvidence = readonly { id: string; content: Json }[]

/** Execution evidence can be read without creating or resuming an actor. */
export interface ExecutionHistoryReader {
  usage(instanceId: InstanceId, actorIds: readonly string[], archived: ArchivedExecutionEvidence): Promise<ExecutionUsageTotals>
  follow(scope: () => ExecutionHistoryScope, signal: AbortSignal): AsyncIterable<ExecutionLiveView>
  listRequests(scope: ExecutionHistoryScope, offset: number, limit: number,
    archived: ArchivedExecutionEvidence): Promise<ExecutionRequestPage>
  readRequest(scope: ExecutionHistoryScope, requestId: number, archived: ArchivedExecutionEvidence,
    evidenceId?: string): Promise<ExecutionRequestDetail>
}

/** The author query validates narrative ownership before any technical log is opened. */
export class ExecutionHistoryQueries {
  constructor(private readonly narrative: NarrativeReader, private readonly evidence: ExecutionHistoryReader,
    private readonly pageLimit: number, private readonly archives: { evidence(id: InstanceId): ArchivedExecutionEvidence }) {
    if (!Number.isSafeInteger(pageLimit) || pageLimit < 1) throw new RoleplayError('invalid', 'Execution page limit must be positive')
  }

  /** Read actual cumulative execution costs, including superseded attempts, for this story's cast. */
  usage(instanceId: InstanceId): Promise<ExecutionUsageTotals> {
    const snapshot = this.narrative.snapshot(instanceId)
    const actorIds = snapshot.entities.filter(item => item.key.collection === 'people').map(item => item.key.id)
    return this.evidence.usage(instanceId, actorIds, this.archives.evidence(instanceId))
  }

  /** List only requests prepared at or before the selected narrative revision. */
  list(scope: ExecutionHistoryScope, offset: number, limit: number): Promise<ExecutionRequestPage> {
    this.validate(scope)
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > this.pageLimit)
      throw new RoleplayError('invalid', 'Invalid execution history page')
    return this.evidence.listRequests(scope, offset, limit, this.archives.evidence(scope.instanceId))
  }

  /** Observe current technical output; every refresh rechecks narrative ownership. */
  follow(request: ExecutionLiveRequest, signal: AbortSignal): AsyncIterable<ExecutionLiveView> {
    const scope = (): ExecutionHistoryScope => {
      const snapshot = this.narrative.snapshot(request.instanceId)
      if (request.actorId !== undefined) personOf(snapshot, request.actorId)
      return { ...request, revision: snapshot.instance.revision }
    }
    scope()
    return this.evidence.follow(scope, signal)
  }

  /** Inspect one adapter-issued coordinate within this exact instance and perspective. */
  read(scope: ExecutionHistoryScope, requestId: number, evidenceId?: string): Promise<ExecutionRequestDetail> {
    this.validate(scope)
    if (!Number.isSafeInteger(requestId) || requestId < 0) throw new RoleplayError('invalid', 'Invalid execution request coordinate')
    return this.evidence.readRequest(scope, requestId, this.archives.evidence(scope.instanceId), evidenceId)
  }

  private validate(scope: ExecutionHistoryScope): void {
    const snapshot = this.narrative.replay(scope.instanceId, scope.revision)
    if (scope.actorId !== undefined) personOf(snapshot, scope.actorId)
  }
}
