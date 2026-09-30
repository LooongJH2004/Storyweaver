/** Translate model semantics into staged domain changes before the narrative commit publishes. */
import { applyNpcTurn, type NpcTurnInput } from './npc-turn.ts'
import type { CharacterCommands, CharacterAccess } from './actor-commands.ts'
import { applyCharacterChange, characterLifecycleChangeSchema } from './actor-state.ts'
import type { CharacterChange, CharacterChangeMap } from './actor-events.ts'
import type { KnowledgeChange } from './knowledge.ts'
import { resolveStateReferences, type StateChange } from './dynamic-state.ts'
import { castOf, lifecycleFor, sceneOf, stateOf } from './world.ts'
import { validateNpcReferences } from './npc-references.ts'
import { resolvePersonReference } from './characters.ts'
import type { NarrativeSnapshot } from './types.ts'
import type { narrativeTurnSchema } from './cognition.ts'
import type { z } from 'zod'

/**
 * Plan against one transaction snapshot; generated identities become visible only on commit.
 * @param snapshot - exact instance revision owned by the surrounding transaction.
 * @param actorId - host-authenticated character identity.
 * @param input - semantic model submission, with observer-local targets.
 * @param commands - shared character rules and deployment limits.
 * @param maxContextUpdateUnits - source proposal budget for this deployment.
 * @param fieldReference - visible field formatter shared with context queries.
 * @returns staged domain delta; the enclosing application validates evidence and audience.
 */
export function prepareNpcTurn(snapshot: NarrativeSnapshot, actorId: string, input: NpcTurnInput,
  commands: CharacterCommands, maxContextUpdateUnits: number, fieldReference: (id: string) => string): z.infer<typeof narrativeTurnSchema> {
  const state = lifecycleFor(snapshot, actorId)
  const cast = castOf(snapshot)
  validateNpcReferences(cast, actorId, input, sceneOf(snapshot))
  state.currentTurn = snapshot.instance.revision + 1
  const sourceAliases = new Map<string, string>()
  const registerSource = (id: string, revision: number): void => {
    sourceAliases.set(`state:${fieldReference(id)}:r${revision}`, `state:${id}:r${revision}`)
  }
  for (const item of stateOf(snapshot, actorId).history) registerSource(item.definition.id, item.revision)
  const source = (ref: string): string => sourceAliases.get(ref) ?? ref
  const knowledge: KnowledgeChange[] = []
  const dynamic: StateChange[] = []
  const lifecycle: z.infer<typeof characterLifecycleChangeSchema>[] = []
  let closed: CharacterChangeMap['character.turn-closed'] | undefined
  if (state.descriptor === undefined) throw new Error('Character projection has no descriptor')
  const access: CharacterAccess = {
    descriptor: state.descriptor, state: () => state,
    resolvePerson: ref => resolvePersonReference(cast, actorId, ref),
    append: (type, data) => {
      // The access contract correlates the change discriminant and payload.
      let change = { type, data } as CharacterChange
      if (change.type === 'memory.recorded') change = { ...change, data: { ...change.data, memory: { ...change.data.memory, sourceRefs: change.data.memory.sourceRefs.map(source) } } }
      if (change.type === 'turning-point.revised') change = { ...change, data: { ...change.data, turningPoint: { ...change.data.turningPoint, sourceRefs: change.data.turningPoint.sourceRefs.map(source) } } }
      applyCharacterChange(state, change)
      if (change.type === 'character.turn-closed') closed = change.data
      const parsed = characterLifecycleChangeSchema.safeParse(change)
      if (parsed.success) lifecycle.push(parsed.data)
    },
  }
  applyNpcTurn(commands, access, input, {
    maxContextUpdateUnits,
    independentNarrative: true,
    changeKnowledge: (changes) => { knowledge.push(...changes.map(change => ({ ...change, sourceRefs: change.sourceRefs.map(source) }))) },
    changeState: (changes) => {
      const resolved = resolveStateReferences(changes, stateOf(snapshot, actorId), ref => access.resolvePerson(ref), fieldReference)
      for (const item of resolved) registerSource(item.fieldId, item.expectedRevision + 1)
      dynamic.push(...resolved.map(change => ({ ...change, sourceRefs: change.sourceRefs.map(source) })))
    },
    sourceReference: (kind, id, revision) => `${kind}:${id}${revision === undefined ? '' : `:r${revision}`}`,
  })
  if (closed === undefined) throw new Error('Character submission did not close its turn')
  return { knowledge, state: dynamic, lifecycle,
    behavior: (input.behavior ?? []).map(item => item.kind === 'speech'
      ? { kind: 'speech', text: item.text, to: [...(item.to ?? [])], delivery: item.delivery ?? 'spoken',
        ...(item.tone === undefined ? {} : { tone: item.tone }), ...(item.intent === undefined ? {} : { intent: item.intent }) }
      : { kind: 'action', attempt: item.attempt, ...(item.target === undefined ? {} : { target: item.target }),
        ...(item.visibility === undefined ? {} : { visibility: item.visibility }),
        ...(item.await_result === undefined ? {} : { awaitResult: item.await_result }),
        ...(item.purpose === undefined ? {} : { purpose: item.purpose }), ...(item.manner === undefined ? {} : { manner: item.manner }) }),
    posture: input.posture,
    ...(closed.nextImpulse === undefined ? {} : { nextImpulse: closed.nextImpulse }),
    ...(closed.discussion === undefined ? {} : { discussion: closed.discussion }),
    ...(input.discussion_request === undefined ? {} : { discussionRequest: {
      topic: input.discussion_request.topic, opening: input.discussion_request.opening,
      participantIds: input.discussion_request.participant_refs.map(ref => resolvePersonReference(cast, actorId, ref)),
    } }),
    ...(input.context_update === undefined ? {} : { contextUpdate: input.context_update.map(unit => ({ ...unit,
      sourceIds: unit.sourceIds.map(source),
      changes: unit.changes.map(change => ({ ...change, sourceIds: change.sourceIds.map(source) })),
    })) }),
  }
}
