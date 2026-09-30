/** Source-backed story matters folded separately for each viewer's knowledge. */

import { z } from 'zod'
import type { StoryContinuityChange, StoryContinuityInput, StoryContinuityItem, StoryWorldState } from './types.ts'

const id = z.string().min(1).max(500)
const kind = z.enum(['promise', 'condition', 'question', 'clue'])
const operation = z.enum(['keep', 'respond', 'resolve', 'revise', 'withdraw'])

/** Durable annotation schema; audience is captured at the source event. */
export const storyContinuityChangeSchema: z.ZodType<StoryContinuityChange> = z.strictObject({
  id, actorId: id, operation, kind, itemId: id, sourceEventId: id,
  text: z.string().min(1), audience: z.array(id), private: z.boolean(), createdAt: z.iso.datetime(),
})

const inputSchema: z.ZodType<StoryContinuityInput> = z.strictObject({
  id, operation, kind: kind.optional(), itemId: id.optional(), sourceEventId: id, private: z.boolean(),
})

/**
 * Fold only changes known to a viewer; a private withdrawal does not rewrite another Actor's knowledge.
 * @param world - durable world including source-backed changes.
 * @param actorId - Actor viewer; omission selects the Director's public-event view.
 * @returns current matters in first-appearance order, including their resolution status.
 */
export function storyContinuityItems(world: StoryWorldState, actorId?: string): StoryContinuityItem[] {
  const items = new Map<string, StoryContinuityItem>()
  for (const change of world.continuity) {
    if (actorId === undefined ? change.private : !change.audience.includes(actorId)) continue
    const previous = items.get(change.itemId)
    if (change.operation === 'keep') {
      items.set(change.itemId, {
        id: change.itemId, actorId: change.actorId, kind: change.kind, status: 'open',
        text: change.text, sourceEventIds: [change.sourceEventId], private: change.private,
      })
    } else if (previous !== undefined) {
      items.set(change.itemId, {
        ...previous,
        status: change.operation === 'resolve' ? 'resolved'
          : change.operation === 'withdraw' ? 'withdrawn'
            : change.operation === 'revise' ? 'open' : previous.status,
        text: change.operation === 'revise' ? change.text : previous.text,
        sourceEventIds: [...new Set([...previous.sourceEventIds, change.sourceEventId])],
      })
    }
  }
  return [...items.values()]
}

/**
 * Validate all annotations before committing them, retaining exact source text and knowledge scope.
 * @param world - current world, including accepted behavior events.
 * @param actorId - authenticated author of the annotations.
 * @param inputs - host-resolved references, with stable attempt-based ids for replay.
 * @returns world with the immutable annotations appended; repeated identical submissions are inert.
 */
export function applyStoryContinuity(
  world: StoryWorldState, actorId: string, inputs: readonly StoryContinuityInput[],
): StoryWorldState {
  let next = world
  for (const candidate of inputs) {
    const input = inputSchema.parse(candidate)
    const duplicate = next.continuity.find(change => change.id === input.id)
    if (duplicate !== undefined) {
      if (duplicate.actorId !== actorId || duplicate.sourceEventId !== input.sourceEventId
        || duplicate.operation !== input.operation || duplicate.private !== (input.private
          || next.continuity.some(change => change.operation === 'keep' && change.itemId === input.itemId && change.private))
        || (input.itemId !== undefined && duplicate.itemId !== input.itemId)
        || (input.kind !== undefined && duplicate.kind !== input.kind)) {
        throw new Error('Continuity submission id was reused for different content')
      }
      continue
    }
    const source = next.events.find(event => event.id === input.sourceEventId)
    if (source?.status !== 'established' || (source.actorId !== actorId && !source.audience.includes(actorId))) {
      throw new Error('Continuity source must be an established event you perceived')
    }
    if (input.operation === 'keep' && !input.private && source.actorId !== actorId) {
      throw new Error('A remembered perception belongs to your private memory; do not publish another Actor\'s knowledge')
    }
    const visible = storyContinuityItems(next, actorId)
    const previous = input.itemId === undefined ? undefined : visible.find(item => item.id === input.itemId)
    if (input.operation === 'keep') {
      if (input.kind === undefined || input.itemId !== undefined) throw new Error('keep requires kind and no item_id')
      if (visible.some(item => item.actorId === actorId && item.kind === input.kind
        && item.sourceEventIds[0] === input.sourceEventId && item.status === 'open')) continue
    } else {
      if (previous === undefined) throw new Error('Continuity item is not visible to this Actor')
      if (input.operation !== 'respond' && previous.actorId !== actorId) {
        throw new Error('Only the author may revise, resolve, or withdraw a matter; use respond to answer another Actor')
      }
      if (input.kind !== undefined && input.kind !== previous.kind) throw new Error('A matter keeps its original kind')
    }
    const privateChange = input.private || previous?.private === true
    const sourceAudience = [...new Set([actorId, ...source.audience])]
    const audience = privateChange ? [actorId] : sourceAudience
    const resolvedKind = previous?.kind ?? input.kind
    if (resolvedKind === undefined) throw new Error('A new matter requires kind')
    const change: StoryContinuityChange = {
      id: input.id, actorId, operation: input.operation,
      kind: resolvedKind, itemId: previous?.id ?? input.id,
      sourceEventId: source.id, text: source.summary, audience,
      private: privateChange, createdAt: source.createdAt,
    }
    next = { ...next, continuity: [...next.continuity, change] }
  }
  return next
}
