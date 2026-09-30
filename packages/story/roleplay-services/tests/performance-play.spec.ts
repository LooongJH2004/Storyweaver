import { expect, it } from 'vitest'
import { performanceRows } from './performance-play.ts'

it('retains later-scene rows beyond the first hundred and accepts partial pages', () => {
  const expected = Array.from({ length: 205 }, (_, revision) => ({ revision, text: `event-${revision}` }))
  const offsets: number[] = []
  const rows = performanceRows((offset) => {
    offsets.push(offset)
    return { rows: expected.slice(offset, offset + 73), total: expected.length }
  })
  expect(rows).toEqual(expected)
  expect(offsets).toEqual([0, 73, 146])
})

it('rejects missing or changing pages instead of reporting a complete transcript', () => {
  expect(() => performanceRows(offset => ({ rows: offset === 0 ? [1] : [], total: 2 }))).toThrow('incomplete')
  expect(() => performanceRows(offset => ({ rows: [1], total: offset === 0 ? 2 : 3 }))).toThrow('incomplete')
  expect(() => performanceRows(() => ({ rows: [1, 2], total: 1 }))).toThrow('exceeds')
  expect(performanceRows(() => ({ rows: [], total: 0 }))).toEqual([])
})
