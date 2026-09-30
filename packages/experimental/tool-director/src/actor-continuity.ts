/** Host validation of source references accompanying accepted character submissions. */

import type { Agent } from '@deepseek-ai/dsh-agent'
import { type ActorContinuityRequest } from '@deepseek-ai/dsh-experimental-actor'
import { contextScope, indexContextSources, proposeContextUpdate, contextUpdateSchema, type StoryContinuityInput, type StoryWorldState } from '@deepseek-ai/dsh-story'
import { z } from 'zod'

/**
 * Resolve source annotations to already established world events.
 * @param requests - validated Actor references.
 * @param behaviorEventIds - world ids in submitted behavior order.
 * @param commitId - stable identity of the accepted Actor turn closure.
 * @returns immutable, replay-safe Story annotations.
 */
export function resolveActorContinuity(
  requests: readonly ActorContinuityRequest[], behaviorEventIds: readonly string[], commitId: string,
): StoryContinuityInput[] {
  return requests.map((request, index) => {
    const sourceEventId = request.eventId ?? (request.behaviorIndex === undefined ? undefined : behaviorEventIds[request.behaviorIndex])
    if (sourceEventId === undefined) throw new Error('Continuity source behavior has not been established')
    return {
      id: `matter:${commitId}:${index}`, operation: request.operation, sourceEventId,
      private: request.eventId !== undefined,
      ...(request.kind === undefined ? {} : { kind: request.kind }),
      ...(request.itemId === undefined ? {} : { itemId: request.itemId }),
    }
  })
}

/**
 * Reject invisible references and unauthorized updates before private state or behavior is emitted.
 * @param actor - scoped Actor whose submission is guarded.
 * @param actorId - registered character identity.
 * @param getWorld - current authoritative world reader.
 * @returns disposer for the scoped pre-execution guard.
 */
export function guardActorContinuity(actor: Agent, actorId: string, getWorld: () => StoryWorldState): () => void {
  return actor.ctx.tools.guard((execution) => {
    if (execution.agent !== actor || execution.name !== 'npc_commit_turn') return undefined
    const args = execution.arguments
    if (typeof args !== 'object' || args === null || !('context_update' in args) || args.context_update === undefined) return undefined
    try {
      const parsed = z.object({ context_update: z.unknown(), behavior: z.array(z.unknown()).optional() }).parse(args)
      const viewer = contextScope(actorId)
      const state = indexContextSources(getWorld().context, (parsed.behavior ?? []).map((_, index) => ({
        id: `$behavior:${index}`, sceneId: 'validation', kind: 'actor-behavior', scopes: [viewer], order: index,
        locator: { kind: 'world' as const, eventId: 'validation' },
      })))
      proposeContextUpdate(state, viewer, 'validation', 'validation', contextUpdateSchema.parse(parsed.context_update))
      return undefined
    } catch (error: unknown) {
      return error instanceof Error ? error.message : String(error)
    }
  })
}
