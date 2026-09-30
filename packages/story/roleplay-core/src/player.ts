import { currentDiscussion, DiscussionApplication, discussionControlSchema } from './discussions.ts'
import { clearDiscussionIntervention, recordDiscussionTurn } from './discussion-rules.ts'
import { historicalCharacterLabels, historicalPersonReferences } from './characters.ts'
import { WorldApplication, observationSchema } from './cognition.ts'
/** Player embodiment publishes explicit player-origin behavior without invoking an Actor session. */
import { z } from 'zod'
import { json, invalidateExecutions, discussionsOf, castOf, replace, sceneOf } from './world.ts'
import { publishBehaviors } from './behavior.ts'
import { RoleplayError } from './records.ts'
import { playerActor, playerControlSchema } from './player-control.ts'
import { personOf } from './world.ts'
import type { NarrativeCommands } from './commands.ts'
import type { ExecutionRecovery } from './recovery.ts'
import type { CommandScope, CommandEffectResult, NarrativeCommit, NarrativeSnapshot, NarrativeEvent, RuntimeValues } from './types.ts'

import { embodimentSchema } from './command-inputs.ts'
export { embodimentSchema } from './command-inputs.ts'

/** Player behavior and execution invalidation share one transaction; technical cancellation follows acceptance. */
export class PlayerApplication {
  constructor(private readonly narrative: NarrativeCommands, private readonly values: RuntimeValues,
    private readonly execution: Pick<ExecutionRecovery, 'cancel'>, private readonly maxTextBytes: number) {}

  /** Claim or release one character, invalidating prior work before technical cancellation. */
  async control(scope: CommandScope, actorId: string | null): Promise<CommandEffectResult> {
    const input = playerControlSchema.parse({ actorId })
    const reason = 'Player character control changed'
    const commit = this.narrative.execute({ ...scope, kind: 'player.control', input: json(input) }, (snapshot) => {
      if (scope.principal.kind !== 'player') throw new RoleplayError('invalid', 'Only the player may change character control')
      if (input.actorId !== null && personOf(snapshot, input.actorId).archived) throw new RoleplayError('invalid', 'Cannot control an archived character')
      const discussion = currentDiscussion(snapshot)
      const events: NarrativeEvent[] = []
      if (input.actorId !== null && discussion?.preparationPendingIds?.includes(input.actorId)) {
        const state = discussionsOf(snapshot)
        const pending = discussion.preparationPendingIds.filter(id => id !== input.actorId)
        events.push(replace('discussions', 'current', { ...state, revision: state.revision + 1,
          discussions: state.discussions.map(item => item.id !== discussion.id ? item : {
            ...item, revision: item.revision + 1, updatedAt: this.values.now(), preparationPendingIds: pending,
            preparationExemptIds: [...new Set([...item.preparationExemptIds ?? [], input.actorId])],
            ...(pending.length === 0 ? { currentSpeakerId: input.actorId } : {}),
          }) }))
      }
      return { events: [...invalidateExecutions(snapshot, reason), ...events, replace('player-control', 'current', input)], result: json(input) }
    })
    return this.cancel(commit, reason)
  }

  /** Explicitly yield the controlled character's floor without inventing an utterance. */
  async passDiscussion(scope: CommandScope): Promise<CommandEffectResult> {
    const reason = 'Player passed the discussion floor'
    const commit = this.narrative.execute({ ...scope, kind: 'player.pass', input: {} }, (snapshot) => {
      const actorId = playerActor(snapshot)
      const discussion = currentDiscussion(snapshot)
      if (scope.principal.kind !== 'player' || actorId === null || discussion?.status !== 'active'
        || discussion.currentSpeakerId !== actorId || (discussion.preparationPendingIds?.length ?? 0) > 0) {
        throw new RoleplayError('invalid', 'The player does not own the current discussion floor')
      }
      return { events: [...invalidateExecutions(snapshot, reason),
        ...this.discussion(snapshot, { actorId, behavior: [], reason }, undefined)], result: { actorId } }
    })
    return this.cancel(commit, reason)
  }

  /** Publish a visible scene intervention to the people present at the reviewed revision. */
  async interveneScene(scope: CommandScope, content: string): Promise<CommandEffectResult> {
    const scene = sceneOf(this.narrative.replay(scope.instanceId, scope.expectedRevision))
    return this.intervene(scope, { summary: content, content, narration: content, state: [],
      deliveries: scene.present.map(actorId => ({ actorId, content, kind: 'observation', sourceRefs: [] })) })
  }

  /** A player floor change invalidates old execution before cancelling its technical work. */
  async controlDiscussion(scope: CommandScope, input: z.infer<typeof discussionControlSchema>): Promise<CommandEffectResult> {
    const accepted = discussionControlSchema.parse(input)
    const reason = `player discussion ${accepted.operation}`
    const discussion = new DiscussionApplication({ execute: (command, handler) => this.narrative.execute(command, (snapshot) => {
      if (command.principal.kind !== 'player') throw new RoleplayError('invalid', 'Player discussion control requires player authority')
      const result = handler(snapshot)
      return { ...result, events: [...invalidateExecutions(snapshot, reason), ...result.events] }
    }) }, this.values)
    return this.cancel(discussion.control(scope, accepted), reason)
  }

  /** Publish player speech or action attempts and invalidate concurrent model attempts atomically. */
  async embody(scope: CommandScope, raw: z.infer<typeof embodimentSchema>): Promise<CommandEffectResult> {
    const input = embodimentSchema.parse(raw)
    const commit = this.narrative.execute({ ...scope, kind: 'player.embody', input: json(input) }, (snapshot) => {
      if (scope.principal.kind !== 'player') throw new RoleplayError('invalid', 'Only the player may embody a character')
      if (new TextEncoder().encode(JSON.stringify(input.behavior)).byteLength > this.maxTextBytes) {
        throw new RoleplayError('invalid', 'Player behavior exceeds the configured text budget')
      }
      const published = publishBehaviors(snapshot, input.actorId, input.behavior, 'player', this.values)
      return { events: [...invalidateExecutions(snapshot, input.reason), ...published.events,
        ...this.discussion(snapshot, input, published.ids[0])], result: { behaviorIds: published.ids } }
    })
    return this.cancel(commit, input.reason)
  }

  /** Establish player-selected world consequences while invalidating all earlier model attempts. */
  async intervene(scope: CommandScope, input: z.infer<typeof observationSchema>): Promise<CommandEffectResult> {
    const world = new WorldApplication({ execute: (command, handler) => this.narrative.execute(command, (snapshot) => {
      if (command.principal.kind !== 'player') throw new RoleplayError('invalid', 'World intervention requires player authority')
      const result = handler(snapshot)
      return { ...result, events: [...invalidateExecutions(snapshot, input.summary), ...result.events] }
    }) }, this.values)
    const commit = world.observe(scope, observationSchema.parse(input))
    return this.cancel(commit, input.summary)
  }

  private discussion(snapshot: NarrativeSnapshot, input: z.infer<typeof embodimentSchema>,
    sourceRef: string | undefined): NarrativeEvent[] {
    const discussion = currentDiscussion(snapshot)
    if (discussion === undefined || !discussion.participantIds.includes(input.actorId)) return []
    let state = discussionsOf(snapshot)
    if (discussion.playerIntervention === 'speak') state = clearDiscussionIntervention(state, state.revision, discussion.id, this.values)
    const current = state.discussions.find(item => item.id === discussion.id)
    if (current?.status === 'active' && current.currentSpeakerId === input.actorId && (current.preparationPendingIds?.length ?? 0) === 0) {
      const text = input.behavior.flatMap(item => item.kind === 'speech' && item.delivery === 'spoken' ? [item.text] : []).join('\n')
      const cast = castOf(snapshot)
      state = recordDiscussionTurn(state, { expectedRevision: state.revision, discussionId: current.id, speakerId: input.actorId,
        text, action: text === '' ? 'pass' : 'speak', sourceEventRef: sourceRef,
        identityLabels: historicalCharacterLabels(cast, input.actorId), speakerRefs: historicalPersonReferences(cast, input.actorId),
      }, this.values)
    }
    return state.revision === discussionsOf(snapshot).revision ? [] : [replace('discussions', 'current', state)]
  }

  private async cancel(commit: NarrativeCommit, reason: string): Promise<CommandEffectResult> {
    const epoch = this.narrative.replay(commit.command.instanceId, commit.revision).instance.epoch
    try { await this.execution.cancel(commit.command.instanceId, epoch, reason) }
    catch (error) { return { commit, execution: 'pending', diagnostic: error instanceof Error ? error.message : String(error) } }
    return { commit, execution: 'cancelled' }
  }
}
