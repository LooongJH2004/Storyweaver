/** Package-owned invariant companion for the roleplaying Web presentation. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-client-ui-roleplay'

/** Cordis companion plugin name. */
export const name = 'client-ui-roleplay-invariant'
/** Invariant registry dependency. */
export const inject = ['invariants']

// No runtime invariant: this package owns disposable Client registrations only.
const install: InvariantInstaller = () => {}

/** Register this package's invariant ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
