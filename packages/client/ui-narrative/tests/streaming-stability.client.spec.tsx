// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ExecutionRequestSummary, InstanceId } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from '../src/client/contract.ts'
import { TurnUsage } from '../src/client/TurnUsage.tsx'
import { ExecutionDraft } from '../src/client/ExecutionDraft.tsx'
import { LiveExecution } from '../src/client/LiveExecution.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
const dictionary: Partial<Record<Parameters<NarrativeProps['t']>[0], string>> = en
const t: NarrativeProps['t'] = key => dictionary[key] ?? key
const request: ExecutionRequestSummary = { requestId: 1, attempt: 'turn', revision: 1, configurationRevision: 0,
  turn: 1, step: 1, provider: 'mock', model: 'mock', status: 'response-recorded' }

it('does not reinsert a settled actor draft when its execution stream arrives behind accepted play', () => {
  const scope = { instanceId: 'story' as InstanceId, actorId: 'keeper', revision: 2 }
  const response = { state: 'finished' as const, text: '', reasoning: '', toolCalls: [{ id: 'call', name: 'npc_commit_turn',
    arguments: JSON.stringify({ behavior: [{ kind: 'speech', text: 'Accepted speech.' }] }) }] }
  const props = { t, ...scope, reading: true, followExecution: vi.fn(), stopExecution: vi.fn(),
    useExecution: selector => selector({ request: scope, loading: false, error: null,
      view: { scope, request: { scope, request, requestJson: '{}', response } } }) } satisfies Parameters<typeof LiveExecution>[0]
  const view = render(<LiveExecution {...props} acceptedRevision={0} />)
  expect(screen.getByText('Accepted speech.')).toBeTruthy()
  view.rerender(<LiveExecution {...props} acceptedRevision={2} />)
  expect(view.container.textContent).toBe('')
  view.rerender(<LiveExecution {...props} acceptedRevision={2} />)
  expect(view.container.textContent).toBe('')
})

it('does not requery settled historical usage at later actor or command completions', async () => {
  const turnUsage = vi.fn<NarrativeProps['turnUsage']>().mockResolvedValue({ ...request,
    turnUsage: { uncachedInputTokens: 10, outputTokens: 5, totalTokens: 15 } })
  const props = { t, usageT: key => key, turnUsage, instanceId: 'story' as InstanceId, revision: 1,
    settled: true, refreshRevision: 1 } satisfies Parameters<typeof TurnUsage>[0]
  const view = render(<TurnUsage {...props} />)
  await waitFor(() => { expect(view.container.querySelector('[data-execution-usage]')).not.toBeNull() })
  view.rerender(<TurnUsage {...props} settled={false} refreshRevision={2} />)
  view.rerender(<TurnUsage {...props} settled refreshRevision={3} />)
  expect(turnUsage).toHaveBeenCalledTimes(1)
})

it('keeps historical usage mounted during refresh and clears it immediately on perspective changes', async () => {
  let finish: ((value: ExecutionRequestSummary | null) => void) | undefined
  const turnUsage = vi.fn<NarrativeProps['turnUsage']>().mockResolvedValueOnce(request)
    .mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const props = { t, usageT: key => key, turnUsage, instanceId: 'story' as InstanceId, revision: 1, actorId: 'keeper', settled: true, refreshRevision: 1 } satisfies Parameters<typeof TurnUsage>[0]
  const view = render(<TurnUsage {...props} />)
  await waitFor(() => { expect(view.container.querySelector('[data-execution-usage]')).not.toBeNull() })
  const footer = view.container.querySelector('[data-execution-usage]')
  view.rerender(<TurnUsage {...props} settled={false} refreshRevision={0} />)
  expect(view.container.querySelector('[data-execution-usage]')).toBe(footer)
  await act(async () => { finish?.({ ...request, turnRequestCount: 2 }) })
  expect(view.container.querySelector('[data-execution-usage]')).toBe(footer)
  view.rerender(<TurnUsage {...props} actorId="visitor" />)
  expect(view.container.querySelector('[data-execution-usage]')).toBeNull()
  await act(async () => { finish?.(null) })
  expect(view.container.querySelector('[data-execution-usage]')).toBeNull()
})

it('retains usage and offers retry after a failed background refresh', async () => {
  const turnUsage = vi.fn<NarrativeProps['turnUsage']>().mockResolvedValueOnce(request).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(null)
  const props = { t, usageT: key => key, turnUsage, instanceId: 'story' as InstanceId, revision: 1, settled: true, refreshRevision: 1 } satisfies Parameters<typeof TurnUsage>[0]
  const view = render(<TurnUsage {...props} />)
  await waitFor(() => { expect(view.container.querySelector('[data-execution-usage]')).not.toBeNull() })
  const footer = view.container.querySelector('[data-execution-usage]')
  view.rerender(<TurnUsage {...props} refreshRevision={2} />)
  await screen.findByRole('alert')
  expect(view.container.querySelector('[data-execution-usage]')).toBe(footer)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => { expect(view.container.querySelector('[data-execution-usage]')).toBeNull() })
})

it('streams Markdown without rendering transient TeX errors and retains completed paragraph nodes', () => {
  const response = (text: string, state: 'streaming' | 'finished' = 'streaming') => ({ state, text: '', reasoning: '',
    toolCalls: [{ id: 'call', name: 'npc_commit_turn', arguments: JSON.stringify({ behavior: [{ kind: 'speech', text }] }) }] })
  const prefix = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\n'
  const view = render(<ExecutionDraft t={t} response={response(`${prefix}$$\\frac{1}$$`)} />)
  const first = screen.getByText('First paragraph.')
  expect(view.container.querySelector('.katex-error')).toBeNull()
  view.rerender(<ExecutionDraft t={t} response={response(`${prefix}$$\\frac{1}{2}$$`)} />)
  expect(screen.getByText('First paragraph.')).toBe(first)
  expect(view.container.querySelector('.katex')).toBeNull()
  view.rerender(<ExecutionDraft t={t} response={response(`${prefix}$$\\frac{1}{2}$$`, 'finished')} />)
  expect(view.container.querySelector('.katex')).not.toBeNull()
})
