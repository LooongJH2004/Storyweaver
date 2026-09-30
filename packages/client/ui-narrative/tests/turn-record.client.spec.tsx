// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ExecutionHistoryScope, ExecutionRequestDetail, ExecutionRequestSummary, InstanceId } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from '../src/client/contract.ts'
import { TurnRecord } from '../src/client/TurnRecord.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
const dictionary: Partial<Record<Parameters<NarrativeProps['t']>[0], string>> = en
const t: NarrativeProps['t'] = key => dictionary[key] ?? key
const scope: ExecutionHistoryScope = { instanceId: 'story' as InstanceId, revision: 12, actorId: 'keeper' }
const summary = (requestId: number, turn = 2): ExecutionRequestSummary => ({ requestId, attempt: 'attempt', revision: 10,
  configurationRevision: 0, turn, step: requestId, provider: 'mock', model: 'mock', status: 'response-recorded' })
const detail = (requestId: number, text: string): ExecutionRequestDetail => ({ scope, request: summary(requestId), requestJson: '{}',
  response: { state: 'finished', text: '', reasoning: text, toolCalls: [] } })

it('keeps thinking collapsed and reads only the selected turn, in step order, on demand', async () => {
  const readExecutionPage = vi.fn<NarrativeProps['readExecutionPage']>().mockResolvedValue({ scope,
    entries: [summary(3), summary(2), summary(1, 1)], total: 3, nextOffset: null })
  const readExecutionDetail = vi.fn<NarrativeProps['readExecutionDetail']>().mockImplementation(async (_scope, id) => detail(id, `Thought ${id}`))
  render(<TurnRecord t={t} scope={scope} readExecutionPage={readExecutionPage} readExecutionDetail={readExecutionDetail} />)
  const toggle = screen.getByRole('button', { name: 'Thinking process' })
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(readExecutionPage).not.toHaveBeenCalled()
  fireEvent.click(toggle)
  await screen.findByText('Thought 2')
  expect(readExecutionDetail.mock.calls.map(call => call[1])).toEqual([2, 3])
  expect(screen.getByText('Thought 2').compareDocumentPosition(screen.getByText('Thought 3')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.keyDown(toggle, { key: 'Enter' })
  expect(screen.queryByText('Thought 2')).toBeNull()
})

it('discards late details after changing character or revision', async () => {
  let finishOld: ((value: ExecutionRequestDetail) => void) | undefined
  const old = new Promise<ExecutionRequestDetail>((resolve) => { finishOld = resolve })
  const readExecutionPage = vi.fn<NarrativeProps['readExecutionPage']>().mockImplementation(async selected => ({ scope: selected,
    entries: [summary(1)], total: 1, nextOffset: null }))
  const readExecutionDetail = vi.fn<NarrativeProps['readExecutionDetail']>().mockImplementation(async selected =>
    selected.actorId === 'keeper' ? old : { ...detail(1, 'New character thought'), scope: selected })
  const props = { t, readExecutionPage, readExecutionDetail }
  const view = render(<TurnRecord {...props} scope={scope} />)
  fireEvent.click(screen.getByRole('button', { name: 'Thinking process' }))
  await waitFor(() => { expect(readExecutionDetail).toHaveBeenCalledTimes(1) })
  view.rerender(<TurnRecord {...props} scope={{ ...scope, actorId: 'visitor', revision: 13 }} />)
  await screen.findByText('New character thought')
  await act(async () => { finishOld?.(detail(1, 'Old private thought')) })
  expect(screen.queryByText('Old private thought')).toBeNull()
  expect(screen.getByText('New character thought')).toBeTruthy()
})

it('waits for the selected preparation attempt, refreshes partial output and stops reading when collapsed', async () => {
  const readExecutionPage = vi.fn<NarrativeProps['readExecutionPage']>().mockResolvedValueOnce({ scope,
    entries: [summary(1)], total: 1, nextOffset: null }).mockResolvedValue({ scope,
    entries: [{ ...summary(2), attempt: 'preparation' }, summary(1)], total: 2, nextOffset: null })
  const readExecutionDetail = vi.fn<NarrativeProps['readExecutionDetail']>().mockResolvedValue({
    ...detail(2, 'I should wait for the visitor.'), request: { ...summary(2), attempt: 'preparation' },
    response: { state: 'streaming', text: '', reasoning: 'I should wait for the visitor.', toolCalls: [{
      id: 'prepare', name: 'npc_commit_turn', arguments: JSON.stringify({ thoughts: [{ content: 'The letter may be private.' }],
        discussion: { action: 'pass', stance: 'Listen first.', eagerness: 'low' } }),
    }] },
  })
  render(<TurnRecord t={t} scope={scope} attempt="preparation" preparation live title="Keeper preparation"
    readExecutionPage={readExecutionPage} readExecutionDetail={readExecutionDetail} />)
  const toggle = screen.getByRole('button', { name: 'Keeper preparation' })
  fireEvent.click(toggle)
  await waitFor(() => { expect(readExecutionPage).toHaveBeenCalledTimes(1) })
  expect(readExecutionDetail).not.toHaveBeenCalled()
  await screen.findByText('The letter may be private.', {}, { timeout: 2500 })
  expect(readExecutionDetail.mock.calls.every(call => call[1] === 2)).toBe(true)
  expect(screen.getByText(/Listen first/u, { selector: 'p' })).toBeTruthy()
  fireEvent.click(toggle)
  const count = readExecutionPage.mock.calls.length
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)) })
  expect(readExecutionPage).toHaveBeenCalledTimes(count)
})

it('keeps expanded evidence mounted while the same turn refreshes', async () => {
  let finish: ((value: ExecutionRequestDetail) => void) | undefined
  const readExecutionPage = vi.fn<NarrativeProps['readExecutionPage']>().mockResolvedValue({ scope,
    entries: [summary(1)], total: 1, nextOffset: null })
  const readExecutionDetail = vi.fn<NarrativeProps['readExecutionDetail']>().mockResolvedValueOnce(detail(1, 'Existing thought'))
    .mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const props = { t, scope, readExecutionPage, readExecutionDetail }
  const view = render(<TurnRecord {...props} refreshRevision={12} />)
  fireEvent.click(screen.getByRole('button', { name: 'Thinking process' }))
  const thought = await screen.findByText('Existing thought')
  view.rerender(<TurnRecord {...props} refreshRevision={13} />)
  await waitFor(() => { expect(readExecutionDetail).toHaveBeenCalledTimes(2) })
  expect(screen.getByText('Existing thought')).toBe(thought)
  expect(screen.queryByRole('status')).toBeNull()
  await act(async () => { finish?.(detail(1, 'Updated thought')) })
  expect(screen.getByText('Updated thought')).toBe(thought)
})

it('keeps director scheduling visible and loads earlier recorded tool steps across pages', async () => {
  const directorScope = { instanceId: scope.instanceId, revision: scope.revision }
  const readExecutionPage = vi.fn<NarrativeProps['readExecutionPage']>().mockImplementation(async (_scope, offset) => ({ scope: directorScope,
    entries: offset === 0 ? [summary(3)] : [summary(2), summary(1, 1)], total: 3, nextOffset: offset === 0 ? 1 : null }))
  const readExecutionDetail = vi.fn<NarrativeProps['readExecutionDetail']>().mockImplementation(async (_scope, id) => ({ ...detail(id, `Plan ${id}`),
    scope: directorScope, response: { state: 'finished', text: '', reasoning: `Plan ${id}`,
      toolCalls: [{ id: 'stage', name: 'director_command', arguments: '{"command":{"operation":"stage"}}' }] } }))
  render(<TurnRecord t={t} director scope={directorScope}
    readExecutionPage={readExecutionPage} readExecutionDetail={readExecutionDetail} />)
  fireEvent.click(screen.getByRole('button', { name: /^Director dispatch/u }))
  await screen.findByText('Plan 3')
  expect(screen.getByText('director_command')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Load earlier steps' }))
  await screen.findByText('Plan 2')
  expect(readExecutionDetail.mock.calls.some(call => call[1] === 1)).toBe(false)
  expect(readExecutionPage.mock.calls.every(call => call[0].actorId === undefined)).toBe(true)
})
