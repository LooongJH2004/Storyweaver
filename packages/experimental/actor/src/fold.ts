/** Normalize Harness execution events before applying the pure character domain. */
import { z } from 'zod'
import type { SessionEvent, SessionEventMap } from '@deepseek-ai/dsh-session'
import { applyCharacterChange, emptyActorFoldState, type ActorFoldState } from '@deepseek-ai/dsh-roleplay-core/actor-state'
import type { CharacterChange, CharacterChangeType, CharacterChangeMap } from '@deepseek-ai/dsh-roleplay-core/actor-events'
export { emptyActorFoldState } from '@deepseek-ai/dsh-roleplay-core/actor-state'
export type { ActorFoldState, ActorMemoryFold } from '@deepseek-ai/dsh-roleplay-core/actor-state'
const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const stateRewindEventSchema = z.strictObject({ version: z.literal(1), afterEventSeq: nonNegativeSafeInteger,
  reason: z.literal('story-rewrite') }) as z.ZodType<SessionEventMap['actor/state-rewind']>
/** Event names owned by the Actor kernel. */
export type ActorEventType =
  | 'actor/commit'
  | 'actor/knowledge-initialized'
  | 'actor/knowledge-changed'
  | 'actor/state-changed'
  | 'actor/descriptor'
  | 'actor/configuration'
  | 'actor/thought'
  | 'actor/emotion'
  | 'actor/belief'
  | 'actor/relationship'
  | 'actor/memory'
  | 'actor/memory-release'
  | 'actor/memory-forgotten'
  | 'actor/goal'
  | 'actor/intention'
  | 'actor/turning-point'
  | 'actor/expression'
  | 'actor/action-intent'
  | 'actor/turn-closed'
  | 'actor/state-rewind'
  | 'actor/player-intervention'

/** One Actor-kernel Session event. */
export type ActorSessionEvent = SessionEvent<ActorEventType>

/**
 * Test whether a Session event belongs to this package.
 * @param event - durable Session event to classify.
 * @returns whether the event is owned by the Actor kernel.
 */
export function isActorEvent(event: SessionEvent): event is ActorSessionEvent {
  return event.type === 'actor/knowledge-initialized' || event.type === 'actor/knowledge-changed' || event.type === 'actor/commit' || event.type === 'actor/state-changed'
    || event.type === 'actor/descriptor'
    || event.type === 'actor/configuration'
    || event.type === 'actor/thought'
    || event.type === 'actor/emotion'
    || event.type === 'actor/belief'
    || event.type === 'actor/relationship'
    || event.type === 'actor/memory'
    || event.type === 'actor/memory-release'
    || event.type === 'actor/memory-forgotten'
    || event.type === 'actor/goal'
    || event.type === 'actor/intention'
    || event.type === 'actor/turning-point'
    || event.type === 'actor/expression'
    || event.type === 'actor/action-intent'
    || event.type === 'actor/turn-closed'
    || event.type === 'actor/state-rewind'
    || event.type === 'actor/player-intervention'
}


const changes: Record<Exclude<ActorEventType, 'actor/commit' | 'actor/state-rewind'>, CharacterChangeType> = {
  'actor/knowledge-initialized': 'knowledge.initialized',
  'actor/knowledge-changed': 'knowledge.changed',
  'actor/state-changed': 'state.changed',
  'actor/descriptor': 'character.defined',
  'actor/configuration': 'character.configured',
  'actor/thought': 'thought.recorded',
  'actor/emotion': 'emotion.recorded',
  'actor/belief': 'belief.revised',
  'actor/relationship': 'relationship.revised',
  'actor/memory': 'memory.recorded',
  'actor/memory-release': 'memory.released',
  'actor/memory-forgotten': 'memory.forgotten',
  'actor/goal': 'goal.revised',
  'actor/intention': 'intention.recorded',
  'actor/turning-point': 'turning-point.revised',
  'actor/expression': 'speech.expressed',
  'actor/action-intent': 'action.attempted',
  'actor/turn-closed': 'character.turn-closed',
  'actor/player-intervention': 'player.intervened',
}
type MappedActorEvent = Exclude<ActorEventType, 'actor/commit' | 'actor/state-rewind'>
const executionTypes = Object.fromEntries(Object.entries(changes).map(([execution, domain]) => [domain,
  execution])) as Record<CharacterChangeType, MappedActorEvent>
/**
 * Wrap a normalized character change in its Harness execution protocol.
 * @param type - domain change discriminant.
 * @param data - payload correlated with the domain change.
 * @returns the corresponding execution event payload.
 */
export function characterChangeToEvent<T extends CharacterChangeType>(type: T,
  data: CharacterChangeMap[T]): { type: MappedActorEvent; data: SessionEventMap[MappedActorEvent] } {
  return { type: executionTypes[type], data }
}
function parsePersisted<T>(type: ActorEventType, schema: z.ZodType<T>, value: unknown): T {
  try { return schema.parse(value) }
  catch (error: unknown) { throw new Error(`persisted Actor ${type} payload is invalid`, { cause: error }) }
}
/** Apply a technical envelope after resolving its execution-only semantics. */
export function applyActorEvent(state: ActorFoldState, event: SessionEvent): void {
  if (event.type === 'turn/start') { state.currentTurn = event.data.turn; return }
  if (event.type === 'turn/end') { if (state.currentTurn === event.data.turn) delete state.currentTurn; return }
  if (!isActorEvent(event)) return
  if (event.type === 'actor/state-rewind') {
    const rewind = parsePersisted(event.type, stateRewindEventSchema, event.data)
    if (rewind.afterEventSeq >= event.seq) throw new Error(`actor state rewind target ${rewind.afterEventSeq} must precede event ${event.seq}`)
    return
  }
  if (event.type === 'actor/commit') {
    const commit = parsePersisted(event.type, z.strictObject({ version: z.literal(1),
      operations: z.array(z.strictObject({ type: z.string().min(1), data: z.unknown() })).min(1) }), event.data)
    const draft = structuredClone(state)
    for (const operation of commit.operations) {
      const child = { ...event, type: operation.type, data: operation.data } as SessionEvent
      if (!isActorEvent(child) || ['actor/commit', 'actor/descriptor', 'actor/configuration',
        'actor/state-rewind'].includes(child.type)) throw new Error('Actor commit contains an unsupported operation')
      applyActorEvent(draft, child)
    }
    Object.assign(state, draft)
    return
  }
  // Correlation between discriminants is preserved by the exhaustive protocol map.
  applyCharacterChange(state, { type: changes[event.type], data: event.data } as CharacterChange)
}

/**
 * Replay one complete Session log into its Actor projection.
 * @param events - durable Session events in append order.
 * @returns reconstructed Actor projection.
 */
export function foldActor(events: readonly SessionEvent[]): ActorFoldState {
  const active: SessionEvent[] = []
  for (const event of events) {
    if (event.type !== 'actor/state-rewind') {
      active.push(event)
      continue
    }
    const rewind = parsePersisted(event.type, stateRewindEventSchema, event.data)
    if (rewind.afterEventSeq >= event.seq) {
      throw new Error(`actor state rewind target ${rewind.afterEventSeq} must precede event ${event.seq}`)
    }
    const target = active.findIndex(candidate => candidate.seq === rewind.afterEventSeq)
    if (target === -1) {
      throw new Error(`actor state rewind target ${rewind.afterEventSeq} is not retained in the active branch`)
    }
    // Saved author configuration survives fictional-state rewrites, like Story prompt settings.
    const configuration = active.slice(target + 1).filter(item => item.type === 'actor/configuration')
    active.splice(target + 1)
    active.push(...configuration, event)
  }
  const state = emptyActorFoldState()
  for (const event of active) applyActorEvent(state, event)
  return state
}

/**
 * Expand committed operations for consumers that correlate behavior with physical log positions.
 * @param events - physical Session events; transaction children retain their parent's sequence.
 * @returns the ordered operation view, without rewriting the durable log.
 */
export function actorOperationEvents(events: readonly SessionEvent[]): readonly SessionEvent[] {
  return events.flatMap(event => event.type !== 'actor/commit' ? [event] : event.data.operations.map(operation => (
    { ...event, type: operation.type, data: operation.data } as SessionEvent
  )))
}
