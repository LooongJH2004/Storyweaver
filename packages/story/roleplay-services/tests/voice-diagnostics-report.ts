import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { findVoiceSignals, reviewVoiceRows, type VoiceTopic } from './voice-diagnostics.ts'

const artifactRoot = new URL('../../../../.artifacts/longform-performance/', import.meta.url)
const kitchenTopics: VoiceTopic[] = [
  { id: 'letter', terms: ['信纸', '湿信', '那封信'] },
  { id: 'footwear', terms: ['靴子', '鞋', '磨脚'] },
  { id: 'route', terms: ['路线', '驿路', '山路', '远路', '长路'] },
]
const pressureTopics: VoiceTopic[] = [
  { id: 'cart-repair', terms: ['车轴', '车架', '楔', '榫'] },
  { id: 'footwear', terms: ['靴子', '鞋', '磨脚'] },
  { id: 'wait-or-confirm', terms: ['等回话', '问清', '确认', '先问'] },
]
const inputs = [
  { name: 'voice-new-instance-kitchen-directed-repeat', topics: kitchenTopics },
  { name: 'voice-tool-schema-built-kitchen-2', topics: kitchenTopics },
  { name: 'voice-tool-schema-built-kitchen-3', topics: kitchenTopics },
  { name: 'voice-pressure-baseline', topics: pressureTopics },
  { name: 'voice-pressure-revision-1', topics: pressureTopics },
] as const

const results = inputs.map(({ name, topics }) => {
  const reviewUrl = new URL(`${name}/review.json`, artifactRoot)
  const review = JSON.parse(readFileSync(reviewUrl, 'utf8'))
  const rows = reviewVoiceRows(review)
  return {
    review: `${name}/review.json`,
    scope: review.cases?.length ? 'all rows in final cumulative case' : 'director play rows',
    speechRows: rows.filter(row => row.kind === 'speech').length,
    signals: findVoiceSignals(rows, topics).map(item => ({
      ...item,
      excerpts: item.excerpts.map(excerpt => excerpt.slice(0, 160)),
    })),
  }
})

writeFileSync(new URL('voice-diagnostic-baseline.json', artifactRoot), `${JSON.stringify(results, null, 2)}\n`, 'utf8')
process.stdout.write(`Wrote ${fileURLToPath(new URL('voice-diagnostic-baseline.json', artifactRoot))}\n`)
