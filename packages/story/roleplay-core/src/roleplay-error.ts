/** Shared roleplay rule failures retain their public codes across adapters. */
export class StoryRoleplayError extends Error {
  constructor(
    readonly code: 'STALE_WORLD_REVISION' | 'STALE_MEMORY_REVISION' | 'STALE_DISCUSSION_REVISION'
      | 'STALE_CONTEXT_RECIPE_REVISION' | 'UNKNOWN_ACTOR_EVENT' | 'DUPLICATE_SETTLEMENT'
      | 'UNKNOWN_ACTOR' | 'INVALID_MEMORY_STATE' | 'INVALID_DISCUSSION_STATE' | 'INVALID_CONTEXT_RECIPE'
      | 'INVALID_SCENE_STATE',
    message: string,
  ) {
    super(message)
    this.name = 'StoryRoleplayError'
  }
}
