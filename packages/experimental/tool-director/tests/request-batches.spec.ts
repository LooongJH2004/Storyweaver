import { describe, expect, it } from 'vitest'
import { createMessage } from '@deepseek-ai/dsh-llm'
import { contextChanges, RequestContextBatches } from '../src/request-batches.ts'
import { type applyStoryContextRecipe } from '@deepseek-ai/dsh-story'

describe('request context batches', () => {
  const mutable = new Set(['world'])
  const sections = (value: object) => [{ id: 'world', role: 'system' as const, chars: 0, content: JSON.stringify(value) }]
  const render = (items: ReturnType<typeof applyStoryContextRecipe>) => items.map(item => createMessage({ role: item.role,
    content: [{ type: 'text', text: item.content }], source: { kind: 'plugin', plugin: 'test' } }))
  it('keeps the complete preceding prefix unchanged and adds exact changed values', () => {
    const batches = new RequestContextBatches(12, 24_000), actor = {}
    const first = batches.render(actor, 'scene', 1, sections({ facts: { key: false }, events: ['原话'] }), mutable, render)
    const second = batches.render(actor, 'scene', 2, sections({ facts: { key: true }, events: ['原话', '新原话'] }), mutable, render)
    expect(second.slice(0, first.length)).toEqual(first)
    expect(JSON.stringify(second.slice(first.length))).toContain('新原话')
    expect(JSON.stringify(second.slice(first.length))).not.toContain('"原话"')
    expect(batches.render(actor, 'scene', 2, sections({ facts: { key: true }, events: ['原话', '新原话'] }), mutable, render)).toEqual(second)
  })
  it('rebuilds on a source boundary, scene change, source edit, or authoritative rewrite', () => {
    const batches = new RequestContextBatches(2, 1000), actor = {}
    batches.render(actor, 'scene', 1, sections({ value: 'old-value-sentinel' }), mutable, render)
    expect(JSON.stringify(batches.render(actor, 'scene', 2, sections({ value: 'new-value-sentinel' }), mutable, render))).not.toContain('old-value-sentinel')
    batches.clear()
    expect(JSON.stringify(batches.render(actor, 'scene', 0, sections({ value: 'restored' }), mutable, render))).not.toContain('new-value-sentinel')
    expect(JSON.stringify(batches.render(actor, 'other', 0, sections({ value: 'next scene' }), mutable, render))).not.toContain('restored')
  })
  it('does not lose removed keys, nulls, array replacements, or multiline source strings', () => {
    expect(contextChanges({ a: 1, b: 'old-value-sentinel', c: [1] }, { b: null, c: [2], d: '原文\n第二行' })).toEqual([
      { path: ['a'], remove: true }, { path: ['b'], set: null }, { path: ['c'], set: [2] }, { path: ['d'], set: '原文\n第二行' },
    ])
  })
  it('keeps Actor baselines isolated and rebuilds instead of silently dropping oversized updates', () => {
    const batches = new RequestContextBatches(12, 2), actor = {}, other = {}
    batches.render(actor, 'scene', 1, sections({ value: 'private' }), mutable, render)
    expect(JSON.stringify(batches.render(other, 'scene', 1, sections({ value: 'other' }), mutable, render))).not.toContain('private')
    expect(JSON.stringify(batches.render(actor, 'scene', 1, sections({ value: 'large-new' }), mutable, render))).not.toContain('private')
  })
  it('retires covered originals only at the batch boundary and reports what was sent', () => {
    const batches = new RequestContextBatches(12, 24_000), actor = {}
    const original = sections({ sources: [{ id: 'old', text: '完整原文' }], notes: [], statistics: { recent: 0, pending: 1, notes: 0, archived: 0 } })
    const approved = sections({ sources: [], notes: [{ text: '已批准短记' }], statistics: { recent: 0, pending: 0, notes: 1, archived: 1 } })
    const first = batches.render(actor, 'scene', 1, original, mutable, render)
    const held = batches.render(actor, 'scene', 1, approved, mutable, render)
    expect(held.slice(0, first.length)).toEqual(first)
    expect(batches.statistics(actor)).toEqual({ recent: 0, pending: 1, notes: 1, archived: 0 })
    const boundary = batches.render(actor, 'scene', 12, approved, mutable, render)
    expect(JSON.stringify(boundary)).not.toContain('完整原文')
    expect(batches.statistics(actor)).toEqual({ recent: 0, pending: 0, notes: 1, archived: 1 })
  })
})
