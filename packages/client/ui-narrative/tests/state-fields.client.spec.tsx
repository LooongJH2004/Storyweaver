// @vitest-environment jsdom
/** Player state revisions preserve explicit constraints and invalid drafts. */
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StateFields } from '../src/client/StateFields.tsx'
import { en } from '../src/client/locales.ts'
import type { NarrativeProps } from '../src/client/contract.ts'
import type { StateEntry, StateChange } from '@deepseek-ai/dsh-roleplay-core/dynamic-state'
import { stateDefinitionSchema } from '@deepseek-ai/dsh-roleplay-core/dynamic-state'

afterEach(cleanup)
const dictionary: Partial<Record<Parameters<NarrativeProps['t']>[0], string>> = en
const t: NarrativeProps['t'] = key => dictionary[key] ?? key
const entry: StateEntry = { definition: stateDefinitionSchema.parse({ id: 'pain', name: 'Pain', group: 'Body',
  description: 'Perceived pain', type: 'number', owner: 'actor', actorId: 'a', guidance: '', minimum: 0, maximum: 10 }),
revision: 2, value: 3, active: true, reason: 'A cut', origin: 'actor', sourceRefs: [] }

it('sends an exact field revision and retains a rejected range edit for correction', async () => {
  const save = vi.fn<(changes: StateChange[]) => Promise<void>>().mockRejectedValueOnce(new Error('Current value conflicts with the new range'))
    .mockResolvedValueOnce()
  render(<StateFields t={t} actorId="a" owner="actor" state={{ version: 1, entries: [entry], history: [entry] }} people={[]} save={save} />)
  fireEvent.click(screen.getByRole('button', { name: 'Revise state' }))
  fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '4' } })
  fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Player correction' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Maximum')).toHaveProperty('value', '4')
  expect(save.mock.calls[0]?.[0][0]).toMatchObject({ fieldId: 'pain', expectedRevision: 2, value: 3 })
  fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '8' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => { expect(screen.queryByLabelText('Maximum')).toBeNull() })
  expect(save.mock.calls[1]?.[0][0]?.definition?.maximum).toBe(8)
})

it('creates a relationship field with explicit world visibility and preserves an empty current state', async () => {
  const save = vi.fn<(changes: StateChange[]) => Promise<void>>().mockResolvedValue()
  render(<StateFields t={t} actorId="a" owner="world" state={{ version: 1, entries: [], history: [entry] }}
    people={[{ id: 'b', label: 'Witness' }]} save={save} />)
  expect(screen.queryByText('Pain')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Add state field' }))
  for (const [label, value] of [['Field name', 'Visible wound'], ['Description', 'A fresh cut'], ['Group', 'Body'],
    ['Current value', 'Bleeding'], ['Reason for change', 'Window glass']]) fireEvent.change(screen.getByLabelText(label!), { target: { value } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Witness' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => { expect(save).toHaveBeenCalledOnce() })
  expect(save.mock.calls[0]?.[0][0]).toMatchObject({ expectedRevision: 0, value: 'Bleeding', definition: { owner: 'world', audience: ['b'] } })
})
