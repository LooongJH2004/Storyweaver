import { expect, it } from 'vitest'
import { consolidationBackground } from '../src/consolidation-context.ts'
import type { RenderedContextSection } from '../src/context-recipe.ts'

it('keeps author references in evidence slots while removing live events and pending attempts from private background', () => {
  const sections: RenderedContextSection[] = [
    { id: 'evidence', role: 'user', content: 'Assigned original, supplied separately.', sources: ['original-1'] },
    { id: 'evidence', role: 'user', content: 'Later event outside this batch.', sources: ['original-2'] },
    { id: 'behavior', role: 'user', content: 'Current attempt.', sources: ['world:pending'] },
    { id: 'evidence', role: 'system', content: 'Author evidence instructions.', sources: ['recipe:evidence'] },
    { id: 'behavior', role: 'user', content: 'Author behavior instructions.', sources: ['recipe:behavior'] },
    { id: 'identity', role: 'system', content: 'Identity.', sources: ['actor:keeper'] },
    { id: 'knowledge', role: 'user', content: 'Current belief, not this batch evidence.', sources: ['knowledge:belief:r1'] },
    { id: 'retention', role: 'user', content: 'Existing note available for revision.', sources: ['retention:note:r1'] },
    { id: 'custom:evidence', role: 'user', content: 'Custom guidance.', sources: ['recipe:custom:evidence'] },
  ]
  expect(consolidationBackground(sections)).toEqual(sections.slice(3))
  expect(sections).toHaveLength(9)
})

it('keeps goals and authored lifecycle guidance without recycling personal recollections as batch evidence', () => {
  const memory = { id: 'lifecycle', role: 'user' as const, content: 'I already carried out my proposed plan.', sources: ['memory:later'] }
  const background: RenderedContextSection[] = [
    { id: 'lifecycle', role: 'user', content: 'Find a safe storage method.', sources: ['goal:store:r1'] },
    { id: 'lifecycle', role: 'system', content: 'Author lifecycle guidance.', sources: ['recipe:lifecycle'] },
    { id: 'retention', role: 'user', content: 'Earlier approved understanding.', sources: ['retention:note:old:r1'] },
  ]
  expect(consolidationBackground([memory, ...background])).toEqual(background)
  expect(memory.content).toBe('I already carried out my proposed plan.')
})

it('omits public performance settings without changing the saved sections or custom memory guidance', () => {
  const publicSections: RenderedContextSection[] = [
    { id: 'performance', role: 'system', content: 'Perform in developed paragraphs.', sources: ['recipe:performance'] },
    { id: 'style', role: 'user', content: 'Write 400–800 characters.', sources: ['style:current'] },
    { id: 'scene-style', role: 'user', content: 'Greet the visitor.', sources: ['style:scene'] },
    { id: 'narration-length', role: 'system', content: 'At least 500 characters.', sources: ['configuration:narration-length'] },
  ]
  const memoryGuidance: RenderedContextSection = { id: 'custom:memory', role: 'system',
    content: 'Remember promises in your own words.', sources: ['recipe:custom:memory'] }
  const ordinary = [...publicSections, memoryGuidance]
  const before = structuredClone(ordinary)
  expect(consolidationBackground(ordinary)).toEqual([memoryGuidance])
  expect(ordinary).toEqual(before)
})
