// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { NarrativeRecallView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from '../src/client/contract.ts'
import { RecallOriginal } from '../src/client/RecallOriginal.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
const messages: Record<string, string> = en
const t: NarrativeProps['t'] = key => messages[key] ?? key
const speech = { id: 'source', revision: 7, kind: 'claim', content: 'I heard it might rain.\nI have not checked.',
  behavior: { kind: 'speech', speaker: { ref: 'person-1', label: 'The stranger' }, delivery: 'whispered',
    addressedTo: [{ ref: 'self', label: 'You' }] }, personRefs: ['person-1'] }
const item: NarrativeRecallView['entries'][number] = { id: 'source', revision: 7, kind: 'claim', truncated: false,
  text: JSON.stringify(speech) }

it('shows frozen speech attribution and exact wording with the complete record collapsed', () => {
  render(<RecallOriginal t={t} item={item} />)
  expect(screen.getByText('The stranger')).toBeTruthy()
  expect(screen.getByText(messages.whispered!)).toBeTruthy()
  expect(screen.getByText(speech.content, { normalizer: value => value })).toBeTruthy()
  const raw = screen.getByText(item.text, { selector: 'pre' })
  expect(raw.closest('details')?.hasAttribute('open')).toBe(false)
  expect(raw.textContent).toBe(item.text)
})

it('labels an action as an attempt and renders markup as text', () => {
  const text = '<img src=x onerror=alert(1)> Try the latch.'
  const action = { ...speech, kind: 'observation', content: text,
    behavior: { kind: 'action', actor: { ref: 'self', label: 'You' } } }
  const { container } = render(<RecallOriginal t={t} item={{ ...item, kind: 'action-attempt', text: JSON.stringify(action) }} />)
  expect(screen.getByText(messages.action!)).toBeTruthy()
  expect(screen.getByText(text)).toBeTruthy()
  expect(container.querySelector('img')).toBeNull()
})

it.each([
  { ...item, text: 'Plain historical observation.' },
  { ...item, text: JSON.stringify({ ...speech, id: 'another-source' }) },
  { ...item, text: JSON.stringify({ ...speech, revision: 8 }) },
  { ...item, text: JSON.stringify({ ...speech, behavior: { ...speech.behavior, speaker: { label: 'Missing reference' } } }) },
  { ...item, truncated: true },
  { ...item, characterOffset: 2 },
  { ...item, kind: 'episode-summary' },
])('keeps unrecognized or partial originals verbatim: $kind / $characterOffset', (original) => {
  const { container } = render(<RecallOriginal t={t} item={original} />)
  expect(container.querySelector('p')?.textContent).toBe(original.text)
  expect(container.querySelector('details')).toBeNull()
})
