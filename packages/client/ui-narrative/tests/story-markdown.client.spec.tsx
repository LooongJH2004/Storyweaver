// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { StoryMarkdown } from '../src/client/StoryMarkdown.tsx'
import { storyMarkdown } from '../src/client/story-markdown.ts'
import type { NarrativeProps } from '../src/client/contract.ts'

afterEach(cleanup)
const t: NarrativeProps['t'] = key => key

it('repairs escaped paragraphs and simple break tags without decoding arbitrary escape sequences', () => {
  expect(storyMarkdown('窗外落雨。\\n\\n灯光亮起。\\r\\n\\r\\n第三段。<br />下一行。')).toBe(
    '窗外落雨。\n\n灯光亮起。\n\n第三段。\n下一行。')
  expect(storyMarkdown('一\r\n\r\n\r\n二')).toBe('一\n\n\n二')
  expect(storyMarkdown(String.raw`C:\new\notes.txt and \n and \t and \u003cscript\u003e`)).toBe(
    String.raw`C:\new\notes.txt and \n and \t and \u003cscript\u003e`)
})

it('preserves inline, fenced, indented and unfinished code plus link destinations', () => {
  const source = [
    '`\\n\\n<br>` and ``x ` \\n\\n<br>``',
    '```json', '{"text":"\\n\\n<br>"}', '```',
    '~~~~text', '\\n\\n<br>', '~~~~',
    '    \\n\\n<br>',
    '[reference](https://example.com/\\n\\n)',
    '```text', '\\n\\n<br>',
  ].join('\n')
  expect(storyMarkdown(source)).toBe(source)
  expect(storyMarkdown('`unfinished \\n\\n<br>')).toBe('`unfinished \\n\\n<br>')
})

it('renders story paragraphs consistently while streaming and after completion', () => {
  const text = '窗外落雨。\\n\\n**灯光亮起。**<br>旅人推门而入。'
  const { container, rerender } = render(<StoryMarkdown text={text} streaming t={t} />)
  const paragraphs = () => [...container.querySelectorAll('p')].map(node => node.textContent)
  expect(paragraphs()).toEqual(['窗外落雨。', '灯光亮起。\n旅人推门而入。'])
  rerender(<StoryMarkdown text={text} t={t} />)
  expect(paragraphs()).toMatchInlineSnapshot(`
    [
      "窗外落雨。",
      "灯光亮起。
    旅人推门而入。",
    ]
  `)
  expect(container.querySelector('strong')?.textContent).toBe('灯光亮起。')
})

it('retains Markdown structures and rejects active HTML', () => {
  const text = ['## 夜间记录', '', '> 门外传来敲门声。', '', '- **查看窗外**', '- *打开门锁*', '',
    '1. 点灯', '2. 询问来意', '', '| 人物 | 位置 |', '| --- | --- |', '| 旅人 | 门外 |', '',
    '---', '', '[地图](https://example.com/map)', '', '```text', '\\n\\n', '```', '',
    '<script>alert(1)</script>', '<img src=x onerror=alert(1)>'].join('\n')
  const { container } = render(<StoryMarkdown text={text} t={t} />)
  for (const tag of ['h2', 'blockquote', 'ul', 'ol', 'table', 'hr', 'pre', 'strong', 'em']) {
    expect(container.querySelector(tag), tag).not.toBeNull()
  }
  expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com/map')
  expect(container.querySelector('pre')?.textContent).toContain('\\n\\n')
  expect(container.querySelector('script, [onerror]')).toBeNull()
})
