// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { InstanceId, PlayView } from '@deepseek-ai/dsh-roleplay-core/types'
import { Discussion } from '../src/client/Discussion.tsx'
import type { InstanceSettings } from '@deepseek-ai/dsh-roleplay-core/settings'
import { DiscussionSettingsFields } from '../src/client/DiscussionSettingsFields.tsx'
import { DiscussionBudget } from '../src/client/DiscussionBudget.tsx'
import type { NarrativeProps } from '../src/client/contract.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
const messages: Record<string, string> = en
const t: NarrativeProps['t'] = (key, params) => Object.entries(params ?? {}).reduce((text, [name, value]) =>
  text.replaceAll(`{${name}}`, String(value)), messages[key] ?? key)

it('submits a revision-bound invitation decision and retains a failed invitation for correction', async () => {
  const controlDiscussion = vi.fn<NarrativeProps['controlDiscussion']>().mockRejectedValueOnce(new Error('Invitation changed'))
    .mockResolvedValue(undefined)
  const view: PlayView = { instanceId: 'story' as InstanceId, revision: 9, templateVersionId: 'book-v1', scene: { id: 'inn', location: 'Inn' },
    phase: 'ready', people: [], rows: [], total: 0,
    discussionRequests: [{ id: 'request', revision: 2, requester: { label: 'The innkeeper' },
      topic: 'Inspect the bridge', opening: 'Agree on a safe route', status: 'deferred' }] }
  render(<Discussion t={t} view={view} running={false} peopleChoices={null} controlDiscussion={controlDiscussion}
    startDiscussion={vi.fn()} advanceDiscussion={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Accept and create discussion' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Error: Invitation changed')
  expect(controlDiscussion).toHaveBeenCalledWith('story', 9, { operation: 'request', requestId: 'request',
    expectedRequestRevision: 2, decision: 'accept', reason: 'Accept and create discussion' })
  expect(screen.getByText('Inspect the bridge')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Defer for later' }))
  await waitFor(() => { expect(screen.queryByRole('alert')).toBeNull() })
  expect(controlDiscussion.mock.calls[1]?.[2]).toMatchObject({ decision: 'defer', expectedRequestRevision: 2 })
})

it('preserves the selected policy while editing the budget and leaves historical omission untouched', () => {
  let saved: InstanceSettings['discussionSettings'] = { maxRounds: 4 }
  function Editor() {
    const [value, setValue] = useState(saved)
    return <DiscussionSettingsFields t={t} value={value} change={(next) => { saved = next; setValue(next) }} />
  }
  render(<Editor />)
  expect(saved).toEqual({ maxRounds: 4 })
  fireEvent.change(screen.getByLabelText('Automatic speaking order'), { target: { value: 'balanced' } })
  fireEvent.change(screen.getByLabelText('Maximum rounds'), { target: { value: '2' } })
  expect(saved).toEqual({ maxRounds: 2, floorPolicy: 'balanced' })
  fireEvent.change(screen.getByLabelText('Automatic speaking order'), { target: { value: 'eagerness' } })
  expect(saved).toEqual({ maxRounds: 2, floorPolicy: 'eagerness' })
})

it('shows public exchange counts from the projection even when the current round is unchanged', () => {
  const discussion = { id: 'discussion', topic: 'The bridge', status: 'active' as const, round: 1, maxRounds: 4 }
  const view = render(<DiscussionBudget t={t} discussion={discussion} />)
  expect(screen.getByText('Round 1 of at most 4')).toBeTruthy()
  view.rerender(<DiscussionBudget t={t} discussion={{ ...discussion, publicTurns: { used: 1, total: 12, remaining: 11 } }} />)
  expect(screen.getByText('1/12 exchanges · 11 remaining')).toBeTruthy()
  view.rerender(<DiscussionBudget t={t} discussion={{ ...discussion, publicTurns: { used: 2, total: 12, remaining: 10 } }} />)
  expect(screen.getByText('2/12 exchanges · 10 remaining')).toBeTruthy()
})
