/** Player ownership is per-run state, distinct from the book's narrative protagonist. */
import { z } from 'zod'
import { entity } from './records.ts'
import type { NarrativeSnapshot } from './types.ts'

export const playerControlSchema = z.strictObject({ actorId: z.string().trim().min(1).nullable() })

/** An absent control record keeps an existing run in observer mode. */
export function playerActor(snapshot: NarrativeSnapshot): string | null {
  const value = entity(snapshot, { collection: 'player-control', id: 'current' })
  return value === undefined ? null : playerControlSchema.parse(value).actorId
}
