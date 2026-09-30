import type { MemoryScheduler } from './memory-queue.ts'
/** Director orchestration owns execution attempts and delegates every fictional change to an application. */
import { directorCommandSchema, type DirectorCommand, DirectorCommands } from './director-commands.ts'
import { DirectorQueries } from './director-context.ts'
import type { PerspectiveQueries } from './perspective.ts'
import type { ActorFacingBeat, ActorRuntime } from './runtime.ts'
import type { DiscussionRuntime } from './discussion-runtime.ts'
import type { NarrativeCommands } from './commands.ts'
import { directorRunSchema, json, replace } from './world.ts'
import { canonical, entity, RoleplayError } from './records.ts'
import { currentDiscussion } from './discussions.ts'
import { pendingWorldAttempts } from './world-attempts.ts'
import { narrativeOriginals, retentionOf } from './retention-records.ts'
import { playerActor } from './player-control.ts'
import { consolidationSourceAliases, resolveContextUpdate } from './context-retention.ts'
import { consolidationBackground } from './consolidation-context.ts'
import { renderConsolidationSources, consolidationWindow } from './consolidation-sources.ts'
import { z } from 'zod'
import type { CommandId, CommandScope, DirectorContextView, DirectorRunView, InstanceId, Json, NarrativeCommit, RuntimeValues } from './types.ts'

/** Query results and committed write receipts are both preserved in the technical request history. */
export interface DirectorReply { readonly result: Json
  readonly complete: boolean
  readonly commit?: NarrativeCommit
  readonly failure?: string }
/** Harness owns model tools and sessions; only this host callback authenticates a model command. */
export interface DirectorExecutor {
  execute(request: { readonly attempt: string; readonly context: DirectorContextView }, signal: AbortSignal,
    command: (callId: string, input: DirectorCommand) => DirectorReply): Promise<void>
}

/** Serial dispatch binds each next request to the preceding accepted narrative revision. */
export class DirectorRuntime {
  private readonly running = new Map<InstanceId, {
    commandId: CommandId
    fingerprint: string
    epoch: number
    controller: AbortController
    done: Promise<DirectorRunView>
  }>()
  constructor(private readonly narrative: NarrativeCommands, private readonly actions: DirectorCommands,
    private readonly queries: DirectorQueries, private readonly people: Pick<PerspectiveQueries, 'authorPeople'>,
    private readonly executor: DirectorExecutor, private readonly actors: Pick<ActorRuntime, 'run' | 'cancel' | 'abort' | 'consolidateDiscussion'>,
    private readonly discussions: Pick<DiscussionRuntime, 'advance'>, private readonly values: RuntimeValues,
    private readonly commandLimit: number, private readonly queryCharacters: number,
    private readonly feedbackLimit = 0, private readonly consolidationThreshold = 0, private readonly memory?: MemoryScheduler,
    private readonly reactiveLimit = 0) {
    if (!Number.isSafeInteger(feedbackLimit) || feedbackLimit < 0) throw new RoleplayError('invalid', 'World feedback limit must be nonnegative')
    if (!Number.isSafeInteger(reactiveLimit) || reactiveLimit < 0) throw new RoleplayError('invalid', 'Reactive director limit must be nonnegative')
    if (!Number.isSafeInteger(consolidationThreshold) || consolidationThreshold < 0) throw new RoleplayError('invalid', 'Director consolidation threshold must be nonnegative')
    for (const value of [commandLimit, queryCharacters]) {
      if (!Number.isSafeInteger(value) || value < 1) throw new RoleplayError('invalid', 'Director budgets must be positive integers')
    }
  }

  /** Open one host-authorized preparation and dispatch the accepted response plan. */
  isRunning(instanceId: InstanceId): boolean { return this.running.has(instanceId) }

  run(scope: CommandScope, instruction: string, actorFacingBeat?: string): Promise<DirectorRunView> {
    return this.start(scope, instruction, true, actorFacingBeat)
  }

  /** Complete a finished discussion without inventing another player message. */
  summarizeDiscussion(scope: CommandScope): Promise<DirectorRunView> {
    return this.start(scope, '', false)
  }

  private start(scope: CommandScope, instruction: string, playerInput: boolean,
    actorFacingBeat?: string): Promise<DirectorRunView> {
    const fingerprint = canonical({ scope, instruction, playerInput,
      ...(actorFacingBeat === undefined ? {} : { actorFacingBeat }) })
    const beat: ActorFacingBeat | undefined = actorFacingBeat === undefined || actorFacingBeat.trim() === ''
      ? undefined : { text: actorFacingBeat, source: `command:${scope.id}:actor-facing-beat` }
    const running = this.running.get(scope.instanceId)
    if (running !== undefined) {
      if (running.commandId !== scope.id) return Promise.reject(new RoleplayError('conflict', 'Director is already running'))
      if (running.fingerprint !== fingerprint) return Promise.reject(new RoleplayError('duplicate-command', 'Running command identity was reused'))
      return running.done
    }
    let completed: DirectorRunView | undefined
    const finished = this.narrative.receipt(scope.instanceId, `${scope.id}:continuation-result` as CommandId)
    if (finished !== undefined) {
      const saved = z.object({ fingerprint: z.string(), run: directorRunSchema }).parse(finished.result)
      if (saved.fingerprint !== fingerprint) return Promise.reject(new RoleplayError('duplicate-command', 'Completed command identity was reused'))
      completed = saved.run
    }
    const controller = new AbortController()
    const epoch = this.narrative.snapshot(scope.instanceId).instance.epoch
    const done = (completed === undefined ? this.perform(scope, instruction, controller.signal, playerInput,
      undefined, false, undefined, beat) : Promise.resolve(completed))
      .then(async (result) => {
        if (completed !== undefined) return result
        let latest = result
        const summaryOpen = this.narrative.receipt(scope.instanceId, `${scope.id}:discussion-summary` as CommandId)
        if (summaryOpen !== undefined) {
          const summary = directorRunSchema.parse(summaryOpen.result)
          const completed = this.narrative.receipt(scope.instanceId, `director-result:${summary.id}` as CommandId)
          if (completed !== undefined) latest = directorRunSchema.parse(completed.result)
        }
        const snapshot = this.narrative.snapshot(scope.instanceId)
        if (playerInput && latest === result && result.advanceDiscussion && currentDiscussion(snapshot)?.status === 'summarizing') {
          controller.signal.throwIfAborted()
          if (snapshot.instance.epoch !== epoch) throw new RoleplayError('stale-execution', 'Discussion was interrupted before director continuation')
          latest = await this.perform({ ...scope, id: `${scope.id}:discussion-summary` as CommandId,
            expectedRevision: snapshot.instance.revision }, '', controller.signal, false, undefined, false, undefined, beat)
        }
        return this.continueFeedback(scope, latest, controller.signal, epoch, fingerprint, beat)
      }).then(async (result) => {
        await this.consolidateAfter(scope, controller.signal, result)
        return result
      }).finally(() => { this.running.delete(scope.instanceId) })
    this.running.set(scope.instanceId, { commandId: scope.id, fingerprint, epoch, controller, done })
    return done
  }

  private async consolidateAfter(scope: CommandScope, signal: AbortSignal, result: DirectorRunView): Promise<void> {
    if (this.consolidationThreshold === 0) return
    if (this.memory !== undefined) {
      const current = this.narrative.snapshot(scope.instanceId)
      const completion = this.narrative.receipt(scope.instanceId, `${scope.id}:continuation-result` as CommandId)
        ?? this.narrative.receipt(scope.instanceId, `director-result:${result.id}` as CommandId)
      if (current.instance.revision === completion?.revision && current.instance.epoch === result.epoch
        && currentDiscussion(current) === undefined && pendingWorldAttempts(current).length === 0) this.memory.enqueue(scope.instanceId, 'director')
      return
    }
    const id = `${scope.id}:director-memory` as CommandId
    const opened = this.narrative.receipt(scope.instanceId, id)
    if (opened !== undefined) {
      const run = directorRunSchema.parse(opened.result)
      await this.perform({ ...scope, id, expectedRevision: opened.command.expectedRevision }, '', signal, false, run.consolidationSources)
      return
    }
    const snapshot = this.narrative.snapshot(scope.instanceId)
    const completion = this.narrative.receipt(scope.instanceId, `${scope.id}:continuation-result` as CommandId)
      ?? this.narrative.receipt(scope.instanceId, `director-result:${result.id}` as CommandId)
    if (completion === undefined) throw new RoleplayError('invalid', 'Missing director completion receipt')
    if (snapshot.instance.revision !== completion.revision || snapshot.instance.epoch !== result.epoch
      || currentDiscussion(snapshot) !== undefined || pendingWorldAttempts(snapshot).length > 0) return
    const covered = new Set(retentionOf(snapshot, 'director').proposals.flatMap(proposal => proposal.unit.sourceIds))
    const sources = narrativeOriginals(snapshot, 'director').filter(item => !covered.has(item.id))
      .sort((left, right) => left.revision - right.revision || (left.order ?? 0) - (right.order ?? 0)
        || left.id.localeCompare(right.id))
      .slice(0, this.consolidationThreshold).map(item => item.id)
    if (sources.length < this.consolidationThreshold) return
    signal.throwIfAborted()
    await this.perform({ ...scope, id, expectedRevision: snapshot.instance.revision }, '', signal, false, sources)
  }

  private async continueFeedback(scope: CommandScope, initial: DirectorRunView, signal: AbortSignal,
    epoch: number, fingerprint: string, actorFacingBeat?: ActorFacingBeat): Promise<DirectorRunView> {
    if (this.feedbackLimit === 0 && this.reactiveLimit === 0 || initial.epoch !== epoch) return initial
    const root = this.narrative.receipt(scope.instanceId, scope.id)
    if (root === undefined) throw new RoleplayError('invalid', 'Missing director root receipt')
    let latest = initial
    for (let cycle = 0; cycle < this.feedbackLimit; cycle++) {
      signal.throwIfAborted()
      const snapshot = this.narrative.snapshot(scope.instanceId)
      if (snapshot.instance.epoch !== epoch) throw new RoleplayError('stale-execution', 'World feedback was interrupted')
      const childId = `${scope.id}:world-feedback:${cycle}` as CommandId
      const opened = this.narrative.receipt(scope.instanceId, childId)
      const discussion = currentDiscussion(snapshot)
      if (opened === undefined && (discussion?.status === 'awaiting-player' || discussion?.currentSpeakerId === playerActor(snapshot)
        && playerActor(snapshot) !== null)) break
      const before = opened === undefined ? snapshot : this.narrative.replay(scope.instanceId, opened.command.expectedRevision)
      const pending = pendingWorldAttempts(before).filter(item => item.revision >= root.revision)
      if (opened === undefined && pending.length === 0) break
      latest = await this.perform({ ...scope, id: childId,
        expectedRevision: opened?.command.expectedRevision ?? snapshot.instance.revision }, '', signal, false,
      undefined, false, undefined, actorFacingBeat)
      const after = this.narrative.snapshot(scope.instanceId)
      const remaining = new Set(pendingWorldAttempts(after).map(item => item.id))
      if (pending.every(item => remaining.has(item.id))) break
      if (latest.advanceDiscussion && currentDiscussion(after)?.status === 'summarizing') {
        const summaryId = `${childId}:discussion-summary` as CommandId
        const summary = this.narrative.receipt(scope.instanceId, summaryId)
        latest = await this.perform({ ...scope, id: summaryId,
          expectedRevision: summary?.command.expectedRevision ?? after.instance.revision }, '', signal, false,
        undefined, false, undefined, actorFacingBeat)
      }
    }
    for (let cycle = 0; cycle < this.reactiveLimit; cycle++) {
      signal.throwIfAborted()
      const snapshot = this.narrative.snapshot(scope.instanceId)
      if (snapshot.instance.epoch !== epoch) throw new RoleplayError('stale-execution', 'Reactive director continuation was interrupted')
      const childId = `${scope.id}:reactive:${cycle}` as CommandId
      const opened = this.narrative.receipt(scope.instanceId, childId)
      if (opened === undefined && (latest.actors.length !== 1 || latest.advanceDiscussion
        || currentDiscussion(snapshot) !== undefined || pendingWorldAttempts(snapshot).length > 0)) break
      latest = await this.perform({ ...scope, id: childId,
        expectedRevision: opened?.command.expectedRevision ?? snapshot.instance.revision }, '', signal, false, undefined, true,
      latest.actors[0], actorFacingBeat)
    }
    signal.throwIfAborted()
    const snapshot = this.narrative.snapshot(scope.instanceId)
    if (snapshot.instance.epoch !== epoch) throw new RoleplayError('stale-execution', 'World feedback was interrupted')
    this.narrative.execute({ instanceId: scope.instanceId, id: `${scope.id}:continuation-result` as CommandId,
      expectedRevision: snapshot.instance.revision, principal: { kind: 'system', operation: 'director-progress' },
      kind: 'director.continuation-result', input: { fingerprint } }, () => ({ events: [], result: json({ fingerprint, run: latest }) }))
    return latest
  }

  /** Pause commits the epoch fence before cancelling technical director and actor work. */
  pause(scope: CommandScope, reason: string): NarrativeCommit {
    const receipt = this.actors.cancel(scope, reason)
    const epoch = this.narrative.replay(scope.instanceId, receipt.revision).instance.epoch
    const operation = this.running.get(scope.instanceId)
    if (operation !== undefined && operation.epoch < epoch) operation.controller.abort(reason)
    return receipt
  }

  /** Recovery cancels only work older than its accepted restoration epoch. */
  async abort(instanceId: InstanceId, beforeEpoch: number, reason: string): Promise<void> {
    const operation = this.running.get(instanceId)
    if (operation !== undefined && operation.epoch < beforeEpoch) operation.controller.abort(reason)
    await this.actors.abort(instanceId, beforeEpoch, reason)
    if (operation !== undefined && operation.epoch < beforeEpoch) await Promise.allSettled([operation.done])
  }

  /** Release preparation requests after all dispatched actors have been asked to stop. */
  async dispose(): Promise<void> {
    for (const [id, operation] of this.running) {
      operation.controller.abort('Director runtime disposed')
      await this.actors.abort(id, operation.epoch + 1, 'Director runtime disposed')
    }
    await Promise.allSettled([...this.running.values()].map(operation => operation.done))
  }

  private async perform(scope: CommandScope, instruction: string, signal: AbortSignal,
    playerInput: boolean, consolidationSources?: readonly string[], reactive = false, respondingTo?: string,
    actorFacingBeat?: ActorFacingBeat): Promise<DirectorRunView> {
    const opened = this.narrative.execute({ ...scope, kind: 'director.open', input: json({ instruction, playerInput, reactive,
      ...(consolidationSources === undefined ? {} : { consolidationSources }), ...(respondingTo === undefined ? {} : { respondingTo }),
      ...(actorFacingBeat === undefined ? {} : { actorFacingBeat }) }) }, (snapshot) => {
      if (scope.principal.kind !== 'player') throw new RoleplayError('invalid', 'Only the player may start director preparation')
      if (consolidationSources === undefined && !playerInput && !reactive && currentDiscussion(snapshot)?.status !== 'summarizing' && pendingWorldAttempts(snapshot).length === 0) {
        throw new RoleplayError('conflict', 'No discussion conclusion or world feedback is pending')
      }
      const previous = entity(snapshot, { collection: 'run', id: 'director' })
      if (previous !== undefined) {
        const old = directorRunSchema.parse(previous)
        if (old.epoch === snapshot.instance.epoch && ['preparing', 'dispatching'].includes(old.status)) {
          throw new RoleplayError('conflict', 'Pause the previous director attempt before continuing')
        }
      }
      const run: DirectorRunView = { id: this.values.id(), epoch: snapshot.instance.epoch, status: 'preparing',
        actors: [], advanceDiscussion: false, completedActors: 0,
        ...(consolidationSources === undefined ? {} : { consolidationSources }) }
      return { events: [replace('run', 'director', run), ...playerInput ? [replace('player-input', scope.id,
        { id: scope.id, revision: snapshot.instance.revision + 1, text: instruction })] : []], result: json(run) }
    })
    const initial = directorRunSchema.parse(opened.result)
    const finalId = `director-result:${initial.id}` as CommandId
    const final = this.narrative.receipt(scope.instanceId, finalId)
    if (final !== undefined) return directorRunSchema.parse(final.result)
    const failed = this.narrative.receipt(scope.instanceId, `director-failure:${initial.id}` as CommandId)
    if (failed !== undefined) {
      const failure = directorRunSchema.parse(failed.command.input)
      throw new RoleplayError('invalid', failure.failure ?? 'Director execution failed')
    }
    let expectedRevision = opened.revision
    const preparation = { finished: false }
    let count = 0
    const replies = new Map<string, { fingerprint: string; reply: DirectorReply }>()
    const assertLive = (): DirectorRunView => {
      if (signal.aborted) throw new RoleplayError('stale-execution', 'Director execution was cancelled')
      const snapshot = this.narrative.snapshot(scope.instanceId)
      const run = directorRunSchema.parse(entity(snapshot, { collection: 'run', id: 'director' }))
      if (run.id !== initial.id || snapshot.instance.epoch !== initial.epoch) throw new RoleplayError('stale-execution', 'Director attempt was superseded')
      if (snapshot.instance.revision !== expectedRevision) throw new RoleplayError('conflict', 'Story changed during director execution')
      return run
    }
    const nextScope = (id: string): CommandScope => ({ instanceId: scope.instanceId, id: id as CommandId, expectedRevision,
      principal: { kind: 'director', attempt: initial.id, epoch: initial.epoch } })
    try {
      assertLive()
      if (!playerInput && currentDiscussion(this.narrative.snapshot(scope.instanceId))?.status === 'summarizing') {
        await this.actors.consolidateDiscussion(nextScope(`${initial.id}:memory`))
        expectedRevision = this.narrative.snapshot(scope.instanceId).instance.revision
        assertLive()
      }
      let context = this.queries.context({ instanceId: scope.instanceId, revision: expectedRevision, instruction,
        ...(initial.consolidationSources === undefined ? {} : { purpose: 'consolidation' as const }) })
      if (actorFacingBeat !== undefined && initial.consolidationSources === undefined) {
        const content = `[CURRENT PLAYER BEAT — author instruction also visible to actors; it is not established world fact]\n${actorFacingBeat.text}`
        context = { ...context, sections: [...context.sections,
          { id: 'player-beat', role: 'user', content, sources: [actorFacingBeat.source] }],
        text: `${context.text}\n\n${content}`, sources: [...context.sources, actorFacingBeat.source] }
      }
      const sourceAliases = consolidationSourceAliases(initial.consolidationSources ?? [])
      if (reactive) {
        const content = `[DIRECTOR EXECUTION PURPOSE]\nThis is a bounded response selection after ${respondingTo} completed a turn, not a new player request or a new scene beat. Review that turn, including any accepted words, action or silence. Choose at most one present AI-controlled character with an immediate reason to respond, or choose nobody. Prefer a different character when the last speaker has already made their point; choose the same character only when their next contribution is specifically prompted by what just happened. Do not split one thought into repetitive turns. Submit only finish with actors=[one character] or actors=[] and advanceDiscussion=false; do not add narration, world events, style changes, discussion, or another task.`
        context = { ...context, sections: [...context.sections, { id: 'execution-purpose', role: 'user', content, sources: [] }],
          text: `${context.text}\n${content}` }
      } else if (!playerInput && initial.consolidationSources === undefined) {
        const snapshot = this.narrative.snapshot(scope.instanceId)
        const discussion = currentDiscussion(snapshot)
        const awaitingPlayer = discussion?.status === 'awaiting-player'
          || discussion?.currentSpeakerId === playerActor(snapshot) && playerActor(snapshot) !== null
        const task = awaitingPlayer
          ? 'The discussion is awaiting the player. Deliver any supplied attempt results, then finish with actors=[] and advanceDiscussion=false. Preserve the player floor; do not close or resume it on their behalf.'
          : discussion?.status === 'active'
            ? 'The discussion is still active and paused for world feedback, not finished. After settlement, resume its assigned floor with finish actors=[] and advanceDiscussion=true. Participants still need their opportunity to respond, pass or conclude. Do not close the discussion merely because it needed a world result, or replace its floor with ordinary actor dispatch.'
            : discussion?.status === 'summarizing'
              ? 'The discussion has reached its summarizing phase. Retain its useful consequences and close it without restarting the exchange. Preserve disagreement; finish with actors=[] and advanceDiscussion=false unless an existing attempt needs a specific response.'
              : 'No discussion is awaiting continuation. Dispatch only responses needed for supplied attempt results; if none are needed, finish with actors=[] and advanceDiscussion=false.'
        const content = `[DIRECTOR EXECUTION PURPOSE]\nThis is an internal continuation, not a player request to continue the story. An empty PLAYER GUIDANCE section does not request a new scene beat here. Resolve supplied pending attempts and deliver their perceptible results. ${task} Do not create a fresh environmental event merely to reopen conversation. Preserve unresolved disagreement and the player's next opportunity to continue.`
        context = { ...context, sections: [...context.sections, { id: 'execution-purpose', role: 'user', content, sources: [] }],
          text: `${context.text}\n${content}` }
      }
      if (initial.consolidationSources !== undefined) {
        const selected = new Set(initial.consolidationSources)
        const available = narrativeOriginals(this.narrative.replay(scope.instanceId, expectedRevision), 'director')
        const originals = available
          .filter(item => selected.has(item.id)).map(item => ({ ...item,
            sourceRef: Object.entries(sourceAliases).find(([, id]) => id === item.id)?.[0] }))
        const content = `[DIRECTOR MEMORY CONSOLIDATION]\nThis execution does not advance the story. Use recall if needed, submit one context-update covering every supplied source exactly once, then finish with actors=[] and advanceDiscussion=false. Preserve established events, claims as claims, attempted actions as attempts, commitments and unresolved consequences. Do not invent outcomes or private actor knowledge. Original details remain retrievable. Use each listed sourceRef (for example $source:1) in sourceIds for both units and note changes; these short references apply only to this consolidation. Use the original id for recall.\n${renderConsolidationSources(originals)}`
        const sections = [...consolidationBackground(context.sections),
          { id: 'consolidation', role: 'user' as const, content, sources: [...selected] },
          ...consolidationWindow(originals, available)]
        context = { ...context, sections, text: sections.map(section => section.content).join('\n\n'),
          sources: sections.flatMap(section => section.sources) }
      }
      try {
        await this.executor.execute({ attempt: initial.id, context }, signal, (callId, raw) => {
          assertLive()
          const fingerprint = canonical(raw)
          const prior = replies.get(callId)
          if (prior !== undefined) {
            if (prior.fingerprint !== fingerprint) throw new RoleplayError('duplicate-command', 'Tool call identity was reused for different content')
            return prior.reply
          }
          if (preparation.finished) throw new RoleplayError('invalid', 'Director already finished preparation')
          if (++count > this.commandLimit) {
            this.running.get(scope.instanceId)?.controller.abort('Director command budget exhausted')
            throw new RoleplayError('invalid', 'Director command budget exhausted')
          }
          let action = directorCommandSchema.parse(raw)
          if (reactive && action.operation !== 'find' && action.operation !== 'recall' && action.operation !== 'finish') {
            throw new RoleplayError('invalid', 'Reactive director may only inspect context and select a response')
          }
          if (reactive && action.operation === 'finish' && (action.actors.length > 1 || action.advanceDiscussion)) {
            throw new RoleplayError('invalid', 'Reactive director may dispatch at most one actor without advancing discussion')
          }
          if (initial.consolidationSources !== undefined && action.operation === 'context-update') {
            action = { ...action, input: resolveContextUpdate(action.input, sourceAliases) }
          }
          if (action.operation === 'find' || action.operation === 'recall') {
            const result = json(action.operation === 'find' ? this.people.authorPeople(scope.instanceId, action, expectedRevision)
              : this.queries.recall(scope.instanceId, action.input, expectedRevision))
            if (JSON.stringify(result).length > this.queryCharacters) throw new RoleplayError('invalid', 'Character query is too large; request a smaller page')
            const reply = { result, complete: false }
            replies.set(callId, { fingerprint, reply })
            return reply
          }
          const commit = this.actions.submit(nextScope(`${initial.id}:tool:${callId}`), action)
          expectedRevision = commit.revision
          preparation.finished = action.operation === 'finish'
          const result = commit.result as { narrationDraft?: { status: string; characters: number; minimum: number } } | null
          const failure = result?.narrationDraft?.status === 'exhausted'
            ? `旁白补写两次后仍未达标：${result.narrationDraft.characters}/${result.narrationDraft.minimum} 字。草稿已保留，世界事件未提交。请调整字数设置后重试。` : undefined
          const reply = { result: commit.result, complete: preparation.finished, commit, ...(failure === undefined ? {} : { failure }) }
          replies.set(callId, { fingerprint, reply })
          return reply
        })
      } catch (error) { if (!preparation.finished) throw error }
      if (!preparation.finished) throw new RoleplayError('invalid', 'Director stopped without completing preparation')
      let run = assertLive()
      for (const [index, actorId] of run.actors.entries()) {
        assertLive()
        const receipt = await this.actors.run(nextScope(`${initial.id}:actor:${index}`), actorId, actorFacingBeat)
        expectedRevision = receipt.revision
        assertLive()
        run = { ...run, completedActors: index + 1 }
        const progress = this.narrative.execute({ ...nextScope(`${initial.id}:progress:${index}`), kind: 'director.progress', input: json(run) }, () => ({
          events: [replace('run', 'director', run)], result: null,
        }))
        expectedRevision = progress.revision
      }
      if (run.advanceDiscussion) {
        assertLive()
        await this.discussions.advance(nextScope(`${initial.id}:discussion`))
        expectedRevision = this.narrative.snapshot(scope.instanceId).instance.revision
        assertLive()
      }
      const complete = { ...run, status: 'completed' as const }
      this.narrative.execute({ ...nextScope(finalId), kind: 'director.completed', input: json(complete) }, () => ({
        events: [replace('run', 'director', complete)], result: json(complete),
      }))
      return complete
    } catch (error) {
      const snapshot = this.narrative.snapshot(scope.instanceId)
      const parsed = directorRunSchema.safeParse(entity(snapshot, { collection: 'run', id: 'director' }))
      const run = parsed.success ? parsed.data : undefined
      if (snapshot.instance.epoch === initial.epoch && run?.id === initial.id) {
        const failure = { ...run, status: 'failed', failure: error instanceof Error ? error.message : String(error) }
        this.narrative.execute({ instanceId: scope.instanceId, id: `director-failure:${initial.id}` as CommandId,
          expectedRevision: snapshot.instance.revision, principal: { kind: 'system', operation: 'director-progress' },
          kind: 'director.failed', input: json(failure) }, () => ({ events: [replace('run', 'director', failure)], result: null }))
      }
      throw error
    }
  }
}
