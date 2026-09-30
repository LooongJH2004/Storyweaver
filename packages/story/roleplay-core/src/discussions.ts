import { playerActor } from './player-control.ts'
import { resolveInstanceSettings } from './settings.ts'
/** Discussion commands own authorization and participate in the narrative transaction. */
import { z } from 'zod'
import { clearDiscussionIntervention, closeStoryDiscussion, requestDiscussionFloor, requestDiscussionIntervention,
  startStoryDiscussion, updateDiscussionParticipantIntent, recordDiscussionTurn } from './discussion-rules.ts'
import { historicalCharacterLabels, historicalPersonReferences } from './characters.ts'
import { castOf, discussionsOf, json, personOf, replace, sceneOf } from './world.ts'
import { RoleplayError } from './records.ts'
import type { NarrativeSnapshot, CommandScope, NarrativeCommit, NarrativeEvent, NarrativeWriter, RuntimeValues } from './types.ts'
import type { StoryDiscussion } from './discussion-model.ts'

import { startDiscussionSchema, discussionControlSchema } from './command-inputs.ts'
export { startDiscussionSchema, discussionControlSchema } from './command-inputs.ts'

/** Find the single unfinished discussion without reading an execution session. */
export function currentDiscussion(snapshot: NarrativeSnapshot): StoryDiscussion | undefined {
  return discussionsOf(snapshot).discussions.find(item => item.status !== 'completed' && item.status !== 'cancelled')
}

/** Discussion authoring uses the same revision, idempotency, and outbox as other narrative commands. */
export class DiscussionApplication {
  constructor(private readonly commands: NarrativeWriter, private readonly values: RuntimeValues) {}

  /** Start a discussion only among people present in this instance. */
  start(scope: CommandScope, input: z.infer<typeof startDiscussionSchema>): NarrativeCommit {
    const accepted = startDiscussionSchema.parse(input)
    return this.commands.execute({ ...scope, kind: 'discussion.start', input: json(accepted) }, (snapshot) => {
      const authority = scope.principal.kind
      if (authority !== 'player' && authority !== 'director') throw new RoleplayError('invalid', 'Only the host can start a discussion')
      const scene = sceneOf(snapshot)
      for (const id of accepted.participantIds) {
        if (personOf(snapshot, id).archived || !scene.present.includes(id)) throw new RoleplayError('invalid', 'Discussion participant is not present')
      }
      const state = discussionsOf(snapshot)
      const next = startStoryDiscussion(state, { ...accepted, expectedRevision: state.revision, initiatedBy: authority,
        floorPolicy: resolveInstanceSettings(snapshot).effective.discussionSettings.floorPolicy ?? 'eagerness',
        playerActorId: playerActor(snapshot) }, this.values)
      return { events: [replace('discussions', 'current', next)], result: { discussionIds: next.discussions.map(item => item.id), discussionRevision: next.revision } }
    })
  }

  /** Apply an explicit control decision without scheduling or restoring an Actor. */
  control(scope: CommandScope, input: z.infer<typeof discussionControlSchema>): NarrativeCommit {
    const accepted = discussionControlSchema.parse(input)
    return this.commands.execute({ ...scope, kind: 'discussion.control', input: json(accepted) }, (snapshot) => {
      if (scope.principal.kind !== 'player' && !(scope.principal.kind === 'director' && ['close', 'request'].includes(accepted.operation))) {
        throw new RoleplayError('invalid', 'Only the player may control the discussion; the director may close it')
      }
      const state = discussionsOf(snapshot)
      if (accepted.operation === 'request') {
        const request = state.requests?.find(item => item.id === accepted.requestId)
        if (request === undefined || request.revision !== accepted.expectedRequestRevision
          || !['pending', 'deferred'].includes(request.status)) throw new RoleplayError('conflict', 'Discussion request changed or was already resolved')
        let next = state
        if (accepted.decision === 'accept') {
          const scene = sceneOf(snapshot)
          if (scene.id !== request.sceneId
            || request.participantIds.some(id => !scene.present.includes(id) || personOf(snapshot, id).archived)) {
            throw new RoleplayError('conflict', 'The invitation no longer matches the current scene; decline or defer it')
          }
          const settings = resolveInstanceSettings(snapshot).effective.discussionSettings
          next = startStoryDiscussion(state, { expectedRevision: state.revision, topic: request.topic,
            participantIds: request.participantIds, maxRounds: settings.maxRounds, floorPolicy: settings.floorPolicy ?? 'eagerness',
            initiatedBy: scope.principal.kind, playerActorId: playerActor(snapshot) }, this.values)
        }
        const discussionId = accepted.decision === 'accept' ? next.discussions.at(-1)?.id : undefined
        next = { ...next, revision: state.revision + 1, requests: (state.requests ?? []).map(item => item.id === request.id ? {
          ...item, revision: item.revision + 1, status: accepted.decision === 'accept' ? 'accepted' : accepted.decision === 'decline' ? 'declined' : 'deferred',
          reason: accepted.reason, ...(discussionId === undefined ? {} : { discussionId }), updatedAt: this.values.now(),
        } : item) }
        return { events: [replace('discussions', 'current', next)], result: {
          requestId: request.id, requestRevision: request.revision + 1, ...(discussionId === undefined ? {} : { discussionId }),
        } }
      }
      const next = accepted.operation === 'intervene'
        ? requestDiscussionIntervention(state, state.revision, accepted.discussionId, accepted.intervention, this.values)
        : accepted.operation === 'resume'
          ? clearDiscussionIntervention(state, state.revision, accepted.discussionId, this.values)
          : accepted.operation === 'floor'
            ? requestDiscussionFloor(state, state.revision, accepted.discussionId, accepted.actorId, this.values)
            : closeStoryDiscussion(state, state.revision, accepted.discussionId, accepted.status, this.values)
      return { events: [replace('discussions', 'current', next)], result: { discussionId: accepted.discussionId } }
    })
  }
}

/** Stage public floor changes inside the same commit as accepted character behavior. */
export function stageDiscussionTurn(snapshot: NarrativeSnapshot, actorId: string,
  input: { discussion?: { stance?: string | undefined; eagerness: 'low' | 'medium' | 'high'; action: 'speak' | 'pass' | 'conclude'; nextSpeakerId?: string | undefined } | undefined
    behavior: readonly ({ kind: 'speech'; text: string; delivery: string } | { kind: 'action'; attempt: string })[] },
  sourceEventRef: string, values: RuntimeValues): NarrativeEvent[] {
  const current = currentDiscussion(snapshot)
  if (current === undefined || !current.participantIds.includes(actorId)) {
    if (input.discussion !== undefined) throw new RoleplayError('invalid', 'Character does not participate in an active discussion. Remove the entire discussion field and resubmit the same intended behavior and posture.')
    return []
  }
  if (current.status !== 'active') throw new RoleplayError('invalid', 'Discussion awaits player or director resolution')
  const intent = input.discussion
  if (intent === undefined) throw new RoleplayError('invalid', 'Discussion participation requires a floor decision')
  const preparing = (current.preparationPendingIds?.length ?? 0) > 0
  if (preparing && input.behavior.length > 0) throw new RoleplayError('invalid', 'Discussion preparation is private and cannot publish behavior. Resubmit with behavior=[], discussion.action=pass and no next_speaker_id; keep your stance and eagerness. Save speech and action for your later public floor.')
  const state = discussionsOf(snapshot)
  let next = updateDiscussionParticipantIntent(state, state.revision, current.id, actorId, intent, values)
  if (!preparing) {
    const speech = input.behavior.filter(item => item.kind === 'speech' && item.delivery === 'spoken')
      .map(item => item.kind === 'speech' ? item.text : '').join('\n')
    const cast = castOf(snapshot)
    next = recordDiscussionTurn(next, { expectedRevision: next.revision, discussionId: current.id, speakerId: actorId,
      text: speech, action: intent.action, sourceEventRef,
      identityLabels: historicalCharacterLabels(cast, actorId), speakerRefs: historicalPersonReferences(cast, actorId),
    }, values)
  }
  return [replace('discussions', 'current', next)]
}
