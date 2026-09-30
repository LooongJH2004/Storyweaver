// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StoryRequestContextPreviewValue } from '@deepseek-ai/dsh-api-story-controller/client'
import { RequestContextPreview } from '../src/client/RequestContextPreview.tsx'
import { zh, type RoleplayKey } from '../src/client/locales.ts'

const t = ((key: RoleplayKey, params?: Record<string, unknown>) => {
  let value: string = zh[key]
  for (const [name, replacement] of Object.entries(params ?? {})) value = value.replace('{' + name + '}', String(replacement))
  return value
}) as ComponentProps<typeof RequestContextPreview>['t']

function preview(request: unknown): StoryRequestContextPreviewValue {
  return {
    sessionId: 'actor-gale', beforeEventSeq: 9, headerSeq: 4, turn: 1, step: 2,
    provider: 'mock', model: 'm', requestJson: JSON.stringify(request),
  } as StoryRequestContextPreviewValue
}

function mount(load = vi.fn().mockResolvedValue(preview({ messages: [{ role: 'user', content: 'A question' }] }))) {
  render(<RequestContextPreview binding={{ load }} t={t} />)
  const trigger = screen.getByRole('button', { name: '查看这次回复收到的上下文' })
  trigger.focus()
  fireEvent.click(trigger)
  return { trigger, load }
}

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

describe('request context reading dialog', () => {
  it.each(['button', 'escape', 'mask'])('closes using %s and restores focus and background scrolling', async (method) => {
    document.body.style.overflow = 'auto'
    const { trigger } = mount()
    const dialog = screen.getByRole('dialog', { name: '本次回复的上下文' })
    expect(document.body.style.overflow).toBe('hidden')
    await waitFor(() => { expect(dialog.contains(document.activeElement)).toBe(true) })
    const close = within(dialog).getByRole('button', { name: '关闭上下文预览' })
    if (method === 'button') fireEvent.click(close)
    if (method === 'escape') fireEvent.keyDown(document, { key: 'Escape' })
    if (method === 'mask') fireEvent.click(dialog.previousElementSibling!)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(document.body.style.overflow).toBe('auto')
  })

  it('wraps keyboard focus around the dialog including JSON disclosures', async () => {
    mount()
    await screen.findByText('A question')
    const close = screen.getByRole('button', { name: '关闭上下文预览' })
    const summary = screen.getByText('查看消息原文 JSON').closest('summary')!
    close.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(summary)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
  })

  it('caches a pending load without reopening the dismissed dialog', async () => {
    let resolve!: (value: StoryRequestContextPreviewValue) => void
    const load = vi.fn(() => new Promise<StoryRequestContextPreviewValue>((done) => { resolve = done }))
    const { trigger } = mount(load)
    expect(screen.getByRole('status').textContent).toBe('正在读取…')
    fireEvent.click(screen.getByRole('button', { name: '关闭上下文预览' }))
    fireEvent.click(trigger)
    expect(load).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    await act(async () => { resolve(preview({ messages: [{ role: 'user', content: 'Cached response' }] })) })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(trigger)
    expect(screen.getByText('Cached response')).toBeDefined()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('retries a failed load inside the open dialog', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(preview({ messages: [] }))
    mount(load)
    expect((await screen.findByRole('alert')).textContent).toContain('offline')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await screen.findByText('本次没有对话消息。')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('contains invalid serialized JSON and allows a retry', async () => {
    const load = vi.fn().mockResolvedValueOnce({ ...preview({}), requestJson: '{' }).mockResolvedValueOnce(preview([]))
    mount(load)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('请求内容不是有效对象。') })
  })

  it('expands complete text and separates reasoning, content blocks, calls and results', async () => {
    const longText = Array.from({ length: 9 }, (_, index) => 'Line ' + String(index)).join('\n')
    const request = {
      messages: [
        { role: 'system', content: longText },
        { role: 'user', content: [{ type: 'text', text: 'Visible text' }, { type: 'future', payload: 'Unknown block' }] },
        { role: 'assistant', content: null, reasoning_content: 'Consider the clue', tool_calls: [{ id: 'call-1', function: { name: 'inspect', arguments: '{"room":1}' } }], future_field: 'preserved' },
        { role: 'tool', tool_call_id: 'call-1', content: 'Result text' },
        { role: 'developer', content: { kind: 'future', payload: true } },
      ],
      tools: [{ type: 'function', function: { name: 'inspect', description: 'Inspect room', parameters: { type: 'object' } } }],
      model: 'm', custom_field: { retained: true },
    }
    mount(vi.fn().mockResolvedValue(preview(request)))
    await screen.findByText('Visible text')
    const firstMessage = screen.getByRole('heading', { name: '1. 系统消息' }).closest('li')!
    const expand = within(firstMessage).getByRole('button', { name: '展开全文' })
    expect(expand.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(expand)
    expect(screen.getByRole('button', { name: '收起' }).getAttribute('aria-expanded')).toBe('true')
    expect(within(firstMessage).getByText(/Line 0/, { selector: 'p' }).textContent).toBe(longText)
    fireEvent.click(screen.getByRole('button', { name: '收起' }))
    expect(screen.getByText('Consider the clue')).toBeDefined()
    expect(screen.getByText('工具调用')).toBeDefined()
    expect(screen.getByText('Result text')).toBeDefined()
    expect(screen.getByText('5. developer')).toBeDefined()
    const unknown = screen.getAllByText('其他内容（JSON）')[0]!.closest('details')!
    fireEvent.click(unknown.querySelector('summary')!)
    expect(unknown.open).toBe(true)
    expect(unknown.textContent).toContain('Unknown block')
    fireEvent.click(screen.getByRole('button', { name: '工具与参数' }))
    const tool = screen.getByText('inspect').closest('details')!
    expect(tool.open).toBe(false)
    fireEvent.click(tool.querySelector('summary')!)
    expect(tool.textContent).toContain('Inspect room')
    expect(screen.getByText('custom_field')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '原始请求' }))
    expect(screen.getByRole('region', { name: '原始请求' }).textContent).toBe(JSON.stringify(request))
  })

  it('keeps empty messages independent from tools and unknown request fields', async () => {
    mount(vi.fn().mockResolvedValue(preview({ messages: [], tools: [{ name: 'commit' }], custom_field: 'kept' })))
    await screen.findByText('0 条消息 · 1 个工具')
    expect(screen.queryByRole('list')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '工具与参数' }))
    expect(screen.getByText('commit')).toBeDefined()
    expect(screen.getByText('kept')).toBeDefined()
  })
})
