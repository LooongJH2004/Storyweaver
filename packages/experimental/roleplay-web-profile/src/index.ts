/** Private Web profile runtime seams for the roleplaying Client presentation. */

import type { Context } from '@deepseek-ai/cordis'
import { DirectoryPickerController } from '@deepseek-ai/dsh-api-workspace-controller'

/** Cordis plugin name. */
export const name = 'roleplay-web-profile'
/** The profile bridge activates only after its Host-only picker backend exists. */
export const inject = ['directoryPicker']

/**
 * Export only the directory-authorization Remote used by creation tasks.
 * Generic Workspace ownership and its Client directory-flow surfaces remain
 * absent from the roleplaying product profile.
 * @param ctx - roleplaying Host context carrying the native directory picker.
 */
export function apply(ctx: Context): void {
  ctx.plugin(DirectoryPickerController)
}
