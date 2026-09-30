import { assertCreativeIdle, localCreativeEdits } from './creative-settings.ts'
import { contextRecipeSchema, recipeOf, type ContextRecipe } from './context-recipe.ts'
import { settingsUpdateSchema, type SettingsUpdateInput } from './command-inputs.ts'
/** Instance configuration changes share the narrative revision and never mutate the pinned book. */
import { z } from 'zod'
import { styleOverridesSchema, updateStyle } from './style.ts'
import { castOf, json, replace, sceneOf } from './world.ts'
import { entity, RoleplayError } from './records.ts'
import type { CommandScope, NarrativeCommit, NarrativeWriter } from './types.ts'

import { styleUpdateSchema } from './command-inputs.ts'
export { styleUpdateSchema } from './command-inputs.ts'

/** Style authoring stays separate from knowledge, presence, and model execution. */
export class ConfigurationApplication {
  constructor(private readonly commands: NarrativeWriter) {}

  /** Replace source order and authored modules without changing execution permissions. */
  setRecipe(scope: CommandScope, input: ContextRecipe): NarrativeCommit {
    const recipe = contextRecipeSchema.parse(input)
    return this.commands.execute({ ...scope, kind: 'configuration.recipe', input: json(recipe) }, (snapshot) => {
      if (scope.principal.kind !== 'player') throw new RoleplayError('invalid', 'Only the player may edit context recipes')
      assertCreativeIdle(snapshot)
      if (recipe.revision !== recipeOf(snapshot).revision) throw new RoleplayError('conflict', 'Context recipe revision changed')
      return { events: [...localCreativeEdits(snapshot, recipe), replace('context-recipe', 'current', { ...recipe, revision: recipe.revision + 1 }),
        replace('configuration', 'revision', scope.expectedRevision + 1)], result: { recipeRevision: recipe.revision + 1 } }
    })
  }

  /** Replace only this instance's ongoing settings; character seeds and pinned versions stay immutable. */
  setSettings(scope: CommandScope, input: SettingsUpdateInput): NarrativeCommit {
    const update = settingsUpdateSchema.parse(input)
    return this.commands.execute({ ...scope, kind: 'configuration.settings', input: json(update) }, () => {
      if (scope.principal.kind !== 'player') throw new RoleplayError('invalid', 'Only the player may edit instance settings')
      return { events: [replace('setting', 'overrides', update.overrides),
        replace('configuration', 'revision', scope.expectedRevision + 1)],
      result: { configurationRevision: scope.expectedRevision + 1 } }
    })
  }

  /** Apply one revision-checked override; the next request resolves it from this committed snapshot. */
  setStyle(scope: CommandScope, input: z.infer<typeof styleUpdateSchema>): NarrativeCommit {
    const update = styleUpdateSchema.parse(input)
    return this.commands.execute({ ...scope, kind: 'configuration.style', input: json(update) }, (snapshot) => {
      if (scope.principal.kind !== 'player' && !(scope.principal.kind === 'director' && update.scope === 'scene')) {
        throw new RoleplayError('invalid', 'Only the player may edit story style; directors may guide the current scene')
      }
      const style = updateStyle(styleOverridesSchema.parse(entity(snapshot, { collection: 'style', id: 'current' })),
        update, castOf(snapshot).entries.map(item => item.definition.actorId), sceneOf(snapshot).id)
      return { events: [replace('style', 'current', style), replace('configuration', 'revision', snapshot.instance.revision + 1)],
        result: { configurationRevision: snapshot.instance.revision + 1 } }
    })
  }
}
