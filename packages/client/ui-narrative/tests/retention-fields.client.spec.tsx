// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ContextUpdateUnit } from '@deepseek-ai/dsh-roleplay-core/context-retention'
import { RetentionProposalFields } from '../src/client/RetentionProposalFields.tsx'
import type { NarrativeProps } from '../src/client/contract.ts'
import { en } from '../src/client/locales.ts'
import { Retention } from '../src/client/Retention.tsx'
import type { InstanceId } from '@deepseek-ai/dsh-roleplay-core/types'

afterEach(cleanup)
const messages: Record<string, string> = en
const t: NarrativeProps['t'] = key => messages[key] ?? key

it('keeps a failed disable action available and refreshes only after an accepted retry', async () => {
  const retention = vi.fn<NarrativeProps['retention']>().mockRejectedValueOnce(new Error('Revision changed')).mockResolvedValue(undefined)
  const author = vi.fn<NarrativeProps['author']>().mockResolvedValue(undefined)
  render(<Retention t={t} retention={retention} author={author} recall={vi.fn()} detail={{ request: null, recalled: null, error: null,
    retention: { instanceId: 'story' as InstanceId, revision: 12, owner: 'actor:a', retention: { revision: 2,
      sources: [], pins: [], proposals: [], notes: [{ id: 'note', revision: 3, scope: 'actor:a', author: 'actor:a', kind: 'claim',
        text: 'I may trust the visitor.', sourceIds: ['source'], status: 'active' }] } } }} />)
  const button = screen.getByRole('button', { name: 'Disable summary and restore source context' })
  fireEvent.click(button)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Error: Revision changed')
  expect(author).not.toHaveBeenCalled()
  expect(retention).toHaveBeenCalledWith('story', 12, { operation: 'revoke', owner: 'actor:a', id: 'note', revision: 3 })
  fireEvent.click(button)
  await waitFor(() => { expect(author).toHaveBeenCalledWith('story', undefined) })
  expect(screen.queryByRole('alert')).toBeNull()
})

it('submits an effective memory correction and retains the draft after a failed save', async () => {
  const retention = vi.fn<NarrativeProps['retention']>().mockRejectedValueOnce(new Error('Save failed')).mockResolvedValue(undefined)
  const author = vi.fn<NarrativeProps['author']>().mockResolvedValue(undefined)
  render(<Retention t={t} retention={retention} author={author} recall={vi.fn()} detail={{ request: null, recalled: null, error: null,
    retention: { instanceId: 'story' as InstanceId, revision: 12, owner: 'actor:a', retention: { revision: 2,
      sources: [], pins: [], proposals: [], notes: [{ id: 'note', revision: 3, scope: 'actor:a', author: 'actor:a', kind: 'claim',
        text: 'I trust the visitor.', sourceIds: ['source'], status: 'active' }] } } }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Correct memory' }))
  fireEvent.change(screen.getByLabelText('Brief understanding'), { target: { value: 'Their motive is uncertain.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Error: Save failed')
  expect(screen.getByLabelText('Brief understanding')).toHaveProperty('value', 'Their motive is uncertain.')
  expect(retention).toHaveBeenCalledWith('story', 12, { operation: 'correct', owner: 'actor:a', id: 'note', revision: 3,
    content: { text: 'Their motive is uncertain.' } })
  expect(author).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => { expect(author).toHaveBeenCalled() })
  expect(screen.queryByLabelText('Brief understanding')).toBeNull()
})

it('edits episode understanding while retaining exact source coverage and note revision', () => {
  let value: ContextUpdateUnit = { sourceIds: ['event-1'], disposition: 'represented', reason: 'Keep the encounter.', changes: [{
    operation: 'revise', noteId: 'note-1', expectedRevision: 3, kind: 'claim', text: 'I may trust the visitor.', sourceIds: ['event-1'],
    episode: { topic: 'The visitor', experience: 'They returned my key.', interpretation: 'They seem honest.', impact: 'I feel relieved.', unresolved: [] },
  }] }
  function Editor() {
    const [draft, setDraft] = useState(value)
    return <RetentionProposalFields t={t} value={draft} change={(next) => { value = next; setDraft(next) }} />
  }
  render(<Editor />)
  fireEvent.change(screen.getByLabelText('Character interpretation'), { target: { value: 'Their motive remains uncertain.' } })
  fireEvent.change(screen.getByLabelText('Unresolved matters (one per line)'), { target: { value: 'Why return the key?\nAsk tomorrow.' } })
  expect(value.sourceIds).toEqual(['event-1'])
  expect(value.changes[0]).toMatchObject({ operation: 'revise', noteId: 'note-1', expectedRevision: 3, sourceIds: ['event-1'],
    episode: { experience: 'They returned my key.', interpretation: 'Their motive remains uncertain.',
      unresolved: ['Why return the key?', 'Ask tomorrow.'] } })
  expect(screen.getByLabelText('Brief understanding')).toHaveProperty('value', 'I may trust the visitor.')
  expect(screen.getByLabelText('Character interpretation')).toHaveProperty('required', false)
  fireEvent.change(screen.getByLabelText('Character interpretation'), { target: { value: '' } })
  fireEvent.change(screen.getByLabelText('Personal impact'), { target: { value: '  ' } })
  expect(value.changes[0]?.episode).not.toHaveProperty('interpretation')
  expect(value.changes[0]?.episode).not.toHaveProperty('impact')
  expect(screen.getByLabelText('Character interpretation')).toHaveProperty('value', '')
  expect(value.changes[0]).toMatchObject({ expectedRevision: 3, sourceIds: ['event-1'], episode: { experience: 'They returned my key.' } })
})


it('reads effective details and all proposal sources directly without approving or editing them', async () => {
  const recall = vi.fn<NarrativeProps['recall']>().mockRejectedValueOnce(new Error('Read failed')).mockResolvedValue(undefined)
  const retention = vi.fn<NarrativeProps['retention']>()
  const author = vi.fn<NarrativeProps['author']>()
  const unit: ContextUpdateUnit = { sourceIds: ['attempt'], disposition: 'represented', reason: 'Keep the attempt.',
    changes: [{ operation: 'add', kind: 'claim', text: 'I tried lifting it.', sourceIds: ['attempt', 'later-feedback'] }] }
  const scroll = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
  render(<Retention t={t} retention={retention} author={author} recall={recall} detail={{ request: null, recalled: null, error: null,
    retention: { instanceId: 'story' as InstanceId, revision: 12, owner: 'actor:a', retention: { revision: 2,
      sources: [], pins: [], notes: [{ id: 'note', revision: 3, scope: 'actor:a', author: 'actor:a', kind: 'claim',
        text: 'I watched the box move.', sourceIds: ['witness'], status: 'active',
        episode: { topic: 'The box', experience: 'It slid while I watched.', unresolved: [] } }],
      proposals: [{ id: 'proposal', revision: 1, scope: 'actor:a', turnId: 'turn', status: 'proposed',
        unit, submittedUnit: unit, retainedNoteIds: [] }],
    } } }} />)
  expect(screen.getByText('It slid while I watched.').closest('details')?.hasAttribute('open')).toBe(false)
  expect(screen.queryByLabelText('Brief understanding')).toBeNull()
  fireEvent.click(screen.getByTitle('witness'))
  expect(recall).toHaveBeenLastCalledWith({ query: 'witness', offset: 0, limit: 20 })
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Error: Read failed')
  expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Source search results' }))
  fireEvent.click(screen.getByTitle('later-feedback'))
  await waitFor(() => { expect(screen.queryByRole('alert')).toBeNull() })
  expect(recall).toHaveBeenLastCalledWith({ query: 'later-feedback', offset: 0, limit: 20 })
  expect(screen.getAllByTitle('attempt')).toHaveLength(1)
  expect(retention).not.toHaveBeenCalled()
  expect(author).not.toHaveBeenCalled()
  expect(scroll).toHaveBeenCalled()
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})
