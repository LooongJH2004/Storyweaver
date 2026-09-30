/** Author detail mirrors accept one exact narrative revision and never restore model sessions. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { RoleplayRemote } from './index.ts'
import type { InstanceId, CharacterCognitionView, RetentionReviewView, ActorContextView, DirectorContextView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { NarrativeRecallView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeRecallInput } from '@deepseek-ai/dsh-roleplay-core/command-inputs'
import type { ExecutionHistoryScope, ExecutionRequestPage, ExecutionRequestDetail } from '@deepseek-ai/dsh-roleplay-core/types'

/** A detail read belongs to the author-selected person or director at one revision. */
export interface InspectionRequest {
  readonly instanceId: InstanceId
  readonly revision: number
  readonly actorId?: string
  readonly instruction?: string
}
/** Exact-revision detail data has no implicit initial-state fallback. */
export interface InspectionSnapshot {
  readonly request: InspectionRequest | null
  readonly cognition: CharacterCognitionView | null
  readonly retention: RetentionReviewView | null
  readonly context: ActorContextView | DirectorContextView | null
  readonly checkpoints: readonly { name: string; revision: number }[]
  readonly loading: boolean
  readonly error: string | null
  readonly recalled: NarrativeRecallView | null
  readonly requests: ExecutionRequestPage | null
  readonly actualRequest: ExecutionRequestDetail | null
}
const unwrap = <T>(result: RemoteResult<T>): T => {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}
/** Browser data ownership is separate from view selection and editable drafts. */
export class RoleplayInspection {
  private readonly state = createSnapshotStore<InspectionSnapshot>({ request: null, cognition: null, retention: null,
    context: null, checkpoints: [], loading: false, error: null, recalled: null, requests: null, actualRequest: null })
  readonly snapshot = this.state
  private generation = 0
  private disposed = false
  constructor(private readonly remote: Pick<RoleplayRemote, 'cognition' | 'retention' | 'contextPreview' | 'directorContextPreview' | 'checkpoints' | 'recall' | 'executionRequests' | 'executionRequest'>) {}

  /** Clear another person's details immediately, then publish a consistent complete response. */
  async inspect(request: InspectionRequest): Promise<void> {
    if (this.disposed) throw new Error('Author inspection disposed')
    const generation = ++this.generation
    this.state.set({ request, cognition: null, retention: null, context: null, checkpoints: [], loading: true,
      error: null, recalled: null, requests: null, actualRequest: null })
    try {
      const [cognition, retention, context, checkpoints] = await Promise.all([
        request.actorId === undefined ? Promise.resolve(null)
          : this.remote.cognition({ ...request, actorId: request.actorId }).then(unwrap),
        this.remote.retention({ ...request, owner: request.actorId === undefined ? 'director' : `actor:${request.actorId}` }).then(unwrap),
        request.actorId === undefined ? this.remote.directorContextPreview({ ...request, instruction: request.instruction ?? '' }).then(unwrap)
          : this.remote.contextPreview({ ...request, actorId: request.actorId, query: '' }).then(unwrap),
        this.remote.checkpoints({ instanceId: request.instanceId }).then(unwrap),
      ])
      if (!this.current(generation)) return
      const owner = request.actorId === undefined ? 'director' : `actor:${request.actorId}`
      const contextMatches = request.actorId === undefined ? 'role' in context
        : 'actorId' in context && context.actorId === request.actorId
      if (!contextMatches || retention.owner !== owner || context.instanceId !== request.instanceId
        || retention.instanceId !== request.instanceId
        || cognition !== null && (cognition.instanceId !== request.instanceId || cognition.actorId !== request.actorId)
        || [retention, context, ...(cognition === null ? [] : [cognition])].some(value => value.revision !== request.revision)) {
        throw new Error('Author detail revision changed')
      }
      this.state.update((state) => {
        Object.assign(state, { request, cognition, retention, context, checkpoints, loading: false, error: null })
      })
    } catch (error) {
      if (this.current(generation)) this.state.update((state) => {
        Object.assign(state, { loading: false, error: error instanceof Error ? error.message : String(error) })
      })
    }
  }
  private recallGeneration = 0
  /** Retrieve original records at the inspected revision; switching perspective rejects late pages. */
  async recall(input: NarrativeRecallInput): Promise<void> {
    const request = this.state.getSnapshot().request
    if (request === null || this.disposed) throw new Error('No active author inspection')
    const generation = this.generation
    const query = ++this.recallGeneration
    this.state.update((state) => { Object.assign(state, { recalled: null, error: null }) })
    try {
      const recalled = unwrap(await this.remote.recall({ ...request,
        owner: request.actorId === undefined ? 'director' : `actor:${request.actorId}`, input }))
      if (!this.current(generation) || query !== this.recallGeneration) return
      if (recalled.revision !== request.revision) throw new Error('Original records changed revision')
      this.state.update((state) => { Object.assign(state, { recalled }) })
    } catch (error) {
      if (this.current(generation) && query === this.recallGeneration) this.state.update((state) => {
        Object.assign(state, { error: error instanceof Error ? error.message : String(error) })
      })
    }
  }
  private current(generation: number): boolean { return !this.disposed && generation === this.generation }
  private requestGeneration = 0

  /** Recorded turn inspection does not rebuild today's author context, cognition or retention. */
  async inspectRecorded(request: InspectionRequest, limit: number): Promise<void> {
    if (this.disposed) throw new Error('Author inspection disposed')
    const generation = ++this.generation
    this.requestGeneration++
    this.state.set({ request, cognition: null, retention: null, context: null, checkpoints: [], loading: true,
      error: null, recalled: null, requests: null, actualRequest: null })
    try {
      const requests = unwrap(await this.remote.executionRequests({ ...request, offset: 0, limit }))
      if (!this.current(generation)) return
      const first = requests.entries[0]
      const actualRequest = first === undefined ? null : unwrap(await this.remote.executionRequest({ ...request,
        requestId: first.requestId, ...(first.evidenceId === undefined ? {} : { evidenceId: first.evidenceId }) }))
      if (!this.current(generation)) return
      for (const scope of [requests.scope, ...(actualRequest === null ? [] : [actualRequest.scope])]) {
        if (scope.instanceId !== request.instanceId || scope.revision !== request.revision || scope.actorId !== request.actorId)
          throw new Error('Execution evidence belongs to another narrative perspective')
      }
      this.state.update((state) => { Object.assign(state, { requests, actualRequest, loading: false }) })
    } catch (error) {
      if (this.current(generation)) this.state.update((state) => {
        Object.assign(state, { loading: false, error: error instanceof Error ? error.message : String(error) })
      })
    }
  }

  /** Read actual request pages; later perspective changes invalidate both list and detail responses. */
  async executionRequests(offset: number, limit: number): Promise<void> {
    await this.executionQuery(async (scope) => {
      const requests = unwrap(await this.remote.executionRequests({ ...scope, offset, limit }))
      return { scope: requests.scope, values: { requests, actualRequest: null } }
    }, true)
  }

  /** Resolve an adapter-issued request coordinate, never an arbitrary technical session. */
  async executionRequest(requestId: number, evidenceId?: string): Promise<void> {
    await this.executionQuery(async (scope) => {
      const actualRequest = unwrap(await this.remote.executionRequest({ ...scope, requestId,
        ...(evidenceId === undefined ? {} : { evidenceId }) }))
      return { scope: actualRequest.scope, values: { actualRequest } }
    }, false)
  }

  private async executionQuery(query: (scope: InspectionRequest) => Promise<{
    scope: ExecutionHistoryScope
    values: Partial<Pick<InspectionSnapshot, 'requests' | 'actualRequest'>>
  }>, clearPage: boolean): Promise<void> {
    const request = this.state.getSnapshot().request
    if (request === null || this.disposed) throw new Error('No active author inspection')
    const generation = this.generation; const sequence = ++this.requestGeneration
    this.state.update((state) => { Object.assign(state, { actualRequest: null, error: null, ...(clearPage ? { requests: null } : {}) }) })
    try {
      const result = await query(request)
      if (!this.current(generation) || sequence !== this.requestGeneration) return
      if (result.scope.instanceId !== request.instanceId || result.scope.revision !== request.revision
        || result.scope.actorId !== request.actorId)
        throw new Error('Execution evidence belongs to another narrative perspective')
      this.state.update((state) => { Object.assign(state, result.values) })
    } catch (error) {
      if (this.current(generation) && sequence === this.requestGeneration) this.state.update((state) => {
        Object.assign(state, { error: error instanceof Error ? error.message : String(error) })
      })
    }
  }
  /** Reject late queries after the owning browser service is released. */
  dispose(): void { this.disposed = true; this.generation++ }
}
