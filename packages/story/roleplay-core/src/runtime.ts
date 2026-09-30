import type { MemoryScheduler } from './memory-queue.ts'
/** Model execution is an application port; no database transaction spans an await. */
import { NarrativeCommands } from './commands.ts'
import { CognitionApplication } from './cognition.ts'
import { PerspectiveQueries, type ActorContextView } from './perspective.ts'
import { executionSchema, json, personOf, replace, invalidateExecutions } from './world.ts'
import { canonical, entity, RoleplayError } from './records.ts'
import type { NpcTurnInput } from './npc-turn.ts'
import type { CommandId, CommandScope, NarrativeCommit, RuntimeValues } from './types.ts'
import type { NarrativeRecallView } from './types.ts'
import type { NarrativeRecallInput } from './command-inputs.ts'
import { currentDiscussion } from './discussions.ts'
import { playerActor } from './player-control.ts'
import { narrativeOriginals, retentionOf } from './retention-records.ts'
import { perceivedEvidenceFor, comparePerceivedEvents } from './perceived-evidence.ts'
import { consolidationSourceAliases, resolveContextUpdate } from './context-retention.ts'
import { consolidationBackground } from './consolidation-context.ts'
import { renderConsolidationSources, consolidationWindow, consolidationPendingAttempts } from './consolidation-sources.ts'
import { pendingWorldAttempts } from './world-attempts.ts'
import { z } from 'zod'

/** Only sibling preparation commits can advance this shared revision fence. */
interface PreparationBatch { revision: number; readonly contextRevision: number }
/** One player-authored scene focus granted to actors during this director advance only. */
export interface ActorFacingBeat { readonly text: string; readonly source: string }

/** A Harness provider owns sessions, stream events, tools, cancellation, and request evidence. */
export interface ActorExecutor {
  execute(request: { readonly attempt: string; readonly context: ActorContextView }, signal: AbortSignal,
    submit: (input: NpcTurnInput) => NarrativeCommit,
    recall: (input: NarrativeRecallInput) => NarrativeRecallView): Promise<void>
}
/** Runtime application opens and invalidates durable attempts; callbacks receive narrow values. */
export class ActorRuntime {
  private readonly running = new Map<string, { commandId: CommandId; fingerprint: string; instanceId: CommandScope['instanceId']; epoch: number; controller: AbortController; done: Promise<NarrativeCommit> }>()
  constructor(private readonly commands: NarrativeCommands, private readonly cognition: CognitionApplication,
    private readonly queries: PerspectiveQueries, private readonly executor: ActorExecutor, private readonly values: RuntimeValues,
    private readonly consolidationThreshold = 0, private readonly consolidationBatchLimit = 1, private readonly memory?: MemoryScheduler) {
    if (!Number.isSafeInteger(consolidationThreshold) || consolidationThreshold < 0) throw new RoleplayError('invalid', 'Consolidation threshold must be nonnegative')
    if (!Number.isSafeInteger(consolidationBatchLimit) || consolidationBatchLimit < 1) throw new RoleplayError('invalid', 'Consolidation batch limit must be positive')
  }

  isRunning(instanceId: CommandScope['instanceId']): boolean { return [...this.running.values()].some(item => item.instanceId === instanceId) }

  run(scope: CommandScope, actorId: string, actorFacingBeat?: ActorFacingBeat): Promise<NarrativeCommit> {
    return this.start(scope, actorId, undefined, undefined, actorFacingBeat)
  }

  /** Consolidate each AI participant's unprocessed evidence at discussion closure.
   * @param scope - Current host-authorized discussion revision.
   * @returns Completion after all eligible private executions settle.
   */
  async consolidateDiscussion(scope: CommandScope): Promise<void> {
    if (this.consolidationThreshold === 0) return
    const initial = this.commands.snapshot(scope.instanceId)
    const discussion = currentDiscussion(initial)
    if (initial.instance.revision !== scope.expectedRevision || discussion?.status !== 'summarizing') {
      throw new RoleplayError('conflict', 'Discussion is not ready for memory consolidation')
    }
    if (this.memory !== undefined) {
      for (const actorId of discussion.participantIds) this.memory.enqueue(scope.instanceId, `actor:${actorId}`, true)
      return
    }
    const turnRevisions = new Set(discussion.turns.flatMap((turn) => {
      const receipt = turn.sourceEventRef === undefined ? undefined
        : this.commands.receipt(scope.instanceId, turn.sourceEventRef as CommandId)
      return receipt === undefined ? [] : [receipt.revision]
    }))
    for (const actorId of discussion.participantIds) {
      for (let batch = 0; batch < this.consolidationBatchLimit; batch++) {
        const snapshot = this.commands.snapshot(scope.instanceId)
        if (snapshot.instance.epoch !== initial.instance.epoch || currentDiscussion(snapshot)?.id !== discussion.id
          || currentDiscussion(snapshot)?.status !== 'summarizing') throw new RoleplayError('stale-execution', 'Discussion consolidation was interrupted')
        if (playerActor(snapshot) === actorId || !personOf(snapshot, actorId).definition.capabilities.includes('memory')) break
        // Discussion and director entry points share successful batch slots within this epoch.
        const key = `discussion-memory:${JSON.stringify([discussion.id, initial.instance.epoch, actorId, batch])}`
        let retry = 0
        let completed = false
        while (true) {
          const opened = this.commands.receipt(scope.instanceId, `${key}:${retry}` as CommandId)
          if (opened === undefined) break
          const prior = executionSchema.parse(opened.result)
          if (this.commands.receipt(scope.instanceId, `turn:${prior.attempt}` as CommandId) !== undefined) {
            completed = true
            break
          }
          const live = executionSchema.safeParse(entity(snapshot, { collection: 'execution', id: actorId }))
          if (live.success && live.data.attempt === prior.attempt && live.data.status === 'running') {
            throw new RoleplayError('conflict', 'Discussion memory batch is already running')
          }
          retry++
        }
        if (completed) continue
        const covered = new Set(retentionOf(snapshot, `actor:${actorId}`).proposals.flatMap(item => item.unit.sourceIds))
        const perceived = perceivedEvidenceFor(snapshot, actorId)
        const exchangeIds = new Set(perceived.filter(item => turnRevisions.has(item.revision)).map(item => item.id))
        const evidence = perceived.filter(item => !covered.has(item.id))
        const inExchange = (item: (typeof evidence)[number]) => exchangeIds.has(item.id)
          || item.respondsTo?.some(id => exchangeIds.has(id)) === true
        if (!evidence.some(inExchange) && evidence.length < this.consolidationThreshold) break
        const sources = evidence.sort((left, right) =>
          Number(inExchange(right)) - Number(inExchange(left)) || comparePerceivedEvents(left, right))
          .slice(0, this.consolidationThreshold).map(item => item.id)
        if (sources.length === 0) break
        await this.start({ ...scope, id: `${key}:${retry}` as CommandId,
          expectedRevision: snapshot.instance.revision }, actorId, undefined, sources)
      }
    }
  }

  private async consolidateAfter(scope: CommandScope, actorId: string, accepted: NarrativeCommit,
    signal: AbortSignal): Promise<NarrativeCommit> {
    if (this.consolidationThreshold === 0) return accepted
    if (this.memory !== undefined) {
      const current = this.commands.snapshot(scope.instanceId)
      if (current.instance.revision === accepted.revision && currentDiscussion(current) === undefined) this.memory.enqueue(scope.instanceId, `actor:${actorId}`)
      return accepted
    }
    const childId = `${scope.id}:consolidate` as CommandId
    const opened = this.commands.receipt(scope.instanceId, childId)
    if (opened !== undefined) {
      const execution = executionSchema.parse(opened.result)
      return this.perform({ ...scope, id: childId, expectedRevision: opened.command.expectedRevision },
        actorId, signal, undefined, execution.consolidationSources)
    }
    const snapshot = this.commands.snapshot(scope.instanceId)
    if (snapshot.instance.revision !== accepted.revision || currentDiscussion(snapshot) !== undefined
      || !personOf(snapshot, actorId).definition.capabilities.includes('memory')) return accepted
    const covered = new Set(retentionOf(snapshot, `actor:${actorId}`).proposals.flatMap(item => item.unit.sourceIds))
    const sources = perceivedEvidenceFor(snapshot, actorId).filter(item => !covered.has(item.id)).sort(comparePerceivedEvents)
      .slice(0, this.consolidationThreshold).map(item => item.id)
    if (sources.length < this.consolidationThreshold) return accepted
    signal.throwIfAborted()
    return this.perform({ ...scope, id: childId, expectedRevision: accepted.revision }, actorId, signal, undefined, sources)
  }

  /** Run private preparation concurrently against frozen inputs; public turns use run.
   * @param scope - reviewed discussion scope and cancellation epoch.
   * @param actorIds - distinct pending preparation participants.
   * @returns accepted private turns after every owned execution has settled.
   */
  async prepareDiscussion(scope: CommandScope, actorIds: readonly string[]): Promise<readonly NarrativeCommit[]> {
    const snapshot = this.commands.snapshot(scope.instanceId)
    const discussion = currentDiscussion(snapshot)
    if (snapshot.instance.revision !== scope.expectedRevision || discussion?.status !== 'active'
      || actorIds.length === 0 || new Set(actorIds).size !== actorIds.length
      || actorIds.some(id => !discussion.preparationPendingIds?.includes(id))) {
      throw new RoleplayError('conflict', 'Discussion preparation no longer matches the reviewed participants')
    }
    const batch: PreparationBatch = { revision: scope.expectedRevision, contextRevision: scope.expectedRevision }
    const scopes = actorIds.map((actorId, index) => ({ actorId, id: `${scope.id}:prepare:${index}` as CommandId }))
    let firstFailure: { error: unknown } | undefined
    const results = await Promise.allSettled(scopes.map(({ actorId, id }) => this.start({ ...scope, id,
      expectedRevision: batch.revision }, actorId, batch).catch((error: unknown) => {
      firstFailure ??= { error }
      for (const owned of scopes) {
        const running = this.running.get(JSON.stringify([scope.instanceId, owned.actorId]))
        if (running?.commandId === owned.id) running.controller.abort('Discussion preparation failed')
      }
      throw error
    })))
    if (firstFailure !== undefined) throw firstFailure.error
    return results.map((result) => { if (result.status === 'rejected') throw result.reason; return result.value })
  }

  private start(scope: CommandScope, actorId: string, batch?: PreparationBatch,
    consolidationSources?: readonly string[], actorFacingBeat?: ActorFacingBeat): Promise<NarrativeCommit> {
    const key = JSON.stringify([scope.instanceId, actorId])
    const fingerprint = canonical({ scope, actorId, ...(batch === undefined ? {} : { contextRevision: batch.contextRevision }),
      ...(consolidationSources === undefined ? {} : { consolidationSources }),
      ...(actorFacingBeat === undefined ? {} : { actorFacingBeat }) })
    const running = this.running.get(key)
    if (running !== undefined) {
      if (running.commandId !== scope.id) return Promise.reject(new RoleplayError('conflict', 'Character execution is already running'))
      if (running.fingerprint !== fingerprint) return Promise.reject(new RoleplayError('duplicate-command', 'Running command identity was reused'))
      return running.done
    }
    const epoch = this.commands.snapshot(scope.instanceId).instance.epoch
    const controller = new AbortController()
    const done = this.perform(scope, actorId, controller.signal, batch, consolidationSources, actorFacingBeat)
      .then(accepted => batch === undefined && consolidationSources === undefined
        ? this.consolidateAfter(scope, actorId, accepted, controller.signal) : accepted)
      .finally(() => { this.running.delete(key) })
    this.running.set(key, { commandId: scope.id, fingerprint, instanceId: scope.instanceId, epoch, controller, done })
    return done
  }

  cancel(scope: CommandScope, reason: string): NarrativeCommit {
    const commit = this.commands.execute({ ...scope, kind: 'execution.cancel', input: { reason } }, (snapshot) => {
      if (scope.principal.kind !== 'player' && scope.principal.kind !== 'director') throw new RoleplayError('invalid', 'Actor cannot cancel a story run')
      return { events: invalidateExecutions(snapshot, reason), result: null }
    })
    const epoch = this.commands.replay(scope.instanceId, commit.revision).instance.epoch
    for (const operation of this.running.values()) {
      if (operation.instanceId === scope.instanceId && operation.epoch < epoch) operation.controller.abort(reason)
    }
    return commit
  }

  /** Stop only technical work after another application has already invalidated its narrative epoch. */
  async abort(instanceId: CommandScope['instanceId'], beforeEpoch: number, reason: string): Promise<void> {
    const operations = [...this.running.values()].filter(item => item.instanceId === instanceId && item.epoch < beforeEpoch)
    for (const operation of operations) operation.controller.abort(reason)
    await Promise.allSettled(operations.map(operation => operation.done))
  }

  /** Disposal waits for owned executions to settle after asking their adapters to cancel. */
  async dispose(): Promise<void> {
    const operations = [...this.running.values()]
    for (const operation of operations) operation.controller.abort('Runtime disposed')
    await Promise.allSettled(operations.map(operation => operation.done))
  }

  private async perform(scope: CommandScope, actorId: string, signal: AbortSignal, batch?: PreparationBatch,
    consolidationSources?: readonly string[], actorFacingBeat?: ActorFacingBeat): Promise<NarrativeCommit> {
    const opened = this.commands.execute({ ...scope, kind: 'execution.open', input: json({ actorId,
      ...(consolidationSources === undefined ? {} : { consolidationSources }),
      ...(actorFacingBeat === undefined ? {} : { actorFacingBeat }) }) }, (snapshot) => {
      if (scope.principal.kind !== 'player' && scope.principal.kind !== 'director') throw new RoleplayError('invalid', 'Only the host may start character execution')
      personOf(snapshot, actorId)
      if (playerActor(snapshot) === actorId) throw new RoleplayError('invalid', 'This character is controlled by the player')
      const prior = entity(snapshot, { collection: 'execution', id: actorId })
      if (prior !== undefined) {
        const execution = executionSchema.parse(prior)
        if (execution.status === 'running' && execution.epoch === snapshot.instance.epoch) throw new RoleplayError('conflict', 'Character already has an active attempt')
      }
      const execution = { actorId, attempt: this.values.id(), epoch: snapshot.instance.epoch, status: 'running',
        ...(consolidationSources === undefined ? {} : { consolidationSources }) }
      const discussion = currentDiscussion(snapshot)
      return { events: [replace('execution', actorId, execution),
        ...(discussion?.preparationPendingIds?.includes(actorId) ? [replace('discussion-preparation', `${discussion.id}:${actorId}`, {
          discussionId: discussion.id, actorId, attempt: execution.attempt, revision: snapshot.instance.revision + 1,
        })] : []),
      ], result: json(execution) }
    })
    if (batch !== undefined) batch.revision = opened.revision
    const attempt = executionSchema.parse(opened.result)
    const recordedBeat = z.object({ actorFacingBeat: z.object({ text: z.string(), source: z.string() }).optional() })
      .parse(opened.command.input).actorFacingBeat
    const commandId = `turn:${attempt.attempt}` as CommandId
    const accepted = this.commands.receipt(scope.instanceId, commandId)
    if (accepted !== undefined) return accepted
    const current = this.commands.snapshot(scope.instanceId)
    const live = executionSchema.parse(entity(current, { collection: 'execution', id: actorId }))
    if (live.attempt !== attempt.attempt || live.status !== 'running' || current.instance.epoch !== attempt.epoch) {
      throw new RoleplayError('stale-execution', 'Character execution is no longer current')
    }
    try {
      const contextRevision = batch?.contextRevision ?? opened.revision
      const sourceAliases = consolidationSourceAliases(attempt.consolidationSources ?? [])
      let context = this.queries.actorContext({ instanceId: scope.instanceId, actorId, revision: contextRevision, query: '' })
      if (recordedBeat !== undefined && attempt.consolidationSources === undefined) {
        const content = `[CURRENT PLAYER BEAT — author-side scene focus, not your lived knowledge or a required choice]\n${recordedBeat.text}`
        context = { ...context, sections: [...context.sections,
          { id: 'player-beat', role: 'user', content, sources: [recordedBeat.source] }],
        text: `${context.text}\n\n${content}`, sources: [...context.sources, recordedBeat.source] }
      }
      if (attempt.consolidationSources !== undefined) {
        const selected = new Set(attempt.consolidationSources)
        const frozen = this.commands.replay(scope.instanceId, contextRevision)
        const available = narrativeOriginals(frozen, `actor:${actorId}`)
        const received = new Set(perceivedEvidenceFor(frozen, actorId).map(item => item.id))
        const originals = available
          .filter(item => selected.has(item.id)).map(item => ({ ...item,
            sourceRef: Object.entries(sourceAliases).find(([, id]) => id === item.id)?.[0] }))
        const pending = consolidationPendingAttempts(originals, pendingWorldAttempts(frozen).filter(item => item.actorId === actorId))
        const content = `[PRIVATE MEMORY CONSOLIDATION]\nThis execution does not advance the story. Submit only posture=silent and context_update. Cover every listed source once across units. Group related sources into an experience rather than making a note for every sentence. Keep text as a concise current understanding; put useful experience, interpretation, personal effects and unresolved matters in episode details without reproducing the transcript. Keep assigned experiences distinct from later evidence; surrounding context may inform your interpretation but must not be substituted for cited events. Do not publish behavior, change goals or beliefs, or invent hidden facts. Preserve deadlines relative to the originating event: write the morning after that meeting rather than an unanchored tomorrow. Distinguish an agreed plan from a completed action and retain uncertainty when the sources do not establish timing or completion. Do not invent calendar dates. When summarizing an older event, describe uncertainty at that time as past uncertainty; do not present an already observed outcome as still pending. Keep unresolved for questions that remain open in the supplied perspective. Before preserving an earlier question as still open, use recall when its current status is unclear. If a later admitted original resolves it, cite that original in the note change sourceIds as supporting evidence, while keeping unit.sourceIds limited to this batch. Do not claim the earlier batch alone proves the later result. Original details remain retrievable. Use each listed sourceRef (for example $source:1) in sourceIds for both units and note changes; these short references apply only to this consolidation. Use the original id for recall.\n${renderConsolidationSources(originals, pending.flatMap(section => section.sources))}`
        const sections = [...consolidationBackground(context.sections),
          { id: 'consolidation', role: 'user' as const, content, sources: [...selected] },
          ...pending,
          ...consolidationWindow(originals, available.filter(item => received.has(item.id)))]
        context = { ...context, sections, text: sections.map(section => section.content).join('\n\n'),
          sources: sections.flatMap(section => section.sources) }
      }
      let receipt: NarrativeCommit | undefined
      await this.executor.execute({ attempt: attempt.attempt, context }, signal, (input) => {
        if (signal.aborted) throw new RoleplayError('stale-execution', 'Character execution was cancelled')
        const resolved = attempt.consolidationSources === undefined || input.context_update === undefined ? input
          : { ...input, context_update: resolveContextUpdate(input.context_update, sourceAliases) }
        receipt = this.cognition.submitTurn({ instanceId: scope.instanceId, id: commandId,
          expectedRevision: batch?.revision ?? opened.revision,
          principal: { kind: 'actor', actorId, epoch: attempt.epoch, attempt: attempt.attempt } }, resolved)
        if (batch !== undefined) batch.revision = receipt.revision
        return receipt
      }, (input) => {
        const current = this.commands.snapshot(scope.instanceId)
        const execution = executionSchema.parse(entity(current, { collection: 'execution', id: actorId }))
        if (signal.aborted || current.instance.epoch !== attempt.epoch || execution.attempt !== attempt.attempt || execution.status !== 'running') {
          throw new RoleplayError('stale-execution', 'Character recall is no longer current')
        }
        return this.queries.recall({ instanceId: scope.instanceId, actorId, revision: contextRevision, query: '' }, input)
      })
      if (receipt === undefined) throw new RoleplayError('invalid', 'Character execution ended without a committed turn')
      return receipt
    } catch (error) {
      // Execution diagnostics cannot reverse fiction that already crossed its commit point.
      const receipt = this.commands.receipt(scope.instanceId, commandId)
      if (receipt !== undefined) return receipt
      const snapshot = this.commands.snapshot(scope.instanceId)
      const parsed = executionSchema.safeParse(entity(snapshot, { collection: 'execution', id: actorId }))
      if (snapshot.instance.epoch === attempt.epoch && parsed.success
        && parsed.data.attempt === attempt.attempt && parsed.data.status === 'running') {
        const execution = parsed.data
        this.commands.execute({ instanceId: scope.instanceId, expectedRevision: snapshot.instance.revision,
          id: `failed:${attempt.attempt}` as CommandId, principal: { kind: 'system', operation: 'settle-execution' },
          kind: 'execution.failed', input: { attempt: attempt.attempt } }, () => ({
          events: [replace('execution', actorId, { ...execution, status: signal.aborted ? 'cancelled' : 'failed' })], result: null,
        }))
      }
      throw error
    }
  }
}
