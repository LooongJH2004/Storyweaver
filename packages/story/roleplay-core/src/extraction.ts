/** Material selection creates a new author draft; it never updates a running instance. */
import { z } from 'zod'
import { StorybookLibrary } from './library.ts'
import { parseStorybookDocument, type StorybookActorDefinition } from './storybook.ts'
import { entity, RoleplayError } from './records.ts'
import { castOf, json, knowledgeOf, personOf, lifecycleFor, stateOf } from './world.ts'
import type { BookDraft, CommandId, Document, InstanceId, NarrativeSnapshot } from './types.ts'
import type { NarrativeReader } from './types.ts'

import { materialSelectionSchema } from './command-inputs.ts'
export { materialSelectionSchema } from './command-inputs.ts'

export type { ExtractionPreview } from './types.ts'
import type { ExtractionPreview } from './types.ts'

function materialDocument(snapshot: NarrativeSnapshot, selection: z.infer<typeof materialSelectionSchema>, title: string): Document {
  const cast = castOf(snapshot)
  if (new Set(selection.people).size !== selection.people.length) throw new RoleplayError('invalid', 'Selected person is repeated')
  const people: StorybookActorDefinition[] = selection.people.map((actorId) => {
    const person = personOf(snapshot, actorId)
    return { ...structuredClone(person.definition), state: [], initialKnowledge: [], privateContext: { perspective: [],
      coreMemories: [], goals: [], intentions: [] } }
  })
  const selectedPerson = (actorId: string): StorybookActorDefinition => {
    const person = people.find(item => item.actorId === actorId)
    if (person === undefined) throw new RoleplayError('invalid', 'Select the owner before extracting private material')
    return person
  }
  for (const item of selection.knowledge) {
    const owner = selectedPerson(item.actorId)
    const knowledge = knowledgeOf(snapshot, item.actorId).entries.find(entry => entry.id === item.id && entry.status === 'active')
    if (knowledge === undefined) throw new RoleplayError('not-found', 'Selected judgment is unavailable')
    const encounter = knowledge.kind === 'identity' ? cast.encounters.find(encounter => encounter.observerId === item.actorId && encounter.ref === knowledge.entityRefs[0]) : undefined
    if (encounter?.actorId !== undefined) selectedPerson(encounter.actorId)
    owner.initialKnowledge.push({ text: knowledge.text, kind: knowledge.kind, attitude: knowledge.attitude,
      ...(encounter?.actorId === undefined ? {} : { targetActorId: encounter.actorId }),
      ...(knowledge.label === undefined ? {} : { label: knowledge.label }) })
  }
  for (const item of selection.state) {
    const entry = stateOf(snapshot, item.owner).entries.find(entry => entry.definition.id === item.fieldId && entry.active)
    if (entry === undefined) throw new RoleplayError('not-found', 'Selected state is unavailable')
    const owner = selectedPerson(entry.definition.actorId)
    if (entry.definition.targetActorId !== undefined) selectedPerson(entry.definition.targetActorId)
    for (const audience of entry.definition.audience) selectedPerson(audience)
    owner.state.push({ definition: structuredClone(entry.definition), value: structuredClone(entry.value) })
  }
  for (const item of selection.memories) {
    const owner = selectedPerson(item.actorId)
    const memory = [...lifecycleFor(snapshot,
      item.actorId).memories.values()].find(record => record.record.id === item.id && record.status === 'active')
    if (memory === undefined) throw new RoleplayError('not-found', 'Selected memory is unavailable')
    owner.privateContext.coreMemories.push({ content: memory.record.content, importance: memory.record.importance,
      ...(memory.record.meaning === undefined ? {} : { meaning: memory.record.meaning }) })
  }
  const facts: Document = {}
  for (const id of selection.factIds) {
    const fact = entity(snapshot, { collection: 'facts', id })
    if (fact === undefined) throw new RoleplayError('not-found', 'Selected world fact is unavailable')
    facts[id] = fact
  }
  return json(parseStorybookDocument({ schemaVersion: 6, id: `extracted-${snapshot.instance.id}`, title, directorPrompt: '',
    characters: people, directorGuidance: {}, worldTruth: facts })) as Document
}

/** Author-only application: review and save use identical selection rules. */
export class MaterialExtraction {
  constructor(private readonly commands: NarrativeReader, private readonly library: StorybookLibrary) {}

  preview(instanceId: InstanceId, selection: z.infer<typeof materialSelectionSchema>, title: string): ExtractionPreview {
    const snapshot = this.commands.snapshot(instanceId)
    return { instanceId, revision: snapshot.instance.revision, document: materialDocument(snapshot, selection, title) }
  }

  save(input: { instanceId: InstanceId
    expectedRevision: number
    commandId: CommandId
    selection: z.infer<typeof materialSelectionSchema>
    title: string }): BookDraft {
    return this.library.extract({ ...input, selection: json(input.selection) as Document },
      snapshot => materialDocument(snapshot, input.selection, input.title))
  }
}
