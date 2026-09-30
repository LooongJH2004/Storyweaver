/** Parsing for player-authored one-turn control envelopes. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** Player input and retained historical control modes. */
export type PlayerDirectiveKind = 'observe' | 'direction' | 'intervene' | 'embody' | 'resume' | 'retry'

/** A durable semantic value plus request-local interpretation rules. */
export interface PlayerDirective {
  readonly kind: PlayerDirectiveKind
  readonly persistentText: string
  readonly turnInstruction: string
  /** Exact authored ID, or an exact display name in a historical envelope. */
  readonly embodiedActor?: string
}

/**
 * Interpret a captured input mode without inspecting or rewriting the editable body.
 * @param input - application intent recorded on the user message.
 * @param body - original player text.
 * @param actorIds - complete authored cast for explicit embodiment selection.
 * @returns turn-local control rules, or undefined for another application's intent.
 */
export function parseStructuredPlayerDirective(input: unknown, body: string, actorIds: readonly string[]): PlayerDirective | undefined {
  const envelope = z.strictObject({ kind: z.string(), payload: z.unknown() }).parse(input)
  if (envelope.kind !== 'storyweaver') return undefined
  const value = z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.enum(['observe', 'direction', 'intervene']) }),
    z.strictObject({ mode: z.literal('embody'), actorId: z.string().min(1) }),
  ]).parse(envelope.payload)
  if (value.mode === 'embody' && !actorIds.includes(value.actorId)) throw new Error('Choose an existing character before sending an embodiment')
  if (value.mode === 'embody') return embodimentDirective(value.actorId, body)
  const label = value.mode === 'direction' ? 'choose direction' : value.mode
  return parsePlayerDirective(`[${label}]${body}`)
}

const trimKnownLead = (value: string, leads: readonly string[]): string => {
  const trimmed = value.trim()
  const lead = leads.find(candidate => trimmed.startsWith(candidate))
  return lead === undefined ? trimmed : trimmed.slice(lead.length).trim()
}

function embodimentDirective(actor: string, value: string): PlayerDirective {
  return {
    kind: 'embody',
    embodiedActor: actor,
    persistentText: `【玩家代演：${actor}】${value}`,
    turnInstruction: `[TURN-LOCAL PLAYER CONTROL: EMBODY CHARACTER]\nThe player temporarily authors ${actor}'s stated speech or action in the current user message. Preserve player origin and do not reinterpret it as that Actor's autonomous choice. Do not add this character to actor_briefs or autonomous discussion participants; the Host rejects autonomous dispatch for this character. Preserve silence and never add subsequent speech or voluntary actions. Other characters remain autonomous. This control explanation applies only to the current turn.`,
  }
}

/**
 * Split one known `【type】value` player envelope into durable data and a
 * request-local instruction. Unknown bracketed prose remains ordinary text.
 * @param text - one player-authored text block.
 * @returns parsed directive, or undefined for ordinary prose.
 */
export function parsePlayerDirective(text: string): PlayerDirective | undefined {
  const matched = /^\s*【([^】]+)】\s*([\s\S]*)$/u.exec(text)
    ?? /^\s*\[([^\]]+)\]\s*([\s\S]*)$/u.exec(text)
  if (matched === null) return undefined
  const label = matched[1]?.trim() ?? ''
  const raw = matched[2] ?? ''
  if (label === '旁观推进' || label.toLocaleLowerCase() === 'observe') {
    return {
      kind: 'observe',
      persistentText: '【玩家意图】旁观推进',
      turnInstruction: '[TURN-LOCAL PLAYER CONTROL: OBSERVE AND ADVANCE]\nAdvance the objective world now. Let characters act only from their own knowledge, goals, and emotions. The player does not embody any character in this turn. This control explanation applies only to the current turn and must not be treated as a lasting story fact.',
    }
  }
  if (label === '指定走向' || label.toLocaleLowerCase() === 'choose direction') {
    const value = trimKnownLead(raw, ['我希望故事接下来朝这个方向发展：', 'I want the story to move toward:'])
    return {
      kind: 'direction',
      persistentText: `【玩家指定走向】${value}`,
      turnInstruction: '[TURN-LOCAL PLAYER CONTROL: DESIRED DIRECTION]\nTreat the current user message as the player\'s desired future direction, not as an already established world fact. Preserve character agency and establish concrete consequences only through Director tools. The control explanation applies only to this turn; the concise typed value in the user message remains useful history.',
    }
  }
  if (label === '介入世界' || label.toLocaleLowerCase() === 'intervene') {
    const value = trimKnownLead(raw, ['我让以下变化在世界中发生：', 'I cause this change in the world:'])
    return {
      kind: 'intervene',
      persistentText: `【玩家介入世界】${value}`,
      turnInstruction: '[TURN-LOCAL PLAYER CONTROL: WORLD INTERVENTION]\nInterpret the current user message as a player-authored intervention. Reconcile it with the authoritative world through Director narration and world patches; do not silently rewrite unrelated character choices. This control explanation applies only to the current turn.',
    }
  }
  const embody = /^(?:代演角色|embody)\s*[：:]\s*(.+)$/iu.exec(label)
  if (embody !== null) {
    const actor = embody[1]?.trim() ?? ''
    const value = trimKnownLead(raw, ['我替这个角色说出或做出：', 'I make this character say or do:'])
    return embodimentDirective(actor, value)
  }
  if (label === '恢复推进' || label.toLocaleLowerCase() === 'resume advancement') {
    return {
      kind: 'resume',
      persistentText: '【玩家意图】恢复未完成推进',
      turnInstruction: `[TURN-LOCAL PLAYER CONTROL: RESUME]\n${raw.trim()}\nThis recovery protocol applies only to the current turn and must not remain as story history.`,
    }
  }
  if (label === '重试' || label.toLocaleLowerCase() === 'retry') {
    return {
      kind: 'retry',
      persistentText: '【玩家意图】重试未完成推进',
      turnInstruction: `[TURN-LOCAL PLAYER CONTROL: RETRY]\n${raw.trim()}\nThis recovery protocol applies only to the current turn and must not remain as story history.`,
    }
  }
  return undefined
}

/**
 * Recover player ownership from original logged input, including a recovery turn.
 * Ordinary input in a later turn releases earlier ownership; retries retain it.
 * @param events - current Director Session log, after any rewrite.
 * @param actors - authored cast used to resolve historical display names exactly.
 * @returns Actor IDs that cannot be dispatched autonomously in this player turn.
 */
export function playerControlledActorIds(
  events: readonly SessionEvent[],
  actors: readonly { readonly actorId: string; readonly displayName: string }[],
): readonly string[] {
  let current: Array<PlayerDirective | undefined> = []
  const turns = [current]
  for (const event of events) {
    if (event.type === 'turn/start') {
      current = []
      turns.push(current)
    }
    if (event.type !== 'user/message' || event.data.source.kind !== 'user') continue
    const message = event.data
    const body = message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
    const input = 'inputIntent' in message.source ? message.source.inputIntent : undefined
    const directives = input === undefined
      ? message.content.filter(block => block.type === 'text').map(block => parsePlayerDirective(block.text))
      : [parseStructuredPlayerDirective(input, body, actors.map(actor => actor.actorId))]
    current.push(...directives)
  }
  for (const turn of turns.reverse()) {
    if (turn.length === 0 || turn.every(value => value?.kind === 'resume' || value?.kind === 'retry')) continue
    return [...new Set(turn.flatMap((value) => {
      if (value?.embodiedActor === undefined) return []
      const byId = actors.find(actor => actor.actorId === value.embodiedActor)
      if (byId !== undefined) return [byId.actorId]
      const byName = actors.filter(actor => actor.displayName === value.embodiedActor)
      const match = byName[0]
      if (byName.length !== 1 || match === undefined) throw new Error(`Player embodiment '${value.embodiedActor}' requires an unambiguous existing Actor ID`)
      return [match.actorId]
    }))]
  }
  return []
}
