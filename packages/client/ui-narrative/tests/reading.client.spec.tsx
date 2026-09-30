// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { RequestMessage } from '../src/client/RequestMessage.tsx'
import { draftLines } from '../src/client/ExecutionDraft.tsx'
import { en } from '../src/client/locales.ts'
import { PersonLabel } from '../src/client/PersonLabel.tsx'
import type { NarrativeProps } from '../src/client/contract.ts'

afterEach(cleanup)
const dictionary: Partial<Record<Parameters<NarrativeProps['t']>[0], string>> = en
const t: NarrativeProps['t'] = key => dictionary[key] ?? key

it('pairs a character name with appearance without replacing perspective-specific labels', () => {
  const person = { trueName: 'Grey minstrel', appearance: 'A pale traveler in a grey veil', label: 'Outside the room' }
  const view = render(<PersonLabel person={person} nameFirst />)
  expect(view.container.querySelector('strong')?.textContent).toBe('Grey minstrel')
  expect(screen.getByText(person.appearance)).toBeTruthy()
  expect(screen.queryByText(person.label)).toBeNull()
  view.rerender(<PersonLabel person={person} />)
  expect(view.container.querySelector('strong')?.textContent).toBe(person.label)
})

it('separates recorded reasoning, body and tool calls and expands long input in place', () => {
  const text = 'Long original context '.repeat(80)
  render(<ol><RequestMessage t={t} index={0} message={{ role: 'assistant', reasoning_content: 'Private analysis', content: text,
    tool_calls: [{ id: 'call', function: { name: 'director_command', arguments: '{"operation":"find"}' } }] }} /></ol>)
  expect(screen.getByText('Private analysis')).toBeTruthy()
  expect(screen.getByText('assistant')).toBeTruthy()
  expect(screen.getByText('Tool call · director_command')).toBeTruthy()
  const expand = screen.getByRole('button', { name: 'Expand full text' })
  expect(expand.getAttribute('aria-expanded')).toBe('false')
  expect(document.querySelector('pre[data-collapsed="true"]')?.textContent).toBe(text)
  fireEvent.click(expand)
  expect(screen.getByRole('button', { name: 'Collapse text' }).getAttribute('aria-expanded')).toBe('true')
})

it('streams partial speech and actions without leaking private character state mutations', () => {
  const response = { state: 'streaming' as const, text: '', reasoning: '', toolCalls: [{ id: 'turn', name: 'npc_commit_turn',
    arguments: '{"behavior":[{"kind":"action","attempt":"Touches the latch"},{"kind":"speech","text":"Who is' }] }
  expect(draftLines(response).map(line => [line.kind, line.text])).toEqual([['action', 'Touches the latch'], ['speech', 'Who is']])
  expect(draftLines({ ...response, toolCalls: [{ id: 'turn', name: 'npc_commit_turn', arguments: '{"state":[{"text":"PRIVATE"}]}' }] })).toEqual([])
  expect(draftLines({ ...response, toolCalls: [{ id: 'opening', name: 'director_observe',
    arguments: '{"content":"PRIVATE WORLD DETAIL","narration":"Rain on the window' }] }))
    .toEqual([{ id: 'opening', kind: 'narration', text: 'Rain on the window' }])
  expect(draftLines({ ...response, toolCalls: [{ id: 'opening', name: 'director_command',
    arguments: '{"command":{"operation":"observe","input":{"narration":"The door opens' }] }).map(line => line.text)).toEqual(['The door opens'])
})
