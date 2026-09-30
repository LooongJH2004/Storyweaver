/** Package-owned invariant companion for the Actor tool adapter. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-tool-actor'

/** Cordis companion plugin name. */
export const name = 'tool-actor-invariant'
/** Invariant registry dependency. */
export const inject = ['invariants']

/** No runtime invariant: durable relations are owned by the Actor service; this adapter adds no new records. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
