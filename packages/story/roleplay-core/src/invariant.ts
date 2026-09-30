/** Package ownership for @deepseek-ai/dsh-roleplay-core. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
export const name = 'roleplay-core-invariant'
export const inject = ['invariants']
/**
 * No runtime invariant: the application is constructed from explicit ports; the Harness adapter owns live instance
 * registrations. Commit and replay relations are checked by the provider conformance suite.
 */
const install: InvariantInstaller = () => {}
/** Register companion ownership and return its disposer. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register('@deepseek-ai/dsh-roleplay-core', install))
