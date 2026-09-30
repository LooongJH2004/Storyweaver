/** Planning application keeps candidate outcomes separate from settled world facts. */
import { directorOutlineSchema, applyDirectorOutlinePatch, replaceDirectorOutlineByPlayer,
  resolveDirectorOutlineSuggestion } from './outline-rules.ts'
import { entity, RoleplayError } from './records.ts'
import { json, replace } from './world.ts'
import type { DirectorOutline, DirectorOutlinePatchInput } from './outline-model.ts'
import { outlinePlayerUpdateSchema, type OutlinePlayerUpdateInput } from './command-inputs.ts'
import type { CommandScope, NarrativeCommit, NarrativeSnapshot, NarrativeWriter, RuntimeValues } from './types.ts'

/** One transaction owns plan revision, locks, pending suggestions and their audit history. */
export class PlanningApplication {
  constructor(private readonly commands: NarrativeWriter, private readonly values: RuntimeValues) {}

  /** Director changes obey the player's lock policy and never settle candidate events. */
  patch(scope: CommandScope, input: DirectorOutlinePatchInput): NarrativeCommit {
    return this.commands.execute({ ...scope, kind: 'planning.patch', input: json(input) }, (snapshot) => {
      if (scope.principal.kind !== 'director') throw new RoleplayError('invalid', 'Only the director may propose an automatic outline patch')
      this.sources(snapshot, input)
      const current = directorOutlineSchema.parse(entity(snapshot, { collection: 'planning', id: 'current' }))
      const next = applyDirectorOutlinePatch(current, input, this.values)
      return { events: [replace('planning', 'current', next)], result: { outlineRevision: next.revision } }
    })
  }

  /** Player replacement or proposal review changes planning, without restoring any execution session. */
  update(scope: CommandScope, input: OutlinePlayerUpdateInput): NarrativeCommit {
    const accepted = outlinePlayerUpdateSchema.parse(input)
    return this.commands.execute({ ...scope, kind: 'planning.player-update', input: json(accepted) }, (snapshot) => {
      if (scope.principal.kind !== 'player') throw new RoleplayError('invalid', 'Only the player may edit or review planning')
      const current = directorOutlineSchema.parse(entity(snapshot, { collection: 'planning', id: 'current' }))
      const next = accepted.operation === 'replace'
        ? replaceDirectorOutlineByPlayer(current, accepted.expectedOutlineRevision, accepted.outline, accepted.reason, this.values)
        : resolveDirectorOutlineSuggestion(current, accepted.expectedOutlineRevision, accepted.suggestionId, accepted.accept, this.values)
      this.sources(snapshot, next)
      return { events: [replace('planning', 'current', next)], result: { outlineRevision: next.revision } }
    })
  }

  private sources(snapshot: NarrativeSnapshot, outline: DirectorOutlinePatchInput | DirectorOutline): void {
    const refs = [...outline.beats?.flatMap(beat => beat.resolvedByEventRefs) ?? [],
      ...outline.foreshadows?.flatMap(item => [...item.plantedEventRefs, ...item.payoffEventRefs]) ?? [],
      ...outline.mysteries?.flatMap(item => item.evidenceEventRefs) ?? []]
    for (const ref of refs) if (!snapshot.entities.some(item => ['facts', 'behavior', 'narration'].includes(item.key.collection)
      && item.key.id === ref)) throw new RoleplayError('invalid', 'Outline evidence is unavailable in this instance')
  }
}
