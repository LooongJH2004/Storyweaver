/** Package-owned invariant companion for the Story Controller. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-api-story-controller'

/** Cordis companion plugin name. */
export const name = 'api-story-controller-invariant'
/** Invariant registry required by the companion. */
export const inject = ['invariants']

/** No runtime invariant: Story Registry owns persistence and every feed starts with a full baseline. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
