/** Package-owned relational checks for Actor and PlayerAuthority Session events. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { applyActorEvent, foldActor, isActorEvent } from './fold.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-actor'

/** Cordis companion plugin name. */
export const name = 'actor-invariant'
/** Invariant registry required by the companion. */
export const inject = ['invariants']

/** Validate every candidate Actor event against its committed Session prefix. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    if (!isActorEvent(event)) return
    try {
      const state = foldActor(session.events)
      applyActorEvent(state, event)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      fail(`session event ${event.seq} violates the Actor stream: ${message}`)
    }
  }, { global: true })
}, { inject: ['sessions'] })

/** Register this package's invariant ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
