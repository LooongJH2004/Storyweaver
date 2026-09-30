/** Preserve reviewable live-evaluation evidence even when archive or usage collection fails. */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Save the captured narrative before collecting fallible asynchronous evidence.
 * @param output - Existing evaluation artifact directory.
 * @param report - Already captured scenario, narrative, memory and execution outcome.
 * @param collect - Independent archive and native-usage readers.
 * @returns Collection failures, also recorded in the review artifact.
 */
export async function savePerformanceArtifacts(output: string, report: Record<string, unknown>, collect: {
  archive: () => Promise<unknown>
  usage: () => Promise<unknown>
}): Promise<string[]> {
  const save = (name: string, value: unknown) => writeFile(join(output, name), JSON.stringify(value, null, 2) + '\n')
  await save('review.json', { ...report, collection: 'pending', usage: null })
  const errors: string[] = []
  const failure = (name: string, error: unknown) => errors.push(`${name}: ${error instanceof Error ? error.message : JSON.stringify(error)}`)
  const [archive, usage] = await Promise.allSettled([
    Promise.resolve().then(collect.archive).then(value => save('archive.json', value)),
    Promise.resolve().then(collect.usage),
  ])
  if (archive.status === 'rejected') failure('archive', archive.reason)
  if (usage.status === 'rejected') failure('usage', usage.reason)
  await save('review.json', { ...report, collection: errors.length === 0 ? 'complete' : 'incomplete',
    collectionErrors: errors, usage: usage.status === 'fulfilled' ? usage.value : null })
  return errors
}
