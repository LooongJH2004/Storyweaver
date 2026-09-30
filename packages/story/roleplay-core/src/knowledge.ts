/** Evidence-backed personal judgments; world truth never determines an Actor's belief. */
import { z } from 'zod'
import type { Branded } from '@deepseek-ai/dsh-brand'
import { recallRelevance } from './recall-relevance.ts'

/** Stable identity of one observer-owned judgment. */
export type KnowledgeId = Branded<'KnowledgeId'>
/** Observer-local person clue; never a canonical world identity. */
export type PersonReference = Branded<'PersonReference'>

const id = z.string().trim().min(1)
const judgmentId = id.transform(value => value as KnowledgeId)
const personReference = id.transform(value => value as PersonReference)
/** An authored starting belief or explicit acquaintance, independent of world truth. */
export const initialKnowledgeSchema = z.strictObject({
  text: id, kind: z.enum(['identity', 'belief']).default('belief'),
  attitude: z.enum(['believed', 'doubted', 'undecided', 'rejected']).default('believed'),
  targetActorId: id.describe('Exact registered ID of another person this knowledge concerns. Omit for own beliefs or general world knowledge. Never use a display name or self when creating a new person; the host has not assigned their ID yet.').optional(), label: id.optional(),
})
/** One authored starting judgment; identity targets remain author-only. */
export type InitialKnowledge = z.infer<typeof initialKnowledgeSchema>

/** Exact-revision subjective update. Entity references belong to the observer, not the world registry. */
export const knowledgeChangeSchema = z.strictObject({
  id: judgmentId, expectedRevision: z.number().int().nonnegative(), text: id,
  kind: z.enum(['identity', 'belief']),
  attitude: z.enum(['believed', 'doubted', 'undecided', 'rejected']),
  acquisition: z.enum(['authored', 'observed', 'heard', 'inferred', 'remembered']),
  entityRefs: z.array(personReference), sourceRefs: z.array(id),
  status: z.enum(['active', 'forgotten', 'withdrawn']), reason: id,
  label: id.optional(), replaces: z.array(judgmentId).default([]),
})
/** One private revision request. */
export type KnowledgeChange = z.infer<typeof knowledgeChangeSchema>
/** One accepted judgment with its original evidence and author. */
export const knowledgeEntrySchema = knowledgeChangeSchema.omit({ expectedRevision: true }).extend({
  revision: z.number().int().positive(), origin: z.enum(['author', 'actor', 'player']),
})
/** Accepted subjective statement; absence does not assert a negative fact. */
export type KnowledgeEntry = z.infer<typeof knowledgeEntrySchema>
/** All revisions survive forgetting, withdrawal, and player compensation. */
export const knowledgeStateSchema = z.strictObject({
  initialized: z.boolean(), revision: z.number().int().nonnegative(),
  entries: z.array(knowledgeEntrySchema), history: z.array(knowledgeEntrySchema),
})
/** Durable private cognition projection. */
export type KnowledgeState = z.infer<typeof knowledgeStateSchema>
/** Host-captured permissions, persisted with the commit for deterministic replay. */
export const knowledgeAuthoritySchema = z.strictObject({
  origin: z.enum(['author', 'actor', 'player']), sourceRefs: z.array(id), entityRefs: z.array(id),
})
/** Access is derived from the authenticated Actor, never supplied by model arguments. */
export type KnowledgeAuthority = z.infer<typeof knowledgeAuthoritySchema>

/**
 * Create a baseline that has not yet received authored cognition.
 * @returns an explicit uninitialized private baseline.
 */
export function emptyKnowledge(): KnowledgeState {
  return { initialized: false, revision: 0, entries: [], history: [] }
}

/**
 * Validate an entire private batch before exposing its result; prose entailment is not mechanically asserted.
 * @param state - Current private projection.
 * @param input - Requested exact revisions, including compensating edits.
 * @param authority - Authenticated, currently visible sources and entity references.
 * @returns detached accepted projection; errors leave the original untouched.
 */
export function applyKnowledgeChanges(
  state: KnowledgeState, input: readonly KnowledgeChange[], authority: KnowledgeAuthority,
): KnowledgeState {
  const entries = new Map(state.entries.map(entry => [entry.id, entry]))
  const history = [...state.history]
  const seen = new Set<string>()
  for (const candidate of input) {
    const change = knowledgeChangeSchema.parse(candidate)
    if (seen.has(change.id)) throw new Error('Knowledge batch repeats an entry')
    seen.add(change.id)
    const previous = entries.get(change.id)
    if ((previous?.revision ?? 0) !== change.expectedRevision) throw new Error('Knowledge revision changed; reload before editing')
    if (change.entityRefs.some(ref => !authority.entityRefs.includes(ref))) throw new Error('Knowledge references a person you have not encountered or heard about')
    if (change.replaces.some(ref => !entries.has(ref) || ref === change.id)) throw new Error('Knowledge replacement must reference another owned entry')
    if (authority.origin === 'actor') {
      if (change.acquisition === 'authored') throw new Error('Only the author can establish initial knowledge')
      if (change.sourceRefs.length === 0) throw new Error('Knowledge changes require perceived evidence or an existing personal judgment')
      const ownSources = state.entries.map(entry => `knowledge:${entry.id}:r${entry.revision}`)
      if (change.sourceRefs.some(ref => !authority.sourceRefs.includes(ref) && !ownSources.includes(ref))) {
        throw new Error('Knowledge source is unavailable in your perspective')
      }
    }
    if (change.kind === 'identity' && (change.entityRefs.length !== 1 || change.label === undefined)) {
      throw new Error('Identity judgments require one visible person reference and a known or claimed label')
    }
    const { expectedRevision, ...content } = change
    const accepted: KnowledgeEntry = { ...content, revision: expectedRevision + 1, origin: authority.origin }
    entries.set(change.id, accepted)
    history.push(accepted)
  }
  return { initialized: true, revision: state.revision + 1, entries: [...entries.values()], history }
}

/**
 * Recall only this already-authorized collection, bounded after filtering.
 * @param state - One observer's private knowledge.
 * @param query - Literal words used for relevance ranking.
 * @param entityRefs - Relevant visible people.
 * @param offset - Page offset in the stable ranking.
 * @param limit - Configured maximum entries.
 * @param characterLimit - Configured serialized-entry budget; oversized entries remain individually retrievable.
 * @returns active judgments and a continuation offset.
 */
export function queryKnowledge(
  state: KnowledgeState, query: string, entityRefs: readonly string[], offset: number, limit: number, characterLimit = Infinity,
): { entries: KnowledgeEntry[]; deferred: string[]; next: number | null; total: number } {
  const relevance = recallRelevance(query)
  const recency = new Map(state.history.map((entry, index) => [entry.id, index]))
  const ranked = state.entries.filter(entry => entry.status === 'active').map(entry => ({ entry,
    score: entry.entityRefs.filter(ref => entityRefs.includes(ref)).length * 2
      + relevance(entry.text),
  })).sort((a, b) => b.score - a.score || (recency.get(b.entry.id) ?? -1) - (recency.get(a.entry.id) ?? -1)
    || a.entry.id.localeCompare(b.entry.id))
  const entries: KnowledgeEntry[] = []
  const deferred: string[] = []
  let characters = 0
  let cursor = offset
  for (const { entry } of ranked.slice(offset, offset + limit)) {
    const length = JSON.stringify(entry).length
    if (length > characterLimit) { deferred.push(entry.id); cursor++; continue }
    if (characters + length > characterLimit) break
    entries.push(entry); characters += length; cursor++
  }
  return { entries, deferred, next: cursor < ranked.length ? cursor : null, total: ranked.length }
}

/** Model-side changes use the same parser as replay and the player API. */
export const knowledgeChangesToolParameter = {
  type: 'array' as const, description: 'Private evidence-backed judgments; speech is evidence of a claim, not proof. Use only visible person references and source IDs. Ordinary life knowledge is allowed; original-work identities, relationships and secrets require authored knowledge. Omitting changes preserves memory.',
  items: { type: 'object' as const, additionalProperties: false, properties: {
    id: { type: 'string' as const, required: true }, expectedRevision: { type: 'integer' as const, required: true },
    text: { type: 'string' as const, required: true }, kind: { type: 'string' as const, enum: ['identity', 'belief'], required: true },
    attitude: { type: 'string' as const, enum: ['believed', 'doubted', 'undecided', 'rejected'], required: true },
    acquisition: { type: 'string' as const, enum: ['observed', 'heard', 'inferred', 'remembered'], required: true },
    entityRefs: { type: 'array' as const, items: { type: 'string' as const }, required: true },
    sourceRefs: { type: 'array' as const, items: { type: 'string' as const }, required: true },
    status: { type: 'string' as const, enum: ['active', 'forgotten', 'withdrawn'], required: true },
    reason: { type: 'string' as const, required: true }, label: { type: 'string' as const },
    replaces: { type: 'array' as const, items: { type: 'string' as const } },
  } },
} as const
