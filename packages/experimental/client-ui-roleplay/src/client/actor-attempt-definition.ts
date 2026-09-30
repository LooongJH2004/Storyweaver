import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PlotLedgerNpcEvent } from '@deepseek-ai/dsh-story/types'
import type { RoleplayEventData } from './roleplay-event-definition.ts'

export interface ActorAttemptReasoning {
  readonly id: string
  readonly content: string
  readonly running: boolean
}

export interface ActorAttemptDraft {
  readonly id: string
  readonly kind: 'speech' | 'action'
  readonly content: string
  readonly running: boolean
}

export interface ActorAttemptViewData {
  readonly displayLabel?: string | undefined
  readonly perspectiveLabels?: Readonly<Record<string, string>> | undefined
  readonly actorId: string
  readonly status: 'running' | 'completed' | 'failed'
  readonly reasoning: readonly ActorAttemptReasoning[]
  readonly drafts: readonly ActorAttemptDraft[]
  readonly events: readonly RoleplayEventData[]
  readonly failure?: { readonly code: string; readonly message: string }
}

interface ReasoningState {
  readonly id: string
  readonly content: string
  readonly order: number
}

interface ToolCallState {
  readonly id: string
  readonly name: string
  readonly argumentsRaw: string
  readonly order: number
}

interface ActorAttemptState {
  readonly seq: number
  readonly displayLabel?: string | undefined
  readonly perspectiveLabels?: Readonly<Record<string, string>> | undefined
  readonly actorId: string
  readonly status: ActorAttemptViewData['status']
  readonly reasoning: readonly ReasoningState[]
  readonly toolCalls: readonly ToolCallState[]
  readonly events: readonly RoleplayEventData[]
  readonly failure?: { readonly code: string; readonly message: string }
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** One autonomous Actor attempt with nested reasoning and a streamed world-facing response. */
    'roleplay-actor-attempt': ActorAttemptViewData
  }
}

/** Assemble one Actor attempt from live model chunks and its authoritative settlement. */
export const actorAttemptDefinition: ConversationNodeDefinition<ActorAttemptState> = {
  kind: 'roleplay-actor-attempt',
  target: 'chat',
  match: (event) => {
    if (event.type === 'story/actor-attempt-started') {
      return { id: String(event.data.attemptId), role: 'start' }
    }
    if (event.type === 'story/actor-attempt-chunk-projected'
      || event.type === 'story/actor-attempt-settled') {
      return { id: String(event.data.attemptId), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'story/actor-attempt-started') {
      throw new Error('Actor attempt requires a start projection')
    }
    return {
      seq: match.event.seq,
      displayLabel: match.event.data.displayLabel,
      perspectiveLabels: match.event.data.perspectiveLabels,
      actorId: match.event.data.actorId,
      status: 'running',
      reasoning: [],
      toolCalls: [],
      events: [],
    }
  },
  update: (context, match) => {
    const event = match.event
    if (event.type === 'story/actor-attempt-chunk-projected') {
      const chunk = event.data.chunk
      if (chunk.type === 'reasoning-delta') {
        const actorTurn = event.data.actorTurn ?? event.data.turn
        const actorStep = event.data.actorStep ?? event.data.step
        const id = `${String(actorTurn)}:${String(actorStep)}:${String(chunk.index)}`
        const current = context.state.reasoning.find(item => item.id === id)
        const next: ReasoningState = {
          id,
          content: `${current?.content ?? ''}${chunk.text}`,
          order: current?.order ?? event.seq,
        }
        return {
          ...context.state,
          reasoning: current === undefined
            ? [...context.state.reasoning, next]
            : context.state.reasoning.map(item => item.id === id ? next : item),
        }
      }
      if (chunk.type === 'tool-call-delta') {
        const current = context.state.toolCalls.find(item => item.id === chunk.id)
        const next: ToolCallState = {
          id: chunk.id,
          name: chunk.name ?? current?.name ?? '',
          argumentsRaw: `${current?.argumentsRaw ?? ''}${chunk.argumentsDelta}`,
          order: current?.order ?? event.seq,
        }
        return {
          ...context.state,
          toolCalls: current === undefined
            ? [...context.state.toolCalls, next]
            : context.state.toolCalls.map(item => item.id === chunk.id ? next : item),
        }
      }
      return context.state
    }
    if (event.type === 'story/actor-attempt-settled') {
      return {
        ...context.state,
        status: event.data.status,
        events: event.data.events.map(projectedNpcEvent),
        ...(event.data.failure === undefined ? {} : { failure: event.data.failure }),
      }
    }
    return context.state
  },
  publication: match => match.event.type === 'story/actor-attempt-chunk-projected'
    ? 'animation-frame'
    : 'immediate',
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    const reasoning = context.state.reasoning
      .filter(item => item.content.trim() !== '')
      .toSorted((left, right) => left.order - right.order)
      .map((item, index, items): ActorAttemptReasoning => ({
        id: item.id,
        content: item.content,
        running: context.state?.status === 'running' && index === items.length - 1,
      }))
    const drafts = context.state.status === 'running'
      ? streamingDrafts(context.state.toolCalls)
      : []
    return {
      key: context.key,
      kind: 'roleplay-actor-attempt',
      id: context.id,
      target: 'chat',
      anchorSeq: context.state.seq,
      location: context.start?.location ?? { kind: 'unresolved' },
      visibility: 'visible',
      data: {
        displayLabel: context.state.displayLabel,
        perspectiveLabels: context.state.perspectiveLabels,
        actorId: context.state.actorId,
        status: context.state.status,
        reasoning,
        drafts,
        events: context.state.events,
        ...(context.state.failure === undefined ? {} : { failure: context.state.failure }),
      },
    }
  },
}

function streamingDrafts(toolCalls: readonly ToolCallState[]): ActorAttemptDraft[] {
  for (const call of toolCalls.toSorted((left, right) => right.order - left.order)) {
    if (call.name === 'npc_commit_turn') {
      const drafts = partialCommitTurnBehaviors(call.id, call.argumentsRaw)
      if (drafts.length > 0) return drafts
      continue
    }
    const field = call.name === 'npc_speak' ? 'text' : call.name === 'npc_act' ? 'attempt' : undefined
    if (field === undefined) continue
    const content = partialJsonStringField(call.argumentsRaw, field)
    if (content !== '') {
      return [{
        id: `${call.id}:0`,
        kind: call.name === 'npc_speak' ? 'speech' : 'action',
        content,
        running: true,
      }]
    }
  }
  return []
}

function partialCommitTurnBehaviors(callId: string, source: string): ActorAttemptDraft[] {
  try {
    const parsed: unknown = JSON.parse(source)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const behavior = (parsed as Record<string, unknown>).behavior
      if (Array.isArray(behavior)) {
        const drafts = behavior.flatMap((item, index): ActorAttemptDraft[] => {
          if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
          const value = item as Record<string, unknown>
          if (value.kind === 'speech' && typeof value.text === 'string' && value.text !== '') {
            return [{ id: `${callId}:${String(index)}`, kind: 'speech', content: value.text, running: false }]
          }
          if (value.kind === 'action' && typeof value.attempt === 'string' && value.attempt !== '') {
            return [{ id: `${callId}:${String(index)}`, kind: 'action', content: value.attempt, running: false }]
          }
          return []
        })
        return markLastRunning(drafts)
      }
    }
  } catch {
    // The transaction arguments stream is normally incomplete here.
  }
  const matches = [...source.matchAll(/"kind"\s*:\s*"(speech|action)"/gu)]
  const drafts = matches.flatMap((match, index): ActorAttemptDraft[] => {
    const kind = match[1] === 'speech' ? 'speech' : 'action'
    const end = matches[index + 1]?.index ?? source.length
    const content = partialJsonStringField(source.slice(match.index, end), kind === 'speech' ? 'text' : 'attempt')
    return content === '' ? [] : [{
      id: `${callId}:${String(index)}`,
      kind,
      content,
      running: false,
    }]
  })
  return markLastRunning(drafts)
}

function markLastRunning(drafts: readonly ActorAttemptDraft[]): ActorAttemptDraft[] {
  return drafts.map((draft, index) => ({ ...draft, running: index === drafts.length - 1 }))
}

function partialJsonStringField(source: string, field: string): string {
  try {
    const parsed: unknown = JSON.parse(source)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const value = (parsed as Record<string, unknown>)[field]
      if (typeof value === 'string') return value
    }
  } catch {
    // An in-flight tool argument object is expected to be incomplete.
  }
  const fieldStart = new RegExp(`"${field}"\\s*:\\s*"`).exec(source)
  if (fieldStart === null) return ''
  let result = ''
  for (let index = fieldStart.index + fieldStart[0].length; index < source.length; index++) {
    const character = source[index]
    if (character === '"') break
    if (character !== '\\') {
      result += character ?? ''
      continue
    }
    const escaped = source[++index]
    if (escaped === undefined) break
    const simple: Readonly<Record<string, string>> = {
      '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t',
    }
    if (escaped !== 'u') {
      result += simple[escaped] ?? escaped
      continue
    }
    const code = source.slice(index + 1, index + 5)
    if (!/^[0-9a-fA-F]{4}$/.test(code)) break
    result += String.fromCharCode(Number.parseInt(code, 16))
    index += 4
  }
  return result
}

function projectedNpcEvent(event: PlotLedgerNpcEvent): RoleplayEventData {
  return event.kind === 'speech'
    ? {
      kind: 'speech', actorId: event.actorId, content: event.text, origin: 'actor',
      delivery: event.delivery, audience: event.audience, time: 0,
      requestContext: { sessionId: event.sessionId, beforeEventSeq: event.toolCallEventSeq },
    }
    : {
      kind: 'action', actorId: event.actorId, content: event.description, origin: 'actor',
      ...(event.target === undefined ? {} : { target: event.target }), time: 0,
      requestContext: { sessionId: event.sessionId, beforeEventSeq: event.toolCallEventSeq },
    }
}
