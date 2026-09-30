import { actorExecutionSessionId, directorExecutionSessionId, backgroundMemorySessionId } from './narrative-executor.ts'
import { SessionPersistenceNotFoundError } from '@deepseek-ai/dsh-session-persistence'
import type { Json, InstanceId } from '@deepseek-ai/dsh-roleplay-core/types'
import type { ExecutionHistoryScope, ExecutionRequestPage, ExecutionRequestDetail } from '@deepseek-ai/dsh-roleplay-core/types'
import type { ExecutionLiveView } from '@deepseek-ai/dsh-roleplay-core/types'
import { indexExecutionRequests } from './execution-request-index.ts'
import { portableRequests, portableRequestSchema } from './portable-requests.ts'
import { executionResponse } from './execution-response.ts'
import { sumExecutionUsage } from './execution-usage.ts'
import type { ExecutionUsageTotals } from '@deepseek-ai/dsh-roleplay-core/types'
/** Harness-owned inspection of the actual historical model request. */
import { Context, Service } from '@deepseek-ai/cordis'
import { materializeRequestHeaderAt, type SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { Message } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'

const retentionSchema = z.strictObject({ recent: z.number().int().nonnegative(), pending: z.number().int().nonnegative(),
  notes: z.number().int().nonnegative(), archived: z.number().int().nonnegative() })

/** Execution coordinates contain no fictional ownership or reconstructed current state. */
export interface HistoricalRequest {
  readonly sessionId: SessionId
  readonly beforeEventSeq: number
  readonly headerSeq: number
  readonly turn: number
  readonly step: number
  readonly provider: string
  readonly model: string
  readonly requestJson: string
  readonly retention?: z.infer<typeof retentionSchema>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    roleplayRequests: HarnessRequestHistory
  }
}

/** The caller authorizes instance ownership before resolving technical execution evidence. */
export class HarnessRequestHistory extends Service {
  static inject = ['sessions', 'sessionPersistence', 'llm']

  /** @param ctx - Harness log reader and the original sender serializers. */
  constructor(ctx: Context) {
    super(ctx, 'roleplayRequests')
    ctx.effect(() => () => { this.lifetime.abort('Request history disposed') })
  }
  private readonly lifetime = new AbortController()

  /** Whole-story accounting reads native logs without provisioning or resuming execution. */
  async usage(instanceId: InstanceId, actorIds: readonly string[], archived: readonly { id: string; content: Json }[]):
  Promise<ExecutionUsageTotals> {
    const logs: Array<{ id: string; events: readonly SessionEvent[] }> = []
    const ids = [directorExecutionSessionId(instanceId), backgroundMemorySessionId(instanceId),
      ...actorIds.flatMap(actorId => [actorExecutionSessionId(instanceId, actorId), backgroundMemorySessionId(instanceId, actorId)])]
    for (const id of new Set(ids)) {
      const live = this.ctx.sessions.get(id)
      if (live !== undefined) { logs.push({ id, events: live.events }); continue }
      try { logs.push({ id, events: (await this.ctx.sessionPersistence.inspect(id)).events }) }
      catch (error) { if (!(error instanceof SessionPersistenceNotFoundError)) throw error }
    }
    for (const item of archived) {
      const value = item.content
      if (value === null || typeof value !== 'object' || Array.isArray(value)
        || value.format !== 'harness-session-evidence') continue
      const record = z.object({ session: z.object({ meta: z.object({ id: z.string() }),
        events: z.array(z.object({ seq: z.number().int().nonnegative(), time: z.number(),
          type: z.string(), data: z.json() })) }) }).parse(value)
      logs.push({ id: record.session.meta.id, events: record.session.events as SessionEvent[] })
    }
    return sumExecutionUsage(logs)
  }

  /** Coalesce technical event notices; slow readers receive the latest recorded draft. */
  async *follow(resolveScope: () => ExecutionHistoryScope, signal: AbortSignal): AsyncIterable<ExecutionLiveView> {
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    combined.throwIfAborted()
    const sessionId = this.requestSession(resolveScope())
    let dirty = true
    let wake: (() => void) | undefined
    const changed = (): void => { dirty = true; wake?.() }
    const remove = this.ctx.on('session/event', (session, event) => {
      if (session.id === sessionId && ['assistant/chunk', 'request/header', 'roleplay/execution-request', 'roleplay/execution-receipt', 'turn/end'].includes(event.type)) changed()
    })
    combined.addEventListener('abort', changed, { once: true })
    try {
      while (!combined.aborted) {
        if (dirty) {
          dirty = false
          const scope = resolveScope()
          const events = await this.requestEvents(scope)
          const entries = indexExecutionRequests(events, scope)
          const first = entries[0]
          const request = first === undefined ? null : await this.readRequest(scope, first.summary.requestId, [])
          combined.throwIfAborted()
          yield { scope, request, previousResponses: entries.filter(entry => entry.summary.attempt === first?.summary.attempt
            && entry.summary.requestId !== first.summary.requestId).reverse().map(entry => ({ requestId: entry.summary.requestId,
            step: entry.summary.step, response: executionResponse(events, entry.summary.requestId) })) }
          continue
        }
        await new Promise<void>((resolve) => { wake = resolve })
        wake = undefined
      }
    } finally { remove(); combined.removeEventListener('abort', changed) }
  }

  /** List historical requests without provisioning sessions or accepting caller-supplied session IDs. */
  async listRequests(scope: ExecutionHistoryScope, offset: number, limit: number,
    archived: readonly { id: string; content: Json }[]): Promise<ExecutionRequestPage> {
    const entries = [...indexExecutionRequests(await this.requestEvents(scope), scope), ...portableRequests(scope, archived)]
      .sort((a, b) => b.summary.revision - a.summary.revision || b.summary.requestId - a.summary.requestId)
    return { scope, entries: entries.slice(offset, offset + limit).map(entry => entry.summary), total: entries.length,
      nextOffset: offset + limit < entries.length ? offset + limit : null }
  }

  /** Reconstruct only an indexed request belonging to the authorized narrative perspective. */
  async readRequest(scope: ExecutionHistoryScope, requestId: number, archived: readonly { id: string; content: Json }[],
    evidenceId?: string): Promise<ExecutionRequestDetail> {
    if (evidenceId !== undefined) {
      const entry = portableRequests(scope, archived).find(item =>
        item.summary.evidenceId === evidenceId && item.summary.requestId === requestId)
      if (entry === undefined) throw new Error('Archived request is unavailable for this narrative perspective')
      if (entry.body.kind === 'unavailable') throw new Error(entry.body.reason)
      if (entry.response === undefined) return { scope, request: entry.summary, requestJson: entry.body.json }
      const { finishReason, ...response } = entry.response
      return { scope, request: entry.summary, requestJson: entry.body.json,
        response: { ...response, ...(finishReason === undefined ? {} : { finishReason }) } }
    }
    const events = await this.requestEvents(scope)
    const entries = indexExecutionRequests(events, scope)
    const entry = entries.find(value => value.summary.requestId === requestId)
    if (entry === undefined) throw new Error('Recorded request is unavailable for this narrative perspective')
    const request = this.inspectEvents({ sessionId: this.requestSession(scope), beforeEventSeq: entry.beforeEventSeq }, events)
    return { scope, request: entry.summary, requestJson: request.requestJson, response: executionResponse(events, requestId) }
  }

  private requestSession(scope: ExecutionHistoryScope): SessionId {
    return scope.actorId === undefined ? directorExecutionSessionId(scope.instanceId)
      : actorExecutionSessionId(scope.instanceId, scope.actorId)
  }

  private async requestEvents(scope: ExecutionHistoryScope) {
    const id = this.requestSession(scope)
    const live = this.ctx.sessions.get(id)
    if (live !== undefined) return live.events
    try { return (await this.ctx.sessionPersistence.inspect(id)).events }
    catch (error) { if (error instanceof SessionPersistenceNotFoundError) return []; throw error }
  }

  /** Capture existing execution boundaries; characters without sessions contribute no coordinate. */
  async capture(instanceId: InstanceId, actorIds: readonly string[]): Promise<Json> {
    const entries = []
    for (const identity of [...actorIds.map(actorId => ({ actorId, role: 'actor', sessionId: actorExecutionSessionId(instanceId, actorId) })),
      { role: 'director', sessionId: directorExecutionSessionId(instanceId) }]) {
      const sessionId = identity.sessionId
      const live = this.ctx.sessions.get(sessionId)
      if (live !== undefined) {
        await this.ctx.sessions.flush(live)
        entries.push({ ...identity, beforeEventSeq: live.events.length })
        continue
      }
      try {
        const stored = await this.ctx.sessionPersistence.inspect(sessionId)
        entries.push({ ...identity, beforeEventSeq: stored.events.length })
      } catch (error) { if (!(error instanceof SessionPersistenceNotFoundError)) throw error }
    }
    return { entries }
  }

  /** Export complete immutable technical evidence without provisioning or resuming any Agent. */
  async exportEvidence(instanceId: InstanceId, actorIds: readonly string[]): Promise<Array<{ id: string; content: Json }>> {
    const evidence: Array<{ id: string; content: Json }> = []
    const identities = [
      ...actorIds.flatMap(actorId => [actorExecutionSessionId(instanceId, actorId), backgroundMemorySessionId(instanceId, actorId)]
        .map(sessionId => ({ actorId, sessionId }))),
      ...[directorExecutionSessionId(instanceId), backgroundMemorySessionId(instanceId)]
        .map(sessionId => ({ actorId: undefined, sessionId })),
    ]
    for (const { actorId, sessionId } of identities) {
      const live = this.ctx.sessions.get(sessionId)
      if (live !== undefined) await this.ctx.sessions.flush(live)
      let source
      try { source = await this.ctx.sessionPersistence.borrowSession(sessionId) }
      catch (error) { if (error instanceof SessionPersistenceNotFoundError) continue; throw error }
      try {
        evidence.push({ id: sessionId, content: z.json().parse({ format: 'harness-session-evidence', instanceId, session: source.inspection }) })
        const scope = { instanceId, revision: Number.MAX_SAFE_INTEGER, ...(actorId === undefined ? {} : { actorId }) }
        for (const entry of indexExecutionRequests(source.inspection.events, scope)) {
          let body: z.infer<typeof portableRequestSchema>['body']
          try { body = { kind: 'recorded', json: (await this.inspect({ sessionId, beforeEventSeq: entry.beforeEventSeq })).requestJson } }
          catch (error) { body = { kind: 'unavailable', reason: error instanceof Error ? error.message : String(error) } }
          evidence.push({ id: `${sessionId}:request:${entry.summary.requestId}`, content: z.json().parse(portableRequestSchema.parse({
            format: 'harness-request-evidence-v1', instanceId, ...(actorId === undefined ? {} : { actorId }), request: entry.summary, body,
            response: executionResponse(source.inspection.events, entry.summary.requestId),
          })) })
        }
      }
      finally { source[Symbol.dispose]() }
    }
    return evidence
  }

  /**
   * Inspect recorded headers without creating or restoring an Actor.
   * @param request - authorized execution Session and exclusive event boundary.
   * @returns the sender's exact serialized request with its recorded coordinates.
   */
  async inspect(request: { readonly sessionId: SessionId; readonly beforeEventSeq: number }): Promise<HistoricalRequest> {
    const session = this.ctx.sessions.get(request.sessionId)
    const events = session?.events ?? (await this.ctx.sessionPersistence.inspect(request.sessionId)).events
    return this.inspectEvents(request, events)
  }

  private inspectEvents(request: { readonly sessionId: SessionId; readonly beforeEventSeq: number },
    events: readonly SessionEvent[]): HistoricalRequest {
    const value = materializeRequestHeaderAt(events, request.beforeEventSeq)
    const header = value.header
    const requestJson = this.ctx.llm.reconstructRequest({ ...header.config,
      messages: [...header.prefixContextMessages ?? [], ...header.historyMessages, ...header.contextMessages ?? []],
      ...header.system === undefined ? {} : { system: header.system },
      ...header.tools === undefined ? {} : { tools: [...header.tools] }, sessionId: request.sessionId,
    })
    return { ...request, headerSeq: value.headerSeq, turn: value.turn, step: value.step,
      provider: header.config.provider, model: header.config.model, requestJson,
      ...retentionStats(header.contextMessages ?? []) }
  }
}

function retentionStats(messages: readonly Message[]): Pick<HistoricalRequest, 'retention'> {
  for (const message of messages) for (const block of message.content) {
    if (block.type === 'text' && block.text.startsWith('[CONTEXT RETENTION]\n')) {
      return { retention: retentionSchema.parse(JSON.parse(block.text.slice('[CONTEXT RETENTION]\n'.length))) }
    }
  }
  return {}
}

export default HarnessRequestHistory
