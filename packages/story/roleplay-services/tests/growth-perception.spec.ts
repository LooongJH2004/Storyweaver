import { expect, it } from 'vitest'
import { growthPerceptions } from './growth-perception.ts'

const observation = (id: string, revision: number, extra = {}) => ({ id, revision, kind: 'observation', content: id, ...extra })
const section = (item: ReturnType<typeof observation>) => ({ id: 'evidence', role: 'system' as const,
  sources: [item.id], content: `[RECEIVED EVIDENCE — observation]\n${JSON.stringify(item)}` })

it('counts only fresh world observations in the actual request, retaining the rendered content', () => {
  const fresh = observation('fresh-water', 11, { personRefs: ['person-local'] })
  const sections = [section(observation('old-water', 10)), section(fresh),
    section(observation('future-water', 13)), section(observation('speech', 11, { kind: 'claim' })),
    section(observation('peer-attempt', 11, { behavior: { kind: 'action' } })),
    { ...section(observation('covered-history', 11)), id: 'retention' },
    { id: 'evidence', role: 'system' as const, sources: ['recipe:evidence'], content: '[AUTHOR REFERENCE — not lived history]' }]
  expect(growthPerceptions({ revision: 12, sections }, 10)).toEqual([fresh])
  expect(growthPerceptions({ revision: 12, sections: [] }, 10)).toEqual([])
  expect(growthPerceptions(undefined, 10)).toEqual([])
})

it('fails visibly when the archived body and source metadata disagree', () => {
  const item = section(observation('water', 11))
  expect(() => growthPerceptions({ revision: 12, sections: [{ ...item, sources: ['different'] }] }, 10)).toThrow('recorded source')
  expect(() => growthPerceptions({ revision: 12,
    sections: [{ ...item, content: '[RECEIVED EVIDENCE — observation]\ninvalid' }] }, 10)).toThrow()
})
