/** Legacy host entry supplies clock and IDs to shared pure planning rules. */
import { randomUUID } from 'node:crypto'
import * as rules from '@deepseek-ai/dsh-roleplay-core/outline-rules'
import type { DirectorOutline, DirectorOutlinePlayerInput, DirectorOutlinePatchInput } from '@deepseek-ai/dsh-roleplay-core/outline-model'
export { directorOutlinePatchInputSchema, directorOutlineSchema, StoryOutlineError,
  parseDirectorOutlinePlayerInput, parseDirectorOutlinePatchInput } from '@deepseek-ai/dsh-roleplay-core/outline-rules'
const values = { id: randomUUID, now: () => new Date().toISOString() }
/** Initialize a legacy story using the same domain defaults. */
export function emptyDirectorOutline(): DirectorOutline { return rules.emptyDirectorOutline(values) }
/** Revise player-authored planning without invoking an Actor. */
export function replaceDirectorOutlineByPlayer(current: DirectorOutline, expectedRevision: number,
  input: DirectorOutlinePlayerInput, reason: string): DirectorOutline {
  return rules.replaceDirectorOutlineByPlayer(current, expectedRevision, input, reason, values)
}
/** Apply a director proposal under the shared lock and review rules. */
export function applyDirectorOutlinePatch(current: DirectorOutline, input: DirectorOutlinePatchInput): DirectorOutline {
  return rules.applyDirectorOutlinePatch(current, input, values)
}
/** Review a proposed planning change using shared domain validation. */
export function resolveDirectorOutlineSuggestion(current: DirectorOutline, expectedRevision: number,
  suggestionId: string, accept: boolean): DirectorOutline {
  return rules.resolveDirectorOutlineSuggestion(current, expectedRevision, suggestionId, accept, values)
}
