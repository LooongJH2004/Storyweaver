import { playerActor } from './player-control.ts'
import { publishBehaviors } from './behavior.ts'
import { stageDiscussionTurn } from './discussions.ts'
import { stageDiscussionRequest } from './discussion-requests.ts'
import { pendingWorldAttempts } from './world-attempts.ts'
/** Evidence-scoped judgment, state, memory, and behavior changes share one durable commit. */
import { z } from 'zod'
import { CharacterCommands } from './actor-commands.ts'
import type { NpcTurnInput } from './npc-turn.ts'
import type { Config as CharacterLimits } from './actor-model.ts'
import { prepareNpcTurn } from './prepare-turn.ts'
import { applyCharacterChange } from './actor-state.ts'
import type { NarrativeWriter } from './types.ts'
import { applyKnowledgeChanges } from './knowledge.ts'
import { applyStateChanges } from './dynamic-state.ts'
import { renderPerspectiveText } from './characters.ts'
import { entity, project, RoleplayError } from './records.ts'
import { indexedRetention, narrativeOriginals } from './retention-records.ts'
import { proposeContextUpdate } from './context-retention.ts'
import { castOf, executionSchema, json, knowledgeOf, lifecycleFor, lifecycleSourceRef,
  personOf, replace, stateOf } from './world.ts'
import type { CommandScope, NarrativeCommit, NarrativeEvent, NarrativeSnapshot, RuntimeValues } from './types.ts'

import { narrativeTurnSchema, observationSchema } from './command-inputs.ts'
export { narrativeTurnSchema, observationSchema } from './command-inputs.ts'

function availableSources(snapshot: NarrativeSnapshot, actorId: string): Set<string> {
  return new Set(narrativeOriginals(snapshot, `actor:${actorId}`).map(item => item.id))
}

function cognitionEvents(snapshot: NarrativeSnapshot, actorId: string, input: Pick<z.infer<typeof narrativeTurnSchema>,
  'knowledge' | 'state' | 'lifecycle'>,
origin: 'actor' | 'player'): NarrativeEvent[] {
  personOf(snapshot, actorId)
  const cast = castOf(snapshot)
  const sourceRefs = availableSources(snapshot, actorId)
  const events: NarrativeEvent[] = []
  for (const change of [...input.knowledge, ...input.state]) {
    if (change.sourceRefs.some(ref => !sourceRefs.has(ref))) throw new RoleplayError('invalid',
      'Source is unavailable in this perspective. Copy a RECEIVED EVIDENCE id or a personal record sourceRef, not a discussion or discussion-turn id. Correct only the invalid sourceRefs; preserve other required fields such as thoughts[].content. A subjective state change without a cited source may use sourceRefs=[].')
  }
  if (input.knowledge.length > 0) events.push(replace('knowledge', actorId, applyKnowledgeChanges(knowledgeOf(snapshot,
    actorId), input.knowledge,
  { origin, sourceRefs: [...sourceRefs],
    entityRefs: cast.encounters.filter(item => item.observerId === actorId).map(item => item.ref) })))
  if (input.state.length > 0) events.push(replace('state', actorId, applyStateChanges(stateOf(snapshot, actorId), input.state,
    origin === 'actor' ? { kind: 'actor', actorId } : { kind: 'player' }, cast.entries.map(item => item.definition.actorId))))
  const lifecycle = lifecycleFor(snapshot, actorId)
  for (const item of input.knowledge) sourceRefs.add(`knowledge:${item.id}:r${item.expectedRevision + 1}`)
  for (const item of input.state) sourceRefs.add(`state:${item.fieldId}:r${item.expectedRevision + 1}`)
  for (const [index, change] of input.lifecycle.entries()) {
    const refs = change.type === 'memory.recorded' ? change.data.memory.sourceRefs
      : change.type === 'turning-point.revised' ? change.data.turningPoint.sourceRefs : []
    if (refs.some(ref => !sourceRefs.has(ref))) throw new RoleplayError('invalid', 'Lifecycle source is unavailable in this perspective')
    applyCharacterChange(lifecycle, change)
    sourceRefs.add(lifecycleSourceRef(change))
    const revision = snapshot.instance.revision + 1
    events.push(replace(`lifecycle:${actorId}`, `${revision}:${index}`, { revision, index, change }))
  }
  return events
}

/** Player edits operate without Actor provisioning; runtime turns require a current host attempt. */
export class CognitionApplication {
  private readonly characterCommands: CharacterCommands
  constructor(private readonly commands: NarrativeWriter, private readonly values: RuntimeValues,
    private readonly turnPolicy: { limits: Required<CharacterLimits>
      maxContextUpdateUnits: number
      fieldReference: (id: string) => string }) {
    this.characterCommands = new CharacterCommands(turnPolicy.limits, values)
  }


  revise(scope: CommandScope, actorId: string, changes: Pick<z.infer<typeof narrativeTurnSchema>,
    'knowledge' | 'state' | 'lifecycle'>): NarrativeCommit {
    return this.commands.execute({ ...scope, kind: 'cognition.revise', input: json({ actorId, changes }) }, (snapshot) => {
      if (scope.principal.kind !== 'player') throw new RoleplayError('invalid', 'Only the player may revise personal cognition')
      if (changes.state.some(change => change.definition !== undefined && (change.definition.owner !== 'actor' || change.definition.actorId !== actorId))) {
        throw new RoleplayError('invalid', 'Edit objective state through world settlement')
      }
      return { events: cognitionEvents(snapshot, actorId, changes, 'player'), result: { actorId } }
    })
  }

  commitTurn(scope: CommandScope, input: z.infer<typeof narrativeTurnSchema>): NarrativeCommit {
    return this.executeTurn(scope, 'actor.commit-turn', json(input), () => input)
  }

  /** Submit model semantics inside the same transaction that allocates record identities. */
  submitTurn(scope: CommandScope, input: NpcTurnInput): NarrativeCommit {
    const aliases = new Map<string, string>()
    try {
      return this.executeTurn(scope, 'actor.submit-turn', json(input), (snapshot, actorId) => {
        for (const item of stateOf(snapshot, actorId).entries) {
          aliases.set(item.definition.id, this.turnPolicy.fieldReference(item.definition.id))
        }
        return prepareNpcTurn(snapshot, actorId, input, this.characterCommands,
          this.turnPolicy.maxContextUpdateUnits, this.turnPolicy.fieldReference)
      })
    } catch (error) {
      if (!(error instanceof Error)) throw error
      let message = error.message
      for (const [id, reference] of [...aliases].sort((a, b) => b[0].length - a[0].length)) message = message.replaceAll(id, reference)
      if (message === error.message) throw error
      throw new RoleplayError(error instanceof RoleplayError ? error.code : 'invalid', message)
    }
  }

  private executeTurn(scope: CommandScope, kind: string, source: import('./types.ts').Json,
    prepare: (snapshot: NarrativeSnapshot, actorId: string) => z.infer<typeof narrativeTurnSchema>): NarrativeCommit {
    return this.commands.execute({ ...scope, kind, input: source }, (snapshot) => {
      const principal = scope.principal
      if (principal.kind !== 'actor') throw new RoleplayError('invalid', 'An Actor turn requires authenticated Actor authority')
      if (playerActor(snapshot) === principal.actorId) throw new RoleplayError('invalid', 'This character is controlled by the player')
      const execution = executionSchema.parse(entity(snapshot, { collection: 'execution', id: principal.actorId }))
      if (execution.status !== 'running' || execution.attempt !== principal.attempt || execution.epoch !== principal.epoch) {
        throw new RoleplayError('stale-execution', 'This character turn is no longer active')
      }
      if (execution.consolidationSources !== undefined && Object.keys(source as object).some(key => key !== 'posture' && key !== 'context_update')) {
        throw new RoleplayError('invalid', 'Memory consolidation accepts only posture and context_update')
      }
      const input = narrativeTurnSchema.parse(prepare(snapshot, principal.actorId))
      if (execution.consolidationSources !== undefined) {
        const covered = input.contextUpdate?.flatMap(unit => unit.sourceIds) ?? []
        const assigned = new Set(execution.consolidationSources)
        const seen = new Set<string>()
        const duplicated = new Set<string>()
        for (const id of covered) {
          if (seen.has(id)) duplicated.add(id)
          seen.add(id)
        }
        const missing = [...assigned].filter(id => !seen.has(id))
        const unexpected = [...seen].filter(id => !assigned.has(id))
        if (input.posture !== 'silent' || missing.length > 0 || unexpected.length > 0 || duplicated.size > 0) {
          throw new RoleplayError('invalid', 'Memory consolidation must cover every assigned source exactly once. '
            + `Coverage errors: ${JSON.stringify({ missing, unexpected, duplicated: [...duplicated] })}. `
            + 'Use posture=silent. Cover only the assigned sources across context_update units; keep each source in one unit. '
            + 'No changes were submitted. Correct and resend the complete consolidation.')
        }
      }
      const person = personOf(snapshot, principal.actorId)
      const needed = new Set<string>()
      if (input.knowledge.length + input.state.length > 0) needed.add('reflect')
      for (const item of input.lifecycle) needed.add(item.type === 'goal.revised' ? 'goals' : item.type === 'intention.recorded' ? 'schedule' : item.type === 'turning-point.revised' || item.type === 'thought.recorded' ? 'reflect' : 'memory')
      for (const item of input.behavior) needed.add(item.kind === 'speech' ? 'speak' : 'act')
      if ([...needed].some(capability => !person.definition.capabilities.some(granted => granted === capability))) throw new RoleplayError('invalid', 'Character capability does not permit this turn')
      const events = cognitionEvents(snapshot, principal.actorId, input, 'actor')
      const published = publishBehaviors(snapshot, principal.actorId, input.behavior, 'actor', this.values)
      events.push(...published.events)
      const behaviorIds = published.ids
      if (input.contextUpdate !== undefined) {
        const staged = project(snapshot, events)
        const sources = new Set(narrativeOriginals(staged, `actor:${principal.actorId}`).map(item => item.id))
        const resolve = (ref: string): string => {
          const local = /^\$behavior:(0|[1-9][0-9]*)$/u.exec(ref)
          if (local !== null) {
            const id = behaviorIds[Number(local[1])]
            if (id !== undefined) return id
          }
          if (!sources.has(ref)) throw new RoleplayError('invalid', 'Context source is unavailable in this perspective')
          return ref
        }
        const units = input.contextUpdate.map(unit => ({ ...unit, sourceIds: unit.sourceIds.map(resolve),
          changes: unit.changes.map(change => ({ ...change, sourceIds: change.sourceIds.map(resolve) })) }))
        events.push(replace('retention', `actor:${principal.actorId}`, proposeContextUpdate(indexedRetention(staged, `actor:${principal.actorId}`),
          `actor:${principal.actorId}`, principal.attempt, principal.attempt, units)))
      }
      events.push(replace('execution', principal.actorId, { ...execution, status: 'committed' }))
      if (execution.consolidationSources === undefined) {
        events.push(replace('posture', principal.actorId, input.posture))
        events.push(...stageDiscussionTurn(snapshot, principal.actorId, input, `turn:${principal.attempt}`, this.values))
      }
      if (input.discussionRequest !== undefined) events.push(...stageDiscussionRequest(snapshot, principal.actorId,
        input.discussionRequest, `turn:${principal.attempt}`, this.values))
      if (input.nextImpulse !== undefined) events.push(replace('next-impulse', principal.actorId, input.nextImpulse))
      return { events, result: { actorId: principal.actorId, behaviorCount: input.behavior.length } }
    })
  }
}

/** World settlement records facts and sends explicit perceptions without changing beliefs. */
export class WorldApplication {
  constructor(private readonly commands: NarrativeWriter, private readonly values: RuntimeValues) {}

  observe(scope: CommandScope, input: z.infer<typeof observationSchema>): NarrativeCommit {
    return this.commands.execute({ ...scope, kind: 'world.observe', input: json(input) }, snapshot =>
      observationEvents(snapshot, scope, input, this.values))
  }
}

/** Validate and stage an observation inside the caller's single authoritative transaction.
 * @param snapshot - Current instance facts and cast.
 * @param scope - Authenticated observer authority.
 * @param input - Complete observation and recipient-specific perceptions.
 * @param values - Host-generated record identities.
 * @returns Validated fictional events and their fact receipt; nothing is published here.
 */
export function observationEvents(snapshot: NarrativeSnapshot, scope: CommandScope,
  input: z.infer<typeof observationSchema>, values: RuntimeValues) {
  if (scope.principal.kind !== 'director' && scope.principal.kind !== 'player') throw new RoleplayError('invalid',
    'Actors cannot settle objective consequences')
  if (input.state.some(change => change.definition !== undefined && change.definition.owner !== 'world')) throw new RoleplayError('invalid', 'Subjective fields require their owner cognition command')
  const cast = castOf(snapshot)
  const factId = values.id()
  const pending = new Map(pendingWorldAttempts(snapshot).map(item => [item.id, item]))
  if (new Set(input.settles).size !== (input.settles?.length ?? 0)
    || input.settles?.some(id => !pending.has(id))) throw new RoleplayError('invalid', 'Settlement must reference distinct pending world attempts')
  if (new Set(input.deliveries.map(item => item.actorId)).size !== input.deliveries.length) throw new RoleplayError('invalid', 'Perception repeats a recipient')
  const shared = input.shared
  if (shared !== undefined && new Set(shared.actorIds).size !== shared.actorIds.length) {
    throw new RoleplayError('invalid', 'Shared perception repeats a recipient')
  }
  const replacements = new Set(input.deliveries.filter(item => item.mode === 'replace').map(item => item.actorId))
  if ([...replacements].some(id => !shared?.actorIds.includes(id))) {
    throw new RoleplayError('invalid', 'A replacement requires that recipient in shared perception')
  }
  const deliveries = [
    ...(shared === undefined ? [] : shared.actorIds.filter(id => !replacements.has(id)).map(actorId => ({
      actorId, content: shared.content, kind: shared.kind, sourceRefs: shared.sourceRefs,
    }))),
    ...input.deliveries,
  ]
  if (input.settles?.some(id => !deliveries.some(delivery => delivery.actorId === pending.get(id)?.actorId))) {
    throw new RoleplayError('invalid', 'Deliver feedback to each waiting actor when settling its attempt')
  }
  const events: NarrativeEvent[] = [replace('facts', factId, { id: factId, summary: input.summary, content: input.content,
    ...(input.settles === undefined ? {} : { settles: input.settles }),
    revision: snapshot.instance.revision + 1 })]
  for (const [order, delivery] of deliveries.entries()) {
    personOf(snapshot, delivery.actorId)
    if (delivery.sourceRefs.some(ref => !snapshot.entities.some(item => item.key.collection === 'facts' && item.key.id === ref))) {
      throw new RoleplayError('invalid', 'Perception references unavailable world evidence')
    }
    const id = values.id()
    events.push(replace(`evidence:${delivery.actorId}`, id, { id, recipient: delivery.actorId,
      content: renderPerspectiveText(delivery.content, cast, delivery.actorId), kind: delivery.kind,
      ...(input.settles === undefined ? {} : { respondsTo: input.settles.filter(id => pending.get(id)?.actorId === delivery.actorId) }),
      sourceRefs: delivery.sourceRefs, personRefs: [], revision: snapshot.instance.revision + 1, order }))
  }
  if (input.narration !== undefined) {
    events.push(replace('narration', factId, { id: factId, revision: snapshot.instance.revision + 1,
      texts: { observer: renderPerspectiveText(input.narration, cast, 'observer') } }))
  }
  if (input.state.length > 0) events.push(replace('state', 'world', applyStateChanges(stateOf(snapshot, 'world'), input.state,
    { kind: scope.principal.kind }, cast.entries.map(item => item.definition.actorId))))
  return { events, result: { factId } }
}
