// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  actorTone, roleplayEventView, RoleplayEventView,
} from '../src/client/RoleplayEventView.tsx'
import { zh, type RoleplayKey } from '../src/client/locales.ts'

afterEach(cleanup)

function t(key: RoleplayKey, params?: Record<string, unknown>): string {
  let value: string = zh[key]
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

describe('roleplay event cards', () => {
  it('renders thoughts behind explicit god-view disclosure', () => {
    const props = {
      node: { data: {
        kind: 'thought', actorId: 'keeper', content: 'I should not trust them.', time: 1,
      } },
      openFile: () => {},
      inspectCall: () => {},
      forkAt: () => {},
      rewriteAt: () => {},
      renderMessageImages: () => null,
      fileMentions: () => undefined,
      useTurnData: () => undefined,
      t,
    } as unknown as ComponentProps<typeof RoleplayEventView>
    const { container } = render(
      <RoleplayEventView {...props} />,
    )

    expect(screen.getByText('内心活动')).toBeDefined()
    expect(screen.getByText('上帝视角')).toBeDefined()
    expect(container.querySelector('details')?.open).toBe(false)
  })

  it('distinguishes player-embodied speech from autonomous speech', () => {
    const props = {
      node: { data: {
        kind: 'speech', actorId: 'keeper', content: 'Leave.', origin: 'player',
        delivery: 'spoken', audience: [], time: 1,
      } },
      openFile: () => {},
      inspectCall: () => {},
      forkAt: () => {},
      rewriteAt: () => {},
      renderMessageImages: () => null,
      fileMentions: () => undefined,
      useTurnData: () => undefined,
      t,
    } as unknown as ComponentProps<typeof RoleplayEventView>
    render(
      <RoleplayEventView {...props} />,
    )

    expect(screen.getByText('玩家代演发言')).toBeDefined()
    expect(screen.getByText('Leave.')).toBeDefined()
  })

  it('presents speech as reading content and action as a compact stage direction', () => {
    const base = {
      openFile: () => {}, inspectCall: () => {}, forkAt: () => {}, rewriteAt: () => {},
      renderMessageImages: () => null, fileMentions: () => undefined,
      useTurnData: () => undefined, t,
    }
    const speech = { ...base, node: { data: {
      kind: 'speech', actorId: 'gale', content: '先别碰它。', origin: 'actor',
      delivery: 'spoken', audience: [], time: 1,
    } } } as unknown as ComponentProps<typeof RoleplayEventView>
    const action = { ...base, node: { data: {
      kind: 'action', actorId: 'gale', content: '将银针停在账页上方。', origin: 'actor', time: 2,
    } } } as unknown as ComponentProps<typeof RoleplayEventView>

    const { container } = render(<><RoleplayEventView {...speech} /><RoleplayEventView {...action} /></>)

    expect(container.querySelector('[data-roleplay-event="speech"]')?.getAttribute('data-presentation')).toBe('reading')
    expect(container.querySelector('[data-roleplay-event="action"]')?.getAttribute('data-presentation')).toBe('stage-direction')
  })

  it('renders Director narration as semantic Markdown and normalizes legacy paragraphs', () => {
    const props = {
      node: { data: {
        kind: 'narration',
        content: '<p>雨声压低。</p><p>**午夜钟声**从河对岸传来。<br>门外有人停步。</p>',
        worldRevision: 2,
        time: 1,
      } },
      openFile: () => {}, inspectCall: () => {}, forkAt: () => {}, rewriteAt: () => {},
      renderMessageImages: () => null, fileMentions: () => undefined,
      useTurnData: () => undefined, t,
    } as unknown as ComponentProps<typeof RoleplayEventView>

    const { container } = render(<RoleplayEventView {...props} />)

    expect(screen.getByText('导演旁白')).toBeDefined()
    expect(screen.getByText('午夜钟声').tagName).toBe('STRONG')
    expect(container.querySelectorAll('[data-roleplay-event="narration"] p')).toHaveLength(2)
    expect(document.body.textContent).not.toContain('</p>')
    expect(document.body.textContent).not.toContain('<br>')
    expect(container.querySelector('[data-roleplay-event="narration"]')?.getAttribute('data-presentation'))
      .toBe('reading')
  })

  it('resolves prominent character names from one shared storybook roster request', async () => {
    const loadActors = vi.fn().mockResolvedValue([
      { actorId: 'shadowheart', displayName: '影心' },
      { actorId: 'astarion', displayName: '阿斯代伦' },
    ])
    const EventView = roleplayEventView(loadActors)
    const useStories = (selector: (snapshot: unknown) => unknown) => selector({
      items: [{
        storyId: 'story-1',
        sceneSessionIds: ['scene-1'],
        actors: [],
        updatedAt: '2026-08-29T00:00:00.000Z',
      }],
    })
    const base = {
      sessionId: 'scene-1',
      useStories,
      openFile: () => {},
      inspectCall: () => {},
      forkAt: () => {},
      rewriteAt: () => {},
      renderMessageImages: () => null,
      fileMentions: () => undefined,
      useTurnData: () => undefined,
      t,
    }
    const shadowheart = {
      ...base,
      node: { data: {
        kind: 'speech', actorId: 'shadowheart', content: '别碰那本账簿。', origin: 'actor',
        delivery: 'spoken', audience: ['astarion'], time: 1,
      } },
    } as unknown as ComponentProps<typeof EventView>
    const astarion = {
      ...base,
      node: { data: {
        kind: 'action', actorId: 'astarion', content: '向窗边退了一步。', origin: 'actor',
        target: 'shadowheart', time: 2,
      } },
    } as unknown as ComponentProps<typeof EventView>

    const { container } = render(
      <>
        <EventView {...shadowheart} />
        <EventView {...astarion} />
      </>,
    )

    await waitFor(() => { expect(screen.getAllByText('影心')).toHaveLength(1) })
    expect(screen.getByText('阿斯代伦')).toBeDefined()
    expect(screen.getByText('对象：阿斯代伦')).toBeDefined()
    expect(screen.getByText('目标：影心')).toBeDefined()
    expect(screen.queryByText('角色 · shadowheart')).toBeNull()
    expect(loadActors).toHaveBeenCalledOnce()
    expect(container.querySelector('[data-actor-id="shadowheart"]')?.getAttribute('data-actor-tone'))
      .not.toBe(container.querySelector('[data-actor-id="astarion"]')?.getAttribute('data-actor-tone'))
  })

  it('loads the exact producing request only when the avatar context control is opened', async () => {
    const loadRequestContext = vi.fn().mockResolvedValue({
      sessionId: 'actor-gale', beforeEventSeq: 9, headerSeq: 4, turn: 1, step: 2,
      provider: 'deepseek', model: 'deepseek-chat',
      requestJson: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'SETTING' },
          { role: 'user', content: 'QUESTION' },
          { role: 'assistant', content: 'ANSWER' },
          { role: 'tool', tool_call_id: 'call-1', content: 'WORLD' },
        ],
        stream: true, stream_options: { include_usage: true }, tools: [], max_tokens: 128,
      }),
    })
    const EventView = roleplayEventView(vi.fn().mockResolvedValue([]), loadRequestContext)
    const useStories = (selector: (snapshot: unknown) => unknown) => selector({
      items: [{
        storyId: 'story-1', sceneSessionIds: ['scene-1'], actors: [],
        updatedAt: '2026-09-04T00:00:00.000Z',
      }],
    })
    const props = {
      sessionId: 'scene-1', useStories,
      node: { data: {
        kind: 'action', actorId: 'gale', content: '停下脚步。', origin: 'actor', time: 2,
        requestContext: { sessionId: 'actor-gale', beforeEventSeq: 9 },
      } },
      openFile: () => {}, inspectCall: () => {}, forkAt: () => {}, rewriteAt: () => {},
      renderMessageImages: () => null, fileMentions: () => undefined,
      useTurnData: () => undefined, t,
    } as unknown as ComponentProps<typeof EventView>

    render(<EventView {...props} />)
    const button = screen.getByRole('button', { name: '查看这次回复收到的上下文' })
    expect(button.textContent).toContain('上下文')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(loadRequestContext).not.toHaveBeenCalled()

    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    await screen.findByText('本次回复的上下文')
    const messages = screen.getByRole('list', { name: '消息内容（按发送顺序）' })
    expect(within(messages).getAllByRole('heading', { level: 3 }).map(item => item.textContent))
      .toMatchInlineSnapshot(`
        [
          "1. 系统消息",
          "2. 用户消息",
          "3. AI 回复",
          "4. 工具返回",
        ]
      `)
    expect(within(messages).getByText('QUESTION')).toBeDefined()
    expect(within(messages).getByText('ANSWER')).toBeDefined()
    expect(within(messages).getByText('WORLD')).toBeDefined()
    expect(within(messages).getByText('调用标识：call-1')).toBeDefined()
    expect(screen.queryByText('流式输出')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '工具与参数' }))
    expect(screen.getByText('deepseek-chat')).toBeDefined()
    expect(screen.getByText('流式输出')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '原始请求' }))
    const raw = screen.getByRole('region', { name: '原始请求' }).textContent
    expect((JSON.parse(raw) as { messages: unknown[] }).messages).toHaveLength(4)
    expect(loadRequestContext).toHaveBeenCalledWith('story-1', 'actor-gale', 9)
    fireEvent.click(screen.getByRole('button', { name: '关闭上下文预览' }))
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: '消息' }).getAttribute('aria-pressed')).toBe('true')
    expect(loadRequestContext).toHaveBeenCalledTimes(1)
  })

  it('assigns distinct stable tones to the Baldur’s Gate demo cast', () => {
    const tones = ['shadowheart', 'astarion', 'gale', 'mira-courier'].map(actorTone)
    expect(new Set(tones).size).toBe(tones.length)
    expect(['shadowheart', 'astarion', 'gale', 'mira-courier'].map(actorTone)).toEqual(tones)
  })
})
