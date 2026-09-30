import type {} from '@deepseek-ai/dsh-experimental-actor/types'
import type {} from '@deepseek-ai/dsh-story/types'
import type { SessionEventLike } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Small durable locator for lazily reconstructing a producing model request. */
export interface RoleplayRequestContextRef {
  /** Omitted when the producing request belongs to the transcript Session itself. */
  readonly sessionId?: SessionId
  /** Source event produced by the request; the event is excluded from request reconstruction. */
  readonly beforeEventSeq: number
}

/** Actor and player events projected into the roleplaying transcript. */
export type RoleplayEventData = (
  | { readonly kind: 'narration'; readonly content: string; readonly worldRevision: number; readonly time: number }
  | { readonly kind: 'actor-entered'; readonly actorId: string; readonly content: string; readonly time: number }
  | { readonly kind: 'speech'; readonly actorId: string; readonly content: string; readonly origin: 'actor' | 'player'; readonly delivery: 'spoken' | 'whispered' | 'written'; readonly audience: readonly string[]; readonly time: number }
  | { readonly kind: 'action'; readonly actorId: string; readonly content: string; readonly origin: 'actor' | 'player'; readonly target?: string; readonly time: number }
  | { readonly kind: 'thought'; readonly actorId: string; readonly content: string; readonly time: number }
  | { readonly kind: 'actor-reasoning'; readonly actorId: string; readonly content: string; readonly time: number }
  | { readonly kind: 'memory'; readonly actorId: string; readonly content: string; readonly importance: number; readonly tags: readonly string[]; readonly time: number }
  | { readonly kind: 'forgotten'; readonly actorId: string; readonly memoryId: string; readonly reason?: string; readonly time: number }
  | { readonly kind: 'goal'; readonly actorId: string; readonly content: string; readonly priority: number; readonly revision: number; readonly status: 'active' | 'completed' | 'abandoned'; readonly reason?: string; readonly time: number }
  | { readonly kind: 'intention'; readonly actorId: string; readonly content: string; readonly at: string; readonly time: number }
  | { readonly kind: 'story-direction' | 'world-intervention'; readonly content: string; readonly time: number }
) & { readonly requestContext?: RoleplayRequestContextRef }

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** Autonomous Actor state or player authority projected for roleplaying. */
    'roleplay-event': RoleplayEventData
  }
}

/**
 * Convert one durable Session event into its roleplaying presentation payload.
 * @param event - Session event offered to the Conversation node definition.
 * @returns roleplaying payload for owned events, otherwise `null`.
 */
export function roleplayEventData(event: SessionEventLike): RoleplayEventData | null {
  switch (event.type) {
    case 'story/director-narration-projected':
      return {
        kind: 'narration',
        content: event.data.content,
        worldRevision: event.data.worldRevision,
        time: event.time,
        requestContext: { beforeEventSeq: event.seq },
      }
    case 'story/actor-reasoning-projected':
      return {
        kind: 'actor-reasoning',
        actorId: event.data.actorId,
        content: event.data.content,
        time: event.time,
        requestContext: {
          sessionId: event.data.actorSessionId,
          beforeEventSeq: event.data.assistantEventSeq,
        },
      }
    case 'story/npc-event-projected': {
      const projected = event.data.event
      return projected.kind === 'speech'
        ? {
          kind: 'speech',
          actorId: projected.actorId,
          content: projected.text,
          origin: 'actor',
          delivery: projected.delivery,
          audience: projected.audience,
          time: event.time,
          requestContext: {
            sessionId: projected.sessionId,
            beforeEventSeq: projected.toolCallEventSeq,
          },
        }
        : {
          kind: 'action',
          actorId: projected.actorId,
          content: projected.description,
          origin: 'actor',
          ...(projected.target === undefined ? {} : { target: projected.target }),
          time: event.time,
          requestContext: {
            sessionId: projected.sessionId,
            beforeEventSeq: projected.toolCallEventSeq,
          },
        }
    }
    case 'actor/descriptor':
      return {
        kind: 'actor-entered',
        actorId: String(event.data.actor.id),
        content: event.data.actor.persona,
        time: event.time,
      }
    case 'actor/expression': {
      const expression = event.data.expression
      return {
        kind: 'speech',
        actorId: String(expression.actorId),
        content: expression.text,
        origin: expression.origin,
        delivery: expression.delivery,
        audience: expression.audience,
        time: event.time,
        ...(expression.origin === 'actor'
          ? { requestContext: { beforeEventSeq: event.seq } }
          : {}),
      }
    }
    case 'actor/action-intent': {
      const action = event.data.action
      return {
        kind: 'action',
        actorId: String(action.actorId),
        content: action.description,
        origin: action.origin,
        ...(action.target === undefined ? {} : { target: action.target }),
        time: event.time,
        ...(action.origin === 'actor'
          ? { requestContext: { beforeEventSeq: event.seq } }
          : {}),
      }
    }
    case 'actor/thought':
      return {
        kind: 'thought',
        actorId: String(event.data.thought.actorId),
        content: event.data.thought.content,
        time: event.time,
        requestContext: { beforeEventSeq: event.seq },
      }
    case 'actor/memory':
      return {
        kind: 'memory',
        actorId: String(event.data.memory.actorId),
        content: event.data.memory.content,
        importance: event.data.memory.importance,
        tags: event.data.memory.tags,
        time: event.time,
        requestContext: { beforeEventSeq: event.seq },
      }
    case 'actor/memory-forgotten':
      return {
        kind: 'forgotten',
        actorId: String(event.data.actorId),
        memoryId: String(event.data.memoryId),
        ...(event.data.reason === undefined ? {} : { reason: event.data.reason }),
        time: event.time,
        requestContext: { beforeEventSeq: event.seq },
      }
    case 'actor/goal':
      return {
        kind: 'goal',
        actorId: String(event.data.goal.actorId),
        content: event.data.goal.description,
        priority: event.data.goal.priority,
        revision: event.data.goal.revision,
        status: event.data.goal.status,
        ...(event.data.goal.reason === undefined ? {} : { reason: event.data.goal.reason }),
        time: event.time,
        requestContext: { beforeEventSeq: event.seq },
      }
    case 'actor/intention':
      return {
        kind: 'intention',
        actorId: String(event.data.intention.actorId),
        content: event.data.intention.description,
        at: event.data.intention.trigger.kind === 'world-time'
          ? event.data.intention.trigger.at
          : event.data.intention.trigger.kind === 'event'
            ? event.data.intention.trigger.when
            : event.data.intention.trigger.kind === 'condition'
              ? event.data.intention.trigger.condition
              : 'soon',
        time: event.time,
        requestContext: { beforeEventSeq: event.seq },
      }
    case 'actor/player-intervention': {
      const intervention = event.data.intervention
      if (intervention.kind === 'embody-speech' || intervention.kind === 'embody-action') return null
      return {
        kind: intervention.kind,
        content: intervention.content,
        time: event.time,
      }
    }
    default:
      return null
  }
}

interface RoleplayEventState {
  readonly seq: number
  readonly data: RoleplayEventData
}

/** One-event Conversation projection for Actor and PlayerAuthority events. */
export const roleplayEventDefinition: ConversationNodeDefinition<RoleplayEventState> = {
  kind: 'roleplay-event',
  target: 'chat',
  match: event => roleplayEventData(event) === null
    ? null
    : { id: String(event.seq), role: 'start' },
  start: (_context, match) => {
    const data = roleplayEventData(match.event)
    if (data === null) throw new Error('roleplay-event start requires a supported Actor event')
    return { seq: match.event.seq, data }
  },
  update: context => context.state,
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: 'roleplay-event',
      id: context.id,
      target: 'chat',
      anchorSeq: context.state.seq,
      location: context.start?.location ?? { kind: 'unresolved' },
      visibility: 'visible',
      data: context.state.data,
    }
  },
}
