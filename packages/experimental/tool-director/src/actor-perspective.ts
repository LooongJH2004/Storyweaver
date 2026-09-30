/** Harness adapter supplies explicit observer permissions to Actor execution. */
import { Service, type Context } from '@deepseek-ai/cordis'
import { emptyKnowledge } from '@deepseek-ai/dsh-story'
import type { ActorId, ActorNarrativeReader, ActorNarrativePerspective } from '@deepseek-ai/dsh-experimental-actor'
import type { SessionId } from '@deepseek-ai/dsh-session'

/** Membership and audience checks occur before Actor code receives any narrative values. */
export class StoryActorPerspective extends Service implements ActorNarrativeReader {
  constructor(ctx: Context) { super(ctx, 'actorNarrative') }

  read(sessionId: SessionId, actorId: ActorId): ActorNarrativePerspective | undefined {
    const owner = this.ctx.storyRegistry.storyForSession(sessionId)
    if (owner === undefined) return undefined
    if (owner.archived || owner.actorId !== actorId || owner.role !== 'actor') throw new Error('Actor does not own this narrative perspective')
    const story = this.ctx.storyRegistry.get(owner.storyId)
    if (story === undefined) throw new Error('Actor story is unavailable')
    const world = story.world
    if (!world.characters.initialized) throw new Error('Story character records must be initialized before Actor access')
    const encounters = world.characters.encounters.filter(item => item.observerId === actorId)
    return {
      actorIds: world.characters.entries.map(item => item.definition.actorId),
      knowledge: structuredClone(world.characters.knowledge[actorId] ?? emptyKnowledge()),
      entityRefs: encounters.map(item => item.ref),
      sourceRefs: [...world.perceptions.filter(item => item.actorId === actorId).flatMap(item => [item.id, item.sourceEventId]),
        ...world.context.sources.filter(item => item.scopes.includes(`actor:${actorId}`)).map(item => item.id)],
      targets: Object.fromEntries(encounters.flatMap(item => item.actorId === undefined ? [] : [[item.ref, item.actorId]])),
      initialRefs: Object.fromEntries(encounters.flatMap(item =>
        item.actorId !== undefined && item.appearanceKey === 'ordinary' ? [[item.actorId, item.ref]] : [])),
    }
  }
}
