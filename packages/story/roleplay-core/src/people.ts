import { currentDiscussion } from './discussions.ts'
/** Character creation and author editing require no live Actor or execution log. */
import { z } from 'zod'
import type { NarrativeWriter } from './types.ts'
import { frameStoryCharacters, seedCharacterKnowledge, type StoryCharacter } from './characters.ts'
import { initializeDynamicState, applyStateChanges } from './dynamic-state.ts'
import { RoleplayError } from './records.ts'
import { castOf, json, sceneOf, personOf, replace, stateOf, seedCharacterLifecycle } from './world.ts'
import type { CommandScope, NarrativeCommit, RuntimeValues } from './types.ts'

import { createPersonSchema, revisePersonSchema, stageSceneSchema } from './command-inputs.ts'
export { createPersonSchema, revisePersonSchema, stageSceneSchema } from './command-inputs.ts'

/** Application owner for person registration, revision, and physical attendance. */
export class PeopleApplication {
  constructor(private readonly commands: NarrativeWriter, private readonly values: RuntimeValues) {}

  create(scope: CommandScope, input: z.infer<typeof createPersonSchema>): NarrativeCommit {
    return this.commands.execute({ ...scope, kind: 'person.create', input: json(input) }, (snapshot) => {
      if (scope.principal.kind !== 'player' && scope.principal.kind !== 'director') throw new RoleplayError('invalid',
        'Only the player or director may establish a person')
      const cast = castOf(snapshot)
      const actorId = `character-${this.values.id()}`
      const definition = { ...input.definition, actorId }
      const unavailable = definition.initialKnowledge.find(item => item.targetActorId !== undefined
        && !cast.entries.some(person => person.definition.actorId === item.targetActorId))
      if (unavailable !== undefined) {
        throw new RoleplayError('invalid', `Initial knowledge targetActorId ${JSON.stringify(unavailable.targetActorId)} is not a registered person ID. Use an exact existing ID only for knowledge about another person. For the new character's own beliefs or world knowledge, omit targetActorId; do not use their name or self. The host assigns the new ID after creation. Preserve the other valid fields; no person was created.`)
      }
      if (input.sourceRefs.some(ref => !snapshot.entities.some(item => item.key.collection === 'facts' && item.key.id === ref))) {
        throw new RoleplayError('invalid', 'Character creation references unavailable story evidence')
      }
      if (definition.state.some(item => item.definition.actorId !== 'self')) throw new RoleplayError('invalid',
        'A new person must identify initial state ownership as self')
      definition.state = definition.state.map(item => ({ ...item, definition: { ...item.definition, actorId,
        ...(item.definition.targetActorId === 'self' ? { targetActorId: actorId } : {}) } }))
      const person: StoryCharacter = { definition, revision: 1, origin: scope.principal.kind,
        importance: input.importance, purpose: input.purpose, sourceRefs: input.sourceRefs,
        location: input.location, archived: false, createdAt: this.values.now() }
      const next = seedCharacterKnowledge({ ...cast, entries: [...cast.entries, person] }, person, this.values)
      const ids = next.entries.map(item => item.definition.actorId)
      const objective = applyStateChanges(stateOf(snapshot, 'world'),
        definition.state.filter(item => item.definition.owner === 'world').map(item => ({
          fieldId: item.definition.id, expectedRevision: 0, definition: item.definition, value: item.value,
          reason: input.purpose, sourceRefs: input.sourceRefs,
        })), { kind: scope.principal.kind }, ids)
      return { events: [replace('people', actorId, person), replace('knowledge', actorId, next.knowledge[actorId]),
        replace('state', actorId, initializeDynamicState(definition.state.filter(item => item.definition.owner === 'actor'), ids)),
        replace('state', 'world', objective),
        ...seedCharacterLifecycle(definition, this.values).map((change,
          index) => replace(`lifecycle:${actorId}`, `${snapshot.instance.revision + 1}:${index}`, { revision: snapshot.instance.revision + 1, index, change })),
        ...next.encounters.filter(item => !cast.encounters.some(previous => previous.ref === item.ref)).map(item => replace('encounters', item.ref, item)),
      ], result: { actorId, personRevision: 1 } }
    })
  }

  revise(scope: CommandScope, input: z.infer<typeof revisePersonSchema>): NarrativeCommit {
    return this.commands.execute({ ...scope, kind: 'person.revise', input: json(input) }, (snapshot) => {
      if (scope.principal.kind !== 'player') throw new RoleplayError('invalid', 'Only the player may revise character settings')
      const previous = personOf(snapshot, input.actorId)
      if (previous.revision !== input.expectedPersonRevision) throw new RoleplayError('conflict', 'Character revision changed')
      if (input.definition.actorId !== input.actorId) throw new RoleplayError('invalid', 'Character identity cannot change')
      const person: StoryCharacter = { ...previous, definition: input.definition, location: input.location,
        archived: input.archived, importance: input.importance, revision: previous.revision + 1 }
      return { events: [replace('people', input.actorId, person)], result: { actorId: input.actorId, personRevision: person.revision } }
    })
  }

  stage(scope: CommandScope, input: z.infer<typeof stageSceneSchema>): NarrativeCommit {
    return this.commands.execute({ ...scope, kind: 'scene.stage', input: json(input) }, (snapshot) => {
      if (scope.principal.kind !== 'director' && scope.principal.kind !== 'player') throw new RoleplayError('invalid',
        'Actors cannot settle world attendance')
      if (new Set(input.present).size !== input.present.length || new Set(input.appearances.map(item => item.actorId)).size !== input.appearances.length) throw new RoleplayError('invalid', 'Scene repeats a person')
      for (const actorId of input.present) if (personOf(snapshot, actorId).archived) throw new RoleplayError('invalid',
        'Archived people must be restored before entering')
      if (input.appearances.some(item => !input.present.includes(item.actorId))) throw new RoleplayError('invalid',
        'Appearance is not in this scene')
      const discussion = currentDiscussion(snapshot)
      if (discussion !== undefined && (sceneOf(snapshot).id !== input.id
        || discussion.participantIds.some(id => !input.present.includes(id)))) {
        throw new RoleplayError('invalid', 'Close the current discussion before changing its scene or removing participants')
      }
      const next = frameStoryCharacters(castOf(snapshot), input.id, input.present, input.appearances, this.values)
      return { events: [replace('scene', 'current', { id: input.id, location: input.location, present: input.present }),
        ...next.encounters.map(item => replace('encounters', item.ref, item)),
      ], result: { sceneId: input.id } }
    })
  }
}
