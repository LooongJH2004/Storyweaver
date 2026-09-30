/** Resolve immutable source pointers without consulting historical content outside the active index. */
import type { StoryWorldState, StoryDiscussionState } from './types.ts'
import type { ContextSource } from './context-retention.ts'

/**
 * Read exact retained content; callers own access checks before invoking the log reader.
 * @param world - Authoritative Story world.
 * @param source - Source selected from the active authorized index.
 * @param readEvent - Read the exact durable event by Session and sequence.
 * @param discussions - Durable transcripts for directly recorded discussion turns.
 * @param observerId - Optional Actor viewer; authored evidence uses its captured identity projection.
 * @returns Exact original text or complete structured JSON; missing history throws.
 */
export async function readContextSource(world: StoryWorldState, source: ContextSource,
  readEvent: (sessionId: string, seq: number) => Promise<unknown>,
  discussions?: StoryDiscussionState, observerId?: string): Promise<string> {
  const locator = source.locator
  let value: unknown
  if (locator.kind === 'world') value = world.events.find(event => event.id === locator.eventId)?.summary
  else if (locator.kind === 'perception') value = world.perceptions.find(item => item.id === locator.perceptionId)?.content
  else if (locator.kind === 'discussion') value = discussions?.discussions.find(item => item.id === locator.discussionId)
    ?.turns.find(turn => turn.id === locator.turnId)?.text
  else {
    value = await readEvent(locator.sessionId, locator.seq)
    for (const key of locator.path) {
      if (typeof value === 'string') value = JSON.parse(value) as unknown
      if (value === null || typeof value !== 'object') throw new Error(`Original source ${source.id} path is unavailable at ${key}`)
      value = (value as Record<string, unknown>)[key]
    }
  }
  if (value === undefined) throw new Error('Original source is unavailable; history was not discarded')
  const perspective = observerId === undefined ? undefined : source.perspectives?.[observerId]
  if (perspective !== undefined) {
    const project = (part: unknown): unknown => {
      if (typeof part === 'string') return perspective.refs[part] ?? part.replace(/\[\[person:([^\]]+)\]\]/gu,
        (_match: string, actorId: string) => perspective.labels[actorId] ?? '未具名的人物')
      if (Array.isArray(part)) return part.map(project)
      if (part !== null && typeof part === 'object') return Object.fromEntries(Object.entries(part).map(([key, child]) => [key, project(child)]))
      return part
    }
    value = project(value)
  }
  return typeof value === 'string' ? value : JSON.stringify(value)
}
