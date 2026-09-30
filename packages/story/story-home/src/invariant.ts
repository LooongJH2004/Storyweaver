/** Package-owned invariant companion for Story Home. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-story-home'

/** Cordis companion plugin name. */
export const name = 'story-home-invariant'
/** Invariant registry required by the companion. */
export const inject = ['invariants']

/** No runtime invariant: the owning service enforces path containment synchronously. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant ownership.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
