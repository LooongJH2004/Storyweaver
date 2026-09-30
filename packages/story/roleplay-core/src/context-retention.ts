/** Source-indexed, player-approved context retention. Original payloads stay in their owning logs. */
import { z } from 'zod'

const memoryFieldGuidance = {
  operation: 'add creates a note with a system-generated ID: omit noteId and expectedRevision. Every other operation targets an existing note and requires both fields; keep its existing kind. revise updates an understanding that still applies. resolve records that a question has been answered or an obligation completed. withdraw records that you no longer endorse a claim. replace supersedes the target with a new note. archive removes the note from ordinary context without deleting history. Preserve conditional triggers: after an observed completion, an earlier fallback for non-completion is historical, not a new ongoing duty. Check related retained notes when updating the same obligation; do not resolve unrelated promises or infer success from an attempt alone.',
  noteId: 'Existing note ID copied from your retained notes, not a source ID or recall reference. Omit for add; never invent an ID.',
  expectedRevision: 'Exact revision of the targeted note, not the story revision. Omit for add.',
  unitSources: 'Sources processed by this unit. Each represented source must also appear in at least one retained change below.',
  noteSources: 'Evidence retained by this particular note. Required on each change even when the unit already lists the same sources. During private consolidation, keep unit.sourceIds limited to the assigned batch. A note may additionally cite other admitted originals retrieved through recall to check whether an earlier question or obligation is still open; put their original IDs here, not in unit.sourceIds. Supporting citations do not mark those extra sources processed. Distinguish the original experience from the later evidence and preserve who observed or claimed each part.',
  text: 'Write the lasting takeaway first, usually in one or two sentences. Actors retain a bounded belief, expectation or intended choice: a useful form is "I now expect ..., so ...; ... remains uncertain", using only justified parts. Directors retain the established situation, attributed commitments and unresolved consequences, without adopting an actor\'s private belief. Combine related sources around that takeaway. Put the supporting event sequence in optional episode.experience or leave it in recallable originals, rather than opening with who said what and then retelling the scene. Keep attribution, negation, quantities and deadlines here when they change the takeaway. Preserve attempts versus observed results; never invent supporting experiences. Remembering an event in first person does not make the observer its agent: preserve who acted and whether the action was intentional. Your own later retelling is a claim, not independent evidence that you performed a witnessed action. This is a writing guide, not a hard length limit.',
  experience: 'Only the specific evidence needed to revisit the brief, without repeating it or retelling each source. Distinguish what you witnessed, said, attempted and received as a result: an accepted action submission alone does not prove completion. Keep any retained quantities, durations, negation and event order exact. Later self-reports remain claims, not replacements for observations. Do not infer earlier instructions from later choices. Leave incidental detail in the recallable originals.',
  interpretation: 'Optional reasoning behind your understanding, including mistakes or uncertainty. Omit when the brief already explains it. Do not repeat the brief or invent evidence, unseen rules or events.',
  impact: 'Optional additional effects on trust, expectations, commitments or choices. Omit when already captured in the brief or no further effect occurred. Do not repeat the brief or invent an effect or completed action.',
  episode: 'Optional supporting detail: experience, interpretation, personal effect and still-open questions, without repeating the brief. For add or replace, omit when the brief is sufficient. For revise, resolve, withdraw or archive, omitting episode preserves its previous contents unchanged, including unresolved questions. The brief unresolvedCount counts questions stored in the details, not a fresh judgment of whether they remain open. Changing status alone does not clear them. Before changing a note with a detailReference, read that reference with your available recall operation if its details are not already available. Supply a complete revised episode when the new brief or status makes any detail outdated; keep supported experience, update changed interpretations or effects, and remove answered questions from unresolved (use [] when none remain). Record only the supplied perspective; interpretation is not world truth.',
  unresolved: 'Questions still open now in the supplied perspective. Use [] when none remain. Put past uncertainty in experience, not here; do not turn every untested possibility into a pending task.',
} as const

const id = z.string().min(1)
const scope = z.string().regex(/^(director|actor:.+)$/u)
const ids = z.array(id).min(1).refine(values => new Set(values).size === values.length, 'Duplicate source')
const kind = z.enum(['fact', 'claim', 'promise', 'condition', 'question', 'clue', 'player-direction', 'outcome'])
const status = z.enum(['active', 'resolved', 'withdrawn', 'archived', 'superseded'])
const episodeSchema = z.strictObject({
  topic: id, experience: id.describe(memoryFieldGuidance.experience),
  interpretation: id.optional().describe(memoryFieldGuidance.interpretation),
  impact: id.optional().describe(memoryFieldGuidance.impact), unresolved: z.array(id).describe(memoryFieldGuidance.unresolved),
})

/** Immutable location and original knowledge scope of a narrative source. */
export const contextSourceSchema = z.strictObject({
  id, sceneId: id, kind: id, actorId: id.optional(), scopes: ids, order: z.number().int().nonnegative(),
  perspectives: z.record(id, z.strictObject({ refs: z.record(id, id), labels: z.record(id, id) })).optional(),
  locator: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('session'), sessionId: id, seq: z.number().int().nonnegative(), path: z.array(id) }),
    z.strictObject({ kind: z.literal('world'), eventId: id }),
    z.strictObject({ kind: z.literal('perception'), perceptionId: id }),
    z.strictObject({ kind: z.literal('discussion'), discussionId: id, turnId: id }),
  ]),
})
/** A durable pointer, never a model-written reconstruction of original text. */
export type ContextSource = z.infer<typeof contextSourceSchema>

const noteSchema = z.strictObject({
  id, revision: z.number().int().positive(), scope, kind, text: z.string().trim().min(1),
  status, sourceIds: ids, author: scope, episode: episodeSchema.optional(),
})
/** One approved, audience-specific short memory with retained evidence. */
export type ContextNote = z.infer<typeof noteSchema>
/** Player corrections change prose without accepting new sources or ownership. */
export const contextNoteCorrectionSchema = noteSchema.pick({ text: true, episode: true })

/**
 * Correct effective memory under player authority, retaining evidence and status.
 * @param state - Current owner retention state.
 * @param viewer - Authenticated memory owner.
 * @param submissionId - Player command identity.
 * @param noteId - Existing note identity.
 * @param revision - Exact reviewed note revision.
 * @param content - Corrected prose and optional episode details.
 * @returns Updated notes and an approved player correction record.
 */
export function correctContextNote(state: StoryContextRetention, viewer: string, submissionId: string,
  noteId: string, revision: number, content: z.infer<typeof contextNoteCorrectionSchema>): StoryContextRetention {
  const note = state.notes.find(item => item.id === noteId && item.scope === viewer && item.revision === revision)
  if (note === undefined || note.status === 'archived' || note.status === 'superseded') throw new Error('Context note revision conflict')
  const operation = note.status === 'resolved' ? 'resolve' : note.status === 'withdrawn' ? 'withdraw' : 'revise'
  const pending = proposeContextUpdate({ ...state, activation: 'review' }, viewer, submissionId, submissionId, [{
    sourceIds: note.sourceIds, disposition: 'represented', reason: 'Player correction.', changes: [{
      operation, noteId, expectedRevision: revision, kind: note.kind, sourceIds: note.sourceIds, ...content,
    }],
  }])
  const approved = reviewContextProposals(pending, [{ id: `${submissionId}:0`, revision: 1, approve: true }])
  const { activation: _activation, ...rest } = approved
  return { ...rest, ...(state.activation === undefined ? {} : { activation: state.activation }) }
}

/** A proposed note mutation; target revisions are checked again at player approval. */
export const contextNoteChangeSchema = z.strictObject({
  operation: z.enum(['add', 'revise', 'resolve', 'withdraw', 'replace', 'archive']).describe(memoryFieldGuidance.operation),
  noteId: id.optional().describe(memoryFieldGuidance.noteId),
  expectedRevision: z.number().int().positive().optional().describe(memoryFieldGuidance.expectedRevision),
  kind, text: z.string().trim().min(1).describe(memoryFieldGuidance.text),
  sourceIds: ids.describe(memoryFieldGuidance.noteSources), episode: episodeSchema.optional().describe(memoryFieldGuidance.episode),
}).superRefine((value, ctx) => {
  if (value.operation === 'add' ? value.noteId !== undefined || value.expectedRevision !== undefined
    : value.noteId === undefined || value.expectedRevision === undefined) {
    ctx.addIssue({ code: 'custom', message: 'add omits target; other operations require noteId and expectedRevision' })
  }
})
/** One indivisible source-processing unit, edited and approved together. */
export const contextUpdateUnitSchema = z.strictObject({
  sourceIds: ids.describe(memoryFieldGuidance.unitSources), disposition: z.enum(['represented', 'archive']), reason: z.string().trim().min(1),
  changes: z.array(contextNoteChangeSchema),
}).refine(value => value.disposition !== 'represented' || value.changes.some(change => change.operation !== 'archive'),
  'Represented sources need a retained note')
/** Model-authored proposal data, before Host resolves local source references. */
export type ContextUpdateUnit = z.infer<typeof contextUpdateUnitSchema>
/** Fixed optional payload shared by ordinary Director and Actor submissions. */
export const contextUpdateSchema = z.array(contextUpdateUnitSchema)

/** Stable model-facing JSON schema. Local sources are $narration or $behavior:N until committed. */
export const contextUpdateToolParameter = {
  type: 'array', description: 'Optional short-memory proposals. They require player review unless your context explicitly enables automatic activation. Keep subjects, conditions, deadlines, costs and outcomes. Never treat a claim as fact or an attempted action as success. Pending notes do not replace originals. Use supplied source IDs, $narration, or $behavior:N (zero-based). Propose only changes; never restate unchanged notes. Every unit takes effect atomically.',
  items: { type: 'object', additionalProperties: false, properties: {
    sourceIds: { type: 'array', required: true, items: { type: 'string' },
      description: memoryFieldGuidance.unitSources },
    disposition: { type: 'string', required: true, enum: ['represented', 'archive'] },
    reason: { type: 'string', required: true },
    changes: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
      operation: { type: 'string', required: true, enum: ['add', 'revise', 'resolve', 'withdraw', 'replace', 'archive'],
        description: memoryFieldGuidance.operation },
      noteId: { type: 'string', description: memoryFieldGuidance.noteId },
      expectedRevision: { type: 'integer', description: memoryFieldGuidance.expectedRevision },
      kind: { type: 'string', required: true, enum: ['fact', 'claim', 'promise', 'condition', 'question', 'clue', 'player-direction', 'outcome'] },
      text: { type: 'string', required: true, description: memoryFieldGuidance.text }, sourceIds: { type: 'array', required: true, items: { type: 'string' },
        description: memoryFieldGuidance.noteSources },
      episode: { type: 'object', additionalProperties: false,
        description: memoryFieldGuidance.episode,
        properties: { topic: { type: 'string', required: true },
          experience: { type: 'string', required: true, description: memoryFieldGuidance.experience },
          interpretation: { type: 'string', description: memoryFieldGuidance.interpretation },
          impact: { type: 'string', description: memoryFieldGuidance.impact },
          unresolved: { type: 'array', required: true, items: { type: 'string' }, description: memoryFieldGuidance.unresolved } } },
    } } },
  } },
} as const

/**
 * Resolve only explicitly supplied local aliases; source permissions are validated before persistence.
 * @param input - Untrusted proposal payload.
 * @param aliases - Host-bound local references for the current operation.
 * @returns Validated units with canonical source references.
 */
export function resolveContextUpdate(input: unknown, aliases: Readonly<Record<string, string>>): ContextUpdateUnit[] {
  const resolve = (id: string): string => {
    if (!id.startsWith('$')) return id
    const value = aliases[id]
    if (value === undefined) throw new Error(`Unavailable local source: ${id}`)
    return value
  }
  return contextUpdateSchema.parse(input).map(unit => ({ ...unit, sourceIds: unit.sourceIds.map(resolve),
    changes: unit.changes.map(change => ({ ...change, sourceIds: change.sourceIds.map(resolve) })),
  }))
}

/**
 * Bind short write references to one execution's ordered source batch.
 * @param sources - Canonical sources assigned by the host for this execution.
 * @returns Local references; callers still validate ownership and exact coverage after resolution.
 */
export function consolidationSourceAliases(sources: readonly string[]): Readonly<Record<string, string>> {
  return Object.fromEntries(sources.map((source, index) => [`$source:${index + 1}`, source]))
}

const proposalSchema = z.strictObject({
  id, revision: z.number().int().positive(), scope, turnId: id,
  status: z.enum(['proposed', 'approved', 'rejected']), unit: contextUpdateUnitSchema,
  activation: z.enum(['automatic', 'player']).optional(),
  submittedUnit: contextUpdateUnitSchema,
  retainedNoteIds: z.array(id),
})
/** Player-reviewable processing unit and its effective replacement notes. */
export type ContextProposal = z.infer<typeof proposalSchema>

/** Context state is restored atomically with the Story's world checkpoint. */
export const storyContextRetentionSchema = z.strictObject({
  revision: z.number().int().nonnegative(), sources: z.array(contextSourceSchema),
  activation: z.enum(['automatic', 'review']).optional(),
  notes: z.array(noteSchema), proposals: z.array(proposalSchema),
  pins: z.array(z.strictObject({ sourceId: id, scope })),
})
/** Source index, approved notes, proposals, and explicit original-text pins. */
export type StoryContextRetention = z.infer<typeof storyContextRetentionSchema>
/**
 * Create empty retention state.
 * @returns An independent empty retention state.
 */
export function emptyContextRetention(): StoryContextRetention {
  return { revision: 0, sources: [], notes: [], proposals: [], pins: [] }
}
/**
 * Resolve the authenticated knowledge scope.
 * @param actorId - Character identity; omission selects the Director.
 * @returns The authenticated knowledge-scope key.
 */
export function contextScope(actorId?: string): string { return actorId === undefined ? 'director' : `actor:${actorId}` }

/**
 * Append pointers once; conflicting id reuse cannot silently change provenance.
 * @param state - Current immutable retention state.
 * @param sources - Accepted original locations and captured visibility.
 * @returns The state with newly indexed originals; conflicting identity reuse throws.
 */
export function indexContextSources(state: StoryContextRetention, sources: readonly ContextSource[]): StoryContextRetention {
  const added: ContextSource[] = []
  for (const input of sources) {
    const source = contextSourceSchema.parse(input)
    const previous = [...state.sources, ...added].find(item => item.id === source.id)
    if (previous !== undefined) {
      if (JSON.stringify({ ...previous, order: 0 }) !== JSON.stringify({ ...source, order: 0 })) throw new Error('Source identity conflict')
    } else added.push({ ...source, order: state.sources.length + added.length })
  }
  return added.length === 0 ? state : { ...state, revision: state.revision + 1, sources: [...state.sources, ...added] }
}

function validateUnit(state: StoryContextRetention, viewer: string, unit: ContextUpdateUnit): void {
  for (const sourceId of new Set([...unit.sourceIds, ...unit.changes.flatMap(change => change.sourceIds)])) {
    if (!state.sources.some(source => source.id === sourceId && source.scopes.includes(viewer))) throw new Error('Context source is not visible')
  }
  const targets = new Set<string>()
  for (const change of unit.changes) {
    if (viewer !== 'director' && change.kind === 'fact') throw new Error('Actor memories describe claims, not canonical facts')
    if (viewer === 'director' && change.kind === 'promise' && change.operation === 'withdraw') throw new Error('The Director cannot withdraw an Actor promise')
    if (change.noteId !== undefined) {
      if (targets.has(change.noteId)) throw new Error('A note can change only once per unit')
      targets.add(change.noteId)
      const note = state.notes.find(item => item.id === change.noteId)
      if (note === undefined || note.scope !== viewer) {
        throw new Error('Context note target is unavailable. Copy noteId from your retained context summaries, not from beliefs, memories, sources or recall references. To retain a new summary, use operation=add and omit noteId and expectedRevision. No changes were submitted.')
      }
      if (note.revision !== change.expectedRevision || note.status === 'archived' || note.status === 'superseded') {
        throw new Error('Context note revision conflict; read the current retained summary and copy its noteId and note revision before resubmitting. Archived or superseded notes cannot be revised. No changes were submitted.')
      }
      if (note.kind !== change.kind) throw new Error('A note keeps its kind')
    }
  }
  if (unit.disposition === 'represented' && unit.sourceIds.some(sourceId => !unit.changes.some(change =>
    change.operation !== 'archive' && change.sourceIds.includes(sourceId)))) throw new Error('Every represented source needs a note reference')
}

/**
 * Submit units under the owner's saved activation policy; omission requires player review.
 * @param state - Current immutable retention state.
 * @param viewer - Authenticated Director or Actor knowledge scope.
 * @param submissionId - Stable accepted tool transaction identity for idempotency.
 * @param turnId - Player turn that groups review units.
 * @param input - Untrusted proposal payload.
 * @returns Pending units, or atomically activated new units under an explicit automatic policy.
 */
export function proposeContextUpdate(state: StoryContextRetention, viewer: string, submissionId: string,
  turnId: string, input: readonly ContextUpdateUnit[]): StoryContextRetention {
  const units = contextUpdateSchema.parse(input)
  let next = state
  for (const [index, unit] of units.entries()) {
    const proposalId = `${submissionId}:${index}`
    const old = next.proposals.find(proposal => proposal.id === proposalId)
    if (old !== undefined) {
      if (old.scope !== viewer || JSON.stringify(old.submittedUnit) !== JSON.stringify(unit)) throw new Error('Context submission identity conflict')
      continue
    }
    validateUnit(next, viewer, unit)
    next = { ...next, revision: next.revision + 1, proposals: [...next.proposals, {
      id: proposalId, revision: 1, scope: viewer, turnId, status: 'proposed', unit, submittedUnit: unit, retainedNoteIds: [],
    }] }
    if (state.activation === 'automatic') {
      next = reviewContextProposals(next, [{ id: proposalId, revision: 1, approve: true }])
      next = { ...next, proposals: next.proposals.map(proposal => proposal.id === proposalId
        ? { ...proposal, activation: 'automatic' } : proposal) }
    }
  }
  return next
}

/**
 * Player edits only a pending unit; source scope and target revisions remain enforced.
 * @param state - Current immutable retention state.
 * @param proposalId - Pending source-processing unit identity.
 * @param revision - Exact revision observed by the player.
 * @param input - Untrusted proposal payload.
 * @returns The edited pending unit; stale proposal or note revisions throw.
 */
export function editContextProposal(state: StoryContextRetention, proposalId: string, revision: number,
  input: ContextUpdateUnit): StoryContextRetention {
  const proposal = state.proposals.find(item => item.id === proposalId)
  if (proposal?.status !== 'proposed' || proposal.revision !== revision) throw new Error('Context proposal revision conflict')
  const unit = contextUpdateUnitSchema.parse(input)
  validateUnit(state, proposal.scope, unit)
  return { ...state, revision: state.revision + 1, proposals: state.proposals.map(item => item.id === proposalId
    ? { ...item, revision: item.revision + 1, unit } : item) }
}

/**
 * Atomic player approval of complete source-processing units. Rejection never drops originals.
 * @param state - Current immutable retention state.
 * @param reviews - Atomic approval or rejection decisions and observed revisions.
 * @returns The complete approved state, or a conflict without partial changes.
 */
export function reviewContextProposals(state: StoryContextRetention,
  reviews: readonly { id: string; revision: number; approve: boolean }[]): StoryContextRetention {
  let next = state
  for (const review of reviews) {
    const proposal = next.proposals.find(item => item.id === review.id)
    if (proposal?.status !== 'proposed' || proposal.revision !== review.revision) throw new Error('Context proposal revision conflict')
    const retainedNoteIds: string[] = []
    if (review.approve) {
      validateUnit(next, proposal.scope, proposal.unit)
      for (const [index, change] of proposal.unit.changes.entries()) {
        const previous = next.notes.find(note => note.id === change.noteId)
        const noteId = change.operation === 'add' || change.operation === 'replace'
          ? `note:${proposal.id}:${index}` : change.noteId as string
        const sourceIds = [...new Set([...(previous?.sourceIds ?? []), ...change.sourceIds])]
        const episode = change.episode ?? (noteId === previous?.id ? previous.episode : undefined)
        const note: ContextNote = { id: noteId, revision: (noteId === previous?.id ? previous.revision : 0) + 1,
          scope: proposal.scope, author: proposal.scope, kind: change.kind, text: change.text, sourceIds,
          ...(episode === undefined ? {} : { episode }),
          status: change.operation === 'resolve' ? 'resolved' : change.operation === 'withdraw' ? 'withdrawn'
            : change.operation === 'archive' ? 'archived' : 'active' }
        next = { ...next, notes: [...next.notes.filter(item => item.id !== noteId).map(item =>
          change.operation === 'replace' && item.id === previous?.id
            ? { ...item, revision: item.revision + 1, status: 'superseded' as const } : item), note] }
        if (note.status !== 'archived') retainedNoteIds.push(noteId)
        // Preserve coverage granted by an earlier approval when its note is explicitly replaced.
        if (change.operation === 'replace') next = { ...next, proposals: next.proposals.map(item => ({ ...item,
          retainedNoteIds: item.retainedNoteIds.map(id => id === previous?.id ? noteId : id),
        })) }
      }
    }
    next = { ...next, revision: next.revision + 1, proposals: next.proposals.map(item => item.id === proposal.id
      ? { ...item, revision: item.revision + 1, status: review.approve ? 'approved' : 'rejected', retainedNoteIds } : item) }
  }
  return next
}

/**
 * Explicitly pin or unpin one viewer's original; other knowledge scopes are unaffected.
 * @param state - Current immutable retention state.
 * @param sourceId - Original source identity.
 * @param viewer - Authenticated Director or Actor knowledge scope.
 * @param pinned - Whether the original must remain in this viewer’s context.
 * @returns The updated viewer-specific pin state.
 */
export function pinContextSource(state: StoryContextRetention, sourceId: string, viewer: string, pinned: boolean): StoryContextRetention {
  if (!state.sources.some(source => source.id === sourceId && source.scopes.includes(viewer))) throw new Error('Context source is not visible')
  const pins = state.pins.filter(pin => pin.sourceId !== sourceId || pin.scope !== viewer)
  return { ...state, revision: state.revision + 1, pins: pinned ? [...pins, { sourceId, scope: viewer }] : pins }
}

/**
 * Select effective approved notes for one viewer.
 * @param state - Current immutable retention state.
 * @param viewer - Authenticated Director or Actor knowledge scope.
 * @returns Approved notes, including resolved and withdrawn consequences.
 */
export function activeContextNotes(state: StoryContextRetention, viewer: string): ContextNote[] {
  return state.notes.filter(note => note.scope === viewer && note.status !== 'archived' && note.status !== 'superseded')
}

/**
 * Disable an exact effective note without deleting its text or original evidence.
 * @param state - Current retention projection.
 * @param noteId - Note selected by the player.
 * @param revision - Revision inspected before withdrawal.
 * @param viewer - Owner whose context is being corrected.
 * @returns A new revision; sources without other effective coverage return to context.
 */
export function revokeContextNote(state: StoryContextRetention, noteId: string, revision: number, viewer: string): StoryContextRetention {
  const note = activeContextNotes(state, viewer).find(item => item.id === noteId)
  if (note === undefined || note.revision !== revision) throw new Error('Context note revision conflict')
  return { ...state, revision: state.revision + 1, notes: state.notes.map(item => item.id === noteId
    ? { ...item, status: 'archived', revision: item.revision + 1 } : item) }
}
/**
 * Whether an approval still has an effective replacement for this exact viewer and source.
 * @param state - Current immutable retention state.
 * @param sourceId - Original source identity.
 * @param viewer - Authenticated Director or Actor knowledge scope.
 * @returns Whether effective approval covers every required note and no pin or pending unit blocks retirement.
 */
export function contextSourceCanArchive(state: StoryContextRetention, sourceId: string, viewer: string): boolean {
  if (state.pins.some(pin => pin.scope === viewer && pin.sourceId === sourceId)) return false
  const notes = activeContextNotes(state, viewer)
  const proposals = state.proposals.filter(proposal => proposal.scope === viewer && proposal.unit.sourceIds.includes(sourceId))
  if (proposals.some(proposal => proposal.status === 'proposed') || proposals.at(-1)?.status === 'rejected') return false
  return proposals.some((proposal) => {
    if (proposal.status !== 'approved') return false
    if (proposal.unit.disposition === 'archive') return true
    const required = proposal.retainedNoteIds.filter(id => state.notes.some(note => note.id === id && note.sourceIds.includes(sourceId)))
    return required.length > 0 && required.every(id => notes.some(note => note.id === id))
  })
}

/**
 * Keep the recent minimum plus every older source without effective player-approved coverage.
 * @param state - Current immutable retention state.
 * @param viewer - Authenticated Director or Actor knowledge scope.
 * @param recentLimit - Minimum recent visible sources retained verbatim.
 * @param batchSize - Visible-source count per stable batch.
 * @returns Recent originals plus all older originals without effective retirement approval.
 */
export function retainedContextSources(state: StoryContextRetention, viewer: string, recentLimit: number, batchSize: number): {
  sources: ContextSource[]
  recentIds: string[]
  archived: number
  pending: number
} {
  const visible = state.sources.filter(source => source.scopes.includes(viewer))
  const recentIds = visible.slice(Math.max(0, Math.floor(visible.length / batchSize) * batchSize - recentLimit)).map(source => source.id)
  const sources = visible.filter(source => recentIds.includes(source.id) || !contextSourceCanArchive(state, source.id, viewer))
  return { sources, recentIds, archived: visible.length - sources.length,
    pending: sources.filter(source => !recentIds.includes(source.id)).length }
}
