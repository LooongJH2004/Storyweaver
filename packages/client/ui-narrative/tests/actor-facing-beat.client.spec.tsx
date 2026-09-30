// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ActorFacingBeatField } from '../src/client/ActorFacingBeatField.tsx'
import { createNarrativeStore } from '../src/client/stores.ts'
import { en } from '../src/client/locales.ts'
import type { NarrativeProps } from '../src/client/contract.ts'

afterEach(cleanup)
const t: NarrativeProps['t'] = key => Object.hasOwn(en, key) ? en[key as keyof typeof en] : key

it('discloses a separately labeled character-visible draft with its limits', () => {
  const change = vi.fn()
  render(<ActorFacingBeatField t={t} value="" change={change} />)
  expect(screen.queryByRole('textbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: en.actorFacingBeatToggle }))
  const field = screen.getByRole('textbox', { name: en.actorFacingBeatLabel })
  expect(field.getAttribute('aria-describedby')).toBeTruthy()
  expect(screen.getByText(en.actorFacingBeatHint)).toBeTruthy()
  fireEvent.change(field, { target: { value: 'Stay with the letter.' } })
  expect(change).toHaveBeenCalledWith('Stay with the letter.')
})

it('keeps actor-visible and Director drafts independent and preserves edits made during submission', () => {
  const handle = createNarrativeStore()
  const editor = handle.create('actor-facing-beat-test')
  editor.clearPersisted()
  editor.actions.draft('story-a', 'Private Director direction.')
  editor.actions.actorFacingBeat('story-a', 'Let Nono handle the letter.')
  editor.actions.actorFacingBeat('story-b', 'Another story beat.')
  editor.actions.actorFacingBeat('story-a', 'Updated while pending.')
  editor.actions.actorFacingBeatAccepted('story-a', 'Let Nono handle the letter.')
  editor.actions.accepted('story-a', 'Private Director direction.')
  expect(editor.store.getSnapshot().drafts['story-a']).toBe('')
  expect(editor.store.getSnapshot().actorFacingBeatDrafts?.['story-a']).toBe('Updated while pending.')
  expect(editor.store.getSnapshot().actorFacingBeatDrafts?.['story-b']).toBe('Another story beat.')
  editor.clearPersisted()
})
