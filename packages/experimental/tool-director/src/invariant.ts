/** Package-owned invariant companion for Director orchestration. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-tool-director'

/** Cordis companion plugin name. */
export const name = 'tool-director-invariant'
/** Invariant registry dependency. */
export const inject = ['invariants']

// No runtime invariant: durable Story and Actor relations are validated by their owning domain services.
const install: InvariantInstaller = () => {}

/** Register this package's invariant ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
