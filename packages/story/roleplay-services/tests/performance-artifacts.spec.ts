import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { savePerformanceArtifacts } from './performance-artifacts.ts'

it.each(['archive', 'usage'] as const)('preserves the narrative and successful evidence when %s collection fails', async (failed) => {
  const output = await mkdtemp(join(tmpdir(), 'dsh-performance-evidence-'))
  try {
    const errors = await savePerformanceArtifacts(output, { timedOut: true, play: ['An accepted promise.'], memories: ['Keep the key.'] }, {
      archive: async () => {
        expect(JSON.parse(await readFile(join(output, 'review.json'), 'utf8'))).toMatchObject({ collection: 'pending', play: ['An accepted promise.'] })
        if (failed === 'archive') throw new Error('Export unavailable')
        return { history: ['The promise was accepted.'] }
      },
      usage: async () => { if (failed === 'usage') throw new Error('Usage unavailable'); return { outputTokens: 15 } },
    })
    expect(errors).toHaveLength(1)
    const review: unknown = JSON.parse(await readFile(join(output, 'review.json'), 'utf8'))
    expect(review).toMatchObject({ timedOut: true, collection: 'incomplete', collectionErrors: errors,
      play: ['An accepted promise.'], memories: ['Keep the key.'], usage: failed === 'usage' ? null : { outputTokens: 15 } })
    if (failed === 'usage') expect(JSON.parse(await readFile(join(output, 'archive.json'), 'utf8')))
      .toEqual({ history: ['The promise was accepted.'] })
  } finally { await rm(output, { recursive: true, force: true }) }
})
