/** Cordis ownership for independent narrative application registration. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
/** Companion plugin name. */
export const name = 'roleplay-services-invariant'
/** Invariants require their registry. */
export const inject = ['invariants']
/**
 * No runtime invariant: registration disposal is owned by Cordis and verified by the
 * real composition test; transaction relations belong to the narrative store conformance suite.
 */
const install: InvariantInstaller = () => {}
/** Register this package's lifecycle ownership. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register('@deepseek-ai/dsh-roleplay-services', install))
