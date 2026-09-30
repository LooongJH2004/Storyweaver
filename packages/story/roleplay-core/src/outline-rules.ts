/** Strict persistence and mutation rules for the non-canonical Director Outline. */

import type { RuntimeValues } from './types.ts'
import { z } from 'zod'
import type {
  DirectorForeshadow,
  DirectorMystery,
  DirectorNarrativeClock,
  DirectorOutline,
  DirectorOutlineAuthor,
  DirectorOutlinePatchInput,
  DirectorOutlinePlayerInput,
  DirectorOutlineSuggestion,
  DirectorPlotBeat,
  DirectorStoryArc,
} from './outline-model.ts'

const idSchema = z.string().trim().min(1).max(160)
const textSchema = z.string().trim().min(1)
const optionalTextSchema = z.string().trim()
const textListSchema = z.array(textSchema).max(100)
const revisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const sourceSchema = z.enum(['player', 'director', 'system'])
const updateModeSchema = z.enum(['auto_unlocked', 'review_all'])

const persistedIdentityShape = {
  id: idSchema,
  source: sourceSchema,
  locked: z.boolean(),
}
const playerIdentityShape = { id: idSchema, locked: z.boolean() }
const directorIdentityShape = { id: idSchema }
const textItemShape = { text: textSchema }
const arcShape = {
  title: textSchema,
  intent: textSchema,
  status: z.enum(['planned', 'active', 'resolved', 'abandoned']),
  tensions: textListSchema,
  desiredQuestions: textListSchema,
  completionSignals: textListSchema,
}
const beatShape = {
  arcId: idSchema.optional(),
  title: textSchema,
  intent: textSchema,
  status: z.enum(['candidate', 'armed', 'active', 'resolved', 'skipped', 'retired']),
  priority: z.number().int().min(1).max(5),
  prerequisiteLedgerFacts: textListSchema,
  prerequisiteBeatIds: z.array(idSchema).max(100),
  triggerConditions: textListSchema,
  externalPressure: textListSchema,
  revealCandidates: textListSchema,
  exitConditions: textListSchema,
  fallbackOptions: textListSchema,
  resolvedByEventRefs: z.array(idSchema).max(100),
}
const foreshadowShape = {
  title: textSchema,
  narrativePurpose: textSchema,
  status: z.enum(['planned', 'available', 'planted', 'reinforced', 'paid_off', 'abandoned']),
  seedCandidates: textListSchema,
  intendedPayoff: textSchema,
  revealConditions: textListSchema,
  earliestBeatId: idSchema.optional(),
  latestBeatId: idSchema.optional(),
  ambiguityNotes: textListSchema,
  dependencyIds: z.array(idSchema).max(100),
  plantedEventRefs: z.array(idSchema).max(100),
  payoffEventRefs: z.array(idSchema).max(100),
}
const mysteryShape = {
  question: textSchema,
  status: z.enum(['open', 'answered', 'retired']),
  answerIntent: optionalTextSchema,
  evidenceEventRefs: z.array(idSchema).max(100),
}
const clockShape = {
  title: textSchema,
  progress: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  trigger: textSchema,
  consequence: textSchema,
  status: z.enum(['active', 'paused', 'resolved']),
}

const playerTextItemSchema = z.strictObject({ ...playerIdentityShape, ...textItemShape })
const playerArcSchema = z.strictObject({ ...playerIdentityShape, ...arcShape })
const playerBeatSchema = z.strictObject({ ...playerIdentityShape, ...beatShape })
const playerForeshadowSchema = z.strictObject({ ...playerIdentityShape, ...foreshadowShape })
const playerMysterySchema = z.strictObject({ ...playerIdentityShape, ...mysteryShape })
const playerClockSchema = z.strictObject({ ...playerIdentityShape, ...clockShape })
const directorTextItemSchema = z.strictObject({ ...directorIdentityShape, ...textItemShape })
const directorArcSchema = z.strictObject({ ...directorIdentityShape, ...arcShape })
const directorBeatSchema = z.strictObject({ ...directorIdentityShape, ...beatShape })
const directorForeshadowSchema = z.strictObject({ ...directorIdentityShape, ...foreshadowShape })
const directorMysterySchema = z.strictObject({ ...directorIdentityShape, ...mysteryShape })
const directorClockSchema = z.strictObject({ ...directorIdentityShape, ...clockShape })
const persistedTextItemSchema = z.strictObject({ ...persistedIdentityShape, ...textItemShape })
const persistedArcSchema = z.strictObject({ ...persistedIdentityShape, ...arcShape })
const persistedBeatSchema = z.strictObject({ ...persistedIdentityShape, ...beatShape })
const persistedForeshadowSchema = z.strictObject({ ...persistedIdentityShape, ...foreshadowShape })
const persistedMysterySchema = z.strictObject({ ...persistedIdentityShape, ...mysteryShape })
const persistedClockSchema = z.strictObject({ ...persistedIdentityShape, ...clockShape })

/** Complete player-editable planning content. */
export const directorOutlinePlayerInputSchema: z.ZodType<DirectorOutlinePlayerInput> = z.strictObject({
  updateMode: updateModeSchema,
  premise: optionalTextSchema,
  premiseLocked: z.boolean(),
  themes: z.array(playerTextItemSchema).max(100),
  hardConstraints: z.array(playerTextItemSchema).max(100),
  arcs: z.array(playerArcSchema).max(100),
  beats: z.array(playerBeatSchema).max(200),
  foreshadows: z.array(playerForeshadowSchema).max(200),
  mysteries: z.array(playerMysterySchema).max(100),
  clocks: z.array(playerClockSchema).max(100),
})

/** Runtime schema for a Director's exact-revision category patch. */
export const directorOutlinePatchInputSchema: z.ZodType<DirectorOutlinePatchInput> = z.strictObject({
  expectedRevision: revisionSchema,
  reason: textSchema,
  premise: optionalTextSchema.optional(),
  themes: z.array(directorTextItemSchema).max(100).optional(),
  hardConstraints: z.array(directorTextItemSchema).max(100).optional(),
  arcs: z.array(directorArcSchema).max(100).optional(),
  beats: z.array(directorBeatSchema).max(200).optional(),
  foreshadows: z.array(directorForeshadowSchema).max(200).optional(),
  mysteries: z.array(directorMysterySchema).max(100).optional(),
  clocks: z.array(directorClockSchema).max(100).optional(),
})

const suggestionSchema: z.ZodType<DirectorOutlineSuggestion> = z.strictObject({
  id: idSchema,
  baseRevision: revisionSchema,
  reason: textSchema,
  patch: directorOutlinePatchInputSchema,
  createdAt: z.iso.datetime(),
})

/** Runtime schema for the complete durable Director Outline. */
export const directorOutlineSchema: z.ZodType<DirectorOutline> = z.strictObject({
  schemaVersion: z.literal(1),
  revision: revisionSchema,
  updateMode: updateModeSchema,
  premise: optionalTextSchema,
  premiseLocked: z.boolean(),
  themes: z.array(persistedTextItemSchema).max(100),
  hardConstraints: z.array(persistedTextItemSchema).max(100),
  arcs: z.array(persistedArcSchema).max(100),
  beats: z.array(persistedBeatSchema).max(200),
  foreshadows: z.array(persistedForeshadowSchema).max(200),
  mysteries: z.array(persistedMysterySchema).max(100),
  clocks: z.array(persistedClockSchema).max(100),
  pendingSuggestions: z.array(suggestionSchema).max(20),
  history: z.array(z.strictObject({
    revision: revisionSchema,
    author: sourceSchema,
    reason: textSchema,
    changedSections: z.array(idSchema).max(20),
    createdAt: z.iso.datetime(),
  })).max(100),
  updatedAt: z.iso.datetime(),
  updatedBy: sourceSchema,
}).superRefine(validateOutline)

/** One rejected Outline mutation. */
export class StoryOutlineError extends Error {
  /** @param code - stable rejection class. @param message - concrete violated rule. @param options - native metadata. */
  constructor(
    readonly code: 'OUTLINE_INVALID' | 'OUTLINE_STALE' | 'OUTLINE_LOCKED' | 'OUTLINE_SUGGESTION_NOT_FOUND',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'StoryOutlineError'
  }
}

/**
 * Create the revision-zero Director Outline for a new Story.
 * @returns an empty non-canonical Outline with automatic unlocked updates.
 */
export function emptyDirectorOutline(values: RuntimeValues): DirectorOutline {
  const now = values.now()
  return {
    schemaVersion: 1,
    revision: 0,
    updateMode: 'auto_unlocked',
    premise: '',
    premiseLocked: false,
    themes: [],
    hardConstraints: [],
    arcs: [],
    beats: [],
    foreshadows: [],
    mysteries: [],
    clocks: [],
    pendingSuggestions: [],
    history: [],
    updatedAt: now,
    updatedBy: 'system',
  }
}

/**
 * Parse a complete player-authored replacement at the wire boundary.
 * @param input - Untrusted complete player Outline fields.
 * @returns strict player-editable Outline content.
 */
export function parseDirectorOutlinePlayerInput(input: unknown): DirectorOutlinePlayerInput {
  try {
    return directorOutlinePlayerInputSchema.parse(input)
  } catch (cause: unknown) {
    throw new StoryOutlineError(
      'OUTLINE_INVALID',
      outlineValidationMessage('Player Director Outline fields are invalid', cause),
      { cause },
    )
  }
}

/**
 * Parse one untrusted model-authored Outline patch.
 * @param input - Untrusted exact-revision category patch.
 * @returns strict Director patch content.
 */
export function parseDirectorOutlinePatchInput(input: unknown): DirectorOutlinePatchInput {
  try {
    return directorOutlinePatchInputSchema.parse(input)
  } catch (cause: unknown) {
    throw new StoryOutlineError(
      'OUTLINE_INVALID',
      outlineValidationMessage('Director Outline patch fields are invalid', cause),
      { cause },
    )
  }
}

/**
 * Replace all player-editable Outline content over an exact revision.
 * @param current - Current durable Outline.
 * @param expectedRevision - Exact revision observed by the player.
 * @param input - Complete player-editable replacement.
 * @param reason - Nonblank audit reason.
 * @returns the next validated Outline revision.
 */
export function replaceDirectorOutlineByPlayer(
  current: DirectorOutline,
  expectedRevision: number,
  input: DirectorOutlinePlayerInput,
  reason: string,
  values: RuntimeValues,
): DirectorOutline {
  assertRevision(current, expectedRevision)
  const accepted = parseDirectorOutlinePlayerInput(input)
  const next = {
    ...current,
    ...accepted,
    themes: playerItems(current.themes, accepted.themes),
    hardConstraints: playerItems(current.hardConstraints, accepted.hardConstraints),
    arcs: playerItems(current.arcs, accepted.arcs),
    beats: playerItems(current.beats, accepted.beats),
    foreshadows: playerItems(current.foreshadows, accepted.foreshadows),
    mysteries: playerItems(current.mysteries, accepted.mysteries),
    clocks: playerItems(current.clocks, accepted.clocks),
  }
  return finalize(current, next, 'player', reason, changedSections(current, next), values)
}

/**
 * Apply or queue one Director patch according to the player's update mode.
 * @param current - Current durable Outline.
 * @param input - Exact-revision Director category patch.
 * @returns the next validated Outline revision.
 */
export function applyDirectorOutlinePatch(
  current: DirectorOutline,
  input: DirectorOutlinePatchInput,
  values: RuntimeValues,
): DirectorOutline {
  const accepted = parseDirectorOutlinePatchInput(input)
  assertRevision(current, accepted.expectedRevision)
  if (current.updateMode === 'review_all') {
    const suggestion: DirectorOutlineSuggestion = {
      id: `suggestion-${values.id()}`,
      baseRevision: current.revision,
      reason: accepted.reason,
      patch: accepted,
      createdAt: values.now(),
    }
    const next = { ...current, pendingSuggestions: [...current.pendingSuggestions, suggestion] }
    return finalize(current, next, 'director', accepted.reason, ['pendingSuggestions'], values)
  }
  return applyPatchNow(current, accepted, false, 'director', values)
}

/**
 * Accept or reject one queued Director suggestion as an explicit player decision.
 * @param current - Current durable Outline.
 * @param expectedRevision - Exact revision observed by the player.
 * @param suggestionId - Pending suggestion identity.
 * @param accept - Whether to apply the queued patch.
 * @returns the next validated Outline revision.
 */
export function resolveDirectorOutlineSuggestion(
  current: DirectorOutline,
  expectedRevision: number,
  suggestionId: string,
  accept: boolean,
  values: RuntimeValues,
): DirectorOutline {
  assertRevision(current, expectedRevision)
  const suggestion = current.pendingSuggestions.find(item => item.id === suggestionId)
  if (suggestion === undefined) {
    throw new StoryOutlineError('OUTLINE_SUGGESTION_NOT_FOUND', `Unknown Outline suggestion '${suggestionId}'`)
  }
  const without = { ...current, pendingSuggestions: current.pendingSuggestions.filter(item => item.id !== suggestionId) }
  if (!accept) return finalize(current, without, 'player', `Rejected suggestion: ${suggestion.reason}`, ['pendingSuggestions'], values)
  const applied = applyPatchNow(without, { ...suggestion.patch, expectedRevision: current.revision }, true, 'player', values)
  return directorOutlineSchema.parse({
    ...applied,
    history: replaceLastHistoryReason(applied.history, `Accepted suggestion: ${suggestion.reason}`),
  })
}

function applyPatchNow(
  current: DirectorOutline,
  patch: DirectorOutlinePatchInput,
  allowLocked: boolean,
  author: DirectorOutlineAuthor,
  values: RuntimeValues,
): DirectorOutline {
  if (!allowLocked && current.premiseLocked && patch.premise !== undefined && patch.premise !== current.premise) {
    throw new StoryOutlineError('OUTLINE_LOCKED', 'Director Outline premise is locked by the player')
  }
  const next = {
    ...current,
    ...(patch.premise === undefined ? {} : { premise: patch.premise }),
    themes: patch.themes === undefined ? current.themes : directorItems(current.themes, patch.themes, allowLocked),
    hardConstraints: patch.hardConstraints === undefined
      ? current.hardConstraints
      : directorItems(current.hardConstraints, patch.hardConstraints, allowLocked),
    arcs: patch.arcs === undefined ? current.arcs : directorItems(current.arcs, patch.arcs, allowLocked),
    beats: patch.beats === undefined ? current.beats : directorItems(current.beats, patch.beats, allowLocked),
    foreshadows: patch.foreshadows === undefined
      ? current.foreshadows
      : directorItems(current.foreshadows, patch.foreshadows, allowLocked),
    mysteries: patch.mysteries === undefined
      ? current.mysteries
      : directorItems(current.mysteries, patch.mysteries, allowLocked),
    clocks: patch.clocks === undefined ? current.clocks : directorItems(current.clocks, patch.clocks, allowLocked),
  }
  return finalize(current, next, author, patch.reason, changedSections(current, next), values)
}

function playerItems<T extends { readonly id: string; readonly source: DirectorOutlineAuthor }>(
  current: readonly T[],
  input: readonly Omit<T, 'source'>[],
): T[] {
  const prior = new Map(current.map(item => [item.id, item]))
  return input.map(item => ({ ...item, source: prior.get(item.id)?.source ?? 'player' })) as T[]
}

function directorItems<T extends { readonly id: string; readonly source: DirectorOutlineAuthor; readonly locked: boolean }>(
  current: readonly T[],
  input: readonly Omit<T, 'source' | 'locked'>[],
  allowLocked: boolean,
): T[] {
  const incoming = new Map(input.map(item => [item.id, item]))
  if (!allowLocked) {
    for (const item of current) {
      if (!item.locked) continue
      const replacement = incoming.get(item.id)
      if (replacement === undefined || JSON.stringify(replacement) !== JSON.stringify(withoutIdentity(item))) {
        throw new StoryOutlineError('OUTLINE_LOCKED', `Director Outline item '${item.id}' is locked by the player`)
      }
    }
  }
  const prior = new Map(current.map(item => [item.id, item]))
  const mapped = input.map((item) => {
    const existing = prior.get(item.id)
    return {
      ...item,
      source: existing?.source ?? 'director',
      locked: existing?.locked ?? false,
    }
  }) as T[]
  if (allowLocked) return mapped
  const retained = current.filter(item => item.locked && !incoming.has(item.id))
  return [...mapped, ...retained]
}

function withoutIdentity<T extends { readonly source: DirectorOutlineAuthor; readonly locked: boolean }>(item: T): Omit<T, 'source' | 'locked'> {
  const { source: _source, locked: _locked, ...content } = item
  return content
}

function finalize(
  current: DirectorOutline,
  next: Omit<DirectorOutline, 'revision' | 'updatedAt' | 'updatedBy' | 'history'> & Pick<DirectorOutline, 'history'>,
  author: DirectorOutlineAuthor,
  reason: string,
  sections: string[],
  values: RuntimeValues,
): DirectorOutline {
  const revision = current.revision + 1
  const createdAt = values.now()
  try {
    return directorOutlineSchema.parse({
      ...next,
      revision,
      updatedAt: createdAt,
      updatedBy: author,
      history: [...current.history, {
        revision,
        author,
        reason: normalizeReason(reason),
        changedSections: sections,
        createdAt,
      }].slice(-100),
    })
  } catch (cause: unknown) {
    if (cause instanceof StoryOutlineError) throw cause
    throw new StoryOutlineError(
      'OUTLINE_INVALID',
      outlineValidationMessage('Director Outline result is invalid', cause),
      { cause },
    )
  }
}

function outlineValidationMessage(prefix: string, cause: unknown): string {
  if (!(cause instanceof z.ZodError)) return prefix
  const details = cause.issues.slice(0, 12).map((issue) => {
    const path = issue.path.length === 0 ? 'outline' : issue.path.map(String).join('.')
    return `${path}: ${issue.message}`
  })
  return details.length === 0 ? prefix : `${prefix}: ${details.join('; ')}`
}

function assertRevision(current: DirectorOutline, expected: number): void {
  if (expected !== current.revision) {
    throw new StoryOutlineError(
      'OUTLINE_STALE',
      `Director Outline expected revision ${expected}, current revision is ${current.revision}`,
    )
  }
}

function changedSections(current: DirectorOutline, next: Omit<DirectorOutline, 'revision' | 'updatedAt' | 'updatedBy'>): string[] {
  const keys = ['updateMode', 'premise', 'premiseLocked', 'themes', 'hardConstraints', 'arcs', 'beats', 'foreshadows', 'mysteries', 'clocks', 'pendingSuggestions'] as const
  return keys.filter(key => JSON.stringify(current[key]) !== JSON.stringify(next[key]))
}

function normalizeReason(reason: string): string {
  const accepted = reason.trim()
  if (accepted.length === 0 || accepted.length > 20_000) {
    throw new StoryOutlineError('OUTLINE_INVALID', 'Outline revision reason must be nonblank and at most 20000 characters')
  }
  return accepted
}

function replaceLastHistoryReason(
  history: DirectorOutline['history'],
  reason: string,
): DirectorOutline['history'] {
  const last = history.at(-1)
  return last === undefined ? history : [...history.slice(0, -1), { ...last, reason }]
}

function validateOutline(outline: DirectorOutline, context: z.RefinementCtx): void {
  const ids = new Set<string>()
  for (const collection of [
    outline.themes, outline.hardConstraints, outline.arcs, outline.beats,
    outline.foreshadows, outline.mysteries, outline.clocks,
  ]) {
    for (const item of collection) {
      if (ids.has(item.id)) context.addIssue({ code: 'custom', message: `duplicate Outline item id: ${item.id}` })
      ids.add(item.id)
    }
  }
  for (const beat of outline.beats) validateBeatEvidence(beat, context)
  for (const foreshadow of outline.foreshadows) validateForeshadowEvidence(foreshadow, context)
  for (const clock of outline.clocks) {
    if (clock.progress > clock.limit) context.addIssue({ code: 'custom', message: `clock '${clock.id}' exceeds its limit` })
  }
}

function validateBeatEvidence(beat: DirectorPlotBeat, context: z.RefinementCtx): void {
  if (beat.status === 'resolved' && beat.resolvedByEventRefs.length === 0) {
    context.addIssue({ code: 'custom', message: `resolved beat '${beat.id}' requires event evidence` })
  }
}

function validateForeshadowEvidence(foreshadow: DirectorForeshadow, context: z.RefinementCtx): void {
  if (['planted', 'reinforced', 'paid_off'].includes(foreshadow.status) && foreshadow.plantedEventRefs.length === 0) {
    context.addIssue({ code: 'custom', message: `planted foreshadow '${foreshadow.id}' requires event evidence` })
  }
  if (foreshadow.status === 'paid_off' && foreshadow.payoffEventRefs.length === 0) {
    context.addIssue({ code: 'custom', message: `paid-off foreshadow '${foreshadow.id}' requires payoff evidence` })
  }
}

// Anchor exported structural types in this module's documentation surface.
type _OutlineStructures = DirectorStoryArc | DirectorPlotBeat | DirectorForeshadow | DirectorMystery | DirectorNarrativeClock
void (undefined as _OutlineStructures | undefined)
