import { describe, expect, it } from 'vitest'
import { STYLE_PRESETS, resolveStyle, renderStyle, styleProfileSchema, updateStyle } from '../src/style.ts'
import { applyStateChanges, emptyDynamicState, renderPerceivedState, stateDefinitionSchema, dynamicStateSchema } from '../src/dynamic-state.ts'

describe('performance guidance and objective perception', () => {
  const baseline = styleProfileSchema.parse({ kind: 'actor', guidance: { speechStyle: 'Book voice', examples: ['A fictional sample'] } })

  it('copies a preset and keeps examples separate from fictional facts', () => {
    const preset = STYLE_PRESETS.find(item => item.id === 'actor-natural')!
    const overrides = updateStyle({ profiles: {} }, { scope: 'story', key: 'actor:a', profile: preset.profile }, ['a'])
    const resolved = resolveStyle(baseline, overrides, 'actor:a')
    resolved.profile.guidance.examples.push('Changed privately')
    expect(preset.profile.guidance.examples).not.toContain('Changed privately')
    expect(overrides.profiles['actor:a']?.guidance.examples).not.toContain('Changed privately')
    expect(renderStyle(baseline)).toContain('never memories or events')
    expect(renderStyle(baseline)).toContain('A fictional sample')
  })

  it('resolves intentional empty overrides and restores the authored baseline explicitly', () => {
    const empty = styleProfileSchema.parse({ kind: 'actor', guidance: {} })
    const overrides = updateStyle({ profiles: {} }, { scope: 'story', key: 'actor:a', profile: empty }, ['a'])
    expect(resolveStyle(baseline, overrides, 'actor:a')).toMatchObject({ source: 'story', profile: empty })
    const restored = updateStyle(overrides, { scope: 'story', key: 'actor:a' }, ['a'])
    expect(resolveStyle(baseline, restored, 'actor:a')).toMatchObject({ source: 'storybook', profile: baseline })
  })

  it('isolates scene instructions by audience and expires them on scene change', () => {
    let overrides = updateStyle({ profiles: {} }, { scope: 'scene', key: 'director', sceneId: 'room', instruction: 'Director only' }, ['a', 'b'], 'room')
    overrides = updateStyle(overrides, { scope: 'scene', key: 'actor:a', sceneId: 'room', instruction: 'A only' }, ['a', 'b'], 'room')
    expect(resolveStyle(baseline, overrides, 'actor:a', 'room').sceneInstruction).toBe('A only')
    expect(resolveStyle(baseline, overrides, 'actor:b', 'room').sceneInstruction).toBe('')
    expect(resolveStyle(baseline, overrides, 'actor:a', 'street').sceneInstruction).toBe('')
    expect(() => updateStyle(overrides, { scope: 'scene', key: 'actor:a', sceneId: 'room', instruction: 'stale' }, ['a'], 'street')).toThrow('Scene changed')
  })

  it('rejects unknown audiences and mismatched director profiles', () => {
    expect(() => updateStyle({ profiles: {} }, { scope: 'story', key: 'actor:missing', profile: baseline }, ['a'])).toThrow('Unknown')
    expect(() => updateStyle({ profiles: {} }, { scope: 'story', key: 'director', profile: baseline }, ['a'])).toThrow('audience')
  })

  it('makes objective wounds perceivable only to authorized characters and keeps private pain distinct', () => {
    const definition = stateDefinitionSchema.parse({ id: 'wound', actorId: 'a', name: 'Arm wound', description: 'Observed injury', group: 'Body', type: 'text', owner: 'world', audience: ['a'], guidance: 'Update after world settlement' })
    const change = { fieldId: definition.id, expectedRevision: 0, definition, value: 'Bleeding cut', reason: 'Fell on glass', sourceRefs: [] }
    const state = applyStateChanges(emptyDynamicState(), [change], { kind: 'director' }, ['a', 'b'])
    expect(renderPerceivedState(state, 'a')).toContain('Bleeding cut')
    expect(renderPerceivedState(state, 'b')).not.toContain('Bleeding cut')
    expect(() => applyStateChanges(state, [{ ...change, expectedRevision: 1 }], { kind: 'actor', actorId: 'a' }, ['a'])).toThrow('subjective')
    expect(() => stateDefinitionSchema.parse({ ...definition, owner: 'actor' })).toThrow('private')
    expect(() => dynamicStateSchema.parse({ ...state, entries: [{ ...state.entries[0], value: false }] })).toThrow()
  })
})
