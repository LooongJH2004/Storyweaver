/** Entry adapters delegate every fictional invariant to the application that owns the command. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
/** Invariant companion name. */
export const name = 'api-roleplay-controller-invariant'
/** Invariant ownership registry. */
export const inject = ['invariants']
/** No owned mutable narrative records: command services validate all state. */
const install: InvariantInstaller = () => {}
/** Register this package's explicitly empty invariant ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register('@deepseek-ai/dsh-api-roleplay-controller', install))
