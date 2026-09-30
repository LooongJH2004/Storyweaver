import { expect, it } from 'vitest'
import { initialContextRecipe, performanceSection } from '../src/context-recipe.ts'

it('records the default performance guidance that new stories send to both model roles', async () => {
  const recipe = initialContextRecipe()
  expect(recipe.actor.find(section => section.id === 'performance')).toEqual(performanceSection('actor'))
  expect(recipe.director.find(section => section.id === 'performance')).toEqual(performanceSection('director'))
  await expect({ actor: performanceSection('actor'), director: performanceSection('director') })
    .toMatchFileSnapshot('./expected/performance-guidance.json')
})
