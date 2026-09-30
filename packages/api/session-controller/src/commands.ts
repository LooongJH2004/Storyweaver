/** Session commands whose activation policy is explicit at each Remote method. */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { agentEvents, type Agent, type ModelSelection as AgentModelSelection } from '@deepseek-ai/dsh-agent'
import { PresetMountError, UnknownPresetError } from '@deepseek-ai/dsh-agent-presets'
import { AttachmentError, admitEncodedImages } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import {
  ReasoningEffortId, createUserMessage, freezeMessage,
} from '@deepseek-ai/dsh-llm'
import type { ContentBlock, MessageSource } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader, UserMessage } from '@deepseek-ai/dsh-session'
import { SessionQueryError, type SessionObservation } from '@deepseek-ai/dsh-session-query'
import { SessionTitleInvalidError } from '@deepseek-ai/dsh-session-title'
import { TypertRemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import { StorySessionOwnershipError } from '@deepseek-ai/dsh-story'
import type { Story, StorySessionOwner } from '@deepseek-ai/dsh-story'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import {
  ApiSessionAgentController,
  ApiSessionCwdConflict,
  ApiSessionNotFound,
  ApiSessionPresetConflict,
  ApiSessionSubagentOwnership,
  apiSessionSubagentOwnershipError,
  hasApiSessionSubagentOwner,
  inspectApiSession,
} from './agent.ts'
import type {
  SessionAttachmentRequest,
  SessionAttachmentValue,
  SessionCancelRequest,
  SessionCancelValue,
  SessionCreateRequest,
  SessionCreateValue,
  SessionForkRequest,
  SessionForkValue,
  SessionPromptRequest,
  SessionPromptValue,
  SessionRenameRequest,
  SessionRenameValue,
  SessionSelectModelRequest,
  SessionSelectModelValue,
  SessionUpdateQueueRequest,
  SessionUpdateQueueValue,
} from './types.ts'

interface SessionReadState {
  readonly id: SessionId
  readonly header: SessionHeader
  readonly events: SessionEvent[]
}

/** Implements Session business commands delegated by the Session Controller Remote service. */
export class SessionCommandController {
  /**
   * @param ctx - Host context carrying Agent, model, attachment, title, and Workspace services.
   * @param agents - sole owner of create, resume, and Session-local model selection.
   * @param defaultCwd - project directory used when create names neither a Workspace nor a cwd.
   * @param requireStory - whether this deployment forbids unowned Sessions.
   */
  constructor(
    private readonly ctx: Context,
    private readonly agents: ApiSessionAgentController,
    private readonly defaultCwd: string,
    private readonly requireStory = false,
  ) {}

  /**
   * Create or idempotently adopt one ordinary Session.
   * @param request - requested identity, location, and Agent preset.
   * @returns the Session identity and resolved preset when configured.
   */
  async create(request: SessionCreateRequest): Promise<SessionCreateValue> {
    const creatorWorkspace = request.storyId !== undefined
      && request.storySessionRole === 'control'
      && request.agentPreset === 'storyweaver-creator'
    if (request.workspaceId !== undefined
      && (request.storyId !== undefined || request.cwd !== undefined)) {
      reject('bad-request', 'session.create accepts workspaceId or a direct cwd, not both', {})
    }
    if (request.storyId !== undefined && request.cwd !== undefined && !creatorWorkspace) {
      reject(
        'bad-request',
        'only a Story creator control Session may use an authorized local cwd; Story scene and Actor Sessions stay in Story runtime',
        {},
      )
    }
    if (request.storyId === undefined
      && (request.storySessionRole !== undefined || request.actorId !== undefined)) {
      reject('bad-request', 'Story Session role and actorId require storyId', {})
    }
    if (this.requireStory && request.storyId === undefined) {
      reject('story-required', 'this deployment creates Sessions only inside a Story', {})
    }
    const sessionId = request.sessionId ?? SessionId(`session-${randomUUID()}`)
    const storyRegistry = this.ctx.get('storyRegistry')
    let story: Story | undefined
    if (request.storyId !== undefined) {
      if (storyRegistry === undefined) {
        reject('story-unavailable', 'Story Session creation is unavailable in this deployment', {})
      }
      story = storyRegistry.get(request.storyId)
      if (story === undefined || story.archivedAt !== undefined) {
        reject('story-not-found', `story "${request.storyId}" not found`, { storyId: request.storyId })
      }
    }
    let workspace: Workspace | undefined
    if (request.workspaceId !== undefined) {
      const workspaceRegistry = this.ctx.get('workspaceRegistry')
      if (workspaceRegistry === undefined) {
        reject('workspace-unavailable', 'Workspace Session creation is unavailable in this deployment', {})
      }
      workspace = workspaceRegistry.get(request.workspaceId)
      if (workspace === undefined) {
        reject('workspace-not-found', `workspace "${request.workspaceId}" not found`, {
          workspaceId: request.workspaceId,
        })
      }
    }
    const cwd = story === undefined
      ? workspace?.path ?? request.cwd ?? this.defaultCwd
      : creatorWorkspace && request.cwd !== undefined
        ? request.cwd
        : storyRegistry?.runtimePath(story.id) ?? this.defaultCwd
    let adopted: Agent
    try {
      adopted = await this.agents.ensureSession(
        sessionId,
        cwd,
        request.sessionId !== undefined,
        request.agentPreset,
      )
    } catch (error) {
      this.rejectCreation(sessionId, error)
    }
    if (workspace !== undefined) {
      try {
        await workspace.attachSession(sessionId)
      } catch (error) {
        reject(
          'workspace-attach-failed',
          `session "${sessionId}" was created but could not attach to workspace "${workspace.id}": ${String(error)}`,
          { sessionId, workspaceId: workspace.id },
        )
      }
    }
    if (story !== undefined && storyRegistry !== undefined) {
      try {
        await storyRegistry.attachSession(
          story.id,
          sessionId,
          request.storySessionRole ?? 'scene',
          request.actorId,
        )
      } catch (error) {
        const code = error instanceof StorySessionOwnershipError
          ? 'story-session-conflict'
          : 'story-attach-failed'
        reject(
          code,
          `session "${sessionId}" was created but could not attach to story "${story.id}": ${String(error)}`,
          { sessionId, storyId: story.id },
        )
      }
    }
    const agentPreset = this.agents.presetForSession(adopted.session)
    return { sessionId, ...(agentPreset === undefined ? {} : { agentPreset }) }
  }

  /**
   * Validate and install one Session-local model selection.
   * @param request - Session identity and requested model selection.
   * @returns the normalized selection installed for the Session.
   */
  async selectModel(request: SessionSelectModelRequest): Promise<SessionSelectModelValue> {
    const agent = await this.resolveAgent(request.sessionId)
    return this.agents.serializeImageAdmission(agent, async () => {
      try {
        const resolved = await this.ctx.llm.resolveCallConfig({
          provider: request.provider,
          model: request.model,
          ...(request.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: ReasoningEffortId(request.reasoningEffort) }),
        })
        const selected: AgentModelSelection = {
          provider: resolved.provider,
          model: resolved.model,
          ...(resolved.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: resolved.reasoningEffort }),
        }
        this.agents.selectForNextRequest(agent, selected)
        try {
          await this.ctx.agentDefaultModel.saveSelection(selected)
        } catch (error) {
          this.ctx.logger.warn(
            `session-controller: model selection changed for the Session but the default was not saved: ${String(error)}`,
          )
        }
        return { selected: { ...selected } }
      } catch (error) {
        if (error instanceof TypertRemoteFailure) throw error
        reject(
          'model-unavailable',
          error instanceof Error ? error.message : String(error),
          { provider: request.provider, model: request.model },
        )
      }
    })
  }

  /**
   * Normalize and append a user-owned Session title.
   * @param request - Session identity and proposed title.
   * @returns the accepted title and durable event sequence.
   */
  async rename(request: SessionRenameRequest): Promise<SessionRenameValue> {
    const agent = await this.resolveAgent(request.sessionId)
    const titles = this.ctx.get('sessionTitle')
    if (titles === undefined) {
      reject('internal', 'renaming is unavailable: this deployment mounts no session-title service', {})
    }
    try {
      const accepted = titles.rename(agent.session, request.title)
      return { title: accepted.title, seq: accepted.eventSeq }
    } catch (error) {
      if (error instanceof SessionTitleInvalidError) {
        reject('title-invalid', error.message, { sessionId: request.sessionId })
      }
      reject(
        'internal',
        `failed to rename session "${request.sessionId}": ${String(error)}`,
        {},
      )
    }
  }

  /**
   * Create a new ordinary Session from one completed-turn prefix.
   * @param request - source Session and optional event anchor.
   * @returns the new Session identity.
   */
  async fork(request: SessionForkRequest): Promise<SessionForkValue> {
    if (request.atSeq !== undefined && request.beforeSeq !== undefined) {
      reject('bad-request', 'atSeq and beforeSeq are mutually exclusive', {})
    }
    if (request.atSeq !== undefined
      && (!Number.isInteger(request.atSeq) || request.atSeq < 0)) {
      reject('bad-request', 'atSeq must be a non-negative integer', {})
    }
    if (request.beforeSeq !== undefined
      && (!Number.isInteger(request.beforeSeq) || request.beforeSeq < 0)) {
      reject('bad-request', 'beforeSeq must be a non-negative integer', {})
    }
    let observed: SessionObservation
    try {
      observed = await this.ctx.sessionQuery.observeSession(request.sessionId)
    } catch (error) {
      if (error instanceof SessionQueryError
        && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
        reject('session-not-found', `session "${request.sessionId}" not found`, {
          sessionId: request.sessionId,
        })
      }
      reject(
        'internal',
        `fork source unavailable for session "${request.sessionId}": ${String(error)}`,
        {},
      )
    }
    using source = observed
    const lastSeq = source.events.at(-1)?.seq ?? -1
    const beforeSeq = request.beforeSeq
    const beforeTurn = beforeSeq === undefined
      ? undefined
      : source.events.find(event => event.type === 'turn/start' && event.seq <= beforeSeq
        && source.events.slice(event.seq + 1, beforeSeq + 1)
          .every(candidate => candidate.type !== 'turn/start'))
    const atSeq = request.atSeq
    const anchoredBoundary = beforeSeq !== undefined
      ? undefined
      : atSeq === undefined
        ? undefined
        : source.events.find(event => event.type === 'turn/end' && event.seq >= atSeq)
    const boundary = anchoredBoundary
      ?? (beforeSeq === undefined && (atSeq === undefined || atSeq > lastSeq)
        ? source.events.findLast(event => event.type === 'turn/end')
        : undefined)
    if (beforeSeq !== undefined && beforeTurn === undefined) {
      reject(
        'fork-unavailable',
        `session "${request.sessionId}" has no turn containing event ${String(beforeSeq)}`,
        { sessionId: request.sessionId },
      )
    }
    if (beforeSeq === undefined && boundary === undefined) {
      reject(
        'fork-unavailable',
        atSeq !== undefined && atSeq <= lastSeq
          ? `session "${request.sessionId}" has not completed the turn containing event ${String(atSeq)}`
          : `session "${request.sessionId}" has no completed turn to fork from`,
        { sessionId: request.sessionId },
      )
    }
    let cut = beforeTurn?.seq ?? (boundary as typeof boundary & { seq: number }).seq + 1
    if (beforeTurn === undefined) {
      while (cut < source.events.length && source.events[cut]?.type !== 'turn/start') cut++
    }
    const storyRegistry = this.ctx.get('storyRegistry')
    const storyOwner = storyRegistry?.storyForSession(source.header.id)
    if (this.requireStory && (storyOwner === undefined || storyOwner.archived)) {
      reject('story-required', `session "${request.sessionId}" does not belong to an active Story`, {
        sessionId: request.sessionId,
      })
    }
    let workspace: Workspace | undefined
    if (storyOwner === undefined) {
      try {
        workspace = await this.forkWorkspace(source.header)
      } catch (error) {
        reject(
          'internal',
          `failed to resolve fork workspace for session "${request.sessionId}": ${String(error)}`,
          {},
        )
      }
    }
    const childId = SessionId(`session-${randomUUID()}`)
    const composition = await this.agents.composeAgent(this.agents.presetForObservation(source))
    try {
      const { provider, model } = this.ctx.agentDefaultModel.currentSelection()
      await this.ctx.agents.create({
        sessionId: childId,
        seed: source.events.slice(0, cut),
        meta: {
          ...(source.header.cwd === undefined ? {} : { cwd: source.header.cwd }),
          parentSession: source.header.id,
          seedLength: cut,
          ...(composition.agentPreset === undefined
            ? {}
            : { agentPreset: composition.agentPreset }),
        },
        agentOptions: { provider, model },
        setup: composition.setup,
      })
    } catch (error) {
      reject(
        'internal',
        `failed to fork session "${request.sessionId}": ${String(error)}`,
        {},
      )
    }
    if (workspace !== undefined) {
      try {
        await workspace.attachSession(childId)
      } catch (error) {
        reject(
          'workspace-attach-failed',
          `session "${childId}" was forked but could not attach to workspace "${workspace.id}": ${String(error)}`,
          { sessionId: childId, workspaceId: workspace.id },
        )
      }
    }
    if (storyOwner !== undefined && storyRegistry !== undefined) {
      await this.attachForkToStory(storyOwner, childId)
    }
    return { sessionId: childId }
  }

  /**
   * Admit one browser prompt after explicit Agent resume and image validation.
   * @param request - Session identity, prompt content, source metadata, and delivery mode.
   * @returns acknowledgement that the Agent accepted the prompt.
   */
  async prompt(request: SessionPromptRequest): Promise<SessionPromptValue> {
    if (request.rewriteBeforeSeq !== undefined
      && (!Number.isSafeInteger(request.rewriteBeforeSeq) || request.rewriteBeforeSeq < 0)) {
      reject('bad-request', 'rewriteBeforeSeq must be a non-negative safe integer', {})
    }
    if (request.rewriteBeforeSeq !== undefined && request.mode !== 'queue') {
      reject(
        'rewrite-unavailable',
        'same-session history rewrite requires queue mode',
        { sessionId: request.sessionId, beforeSeq: request.rewriteBeforeSeq, reason: 'STEER_UNSUPPORTED' },
      )
    }
    const clientTimeZone = request.clientTimeZone === undefined
      ? undefined
      : canonicalClientTimeZone(request.clientTimeZone)
    if (request.clientTimeZone !== undefined && clientTimeZone === undefined) {
      reject(
        'invalid-time-zone',
        'clientTimeZone must be UTC or a valid IANA Area/Location name',
        { value: request.clientTimeZone },
      )
    }
    const agent = await this.resolveAgent(request.sessionId)
    const selection = this.agents.selectionFor(agent).current
    if (!routeServed(this.ctx, selection.provider)) {
      reject(
        'model-unavailable',
        `no adapter serves provider "${selection.provider}"; select a model for this session`,
        { provider: selection.provider, model: selection.model },
      )
    }
    const source: MessageSource = {
      kind: 'user',
      rpcId: request.requestId,
      ...(request.inputIntent === undefined ? {} : { inputIntent: request.inputIntent }),
      ...(clientTimeZone === undefined ? {} : { clientTimeZone }),
      ...(request.rewriteBeforeSeq === undefined ? {} : { rewriteBeforeSeq: request.rewriteBeforeSeq }),
    }
    const hasImage = request.content.some(part => part.type === 'image')
    const admit = async (): Promise<SessionPromptValue> => {
      try {
        if (hasImage) {
          const current = this.agents.selectionFor(agent).current
          const model = await this.ctx.llm.resolveModelInfo(current.provider, current.model)
          if (model.inputModalities !== undefined && !model.inputModalities.includes('image')) {
            reject(
              'attachment-error',
              `Model "${current.model}" does not support image input.`,
              { reason: 'MODEL_DOES_NOT_SUPPORT_IMAGES' },
            )
          }
        }
        const content = await durablePromptContent(this.ctx, request.content)
        const message: UserMessage = createUserMessage({ content, source })
        if (request.rewriteBeforeSeq !== undefined) {
          await agent.runMaintenance(async () => {
            const beforeSeq = request.rewriteBeforeSeq
            if (beforeSeq === undefined) throw new Error('rewrite boundary disappeared during admission')
            if (agent.inbox.hasPending) {
              reject(
                'rewrite-unavailable',
                'same-session history rewrite requires an empty queue',
                { sessionId: request.sessionId, beforeSeq, reason: 'QUEUE_NOT_EMPTY' },
              )
            }
            const target = agent.session.events[beforeSeq]
            if (target?.type !== 'user/message'
              || target.data.source.kind !== 'user'
              || !agent.session.surface.nodes.includes(beforeSeq)) {
              reject(
                'rewrite-unavailable',
                'rewrite target is not a current user message',
                { sessionId: request.sessionId, beforeSeq, reason: 'TARGET_NOT_CURRENT_USER_MESSAGE' },
              )
            }
            try {
              await agentEvents(this.ctx, agent).serial('agent/history-rewrite', { beforeSeq })
            } catch (error: unknown) {
              reject(
                'rewrite-unavailable',
                'a domain attached to this session could not restore the rewrite target',
                {
                  sessionId: request.sessionId,
                  beforeSeq,
                  reason: `DOMAIN_RESTORE_FAILED: ${String(error)}`,
                },
              )
            }
            agent.followup(message)
          })
        } else if (request.mode === 'steer') agent.steer(message)
        else agent.followup(message)
      } catch (error) {
        if (error instanceof TypertRemoteFailure) throw error
        if (error instanceof AttachmentError) {
          reject('attachment-error', error.message, { reason: error.code })
        }
        reject('agent-busy', 'prompt rejected', { reason: String(error) })
      }
      return { accepted: true }
    }
    return hasImage ? this.agents.serializeImageAdmission(agent, admit) : admit()
  }

  /**
   * Read one durable image after proving the Session log references it.
   * @param request - Session and attachment identities used for authorization.
   * @returns the durable attachment reference and base64-encoded bytes.
   */
  async attachment(request: SessionAttachmentRequest): Promise<SessionAttachmentValue> {
    let source: SessionReadState
    try {
      source = await this.readSessionState(request.sessionId)
    } catch (error) {
      if (error instanceof ApiSessionNotFound) {
        reject('session-not-found', error.message, { sessionId: request.sessionId })
      }
      reject(
        'internal',
        `attachment authorization unavailable for session "${request.sessionId}": ${String(error)}`,
        {},
      )
    }
    const ref = referencedImage(source.events, String(request.attachmentId))
    if (ref === undefined) {
      reject(
        'attachment-error',
        'Image is not referenced by this session.',
        { reason: 'ATTACHMENT_NOT_REFERENCED' },
      )
    }
    try {
      const stored = await this.ctx.attachments.readImage(ref)
      return {
        attachment: stored.ref,
        data: Buffer.from(stored.data).toString('base64'),
      }
    } catch (error) {
      if (error instanceof AttachmentError) {
        reject('attachment-error', error.message, { reason: error.code })
      }
      reject('internal', 'Unable to read image attachment.', {})
    }
  }

  /**
   * Mutate one still-pending queue occurrence without resuming a cold Agent.
   * @param request - Session, queue item, and requested mutation.
   * @returns acknowledgement that the queue mutation was applied.
   */
  updateQueue(request: SessionUpdateQueueRequest): SessionUpdateQueueValue {
    if (request.action.kind === 'edit'
      && request.action.content.some(block => block.type !== 'text')) {
      reject(
        'attachment-error',
        'queue edits accept text content only',
        { reason: 'QUEUE_EDIT_NON_TEXT' },
      )
    }
    const agent = this.ctx.agents.get(request.sessionId)
    if (agent !== undefined && hasApiSessionSubagentOwner(this.ctx, agent.session, agent)) {
      rejectFailure(apiSessionSubagentOwnershipError(request.sessionId))
    }
    if (agent === undefined) {
      reject('queue-item-not-found', 'queued item is no longer pending', { itemId: request.itemId })
    }
    const nextTurn = agent.inbox.nextTurn.find(message => message.id === request.itemId)
    const nextStep = agent.inbox.nextStep.find(message => message.id === request.itemId)
    const located = nextTurn === undefined
      ? nextStep === undefined ? undefined : { target: 'next-step' as const, message: nextStep }
      : { target: 'next-turn' as const, message: nextTurn }
    if (located === undefined) {
      reject('queue-item-not-found', 'queued item is no longer pending', { itemId: request.itemId })
    }
    const { target, message } = located
    if (request.action.kind === 'steer' && (target !== 'next-turn' || agent.status !== 'running')) {
      reject('steer-unavailable', 'current turn no longer accepts steering', { itemId: request.itemId })
    }
    if (request.action.kind === 'edit') {
      agent.inbox.replace(request.itemId, freezeMessage<UserMessage>({
        ...message,
        content: [...request.action.content],
      }))
    } else {
      agent.inbox.remove(request.itemId)
      if (request.action.kind === 'steer') agent.steer(message)
    }
    return { accepted: true }
  }

  /**
   * Cancel one live ordinary Agent while retaining pending inbox work.
   * @param request - Session whose active Agent turn is cancelled.
   * @returns acknowledgement that cancellation was requested.
   */
  cancel(request: SessionCancelRequest): SessionCancelValue {
    const agent = this.ctx.agents.get(request.sessionId)
    if (agent === undefined) {
      reject(
        'session-not-found',
        `session "${request.sessionId}" not found (not attached)`,
        { sessionId: request.sessionId },
      )
    }
    if (hasApiSessionSubagentOwner(this.ctx, agent.session, agent)) {
      rejectFailure(apiSessionSubagentOwnershipError(request.sessionId))
    }
    agent.cancel({ kind: 'user' }, { keepInbox: true })
    return { accepted: true }
  }

  private async resolveAgent(sessionId: SessionId): Promise<Agent> {
    const found = await this.agents.resolveAgent(sessionId)
    if ('error' in found) rejectFailure(found.error)
    return found.agent
  }

  private rejectCreation(sessionId: SessionId, error: unknown): never {
    if (error instanceof ApiSessionPresetConflict) {
      reject('agent-preset-conflict', error.message, {
        sessionId: error.sessionId,
        requestedPreset: error.requestedPreset,
        ...(error.existingPreset === undefined ? {} : { existingPreset: error.existingPreset }),
      })
    }
    if (error instanceof UnknownPresetError) {
      reject('agent-preset-not-found', error.message, {
        agentPreset: error.presetId,
        available: [...error.available],
      })
    }
    if (error instanceof PresetMountError) {
      reject('agent-preset-invalid', error.message, {
        agentPreset: error.presetId,
        reason: error.reason,
      })
    }
    if (error instanceof ApiSessionCwdConflict) {
      reject('session-conflict', error.message, {
        sessionId: error.sessionId,
        requestedCwd: error.requestedCwd,
        ...(error.existingCwd === undefined ? {} : { existingCwd: error.existingCwd }),
      })
    }
    if (error instanceof ApiSessionSubagentOwnership) {
      rejectFailure(apiSessionSubagentOwnershipError(error.sessionId))
    }
    reject('internal', `failed to create session "${sessionId}": ${String(error)}`, {})
  }

  private async readSessionState(sessionId: SessionId): Promise<SessionReadState> {
    const attached = this.ctx.sessions.get(sessionId)
    if (attached !== undefined) {
      return { id: attached.id, header: attached.header, events: [...attached.events] }
    }
    const inspected = await inspectApiSession(this.ctx, sessionId)
    return { id: inspected.meta.id, header: inspected.meta, events: inspected.events }
  }

  private async forkWorkspace(source: SessionHeader): Promise<Workspace | undefined> {
    const registry = this.ctx.get('workspaceRegistry')
    if (registry === undefined) return undefined
    const workspaces = registry.list()
    const direct = workspaces.find(workspace => workspace.sessionIds.includes(source.id))
    if (direct !== undefined || source.origin !== 'subagent') return direct
    const lineage = await this.ctx.sessionQuery.traceSession(source.id)
    for (const ancestor of lineage.ancestors) {
      const workspace = workspaces.find(candidate => candidate.sessionIds.includes(ancestor.header.id))
      if (workspace !== undefined) return workspace
    }
    return undefined
  }

  private async attachForkToStory(owner: StorySessionOwner, childId: SessionId): Promise<void> {
    const registry = this.ctx.get('storyRegistry')
    if (registry === undefined) {
      reject('story-unavailable', 'Story Session creation is unavailable in this deployment', {})
    }
    try {
      await registry.attachSession(owner.storyId, childId, 'scene')
    } catch (error) {
      reject(
        error instanceof StorySessionOwnershipError ? 'story-session-conflict' : 'story-attach-failed',
        `session "${childId}" was forked but could not attach to story "${owner.storyId}": ${String(error)}`,
        { sessionId: childId, storyId: owner.storyId },
      )
    }
  }
}

function rejectFailure(error: { readonly code: string; readonly message: string; readonly details: object }): never {
  throw new TypertRemoteFailure(error)
}

function reject(code: string, message: string, details: object): never {
  throw new TypertRemoteFailure({ code, message, details })
}

async function durablePromptContent(
  ctx: Context,
  content: readonly SessionPromptRequest['content'][number][],
): Promise<ContentBlock[]> {
  if (content.every(part => part.type === 'text')) {
    return content.map(part => ({ type: 'text', text: part.text }))
  }
  const refs = await admitEncodedImages(ctx.attachments, content.filter(part => part.type === 'image'))
  let next = 0
  return content.map(part => part.type === 'text'
    ? { type: 'text', text: part.text }
    // admitEncodedImages returns one reference per image part in order.
    : { type: 'image', attachment: refs[next++] as ImageAttachmentRef })
}

function imageBlockIn(
  content: unknown,
  match: (ref: ImageAttachmentRef) => boolean,
): ImageAttachmentRef | undefined {
  if (!Array.isArray(content)) return undefined
  for (const value of content) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const block = value as { readonly type?: unknown; readonly attachment?: unknown; readonly content?: unknown }
    if (block.type === 'image' && typeof block.attachment === 'object' && block.attachment !== null) {
      const ref = block.attachment as ImageAttachmentRef
      if (match(ref)) return ref
    }
    if (block.type === 'tool-result') {
      const nested = imageBlockIn(block.content, match)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

function imageInEvent(
  event: SessionEvent,
  match: (ref: ImageAttachmentRef) => boolean,
): ImageAttachmentRef | undefined {
  const data = event.data as {
    readonly content?: unknown
    readonly message?: { readonly content?: unknown }
    readonly inserted?: readonly { readonly content?: unknown }[]
    readonly chunk?: { readonly type?: unknown; readonly block?: unknown }
  }
  const direct = imageBlockIn(data.content, match)
  if (direct !== undefined) return direct
  const message = imageBlockIn(data.message?.content, match)
  if (message !== undefined) return message
  for (const inserted of data.inserted ?? []) {
    const found = imageBlockIn(inserted.content, match)
    if (found !== undefined) return found
  }
  return event.type === 'assistant/chunk' && data.chunk?.type === 'block-end'
    ? imageBlockIn([data.chunk.block], match)
    : undefined
}

function referencedImage(
  events: readonly SessionEvent[],
  attachmentId: string,
): ImageAttachmentRef | undefined {
  for (const event of events) {
    const found = imageInEvent(event, ref => String(ref.attachmentId) === attachmentId)
    if (found !== undefined) return found
  }
  return undefined
}

const IANA_TIME_ZONE = /^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)+$/

function canonicalClientTimeZone(value: string): string | undefined {
  if (value.length === 0 || value.trim() !== value
    || (value !== 'UTC' && !IANA_TIME_ZONE.test(value))) return undefined
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

function routeServed(ctx: Context, provider: string): boolean {
  return ctx.llm.listProviders().some(entry => entry.id === provider)
}
