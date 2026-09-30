/** Director narration is revised before its objective event and perceptions are published. */
import { z } from 'zod'
import { observationSchema } from './command-inputs.ts'
import { observationEvents } from './cognition.ts'
import { narrationCharacterCount, recipeOf } from './context-recipe.ts'
import { entity, RoleplayError } from './records.ts'
import { castOf, json, replace } from './world.ts'
import { renderPerspectiveText } from './characters.ts'
import type { CommandScope, NarrativeCommit, NarrativeWriter, RuntimeValues } from './types.ts'

/** One revision addresses the exact current draft; settlement replaces all factual fields when supplied. */
export const narrationRevisionSchema = z.strictObject({ draftRevision: z.number().int().nonnegative(),
  mode: z.enum(['append', 'replace']), narration: z.string().trim().min(1),
  settlement: observationSchema.omit({ narration: true }).optional(),
})
/** Drafts remain author records and never enter facts, perceptions, or the accepted transcript. */
export const narrationDraftSchema = z.strictObject({ attempt: z.string(), revision: z.number().int().nonnegative(),
  status: z.enum(['pending', 'exhausted', 'published']), input: observationSchema,
  characters: z.number().int().nonnegative(), minimum: z.number().int().positive(), target: z.number().int().positive(),
})

/** The world application validates and publishes the final combined settlement exactly once. */
export class NarrationApplication {
  constructor(private readonly writer: NarrativeWriter, private readonly values: RuntimeValues) {}

  /** Start a draft when below the saved minimum, otherwise publish the observation atomically. */
  observe(scope: CommandScope, input: z.infer<typeof observationSchema>): NarrativeCommit {
    return this.submit(scope, input)
  }

  /** Append or replace narration against an exact draft revision, with at most two revisions. */
  revise(scope: CommandScope, input: z.infer<typeof narrationRevisionSchema>): NarrativeCommit {
    return this.submit(scope, undefined, narrationRevisionSchema.parse(input))
  }

  private submit(scope: CommandScope, original?: z.infer<typeof observationSchema>,
    revision?: z.infer<typeof narrationRevisionSchema>): NarrativeCommit {
    return this.writer.execute({ ...scope, kind: 'director.narration', input: json(revision ?? original) }, (snapshot) => {
      if (scope.principal.kind !== 'director') throw new RoleplayError('invalid', 'Only the active director can revise narration')
      const attempt = scope.principal.attempt
      const raw = entity(snapshot, { collection: 'narration-draft', id: attempt })
      const previous = raw === undefined ? undefined : narrationDraftSchema.parse(raw)
      let input = original
      let draftRevision = 0
      if (revision !== undefined) {
        if (previous?.status !== 'pending' || previous.revision !== revision.draftRevision) {
          throw new RoleplayError('conflict', 'Narration draft is unavailable or its revision changed; use the latest draft receipt')
        }
        draftRevision = previous.revision + 1
        input = { ...(revision.settlement ?? previous.input), narration: revision.mode === 'append'
          ? `${previous.input.narration ?? ''}\n\n${revision.narration}` : revision.narration }
      } else if (previous !== undefined && previous.status !== 'published') {
        throw new RoleplayError('conflict', 'An unpublished narration draft exists; revise it instead of submitting another observation')
      }
      if (input === undefined) throw new RoleplayError('invalid', 'Missing narration settlement')
      input = observationSchema.parse(input)
      const settings = recipeOf(snapshot).narrationLength
      const characters = narrationCharacterCount(renderPerspectiveText(input.narration ?? '', castOf(snapshot), 'observer'))
      const draft = settings?.enabled && input.narration !== undefined ? {
        attempt, revision: draftRevision, status: characters >= settings.minimum ? 'published' as const
          : draftRevision >= 2 ? 'exhausted' as const : 'pending' as const,
        input, characters, minimum: settings.minimum, target: settings.target,
      } : undefined
      if (draft !== undefined && draft.status !== 'published') {
        return { events: [replace('narration-draft', attempt, draft)], result: json({ narrationDraft: {
          ...draft, remaining: Math.max(0, draft.minimum - characters), revisionsRemaining: Math.max(0, 2 - draftRevision),
          instruction: draft.status === 'exhausted'
            ? 'Narration is still below the saved minimum after two revisions. Nothing was published; stop for author review.'
            : 'Nothing was published. Call director_revise_narration with this draftRevision. Append only NEW prose, or replace the whole narration to expand existing passages. Keep facts and perceptions consistent; provide complete settlement fields if facts change. Do not repeat accepted events or finish before publication.',
        } }) }
      }
      const settled = observationEvents(snapshot, scope, input, this.values)
      return { events: [...settled.events, ...(draft === undefined ? [] : [replace('narration-draft', attempt, draft)])],
        result: json({ ...settled.result, ...(draft === undefined ? {} : { narrationDraft: {
          status: draft.status, characters, minimum: draft.minimum, target: draft.target, revision: draftRevision,
        } }) }) }
    })
  }
}
