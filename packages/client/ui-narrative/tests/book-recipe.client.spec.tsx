// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { initialContextRecipe, performanceSection, contextRecipeSchema } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import { BookRecipe } from '../src/client/BookRecipe.tsx'
import { en } from '../src/client/locales.ts'
import type { ContextRecipe } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import { ExecutionDraft } from '../src/client/ExecutionDraft.tsx'

afterEach(cleanup)

it('retains the draft node across append streaming and does not append a settled revision twice', () => {
  const t = (key: Parameters<Parameters<typeof ExecutionDraft>[0]['t']>[0]) => String(Reflect.get(en, key) ?? key)
  const draft = { attempt: 'same-attempt', revision: 0, text: '雨落窗边。', status: 'pending' as const, characters: 4, minimum: 12, target: 20 }
  const response = { state: 'streaming' as const, text: '', reasoning: '', toolCalls: [{ id: 'append', name: 'director_revise_narration',
    arguments: JSON.stringify({ draftRevision: 0, mode: 'append', narration: '水珠滚落。' }) }] }
  const mounted = render(<ExecutionDraft t={t} response={{ ...response, toolCalls: [{ id: 'initial', name: 'director_observe',
    arguments: JSON.stringify({ narration: draft.text }) }] }} />)
  const original = mounted.container.querySelector('[data-kind="narration"]')
  mounted.rerender(<ExecutionDraft t={t} draft={draft} response={response} />)
  expect(mounted.container.querySelector('[data-kind="narration"]')).toBe(original)
  expect(mounted.container.textContent).toContain('水珠滚落。')
  mounted.rerender(<ExecutionDraft t={t} draft={{ ...draft, revision: 1, text: '雨落窗边。\n\n水珠滚落。', characters: 8 }} response={response} />)
  expect(mounted.container.textContent?.split('水珠滚落。')).toHaveLength(2)
})

it('persists numeric narration limits separately from creative prose and flags an inverted range', () => {
  let saved: ContextRecipe = initialContextRecipe()
  function Editor() {
    const [recipe, setRecipe] = useState(saved)
    return <BookRecipe recipe={recipe} change={(value) => { saved = value; setRecipe(value) }}
      t={key => String(Reflect.get(en, key) ?? key)} />
  }
  const mounted = render(<Editor />)
  fireEvent.click(screen.getByRole('checkbox', { name: en.narrationAutoExpand }))
  fireEvent.change(screen.getByRole('spinbutton', { name: en.narrationMinimum }), { target: { value: '1200' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: en.narrationTarget }), { target: { value: '1000' } })
  expect(screen.getByRole('alert').textContent).toBe(en.narrationLengthInvalid)
  expect(contextRecipeSchema.safeParse(saved).success).toBe(false)
  fireEvent.change(screen.getByRole('spinbutton', { name: en.narrationTarget }), { target: { value: '1600' } })
  expect(contextRecipeSchema.parse(saved).narrationLength).toEqual({ enabled: true, minimum: 1200, target: 1600 })
  mounted.unmount(); render(<Editor />)
  expect((screen.getByRole('spinbutton', { name: en.narrationMinimum }) as HTMLInputElement).value).toBe('1200')
  expect((screen.getByRole('checkbox', { name: en.narrationAutoExpand }) as HTMLInputElement).checked).toBe(true)
})

it('lets an existing book edit, disable and restore creative rules separately for director and actors', () => {
  const initial = initialContextRecipe()
  let saved = { ...initial, actor: initial.actor.filter(item => item.id !== 'performance'),
    director: initial.director.filter(item => item.id !== 'performance') }
  const t: Parameters<typeof BookRecipe>[0]['t'] = key => String(Reflect.get(en, key) ?? key)
  function Editor() {
    const [recipe, setRecipe] = useState(saved)
    return <BookRecipe recipe={recipe} change={(value) => { saved = value; setRecipe(value) }} t={t} />
  }
  const first = render(<Editor />)
  const field = () => screen.getByRole('textbox', { name: en.performanceText })
  expect((field() as HTMLTextAreaElement).value).toContain('500–900')
  fireEvent.change(field(), { target: { value: '' } })
  expect((field() as HTMLTextAreaElement).value).toBe('')
  fireEvent.change(field(), { target: { value: 'Write two paragraphs.' } })
  const row = within(field().closest('details')!)
  fireEvent.click(row.getByRole('checkbox', { name: en.enabled }))
  expect(contextRecipeSchema.parse(saved).director.find(item => item.id === 'performance'))
    .toMatchObject({ content: 'Write two paragraphs.', enabled: false })
  first.unmount(); render(<Editor />)
  expect((field() as HTMLTextAreaElement).value).toBe('Write two paragraphs.')
  fireEvent.click(screen.getByRole('button', { name: en.bookActor }))
  expect((field() as HTMLTextAreaElement).value).toContain('400–800')
  fireEvent.change(field(), { target: { value: 'A concise response.' } })
  fireEvent.click(screen.getByRole('button', { name: en.restorePerformance }))
  expect(saved.actor.find(item => item.id === 'performance')).toEqual(performanceSection('actor'))
  expect(saved.director.find(item => item.id === 'performance')).toMatchObject({ content: 'Write two paragraphs.', enabled: false })
})
