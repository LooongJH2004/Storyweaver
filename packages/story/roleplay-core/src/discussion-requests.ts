/** Actor invitations are private proposals until the host accepts a group discussion. */
import { discussionsOf, personOf, replace, sceneOf } from './world.ts'
import { RoleplayError } from './records.ts'
import type { NarrativeEvent, NarrativeSnapshot, RuntimeValues } from './types.ts'

/**
 * Stage an invitation alongside the actor turn; duplicate pending invitations share one record.
 * @param snapshot - Frozen instance state before the actor commit.
 * @param actorId - Authenticated requester.
 * @param input - Invitation with already-resolved participant identities.
 * @param sourceRef - Accepted actor-turn source.
 * @param values - Host-owned identity and clock source.
 * @returns events to publish in the enclosing transaction, or none for a duplicate invitation.
 */
export function stageDiscussionRequest(snapshot: NarrativeSnapshot, actorId: string,
  input: { topic: string; opening: string; participantIds: readonly string[] }, sourceRef: string,
  values: RuntimeValues): NarrativeEvent[] {
  const state = discussionsOf(snapshot)
  if (state.discussions.some(item => !['completed', 'cancelled'].includes(item.status))) {
    throw new RoleplayError('invalid', 'Finish the current discussion before requesting another')
  }
  const scene = sceneOf(snapshot)
  const participantIds = [actorId, ...input.participantIds]
  if (new Set(participantIds).size !== participantIds.length) throw new RoleplayError('invalid', 'Invite other people once; you are included automatically')
  for (const id of participantIds) {
    if (!scene.present.includes(id) || personOf(snapshot, id).archived) throw new RoleplayError('invalid', 'Discussion invitee is not present')
  }
  const requests = state.requests ?? []
  const same = requests.find(item => item.actorId === actorId && item.sceneId === scene.id
    && ['pending', 'deferred'].includes(item.status) && item.topic.trim().toLocaleLowerCase() === input.topic.trim().toLocaleLowerCase()
    && item.participantIds.length === participantIds.length && item.participantIds.every(id => participantIds.includes(id)))
  if (same !== undefined) return []
  const now = values.now()
  return [replace('discussions', 'current', { ...state, revision: state.revision + 1, requests: [...requests, {
    id: `discussion-request-${values.id()}`, revision: 1, actorId, sceneId: scene.id,
    topic: input.topic, opening: input.opening, participantIds, sourceRef, status: 'pending', createdAt: now, updatedAt: now,
  }] })]
}
