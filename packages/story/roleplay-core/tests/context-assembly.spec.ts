import { expect, it } from 'vitest'
import { ContextAssembly, contextRecipeSchema, initialContextRecipe } from '../src/context-recipe.ts'

it('assembles interleaved complete sources in recipe order with exact roles and provenance', () => {
  const assembly = new ContextAssembly([
    { id: 'identity', enabled: true, role: 'system' },
    { id: 'evidence', enabled: true, role: 'user' },
    { id: 'knowledge', enabled: false, role: 'assistant' },
  ])
  assembly.add('evidence', 'first', 'event:1')
  assembly.add('identity', 'self', 'actor:self')
  assembly.addHistory('evidence', [{ content: 'second', source: 'event:2' },
    { content: 'third', source: 'event:3' }])
  expect(assembly.add('knowledge', 'hidden', 'knowledge:1')).toBe(false)
  expect(() => assembly.add('planning', 'unknown', 'planning:1')).toThrow('Context source has no declared recipe section')

  const result = assembly.finish()
  expect(result.sections).toEqual([
    { id: 'identity', role: 'system', content: 'self', sources: ['actor:self'] },
    { id: 'evidence', role: 'user', content: 'first', sources: ['event:1'] },
    { id: 'evidence', role: 'user', content: 'second', sources: ['event:2'] },
    { id: 'evidence', role: 'user', content: 'third', sources: ['event:3'] },
  ])
  expect(result.text).toBe(result.sections.map(section => section.content).join('\n\n'))
  expect(result.sources).toEqual(result.sections.flatMap(section => section.sources))
})

it('accepts authored module counts beyond the former fixed limit on both audiences', () => {
  const recipe = initialContextRecipe()
  for (const side of ['actor', 'director'] as const) {
    recipe[side].push(...Array.from({ length: 65 }, (_, index) => ({
      id: `custom:${side}-${index}`, enabled: true, role: 'system' as const,
      title: `Module ${index}`, content: `Author reference ${index}`,
    })))
  }
  const accepted = contextRecipeSchema.parse(recipe)
  expect(accepted.actor).toHaveLength(recipe.actor.length)
  expect(accepted.director).toHaveLength(recipe.director.length)
})
