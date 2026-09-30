import { expect, it } from 'vitest'
import { ContextAssembly, initialContextRecipe, optimizeActorContextRecipe, type ContextSection } from '../src/context-recipe.ts'

it('renders complete selected history in event order without a character ceiling or moving authored text', () => {
  const assembly = new ContextAssembly([{ id: 'evidence', role: 'user', enabled: true, content: 'Authored' }])
  assembly.addHistory('evidence', [
    { content: 'oldest'.repeat(20000), source: 'old' },
    { content: 'middle', source: 'middle' },
    { content: 'newest', source: 'new' },
  ])
  const result = assembly.finish()
  expect(result.sources).toEqual(['recipe:evidence', 'old', 'middle', 'new'])
  expect(result.text).toContain('Authored')
  expect(result.text.indexOf('middle')).toBeLessThan(result.text.indexOf('newest'))
  expect(result.text).toContain('oldest'.repeat(20000))
})

it('preserves authored boundaries, roles and content while ordering stable actor modules first', () => {
  const section = (id: string, role: ContextSection['role'] = 'system'): ContextSection => ({ id, role, enabled: true })
  const recipe = { ...initialContextRecipe(), actor: [section('evidence'), section('identity'),
    { ...section('custom:reference'), title: 'Keep', content: 'An authored boundary' },
    section('people'), { ...section('knowledge'), enabled: false }, section('scene-style', 'assistant'),
    section('style', 'assistant'), section('objective-state'), section('reasoning-mode', 'user'), section('policy')] }
  const before = structuredClone(recipe)
  const optimized = optimizeActorContextRecipe(recipe)
  expect(optimized.actor.map(item => item.id)).toEqual(['identity', 'evidence', 'custom:reference',
    'knowledge', 'people', 'style', 'scene-style', 'objective-state', 'reasoning-mode', 'policy'])
  expect(recipe).toEqual(before)
  expect(optimized.director).toBe(recipe.director)
  for (const item of optimized.actor) expect(item).toBe(recipe.actor.find(original => original.id === item.id))
  expect(optimizeActorContextRecipe(optimized)).toEqual(optimized)
})

it('keeps every selected evidence entry and authored text when optimizing section order', () => {
  const recipe = initialContextRecipe()
  recipe.actor = [...recipe.actor].reverse()
  recipe.actor.push({ id: 'custom:reference', title: 'Reference', content: 'Keep this example.', role: 'assistant', enabled: true })
  const render = (sections: ContextSection[]) => {
    const assembly = new ContextAssembly(sections)
    assembly.add('identity', 'Actor identity', 'self')
    assembly.add('people', 'Current people', 'scene')
    assembly.add('knowledge', 'Private judgment', 'knowledge:1')
    const selected = [assembly.add('evidence', 'a'.repeat(1200), 'evidence:1'),
      assembly.add('evidence', 'b'.repeat(2200), 'evidence:2')]
    return { selected, ...assembly.finish() }
  }
  const before = render(recipe.actor)
  const after = render(optimizeActorContextRecipe(recipe).actor)
  expect(before.selected).toEqual([true, true])
  expect(after.selected).toEqual(before.selected)
  expect(after.sources.toSorted()).toEqual(before.sources.toSorted())
  expect(after.sections.map(item => JSON.stringify(item)).sort()).toEqual(before.sections.map(item => JSON.stringify(item)).sort())
  expect(after.sections.map(item => item.id)).not.toEqual(before.sections.map(item => item.id))
})
