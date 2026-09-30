import { describe, expect, it } from 'vitest'
import { normalizeDirectorNarration } from '../src/narration.ts'

describe('Director narration Markdown', () => {
  it('preserves Markdown paragraphs while normalizing whitespace', () => {
    expect(normalizeDirectorNarration('雨声压低。\r\n\r\n**钟声逼近。**   \r\n\r\n\r\n门外有人停步。')).toBe(
      '雨声压低。\n\n**钟声逼近。**\n\n门外有人停步。',
    )
  })

  it('converts legacy paragraph and line-break fragments into Markdown', () => {
    expect(normalizeDirectorNarration('<p>第一段。<br>仍是第一段。</p><p>第二段。</p>')).toBe(
      '第一段。\n仍是第一段。\n\n第二段。',
    )
  })

  it.each([
    '<div>不接受任意容器。</div>',
    '<p class="lead">不接受带属性段落。</p>',
    '<!-- hidden -->正文',
    '<?xml version="1.0"?>正文',
  ])('rejects unsupported raw markup: %s', (source) => {
    expect(() => normalizeDirectorNarration(source)).toThrow(
      'Director narration must use Markdown without HTML or XML tags',
    )
  })
})
