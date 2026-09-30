/** Validation for source references emitted with an Actor's final submission. */

import { z } from 'zod'
import type { ActorContinuityRequest } from './actor-model.ts'

/** One source reference, with a new kind or an existing matter to update. */
export const actorContinuityRequestSchema: z.ZodType<ActorContinuityRequest> = z.strictObject({
  operation: z.enum(['keep', 'respond', 'resolve', 'revise', 'withdraw']),
  kind: z.enum(['promise', 'condition', 'question', 'clue']).optional(),
  itemId: z.string().min(1).max(500).optional(),
  behaviorIndex: z.number().int().nonnegative().optional(),
  eventId: z.string().min(1).max(500).optional(),
}).refine(value => (value.behaviorIndex === undefined) !== (value.eventId === undefined), {
  message: 'Choose exactly one behavior_index or event_id',
}).refine(value => value.operation === 'keep'
  ? value.kind !== undefined && value.itemId === undefined
  : value.itemId !== undefined, { message: 'keep needs kind; updates need item_id' })
