/** Host-side indexing and reading of accepted narrative sources. */
import type { Context } from '@deepseek-ai/cordis'
import { foldSurface, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { contextScope, currentStorySceneCast, readContextSource, encounterLabel, emptyKnowledge } from '@deepseek-ai/dsh-story'
import type { ContextSource, Story } from '@deepseek-ai/dsh-story'

/**
 * Load original events from a live Session or its durable log.
 * @param ctx - Host services owning the Story and Session logs.
 * @param sessionId - Owning Session identity.
 * @returns The complete live or durable Session event log.
 */
export async function sourceEvents(ctx: Context, sessionId: string): Promise<readonly SessionEvent[]> {
  return ctx.sessions.get(SessionId(sessionId))?.events ?? (await ctx.sessionPersistence.inspect(SessionId(sessionId))).events
}
/**
 * Resolve a source that the caller already selected from the active audience-filtered index.
 * @param ctx - Host services owning the Story and Session logs.
 * @param story - Current Story aggregate.
 * @param source - Source selected from the active authorized index.
 * @param observerId - Optional authenticated perspective for frozen source references.
 * @returns The original payload without summary fallback.
 */
export function sourceText(ctx: Context, story: Story, source: ContextSource, observerId?: string): Promise<string> {
  return readContextSource(story.world, source, async (id, seq) => (await sourceEvents(ctx, id))[seq], story.discussions, observerId)
}

/**
 * Index active world sources and current player input, never abandoned turns or unaccepted Actor attempts.
 * @param ctx - Host services owning the Story and Session logs.
 * @param story - Current Story aggregate.
 * @returns The Story after indexing accepted sources in original order.
 */
export async function syncContextSources(ctx: Context, story: Story): Promise<Story> {
  const sources = await collectContextSources(ctx, story)
  return sources.length === 0 ? story : ctx.storyRegistry.recordContext(story.id, sources)
}

/**
 * Read new accepted sources without writing their index or changing Session state.
 * @param ctx - Host services owning original logs.
 * @param story - Detached current Story snapshot.
 * @returns new sources in the same order used by the request-time index writer.
 */
export async function collectContextSources(ctx: Context, story: Story): Promise<readonly ContextSource[]> {
  const sources: ContextSource[] = []
  const existing = new Set(story.world.context.sources.map(source => source.id))
  const sceneId = currentStorySceneCast(story.world)?.sceneId ?? String(story.currentSceneSessionId ?? story.id)
  const logs = new Map<string, readonly SessionEvent[]>()
  const read = async (id: string): Promise<readonly SessionEvent[]> => {
    const events = logs.get(id) ?? await sourceEvents(ctx, id)
    logs.set(id, events)
    return events
  }
  const identityFrame = (observerId: string, additionalIds: readonly string[] = []) => {
    const refs: Record<string, string> = { [observerId]: 'self' }
    const labels: Record<string, string> = { [observerId]: '你' }
    for (const actorId of new Set([...(currentStorySceneCast(story.world)?.presentActorIds ?? []), ...additionalIds])) {
      if (actorId === observerId) continue
      const encounters = story.world.characters.encounters.filter(item => item.observerId === observerId && item.actorId === actorId)
      const encounter = encounters.find(item => item.sceneId !== '') ?? encounters.at(-1)
      refs[actorId] = encounter?.ref ?? 'unidentified'
      labels[actorId] = encounter === undefined ? '未具名的人物' : encounterLabel(encounter, story.world.characters.knowledge[observerId] ?? emptyKnowledge())
    }
    return { refs, labels }
  }
  const add = (source: Omit<ContextSource, 'order'>): void => {
    if (!existing.has(source.id)) { sources.push({ ...source, order: 0 }); existing.add(source.id) }
  }
  if (story.currentSceneSessionId !== undefined) {
    const session = ctx.sessions.get(story.currentSceneSessionId)
    const events = session?.events ?? await read(story.currentSceneSessionId)
    const surface = session?.surface.nodes ?? foldSurface(events).nodes
    // Only live surface input is indexed here. Restored indexes own earlier scenes.
    for (const event of events) {
      if (event.type !== 'user/message' || event.data.source.kind !== 'user'
        || !surface.includes(event.seq)) continue
      add({ id: `input:${story.currentSceneSessionId}:${event.seq}`, sceneId, kind: 'player-input', scopes: ['director'],
        locator: { kind: 'session', sessionId: story.currentSceneSessionId, seq: event.seq, path: ['data', 'content'] } })
    }
  }
  for (const event of story.world.events) {
    if (existing.has(event.id)) continue
    let locator: ContextSource['locator'] = { kind: 'world', eventId: event.id }
    let scopes = ['director']
    const actionTargets: string[] = []
    if ((event.kind === 'actor-speech' || event.kind === 'actor-action') && event.sourceEventRef !== undefined) {
      const split = event.sourceEventRef.lastIndexOf(':')
      const sessionId = event.sourceEventRef.slice(0, split)
      const [position, operation] = event.sourceEventRef.slice(split + 1).split('#')
      const seq = Number(position)
      const physical = (await read(sessionId))[seq]
      const index = operation === undefined ? undefined : Number(operation)
      const original = index === undefined ? physical
        : physical?.type === 'actor/commit' ? physical.data.operations[index] : undefined
      const prefix = index === undefined ? ['data'] : ['data', 'operations', String(index), 'data']
      if (original?.type === 'actor/expression') {
        locator = { kind: 'session', sessionId, seq, path: [...prefix, 'expression', 'text'] }
      } else if (original?.type === 'actor/action-intent') {
        const action = (original.data as { action?: { target?: unknown } }).action
        if (typeof action?.target === 'string' && story.world.characters.entries.some(item => item.definition.actorId === action.target)) {
          actionTargets.push(action.target)
        }
        locator = { kind: 'session', sessionId, seq, path: [...prefix, 'action'] }
      } else throw new Error('Accepted Actor source is unavailable')
      scopes = [...new Set(['director', ...(event.actorId === undefined ? [] : [contextScope(event.actorId)]),
        ...(event.kind === 'actor-speech' ? event.audience.map(contextScope) : [])])]
    } else if (event.kind === 'director-narration') {
      for (const scene of story.sessions.filter(item => item.role === 'scene')) {
        const events = await read(scene.sessionId)
        const projected = events.find(candidate => candidate.type === 'story/director-narration-projected'
          && candidate.data.worldEventId === event.id)
        if (projected !== undefined) {
          const call = events.findLast(candidate => candidate.seq < projected.seq && candidate.type === 'tool/call'
            && candidate.data.name === 'director_narrate')
          locator = call === undefined
            ? { kind: 'session', sessionId: scene.sessionId, seq: projected.seq, path: ['data', 'content'] }
            : { kind: 'session', sessionId: scene.sessionId, seq: call.seq, path: ['data', 'arguments', 'text'] }
          break
        }
      }
      if (locator.kind === 'world') {
        for (const scene of story.sessions.filter(item => item.role === 'scene')) {
          const call = (await read(scene.sessionId)).findLast((candidate) => {
            if (candidate.type !== 'tool/call' || candidate.data.name !== 'director_narrate') return false
            try {
              const args = JSON.parse(candidate.data.arguments) as { expected_world_revision?: number; text?: string }
              return args.expected_world_revision === event.revision - 1 && typeof args.text === 'string'
            } catch { return false }
          })
          if (call !== undefined) {
            locator = { kind: 'session', sessionId: scene.sessionId, seq: call.seq, path: ['data', 'arguments', 'text'] }
            break
          }
        }
      }
    }
    add({ id: event.id, sceneId, kind: event.kind, scopes, locator,
      ...(event.kind === 'actor-action' && event.actorId !== undefined ? { perspectives: { [event.actorId]: identityFrame(event.actorId, actionTargets) } } : {}), ...(event.actorId === undefined ? {} : { actorId: event.actorId }) })
  }
  for (const perception of story.world.perceptions) {
    const viewer = contextScope(perception.actorId)
    const original = [...story.world.context.sources, ...sources].find(source => source.id === perception.sourceEventId)
    // Speech is already represented by exactly the same visible source.
    if (original?.scopes.includes(viewer)) continue
    const actorId = story.world.events.find(event => event.id === perception.sourceEventId)?.actorId
    add({ id: perception.id, sceneId, kind: 'perception', scopes: [viewer], ...(actorId === undefined ? {} : { actorId }),
      locator: { kind: 'perception', perceptionId: perception.id } })
  }
  for (const discussion of story.discussions.discussions) {
    for (const turn of discussion.turns) {
      if (turn.sourceEventRef !== undefined && story.world.events.some(event => event.sourceEventRef === turn.sourceEventRef)) continue
      add({ id: turn.id, sceneId, kind: 'discussion-speech', actorId: turn.speakerId, scopes: ['director', ...discussion.participantIds.map(contextScope)],
        locator: { kind: 'discussion', discussionId: discussion.id, turnId: turn.id } })
    }
  }
  const brief = story.plotLedger.latestBrief
  if (brief !== undefined) {
    const events = await read(brief.directorSessionId)
    const call = events.findLast((event) => {
      if (event.type !== 'tool/call' || event.data.name !== 'director_commit_brief') return false
      let args: unknown
      try { args = JSON.parse(event.data.arguments) as unknown } catch { return false }
      return args !== null && typeof args === 'object' && 'expected_ledger_revision' in args
        && args.expected_ledger_revision === brief.sourceLedgerRevision
    })
    if (call !== undefined) brief.actorBriefs.forEach((actor, index) => {
      add({ id: `brief:${brief.directorSessionId}:${call.seq}:${actor.actorId}`, sceneId, kind: 'perception',
        scopes: [contextScope(actor.actorId)], perspectives: { [actor.actorId]: identityFrame(actor.actorId) }, locator: { kind: 'session', sessionId: brief.directorSessionId,
          seq: call.seq, path: ['data', 'arguments', 'actor_briefs', String(index)] } })
    })
  }
  const ordered = await Promise.all(sources.map(async (source) => {
    const location = source.locator
    const timestamp = location.kind === 'session' ? (await read(location.sessionId))[location.seq]?.time
      : location.kind === 'world' ? story.world.events.find(event => event.id === location.eventId)?.createdAt
        : location.kind === 'perception' ? story.world.perceptions.find(perception => perception.id === location.perceptionId)?.createdAt
          : story.discussions.discussions.find(discussion => discussion.id === location.discussionId)
            ?.turns.find(turn => turn.id === location.turnId)?.createdAt
    if (timestamp === undefined) throw new Error(`Original source time is unavailable: ${source.id}`)
    return { source, time: typeof timestamp === 'number' ? timestamp : Date.parse(timestamp) }
  }))
  ordered.sort((left, right) => left.time - right.time)
  return ordered.map(item => item.source)
}
