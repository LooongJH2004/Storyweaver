import { expect, it } from 'vitest'
import { presentStoryContextPreview } from '../src/context-preview.ts'

it('preserves runtime text, order, roles and exact character accounting across metadata presentation', () => {
  const sections = [
    { id: 'style' as const, role: 'user' as const, content: '[STYLE]\n陌生人：明日再谈。\n旧友：你先走。' },
    { id: 'actor-state' as const, role: 'system' as const, content: '[ACTOR-STATE]\n当前心境：沉默；范围由作者定义。' },
  ]
  const preview = presentStoryContextPreview({ sections, pendingActorInitialization: false }, 'actor', 'a')
  expect(preview.sections.map(({ id, role, content }) => ({ id, role, content }))).toEqual(sections)
  expect(preview.sections[0]).toMatchObject({ permission: 'player-editable', visibility: 'actor-private' })
  expect(preview.sections[1]).toMatchObject({ permission: 'runtime-derived', visibility: 'actor-private' })
  expect(preview.totalChars).toBe(sections.reduce((sum, section) => sum + section.content.length, 0))
  expect(preview.pendingActorInitialization).toBe(false)
})

it('retains an explicit uninitialized state instead of inventing opening lifecycle records', () => {
  const preview = presentStoryContextPreview({ sections: [], pendingActorInitialization: true }, 'actor', 'a')
  expect(preview).toMatchObject({ pendingActorInitialization: true, sections: [], totalChars: 0 })
})
