import { expect, it } from 'vitest'
import { findVoiceSignals, reviewVoiceRows, type VoiceRow } from './voice-diagnostics.ts'

const row = (id: string, kind: string, text: string, actorId?: string, trueName?: string): VoiceRow => ({
  id,
  revision: Number(id),
  kind,
  text,
  ...(actorId ? { speaker: { actorId, ...(trueName === undefined ? {} : { trueName }) } } : {}),
})

it('retains quoted rows for shared topics without claiming identical advice', () => {
  const rows = [
    row('1', 'speech', '你的靴子磨脚吗？', 'a', '甲'),
    row('2', 'speech', '把靴子藏起来。', 'b', '乙'),
    row('3', 'speech', '我担心地图。', 'c', '丙'),
  ]
  expect(findVoiceSignals(rows, [{ id: 'footwear', terms: ['靴子'] }])).toEqual([{
    kind: 'shared-topic', label: 'footwear', rowIds: ['1', '2'], actorIds: ['a', 'b'],
    excerpts: ['你的靴子磨脚吗？', '把靴子藏起来。'],
  }])
  expect(findVoiceSignals(rows, [{ id: 'map', terms: ['地图'] }])).toEqual([])
})

it('locates repeated rhetoric and later narration describing silence', () => {
  const rows = [
    row('1', 'speech', '先收信，再喝汤。', 'a', '甲'),
    row('2', 'speech', '先把碗擦净，再去看他。', 'b', '乙'),
    row('3', 'narration', '甲收起信。他没有说什么。'),
  ]
  const signals = findVoiceSignals(rows, [])
  expect(signals.map(item => [item.kind, item.label, item.rowIds])).toEqual([
    ['repeated-rhetoric', '先……再……', ['1', '2']],
    ['narrated-silence-after-speech', '甲', ['1', '3']],
  ])
})

it('does not extend a speech contradiction across an intervening narration', () => {
  expect(findVoiceSignals([
    row('1', 'speech', '我出去。', 'a', '甲'),
    row('2', 'narration', '甲走到门口。'),
    row('3', 'narration', '甲没有说什么。'),
  ], [])).toEqual([])
})

it('reads a review from its final cumulative case or director play', () => {
  const early = row('1', 'speech', '刚开场。', 'a', '甲')
  const late = row('2', 'speech', '继续。', 'b', '乙')
  expect(reviewVoiceRows({ cases: [{ play: { rows: [early] } }, { play: { rows: [early, late] } }] })).toEqual([early, late])
  expect(reviewVoiceRows({ director: { play: { rows: [late] } } })).toEqual([late])
})
