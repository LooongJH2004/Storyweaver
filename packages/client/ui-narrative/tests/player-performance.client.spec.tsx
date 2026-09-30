// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PlayerPerformanceFields } from '../src/client/PlayerPerformanceFields.tsx'
import { emptyPerformance, performanceBehavior } from '../src/client/player-performance.ts'
import { en } from '../src/client/locales.ts'
import { createNarrativeStore } from '../src/client/stores.ts'

afterEach(cleanup)

it('isolates character drafts and retains edits made while a submitted response is pending', () => {
  const handle = createNarrativeStore()
  const editor = handle.create('player-performance-test')
  editor.clearPersisted()
  const a = JSON.stringify(['story-a', 'actor-a'])
  const b = JSON.stringify(['story-a', 'actor-b'])
  const submitted = { ...emptyPerformance, speech: 'Hello.', action: 'I wait.' }
  editor.actions.performance(a, submitted)
  editor.actions.performance(b, { ...emptyPerformance, speech: 'Another character.' })
  editor.actions.performance(a, { ...submitted, speech: 'My next reply.' })
  editor.actions.performanceAccepted(a, submitted)
  const reloaded = handle.create('player-performance-test')
  expect(reloaded.store.getSnapshot().performances?.[a]).toMatchObject({ speech: 'My next reply.', action: '' })
  expect(reloaded.store.getSnapshot().performances?.[b]?.speech).toBe('Another character.')
  editor.clearPersisted()
})

it('keeps speech and action separate with independent recipients and omits empty behaviors', () => {
  const value = { ...emptyPerformance, speech: 'Wait here.', action: 'I open the door.', delivery: 'whispered' as const,
    target: 'person-listener', actionTarget: 'person-helper' }
  expect(performanceBehavior(value)).toEqual([
    { kind: 'speech', text: 'Wait here.', delivery: 'whispered', to: ['person-listener'] },
    { kind: 'action', attempt: 'I open the door.', target: 'person-helper' },
  ])
  expect(performanceBehavior({ ...value, speech: '  ', actionTarget: '' })).toEqual([{ kind: 'action', attempt: 'I open the door.' }])
  expect(performanceBehavior({ ...emptyPerformance, speech: 'Hello.' })).toEqual([{ kind: 'speech', text: 'Hello.', delivery: 'spoken', to: [] }])
  expect(performanceBehavior(emptyPerformance)).toEqual([])
})

it('shows two labeled fields, preserves IME Enter, and submits both fields together', () => {
  const submit = vi.fn()
  function Editor() {
    const [value, change] = useState(emptyPerformance)
    return <form onSubmit={(event) => { event.preventDefault(); submit(performanceBehavior(value)) }}>
      <PlayerPerformanceFields value={value} change={change} people={[{ ref: 'person-listener', label: 'A traveler' }]}
        t={key => String(Reflect.get(en, key) ?? key)} /><button type="submit">Submit</button>
    </form>
  }
  render(<Editor />)
  const speech = screen.getByRole('textbox', { name: 'What you say' })
  const action = screen.getByRole('textbox', { name: 'What you do' })
  fireEvent.change(speech, { target: { value: 'Wait here.' } })
  fireEvent.change(action, { target: { value: 'I open the door.' } })
  fireEvent.change(screen.getByLabelText('Delivery'), { target: { value: 'whispered' } })
  expect(screen.getByRole('status').textContent).toBe('Whispered or written speech requires a recipient.')
  fireEvent.change(screen.getByLabelText('Speak to'), { target: { value: 'person-listener' } })
  expect(screen.queryByRole('status')).toBeNull()
  fireEvent.keyDown(action, { key: 'Enter', isComposing: true })
  fireEvent.keyDown(action, { key: 'Enter', shiftKey: true })
  expect(submit).not.toHaveBeenCalled()
  fireEvent.keyDown(action, { key: 'Enter' })
  expect(submit).toHaveBeenCalledWith([
    { kind: 'speech', text: 'Wait here.', delivery: 'whispered', to: ['person-listener'] },
    { kind: 'action', attempt: 'I open the door.' },
  ])
  expect(screen.getAllByRole('textbox').map(input => ({ label: input.getAttribute('aria-label'), text: (input as HTMLTextAreaElement).value })))
    .toMatchInlineSnapshot(`
      [
        {
          "label": "What you say",
          "text": "Wait here.",
        },
        {
          "label": "What you do",
          "text": "I open the door.",
        },
      ]
    `)
})
