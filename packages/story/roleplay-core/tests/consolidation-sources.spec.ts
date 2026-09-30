import { expect, it } from 'vitest'
import { renderConsolidationSources, consolidationWindow, consolidationPendingAttempts } from '../src/consolidation-sources.ts'
import { compareOriginals, sourceRevisionRange, type NarrativeOriginal } from '../src/retention-records.ts'

it('keeps pending status only for assigned action attempts without copying other event text', async () => {
  const assigned = [{ id: 'try-door', kind: 'action-attempt', revision: 3, text: 'Try the door.' },
    { id: 'claim', kind: 'claim', revision: 3, text: 'I opened it.' }]
  const pending = [{ id: 'try-door' }, { id: 'later-private-attempt' }, { id: 'claim' }]
  const sections = consolidationPendingAttempts(assigned, pending)
  expect(sections[0]?.sources).toEqual(['try-door'])
  expect(sections[0]?.content).not.toContain('later-private-attempt')
  expect(sections[0]?.content).not.toContain('Try the door.')
  expect(consolidationPendingAttempts(assigned, [])).toEqual([])
  await expect(JSON.stringify(sections, null, 2) + '\n').toMatchFileSnapshot('./expected/consolidation-pending.json')
})

it('places pending status beside its original and alias without marking claims or changing sources', () => {
  const sources = [
    { id: 'attempt', sourceRef: '$source:1', kind: 'action-attempt', revision: 3, text: 'I try to move the tray.' },
    { id: 'claim', sourceRef: '$source:2', kind: 'claim', revision: 3, text: 'It should move.' },
    { id: 'other', sourceRef: '$source:3', kind: 'action-attempt', revision: 2, text: 'I inspect the tray.' },
  ]
  const before = structuredClone(sources)
  const rendered = renderConsolidationSources(sources, ['attempt', 'claim', 'not-assigned'])
  const headers = rendered.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as Record<string, unknown>)
  expect(headers[0]).toEqual({ id: 'attempt', sourceRef: '$source:1', kind: 'action-attempt', revision: 3,
    resultStatus: 'awaiting-world-feedback' })
  expect(headers.slice(1).every(header => header.resultStatus === undefined)).toBe(true)
  expect(rendered).not.toContain('not-assigned')
  expect(sources).toEqual(before)
  for (const source of sources) expect(rendered).toContain(source.text)
})

it('does not date personal records or a mixed batch using their local versions', async () => {
  const event: NarrativeOriginal = { id: 'event', kind: 'observation', revision: 50, text: 'The key was returned.' }
  const belief: NarrativeOriginal = { id: 'knowledge:a:r1', kind: 'personal-judgment', revision: 1,
    revisionScope: 'record', text: 'I believe the promise was kept.' }
  const state: NarrativeOriginal = { id: 'state:b:r99', kind: 'personal-state', revision: 99,
    revisionScope: 'record', text: 'Trust increased.' }
  const originals = new Map([event, belief, state].map(item => [item.id, item]))
  expect(sourceRevisionRange([event.id], originals)).toEqual({ from: 50, to: 50 })
  expect(sourceRevisionRange([belief.id], originals)).toBeNull()
  expect(sourceRevisionRange([event.id, state.id], originals)).toBeNull()
  expect(() => sourceRevisionRange(['missing'], originals)).toThrow('unavailable source')
  expect([state, belief, event].sort(compareOriginals).map(item => item.id)).toEqual([event.id, belief.id, state.id])
  expect(consolidationWindow([belief], [event, state])).toEqual([])
  expect(consolidationWindow([event], [state])).toEqual([])
  await expect(renderConsolidationSources([belief, state]) + '\n')
    .toMatchFileSnapshot('./expected/consolidation-record-versions.txt')
})

it('keeps attributed speech, original line breaks and order without an escaped text wrapper', async () => {
  const sources = [
    { id: 'speech-1', sourceRef: '$source:1', kind: 'claim', revision: 3, order: 0,
      text: JSON.stringify({ speaker: { ref: 'person-1', label: '店主' }, content: '告示说“碰水就化”，我没试过。' }) },
    { id: 'observation-2', sourceRef: '$source:2', kind: 'observation', revision: 4, order: 0,
      text: '你看见材料滑入水中。\n半个时辰后，它仍完整。' },
  ]
  const before = structuredClone(sources)
  const rendered = renderConsolidationSources(sources)
  for (const source of sources) expect(rendered).toContain(source.text)
  expect(rendered.indexOf('speech-1')).toBeLessThan(rendered.indexOf('observation-2'))
  expect(rendered).not.toContain('\\"speaker\\"')
  expect(sources).toEqual(before)
  await expect(rendered + '\n').toMatchFileSnapshot('./expected/consolidation-source-blocks.txt')
})

it('uses a longer fence than embedded source delimiters without altering the original', () => {
  const text = 'A note contains:\n````\n# Another source?\n```\nStill the same original.'
  const rendered = renderConsolidationSources([{ id: 'note', kind: 'observation', revision: 1, text }])
  expect(rendered).toBe(`{"id":"note","kind":"observation","revision":1}\n\`\`\`\`\`\n${text}\n\`\`\`\`\``)
  expect(renderConsolidationSources([])).toBe('')
})

it('points to the first later admitted event without copying its text or changing batch membership', async () => {
  const assigned = [{ id: 'promise', kind: 'claim', revision: 3, order: 0, text: 'I will return.' }]
  const available = [...assigned,
    { id: 'returned', kind: 'observation', revision: 5, order: 0, text: 'The key was returned.' },
    { id: 'reply', kind: 'claim', revision: 3, order: 1, text: 'I answered the question.' }]
  const window = consolidationWindow(assigned, available)
  expect(window[0]?.sources).toEqual(['reply'])
  expect(window[0]?.content).toContain('"laterOriginalCount":2')
  expect(window[0]?.content).not.toContain('I answered the question.')
  expect(window[0]?.content).not.toContain('The key was returned.')
  expect(assigned).toHaveLength(1)
  expect(consolidationWindow(available, available)).toEqual([])
  expect(consolidationWindow([], available)).toEqual([])
  await expect(JSON.stringify(window, null, 2) + '\n').toMatchFileSnapshot('./expected/consolidation-window.json')
})
