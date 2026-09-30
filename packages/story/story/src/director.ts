/** Strict Director planning data and NPC-tool provenance for the Plot Ledger. */

import { z } from 'zod'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {
  DirectorActorDispatchOutcome,
  DirectorActorDispatchAttemptInput,
  DirectorActorBrief,
  DirectorBrief,
  DirectorBriefInput,
  DirectorRun,
  DirectorRunActor,
  DirectorRunAttempt,
  DirectorRunAttemptId,
  PlotLedger,
  PlotLedgerNpcEvent,
} from './types.ts'

interface SessionEventEnvelope {
  readonly type: string
  readonly seq: number
  readonly data: unknown
}

interface NpcBehaviorSessionEvent extends SessionEventEnvelope {
  readonly operationIndex?: number | undefined
  readonly type: 'actor/expression' | 'actor/action-intent'
}

const nonBlankText = z.string().trim().min(1)
const actorIdSchema = z.string().trim().min(1).max(160)
const eventSeqSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

/** Runtime schema for Actor-specific context that contains no response prescription. */
export const directorActorBriefSchema: z.ZodType<DirectorActorBrief> = z.strictObject({
  actorId: actorIdSchema,
  perceptions: z.array(nonBlankText),
  uncertainties: z.array(nonBlankText),
})

/** Runtime schema for untrusted Director planning input. Extra behavior fields are rejected. */
export const directorBriefInputSchema: z.ZodType<DirectorBriefInput> = z.strictObject({
  expectedLedgerRevision: eventSeqSchema,
  sceneSessionId: z.string().min(1).transform(SessionId),
  situation: nonBlankText,
  establishedFacts: z.array(nonBlankText),
  openThreads: z.array(nonBlankText),
  actorBriefs: z.array(directorActorBriefSchema),
})

const speechLedgerEventSchema = z.strictObject({
  kind: z.literal('speech'),
  ledgerRevision: eventSeqSchema,
  actorId: actorIdSchema,
  sessionId: z.string().min(1).transform(SessionId),
  actorEventSeq: eventSeqSchema,
  operationIndex: eventSeqSchema.optional(),
  toolCallEventSeq: eventSeqSchema,
  text: nonBlankText,
  audience: z.array(nonBlankText),
  delivery: z.enum(['spoken', 'whispered', 'written']),
})

const actionLedgerEventSchema = z.strictObject({
  kind: z.literal('action-intent'),
  ledgerRevision: eventSeqSchema,
  actorId: actorIdSchema,
  sessionId: z.string().min(1).transform(SessionId),
  actorEventSeq: eventSeqSchema,
  operationIndex: eventSeqSchema.optional(),
  toolCallEventSeq: eventSeqSchema,
  description: nonBlankText,
  target: nonBlankText.optional(),
})

/** Runtime schema for NPC behavior admitted to the Plot Ledger. */
export const plotLedgerNpcEventSchema: z.ZodType<PlotLedgerNpcEvent> = z.discriminatedUnion('kind', [
  speechLedgerEventSchema,
  actionLedgerEventSchema,
])

/** Runtime schema for a committed Director Brief. */
export const directorBriefSchema: z.ZodType<DirectorBrief> = z.strictObject({
  sourceLedgerRevision: eventSeqSchema,
  ledgerRevision: eventSeqSchema,
  directorSessionId: z.string().min(1).transform(SessionId),
  sceneSessionId: z.string().min(1).transform(SessionId),
  situation: nonBlankText,
  establishedFacts: z.array(nonBlankText),
  openThreads: z.array(nonBlankText),
  actorBriefs: z.array(directorActorBriefSchema),
  sourceNpcEvents: z.array(plotLedgerNpcEventSchema),
  createdAt: z.iso.datetime(),
})

const directorRunFailureSchema = z.strictObject({
  code: z.string().trim().min(1).max(160),
  message: nonBlankText,
})

const directorRunAttemptSchema: z.ZodType<DirectorRunAttempt> = z.strictObject({
  attemptId: z.string().trim().min(1).max(240).transform(value => value as DirectorRunAttemptId),
  generation: eventSeqSchema,
  actorSessionId: z.string().min(1).transform(SessionId),
  afterEventSeq: z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER),
  startedAt: z.iso.datetime(),
})

const directorRunActorSchema: z.ZodType<DirectorRunActor> = z.strictObject({
  actorId: actorIdSchema,
  status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped', 'cancelled']),
  attempts: eventSeqSchema,
  generation: eventSeqSchema,
  attempt: directorRunAttemptSchema.optional(),
  eventRefs: z.array(nonBlankText),
  failure: directorRunFailureSchema.optional(),
})

/** Runtime schema for one resumable Director orchestration checkpoint. */
export const directorRunSchema: z.ZodType<DirectorRun> = z.strictObject({
  id: nonBlankText,
  revision: eventSeqSchema,
  briefLedgerRevision: eventSeqSchema,
  directorSessionId: z.string().min(1).transform(SessionId),
  sceneSessionId: z.string().min(1).transform(SessionId),
  status: z.enum(['brief_committed', 'dispatching', 'paused', 'awaiting_retry', 'completed', 'cancelled']),
  actors: z.array(directorRunActorSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

/** Runtime schema for the complete current Plot Ledger. */
export const plotLedgerSchema: z.ZodType<PlotLedger> = z.strictObject({
  revision: eventSeqSchema,
  situation: z.string(),
  establishedFacts: z.array(nonBlankText),
  openThreads: z.array(nonBlankText),
  pendingNpcEvents: z.array(plotLedgerNpcEventSchema),
  latestBrief: directorBriefSchema.optional(),
  directorRun: directorRunSchema.optional(),
})

const actorExpressionDataSchema = z.strictObject({
  version: z.literal(1),
  expression: z.strictObject({
    id: z.string().min(1),
    actorId: actorIdSchema,
    origin: z.literal('actor'),
    text: nonBlankText,
    audience: z.array(nonBlankText),
    delivery: z.enum(['spoken', 'whispered', 'written']),
    tone: nonBlankText.optional(),
    intent: z.enum([
      'sincere', 'question', 'command', 'promise', 'proposal', 'threat', 'comfort', 'lie', 'mislead', 'evade',
    ]).optional(),
  }),
})

const actorActionDataSchema = z.strictObject({
  version: z.literal(1),
  action: z.strictObject({
    id: z.string().min(1),
    actorId: actorIdSchema,
    origin: z.literal('actor'),
    description: nonBlankText,
    target: nonBlankText.optional(),
    purpose: nonBlankText.optional(),
    manner: nonBlankText.optional(),
  }),
})

/** A Director operation violated Story ownership, revision, or field restrictions. */
export class StoryDirectorError extends Error {
  /**
   * @param code - Stable rejection class.
   * @param message - Concrete violated rule.
   * @param options - Optional native error metadata.
   */
  constructor(
    readonly code:
      | 'DIRECTOR_INVALID_BRIEF'
      | 'DIRECTOR_INVALID_SESSION'
      | 'DIRECTOR_RUN_INCOMPLETE'
      | 'DIRECTOR_RUN_TERMINAL'
      | 'DIRECTOR_STALE_ATTEMPT'
      | 'DIRECTOR_STALE_LEDGER'
      | 'DIRECTOR_STALE_RUN'
      | 'DIRECTOR_UNKNOWN_ACTOR',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'StoryDirectorError'
  }
}

/**
 * Create the empty durable state for a new Story.
 * @returns revision-zero Plot Ledger.
 */
export function emptyPlotLedger(): PlotLedger {
  return {
    revision: 0,
    situation: '',
    establishedFacts: [],
    openThreads: [],
    pendingNpcEvents: [],
  }
}

/**
 * Parse untrusted Director fields and reject unknown keys such as dialogue or actions.
 * @param input - caller-supplied planning value.
 * @returns normalized strict Director input.
 */
export function parseDirectorBriefInput(input: unknown): DirectorBriefInput {
  try {
    return directorBriefInputSchema.parse(input)
  } catch (cause: unknown) {
    throw new StoryDirectorError('DIRECTOR_INVALID_BRIEF', 'Director Brief fields are invalid', { cause })
  }
}

/**
 * Commit one normalized Brief over the exact Plot Ledger revision it observed.
 * @param ledger - current durable Plot Ledger.
 * @param directorSessionId - scene or control Session that authored the planning record.
 * @param input - normalized strict Director fields.
 * @returns replacement Plot Ledger with pending NPC events consumed into the Brief.
 */
export function commitDirectorBrief(
  ledger: PlotLedger,
  directorSessionId: SessionId,
  input: DirectorBriefInput,
): PlotLedger {
  if (isIdempotentBriefCommit(ledger, directorSessionId, input)) return ledger
  if (input.expectedLedgerRevision !== ledger.revision) {
    throw new StoryDirectorError(
      'DIRECTOR_STALE_LEDGER',
      `Director expected Plot Ledger revision ${input.expectedLedgerRevision}, current revision is ${ledger.revision}`,
    )
  }
  if (ledger.directorRun !== undefined
    && ledger.directorRun.status !== 'completed'
    && !isUnstartedDirectorRun(ledger.directorRun)) {
    throw new StoryDirectorError(
      'DIRECTOR_RUN_INCOMPLETE',
      `Director Run '${ledger.directorRun.id}' must be completed or resumed before committing another Brief`,
    )
  }
  const actorIds = new Set<string>()
  for (const actorBrief of input.actorBriefs) {
    if (actorIds.has(actorBrief.actorId)) {
      throw new StoryDirectorError(
        'DIRECTOR_INVALID_BRIEF',
        `Director Brief repeats Actor '${actorBrief.actorId}'`,
      )
    }
    actorIds.add(actorBrief.actorId)
  }
  const ledgerRevision = ledger.revision + 1
  const brief: DirectorBrief = {
    sourceLedgerRevision: ledger.revision,
    ledgerRevision,
    directorSessionId,
    sceneSessionId: input.sceneSessionId,
    situation: input.situation,
    establishedFacts: [...input.establishedFacts],
    openThreads: [...input.openThreads],
    actorBriefs: input.actorBriefs.map(copyActorBrief),
    sourceNpcEvents: ledger.pendingNpcEvents.map(copyNpcEvent),
    createdAt: new Date().toISOString(),
  }
  const directorRun = newDirectorRun(brief)
  return plotLedgerSchema.parse({
    revision: ledgerRevision,
    situation: brief.situation,
    establishedFacts: brief.establishedFacts,
    openThreads: brief.openThreads,
    pendingNpcEvents: [],
    latestBrief: brief,
    directorRun,
  })
}

/** An accepted Brief remains correctable until dispatch has made its first durable attempt. */
function isUnstartedDirectorRun(run: DirectorRun): boolean {
  return run.status === 'brief_committed' && run.actors.every(actor =>
    actor.status === 'pending'
    && actor.attempts === 0
    && actor.generation === 0
    && actor.attempt === undefined
    && actor.eventRefs.length === 0
    && actor.failure === undefined)
}

/**
 * Resolve Actors that still need work in the latest durable Director run.
 * Completed Actors are skipped even when a retrying model repeats their ids.
 * @param ledger - Plot Ledger carrying the current Director Run.
 * @param requestedActorIds - Optional Actor subset requested by the caller.
 * @returns pending, failed, or cancelled Actor identities eligible for dispatch.
 */
export function dispatchableDirectorActorIds(
  ledger: PlotLedger,
  requestedActorIds?: readonly string[],
): string[] {
  const run = requireDirectorRun(ledger)
  if (run.status === 'cancelled') {
    throw new StoryDirectorError('DIRECTOR_RUN_TERMINAL', `Director Run '${run.id}' is cancelled`)
  }
  const requested = requestedActorIds === undefined
    ? run.actors.map(actor => actor.actorId)
    : [...requestedActorIds]
  if (new Set(requested).size !== requested.length) {
    throw new StoryDirectorError('DIRECTOR_INVALID_BRIEF', 'Actor dispatch ids must be unique')
  }
  const byId = new Map(run.actors.map(actor => [actor.actorId, actor]))
  for (const actorId of requested) {
    if (!byId.has(actorId)) {
      throw new StoryDirectorError(
        'DIRECTOR_UNKNOWN_ACTOR',
        `Director Run '${run.id}' has no Actor '${actorId}'`,
      )
    }
  }
  return requested.filter((actorId) => {
    const status = byId.get(actorId)?.status
    return status === 'pending' || status === 'failed' || status === 'cancelled'
  })
}

/**
 * Mark selected pending, failed, or cancelled Actors as durably owned by fresh attempts.
 * @param ledger - Plot Ledger carrying the current Director Run.
 * @param expectedRunRevision - Exact current Run revision.
 * @param attempts - Host-minted Actor ownership intervals.
 * @returns the dispatching Ledger, or the same Ledger for an exact idempotent replay.
 */
export function beginDirectorDispatch(
  ledger: PlotLedger,
  expectedRunRevision: number,
  attempts: readonly DirectorActorDispatchAttemptInput[],
): PlotLedger {
  const run = requireDirectorRun(ledger)
  const duplicate = idempotentBegin(run, attempts)
  if (duplicate) return ledger
  requireRunRevision(run, expectedRunRevision)
  if (run.status === 'completed' || run.status === 'cancelled') {
    throw new StoryDirectorError('DIRECTOR_RUN_TERMINAL', `Director Run '${run.id}' is ${run.status}`)
  }
  const actorIds = attempts.map(attempt => attempt.actorId)
  const selected = new Set(dispatchableDirectorActorIds(ledger, actorIds))
  if (selected.size === 0) return ledger
  if (selected.size !== attempts.length) {
    throw new StoryDirectorError('DIRECTOR_INVALID_BRIEF', 'Actor dispatch includes a non-retryable Actor')
  }
  const attemptIds = new Set(attempts.map(attempt => attempt.attemptId))
  if (attemptIds.size !== attempts.length) {
    throw new StoryDirectorError('DIRECTOR_INVALID_BRIEF', 'Actor dispatch attempt ids must be unique')
  }
  const byId = new Map(attempts.map(attempt => [attempt.actorId, attempt]))
  const now = new Date().toISOString()
  return plotLedgerSchema.parse({
    ...ledger,
    directorRun: {
      ...run,
      revision: run.revision + 1,
      status: 'dispatching',
      updatedAt: now,
      actors: run.actors.map((actor): DirectorRunActor => {
        const input = byId.get(actor.actorId)
        if (input === undefined) return actor
        const generation = actor.generation + 1
        return {
          actorId: actor.actorId,
          status: 'running',
          attempts: actor.attempts + 1,
          generation,
          attempt: {
            attemptId: input.attemptId,
            generation,
            actorSessionId: input.actorSessionId,
            afterEventSeq: input.afterEventSeq,
            startedAt: now,
          },
          eventRefs: actor.eventRefs,
        }
      }),
    },
  })
}

/**
 * Settle one dispatch attempt while retaining accepted event refs for safe retries.
 * @param ledger - Plot Ledger carrying the owned attempts.
 * @param outcomes - Per-Actor results naming exact attempt ownership.
 * @returns the settled Ledger, or the same Ledger for an exact idempotent replay.
 */
export function settleDirectorDispatch(
  ledger: PlotLedger,
  outcomes: readonly DirectorActorDispatchOutcome[],
): PlotLedger {
  const run = requireDirectorRun(ledger)
  const byId = new Map(outcomes.map(outcome => [outcome.actorId, outcome]))
  if (byId.size !== outcomes.length) {
    throw new StoryDirectorError('DIRECTOR_INVALID_BRIEF', 'Actor dispatch outcomes must be unique')
  }
  for (const actorId of byId.keys()) {
    if (!run.actors.some(actor => actor.actorId === actorId)) {
      throw new StoryDirectorError(
        'DIRECTOR_UNKNOWN_ACTOR',
        `Director Run '${run.id}' has no Actor outcome '${actorId}'`,
      )
    }
  }
  const actors = run.actors.map((actor): DirectorRunActor => {
    const outcome = byId.get(actor.actorId)
    if (outcome === undefined) return actor
    if (!ownsOutcome(actor, outcome)) {
      throw new StoryDirectorError(
        'DIRECTOR_STALE_ATTEMPT',
        `Actor '${actor.actorId}' attempt '${outcome.attemptId}' generation ${outcome.generation} does not own its current checkpoint`,
      )
    }
    if (actor.status !== 'running') {
      if (isIdempotentOutcome(actor, outcome)) return actor
      throw new StoryDirectorError(
        'DIRECTOR_INVALID_BRIEF',
        `Actor '${actor.actorId}' has outcome status '${actor.status}' instead of 'running'`,
      )
    }
    const eventRefs = [...new Set([...actor.eventRefs, ...outcome.eventRefs])]
    if (outcome.status === 'completed') {
      return { ...actor, status: 'completed', eventRefs, failure: undefined }
    }
    return {
      ...actor,
      status: 'failed',
      eventRefs,
      failure: outcome.failure ?? { code: 'UNKNOWN', message: 'Actor dispatch failed' },
    }
  })
  const changed = outcomes.some(outcome =>
    run.actors.some(actor => actor.actorId === outcome.actorId && actor.status === 'running'))
  if (!changed) return ledger
  return plotLedgerSchema.parse({
    ...ledger,
    directorRun: {
      ...run,
      revision: run.revision + 1,
      status: deriveRunStatus(actors),
      actors,
      updatedAt: new Date().toISOString(),
    },
  })
}

/**
 * Requeue one completed Actor when an active discussion grants that Actor a new floor.
 * Prior event references remain attached to the Run so subsequent attempts can react
 * to established dialogue without replaying it.
 * @param ledger - Plot Ledger carrying the current Run.
 * @param expectedRunRevision - Exact current Run revision.
 * @param actorId - Completed Actor receiving another discussion turn.
 * @returns the resumable Ledger with that Actor pending again.
 */
export function requeueCompletedDirectorRunActor(
  ledger: PlotLedger,
  expectedRunRevision: number,
  actorId: string,
): PlotLedger {
  const run = requireDirectorRun(ledger)
  requireRunRevision(run, expectedRunRevision)
  const actor = requireRunActor(run, actorId)
  if (actor.status !== 'completed') {
    throw new StoryDirectorError(
      'DIRECTOR_RUN_INCOMPLETE',
      `Actor '${actorId}' cannot be requeued from status '${actor.status}'`,
    )
  }
  const actors = run.actors.map(item => item.actorId === actorId
    ? { ...item, status: 'pending' as const, failure: undefined }
    : item)
  return controlledRun(ledger, run, deriveRunStatus(actors), actors)
}

/**
 * Pause one resumable Run and cancel its currently owned Actor attempts.
 * @param ledger - Plot Ledger carrying the current Run.
 * @param expectedRunRevision - Exact current Run revision.
 * @returns the paused Ledger checkpoint.
 */
export function pauseDirectorRun(ledger: PlotLedger, expectedRunRevision: number): PlotLedger {
  const run = requireDirectorRun(ledger)
  if (run.status === 'paused') return ledger
  requireControllableRun(run, expectedRunRevision)
  const actors = run.actors.map(actor => actor.status === 'running'
    ? cancelledActor(actor, 'RUN_PAUSED', 'Director Run was paused')
    : actor)
  return controlledRun(ledger, run, 'paused', actors)
}

/**
 * Cancel one Run terminally while retaining completed and skipped Actor evidence.
 * @param ledger - Plot Ledger carrying the current Run.
 * @param expectedRunRevision - Exact current Run revision.
 * @returns the terminally cancelled Ledger checkpoint.
 */
export function cancelDirectorRun(ledger: PlotLedger, expectedRunRevision: number): PlotLedger {
  const run = requireDirectorRun(ledger)
  if (run.status === 'cancelled') return ledger
  requireControllableRun(run, expectedRunRevision)
  const actors = run.actors.map(actor => actor.status === 'completed' || actor.status === 'skipped'
    ? actor
    : cancelledActor(actor, 'RUN_CANCELLED', 'Director Run was cancelled'))
  return controlledRun(ledger, run, 'cancelled', actors)
}

/**
 * Skip one incomplete Actor and allow the remaining Run checkpoint to advance.
 * @param ledger - Plot Ledger carrying the current Run.
 * @param expectedRunRevision - Exact current Run revision.
 * @param actorId - Incomplete Actor to skip.
 * @returns the Ledger with the Actor marked skipped.
 */
export function skipDirectorRunActor(
  ledger: PlotLedger,
  expectedRunRevision: number,
  actorId: string,
): PlotLedger {
  const run = requireDirectorRun(ledger)
  const actor = requireRunActor(run, actorId)
  if (actor.status === 'skipped') return ledger
  requireControllableRun(run, expectedRunRevision)
  if (actor.status === 'completed') {
    throw new StoryDirectorError('DIRECTOR_RUN_TERMINAL', `Actor '${actorId}' is already completed`)
  }
  const actors = run.actors.map(item => item.actorId === actorId
    ? { ...item, status: 'skipped' as const, failure: undefined }
    : item)
  return controlledRun(ledger, run, deriveRunStatus(actors), actors)
}

/**
 * Cancel one currently running Actor attempt without cancelling the resumable Run.
 * @param ledger - Plot Ledger carrying the current Run.
 * @param expectedRunRevision - Exact current Run revision.
 * @param actorId - Running Actor whose ownership closes.
 * @returns the Ledger with a resumable cancelled Actor checkpoint.
 */
export function cancelDirectorRunActor(
  ledger: PlotLedger,
  expectedRunRevision: number,
  actorId: string,
): PlotLedger {
  const run = requireDirectorRun(ledger)
  const actor = requireRunActor(run, actorId)
  if (actor.status === 'cancelled') return ledger
  requireControllableRun(run, expectedRunRevision)
  if (actor.status !== 'running') {
    throw new StoryDirectorError(
      'DIRECTOR_INVALID_BRIEF',
      `Actor '${actorId}' has status '${actor.status}' instead of 'running'`,
    )
  }
  const actors = run.actors.map(item => item.actorId === actorId
    ? cancelledActor(item, 'ACTOR_CANCELLED', 'Actor attempt was cancelled')
    : item)
  return controlledRun(ledger, run, deriveRunStatus(actors), actors)
}

/**
 * Return whether one event can carry NPC world-facing behavior.
 * @param event - committed Session event to classify.
 * @returns whether the event is an Actor expression or action intent.
 */
export function isNpcBehaviorEvent(event: SessionEventEnvelope): event is NpcBehaviorSessionEvent {
  const type = event.type
  return type === 'actor/expression' || type === 'actor/action-intent'
}

/**
 * Locate the optional outward behavior in an atomic NPC commit.
 * @param event - durable Actor event or complete commit envelope.
 * @returns one behavior correlated to the physical commit position.
 */
export function npcBehaviorsFromCommit(event: SessionEventEnvelope): readonly NpcBehaviorSessionEvent[] {
  if (isNpcBehaviorEvent(event)) return [event]
  if (event.type !== 'actor/commit') return []
  const commit = z.strictObject({ version: z.literal(1),
    operations: z.array(z.strictObject({ type: z.string(),
      data: z.unknown() })) }).parse(event.data)
  return commit.operations.flatMap((operation, operationIndex) => {
    const candidate = { ...operation, seq: event.seq, operationIndex }
    return isNpcBehaviorEvent(candidate) ? [candidate] : []
  })
}

/**
 * Reference the exact outward operation within its physical Session event.
 * @param event - accepted NPC behavior.
 * @returns a stable source reference used by settlement, context, and checkpoints.
 */
export function npcEventRef(event: Pick<PlotLedgerNpcEvent, 'sessionId' | 'actorEventSeq' | 'operationIndex'>): string {
  return `${event.sessionId}:${event.actorEventSeq}${event.operationIndex === undefined ? '' : `#${event.operationIndex}`}`
}

/**
 * Admit one actor-origin event only when an open matching NPC tool call precedes it in the same step.
 * @param sessionId - registered private Actor Session.
 * @param actorId - Actor identity registered by the Story.
 * @param events - authoritative Session event stream containing the candidate.
 * @param event - exact committed Actor event.
 * @param ledgerRevision - revision assigned if the event is accepted.
 * @returns detached Plot Ledger event, or undefined for player-origin or non-tool behavior.
 */
export function npcEventFromActorTool(
  sessionId: SessionId,
  actorId: string,
  events: readonly SessionEvent[],
  event: NpcBehaviorSessionEvent,
  ledgerRevision: number,
): PlotLedgerNpcEvent | undefined {
  const type = event.type
  if (type === 'actor/expression') {
    if (recordAt(event.data, 'expression', 'origin') !== 'actor') return undefined
    const parsed = actorExpressionDataSchema.parse(event.data)
    if (parsed.expression.actorId !== actorId) {
      throw new StoryDirectorError(
        'DIRECTOR_UNKNOWN_ACTOR',
        `Actor event '${parsed.expression.actorId}' does not match Story registration '${actorId}'`,
      )
    }
    const toolCallEventSeq = openToolCallSeq(events, event.seq, ['npc_speak', 'npc_commit_turn'])
    if (toolCallEventSeq === undefined) return undefined
    return plotLedgerNpcEventSchema.parse({
      kind: 'speech',
      ledgerRevision,
      actorId,
      sessionId,
      actorEventSeq: event.seq,
      ...(event.operationIndex === undefined ? {} : { operationIndex: event.operationIndex }),
      toolCallEventSeq,
      text: parsed.expression.text,
      audience: parsed.expression.audience,
      delivery: parsed.expression.delivery,
    })
  }
  if (recordAt(event.data, 'action', 'origin') !== 'actor') return undefined
  const parsed = actorActionDataSchema.parse(event.data)
  if (parsed.action.actorId !== actorId) {
    throw new StoryDirectorError(
      'DIRECTOR_UNKNOWN_ACTOR',
      `Actor event '${parsed.action.actorId}' does not match Story registration '${actorId}'`,
    )
  }
  const toolCallEventSeq = openToolCallSeq(events, event.seq, ['npc_act', 'npc_commit_turn'])
  if (toolCallEventSeq === undefined) return undefined
  return plotLedgerNpcEventSchema.parse({
    kind: 'action-intent',
    ledgerRevision,
    actorId,
    sessionId,
    actorEventSeq: event.seq,
    ...(event.operationIndex === undefined ? {} : { operationIndex: event.operationIndex }),
    toolCallEventSeq,
    description: parsed.action.description,
    ...(parsed.action.target === undefined ? {} : { target: parsed.action.target }),
  })
}

function newDirectorRun(brief: DirectorBrief): DirectorRun {
  const now = brief.createdAt
  const actors = brief.actorBriefs.map((actor): DirectorRunActor => ({
    actorId: actor.actorId,
    status: 'pending',
    attempts: 0,
    generation: 0,
    eventRefs: [],
  }))
  return directorRunSchema.parse({
    id: `run:${brief.sceneSessionId}:${String(brief.ledgerRevision)}`,
    revision: 0,
    briefLedgerRevision: brief.ledgerRevision,
    directorSessionId: brief.directorSessionId,
    sceneSessionId: brief.sceneSessionId,
    status: actors.length === 0 ? 'completed' : 'brief_committed',
    actors,
    createdAt: now,
    updatedAt: now,
  })
}

function idempotentBegin(run: DirectorRun, attempts: readonly DirectorActorDispatchAttemptInput[]): boolean {
  return attempts.length > 0 && attempts.every((input) => {
    const actor = run.actors.find(item => item.actorId === input.actorId)
    return actor?.status === 'running'
      && actor.attempt?.attemptId === input.attemptId
      && actor.attempt.actorSessionId === input.actorSessionId
      && actor.attempt.afterEventSeq === input.afterEventSeq
  })
}

function ownsOutcome(actor: DirectorRunActor, outcome: DirectorActorDispatchOutcome): boolean {
  return actor.attempt?.attemptId === outcome.attemptId
    && actor.attempt.generation === outcome.generation
    && actor.generation === outcome.generation
}

function isIdempotentOutcome(actor: DirectorRunActor, outcome: DirectorActorDispatchOutcome): boolean {
  if (outcome.status === 'completed' && actor.status !== 'completed') return false
  if (outcome.status === 'failed' && actor.status !== 'failed') return false
  const accepted = new Set(actor.eventRefs)
  if (!outcome.eventRefs.every(ref => accepted.has(ref))) return false
  if (outcome.status === 'completed') return true
  const failure = outcome.failure ?? { code: 'UNKNOWN', message: 'Actor dispatch failed' }
  return actor.failure?.code === failure.code && actor.failure.message === failure.message
}

function requireRunRevision(run: DirectorRun, expected: number): void {
  if (run.revision === expected) return
  throw new StoryDirectorError(
    'DIRECTOR_STALE_RUN',
    `Director Run '${run.id}' expected revision ${expected}, current revision is ${run.revision}`,
  )
}

function requireControllableRun(run: DirectorRun, expectedRunRevision: number): void {
  requireRunRevision(run, expectedRunRevision)
  if (run.status === 'completed' || run.status === 'cancelled') {
    throw new StoryDirectorError('DIRECTOR_RUN_TERMINAL', `Director Run '${run.id}' is ${run.status}`)
  }
}

function requireRunActor(run: DirectorRun, actorId: string): DirectorRunActor {
  const actor = run.actors.find(item => item.actorId === actorId)
  if (actor !== undefined) return actor
  throw new StoryDirectorError(
    'DIRECTOR_UNKNOWN_ACTOR',
    `Director Run '${run.id}' has no Actor '${actorId}'`,
  )
}

function cancelledActor(actor: DirectorRunActor, code: string, message: string): DirectorRunActor {
  return { ...actor, status: 'cancelled', failure: { code, message } }
}

function deriveRunStatus(actors: readonly DirectorRunActor[]): DirectorRun['status'] {
  if (actors.every(actor => actor.status === 'completed' || actor.status === 'skipped')) return 'completed'
  if (actors.some(actor => actor.status === 'running')) return 'dispatching'
  if (actors.some(actor => actor.status === 'failed' || actor.status === 'cancelled')) return 'awaiting_retry'
  return 'brief_committed'
}

function controlledRun(
  ledger: PlotLedger,
  run: DirectorRun,
  status: DirectorRun['status'],
  actors: readonly DirectorRunActor[],
): PlotLedger {
  const accepted = new Set(actors.flatMap(actor => actor.eventRefs))
  const stoppedAttempts = run.actors.flatMap((before) => {
    const after = actors.find(actor => actor.actorId === before.actorId)
    return before.status === 'running' && after?.status !== 'running' && before.attempt !== undefined
      ? [before.attempt]
      : []
  })
  const pendingNpcEvents = ledger.pendingNpcEvents.filter((event) => {
    const ref = npcEventRef(event)
    if (accepted.has(ref)) return true
    return !stoppedAttempts.some(attempt => attempt.actorSessionId === event.sessionId
      && event.actorEventSeq > attempt.afterEventSeq)
  })
  return plotLedgerSchema.parse({
    ...ledger,
    pendingNpcEvents,
    directorRun: {
      ...run,
      revision: run.revision + 1,
      status,
      actors,
      updatedAt: new Date().toISOString(),
    },
  })
}

function requireDirectorRun(ledger: PlotLedger): DirectorRun {
  if (ledger.directorRun === undefined || ledger.latestBrief === undefined) {
    throw new StoryDirectorError('DIRECTOR_INVALID_BRIEF', 'Actor dispatch requires a current Director Run')
  }
  if (ledger.directorRun.briefLedgerRevision !== ledger.latestBrief.ledgerRevision) {
    throw new StoryDirectorError('DIRECTOR_INVALID_BRIEF', 'Director Run does not match the latest Brief')
  }
  return ledger.directorRun
}

function isIdempotentBriefCommit(
  ledger: PlotLedger,
  directorSessionId: SessionId,
  input: DirectorBriefInput,
): boolean {
  const brief = ledger.latestBrief
  if (brief === undefined || ledger.pendingNpcEvents.length > 0) return false
  if (brief.sourceLedgerRevision !== input.expectedLedgerRevision
    || brief.directorSessionId !== directorSessionId
    || brief.sceneSessionId !== input.sceneSessionId
    || brief.situation !== input.situation) return false
  return JSON.stringify({
    establishedFacts: brief.establishedFacts,
    openThreads: brief.openThreads,
    actorBriefs: brief.actorBriefs,
  }) === JSON.stringify({
    establishedFacts: input.establishedFacts,
    openThreads: input.openThreads,
    actorBriefs: input.actorBriefs,
  })
}

function copyActorBrief(brief: DirectorActorBrief): DirectorActorBrief {
  return {
    actorId: brief.actorId,
    perceptions: [...brief.perceptions],
    uncertainties: [...brief.uncertainties],
  }
}

function copyNpcEvent(event: PlotLedgerNpcEvent): PlotLedgerNpcEvent {
  return event.kind === 'speech'
    ? { ...event, audience: [...event.audience] }
    : { ...event }
}

function recordAt(value: unknown, first: string, second: string): unknown {
  if (value === null || typeof value !== 'object') return undefined
  const nested = Reflect.get(value, first) as unknown
  return nested === null || typeof nested !== 'object' ? undefined : Reflect.get(nested, second)
}

function openToolCallSeq(
  events: readonly SessionEvent[],
  beforeSeq: number,
  expectedNames: readonly string[],
): number | undefined {
  const completed = new Set<string>()
  for (let index = beforeSeq - 1; index >= 0; index--) {
    const candidate = events[index]
    if (candidate === undefined) continue
    if (candidate.type === 'step/start') break
    if (candidate.type === 'tool/result') {
      completed.add(String(candidate.data.message.source.callId))
      continue
    }
    if (candidate.type !== 'tool/call') continue
    const callId = String(candidate.data.callId)
    if (completed.delete(callId)) continue
    if (expectedNames.includes(candidate.data.name)) return candidate.seq
  }
  return undefined
}
