import { describe, expect, it } from 'vitest'
import { emptyContextRetention, indexContextSources, proposeContextUpdate, reviewContextProposals,
  type ContextNote, type ContextUpdateUnit, type StoryContextRetention } from '../src/context-retention.ts'

const episode = { topic: 'The promise', experience: 'I promised to return.',
  interpretation: 'They trust me.', impact: 'I feel responsible.', unresolved: ['When can I return?'] }

function apply(state: StoryContextRetention, id: string, change: ContextUpdateUnit['changes'][number]) {
  const pending = proposeContextUpdate(state, 'actor:a', id, 'turn', [{ sourceIds: ['source'],
    disposition: change.operation === 'archive' ? 'archive' : 'represented', reason: 'Update my understanding.', changes: [change] }])
  return reviewContextProposals(pending, [{ id: `${id}:0`, revision: 1, approve: true }])
}

function initial() {
  const indexed = indexContextSources(emptyContextRetention(), [{ id: 'source', sceneId: 'scene', kind: 'speech',
    scopes: ['actor:a'], order: 0, locator: { kind: 'world', eventId: 'event' } }])
  return apply(indexed, 'first', { operation: 'add', kind: 'promise', text: 'I owe a return visit.', sourceIds: ['source'], episode })
}

function change(note: ContextNote, operation: ContextUpdateUnit['changes'][number]['operation']) {
  return { operation, kind: note.kind, noteId: note.id, expectedRevision: note.revision,
    text: 'I can return tomorrow.', sourceIds: ['source'] }
}

describe('episode detail revisions', () => {
  it('distinguishes an unavailable target from a stale revision without disclosing another owner', () => {
    const before = initial()
    const saved = structuredClone(before)
    const unavailable = { ...change(before.notes[0]!, 'revise'), noteId: 'my-personal-memory' }
    const unavailableMessage = 'Context note target is unavailable. Copy noteId from your retained context summaries, not from beliefs, memories, sources or recall references. To retain a new summary, use operation=add and omit noteId and expectedRevision. No changes were submitted.'
    expect(() => apply(before, 'missing', unavailable)).toThrowErrorMatchingInlineSnapshot('[Error: Context note target is unavailable. Copy noteId from your retained context summaries, not from beliefs, memories, sources or recall references. To retain a new summary, use operation=add and omit noteId and expectedRevision. No changes were submitted.]')
    const foreign = { ...before, notes: before.notes.map(note => ({ ...note, scope: 'actor:b' })) }
    expect(() => apply(foreign, 'foreign', change(before.notes[0]!, 'revise'))).toThrow(unavailableMessage)
    expect(() => apply(before, 'stale', { ...change(before.notes[0]!, 'revise'), expectedRevision: 2 }))
      .toThrowErrorMatchingInlineSnapshot('[Error: Context note revision conflict; read the current retained summary and copy its noteId and note revision before resubmitting. Archived or superseded notes cannot be revised. No changes were submitted.]')
    expect(before).toEqual(saved)
    expect(apply(before, 'valid', change(before.notes[0]!, 'revise')).notes[0]?.revision).toBe(2)
  })

  it.each(['revise', 'resolve', 'withdraw', 'archive'] as const)('preserves details when %s omits them', (operation) => {
    const before = initial()
    const next = apply(before, 'update', change(before.notes[0]!, operation))
    expect(next.notes[0]).toMatchObject({ revision: 2, text: 'I can return tomorrow.', episode })
    expect(before.notes[0]).toMatchObject({ revision: 1, text: 'I owe a return visit.', episode })
  })

  it('replaces explicit details without changing the previous revision', () => {
    const before = initial()
    const revised = { ...episode, interpretation: 'Their trust is conditional.', unresolved: [] }
    const next = apply(before, 'update', { ...change(before.notes[0]!, 'revise'), episode: revised })
    expect(next.notes[0]?.episode).toEqual(revised)
    expect(before.notes[0]?.episode).toEqual(episode)
  })

  it('does not attach the superseded episode to a new replacement note', () => {
    const before = initial()
    const next = apply(before, 'replacement', change(before.notes[0]!, 'replace'))
    expect(next.notes[0]).toMatchObject({ status: 'superseded', episode })
    expect(next.notes[1]?.episode).toBeUndefined()
    expect(next.notes[1]?.sourceIds).toEqual(['source'])
  })
})
