import { creativeBindings, materializeCreative } from './creative-settings.ts'
import { perceiveBehavior } from './behavior.ts'
import { playerActor } from './player-control.ts'
import { narrationDraftSchema } from './narration-drafts.ts'
import { recipeOf } from './context-recipe.ts'
import { directorOutlineSchema } from './outline-rules.ts'
import { resolveInstanceSettings } from './settings.ts'
import { directorRunSchema, preparationRecordSchema } from './world.ts'
/** Portable narrative projections must retain owners and references at every historical revision. */
import { z } from 'zod'
import { storyCharactersSchema } from './characters.ts'
import { styleOverridesSchema } from './style.ts'
import { parseStorybookDocument } from './storybook.ts'
import { storyContextRetentionSchema, contextUpdateSchema, proposeContextUpdate } from './context-retention.ts'
import { indexedRetention, narrativeOriginals, retentionOf } from './retention-records.ts'
import { entity, project, canonical, RoleplayError } from './records.ts'
import { castOf, discussionRunSchema, discussionsOf, evidenceSchema, executionSchema, lifecycleFor,
  narrationSchema, playerDirectionSchema, factSchema, publishedBehaviorSchema, sceneOf, stateOf, evidenceFor,
  knowledgeOf, lifecycleRecordsFor, lifecycleSourceRef, personOf } from './world.ts'
import type { NarrativeCommit, NarrativeSnapshot } from './types.ts'
import { dynamicStateSchema } from './dynamic-state.ts'

const text = z.string().trim().min(1)
const singletonRecords: Readonly<Record<string, readonly string[]>> = { setting: ['book', 'overrides', 'commonKnowledge'],
  'player-control': ['current'], scene: ['current'], style: ['current'], configuration: ['revision'], planning: ['current'],
  discussions: ['current'], 'context-recipe': ['current'], 'creative-settings': ['current'], run: ['director', 'discussion'] }
const namedRecords = new Set(['people', 'encounters', 'knowledge', 'state', 'execution',
  'facts', 'narration', 'narration-draft', 'player-input', 'behavior', 'posture', 'next-impulse', 'retention', 'discussion-preparation'])

/**
 * Validate the current or replayed fictional projection, independent from Session envelopes.
 * @param snapshot - complete instance-scoped projection at one narrative revision.
 */
export function validateWorld(snapshot: NarrativeSnapshot): void {
  const cast = storyCharactersSchema.parse(castOf(snapshot))
  const ids = new Set(cast.entries.map(item => item.definition.actorId))
  const person = (id: string): void => { if (!ids.has(id)) throw new RoleplayError('invalid', 'Narrative record references an unavailable person') }
  const audience = (id: string): void => { if (id !== 'observer') person(id) }
  const ref = (owner: string, value: string): void => {
    if (value !== 'self' && !cast.encounters.some(item => item.observerId === owner && item.ref === value)) {
      throw new RoleplayError('invalid', 'Narrative record references another perspective')
    }
  }
  const revision = (value: number): void => { if (value > snapshot.instance.revision) throw new RoleplayError('invalid', 'Narrative record references a future revision') }
  directorOutlineSchema.parse(entity(snapshot, { collection: 'planning', id: 'current' }))
  recipeOf(snapshot)
  if (entity(snapshot, { collection: 'creative-settings', id: 'current' }) !== undefined
    && canonical(materializeCreative(snapshot, creativeBindings(snapshot))) !== canonical(recipeOf(snapshot))) {
    throw new RoleplayError('invalid', 'Creative source snapshot differs from the effective recipe')
  }
  resolveInstanceSettings(snapshot)
  parseStorybookDocument(entity(snapshot, { collection: 'setting', id: 'book' }))
  z.array(text).parse(entity(snapshot, { collection: 'setting', id: 'commonKnowledge' }))
  revision(z.number().int().nonnegative().parse(entity(snapshot, { collection: 'configuration', id: 'revision' })))
  styleOverridesSchema.parse(entity(snapshot, { collection: 'style', id: 'current' }))
  const controlled = playerActor(snapshot)
  if (controlled !== null) person(controlled)
  const scene = sceneOf(snapshot)
  for (const id of scene.present) person(id)
  if (new Set(scene.present).size !== scene.present.length) throw new RoleplayError('invalid', 'Scene repeats a participant')
  for (const owner of ['world', ...ids]) {
    const state = stateOf(snapshot, owner)
    for (const entry of [...state.entries, ...state.history]) {
      person(entry.definition.actorId)
      if (entry.definition.targetActorId !== undefined) person(entry.definition.targetActorId)
      for (const id of entry.definition.audience) person(id)
      if (owner === 'world' ? entry.definition.owner !== 'world'
        : entry.definition.owner !== 'actor' || entry.definition.actorId !== owner) {
        throw new RoleplayError('invalid', 'State is stored under a different owner')
      }
    }
    if (owner !== 'world') {
      lifecycleFor(snapshot, owner)
      const knowledge = knowledgeOf(snapshot, owner)
      const lifecycle = lifecycleRecordsFor(snapshot, owner)
      const sources = new Set(['storybook', ...evidenceFor(snapshot, owner).map(item => item.id),
        ...knowledge.history.map(item => `knowledge:${item.id}:r${item.revision}`),
        ...state.history.map(item => `state:${item.definition.id}:r${item.revision}`),
        ...lifecycle.map(item => lifecycleSourceRef(item.change))])
      const requireSources = (refs: readonly string[]): void => {
        if (refs.some(source => !sources.has(source))) throw new RoleplayError('invalid', 'Private source is unavailable in this perspective')
      }
      for (const entry of [...knowledge.entries, ...knowledge.history, ...state.entries, ...state.history]) requireSources(entry.sourceRefs)
      for (const item of lifecycle) {
        if (item.change.type === 'memory.recorded') requireSources(item.change.data.memory.sourceRefs)
        if (item.change.type === 'turning-point.revised') requireSources(item.change.data.turningPoint.sourceRefs)
      }
    }
  }
  const discussions = discussionsOf(snapshot)
  const requestIds = new Set<string>()
  for (const request of discussions.requests ?? []) {
    if (requestIds.has(request.id)) throw new RoleplayError('invalid', 'Duplicate discussion request identity')
    requestIds.add(request.id)
    person(request.actorId)
    for (const id of request.participantIds) person(id)
    if (!request.participantIds.includes(request.actorId)) throw new RoleplayError('invalid', 'Invitation excludes its requester')
    const linked = discussions.discussions.find(item => item.id === request.discussionId)
    if (request.status === 'accepted'
      ? linked === undefined || linked.topic !== request.topic || linked.participantIds.length !== request.participantIds.length
        || linked.participantIds.some(id => !request.participantIds.includes(id))
      : request.discussionId !== undefined) throw new RoleplayError('invalid', 'Invalid discussion request resolution')
  }
  if (discussions.discussions.filter(item => !['completed', 'cancelled'].includes(item.status)).length > 1) {
    throw new RoleplayError('invalid', 'Multiple unfinished discussions')
  }
  for (const discussion of discussions.discussions) {
    for (const id of discussion.participantIds) person(id)
    const participants = new Set(discussion.participantIds)
    for (const id of [...discussion.floorQueue, ...discussion.preparationPendingIds ?? [], ...discussion.preparationExemptIds ?? [],
      ...Object.keys(discussion.participantIntents ?? {}),
      ...discussion.currentSpeakerId === undefined ? [] : [discussion.currentSpeakerId]]) {
      if (!participants.has(id)) throw new RoleplayError('invalid', 'Discussion floor belongs to a nonparticipant')
    }
    for (const turn of discussion.turns) {
      if (!participants.has(turn.speakerId)) throw new RoleplayError('invalid', 'Discussion speech belongs to a nonparticipant')
      for (const [viewer, reference] of Object.entries(turn.speakerRefs ?? {})) { audience(viewer); ref(viewer, reference) }
    }
  }
  const settledAttempts = new Set<string>()
  for (const item of snapshot.entities) {
    const { collection, id } = item.key
    const known = Object.hasOwn(singletonRecords, collection) || namedRecords.has(collection)
      || collection.startsWith('lifecycle:') || collection.startsWith('evidence:')
    if (!known || singletonRecords[collection] !== undefined && !singletonRecords[collection].includes(id)) {
      throw new RoleplayError('invalid', 'Unknown narrative record collection or identity')
    }
    if (collection === 'posture') z.enum(['finished', 'silent', 'watching', 'waiting', 'hesitating', 'withdrawing']).parse(item.value)
    if (collection === 'next-impulse') text.parse(item.value)
    if (collection === 'state' && id !== 'world') person(id)
    if (collection.startsWith('lifecycle:')) person(collection.slice('lifecycle:'.length))
    if (collection === 'people' && !ids.has(id)) throw new RoleplayError('invalid', 'Person key differs from its identity')
    if (collection === 'knowledge' || collection === 'posture' || collection === 'next-impulse') audience(id)
    if (collection === 'execution') {
      const execution = executionSchema.parse(item.value)
      person(execution.actorId)
      if (execution.actorId !== id || execution.epoch > snapshot.instance.epoch) {
        throw new RoleplayError('invalid', 'Invalid execution owner or epoch')
      }
    }
    if (collection === 'discussion-preparation') {
      const record = preparationRecordSchema.parse(item.value)
      person(record.actorId); revision(record.revision)
      const discussion = discussions.discussions.find(discussion => discussion.id === record.discussionId)
      if (id !== `${record.discussionId}:${record.actorId}` || !discussion?.participantIds.includes(record.actorId)) {
        throw new RoleplayError('invalid', 'Invalid discussion preparation owner')
      }
    }
    if (collection === 'run') {
      if (id === 'director') {
        const run = directorRunSchema.parse(item.value)
        for (const actorId of run.actors) person(actorId)
        if (run.epoch > snapshot.instance.epoch || run.completedActors > run.actors.length) throw new RoleplayError('invalid', 'Invalid director progress')
      } else if (id === 'discussion') discussionRunSchema.parse(item.value)
      else throw new RoleplayError('invalid', 'Unknown run kind')
    }
    if (collection === 'facts') {
      const fact = factSchema.parse(item.value); revision(fact.revision)
      if (fact.id !== id) throw new RoleplayError('invalid', 'Fact key differs from its identity')
      for (const attemptId of fact.settles ?? []) {
        const raw = entity(snapshot, { collection: 'behavior', id: attemptId })
        const attempt = raw === undefined ? undefined : publishedBehaviorSchema.parse(raw)
        if (attempt === undefined || attempt.behavior.kind !== 'action' || !attempt.behavior.awaitResult
          || attempt.revision >= fact.revision || settledAttempts.has(attemptId)) throw new RoleplayError('invalid', 'Invalid or repeated world settlement')
        settledAttempts.add(attemptId)
        if (!evidenceFor(snapshot, attempt.actorId).some(evidence => evidence.revision === fact.revision
          && evidence.respondsTo?.includes(attemptId))) {
          throw new RoleplayError('invalid', 'World settlement omits actor feedback')
        }
      }
    }
    if (collection === 'narration') {
      const narration = narrationSchema.parse(item.value); revision(narration.revision)
      for (const viewer of Object.keys(narration.texts)) audience(viewer)
    }
    if (collection === 'narration-draft') {
      const draft = narrationDraftSchema.parse(item.value)
      if (draft.attempt !== id || draft.revision > 2 || draft.target < draft.minimum
        || (draft.status === 'published') !== (draft.characters >= draft.minimum)
        || draft.status === 'exhausted' && draft.revision !== 2) throw new RoleplayError('invalid', 'Invalid narration draft progress')
    }
    if (collection === 'player-input') {
      const instruction = playerDirectionSchema.parse(item.value); revision(instruction.revision)
      if (instruction.id !== id) throw new RoleplayError('invalid', 'Player instruction key differs from its identity')
    }
    if (collection === 'behavior') {
      const behavior = publishedBehaviorSchema.parse(item.value); revision(behavior.revision); person(behavior.actorId)
      for (const target of behavior.targets) person(target)
      for (const viewer of behavior.audience) audience(viewer)
      if (behavior.behavior.kind === 'action' && behavior.behavior.visibility === 'concealed' && behavior.audience.length > 0) {
        throw new RoleplayError('invalid', 'Concealed attempt cannot have a broadcast audience')
      }
      for (const [viewer, reference] of Object.entries(behavior.references)) { audience(viewer); ref(viewer, reference) }
    }
    if (collection.startsWith('evidence:')) {
      const evidence = evidenceSchema.parse(item.value); person(evidence.recipient); revision(evidence.revision)
      if (collection !== `evidence:${evidence.recipient}` || id !== evidence.id) throw new RoleplayError('invalid', 'Evidence is stored under a different owner')
      for (const reference of evidence.personRefs) ref(evidence.recipient, reference)
      for (const attemptId of evidence.respondsTo ?? []) {
        const raw = entity(snapshot, { collection: 'behavior', id: attemptId })
        if (raw === undefined || publishedBehaviorSchema.parse(raw).actorId !== evidence.recipient
          || !snapshot.entities.some(item => item.key.collection === 'facts' && factSchema.parse(item.value).revision === evidence.revision
            && factSchema.parse(item.value).settles?.includes(attemptId))) throw new RoleplayError('invalid', 'Feedback references another actor or unavailable settlement')
      }
      if (evidence.behavior !== undefined) {
        const behavior = evidence.behavior
        const people = behavior.kind === 'speech' ? [behavior.speaker, ...behavior.addressedTo ?? []]
          : [behavior.actor, ...behavior.target === undefined ? [] : [behavior.target]]
        for (const person of people) ref(evidence.recipient, person.ref)
      }
      for (const source of evidence.sourceRefs) if (entity(snapshot, { collection: 'facts', id: source }) === undefined) {
        throw new RoleplayError('invalid', 'Evidence source is unavailable')
      }
    }
    if (collection.startsWith('context-proposals:')) throw new RoleplayError('invalid', 'Obsolete narrative retention format')
    if (collection === 'retention') {
      if (id !== 'director') person(id.slice('actor:'.length))
      const retained = storyContextRetentionSchema.parse(item.value)
      const scope = id
      const available = new Set(narrativeOriginals(snapshot, id, true).map(original => original.id))
      const indexed = new Set(retained.sources.map(source => source.id))
      if (indexed.size !== retained.sources.length || retained.sources.some(source => !available.has(source.id)
        || canonical(source.scopes) !== canonical([scope]) || source.locator.kind !== 'world' || source.locator.eventId !== source.id)) {
        throw new RoleplayError('invalid', 'Retention source is unavailable in this perspective')
      }
      const units = retained.proposals.flatMap(proposal => [proposal.unit, proposal.submittedUnit])
      const references = [...retained.notes.flatMap(note => note.sourceIds), ...units.flatMap(unit => [...unit.sourceIds,
        ...unit.changes.flatMap(change => change.sourceIds)]), ...retained.pins.map(pin => pin.sourceId)]
      if (references.some(source => !indexed.has(source)) || retained.notes.some(note => note.scope !== scope || note.author !== scope)
        || retained.proposals.some(proposal => proposal.scope !== scope) || retained.pins.some(pin => pin.scope !== scope)) {
        throw new RoleplayError('invalid', 'Retention record exceeds its perspective')
      }
    }
  }
}

/** An imported actor receipt cannot claim world or another character's write authority. */
export function validateImportedAuthority(commit: NarrativeCommit, before: NarrativeSnapshot): void {
  const principal = commit.command.principal
  if (principal.kind === 'system' && principal.operation === 'memory-consolidation' && commit.command.kind === 'memory.accept') {
    const input = z.strictObject({ owner: z.string(), sourceIds: z.array(z.string()), units: contextUpdateSchema,
      sourceRevision: z.number().int().nonnegative(), epoch: z.number().int().nonnegative(),
      retentionRevision: z.number().int().nonnegative() }).parse(commit.command.input)
    const result = z.strictObject({ jobId: z.string() }).parse(commit.result)
    const initial = indexedRetention(before, input.owner)
    const sources = input.units.flatMap(unit => unit.sourceIds)
    if (input.sourceRevision > before.instance.revision || input.epoch !== before.instance.epoch
      || retentionOf(before, input.owner).revision !== input.retentionRevision || sources.length !== input.sourceIds.length
      || new Set(sources).size !== sources.length || sources.some(id => !input.sourceIds.includes(id))) {
      throw new RoleplayError('invalid', 'Invalid background memory boundary')
    }
    if (input.owner !== 'director') {
      if (!input.owner.startsWith('actor:') || playerActor(before) === input.owner.slice(6)) throw new RoleplayError('invalid', 'Invalid memory owner')
    }
    const expected = proposeContextUpdate(initial, input.owner, result.jobId, result.jobId, input.units)
    if (commit.events.length !== 1 || canonical(commit.events[0]) !== canonical({ type: 'entity.replaced',
      key: { collection: 'retention', id: input.owner }, value: expected })) throw new RoleplayError('invalid', 'Background memory cannot change fiction or approve arbitrary notes')
    return
  }
  if (commit.events.some(event => (event.type === 'entity.replaced' || event.type === 'entity.removed')
    && event.key.collection === 'creative-settings') && principal.kind !== 'player' && commit.command.kind !== 'instance.imported') {
    throw new RoleplayError('invalid', 'Creative configuration requires player authority')
  }
  if (commit.events.some(event => (event.type === 'entity.replaced' || event.type === 'entity.removed')
    && event.key.collection === 'player-control') && (principal.kind !== 'player' || commit.command.kind !== 'player.control')) {
    throw new RoleplayError('invalid', 'Only explicit player control commands may change character ownership')
  }
  for (const event of commit.events) {
    if (event.type !== 'entity.replaced' || event.key.collection !== 'discussion-preparation') continue
    const record = preparationRecordSchema.parse(event.value)
    const opening = commit.events.find(item => item.type === 'entity.replaced'
      && item.key.collection === 'execution' && item.key.id === record.actorId)
    const execution = opening?.type === 'entity.replaced' ? executionSchema.parse(opening.value) : undefined
    const discussion = discussionsOf(before).discussions.find(item => item.id === record.discussionId)
    if (!['player', 'director'].includes(principal.kind) || commit.command.kind !== 'execution.open'
      || record.revision !== commit.revision || execution?.attempt !== record.attempt || execution.status !== 'running'
      || !discussion?.preparationPendingIds?.includes(record.actorId)) {
      throw new RoleplayError('invalid', 'Preparation record must belong to its opening execution')
    }
  }
  if ('epoch' in principal && principal.epoch !== before.instance.epoch) throw new RoleplayError('invalid', 'Imported execution has a stale epoch')
  if (commit.events.some(event => ['history.restored', 'instance.removed'].includes(event.type)) && principal.kind !== 'player') {
    throw new RoleplayError('invalid', 'Only player history may contain restoration')
  }
  if (principal.kind === 'system') {
    const allowed = commit.events.every((event) => {
      if (principal.operation === 'import' && commit.command.kind === 'instance.imported') {
        return event.type === 'execution.invalidated' || event.type === 'entity.removed'
          && ['run', 'execution'].includes(event.key.collection)
      }
      if (event.type !== 'entity.replaced') return false
      return principal.operation === 'settle-execution' && commit.command.kind === 'execution.failed' && event.key.collection === 'execution'
        || principal.operation === 'director-progress' && commit.command.kind === 'director.failed' && event.key.collection === 'run' && event.key.id === 'director'
        || principal.operation === 'discussion-progress' && commit.command.kind === 'discussion.progress' && event.key.collection === 'run' && event.key.id === 'discussion'
    })
    if (!allowed) throw new RoleplayError('invalid', 'System history exceeds execution administration authority')
  }
  if (principal.kind === 'actor' || principal.kind === 'director') {
    for (const event of commit.events) {
      if (event.type !== 'entity.replaced' || event.key.collection !== 'state') continue
      const previousValue = entity(before, event.key)
      if (previousValue === undefined) continue
      const previous = dynamicStateSchema.parse(previousValue)
      const next = dynamicStateSchema.parse(event.value)
      if (previous.entries.some((entry) => {
        const updated = next.entries.find(item => item.definition.id === entry.definition.id)
        return updated === undefined || canonical(updated.definition) !== canonical(entry.definition)
      })) throw new RoleplayError('invalid', 'Model history changes or removes an existing state definition')
    }
  }
  if (principal.kind === 'director') {
    const directorRun = entity(before, { collection: 'run', id: 'director' })
    const memoryRun = directorRun === undefined ? undefined : directorRunSchema.parse(directorRun)
    if (memoryRun?.consolidationSources !== undefined && memoryRun.id === principal.attempt) {
      for (const event of commit.events) {
        if (event.type !== 'entity.replaced' || !['run', 'retention'].includes(event.key.collection)) {
          throw new RoleplayError('invalid', 'Director consolidation history changes the world')
        }
        if (event.key.collection === 'run') {
          const next = directorRunSchema.parse(event.value)
          if (next.actors.length > 0 || next.advanceDiscussion
            || canonical(next.consolidationSources) !== canonical(memoryRun.consolidationSources)) {
            throw new RoleplayError('invalid', 'Director consolidation history changes its assigned batch or dispatches actors')
          }
        }
        if (event.key.collection === 'retention') {
          const previous = indexedRetention(before, 'director')
          const next = storyContextRetentionSchema.parse(event.value)
          const sources = next.proposals.slice(previous.proposals.length).flatMap(proposal => proposal.unit.sourceIds)
          if (sources.length !== memoryRun.consolidationSources.length || new Set(sources).size !== sources.length
            || sources.some(id => !memoryRun.consolidationSources?.includes(id))) {
            throw new RoleplayError('invalid', 'Director consolidation history does not cover its assigned batch')
          }
        }
      }
    }
    const created = new Set(commit.events.flatMap(event => event.type === 'entity.replaced'
      && event.key.collection === 'people' && entity(before, event.key) === undefined ? [event.key.id] : []))
    for (const event of commit.events) {
      if (event.type === 'execution.invalidated' && commit.command.kind === 'execution.cancel') continue
      if (event.type !== 'entity.replaced') throw new RoleplayError('invalid', 'Director history contains an unsupported operation')
      const { collection, id } = event.key
      const kinds: Record<string, readonly string[]> = {
        'scene.stage': ['scene', 'encounters'], 'world.observe': ['facts', 'narration', 'state'],
        'director.narration': ['facts', 'narration', 'state', 'narration-draft'],
        'configuration.style': ['style', 'configuration'], 'planning.patch': ['planning'],
        'retention.propose': ['retention'], 'discussion.start': ['discussions'], 'discussion.control': ['discussions'],
        'discussion.run': ['run'], 'execution.open': ['execution', 'discussion-preparation'], 'execution.cancel': ['execution', 'run'],
        'director.finish': ['run'], 'director.progress': ['run'], 'director.completed': ['run'],
      }
      const create = commit.command.kind === 'person.create' && (collection === 'people' && created.has(id)
        || ['knowledge', 'state'].includes(collection) && created.has(id) || collection === 'state' && id === 'world'
        || collection.startsWith('lifecycle:') && created.has(collection.slice('lifecycle:'.length)) || collection === 'encounters')
      const ordinary = kinds[commit.command.kind]?.includes(collection)
        || ['world.observe', 'director.narration'].includes(commit.command.kind) && collection.startsWith('evidence:')
      if (collection === 'narration-draft' && id !== principal.attempt) throw new RoleplayError('invalid', 'Director history modifies another narration draft')
      if (!create && (!ordinary || collection === 'state' && id !== 'world')) {
        throw new RoleplayError('invalid', 'Director history exceeds world and scene authority')
      }
    }
    if (commit.command.kind === 'director.narration') {
      const draft = commit.events.find(event => event.type === 'entity.replaced' && event.key.collection === 'narration-draft')
      if (draft?.type === 'entity.replaced' && narrationDraftSchema.parse(draft.value).status !== 'published' && commit.events.length !== 1) {
        throw new RoleplayError('invalid', 'Unpublished narration cannot settle world events')
      }
    }
    for (const event of commit.events) {
      if (event.type !== 'entity.replaced' || event.key.collection !== 'retention') continue
      const initial = indexedRetention(before, 'director')
      const next = storyContextRetentionSchema.parse(event.value)
      const expected = proposeContextUpdate(initial, 'director', `${principal.attempt}:r${commit.revision}`, principal.attempt,
        next.proposals.slice(initial.proposals.length).map(proposal => proposal.submittedUnit))
      if (event.key.id !== 'director' || canonical(next) !== canonical(expected)) throw new RoleplayError('invalid', 'Director history cannot approve or edit retention')
    }
  }
  if (principal.kind !== 'actor') return
  if (playerActor(before) === principal.actorId) throw new RoleplayError('invalid', 'Player-controlled character cannot commit Actor history')
  const execution = executionSchema.parse(entity(before, { collection: 'execution', id: principal.actorId }))
  if (execution.status !== 'running' || execution.attempt !== principal.attempt || execution.epoch !== principal.epoch) {
    throw new RoleplayError('invalid', 'Actor history does not own the execution attempt')
  }
  if (execution.consolidationSources !== undefined) {
    if (commit.events.some(event => event.type !== 'entity.replaced'
      || !['execution', 'retention'].includes(event.key.collection))) throw new RoleplayError('invalid', 'Consolidation history publishes non-memory changes')
    const nextRetention = commit.events.find(event => event.type === 'entity.replaced' && event.key.collection === 'retention')
    const initial = indexedRetention(before, `actor:${principal.actorId}`)
    const covered = nextRetention?.type === 'entity.replaced' ? storyContextRetentionSchema.parse(nextRetention.value)
      .proposals.slice(initial.proposals.length).flatMap(proposal => proposal.submittedUnit.sourceIds) : []
    if (covered.length !== execution.consolidationSources.length || new Set(covered).size !== covered.length
      || covered.some(id => !execution.consolidationSources?.includes(id))) throw new RoleplayError('invalid', 'Consolidation history has incomplete coverage')
  }
  const behaviors = commit.events.flatMap(event => event.type === 'entity.replaced' && event.key.collection === 'behavior'
    ? [publishedBehaviorSchema.parse(event.value)] : [])
  for (const event of commit.events) {
    if (event.type !== 'entity.replaced') throw new RoleplayError('invalid', 'Actor history contains a non-character operation')
    const { collection, id } = event.key
    const own = ['state', 'knowledge', 'execution', 'posture', 'next-impulse'].includes(collection) && id === principal.actorId
      || collection === 'retention' && id === `actor:${principal.actorId}`
    const ownCollection = collection === `lifecycle:${principal.actorId}`
    const shared = collection === 'behavior' || collection.startsWith('evidence:') || collection === 'discussions' && id === 'current'
    if (!own && !ownCollection && !shared) throw new RoleplayError('invalid', 'Actor history exceeds its write authority')
    if (collection === 'discussions') {
      const initial = discussionsOf(before)
      const next = discussionsOf(project(before, [event]))
      const previous = initial.requests ?? []
      const requests = next.requests ?? []
      if (canonical(requests.slice(0, previous.length)) !== canonical(previous) || requests.length > previous.length + 1) {
        throw new RoleplayError('invalid', 'Actor history cannot resolve or rewrite discussion requests')
      }
      const appended = requests[previous.length]
      if (appended !== undefined && (appended.actorId !== principal.actorId || appended.status !== 'pending'
        || initial.discussions.some(item => !['completed', 'cancelled'].includes(item.status))
        || appended.revision !== 1 || appended.sourceRef !== `turn:${principal.attempt}` || appended.discussionId !== undefined
        || appended.reason !== undefined || appended.sceneId !== sceneOf(before).id
        || appended.participantIds.some(id => !sceneOf(before).present.includes(id) || personOf(before, id).archived)
        || canonical(next.discussions) !== canonical(initial.discussions))) {
        throw new RoleplayError('invalid', 'Actor history exceeds discussion invitation authority')
      }
    }
    if (collection === 'retention') {
      const staged = project(before, commit.events.filter(item => item.type !== 'entity.replaced' || item.key.collection !== 'retention'))
      const initial = indexedRetention(staged, `actor:${principal.actorId}`)
      const next = storyContextRetentionSchema.parse(event.value)
      const expected = proposeContextUpdate(initial, `actor:${principal.actorId}`, principal.attempt, principal.attempt,
        next.proposals.slice(initial.proposals.length).map(proposal => proposal.submittedUnit))
      if (canonical(expected) !== canonical(next)) throw new RoleplayError('invalid', 'Actor history cannot approve or edit retention')
    }
    if (collection.startsWith('evidence:')) {
      const evidence = evidenceSchema.parse(event.value)
      if (collection !== `evidence:${evidence.recipient}` || id !== evidence.id) throw new RoleplayError('invalid', 'Evidence is stored under a different owner')
      const behavior = behaviors.find(item => item.id === evidence.id)
      if (behavior === undefined || (!behavior.audience.includes(evidence.recipient) && evidence.recipient !== principal.actorId)
        || evidence.content !== (behavior.behavior.kind === 'speech' ? behavior.behavior.text : behavior.behavior.attempt)) {
        throw new RoleplayError('invalid', 'Actor evidence does not match accepted behavior and audience')
      }
      if (evidence.behavior !== undefined && canonical(evidence.behavior) !== canonical(perceiveBehavior(castOf(before),
        principal.actorId, behavior.behavior, behavior.targets, evidence.recipient))) {
        throw new RoleplayError('invalid', 'Actor evidence attribution differs from the recipient perspective')
      }
    }
    if (collection === 'behavior' && (publishedBehaviorSchema.parse(event.value).actorId !== principal.actorId
      || publishedBehaviorSchema.parse(event.value).origin !== 'actor')) {
      throw new RoleplayError('invalid', 'Actor history publishes another person鈥檚 behavior')
    }
  }
}
