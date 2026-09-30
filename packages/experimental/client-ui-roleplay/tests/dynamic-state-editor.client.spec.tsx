// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { initializeDynamicState, stateInitialValueSchema } from '@deepseek-ai/dsh-story/state'
import { DynamicStateEditor } from '../src/client/DynamicStateEditor.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)
const actors = [{ actorId: 'a', displayName: '守门人' }]
const initial = stateInitialValueSchema.parse({
  definition: { id: 'a:resolve', name: '决心', description: '守门的决心', group: '心理',
    type: 'number', owner: 'actor', actorId: 'a', minimum: 0, maximum: 100, guidance: '受事件影响' }, value: 60,
})
const state = initializeDynamicState([initial], ['a'])
const t = (key: string) => zh[key as keyof typeof zh] ?? key

describe('definition-driven character editor', () => {
  it('renders the authored number without a fixed /5 scale and submits an exact-revision player edit', async () => {
    const save = vi.fn(async () => {})
    render(<DynamicStateEditor state={state} actorId="a" actors={actors} t={t} onSave={save} />)
    expect(screen.getByText('60')).toBeTruthy()
    expect(screen.queryByText('60/5')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '修改' }))
    const value = screen.getByLabelText('当前值') as HTMLInputElement
    expect(value.max).toBe('100')
    fireEvent.change(value, { target: { value: '85' } })
    fireEvent.change(screen.getByLabelText('变化原因'), { target: { value: '决定留下' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => { expect(save).toHaveBeenCalledWith([expect.objectContaining({ expectedRevision: 1, value: 85, reason: '决定留下' })], 'actor') })
  })

  it('retains the complete edit draft after a stale-revision rejection', async () => {
    const save = vi.fn(async () => { throw new Error('Stale state revision') })
    render(<DynamicStateEditor state={state} actorId="a" actors={actors} t={t} onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: '修改' }))
    fireEvent.change(screen.getByLabelText('变化原因'), { target: { value: '尚未保存的原因' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('Stale') })
    expect(screen.getByLabelText<HTMLTextAreaElement>('变化原因').value).toBe('尚未保存的原因')
  })

  it('undoes a newly introduced field with a tombstone instead of deleting its history', async () => {
    const save = vi.fn(async () => {})
    render(<DynamicStateEditor state={state} actorId="a" actors={actors} t={t} onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: '撤销最近变化' }))
    await waitFor(() => { expect(save).toHaveBeenCalledWith([expect.objectContaining({ fieldId: 'a:resolve', expectedRevision: 1, active: false })], 'actor') })
  })
})
