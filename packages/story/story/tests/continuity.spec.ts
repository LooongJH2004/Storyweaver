import { describe, expect, it } from 'vitest'
import { applyStoryContinuity, storyContinuityItems } from '../src/continuity.ts'
import { emptyStoryWorld, emptyStoryMemory, proposeStoryMemory, reviewStoryMemory, activeStoryMemories } from '../src/roleplay.ts'
import type { StoryWorldState, WorldEvent } from '../src/types.ts'

function source(id: string, actorId: string, audience: string[], summary = id): WorldEvent {
  return { id, actorId, audience, summary, revision: 1, kind: 'actor-speech', status: 'established',
    source: 'director', patch: [], createdAt: '2026-09-04T00:00:00.000Z' }
}
const world = (): StoryWorldState => ({ ...emptyStoryWorld(), events: [
  source('promise', 'a', ['a', 'b'], '先交出钥匙，我才打开门。'),
  source('answer', 'b', ['a', 'b'], '钥匙给你。'),
  source('withdraw', 'a', ['a'], '我撤回刚才的条件。'),
  source('hidden', 'c', ['c'], '其他人不知道的密语。'),
] })
const keep = { id: 'matter', operation: 'keep' as const, kind: 'condition' as const, sourceEventId: 'promise', private: false }

describe('source-backed continuity', () => {
  it('retains exact text and separate knowledge when only the owner hears a withdrawal', () => {
    const kept = applyStoryContinuity(world(), 'a', [keep])
    const answered = applyStoryContinuity(kept, 'b', [{ id: 'response', operation: 'respond', itemId: 'matter', sourceEventId: 'answer', private: false }])
    const withdrawn = applyStoryContinuity(answered, 'a', [{ id: 'withdrawn', operation: 'withdraw', itemId: 'matter', sourceEventId: 'withdraw', private: true }])
    expect(storyContinuityItems(withdrawn, 'a')[0]).toMatchObject({ status: 'withdrawn', sourceEventIds: ['promise', 'answer', 'withdraw'] })
    expect(storyContinuityItems(withdrawn, 'b')[0]).toMatchObject({ status: 'open', text: '先交出钥匙，我才打开门。', sourceEventIds: ['promise', 'answer'] })
    expect(storyContinuityItems(withdrawn, 'c')).toEqual([])
    expect(storyContinuityItems(withdrawn)[0]?.status).toBe('open')
  })

  it('rejects unseen sources and non-owner resolution without partial writes', () => {
    const original = world()
    expect(() => applyStoryContinuity(original, 'a', [keep, { ...keep, id: 'bad', sourceEventId: 'hidden' }])).toThrow(/perceived/)
    expect(original.continuity).toEqual([])
    const kept = applyStoryContinuity(original, 'a', [keep])
    expect(() => applyStoryContinuity(kept, 'b', [{ id: 'bad', operation: 'resolve', itemId: 'matter', sourceEventId: 'answer', private: false }])).toThrow(/author/)
  })

  it('is idempotent on replay and does not discard a matter after many newer sources', () => {
    const original = applyStoryContinuity(world(), 'a', [keep])
    expect(applyStoryContinuity(original, 'a', [keep])).toBe(original)
    const older = { ...original, events: [...original.events, ...Array.from({ length: 2100 }, (_, i) => source(`later-${i}`, 'b', ['a', 'b']))] }
    expect(storyContinuityItems(older, 'a')[0]?.text).toBe('先交出钥匙，我才打开门。')
    const restored = JSON.parse(JSON.stringify(older)) as StoryWorldState
    expect(storyContinuityItems(restored, 'a')).toEqual(storyContinuityItems(older, 'a'))
    expect(storyContinuityItems(world(), 'a')).toEqual([])
  })
})

describe('explicit memory replacement', () => {
  function approved() {
    const proposal = proposeStoryMemory(emptyStoryMemory(), { expectedRevision: 0, kind: 'scene', title: '条件',
      directorSummary: '甲要求钥匙。', publicSummary: '交出钥匙才开门。', publicAudience: ['a', 'b'],
      actorMemories: { a: '我不会先开门。', b: '他要钥匙。' }, eventRefs: ['promise'], proposedBy: 'director' })
    return reviewStoryMemory(proposal, proposal.revision, proposal.entries[0]!.id, true)
  }
  it('replaces only explicitly named memories and keeps all source and viewer coverage', () => {
    const old = approved()
    const proposal = proposeStoryMemory(old, { expectedRevision: old.revision, kind: 'arc', title: '交换完成',
      directorSummary: '交换完成。', publicSummary: '钥匙已交出。', publicAudience: ['a', 'b'],
      actorMemories: { a: '可以开门了。', b: '我交出了钥匙。' }, eventRefs: ['promise', 'answer'],
      replaces: [old.entries[0]!.id], proposedBy: 'director' })
    const reviewed = reviewStoryMemory(proposal, proposal.revision, proposal.entries[1]!.id, true)
    expect(reviewed.entries.map(entry => entry.status)).toEqual(['superseded', 'approved'])
    expect(activeStoryMemories(reviewed, 'c')).toEqual([])
    expect(activeStoryMemories(reviewed, 'a').join()).toContain('可以开门了。')
  })
  it.each(['source', 'private', 'public', 'stale'])('rejects incomplete %s replacement coverage', (missing) => {
    const old = approved()
    const proposal = proposeStoryMemory(old, { expectedRevision: old.revision, kind: 'scene', title: '合并',
      directorSummary: '合并。', publicSummary: '条件。', publicAudience: missing === 'public' ? ['a'] : ['a', 'b'],
      actorMemories: missing === 'private' ? { a: '甲。' } : { a: '甲。', b: '乙。' },
      eventRefs: missing === 'source' ? [] : ['promise'],
      replaces: [missing === 'stale' ? 'unknown' : old.entries[0]!.id], proposedBy: 'director' })
    expect(() => reviewStoryMemory(proposal, proposal.revision, proposal.entries[1]!.id, true)).toThrow()
    expect(proposal.entries[0]?.status).toBe('approved')
  })
})
