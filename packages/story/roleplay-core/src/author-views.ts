import { recipeOf } from './context-recipe.ts'
import { directorOutlineSchema } from './outline-rules.ts'
/** Author query composition exposes settings without a Story aggregate or live execution session. */
import { z } from 'zod'
import { resolveInstanceSettings } from './settings.ts'
import { parseStorybookDocument } from './storybook.ts'
import { resolveStyle, styleOverridesSchema } from './style.ts'
import { entity } from './records.ts'
import { personOf, sceneOf, stateOf } from './world.ts'
import type { AuthorWorkspaceView, Instance, InstanceId, InstanceOverview, NarrativeReader,
  NarrativeSnapshot, TemplateVersion, TemplateVersionId } from './types.ts'

/** The author reader receives only pinned-version lookup and instance enumeration from the library. */
export class AuthorQueries {
  constructor(private readonly narrative: NarrativeReader,
    private readonly books: { version(id: TemplateVersionId): TemplateVersion; instances(): readonly Instance[] }) {}

  /** Return human-readable navigation data without reading another instance's running state. */
  instances(): readonly InstanceOverview[] {
    return this.books.instances().map(instance => this.overview(this.narrative.snapshot(instance.id)))
  }

  /** Read one explicit author revision and optionally one character's effective style. */
  workspace(input: { instanceId: InstanceId; revision?: number; actorId?: string }): AuthorWorkspaceView {
    const snapshot = input.revision === undefined ? this.narrative.snapshot(input.instanceId)
      : this.narrative.replay(input.instanceId, input.revision)
    const scene = sceneOf(snapshot)
    const book = parseStorybookDocument(entity(snapshot, { collection: 'setting', id: 'book' }))
    const styles = styleOverridesSchema.parse(entity(snapshot, { collection: 'style', id: 'current' }))
    const director = resolveStyle({ kind: 'director', guidance: book.directorGuidance }, styles, 'director', scene.id)
    const person = input.actorId === undefined ? undefined : personOf(snapshot, input.actorId)
    const actor = person === undefined ? undefined : { key: `actor:${person.definition.actorId}`, actorId: person.definition.actorId,
      label: person.definition.displayName, ...resolveStyle({ kind: 'actor', guidance: person.definition.actingGuidance },
        styles, `actor:${person.definition.actorId}`, scene.id) }
    return { instance: this.overview(snapshot),
      configurationRevision: z.number().int().nonnegative().parse(entity(snapshot, { collection: 'configuration', id: 'revision' })),
      settings: resolveInstanceSettings(snapshot), scene, styles, director: { key: 'director', ...director },
      contextRecipe: recipeOf(snapshot), outline: directorOutlineSchema.parse(entity(snapshot, { collection: 'planning', id: 'current' })),
      ...(actor === undefined ? {} : { actor }), worldState: stateOf(snapshot, 'world') }
  }

  private overview(snapshot: NarrativeSnapshot): InstanceOverview {
    const version = this.books.version(snapshot.instance.templateVersionId)
    return { ...snapshot.instance, title: resolveInstanceSettings(snapshot).effective.title,
      book: { id: version.bookId, title: version.title, version: version.number } }
  }
}
