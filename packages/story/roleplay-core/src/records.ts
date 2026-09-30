/** Serialization and entity projection shared by replay and both stores. */
import type { EntityKey, Json, NarrativeEvent, NarrativeSnapshot } from './types.ts'

/** Compare command meaning independently from JSON object key insertion order. */
export function canonical(value: unknown): string {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint'
    || typeof value === 'number' && !Number.isFinite(value)) throw new Error('Narrative records require finite JSON values')
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('Narrative records require plain JSON objects')
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
}

/** Encode a local entity without ambiguous separator concatenation. */
export function entityKey(key: EntityKey): string { return JSON.stringify([key.collection, key.id]) }
/** Use a locale-independent total order for durable record keys and replay projections. */
export function compareRecordKeys(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0 }

/** Apply events; replay may share immutable unchanged records before detaching its final result. */
export function project(snapshot: NarrativeSnapshot, events: readonly NarrativeEvent[], reuseUnchanged = false): NarrativeSnapshot {
  const entities = new Map(snapshot.entities.map(item => [entityKey(item.key), reuseUnchanged ? item : structuredClone(item)]))
  if (entities.size !== snapshot.entities.length) throw new RoleplayError('invalid', 'Narrative snapshot repeats an entity')
  let epoch = snapshot.instance.epoch
  let deleted = snapshot.instance.deleted
  for (const event of events) {
    if (event.type === 'entity.replaced') entities.set(entityKey(event.key), { key: event.key, value: structuredClone(event.value) })
    else if (event.type === 'entity.removed') entities.delete(entityKey(event.key))
    else if (event.type === 'instance.removed') { deleted = true; epoch++ }
    else epoch++
  }
  return { instance: { ...snapshot.instance, epoch, deleted },
    entities: [...entities.values()].sort((a, b) => compareRecordKeys(entityKey(a.key), entityKey(b.key))) }
}

/** Read exactly the active value; deleting it never reveals the template again. */
export function entity(snapshot: NarrativeSnapshot, key: EntityKey): Json | undefined {
  return snapshot.entities.find(item => entityKey(item.key) === entityKey(key))?.value
}

/** Host-visible failure classification is distinct from private diagnostic text. */
export class RoleplayError extends Error {
  constructor(readonly code: 'not-found' | 'conflict' | 'duplicate-command' | 'stale-execution' | 'invalid', message: string) {
    super(message)
  }
}
