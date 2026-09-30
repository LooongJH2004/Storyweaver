/** Package ownership for @deepseek-ai/dsh-roleplay-store-sqlite. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
export const name = 'roleplay-store-sqlite-invariant'
export const inject = ['invariants']
/**
 * No runtime invariant: SQLite transaction atomicity and reopen durability require provider conformance tests; this
 * library does not publish a Cordis event stream.
 */
const install: InvariantInstaller = () => {}
/** Register companion ownership and return its disposer. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register('@deepseek-ai/dsh-roleplay-store-sqlite', install))
