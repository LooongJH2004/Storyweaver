/** Package-owned relational checks for Story-owned NPC behavior events. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { isNpcBehaviorEvent, npcEventFromActorTool } from './director.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-story'

/** Cordis companion plugin name. */
export const name = 'story-invariant'
/** Invariant registry required by the companion. */
export const inject = ['invariants']

/** Reject Actor-origin behavior in a Story when no matching NPC tool call owns it. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    const candidate: { readonly type: string; readonly seq: number; readonly data: unknown } = event
    if (!isNpcBehaviorEvent(candidate) || behaviorOrigin(candidate) !== 'actor') return
    const owner = ctx.storyRegistry.storyForSession(session.id)
    if (owner?.role !== 'actor' || owner.archived || owner.actorId === undefined) return
    let accepted: ReturnType<typeof npcEventFromActorTool>
    try {
      accepted = npcEventFromActorTool(
        session.id,
        owner.actorId,
        session.events,
        candidate,
        ctx.storyRegistry.get(owner.storyId)?.plotLedger.revision ?? 0,
      )
    } catch (error: unknown) {
      fail(`Session '${session.id}' event ${candidate.seq} violates Story Actor ownership: ${String(error)}`)
    }
    if (accepted === undefined) {
      fail(`Session '${session.id}' event ${candidate.seq} has no matching open NPC tool call`)
    }
  }, { global: true })
}, { inject: ['sessions', 'storyRegistry'] })

/**
 * Register this package's invariant ownership.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))

function behaviorOrigin(event: {
  readonly type: 'actor/expression' | 'actor/action-intent'
  readonly data: unknown
}): unknown {
  if (event.data === null || typeof event.data !== 'object') return undefined
  const key = event.type === 'actor/expression' ? 'expression' : 'action'
  const value = Reflect.get(event.data, key) as unknown
  return value === null || typeof value !== 'object'
    ? undefined
    : Reflect.get(value, 'origin') as unknown
}
