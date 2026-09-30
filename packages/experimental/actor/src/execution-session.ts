/** Shared Harness session lifecycle contains execution protocols, never fictional state. */
import type {} from './types.ts'
import { createHash } from 'node:crypto'
import type { Agent, AgentHandle, AgentRegistry } from '@deepseek-ai/dsh-agent'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { ToolArgsError } from '@deepseek-ai/dsh-tools'
import { FIRST_PARTY_SECTION_ORDER } from '@deepseek-ai/dsh-system-prompt'
import type { ActorContextView, DirectorContextView, DirectorReply, Json } from '@deepseek-ai/dsh-roleplay-core'
import type { HarnessActorOptions } from './narrative-executor.ts'
import { jsonDelimiterHint } from './json-delimiter-hint.ts'

/** Frozen application input is also persisted as technical request evidence. */
interface ExecutionRequest { readonly attempt: string; readonly context: ActorContextView | DirectorContextView }
/** A protocol adapter selects its tool schema, language, and response validation. */
export interface ExecutionProtocol<T> {
  tools(execute: (input: T, execution: ToolRunContext) => Promise<Json>, request: ExecutionRequest): readonly ToolDefinition[]
  readonly policy: string | ((request: ExecutionRequest) => string)
  readonly correction: string | ((request: ExecutionRequest) => string)
  readonly summary: string
}

/** Persistent execution sessions are keyed by both instance and narrative identity. */
export class HarnessExecutionSessions<T> {
  private readonly handles = new Map<string, AgentHandle>()
  private readonly active = new Map<string, Promise<void>>()
  private readonly lifetime = new AbortController()

  constructor(private readonly agents: Pick<AgentRegistry, 'create' | 'resume'>, private readonly options: HarnessActorOptions, private readonly protocol: ExecutionProtocol<T>) {}

  execute(request: ExecutionRequest, signal: AbortSignal,
    submit: (callId: string, input: T) => DirectorReply,
    queryTools: (guard: (execution: ToolRunContext) => void) => readonly ToolDefinition[] = () => []): Promise<void> {
    const identity = 'role' in request.context
      ? [request.context.instanceId, 'director', 'execution'] : [request.context.instanceId, request.context.actorId]
    const key = JSON.stringify(this.options.sessionNamespace === undefined ? identity : [...identity, this.options.sessionNamespace])
    if (this.active.has(key)) return Promise.reject(new Error('This narrative already has an active execution'))
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    const done = this.perform(key, request, combined, submit, queryTools).finally(() => { this.active.delete(key) })
    this.active.set(key, done)
    return done
  }

  /** Cancel owned execution before releasing every live session handle. */
  async dispose(): Promise<void> {
    this.lifetime.abort('Execution adapter disposed')
    await Promise.allSettled(this.active.values())
    const results = await Promise.allSettled([...this.handles.values()].map(handle => handle.dispose()))
    this.handles.clear()
    const failures: unknown[] = []
    for (const result of results) if (result.status === 'rejected') failures.push(result.reason)
    if (failures.length > 0) throw new AggregateError(failures, 'Execution session disposal failed')
  }

  private async acquire(key: string, signal: AbortSignal): Promise<Agent> {
    signal.throwIfAborted()
    const existing = this.handles.get(key)
    if (existing !== undefined) return existing.agent
    const id = SessionId(`roleplay-${createHash('sha256').update(key).digest('hex')}`)
    const present = await this.options.exists(id)
    signal.throwIfAborted()
    const handle = present
      ? await this.agents.resume({ resumeSessionId: id, agentOptions: this.options.agentOptions, setup: this.options.setup, signal })
      : await this.agents.create({ sessionId: id, agentOptions: this.options.agentOptions, setup: this.options.setup, signal })
    try {
      signal.throwIfAborted()
      await this.options.flush(handle.agent.session)
      this.handles.set(key, handle)
      return handle.agent
    } catch (error) { await handle.dispose(); throw error }
  }

  private async perform(key: string, request: ExecutionRequest, signal: AbortSignal,
    submit: (callId: string, input: T) => DirectorReply,
    queryTools: (guard: (execution: ToolRunContext) => void) => readonly ToolDefinition[]): Promise<void> {
    const agent = await this.acquire(key, signal)
    if (agent.status !== 'idle') throw new Error('Narrative execution session is busy')
    signal.throwIfAborted()
    const disposers: Array<() => unknown> = []
    let committed = false
    const preparation = { completed: false }
    let corrected = false
    let failure: string | undefined
    const trigger = createUserMessage({ content: [{ type: 'text', text: request.context.text }],
      source: { kind: 'plugin', plugin: 'roleplay-execution', form: 'notice', summary: this.protocol.summary } })
    const groups: Array<{ role: 'system' | 'user' | 'assistant'; text: string }> = []
    for (const section of request.context.sections) {
      const previous = groups.at(-1)
      if (previous?.role === section.role) previous.text += `\n\n${section.content}`
      else groups.push({ role: section.role, text: section.content })
    }
    const recipeMessages = groups.map(group => createMessage({ role: group.role,
      content: [{ type: 'text', text: group.text }], source: { kind: 'plugin', plugin: 'roleplay-execution', form: 'instructions' } }))
    const cancel = (): void => { agent.cancel({ kind: 'hook', reason: 'Narrative execution cancelled' }) }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      agent.session.append('roleplay/execution-request', request)
      const selected = this.options.selection?.()
      if (selected !== undefined) {
        disposers.push(installModelSelection(agent.ctx, { current: selected, assembled: undefined }))
      }
      disposers.push(agent.ctx.tools.presentAs('native'), agent.ctx.tools.restrict({ allow: [] }))
      disposers.push(agent.ctx.on('tools/execute', async (execution, next) => {
        if (typeof execution.arguments === 'string') {
          const call = agent.session.events.findLast(event => event.type === 'tool/call' && event.data.callId === execution.callId)
          const raw = call?.type === 'tool/call' ? call.data.arguments : execution.arguments
          try { JSON.parse(raw) } catch (error) {
            const hint = jsonDelimiterHint(raw)
            throw new ToolArgsError([`Malformed JSON: ${error instanceof Error ? error.message : String(error)}. ${hint ? `${hint} ` : ''}Repair the complete object, including closing braces and brackets, and resend it. No changes were submitted.`])
          }
          throw new ToolArgsError(['Pass a JSON object directly, not an object encoded inside a quoted string. No changes were submitted.'])
        }
        return next()
      }))
      disposers.push(agent.ctx.systemPrompt.suppressRuntimeContext())
      disposers.push(agent.ctx.systemPrompt.section({ name: 'roleplay:narrative', complete: true,
        order: FIRST_PARTY_SECTION_ORDER.ACTOR_POLICY,
        text: typeof this.protocol.policy === 'string' ? this.protocol.policy : this.protocol.policy(request) }))
      disposers.push(agent.ctx.on('agent/pre-step', async ({ step }, next) => {
        const decision = await next()
        return decision.kind === 'enter' && step === 1 ? { ...decision, startsRequestSeries: true } : decision
      }))
      disposers.push(agent.ctx.on('agent/request-history', ({ messages }) => {
        const start = messages.findIndex(message => message.id === trigger.id)
        if (start < 0) throw new Error('Current narrative request is missing its admitted input')
        return Promise.resolve([...recipeMessages, ...messages.slice(start + 1)])
      }, { prepend: true }))
      const guard = (execution: ToolRunContext): void => {
        if (execution.agent !== agent) throw new Error('Submission belongs to another execution')
        signal.throwIfAborted()
        if (failure !== undefined) throw new Error(failure)
        if (preparation.completed) throw new Error('Narrative preparation is already complete')
      }
      for (const tool of queryTools(guard)) disposers.push(agent.ctx.tools.register(tool))
      const submitTool = (input: T, execution: ToolRunContext): Promise<Json> => {
        guard(execution)
        const reply = submit(execution.callId, input)
        if (reply.commit !== undefined) {
          committed = true
          agent.session.append('roleplay/execution-receipt', { attempt: request.attempt, commitId: reply.commit.id,
            instanceId: reply.commit.command.instanceId, revision: reply.commit.revision })
        }
        preparation.completed = reply.complete
        if (reply.failure !== undefined) { failure = reply.failure; execution.concludeTurn() }
        if (preparation.completed) execution.concludeTurn()
        return Promise.resolve(reply.result)
      }
      for (const tool of this.protocol.tools(submitTool, request)) disposers.push(agent.ctx.tools.register(tool))
      disposers.push(agent.ctx.on('agent/turn-stopping', () => {
        if (preparation.completed || failure !== undefined) return
        if (corrected) throw new Error('Narrative stopped without submitting its turn')
        corrected = true
        agent.inject(createUserMessage({ content: [{ type: 'text',
          text: typeof this.protocol.correction === 'string' ? this.protocol.correction : this.protocol.correction(request) }],
        source: { kind: 'plugin', plugin: 'roleplay-execution', form: 'notice', summary: 'Narrative submission required' } }))
      }))
      const eventBoundary = agent.session.events.length
      agent.followup(trigger)
      await agent.whenIdle()
      signal.throwIfAborted()
      if (failure !== undefined) throw new Error(failure)
      if (!preparation.completed) {
        const ended = agent.session.events.slice(eventBoundary).findLast(event => event.type === 'turn/end')
        if (ended?.type === 'turn/end' && ended.data.reason.kind === 'error') {
          throw new Error(ended.data.reason.error.message)
        }
        throw new Error('Execution ended without completing narrative preparation')
      }
      await this.options.flush(agent.session)
    } catch (error) {
      agent.session.append('roleplay/execution-diagnostic', { attempt: request.attempt,
        message: error instanceof Error ? error.message : String(error), committed })
      throw error
    } finally {
      signal.removeEventListener('abort', cancel)
      for (const dispose of disposers.reverse()) await dispose()
    }
  }
}
