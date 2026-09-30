/** Per-Agent tool boundary for the Storyweaver Director preset. */

import type { Context } from '@deepseek-ai/cordis'

export const name = 'tool-storyweaver-director-boundary'
export const inject = ['tools']

/** Complete Host-owned model capability vocabulary of an ordinary Story Director. */
export const DIRECTOR_TOOL_NAMES = [
  'roleplay_recall',
  'director_find_characters',
  'director_create_character',
  'director_stage_scene',
  'director_narrate',
  'director_commit_brief',
  'director_update_outline',
  'director_propose_memory',
  'director_start_discussion',
  'director_resolve_discussion',
  'director_dispatch_actors',
] as const

/** Keep inherited Host tools out of an ordinary Story Session. */
export function apply(ctx: Context): void {
  ctx.tools.presentAs('native')
  ctx.tools.restrict({ allow: DIRECTOR_TOOL_NAMES })
}
