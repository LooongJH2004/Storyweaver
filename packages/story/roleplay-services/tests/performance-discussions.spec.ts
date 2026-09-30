import { expect, it } from 'vitest'
import { performanceDiscussions } from './performance-discussions.ts'

it('counts public slots independently of paragraphs and preserves silence and absent participation', () => {
  const turns = [
    { speakerId: 'a', text: 'First paragraph.\nSecond paragraph.', action: 'speak' as const },
    { speakerId: 'a', text: '', action: 'pass' as const },
    { speakerId: 'b', text: 'We disagree.', action: 'conclude' as const },
  ].map((turn, index) => ({ ...turn, id: `turn-${index}`, round: index + 1, createdAt: '2026-01-01T00:00:00Z' }))
  const [stats] = performanceDiscussions([{ id: 'discussion', status: 'completed', participantIds: ['a', 'b', 'c'], turns }])
  expect(stats).toMatchObject({ publicSlots: 3, speakerOrder: ['a', 'a', 'b'], endingDecision: 'conclude', participants: [
    { actorId: 'a', publicSlots: 2, speakDecisions: 1, passes: 1, longestConsecutiveSlots: 2 },
    { actorId: 'b', publicSlots: 1, conclusions: 1, longestConsecutiveSlots: 1 },
    { actorId: 'c', publicSlots: 0, longestConsecutiveSlots: 0 },
  ] })
})

it('does not invent a conclusion for a discussion without a public turn', () => {
  expect(performanceDiscussions([{ id: 'waiting', status: 'active', participantIds: ['a'], turns: [] }])[0])
    .toMatchObject({ status: 'active', publicSlots: 0, endingDecision: null, speakerOrder: [] })
})
