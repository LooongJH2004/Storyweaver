// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { IStories, StoryView } from '@deepseek-ai/dsh-api-story-controller/client'
import { ContextReviewPanel } from '../src/client/ContextReviewPanel.tsx'
import { zh, type RoleplayKey } from '../src/client/locales.ts'

const t = ((key: RoleplayKey, values?: Record<string, unknown>) => {
  let text: string = zh[key]
  for (const [name, value] of Object.entries(values ?? {})) text = text.replace(`{${name}}`, String(value))
  return text
}) as ComponentProps<typeof ContextReviewPanel>['t']
afterEach(cleanup)
function mount() {
  const story = { storyId: 'story-review', world: { context: {
    revision: 1, sources: [{ id: 'original', order: 0 }], notes: [], pins: [],
    proposals: [{ id: 'unit', scope: 'director', revision: 2, turnId: 'turn1', status: 'proposed', retainedNoteIds: [],
      unit: { sourceIds: ['original'], disposition: 'represented', reason: '保留条件与期限', changes: [{
        operation: 'add', kind: 'promise', text: '甲承诺交出钥匙，但乙必须先交出账簿。', sourceIds: ['original'],
      }] },
    }],
  } } } as unknown as StoryView
  const reviewContext = vi.fn().mockResolvedValue(story)
  const editContext = vi.fn().mockResolvedValue(story)
  const contextSource = vi.fn().mockResolvedValue({ id: 'original', text: '先把账簿交给我，我才会把钥匙给你。\n必须在天亮以前。' })
  const pinContext = vi.fn().mockResolvedValue(story)
  const commands = { reviewContext, editContext, contextSource, pinContext } as unknown as IStories
  render(<ContextReviewPanel story={story} commands={commands} t={t} />)
  const trigger = screen.getByRole('button', { name: /记忆审核/u })
  fireEvent.click(trigger)
  return { reviewContext, editContext, contextSource, pinContext, trigger }
}

describe('context memory review', () => {
  it('requires explicit selection and approves a complete source unit with its revision', async () => {
    const { reviewContext } = mount()
    expect(reviewContext).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '全选' }))
    fireEvent.click(screen.getByRole('button', { name: '批准所选' }))
    await waitFor(() => { expect(reviewContext).toHaveBeenCalledWith({ storyId: 'story-review', reviews: [{ id: 'unit', revision: 2, approve: true }] }) })
  })
  it('does not let select-all approve an unsaved edit and sends edits as a whole unit', async () => {
    const { reviewContext, editContext } = mount()
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: '乙交出账簿后，甲在天亮前交出钥匙。' } })
    fireEvent.click(screen.getByRole('button', { name: '全选' }))
    fireEvent.click(screen.getByRole('button', { name: '批准所选' }))
    expect(reviewContext).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '保存提案' }))
    await waitFor(() => { expect(editContext.mock.calls[0]?.[0]).toMatchObject({ id: 'unit', revision: 2,
      unit: { sourceIds: ['original'], changes: [{ text: '乙交出账簿后，甲在天亮前交出钥匙。' }] },
    }) })
  })
  it('shows exact source text and pins it independently of approval', async () => {
    const { pinContext, reviewContext } = mount()
    fireEvent.click(screen.getByRole('button', { name: /查看原文/u }))
    await screen.findByText(/必须在天亮以前/u)
    fireEvent.click(screen.getByRole('button', { name: '固定原文' }))
    await waitFor(() => { expect(pinContext).toHaveBeenCalledWith({ storyId: 'story-review', sourceId: 'original', scope: 'director', pinned: true }) })
    expect(reviewContext).not.toHaveBeenCalled()
  })
  it('reports revision conflicts, preserves the proposal, and restores focus when closed', async () => {
    const { reviewContext, trigger } = mount()
    reviewContext.mockRejectedValueOnce(new Error('Context proposal revision conflict'))
    fireEvent.click(screen.getByRole('button', { name: '全选' }))
    fireEvent.click(screen.getByRole('button', { name: '拒绝所选' }))
    await screen.findByRole('alert')
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
  it('keeps the review presentation readable without exposing source storage locations', () => {
    mount()
    expect(screen.getByRole('complementary').textContent).toMatchInlineSnapshot('"记忆审核关闭工作区短记经你确认后才进入后续上下文；未确认的原文继续保留。按完整来源单元审批，来源始终可查。全选批准所选拒绝所选待审核批次 1导演 · 以短记承接承诺 · 新增甲承诺交出钥匙，但乙必须先交出账簿。整理理由保留条件与期限查看原文 1固定原文已生效短记"')
  })
})
