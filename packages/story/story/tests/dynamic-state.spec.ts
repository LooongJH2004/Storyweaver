import { describe, expect, it } from 'vitest'
import { applyStateChanges, emptyDynamicState, renderDynamicState, stateDefinitionSchema } from '../src/dynamic-state.ts'
import type { StateChange } from '../src/dynamic-state.ts'

const field = stateDefinitionSchema.parse({ id: 'a:debt', name: '亏欠', description: '对师门的亏欠',
  group: '关系', type: 'number', owner: 'actor', actorId: 'a', targetActorId: 'b',
  minimum: 0, maximum: 100, guidance: '受到帮助或偿还承诺时改变' })
const initial: StateChange = { fieldId: field.id, expectedRevision: 0, definition: field,
  value: 40, reason: '师门替我偿债', sourceRefs: ['event:help'] }
const cast = ['a', 'b']
const actor = { kind: 'actor' as const, actorId: 'a' }
const begin = () => applyStateChanges(emptyDynamicState(), [initial], actor, cast)

describe('author-defined fictional state', () => {
  it('uses authored ranges and exact revisions instead of a fixed relationship scale', () => {
    const state = applyStateChanges(begin(), [{ ...initial, definition: undefined, expectedRevision: 1, value: 80 }], actor, cast)
    expect(state.entries[0]?.value).toBe(80)
    expect(state.history.map(entry => entry.value)).toEqual([40, 80])
    expect(() => applyStateChanges(state, [{ ...initial, expectedRevision: 1 }], actor, cast)).toThrow('Stale')
  })

  it('rejects cross-character writes, world writes, and invented cast references', () => {
    expect(() => applyStateChanges(begin(), [{ ...initial, expectedRevision: 1 }], { kind: 'actor', actorId: 'b' }, cast)).toThrow('own subjective')
    expect(() => applyStateChanges(emptyDynamicState(), [{ ...initial, definition: { ...field, owner: 'world' } }], actor, cast)).toThrow('own subjective')
    expect(() => applyStateChanges(emptyDynamicState(), [{ ...initial, definition: { ...field, targetActorId: 'secret-c' } }], actor, cast)).toThrow('unknown character')
    expect(() => applyStateChanges(begin(), [{ ...initial, definition: undefined, expectedRevision: 1 }], { kind: 'director' }, cast)).toThrow('world-owned')
  })

  it('rejects an entire batch without clamping or publishing the valid prefix', () => {
    const current = begin()
    expect(() => applyStateChanges(current, [{ ...initial, definition: undefined, expectedRevision: 1, value: 101 }], actor, cast)).toThrow('Invalid value')
    expect(current.entries[0]?.value).toBe(40)
    expect(current.history).toHaveLength(1)
    expect(() => applyStateChanges(emptyDynamicState(), [initial, initial], actor, cast)).toThrow('Duplicate change')
  })

  it('requires existing fields to be reused and forbids model changes to definitions', () => {
    const current = begin()
    expect(() => applyStateChanges(current, [{ ...initial, expectedRevision: 1, definition: { ...field, maximum: 200 } }], actor, cast)).toThrow('cannot redefine')
    const duplicate = stateDefinitionSchema.parse({ ...field, id: 'a:duplicate' })
    expect(() => applyStateChanges(current, [{ ...initial, fieldId: duplicate.id, definition: duplicate }], actor, cast)).toThrow('reuse its id')
  })

  it('keeps tombstones out of current context and restores by a compensating revision', () => {
    const current = begin()
    const removed = applyStateChanges(current, [{ ...initial, definition: undefined, expectedRevision: 1, active: false }], { kind: 'player' }, cast)
    expect(renderDynamicState(removed)).toBe('')
    const restored = applyStateChanges(removed, [{ ...initial, definition: undefined, expectedRevision: 2, active: true }], { kind: 'player' }, cast)
    expect(restored.entries[0]?.revision).toBe(3)
    expect(renderDynamicState(restored)).toContain('亏欠: 40')
    expect(restored.history).toHaveLength(3)
  })

  it('validates player definition changes against the current value', () => {
    expect(() => applyStateChanges(begin(), [{ ...initial, value: undefined, expectedRevision: 1,
      definition: { ...field, maximum: 20 } }], { kind: 'player' }, cast)).toThrow('Invalid value')
    expect(() => applyStateChanges(begin(), [{ ...initial, value: 10, expectedRevision: 1,
      definition: { ...field, maximum: 20 } }], { kind: 'player' }, cast)).toThrow('Invalid value')
  })

  it.each([
    ['text', '仍不肯原谅', undefined], ['boolean', false, undefined],
    ['choice', '犹豫', ['犹豫', '接受']], ['tags', ['疲倦'], ['疲倦', '疼痛']],
  ] as const)('supports %s values without interpreting false or empty text as missing', (type, value, options) => {
    const definition = stateDefinitionSchema.parse({ ...field, type, minimum: undefined, maximum: undefined, options })
    expect(applyStateChanges(emptyDynamicState(), [{ ...initial, definition, value: typeof value === 'object' ? [...value] : value }], actor, cast).entries[0]?.value).toEqual(value)
  })
})
