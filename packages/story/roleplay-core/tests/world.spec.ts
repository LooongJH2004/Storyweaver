import { CreativeSettingsApplication } from '../src/creative-application.ts'
import { pendingWorldAttempts } from '../src/world-attempts.ts'
import type { perceivedEvidenceFor } from '../src/perceived-evidence.ts'
import { creativeBindings, creativeValue, materializeCreative } from '../src/creative-settings.ts'
import { initialContextRecipe, legacyContextRecipe, recipeOf, ContextAssembly, reasoningSection, performanceSection, repairContextRecipe, optimizeActorContextRecipe, narrationCharacterCount, narrationLengthSchema } from '../src/context-recipe.ts'
import { ExecutionHistoryQueries } from '../src/execution-history.ts'
import { CommandStatusQueries } from '../src/command-status.ts'
import { RetentionApplication, RetentionQueries } from '../src/retention.ts'
import { appendRetention, retentionOf, narrativeOriginals } from '../src/retention-records.ts'
import { storyContextRetentionSchema, type ContextUpdateUnit } from '../src/context-retention.ts'
import { PlanningApplication } from '../src/planning.ts'
import { directorOutlineSchema } from '../src/outline-rules.ts'
import { AuthorQueries } from '../src/author-views.ts'
import { PlayerApplication, NarrativeTransfer, DirectorCommands, DirectorQueries, DirectorRuntime, type DirectorExecutor } from '../src/index.ts'
/** The narrative application runs with a clock and storage, without Cordis or Actor sessions. */
import { describe, expect, it } from 'vitest'
import type { NpcTurnInput } from '../src/npc-turn.ts'
import { MemoryRoleplayStore, NarrativeCommands, StorybookLibrary, PeopleApplication, CognitionApplication, WorldApplication,
  PerspectiveQueries, ActorRuntime, createPersonSchema, initializeWorld, entity, MaterialExtraction, NarrativeArchives, ConfigurationApplication, DiscussionApplication, DiscussionRuntime, PlayQueries, RecoveryApplication } from '../src/index.ts'
import { parseStorybookDocument } from '../src/storybook.ts'
import { knowledgeChangeSchema } from '../src/knowledge.ts'
import { characterLifecycleChangeSchema } from '../src/actor-state.ts'
import { stateChangeSchema } from '../src/dynamic-state.ts'
import { json, castOf, evidenceFor, knowledgeOf, personOf, stateOf, lifecycleFor, discussionsOf, replace } from '../src/world.ts'
import type { ActorExecutor, BookId, CommandId, CommandScope, InstanceId, Principal } from '../src/index.ts'
import type { ActorContextView } from '../src/perspective.ts'

function scripted(execute: (request: Parameters<ActorExecutor['execute']>[0]) => Promise<NpcTurnInput>): ActorExecutor {
  return { execute: async (request, _signal, submit) => { submit(await execute(request)) } }
}

function setup(actorIds = ['a', 'b', 'c'], protagonistActorId: string | null = null, planning = false,
  commonKnowledge: Record<string, string[] | null> = {}) {
  let serial = 0
  const values = { id: () => `opaque-${++serial}`, now: () => '2026-09-07T00:00:00.000Z' }
  const store = new MemoryRoleplayStore()
  const commands = new NarrativeCommands(store, values)
  const library = new StorybookLibrary(store, values, { verify: (resources) => { if (resources.length > 0) throw new Error('Fixture contains no resources') } }, ({ document }) => document)
  const people = new PeopleApplication(commands, values)
  const cognition = new CognitionApplication(commands, values, { maxContextUpdateUnits: 16, fieldReference: id => `field-ref:${id}`, limits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16, maxActiveGoals: 32, maxScheduledIntentions: 32 } })
  const world = new WorldApplication(commands, values)
  const queries = new PerspectiveQueries(commands, 6000, id => `field-ref:${id}`, 40)
  const book = parseStorybookDocument({ schemaVersion: 6, id: 'ledger', title: 'Ledger', directorPrompt: '', protagonistActorId,
    characters: actorIds.map((id, index) => ({ actorId: id, displayName: `SECRET-NAME-${id}`,
      appearance: `stranger-${index}`, publicPersona: 'An independent person.', rolePrompt: '',
      capabilities: ['speak', 'act', 'reflect', 'memory', ...(planning ? ['goals', 'schedule'] : [])], actingGuidance: {},
      ...(Object.hasOwn(commonKnowledge, id) ? { commonKnowledge: commonKnowledge[id] } : {}),
    })), directorGuidance: {}, commonKnowledge: ['Rain wets clothing.'] })
  const draft = library.saveDraft({ id: 'book' as BookId, expectedRevision: 0, title: book.title, document: json(book) as Record<string, ReturnType<typeof json>>, resources: [] })
  const version = library.publish(draft.id, draft.revision)
  const create = () => library.createStory({ templateVersionId: version.id, commandId: values.id() as CommandId },
    version => initializeWorld(version, values)).instance.id
  const scope = (id: InstanceId, principal: Principal = { kind: 'player' }): CommandScope => ({ instanceId: id,
    id: values.id() as CommandId, expectedRevision: commands.snapshot(id).instance.revision, principal })
  const stage = (id: InstanceId, present = ['a', 'b', 'c']) => people.stage(scope(id), { id: 'inn', location: 'inn', present, appearances: [] })
  return { store, commands, library, people, cognition, world, queries, values, create, scope, stage }
}
const memoryChange = (id: string, content: string) => characterLifecycleChangeSchema.parse({ type: 'memory.recorded', data: { version: 1, memory: { id, actorId: 'a', content, importance: 4, tags: [], sourceRefs: [] } } })
const silence = (): NpcTurnInput => ({ behavior: [], posture: 'silent' })

it('shows the current actor capabilities and identifies all disallowed reflection fields without writing them', async () => {
  const s = setup(); const id = s.create()
  const created = s.people.create(s.scope(id), createPersonSchema.parse({ definition: {
    displayName: 'Listener', publicPersona: 'A quiet visitor.', rolePrompt: '', capabilities: ['speak', 'memory'], actingGuidance: {},
  }, purpose: 'Wait.', sourceRefs: [], location: 'inn', importance: 'supporting' }))
  const actorId = (created.result as { actorId: string }).actorId
  s.stage(id, [actorId])
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async ({ context }) => {
    expect(context.capabilities).toEqual(['speak', 'memory'])
    expect(context.sections.find(section => section.id === 'identity')?.content).toContain('"capabilities":["speak","memory"]')
    return { posture: 'watching', thoughts: [{ content: 'REJECTED-PRIVATE-THOUGHT' }], knowledge_changes: [{
      id: 'rejected-judgment', expectedRevision: 0, text: 'REJECTED-PRIVATE-JUDGMENT', kind: 'belief', attitude: 'believed',
      acquisition: 'observed', entityRefs: [], sourceRefs: [], status: 'active', reason: 'A new judgment.',
    }] }
  }), s.values)
  try {
    await expect(runtime.run(s.scope(id), actorId)).rejects.toThrow("'reflect' capability required by thoughts, knowledge_changes")
    expect(JSON.stringify(s.commands.snapshot(id))).not.toMatch(/REJECTED-PRIVATE-(THOUGHT|JUDGMENT)/)
  } finally { await runtime.dispose() }
})

it('includes more than the former history limits without crossing actor visibility', () => {
  const s = setup(['a', 'b']); const id = s.create(); s.stage(id, ['a', 'b'])
  for (let index = 0; index < 45; index++) {
    s.world.observe(s.scope(id), { summary: `PUBLIC-EVENT-${index}`, content: `PUBLIC-EVENT-${index}`,
      state: [], deliveries: [{ actorId: 'a', kind: 'observation', content: `PRIVATE-SEEN-${index}`, sourceRefs: [] }] })
  }
  const director = new DirectorQueries(s.commands, 6000, 100).context({ instanceId: id, instruction: '' })
  const actor = s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' })
  const other = s.queries.actorContext({ instanceId: id, actorId: 'b', query: '' })
  for (let index = 0; index < 45; index++) {
    expect(director.text).toContain(`PUBLIC-EVENT-${index}`)
    expect(actor.text).toContain(`PRIVATE-SEEN-${index}`)
  }
  expect(other.text).not.toContain('PRIVATE-SEEN-')
  expect(actor.text).not.toContain('PUBLIC-EVENT-')
})

it('presents complete director history in chronological and same-turn order', async () => {
  const s = setup(); const id = s.create(); s.stage(id)
  for (const content of ['The riverbed is dry.', 'Water is below the step.', 'Water covers the step.']) {
    s.world.observe(s.scope(id), { summary: content, content, deliveries: [], state: [] })
  }
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'watching',
    behavior: [{ kind: 'speech', text: 'I will watch the water.' },
      { kind: 'action', attempt: 'Point at the submerged step.', await_result: false },
      { kind: 'speech', text: 'That step is underwater now.' }],
  })), s.values)
  try {
    await runtime.run(s.scope(id), 'a')
    const queries = new DirectorQueries(s.commands, 6000, 100)
    const context = queries.context({ instanceId: id, instruction: '' })
    const facts = context.sections.filter(section => section.id === 'evidence').map(section => section.content)
    expect(facts).toHaveLength(3)
    expect(facts[0]).toContain('The riverbed is dry.')
    expect(facts[1]).toContain('Water is below the step.')
    expect(facts[2]).toContain('Water covers the step.')
    const behavior = context.sections.filter(section => section.id === 'behavior').map(section => section.content)
    expect(behavior).toHaveLength(3)
    expect(behavior[0]).toContain('I will watch the water.')
    expect(behavior[1]).toContain('Point at the submerged step.')
    expect(behavior[2]).toContain('That step is underwater now.')
  } finally { await runtime.dispose() }
})

it('retains director recall attribution and same-turn order without treating actions as outcomes', async () => {
  const s = setup(); const id = s.create(); s.stage(id)
  const target = castOf(s.commands.snapshot(id)).encounters.find(item => item.observerId === 'a' && item.actorId === 'b')!.ref
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'waiting',
    behavior: [{ kind: 'speech', text: 'The notice says keep it dry; I have not tested it.', to: [target], delivery: 'whispered' },
      { kind: 'action', attempt: 'Look under the tray.', visibility: 'concealed', purpose: 'PRIVATE-MOTIVE', await_result: true }],
  })), s.values)
  try {
    await runtime.run(s.scope(id), 'a')
    const snapshot = s.commands.snapshot(id)
    const originals = narrativeOriginals(snapshot, 'director')
    await expect(JSON.stringify(originals.map(item => ({ kind: item.kind, order: item.order,
      content: JSON.parse(item.text) as unknown })), null, 2) + '\n')
      .toMatchFileSnapshot('./expected/director-memory-attribution.json')
    const queries = new RetentionQueries(s.commands, 10, 6000)
    for (const original of originals) {
      expect(queries.recall(id, 'director', { query: original.id, offset: 0, limit: 1 }).entries[0]?.text).toBe(original.text)
    }
    expect(JSON.stringify(originals)).not.toContain('PRIVATE-MOTIVE')
    expect(queries.recall(id, 'actor:c', { query: 'notice', offset: 0, limit: 10 }).entries).toEqual([])
    expect(queries.recall(id, 'actor:b', { query: 'under the tray', offset: 0, limit: 10 }).entries).toEqual([])
    expect(pendingWorldAttempts(snapshot)).toHaveLength(1)
  } finally { await runtime.dispose() }
})

it('keeps concealed attempts from targets and observers until the director delivers a noticed result', async () => {
  const s = setup(); const id = s.create(); s.stage(id)
  const target = castOf(s.commands.snapshot(id)).encounters.find(item => item.observerId === 'a' && item.actorId === 'b')!.ref
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'waiting', behavior: [
    { kind: 'action', attempt: 'HIDDEN-ATTEMPT: inspect the inside of the coat.', target, visibility: 'concealed', purpose: 'PRIVATE-PURPOSE' },
  ] })), s.values)
  await runtime.run(s.scope(id), 'a')
  expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).text).toContain('HIDDEN-ATTEMPT')
  expect(s.queries.actorContext({ instanceId: id, actorId: 'b', query: '' }).text).not.toContain('HIDDEN-ATTEMPT')
  const play = new PlayQueries(s.commands, 40)
  expect(play.read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 40 }).rows).toEqual([])
  const director = new DirectorQueries(s.commands, 6000, 100)
  expect(director.context({ instanceId: id, instruction: '' }).text).toContain('HIDDEN-ATTEMPT')
  s.world.observe(s.scope(id), { summary: 'A movement is noticed', content: 'The coat owner notices a tug.', deliveries: [
    { actorId: 'b', content: 'You feel someone tug at your coat.', kind: 'observation', sourceRefs: [] },
  ], state: [] })
  const after = s.queries.actorContext({ instanceId: id, actorId: 'b', query: '' }).text
  expect(after).toContain('feel someone tug')
  expect(after).not.toMatch(/HIDDEN-ATTEMPT|PRIVATE-PURPOSE/)
  expect(s.queries.actorContext({ instanceId: id, actorId: 'c', query: '' }).text).not.toContain('feel someone tug')
  const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
  const restored = archives.import(archives.export(id, []), s.values.id() as CommandId)
  expect(s.queries.actorContext({ instanceId: restored.instance.id, actorId: 'b', query: '' }).text).toBe(after)
  await runtime.dispose()
})

it('routes shared perception once, preserves supplementary provenance and replaces only the specified recipient', () => {
  const s = setup(); const id = s.create(); s.stage(id)
  const receipt = s.world.observe(s.scope(id), { summary: 'The bell', content: 'UNSEEN-MECHANISM rings the bell.',
    narration: 'PLAYER-ONLY view of the hidden mechanism.',
    shared: { actorIds: ['a', 'b', 'c'], content: 'A bell rings nearby.', kind: 'observation', sourceRefs: [] },
    deliveries: [
      { actorId: 'b', content: 'A stranger claims the bell signals danger.', kind: 'claim', sourceRefs: [], mode: 'supplement' },
      { actorId: 'c', content: 'You feel the floor vibrate but hear no bell.', kind: 'observation', sourceRefs: [], mode: 'replace' },
    ], state: [] })
  expect(evidenceFor(s.commands.snapshot(id), 'a').map(item => item.content)).toEqual(['A bell rings nearby.'])
  expect(evidenceFor(s.commands.snapshot(id), 'b')).toHaveLength(2)
  const b = s.queries.actorContext({ instanceId: id, actorId: 'b', query: '' })
  expect(b.text.indexOf('A bell rings nearby.')).toBeLessThan(b.text.indexOf('A stranger claims'))
  expect(b.text).toContain('"kind":"claim"')
  expect(b.text).not.toMatch(/PLAYER-ONLY|UNSEEN-MECHANISM|feel the floor/)
  const c = s.queries.actorContext({ instanceId: id, actorId: 'c', query: '' })
  expect(c.text).toContain('feel the floor vibrate')
  expect(c.text).not.toContain('A bell rings nearby.')
  const recall = s.queries.recall({ instanceId: id, actorId: 'b', query: '', revision: receipt.revision }, { query: '', offset: 0, limit: 20 })
  expect(recall.entries[0]?.text).toContain('A stranger claims')
  expect(recall.entries[1]?.text).toContain('A bell rings nearby.')
  expect(recall.entries[0]?.order).toBeGreaterThan(recall.entries[1]?.order ?? -1)
  const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
  const restored = archives.import(archives.export(id, []), s.values.id() as CommandId)
  expect(s.queries.actorContext({ instanceId: restored.instance.id, actorId: 'b', query: '' }).text).toBe(b.text)
})

it('rejects ambiguous shared recipients and orphan replacement without publishing facts', () => {
  const s = setup(); const id = s.create(); s.stage(id)
  const before = s.commands.snapshot(id)
  const base = { summary: 'A noise', content: 'A noise occurs.', state: [], deliveries: [] }
  expect(() => s.world.observe(s.scope(id), { ...base, shared: { actorIds: ['a', 'a'], content: 'A noise.', kind: 'observation', sourceRefs: [] } })).toThrow('repeats')
  expect(() => s.world.observe(s.scope(id), { ...base, deliveries: [
    { actorId: 'a', content: 'Only a vibration.', kind: 'observation', sourceRefs: [], mode: 'replace' },
  ] })).toThrow('requires that recipient')
  expect(s.commands.snapshot(id)).toEqual(before)
})

it('keeps actor invitations private, merges duplicates and accepts one revision into a durable discussion', async () => {
  const s = setup(); const id = s.create(); s.stage(id)
  const invitationCue = 'That is an invitation awaiting acceptance, not the discussion field for an assigned floor.'
  expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).text).toContain(invitationCue)
  const ref = castOf(s.commands.snapshot(id)).encounters.find(item => item.observerId === 'a' && item.actorId === 'b')!.ref
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'waiting', behavior: [],
    discussion_request: { topic: 'PRIVATE-INVITATION', opening: 'Choose whether to inspect the bridge.', participant_refs: [ref] },
  })), s.values)
  await runtime.run(s.scope(id), 'a')
  await runtime.run(s.scope(id), 'a')
  const state = discussionsOf(s.commands.snapshot(id))
  expect(state.requests).toHaveLength(1)
  expect(state.discussions).toEqual([])
  expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).text).toContain('PRIVATE-INVITATION')
  expect(s.queries.actorContext({ instanceId: id, actorId: 'b', query: '' }).text).not.toContain('PRIVATE-INVITATION')
  const play = new PlayQueries(s.commands, 40)
  expect(play.read({ instanceId: id, audience: { kind: 'actor', actorId: 'b' }, offset: 0, limit: 40 }).discussionRequests).toEqual([])
  expect(play.read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 40 }).rows).toEqual([])
  const request = state.requests![0]!
  const discussions = new DiscussionApplication(s.commands, s.values)
  discussions.control(s.scope(id), { operation: 'request', requestId: request.id, expectedRequestRevision: 1, decision: 'defer', reason: 'Wait for daylight' })
  expect(() => discussions.control(s.scope(id), { operation: 'request', requestId: request.id, expectedRequestRevision: 1, decision: 'accept', reason: 'Proceed' })).toThrow('changed')
  const director = directing(s, { execute: async ({ context }, _signal, command) => {
    expect(context.text).toContain('PRIVATE-INVITATION')
    command('accept-invitation', { operation: 'discussion-control', input: { operation: 'request', requestId: request.id,
      expectedRequestRevision: 2, decision: 'accept', reason: 'Daylight has arrived' } })
    command('finish', { operation: 'finish', actors: [], advanceDiscussion: false })
  } })
  await director.director.run(s.scope(id), 'Consider the invitation')
  for (const actorId of ['a', 'c']) {
    expect(s.queries.actorContext({ instanceId: id, actorId, query: '' }).text).not.toContain(invitationCue)
  }
  expect(discussionsOf(s.commands.snapshot(id)).requests![0]).toMatchObject({ status: 'accepted', revision: 3,
    discussionId: discussionsOf(s.commands.snapshot(id)).discussions[0]!.id })
  const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
  const restored = archives.import(archives.export(id, []), s.values.id() as CommandId)
  expect(discussionsOf(s.commands.snapshot(restored.instance.id))).toEqual(discussionsOf(s.commands.snapshot(id)))
  const forged = structuredClone(archives.export(id, []))
  const proposed = forged.commits.flatMap(commit => commit.events).find(event => event.type === 'entity.replaced'
    && event.key.collection === 'discussions' && (event.value as { requests?: unknown[] }).requests?.length === 1)
  if (proposed?.type !== 'entity.replaced') throw new Error('Missing invitation event')
  ;(proposed.value as { requests: { actorId: string }[] }).requests[0]!.actorId = 'b'
  expect(() => archives.import(forged, s.values.id() as CommandId)).toThrow('invitation authority')
  await director.director.dispose(); await director.runtime.dispose()
  await runtime.dispose()
})

it('rejects unknown invitation targets and stale scene acceptance without publishing a partial turn', async () => {
  const s = setup(); const id = s.create(); s.stage(id)
  const invite = { topic: 'Search together', opening: 'Inspect the locked room', participant_refs: ['SECRET-NAME-b'] }
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'waiting',
    behavior: [{ kind: 'speech', text: 'ROLLBACK-INVITATION' }], discussion_request: invite,
  })), s.values)
  await expect(runtime.run(s.scope(id), 'a')).rejects.toThrow('discussion_request.participant_refs[0]')
  expect(new PlayQueries(s.commands, 40).read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 40 }).rows).toEqual([])
  invite.participant_refs = [castOf(s.commands.snapshot(id)).encounters.find(item => item.observerId === 'a' && item.actorId === 'b')!.ref]
  await runtime.run(s.scope(id), 'a')
  const request = discussionsOf(s.commands.snapshot(id)).requests![0]!
  s.stage(id, ['a', 'c'])
  const app = new DiscussionApplication(s.commands, s.values)
  expect(() => app.control(s.scope(id), { operation: 'request', requestId: request.id, expectedRequestRevision: 1, decision: 'accept', reason: 'Start' })).toThrow('current scene')
  expect(discussionsOf(s.commands.snapshot(id)).discussions).toEqual([])
  app.control(s.scope(id), { operation: 'request', requestId: request.id, expectedRequestRevision: 1, decision: 'decline', reason: 'Invitee left' })
  expect(discussionsOf(s.commands.snapshot(id)).requests![0]?.status).toBe('declined')
  await runtime.dispose()
})

it('delivers ordered attributed behavior, retains historical recognition, and keeps whispers and motives private', async () => {
  const s = setup(); const instance = s.create(); s.stage(instance)
  const queries = new PerspectiveQueries(s.commands, 30000, id => `field-ref:${id}`, 40)
  const cast = castOf(s.commands.snapshot(instance))
  const ref = (observer: string, actor: string) => cast.encounters.find(item => item.observerId === observer && item.actorId === actor)!.ref
  const runtime = new ActorRuntime(s.commands, s.cognition, queries, scripted(async () => ({ posture: 'waiting', behavior: [
    { kind: 'speech', text: 'Please wait.', to: [ref('b', 'c')], delivery: 'spoken', intent: 'PRIVATE-SPEECH-INTENT' },
    { kind: 'action', attempt: 'Reaches toward the stranger.', target: ref('b', 'c'), purpose: 'PRIVATE-ACTION-PURPOSE' },
    { kind: 'speech', text: 'WHISPER-FOR-A', to: [ref('b', 'a')], delivery: 'whispered' },
    { kind: 'speech', text: 'All of you, listen.', to: [], delivery: 'spoken' },
  ] })), s.values)
  await runtime.run(s.scope(instance), 'b')
  const delivered = s.commands.snapshot(instance)
  const context = (actorId: string) => queries.actorContext({ instanceId: instance, actorId, query: '' })
  const received = context('a').sections.filter(item => item.id === 'evidence')
    .map(item => JSON.parse(item.content.slice(item.content.indexOf('\n') + 1)) as ReturnType<typeof perceivedEvidenceFor>[number])
  expect(received.map(item => item.content)).toEqual(['Please wait.', 'Reaches toward the stranger.', 'WHISPER-FOR-A', 'All of you, listen.'])
  expect(received[0]!.behavior).toEqual({ kind: 'speech', speaker: { ref: ref('a', 'b'), label: 'stranger-1' },
    addressedTo: [{ ref: ref('a', 'c'), label: 'stranger-2' }], delivery: 'spoken' })
  expect(received[1]!.behavior).toEqual({ kind: 'action', actor: { ref: ref('a', 'b'), label: 'stranger-1' },
    target: { ref: ref('a', 'c'), label: 'stranger-2' } })
  expect(received[2]!.behavior).toMatchObject({ addressedTo: [{ ref: 'self', label: '你' }] })
  expect(received[3]!.behavior).toMatchObject({ addressedTo: [] })
  const speechId = received[0]!.id
  expect(context('a').text).not.toMatch(/PRIVATE-SPEECH-INTENT|PRIVATE-ACTION-PURPOSE|SECRET-NAME/)
  expect(context('c').text).not.toContain('WHISPER-FOR-A')
  const recognition = knowledgeChangeSchema.parse({ id: 'recognition', expectedRevision: 0, text: 'The stranger calls herself Vale.',
    kind: 'identity', attitude: 'believed', acquisition: 'heard', entityRefs: [ref('a', 'c')],
    sourceRefs: [speechId], status: 'active', reason: 'A heard introduction.', label: 'Vale', replaces: [] })
  s.cognition.revise(s.scope(instance), 'a', { knowledge: [recognition], state: [], lifecycle: [] })
  const recognitionRecall = () => queries.recall({ instanceId: instance, actorId: 'a', query: '' },
    { query: 'knowledge:recognition:r1', offset: 0, limit: 1 }).entries[0]
  expect(recognitionRecall()).toMatchObject({ revision: 1, revisionScope: 'record', text: recognition.text })
  expect(queries.recall({ instanceId: instance, actorId: 'a', revision: delivered.instance.revision, query: '' },
    { query: 'knowledge:recognition:r1', offset: 0, limit: 1 }).entries).toEqual([])
  expect(context('a').sections.find(item => item.id === 'people')?.content).toContain('Vale')
  expect(context('a').sections.filter(item => item.id === 'evidence')).toEqual(
    queries.actorContext({ instanceId: instance, actorId: 'a', revision: delivered.instance.revision, query: '' }).sections.filter(item => item.id === 'evidence'))
  s.people.stage(s.scope(instance), { id: 'inn', location: 'inn', present: ['a', 'b'],
    appearances: [{ actorId: 'b', key: 'mask', label: 'A masked traveler' }] })
  const recalled = queries.recall({ instanceId: instance, actorId: 'a', query: '' }, { query: 'Please wait.', offset: 0, limit: 10 })
  expect(JSON.parse(recalled.entries[0]!.text)).toEqual(received[0])
  expect(queries.recall({ instanceId: instance, actorId: 'c', query: '' }, { query: 'WHISPER-FOR-A', offset: 0, limit: 10 }).entries).toEqual([])
  new RetentionApplication(s.commands).review(s.scope(instance), { owner: 'actor:a', operation: 'pin', sourceId: speechId, pinned: true })
  expect(context('a').sections.find(item => item.id === 'retention')?.content).toContain('stranger-2')
  const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
  const exported = archives.export(instance, [])
  const imported = archives.import(exported, s.values.id() as CommandId)
  expect(queries.recall({ instanceId: imported.instance.id, actorId: 'a', query: '' },
    { query: 'knowledge:recognition:r1', offset: 0, limit: 1 }).entries[0]).toEqual(recognitionRecall())
  expect(queries.actorContext({ instanceId: imported.instance.id, actorId: 'a', query: '' }).text).toBe(context('a').text)
  const forged = structuredClone(exported)
  const record = forged.commits.flatMap(commit => commit.events).find(event => event.type === 'entity.replaced'
    && event.key.collection === 'evidence:a' && event.key.id === speechId)!
  if (record.type !== 'entity.replaced') throw new Error('Missing speech evidence')
  ;(record.value as { behavior: { speaker: { label: string } } }).behavior.speaker.label = 'FORGED-IDENTITY'
  expect(() => archives.import(forged, s.values.id() as CommandId)).toThrow('attribution')
  await runtime.dispose()
})

it('recovers source labels and order for text-only historical evidence without guessing old target identities', async () => {
  const s = setup(); const instance = s.create(); s.stage(instance)
  const queries = new PerspectiveQueries(s.commands, 30000, id => id, 40)
  const runtime = new ActorRuntime(s.commands, s.cognition, queries, scripted(async () => ({ posture: 'waiting', behavior: [
    { kind: 'speech', text: 'Legacy first.' }, { kind: 'action', attempt: 'Legacy second.' },
  ] })), s.values)
  await runtime.run(s.scope(instance), 'b')
  s.commands.execute({ ...s.scope(instance), kind: 'fixture.old-evidence', input: null }, snapshot => ({
    events: evidenceFor(snapshot, 'a').map(({ behavior: _behavior, ...item }) => replace('evidence:a', item.id, item)), result: null,
  }))
  const evidence = queries.actorContext({ instanceId: instance, actorId: 'a', query: '' }).sections.filter(item => item.id === 'evidence')
    .map(item => JSON.parse(item.content.slice(item.content.indexOf('\n') + 1)) as ReturnType<typeof perceivedEvidenceFor>[number])
  expect(evidence.map(item => item.content)).toEqual(['Legacy first.', 'Legacy second.'])
  expect(evidence[0]!.behavior).toMatchObject({ speaker: { label: 'stranger-1' } })
  expect(evidence[0]!.behavior).not.toHaveProperty('addressedTo')
  expect(evidence[1]!.behavior).toMatchObject({ actor: { label: 'stranger-1' } })
  expect(evidence[1]!.addressing).toContain('Not recorded')
  await runtime.dispose()
})

it('copies reviewed system defaults into new books without changing existing drafts, versions, instances or book sharing', () => {
  const s = setup(); const instance = s.create()
  const before = s.commands.snapshot(instance)
  const book = s.library.list()[0]!
  const version = s.library.version(before.instance.templateVersionId)
  const shared = new CreativeSettingsApplication(s.store, s.commands, s.values).global(book.id)
  const defaults = s.library.contextDefaults()
  expect(defaults.actor.find(item => item.id === 'performance')?.content).toContain('一到三句')
  expect(defaults.actor.at(-1)?.content).toContain('正常规划不展开工具调用或字数计算')
  const saved = s.library.saveContextDefaults({ ...defaults, narrationLength: { enabled: true, minimum: 350, target: 700 },
    actor: defaults.actor.map(item => item.id === 'performance' ? { ...item, enabled: false, content: 'My initial voice preference.' } : item) })
  expect(saved.revision).toBe(defaults.revision + 1)
  expect(() => s.library.saveContextDefaults(defaults)).toThrow('defaults changed')
  const reopened = new StorybookLibrary(s.store, s.values, { verify: () => {} }, ({ document }) => document)
  expect(reopened.contextDefaults()).toEqual(saved)
  expect(s.library.draft(book.id)).toEqual(book)
  expect(s.library.version(version.id)).toEqual(version)
  expect(s.commands.snapshot(instance)).toEqual(before)
  expect(new CreativeSettingsApplication(s.store, s.commands, s.values).global(book.id)).toEqual(shared)
  const { contextRecipe: _old, ...document } = book.document
  const created = s.library.saveDraft({ id: 'new-defaults-book' as BookId, expectedRevision: 0, title: 'New defaults', document, resources: [] })
  expect(created.document.contextRecipe).toEqual({ ...saved, revision: 0 })
  const pinned = s.library.publish(created.id, created.revision)
  const run = s.library.createStory({ templateVersionId: pinned.id, commandId: s.values.id() as CommandId },
    v => initializeWorld(v, s.values))
  expect(recipeOf(run)).toEqual({ ...saved, revision: 0 })
  s.library.saveContextDefaults({ ...saved, narrationLength: { enabled: false, minimum: 10, target: 20 } })
  expect(s.library.draft(created.id)).toEqual({ ...created, revision: created.revision + 1, latestVersionId: pinned.id })
  expect(s.commands.replay(instance, before.instance.revision)).toEqual(before)
  const edited = s.library.saveDraft({ id: book.id, expectedRevision: book.revision, title: book.title, document, resources: [] })
  expect(edited.document.contextRecipe).toEqual(book.document.contextRecipe)
})

it('keeps the historical implicit recipe when an old published book has no saved recipe', () => {
  const s = setup(); const book = s.library.list()[0]!
  const { contextRecipe: _old, ...document } = book.document
  s.store.transaction((tx) => {
    const version = s.library.version(book.latestVersionId!)
    tx.put('library', 'versions', version.id, { ...version, document })
    tx.put('library', 'drafts', book.id, { ...book, document })
  })
  const defaults = s.library.contextDefaults()
  s.library.saveContextDefaults({ ...defaults, narrationLength: { enabled: true, minimum: 100, target: 200 } })
  const id = s.create()
  expect(recipeOf(s.commands.snapshot(id))).toEqual(legacyContextRecipe())
  const saved = s.library.saveDraft({ id: book.id, expectedRevision: book.revision, title: book.title, document, resources: [] })
  expect(saved.document.contextRecipe).toEqual(legacyContextRecipe())
  expect(initialContextRecipe()).not.toEqual(legacyContextRecipe())
})

it('reproduces repeated label routing failures and repairs only recipient refs without partial commits', async () => {
  const s = setup(); const id = s.create(); s.stage(id)
  const ref = castOf(s.commands.snapshot(id)).encounters.find(item => item.observerId === 'a' && item.actorId === 'b')!.ref
  const otherRef = castOf(s.commands.snapshot(id)).encounters.find(item => item.observerId === 'c' && item.actorId === 'b')!.ref
  const errors: string[] = []
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, { execute: async (request, _signal, submit) => {
    expect(request.context.text).toContain('label is display text, never a routing value')
    const before = s.commands.snapshot(id)
    const turn: NpcTurnInput = { posture: 'watching', thoughts: [{ content: 'I will ask about the route.', about: ['the road'] }],
      behavior: [{ kind: 'action', attempt: 'I turn toward the door.' }, { kind: 'speech', text: 'Which route, stranger-1?', to: ['stranger-1'] }] }
    try { submit(turn); throw new Error('Expected routing rejection') } catch (error) {
      if (!(error instanceof Error)) throw error
      errors.push(error.message.replaceAll(ref, '<visible-ref>'))
      expect(error.message).toContain('behavior[1].to[0]')
      expect(error.message).toContain(ref)
      expect(error.message).not.toContain('SECRET-NAME')
      expect(error.message).not.toContain(otherRef)
    }
    expect(s.commands.snapshot(id)).toEqual(before)
    expect(() => submit({ ...turn, behavior: [{ kind: 'speech', text: 'Hello.', to: [otherRef] }] })).toThrow('behavior[0].to[0]')
    expect(s.commands.snapshot(id)).toEqual(before)
    submit({ ...turn, behavior: [turn.behavior![0]!, { ...turn.behavior![1]!, kind: 'speech', text: 'Which route, stranger-1?', to: [ref] }] })
  } }, s.values)
  for (let turn = 0; turn < 2; turn++) await runtime.run(s.scope(id), 'a')
  expect(errors[0]).toBe(errors[1])
  expect(errors[0]).toMatchInlineSnapshot(`
    "behavior[1].to[0]: Person reference is unavailable. This visible label has ref="<visible-ref>"; copy that ref.
    No part of this turn was committed. Correct only the listed fields and resubmit the complete npc_commit_turn, preserving speech, actions and required fields. Labels are display text; person refs are not evidence sourceRefs."
  `)
  const snapshot = s.commands.snapshot(id)
  expect(lifecycleFor(snapshot, 'a').thoughts).toHaveLength(2)
  expect(snapshot.entities.filter(item => item.key.collection === 'behavior')).toHaveLength(4)
  expect(s.commands.replay(id, snapshot.instance.revision)).toEqual(snapshot)
  await runtime.dispose()
})

it('offers the full cast for control before staging while keeping off-scene embodiment unavailable', async () => {
  const s = setup(['a', 'b']); const id = s.create()
  const queries = new PlayQueries(s.commands, 40)
  expect(queries.embodimentChoices(id)).toMatchObject({ entries: [], controlEntries: [
    { actorId: 'a', trueName: 'SECRET-NAME-a', appearance: 'stranger-0', inScene: false },
    { actorId: 'b', trueName: 'SECRET-NAME-b', appearance: 'stranger-1', inScene: false },
  ] })
  const player = new PlayerApplication(s.commands, s.values, { cancel: async () => {} }, 6000)
  await player.control(s.scope(id), 'b')
  const speech = { actorId: 'b', reason: 'Player input', behavior: [{ kind: 'speech' as const, text: 'Hello.', delivery: 'spoken' as const, to: [] }] }
  await expect(player.embody(s.scope(id), speech)).rejects.toThrow('not in the current scene')
  s.stage(id, ['b'])
  expect(queries.embodimentChoices(id)).toMatchObject({ entries: [{ actorId: 'b' }], controlEntries: [
    { actorId: 'a', inScene: false }, { actorId: 'b', inScene: true },
  ] })
  expect(queries.embodimentChoices(id, 0).controlEntries.every(person => !person.inScene)).toBe(true)
  await player.embody(s.scope(id), speech)
  expect(queries.read({ instanceId: id, audience: { kind: 'actor', actorId: 'b' }, offset: 0, limit: 40 })).toMatchObject({
    playerActorId: 'b', rows: [{ origin: 'player', text: 'Hello.' }],
  })
})

it('reports every routing field together and leaves ambiguous labels unresolved', async () => {
  const s = setup(); const id = s.create()
  s.people.stage(s.scope(id), { id: 'inn', location: 'inn', present: ['a', 'b', 'c'],
    appearances: [{ actorId: 'b', key: 'coat-b', label: 'A traveler' }, { actorId: 'c', key: 'coat-c', label: 'A traveler' }] })
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, { execute: async (_request, _signal, submit) => {
    const before = s.commands.snapshot(id)
    const invalid: NpcTurnInput = { posture: 'watching', behavior: [
      { kind: 'speech', text: 'Hello.', to: ['A traveler'] }, { kind: 'action', attempt: 'Point at the door.', target: 'door' }],
    state_changes: [stateChangeSchema.parse({ fieldId: 'trust', expectedRevision: 0, value: 1, reason: 'A greeting.', sourceRefs: [],
      definition: { id: 'trust', name: 'Trust', description: 'Trust', group: 'Inner', type: 'number', owner: 'world',
        actorId: 'SECRET-NAME-a', targetActorId: 'A traveler', audience: ['SECRET-NAME-b'], guidance: '' } })],
    knowledge_changes: [knowledgeChangeSchema.parse({ id: 'claim', expectedRevision: 0, text: 'A greeting.', kind: 'belief',
      attitude: 'undecided', acquisition: 'heard', entityRefs: ['A traveler'], sourceRefs: [], status: 'active', reason: 'A greeting.' })],
    discussion: { action: 'speak', eagerness: 'low', next_speaker_id: 'A traveler' } }
    let message = ''
    try { submit(invalid) } catch (error) { if (!(error instanceof Error)) throw error; message = error.message }
    for (const path of ['behavior[0].to[0]', 'behavior[1].target', 'state_changes[0].definition.actorId',
      'state_changes[0].definition.targetActorId', 'state_changes[0].definition.audience[0]',
      'knowledge_changes[0].entityRefs[0]', 'discussion.next_speaker_id']) expect(message).toContain(path)
    expect(message).toContain('This label is ambiguous')
    expect(message).not.toContain('SECRET-NAME')
    expect(s.commands.snapshot(id)).toEqual(before)
    submit({ posture: 'watching', behavior: [{ kind: 'action', attempt: 'Point at the door.' }] })
  } }, s.values)
  await runtime.run(s.scope(id), 'a')
  await runtime.dispose()
})

it('persists player ownership independently of the protagonist and rejects autonomous execution until released', async () => {
  const s = setup(); const id = s.create(); s.stage(id)
  const player = new PlayerApplication(s.commands, s.values, { cancel: async () => {} }, 6000)
  let calls = 0
  const actors = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => { calls++; return silence() }), s.values)
  const claim = s.scope(id)
  const accepted = await player.control(claim, 'b')
  expect(await player.control(claim, 'b')).toEqual(accepted)
  await expect(actors.run(s.scope(id), 'b')).rejects.toThrow('controlled by the player')
  expect(calls).toBe(0)
  const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
  const imported = archives.import(archives.export(id, []), s.values.id() as CommandId)
  expect(new PlayQueries(s.commands, 40).read({ instanceId: imported.instance.id, audience: { kind: 'observer' }, offset: 0, limit: 40 }).playerActorId).toBe('b')
  expect(entity(s.commands.snapshot(id), { collection: 'setting', id: 'book' })).toMatchObject({ protagonistActorId: null })
  await player.control(s.scope(id), null)
  await actors.run(s.scope(id), 'b')
  expect(calls).toBe(1)
  await actors.dispose()
})

it.each(['pass', 'speak'] as const)('skips player preparation and waits for an explicit player %s without writing private intent', async (action) => {
  const s = setup(['a', 'b']); const id = s.create(); s.stage(id, ['a', 'b'])
  const player = new PlayerApplication(s.commands, s.values, { cancel: async () => {} }, 6000)
  await player.control(s.scope(id), 'a')
  new DiscussionApplication(s.commands, s.values).start(s.scope(id), { topic: 'Choose a route', participantIds: ['a', 'b'], maxRounds: 1 })
  const calls: string[] = []
  const actors = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async (request) => {
    calls.push(request.context.actorId)
    return { posture: 'waiting', discussion: { action: 'pass', eagerness: 'low' } }
  }), s.values)
  const runtime = new DiscussionRuntime(s.commands, actors, s.values, 8)
  expect((await runtime.advance(s.scope(id))).status).toBe('waiting-player')
  expect(calls).toEqual(['b'])
  const query = new PlayQueries(s.commands, 40)
  const read = () => query.read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 40 })
  expect(read()).toMatchObject({ phase: 'waiting-player', playerTurn: true, discussionPreparation: { total: 1, completed: 1 } })
  expect(discussionsOf(s.commands.snapshot(id)).discussions[0]?.participantIntents?.a).toBeUndefined()
  if (action === 'pass') await player.passDiscussion(s.scope(id))
  else await player.embody(s.scope(id), { actorId: 'a', reason: 'My choice', behavior: [{ kind: 'speech', text: 'Take the east road.', delivery: 'spoken', to: [] }] })
  expect(read().playerTurn).toBe(false)
  expect(discussionsOf(s.commands.snapshot(id)).discussions[0]?.turns[0]).toMatchObject({ speakerId: 'a', action,
    text: action === 'pass' ? '' : 'Take the east road.' })
  expect((await runtime.advance(s.scope(id))).status).toBe('awaiting-director')
  expect(calls).toEqual(['b', 'b'])
  await actors.dispose()
})

it('fences a late actor result when the player takes over during preparation', async () => {
  const s = setup(['a', 'b']); const id = s.create(); s.stage(id, ['a', 'b'])
  new DiscussionApplication(s.commands, s.values).start(s.scope(id), { topic: 'Choose a route', participantIds: ['a', 'b'], maxRounds: 1 })
  let release!: () => void
  const actors = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => {
    await new Promise<void>((resolve) => { release = resolve })
    return { posture: 'waiting', discussion: { action: 'pass', eagerness: 'high' } }
  }), s.values)
  const pending = actors.run(s.scope(id), 'a')
  const rejected = expect(pending).rejects.toThrow()
  const player = new PlayerApplication(s.commands, s.values, { cancel: async () => {} }, 6000)
  await player.control(s.scope(id), 'a')
  release(); await rejected
  expect(discussionsOf(s.commands.snapshot(id)).discussions[0]).toMatchObject({ preparationPendingIds: ['b'], preparationExemptIds: ['a'] })
  expect(entity(s.commands.snapshot(id), { collection: 'posture', id: 'a' })).toBeUndefined()
  expect(discussionsOf(s.commands.snapshot(id)).discussions[0]?.participantIntents?.a).toBeUndefined()
  await actors.dispose()
})

it('rejects name-based initial knowledge without partial creation, then accepts one corrected person', () => {
  const s = setup(); const id = s.create()
  const before = s.commands.snapshot(id)
  const input = createPersonSchema.parse({ definition: { displayName: 'Sister Vale', publicPersona: 'A visitor.', rolePrompt: '',
    capabilities: ['speak'], actingGuidance: {}, initialKnowledge: [
      { text: 'I know the courier.', targetActorId: 'a' },
      { text: 'I remember the password.', targetActorId: 'Sister Vale' },
    ] }, purpose: 'Deliver a letter.', sourceRefs: [], location: 'Inn', importance: 'supporting' })
  expect(() => s.people.create(s.scope(id), input)).toThrow('omit targetActorId')
  expect(s.commands.snapshot(id)).toEqual(before)
  input.definition.initialKnowledge[1] = { text: 'I remember the password.', kind: 'belief', attitude: 'believed' }
  const scope = s.scope(id)
  const created = s.people.create(scope, input)
  expect(s.people.create(scope, input)).toEqual(created)
  expect(castOf(s.commands.snapshot(id)).entries).toHaveLength(4)
})

it('keeps a runtime character appearance separate from a location-based encounter label', async () => {
  const s = setup(); const id = s.create()
  s.people.create(s.scope(id), createPersonSchema.parse({
    definition: { displayName: 'Grey minstrel', appearance: 'A pale traveler in a grey veil',
      publicPersona: 'A visitor.', rolePrompt: '', capabilities: ['speak'], actingGuidance: {} },
    purpose: 'Deliver a letter.', sourceRefs: [], location: 'Outside the room', importance: 'supporting',
  }))
  const actorId = castOf(s.commands.snapshot(id)).entries.find(person => person.definition.displayName === 'Grey minstrel')!.definition.actorId
  s.people.stage(s.scope(id), { id: 'inn', location: 'Inn', present: [actorId],
    appearances: [{ actorId, key: 'ordinary', label: 'Outside the room' }] })
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({
    posture: 'waiting', behavior: [{ kind: 'speech', text: 'May I enter?' }],
  })), s.values)
  await runtime.run(s.scope(id), actorId)
  const query = new PlayQueries(s.commands, 40)
  const view = query.read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 40 })
  const identity = { trueName: 'Grey minstrel', appearance: 'A pale traveler in a grey veil', label: 'Outside the room' }
  expect(view.rows[0]?.speaker).toMatchObject(identity)
  expect(view.people[0]).toMatchObject(identity)
  expect(query.embodimentChoices(id).entries[0]).toMatchObject(identity)
})

it('prepares discussion participants concurrently on frozen inputs and fences external edits', async () => {
  for (const interrupt of ['none', 'cancel', 'edit']) {
    const s = setup(['a', 'b']); const id = s.create(); s.stage(id, ['a', 'b'])
    const discussion = new DiscussionApplication(s.commands, s.values)
    discussion.start(s.scope(id), { topic: 'The letter', participantIds: ['a', 'b'], maxRounds: 1 })
    const contexts: number[] = []
    const releases: (() => void)[] = []
    const actors = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async (request) => {
      contexts.push(request.context.revision)
      await new Promise<void>((resolve) => { releases.push(resolve) })
      return { posture: 'watching', discussion: { action: 'pass', eagerness: 'low' } }
    }), s.values)
    const scope = s.scope(id)
    const prepared = actors.prepareDiscussion(scope, ['a', 'b'])
    expect(contexts).toEqual([scope.expectedRevision, scope.expectedRevision])
    if (interrupt === 'cancel') actors.cancel(s.scope(id), 'Player interruption')
    if (interrupt === 'edit') new ConfigurationApplication(s.commands).setSettings(s.scope(id), { overrides: { title: 'Edited' }, reason: 'Concurrent edit' })
    for (const release of releases.reverse()) release()
    if (interrupt !== 'none') {
      await expect(prepared).rejects.toThrow()
      expect(discussionsOf(s.commands.snapshot(id)).discussions[0]?.preparationPendingIds).toHaveLength(2)
    } else {
      expect(await prepared).toHaveLength(2)
      expect(discussionsOf(s.commands.snapshot(id)).discussions[0]?.preparationPendingIds).toBeUndefined()
    }
    expect(new PlayQueries(s.commands, 40).read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 40 }).rows).toEqual([])
    await actors.dispose()
  }
})

it('reports the originating preparation failure after cancelling and draining earlier participants', async () => {
  const s = setup(['a', 'b']); const id = s.create(); s.stage(id, ['a', 'b'])
  new DiscussionApplication(s.commands, s.values).start(s.scope(id), { topic: 'Open the letter', participantIds: ['a', 'b'], maxRounds: 1 })
  const failure = new Error('Insufficient Balance')
  let cancelled = false
  let drained = false
  const actors = new ActorRuntime(s.commands, s.cognition, s.queries, { execute: async ({ context }, signal) => {
    if (context.actorId === 'b') throw failure
    await new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => { cancelled = true; reject(new Error(String(signal.reason))) }, { once: true })
    }).finally(() => { drained = true })
  } }, s.values)
  try {
    await expect(actors.prepareDiscussion(s.scope(id), ['a', 'b'])).rejects.toBe(failure)
    expect({ cancelled, drained }).toEqual({ cancelled: true, drained: true })
    expect(discussionsOf(s.commands.snapshot(id)).discussions[0]?.preparationPendingIds).toEqual(['a', 'b'])
    expect(new PlayQueries(s.commands, 40).read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 40 }).rows).toEqual([])
  } finally { await actors.dispose() }
})

it('projects private preparation as a revisable intention without turning it into public speech or other actors knowledge', async () => {
  const s = setup(['a', 'b']); const id = s.create(); s.stage(id, ['a', 'b'])
  new DiscussionApplication(s.commands, s.values).start(s.scope(id), { topic: 'Open the letter', participantIds: ['a', 'b'], maxRounds: 4 })
  const before = s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' })
  expect(before.text).toContain('do not prewrite a speech or an evidence checklist')
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async request => ({
    posture: 'watching', behavior: [], discussion: { action: 'pass', eagerness: 'high', stance: `${request.context.actorId}-private-intention` },
  })), s.values)
  await runtime.prepareDiscussion(s.scope(id), ['a', 'b'])
  const after = s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' })
  const floor = after.sections.find(section => section.id === 'discussion')!.content
  expect(floor).toContain('a-private-intention')
  expect(after.text).not.toContain('b-private-intention')
  expect(floor).not.toContain('updatedAt')
  expect(floor).not.toContain('"round"')
  expect(floor).toContain('"publicTurns":{"used":0,"total":8,"remaining":8')
  expect(floor).toContain('the host pauses and resumes the discussion after settlement')
  expect(floor).toContain('lack of a floor is not agreement')
  expect(floor).not.toContain('no useful exchange remains before an external result')
  expect(new PlayQueries(s.commands, 40).read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 40 }).rows).toEqual([])
  expect(s.queries.actorContext({ instanceId: id, actorId: 'a', revision: before.revision, query: '' })).toEqual(before)
  await runtime.dispose()
})

it('counts public passes in the actor exchange budget without counting private preparation', async () => {
  const s = setup(['a', 'b']); const id = s.create(); s.stage(id, ['a', 'b'])
  new DiscussionApplication(s.commands, s.values).start(s.scope(id), { topic: 'Wait for the letter', participantIds: ['a', 'b'], maxRounds: 1 })
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({
    posture: 'watching', behavior: [], discussion: { action: 'pass', eagerness: 'medium' },
  })), s.values)
  await runtime.prepareDiscussion(s.scope(id), ['a', 'b'])
  const before = s.queries.actorContext({ instanceId: id, actorId: 'b', query: '' })
  await runtime.run(s.scope(id), 'a')
  const after = s.queries.actorContext({ instanceId: id, actorId: 'b', query: '' })
  expect(before.text).toContain('"publicTurns":{"used":0,"total":2,"remaining":2')
  expect(after.text).toContain('"publicTurns":{"used":1,"total":2,"remaining":1')
  const projectedFloor: unknown = JSON.parse(after.sections.find(section => section.id === 'discussion')!.content.split('[DISCUSSION FLOOR]\n')[1]!)
  expect(projectedFloor).toMatchObject({ opportunities: [
    { actorId: expect.stringMatching(/^person-/u) as unknown, publicTurns: 1 }, { actorId: 'self', publicTurns: 0 },
  ] })
  expect(s.queries.actorContext({ instanceId: id, actorId: 'b', revision: before.revision, query: '' })).toEqual(before)
  await runtime.run(s.scope(id), 'b')
  expect(discussionsOf(s.commands.snapshot(id)).discussions[0]?.status).toBe('summarizing')
  await runtime.dispose()
})

it.each(['balanced', 'eagerness'] as const)('captures %s scheduling for the discussion and keeps explicit handoffs', async (floorPolicy) => {
  const s = setup(); const id = s.create(); s.stage(id)
  const config = new ConfigurationApplication(s.commands)
  config.setSettings(s.scope(id), { overrides: { discussionSettings: { maxRounds: 4, floorPolicy } }, reason: 'Choose discussion scheduling' })
  new DiscussionApplication(s.commands, s.values).start(s.scope(id), { topic: 'The disputed artifact', participantIds: ['a', 'b', 'c'], maxRounds: 4 })
  const startedRevision = s.commands.snapshot(id).instance.revision
  // Later settings apply to the next discussion, not the active exchange.
  config.setSettings(s.scope(id), { overrides: { discussionSettings: { maxRounds: 4, floorPolicy: floorPolicy === 'balanced' ? 'eagerness' : 'balanced' } }, reason: 'Configure next discussion' })
  const handoff: { ref?: string } = {}
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async request => ({
    posture: 'watching', behavior: [], discussion: { action: 'pass', eagerness: request.context.actorId === 'c' ? 'low' : 'high',
      ...(handoff.ref === undefined ? {} : { next_speaker_id: handoff.ref }) },
  })), s.values)
  await runtime.prepareDiscussion(s.scope(id), ['a', 'b', 'c'])
  await runtime.run(s.scope(id), 'a')
  await runtime.run(s.scope(id), 'b')
  const discussion = discussionsOf(s.commands.snapshot(id)).discussions[0]!
  expect(discussion.floorPolicy).toBe(floorPolicy)
  expect(discussion.currentSpeakerId).toBe(floorPolicy === 'balanced' ? 'c' : 'a')
  const speaker = discussion.currentSpeakerId!
  const people = JSON.parse(s.queries.actorContext({ instanceId: id, actorId: speaker, query: '' }).sections.find(section => section.id === 'people')!.content.split('\n').at(-1)!) as { ref: string; label: string }[]
  handoff.ref = people.find(person => person.label === 'stranger-1')!.ref
  await runtime.run(s.scope(id), speaker)
  expect(discussionsOf(s.commands.snapshot(id)).discussions[0]?.currentSpeakerId).toBe('b')
  expect(discussionsOf(s.commands.replay(id, startedRevision)).discussions[0]?.floorPolicy).toBe(floorPolicy)
  const view = new PlayQueries(s.commands, 40).read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 40 })
  expect(view.discussion?.publicTurns).toEqual({ used: 3, total: 12, remaining: 9 })
  await runtime.dispose()
})

it('shares an in-flight command and preserves completed receipts after cancellation or a later run', async () => {
  const s = setup(); const a = s.create(); const b = s.create(); s.stage(a)
  let release!: () => void
  let calls = 0
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => {
    calls++
    await new Promise<void>((resolve) => { release = resolve })
    return silence()
  }), s.values)
  const scope = s.scope(a)
  const running = runtime.run(scope, 'a')
  expect(runtime.run(scope, 'a')).toBe(running)
  await expect(runtime.run({ ...scope, expectedRevision: scope.expectedRevision + 1 }, 'a')).rejects.toThrow('identity')
  const status = new CommandStatusQueries(s.commands)
  expect(status.read(a, scope.id)).toMatchObject({ execution: 'running', acceptedRevision: scope.expectedRevision + 1 })
  expect(status.read(b, scope.id)).toEqual({ acceptedRevision: null, execution: 'none' })
  release()
  const receipt = await running
  expect(calls).toBe(1)
  runtime.cancel(s.scope(a), 'Pause after commit')
  expect(status.read(a, scope.id).execution).toBe('completed')
  expect(await runtime.run(scope, 'a')).toEqual(receipt)
  expect(calls).toBe(1)
})

it('derives a legacy preparation boundary before the first public request without rewriting history', async () => {
  const s = setup(['a', 'b']); const id = s.create(); s.stage(id, ['a', 'b'])
  new DiscussionApplication(s.commands, s.values).start(s.scope(id), { topic: 'The letter', participantIds: ['a', 'b'], maxRounds: 1 })
  const actors = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({
    posture: 'watching', discussion: { action: 'pass', eagerness: 'low' },
  })), s.values)
  await actors.prepareDiscussion(s.scope(id), ['a', 'b'])
  const beforePublic = s.commands.snapshot(id).instance.revision
  await actors.run(s.scope(id), 'a')
  const withoutMetadata = (snapshot: ReturnType<typeof s.commands.snapshot>) => ({ ...snapshot,
    entities: snapshot.entities.filter(item => item.key.collection !== 'discussion-preparation') })
  const legacy = new PlayQueries({ snapshot: instance => withoutMetadata(s.commands.snapshot(instance)),
    replay: (instance, revision) => withoutMetadata(s.commands.replay(instance, revision)),
    receipt: (instance, command) => s.commands.receipt(instance, command),
  }, 40)
  const preparation = legacy.read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 40 }).discussionPreparation!
  expect(preparation.actors.map(actor => actor.revision)).toEqual([beforePublic, beforePublic])
  expect(preparation.actors.every(actor => actor.attempt === undefined)).toBe(true)
  await actors.dispose()
})

it('reports a failed accepted attempt separately from an uncommitted rejection', async () => {
  const s = setup(); const a = s.create(); s.stage(a)
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => { throw new Error('Provider offline') }), s.values)
  const scope = s.scope(a)
  await expect(runtime.run(scope, 'a')).rejects.toThrow('Provider offline')
  expect(new CommandStatusQueries(s.commands).read(a, scope.id)).toMatchObject({ execution: 'failed', acceptedRevision: scope.expectedRevision + 1 })
})

it('fences a discussion interruption atomically and resumes without displaying a stale paused execution', async () => {
  const s = setup(['a', 'b']); const a = s.create(); s.stage(a, ['a', 'b'])
  new DiscussionApplication(s.commands, s.values).start(s.scope(a), { topic: 'The letter', participantIds: ['a', 'b'], maxRounds: 1 })
  let ready!: () => void
  let release!: () => void
  const entered = new Promise<void>((resolve) => { ready = resolve })
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => {
    await new Promise<void>((resolve) => { release = resolve; ready() })
    return { posture: 'watching', discussion: { action: 'pass', eagerness: 'low' } }
  }), s.values)
  const running = runtime.run(s.scope(a), 'a')
  const outcome = running.catch((error: unknown) => error)
  await entered
  const player = new PlayerApplication(s.commands, s.values, { cancel: async () => {} }, 6000)
  const discussionId = discussionsOf(s.commands.snapshot(a)).discussions[0]!.id
  const scope = s.scope(a)
  const input = { discussionId, operation: 'intervene' as const, intervention: 'speak' as const }
  const accepted = await player.controlDiscussion(scope, input)
  const after = s.commands.snapshot(a)
  expect(after.instance.epoch).toBe(1)
  expect(discussionsOf(after).discussions[0]?.status).toBe('awaiting-player')
  release(); expect(await outcome).toBeInstanceOf(Error)
  expect(s.commands.snapshot(a)).toEqual(after)
  expect(await player.controlDiscussion(scope, input)).toEqual(accepted)
  await player.controlDiscussion(s.scope(a), { discussionId, operation: 'resume' })
  const resumedActors = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({
    posture: 'watching', discussion: { action: 'pass', eagerness: 'low' },
  })), s.values)
  const discussions = new DiscussionRuntime(s.commands, resumedActors, s.values, 8)
  const discussionScope = s.scope(a)
  const advancing = discussions.advance(discussionScope)
  expect(discussions.advance(discussionScope)).toBe(advancing)
  await advancing
  const view = new PlayQueries(s.commands, 20).read({ instanceId: a, audience: { kind: 'observer' }, offset: 0, limit: 20 })
  expect(view.phase).toBe('awaiting-director')
  expect(view.discussion?.topic).toBe('The letter')
  expect(view.people.map(person => person.trueName)).toEqual(['SECRET-NAME-a', 'SECRET-NAME-b'])
})

it('authorizes historical execution reads without actors and rejects invalid ownership before consulting the adapter', async () => {
  const s = setup(); const a = s.create(); const b = s.create()
  const calls: unknown[] = []
  const history = new ExecutionHistoryQueries(s.commands, {
    usage: async (instanceId, actorIds) => { calls.push({ instanceId, actorIds })
      return { stats: { turns: 0, steps: 0, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 },
        usage: { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 } } },
    follow: async function* () { throw new Error('No live fixture execution') },
    listRequests: async (scope, offset, limit) => { calls.push({ scope, offset, limit })
      return { scope, entries: [], total: 0, nextOffset: null } },
    readRequest: async () => { throw new Error('No execution history') },
  }, 20, { evidence: () => [] })
  expect(await history.list({ instanceId: a, revision: 0, actorId: 'a' }, 0, 10)).toMatchObject({ entries: [] })
  expect(await history.list({ instanceId: b, revision: 0 }, 0, 10)).toMatchObject({ scope: { instanceId: b } })
  expect(() => history.list({ instanceId: a, revision: 0, actorId: 'absent' }, 0, 10)).toThrow()
  expect(() => history.list({ instanceId: a, revision: 0 }, 0, 21)).toThrow('page')
  expect(() => history.list({ instanceId: a, revision: 999 }, 0, 10)).toThrow()
  expect(() => history.read({ instanceId: a, revision: 0 }, -1)).toThrow('coordinate')
  expect(calls).toHaveLength(2)
  expect((await history.usage(a)).stats.steps).toBe(0)
  expect(calls.at(-1)).toEqual({ instanceId: a, actorIds: ['a', 'b', 'c'] })
  expect(() => history.usage('missing' as InstanceId)).toThrow()
})

it('rejects imported director cognition writes, forged system world changes, and unknown record types atomically', () => {
  const s = setup(); const a = s.create(); s.stage(a)
  const archiveService = new NarrativeArchives(s.store, s.values, { verify: () => {} })
  const original = archiveService.export(a, [])
  const director = structuredClone(original)
  director.commits[0]!.command.principal = { kind: 'director', attempt: 'director', epoch: 0 }
  director.commits[0]!.events.push(replace('knowledge', 'a', knowledgeOf(s.commands.snapshot(a), 'a')))
  expect(() => archiveService.import(director, 'forged-director' as CommandId)).toThrow('Director history exceeds')
  const system = structuredClone(original)
  system.commits[0]!.command.principal = { kind: 'system', operation: 'settle-execution' }
  system.commits[0]!.command.kind = 'execution.failed'
  expect(() => archiveService.import(system, 'forged-system' as CommandId)).toThrow('System history exceeds')
  const unknown = structuredClone(original)
  unknown.initial.entities.push({ key: { collection: 'unknown-future-record', id: 'one' }, value: null })
  expect(() => archiveService.import(unknown, 'unknown-record' as CommandId)).toThrow('Unknown narrative record')
  expect(s.library.instances().map(instance => instance.id)).toEqual([a])
})

it('rejects model-authored range changes in imported accepted turns', async () => {
  const s = setup(); const a = s.create(); s.stage(a)
  s.cognition.revise(s.scope(a), 'a', { knowledge: [], lifecycle: [], state: [stateChangeSchema.parse({
    fieldId: 'trust', expectedRevision: 0, value: 2, reason: 'Author scale', sourceRefs: [],
    definition: { id: 'trust', name: 'Trust', description: 'Subjective trust', group: 'Relations', type: 'number',
      owner: 'actor', actorId: 'a', audience: [], guidance: '', minimum: 0, maximum: 5 },
  })] })
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => silence()), s.values)
  await runtime.run(s.scope(a), 'a')
  const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
  const archive = archives.export(a, [])
  const state = structuredClone(stateOf(s.commands.snapshot(a), 'a'))
  for (const entry of [...state.entries, ...state.history]) entry.definition.maximum = 100
  archive.commits.at(-1)!.events.push(replace('state', 'a', state))
  expect(() => archives.import(archive, 'changed-scale' as CommandId)).toThrow('Model history changes')
  expect(stateOf(s.commands.snapshot(a), 'a').entries[0]?.definition.maximum).toBe(5)
})

describe('people and cognition without an Actor session', () => {
  it('creates independent same-name people, preserves absence, and reuses identity on reentry', () => {
    const s = setup(); const a = s.create(); const b = s.create()
    const input = createPersonSchema.parse({ definition: { displayName: 'Innkeeper', publicPersona: 'Keeps an inn.', rolePrompt: '', capabilities: ['speak'], actingGuidance: {} },
      location: 'inn', importance: 'supporting', purpose: 'Answers a question about a room.', sourceRefs: [] })
    const one = s.people.create(s.scope(a), input); const two = s.people.create(s.scope(a), input)
    const ids = [one, two].map(commit => (commit.result as { actorId: string }).actorId)
    expect(ids[0]).not.toBe(ids[1])
    expect(s.queries.authorPeople(a, { query: 'Innkeeper', offset: 0, limit: 10 }).total).toBe(2)
    expect(s.queries.authorPeople(b, { query: 'Innkeeper', offset: 0, limit: 10 }).total).toBe(0)
    s.stage(a, ['a', ids[0]!])
    const initial = castOf(s.commands.snapshot(a)).encounters.find(item => item.observerId === 'a' && item.actorId === ids[0])!
    s.stage(a, ['a']); s.stage(a, ['a', ids[0]!])
    expect(castOf(s.commands.snapshot(a)).encounters.find(item => item.ref === initial.ref)?.sceneId).toBe('inn')
    expect(entity(s.commands.snapshot(a), { collection: 'execution', id: ids[0]! })).toBeUndefined()
  })

  it('keeps private evidence and mistaken identity private, including preview and historical labels', () => {
    const s = setup(); const a = s.create(); s.stage(a)
    s.world.observe(s.scope(a), { summary: 'A private claim was heard.', content: 'The stranger claimed an alias.', state: [],
      deliveries: [{ actorId: 'a', content: '[[person:b]] says: call me Vale. PRIVATE-CLAIM', kind: 'claim', sourceRefs: [] }] })
    const before = s.commands.snapshot(a)
    const evidence = evidenceFor(before, 'a')[0]!
    const ref = castOf(before).encounters.find(item => item.observerId === 'a' && item.actorId === 'b')!.ref
    const change = knowledgeChangeSchema.parse({ id: 'recognition', expectedRevision: 0, text: 'The stranger calls himself Vale.', kind: 'identity',
      attitude: 'believed', acquisition: 'heard', entityRefs: [ref], sourceRefs: [evidence.id], status: 'active', reason: 'I heard him.', label: 'Vale' })
    s.cognition.revise(s.scope(a), 'a', { knowledge: [change], state: [], lifecycle: [] })
    const context = s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' })
    expect(context.text).toContain('Vale')
    expect(context.text).not.toContain('SECRET-NAME')
    expect(context.text.length).toBeLessThanOrEqual(6000)
    expect(s.queries.actorContext({ instanceId: a, actorId: 'c', query: '' }).text).not.toContain('PRIVATE-CLAIM')
    expect(s.queries.actorContext({ instanceId: a, actorId: 'a', revision: before.instance.revision, query: '' }).text).not.toContain('"label":"Vale"')
    expect(() => s.cognition.revise(s.scope(a), 'c', { knowledge: [{ ...change, entityRefs: [] }], state: [], lifecycle: [] })).toThrow('unavailable')
    expect(knowledgeOf(s.commands.snapshot(a), 'c').entries).toEqual([])
    expect(s.commands.replay(a, context.revision)).toEqual(s.commands.snapshot(a))
  })

  it('does not seed new people with historical public evidence or overwrite current cognition when editing settings', () => {
    const s = setup(); const a = s.create(); s.stage(a)
    s.world.observe(s.scope(a), { summary: 'Bell rang.', content: 'The bell rang.', state: [], deliveries: ['a', 'b', 'c'].map(actorId => ({ actorId, content: 'BELL-EXPERIENCE', kind: 'observation', sourceRefs: [] })) })
    const created = s.people.create(s.scope(a), createPersonSchema.parse({ definition: { displayName: 'Visitor', publicPersona: 'A traveler.', rolePrompt: '', capabilities: ['speak'], actingGuidance: {} },
      location: 'road', importance: 'supporting', purpose: 'Needs a room.', sourceRefs: [] }))
    const actorId = (created.result as { actorId: string }).actorId
    expect(evidenceFor(s.commands.snapshot(a), actorId)).toEqual([])
    expect(s.queries.actorContext({ instanceId: a, actorId, query: '' }).text).toContain('Rain wets clothing.')
    expect(s.queries.actorContext({ instanceId: a, actorId, query: '' }).text).not.toContain('BELL-EXPERIENCE')
    const person = personOf(s.commands.snapshot(a), actorId)
    s.people.revise(s.scope(a), { actorId, expectedPersonRevision: 1, definition: { ...person.definition, initialKnowledge: [{ text: 'NEW INITIAL SEED', kind: 'belief', attitude: 'believed' }] },
      location: person.location, archived: false, importance: 'main', reason: 'Promote the visitor.' })
    expect(knowledgeOf(s.commands.snapshot(a), actorId).entries).toEqual([])
  })

  it('rolls back a mixed turn and accepts the same corrected retry exactly once', async () => {
    const s = setup(); const a = s.create(); s.stage(a)
    const stateChange = stateChangeSchema.parse({ fieldId: 'pain', expectedRevision: 0,
      definition: { id: 'pain', name: 'Pain', description: 'Subjective pain.', group: 'Body', type: 'number', owner: 'actor', actorId: 'self', minimum: 0, maximum: 5, guidance: '' },
      value: 3, reason: 'The bruise throbs.', sourceRefs: [] })
    let turn: NpcTurnInput = { posture: 'waiting', state_changes: [stateChange], memories: [{ content: 'I heard a door close.' }],
      behavior: [{ kind: 'speech', text: 'Who is there?', to: ['invisible-person'], delivery: 'whispered' }] }
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(() => Promise.resolve(turn)), s.values)
    await expect(runtime.run(s.scope(a), 'a')).rejects.toThrow('unavailable')
    expect(stateOf(s.commands.snapshot(a), 'a').entries).toEqual([])
    expect(s.commands.snapshot(a).entities.filter(item => item.key.collection === 'lifecycle:a')).toEqual([])
    turn = { ...turn, behavior: [{ kind: 'speech', text: 'Who is there?', to: [], delivery: 'spoken' }] }
    const scope = s.scope(a)
    const receipt = await runtime.run(scope, 'a')
    expect(stateOf(s.commands.snapshot(a), 'a').entries[0]?.value).toBe(3)
    expect(await runtime.run(scope, 'a')).toEqual(receipt)
    expect(s.commands.replay(a, receipt.revision)).toEqual(s.commands.snapshot(a))
  })

  it('passes the exact preview to execution and rejects late results after durable cancellation', async () => {
    const s = setup(); const a = s.create(); s.stage(a)
    let resolve!: (turn: ReturnType<typeof silence>) => void
    let captured: Parameters<ActorExecutor['execute']>[0] | undefined
    const executor = scripted((request) => { captured = request; return new Promise((done) => { resolve = done }) })
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, executor, s.values)
    const pending = runtime.run(s.scope(a), 'a')
    expect(captured?.context).toEqual(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }))
    runtime.cancel(s.scope(a), 'Player interrupts')
    resolve(silence())
    await expect(pending).rejects.toThrow('cancelled')
    expect(s.commands.snapshot(a).entities.filter(item => item.key.collection === 'behavior')).toEqual([])
    await runtime.dispose()
  })

  it('keeps all active memories, goals and intentions in the owner context', async () => {
    const s = setup(['a', 'b'], null, true); const id = s.create(); s.stage(id, ['a', 'b'])
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({
      posture: 'silent', memories: Array.from({ length: 30 }, (_, index) => ({ content: `Old recollection ${index}` })),
      goals: [{ operation: 'adopt', goal: 'Keep my promise at the gate.' }],
      intentions: [{ intention: 'Ask about the missing key.', trigger_kind: 'soon' }],
    })), s.values)
    await runtime.run(s.scope(id), 'a')
    const queries = new PerspectiveQueries(s.commands, 6000, value => value, 40)
    const context = queries.actorContext({ instanceId: id, actorId: 'a', query: '' })
    expect(context.text).toContain('Keep my promise at the gate.')
    expect(context.text).toContain('Ask about the missing key.')
    expect(context.text).toContain('Old recollection 0')
    expect(context.text).toContain('Old recollection 29')
    expect(queries.actorContext({ instanceId: id, actorId: 'b', query: '' }).text).not.toContain('missing key')
    expect(JSON.stringify(queries.recall({ instanceId: id, actorId: 'a', query: '' },
      { query: 'Old recollection 29', offset: 0, limit: 8 }))).toContain('Old recollection 29')
    await runtime.dispose()
  })

  it('keeps personal perceptions for empty queries and preserves frozen previews', async () => {
    const s = setup(['a', 'b']); const id = s.create(); s.stage(id, ['a', 'b'])
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'silent', memories: [
      { content: '花园里的苹果树今年结果了。' },
      { content: '银色钥匙藏在钟楼里。' },
    ] })), s.values)
    await runtime.run(s.scope(id), 'a')
    const revision = s.commands.snapshot(id).instance.revision
    s.world.observe(s.scope(id), { summary: 'Different views', content: 'AUTHOR SECRET', state: [], deliveries: [
      { actorId: 'a', content: '你看到了银色钥匙。', kind: 'observation', sourceRefs: [] },
      { actorId: 'b', content: '花园苹果树苹果树苹果树。', kind: 'observation', sourceRefs: [] },
    ] })
    const queries = new PerspectiveQueries(s.commands, 6000, value => value, 40)
    const current = queries.actorContext({ instanceId: id, actorId: 'a', query: '' })
    expect(current.text).toContain('银色钥匙藏在钟楼里。')
    expect(current.text).toContain('花园里的苹果树今年结果了。')
    expect(current.text).not.toContain('AUTHOR SECRET')
    expect(queries.actorContext({ instanceId: id, actorId: 'a', query: '苹果树' }).text).toContain('花园里的苹果树今年结果了。')
    const frozen = queries.actorContext({ instanceId: id, actorId: 'a', query: '', revision })
    expect(frozen.text).toContain('花园里的苹果树今年结果了。')
    expect(frozen.text).not.toContain('你看到了银色钥匙。')
    await runtime.dispose()
  })

  it('uses the shared semantic turn rules without sessions and preserves source proposals and opaque field retries', async () => {
    const s = setup(); const a = s.create(); const other = s.create(); s.stage(a)
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(() => Promise.resolve({
      posture: 'waiting', memories: [{ content: 'I will remember this choice.', importance: 4 }],
      state_changes: [stateChangeSchema.parse({ fieldId: 'resolve', expectedRevision: 0,
        definition: { id: 'resolve', name: 'Resolve', description: 'Commitment.', group: 'Inner', type: 'text', owner: 'actor', actorId: 'self', guidance: '' },
        value: 'I will wait.', reason: 'I made a choice.', sourceRefs: [] })],
      turning_points: [{ trigger: 'A choice.', interpretation: 'I can wait.', significance: 3,
        changes: [{ dimension: 'memory', subject: 'Patience', before: 'Haste', after: 'Willing to wait' }] }],
      behavior: [{ kind: 'speech', text: 'a', tone: 'soft' }], next_impulse: 'Listen.',
      context_update: [{ sourceIds: ['$behavior:0'], disposition: 'represented', reason: 'Keep the claim.',
        changes: [{ operation: 'add', kind: 'claim', text: 'I said a.', sourceIds: ['$behavior:0'] }] }],
    })), s.values)
    const scope = s.scope(a)
    const accepted = await runtime.run(scope, 'a')
    const snapshot = s.commands.snapshot(a)
    expect(await runtime.run(scope, 'a')).toEqual(accepted)
    expect(lifecycleFor(snapshot, 'a').memories.size).toBe(1)
    expect(lifecycleFor(snapshot, 'a').turningPoints.size).toBe(1)
    expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).text).toContain('field-ref:resolve')
    const proposal = snapshot.entities.find(item => item.key.collection === 'retention' && item.key.id === 'actor:a')!
    expect(JSON.stringify(proposal)).toContain('proposed')
    expect(JSON.stringify(proposal)).not.toContain('$behavior:')
    expect(evidenceFor(snapshot, 'b')[0]?.content).toBe('a')
    expect(lifecycleFor(s.commands.snapshot(other), 'a').memories.size).toBe(0)
    const next = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(() => Promise.resolve({ posture: 'silent',
      state_changes: [stateChangeSchema.parse({ fieldId: 'field-ref:resolve', expectedRevision: 1, value: 'Still waiting.', reason: 'No answer yet.', sourceRefs: [] })],
      context_update: [{ sourceIds: ['state:field-ref:resolve:r2'], disposition: 'represented', reason: 'Keep my changed resolve.',
        changes: [{ operation: 'add', kind: 'claim', text: 'I still chose to wait.', sourceIds: ['state:field-ref:resolve:r2'] }] }],
      turning_points: [{ trigger: 'A longer wait.', interpretation: 'I chose patience again.', significance: 3,
        changes: [{ dimension: 'belief', subject: 'Resolve', after: 'Sustained patience' }] }],
    })), s.values)
    await next.run(s.scope(a), 'a')
    const after = s.commands.snapshot(a)
    expect(stateOf(after, 'a').entries[0]?.revision).toBe(2)
    expect(retentionOf(after, 'actor:a').proposals.at(-1)?.unit.sourceIds).toEqual(['state:resolve:r2'])
    expect([...lifecycleFor(after, 'a').turningPoints.values()].at(-1)?.sourceRefs).toEqual(['state:resolve:r2'])
    expect(s.commands.replay(a, after.instance.revision)).toEqual(after)
    await runtime.dispose(); await next.dispose()
  })

  it('returns the committed receipt after execution reporting fails and does not run it twice', async () => {
    const s = setup(); const a = s.create(); s.stage(a)
    let calls = 0
    const executor: ActorExecutor = { execute: (_request, _signal, submit) => {
      calls++
      submit({ posture: 'silent', memories: [{ content: 'This already happened.' }] })
      return Promise.reject(new Error('Execution receipt delivery failed'))
    } }
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, executor, s.values)
    const scope = s.scope(a)
    const receipt = await runtime.run(scope, 'a')
    expect(await runtime.run(scope, 'a')).toEqual(receipt)
    expect(calls).toBe(1)
    expect(lifecycleFor(s.commands.snapshot(a), 'a').memories.size).toBe(1)
    expect(entity(s.commands.snapshot(a), { collection: 'execution', id: 'a' })).toMatchObject({ status: 'committed' })
    await runtime.dispose()
  })

  it('resolves copied style overrides and expires scene direction without contaminating another instance', async () => {
    const s = setup(); const a = s.create(); const b = s.create(); s.stage(a); s.stage(b)
    const configuration = new ConfigurationApplication(s.commands)
    const profile = { kind: 'actor' as const, guidance: { speechStyle: 'STORY-A-ONLY' } }
    const { styleProfileSchema } = await import('../src/style.ts')
    const storyStyle = configuration.setStyle(s.scope(a), { scope: 'story', key: 'actor:a', profile: styleProfileSchema.parse(profile) })
    configuration.setStyle(s.scope(a), { scope: 'scene', key: 'actor:a', sceneId: 'inn', instruction: 'SCENE-A-ONLY' })
    const shown = s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' })
    expect(shown.configurationRevision).toBe(storyStyle.revision + 1)
    expect(shown.text).toContain('STORY-A-ONLY')
    expect(shown.text).toContain('SCENE-A-ONLY')
    expect(s.queries.actorContext({ instanceId: a, actorId: 'b', query: '' }).text).not.toContain('STORY-A-ONLY')
    expect(s.queries.actorContext({ instanceId: b, actorId: 'a', query: '' }).text).not.toContain('STORY-A-ONLY')
    s.people.stage(s.scope(a), { id: 'road', location: 'Road', present: ['a'], appearances: [] })
    const after = s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' })
    expect(after.text).not.toContain('SCENE-A-ONLY')
    expect(after.text).toContain('STORY-A-ONLY')
    expect(() => configuration.setStyle(s.scope(a), { scope: 'scene', key: 'actor:a', sceneId: 'inn', instruction: 'STALE' })).toThrow('Scene changed')
    expect(s.commands.replay(a, shown.revision).instance.revision).toBe(shown.revision)
  })

  it.each([
    { batchLimit: 1, older: 1 }, { batchLimit: 2, older: 1 }, { batchLimit: 2, older: 2 },
  ])('consolidates the exchange before older backlog (limit=$batchLimit, older=$older)', async ({ batchLimit, older }) => {
    const s = setup(); const id = s.create(); s.stage(id, ['a', 'b'])
    for (let index = 0; index < older; index++) s.world.observe(s.scope(id), { summary: 'Earlier weather', content: 'OLD UNRELATED WEATHER', state: [], deliveries: [
      { actorId: 'a', content: 'OLD UNRELATED WEATHER', kind: 'observation', sourceRefs: [] },
      { actorId: 'b', content: 'OLD UNRELATED WEATHER', kind: 'observation', sourceRefs: [] },
    ] })
    new DiscussionApplication(s.commands, s.values).start(s.scope(id), { topic: 'Return the key', participantIds: ['a', 'b'], maxRounds: 1 })
    const consolidated: string[] = []
    const executor: ActorExecutor = { execute: async (request, _signal, submit) => {
      const actorId = request.context.actorId
      const batch = request.context.sections.find(section => section.id === 'consolidation')
      if (batch !== undefined) {
        const firstBatch = !consolidated.includes(actorId)
        consolidated.push(actorId)
        if (firstBatch) expect(batch.content).not.toContain('OLD UNRELATED WEATHER')
        else expect(batch.content).toContain('OLD UNRELATED WEATHER')
        expect(batch.sources).toHaveLength(2)
        expect(request.context.text).not.toContain(`PRIVATE-${actorId === 'a' ? 'b' : 'a'}`)
        submit({ posture: 'silent', context_update: [{ sourceIds: [...batch.sources], disposition: 'represented',
          reason: 'Remember the exchange.', changes: [{ operation: 'add', kind: 'promise', text: `My understanding: ${actorId}`,
            sourceIds: [...batch.sources] }] }] })
        return
      }
      const preparing = discussionsOf(s.commands.snapshot(id)).discussions[0]!.preparationPendingIds?.includes(actorId)
      submit({ posture: 'waiting', discussion: { action: preparing ? 'pass' : 'speak', eagerness: 'medium', stance: `PRIVATE-${actorId}` },
        ...(preparing ? {} : { behavior: [{ kind: 'speech' as const, text: `${actorId}: I will return the key.` }] }) })
    } }
    const actors = new ActorRuntime(s.commands, s.cognition, s.queries, executor, s.values, 2, batchLimit)
    const runtime = new DiscussionRuntime(s.commands, actors, s.values, 12)
    const scope = s.scope(id)
    const result = await runtime.advance(scope)
    expect(result).toMatchObject({ status: 'awaiting-director', completedTurns: 4 })
    const batches = older < 2 ? 1 : batchLimit
    const expectedActors = ['a', 'b'].flatMap(actorId => Array.from({ length: batches }, () => actorId))
    expect(consolidated).toEqual(expectedActors)
    expect(discussionsOf(s.commands.snapshot(id)).discussions[0]?.turns).toHaveLength(2)
    const queries = new RetentionQueries(s.commands, 10, 2000)
    for (const actorId of ['a', 'b']) {
      expect(queries.review(id, `actor:${actorId}`).retention.proposals).toHaveLength(batches)
      expect(JSON.stringify(evidenceFor(s.commands.snapshot(id), actorId))).toContain('OLD UNRELATED WEATHER')
    }
    expect(await runtime.advance(scope)).toEqual(result)
    expect(consolidated).toEqual(expectedActors)
    await actors.consolidateDiscussion(s.scope(id))
    expect(consolidated).toEqual(expectedActors)
    const archive = new NarrativeArchives(s.store, s.values, { verify: () => {} })
    expect(() => archive.import(archive.export(id, []), s.values.id() as CommandId)).not.toThrow()
    await actors.dispose()
  })

  it('retains successful discussion batch slots across runtime reload and retries only the failed slot', async () => {
    const s = setup(); const id = s.create(); s.stage(id, ['a', 'b'])
    s.world.observe(s.scope(id), { summary: 'Old weather', content: 'Old weather', state: [], deliveries: [
      { actorId: 'a', content: 'Unprocessed older weather.', kind: 'observation', sourceRefs: [] },
    ] })
    new DiscussionApplication(s.commands, s.values).start(s.scope(id), { topic: 'Key', participantIds: ['a', 'b'], maxRounds: 1 })
    const calls: string[] = []
    let fail = true
    const executor = scripted(async ({ context }) => {
      const actorId = context.actorId
      const batch = context.sections.find(section => section.id === 'consolidation')
      if (batch !== undefined) {
        calls.push(actorId)
        if (actorId === 'b' && fail) throw new Error('Memory provider failed')
        expect(batch.content).not.toContain('Unprocessed older weather.')
        return { posture: 'silent', context_update: [{ sourceIds: [...batch.sources], disposition: 'represented', reason: 'Keep promise.',
          changes: [{ operation: 'add', kind: 'promise', text: 'I will return the key.', sourceIds: [...batch.sources] }] }] }
      }
      const preparing = discussionsOf(s.commands.snapshot(id)).discussions[0]!.preparationPendingIds?.includes(actorId)
      return { posture: 'waiting', discussion: { action: preparing ? 'pass' : 'speak', eagerness: 'medium' },
        ...(preparing ? {} : { behavior: [{ kind: 'speech' as const, text: `${actorId}: Return the key.` }] }) }
    })
    const first = new ActorRuntime(s.commands, s.cognition, s.queries, executor, s.values, 2, 1)
    await expect(new DiscussionRuntime(s.commands, first, s.values, 12).advance(s.scope(id))).rejects.toThrow('Memory provider failed')
    await first.dispose()
    fail = false
    const restored = new ActorRuntime(s.commands, s.cognition, s.queries, executor, s.values, 2, 1)
    await restored.consolidateDiscussion(s.scope(id))
    await restored.consolidateDiscussion(s.scope(id))
    expect(calls).toEqual(['a', 'b', 'b'])
    expect(new RetentionQueries(s.commands, 10, 2000).review(id, 'actor:a').retention.proposals).toHaveLength(1)
    await restored.dispose()
  })

  it('resumes discussion consolidation after cancellation without repeating an accepted participant', async () => {
    const s = setup(); const id = s.create(); s.stage(id, ['a', 'b'])
    new DiscussionApplication(s.commands, s.values).start(s.scope(id), { topic: 'Return the key', participantIds: ['a', 'b'], maxRounds: 1 })
    let entered!: () => void; let release!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    const blocked = new Promise<void>((resolve) => { release = resolve })
    const calls: string[] = []
    let pause = true
    const actors = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async ({ context }) => {
      const actorId = context.actorId
      const batch = context.sections.find(section => section.id === 'consolidation')
      if (batch !== undefined) {
        calls.push(actorId)
        const late = actorId === 'b' && pause
        if (late) { entered(); await blocked }
        return { posture: 'silent', context_update: [{ sourceIds: [...batch.sources], disposition: 'represented', reason: 'Keep the exchange.',
          changes: [{ operation: 'add', kind: 'promise', text: late ? 'LATE DISCUSSION MEMORY' : `Remembered by ${actorId}`,
            sourceIds: [...batch.sources] }] }] }
      }
      const preparing = discussionsOf(s.commands.snapshot(id)).discussions[0]!.preparationPendingIds?.includes(actorId)
      return { posture: 'waiting', discussion: { action: preparing ? 'pass' : 'speak', eagerness: 'medium' },
        ...(preparing ? {} : { behavior: [{ kind: 'speech' as const, text: `${actorId}: Return the key.` }] }) }
    }), s.values, 16)
    const runtime = new DiscussionRuntime(s.commands, actors, s.values, 12)
    const running = runtime.advance(s.scope(id))
    const rejected = expect(running).rejects.toThrow('cancelled')
    await started
    runtime.pause(s.scope(id), 'Pause memory consolidation')
    release(); await rejected
    expect(runtime.read(id).status).toBe('paused')
    const queries = new RetentionQueries(s.commands, 10, 2000)
    expect(queries.review(id, 'actor:a').retention.proposals).toHaveLength(1)
    expect(queries.review(id, 'actor:b').retention.proposals).toHaveLength(0)
    expect(JSON.stringify(s.commands.snapshot(id))).not.toContain('LATE DISCUSSION MEMORY')
    pause = false
    expect((await runtime.advance(s.scope(id))).status).toBe('awaiting-director')
    expect(calls).toEqual(['a', 'b', 'b'])
    expect(queries.review(id, 'actor:a').retention.proposals).toHaveLength(1)
    expect(queries.review(id, 'actor:b').retention.proposals).toHaveLength(1)
    expect(discussionsOf(s.commands.snapshot(id)).discussions[0]?.turns).toHaveLength(2)
    await actors.dispose()
  })

  it('advances private preparation and public discussion atomically through a scripted executor', async () => {
    const s = setup(); const a = s.create(); const other = s.create(); s.stage(a, ['a', 'b'])
    const discussions = new DiscussionApplication(s.commands, s.values)
    discussions.start(s.scope(a), { topic: 'The locked ledger', participantIds: ['a', 'b'], maxRounds: 1 })
    const requests: string[] = []
    const executor: ActorExecutor = { execute: async (request, _signal, submit) => {
      requests.push(request.context.text)
      const current = discussionsOf(s.commands.snapshot(a)).discussions[0]!
      const actorId = request.context.actorId
      const preparing = current.preparationPendingIds?.includes(actorId) ?? false
      const changes: Array<NonNullable<NpcTurnInput['state_changes']>[number]> = []
      if (preparing) {
        expect(request.context.text).toContain('PRIVATE PREPARATION ONLY')
        const before = s.commands.snapshot(a)
        expect(() => submit({ posture: 'watching', discussion: { action: 'speak', eagerness: 'high' },
          behavior: [{ kind: 'speech', text: 'MUST NOT PUBLISH' }] })).toThrow('Resubmit with behavior=[]')
        expect(s.commands.snapshot(a)).toEqual(before)
      }
      if (!preparing && actorId === 'a') {
        const recapId = current.turns[0]!.id
        expect(request.context.text).not.toContain(recapId)
        const evidence = evidenceFor(s.commands.snapshot(a), 'a').find(item => item.content === 'Who has the ledger?')!
        expect(request.context.text).toContain(evidence.id)
        const change = stateChangeSchema.parse({ fieldId: 'resolve', expectedRevision: 0,
          definition: { id: 'resolve', name: 'Resolve', description: 'Commitment.', group: 'Inner', type: 'text', owner: 'actor', actorId: 'self', guidance: '' },
          value: 'Answer the question.', reason: 'I heard the question.', sourceRefs: [recapId] })
        const before = s.commands.snapshot(a)
        expect(() => submit({ posture: 'watching', state_changes: [change], behavior: [{ kind: 'speech', text: 'MUST NOT PUBLISH' }] }))
          .toThrow('Copy a RECEIVED EVIDENCE id')
        expect(s.commands.snapshot(a)).toEqual(before)
        changes.push({ ...change, sourceRefs: [evidence.id] })
      }
      submit({ posture: preparing ? 'watching' : 'finished',
        state_changes: changes,
        discussion: { action: preparing ? 'pass' : 'speak', eagerness: actorId === 'b' ? 'high' : 'low',
          stance: actorId === 'b' ? 'B-PRIVATE-STANCE' : 'A-PRIVATE-STANCE' },
        ...(preparing ? {} : { behavior: [{ kind: 'speech' as const, text: actorId === 'b' ? 'Who has the ledger?' : 'I do.' }] }),
      })
    } }
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, executor, s.values)
    const coordinator = new DiscussionRuntime(s.commands, runtime, s.values, 12)
    const scope = s.scope(a)
    const result = await coordinator.advance(scope)
    expect(result).toMatchObject({ status: 'awaiting-director', completedTurns: 4 })
    const current = discussionsOf(s.commands.snapshot(a)).discussions[0]!
    expect(current.turns.map(turn => turn.speakerId)).toEqual(['b', 'a'])
    expect(current.turns[0]?.identityLabels?.a).toBe('stranger-1')
    expect(requests[3]).not.toContain('B-PRIVATE-STANCE')
    expect(requests[2]).not.toContain('A-PRIVATE-STANCE')
    expect(requests.join('')).not.toContain('SECRET-NAME')
    expect(await coordinator.advance(scope)).toEqual(result)
    expect(requests).toHaveLength(4)
    expect(discussionsOf(s.commands.snapshot(other)).discussions).toEqual([])
    expect(s.commands.replay(a, s.commands.snapshot(a).instance.revision)).toEqual(s.commands.snapshot(a))
    await runtime.dispose()
  })

  it('rolls back forbidden preparation behavior and pauses a late discussion result', async () => {
    const s = setup(); const a = s.create(); s.stage(a, ['a', 'b'])
    const discussions = new DiscussionApplication(s.commands, s.values)
    discussions.start(s.scope(a), { topic: 'The ledger', participantIds: ['a', 'b'], maxRounds: 2 })
    const before = discussionsOf(s.commands.snapshot(a))
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'silent',
      discussion: { action: 'pass', eagerness: 'low' }, memories: [{ content: 'Must roll back.' }],
      behavior: [{ kind: 'speech', text: 'I speak during preparation.' }],
    })), s.values)
    const coordinator = new DiscussionRuntime(s.commands, runtime, s.values, 4)
    await expect(coordinator.advance(s.scope(a))).rejects.toThrow('cannot include speech behavior')
    expect(discussionsOf(s.commands.snapshot(a))).toEqual(before)
    expect(lifecycleFor(s.commands.snapshot(a), 'a').memories.size).toBe(0)
    expect(coordinator.read(a).status).toBe('failed')
    const deliveries: ((input: NpcTurnInput) => void)[] = []
    const delayed = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(() =>
      new Promise((resolve) => { deliveries.push(resolve) })), s.values)
    const resumed = new DiscussionRuntime(s.commands, delayed, s.values, 4)
    const pending = resumed.advance(s.scope(a))
    resumed.pause(s.scope(a), 'The player interrupts')
    for (const deliver of deliveries) deliver({ posture: 'silent', discussion: { action: 'pass', eagerness: 'low' } })
    await expect(pending).rejects.toThrow('cancelled')
    expect(resumed.read(a).status).toBe('paused')
    expect(discussionsOf(s.commands.snapshot(a))).toEqual(before)
    await runtime.dispose(); await delayed.dispose()
  })

  it('keeps the floor unchanged on player intervention and resumes with the same people', async () => {
    const s = setup(); const a = s.create(); s.stage(a, ['a', 'b'])
    const discussions = new DiscussionApplication(s.commands, s.values)
    discussions.start(s.scope(a), { topic: 'The ledger', participantIds: ['a', 'b'], maxRounds: 2 })
    const current = discussionsOf(s.commands.snapshot(a)).discussions[0]!
    const calls: string[] = []
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async (request) => {
      calls.push(request.context.actorId)
      return { posture: 'watching', discussion: { action: 'pass', eagerness: 'low' } }
    }), s.values)
    const coordinator = new DiscussionRuntime(s.commands, runtime, s.values, 1)
    discussions.control(s.scope(a), { operation: 'intervene', discussionId: current.id, intervention: 'speak' })
    expect((await coordinator.advance(s.scope(a))).status).toBe('waiting-player')
    expect(calls).toEqual([])
    discussions.control(s.scope(a), { operation: 'resume', discussionId: current.id })
    expect((await coordinator.advance(s.scope(a))).status).toBe('yielded')
    expect(calls).toEqual(['a'])
    expect(() => s.people.stage(s.scope(a), { id: 'road', location: 'Road', present: ['a'], appearances: [] })).toThrow('Close the current discussion')
    discussions.control(s.scope(a), { operation: 'close', discussionId: current.id, status: 'cancelled' })
    s.people.stage(s.scope(a), { id: 'road', location: 'Road', present: ['a'], appearances: [] })
    await runtime.dispose()
  })

  it('projects historical labels, ordered speech, and private audiences without exposing author facts', async () => {
    const s = setup(); const a = s.create(); s.stage(a)
    const play = new PlayQueries(s.commands, 40)
    s.world.observe(s.scope(a), { summary: 'SECRET-WORLD-FACT', content: 'SECRET-WORLD-FACT', state: [], deliveries: [],
      narration: '[[person:b]] enters the common room.' })
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => {
      const cast = castOf(s.commands.snapshot(a))
      const target = cast.encounters.find(item => item.observerId === 'b' && item.actorId === 'a')!.ref
      return { posture: 'waiting', behavior: [
        { kind: 'speech', text: 'First statement.' }, { kind: 'speech', text: 'Second statement.' },
        { kind: 'speech', text: 'WHISPER-ONLY-A', to: [target], delivery: 'whispered' },
      ] }
    }), s.values)
    await runtime.run(s.scope(a), 'b')
    const before = s.commands.snapshot(a)
    const page = { instanceId: a, offset: 0, limit: 40 }
    const observer = play.read({ ...page, audience: { kind: 'observer' } })
    expect(observer.rows.map(row => row.text)).toEqual(['stranger-1 enters the common room.', 'First statement.', 'Second statement.'])
    expect(JSON.stringify(observer)).not.toContain('SECRET-WORLD-FACT')
    expect(observer.rows[1]?.speaker).toMatchObject({ label: 'stranger-1', trueName: 'SECRET-NAME-b' })
    expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).text).not.toContain('SECRET-NAME-b')
    expect(play.read({ ...page, audience: { kind: 'actor', actorId: 'a' } }).rows.map(row => row.text)).toContain('WHISPER-ONLY-A')
    expect(JSON.stringify(play.read({ ...page, audience: { kind: 'actor', actorId: 'c' } }))).not.toContain('WHISPER-ONLY-A')
    const ref = castOf(before).encounters.find(item => item.observerId === 'a' && item.actorId === 'b')!.ref
    s.cognition.revise(s.scope(a), 'a', { state: [], lifecycle: [], knowledge: [knowledgeChangeSchema.parse({
      id: 'alias', expectedRevision: 0, text: 'I recognize this traveler as Vale.', kind: 'identity', attitude: 'believed', acquisition: 'inferred',
      entityRefs: [ref], sourceRefs: [evidenceFor(before, 'a')[0]!.id], status: 'active', reason: 'Recognized a familiar voice.', label: 'Vale',
    })] })
    const after = play.read({ ...page, audience: { kind: 'actor', actorId: 'a' } })
    expect(after.rows[0]).toMatchObject({ speaker: { label: 'stranger-1' }, recognizedAs: 'Vale' })
    expect(play.read({ ...page, audience: { kind: 'actor', actorId: 'a' }, revision: before.instance.revision }).rows[0]?.recognizedAs).toBeUndefined()
    expect(() => play.read({ ...page, audience: { kind: 'observer' }, limit: 41 })).toThrow('configured limit')
    await runtime.dispose()
  })

  it('bounds retrieval with two thousand absent people and keeps instance and perspective isolation', () => {
    const s = setup(); const a = s.create(); const other = s.create(); s.stage(a, ['a', 'b'])
    const baseline = s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' })
    const person = personOf(s.commands.snapshot(a), 'a')
    s.commands.execute({ ...s.scope(a), kind: 'fixture.population', input: { count: 2000 } }, () => ({ events:
      Array.from({ length: 2000 }, (_, index) => {
        const actorId = `absent-${String(index).padStart(4, '0')}`
        return replace('people', actorId, { ...person, definition: { ...person.definition, actorId,
          displayName: 'ABSENT-PRIVATE-NAME', publicPersona: 'ABSENT-PRIVATE-BACKGROUND' }, location: 'Away' })
      }), result: null }))
    expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).text).toBe(baseline.text)
    expect(s.queries.knownPeople(a, 'a', 'ABSENT', 0, 40).entries).toEqual([])
    const page = s.queries.authorPeople(a, { query: 'ABSENT', location: 'Away', offset: 40, limit: 40 })
    expect(page.total).toBe(2000)
    expect(page.entries).toHaveLength(40)
    expect(page.entries[0]?.definition.actorId).toBe('absent-0040')
    expect(s.queries.authorPeople(other, { query: 'ABSENT', offset: 0, limit: 40 }).total).toBe(0)
    expect(() => s.queries.authorPeople(a, { query: '', offset: -1, limit: 40 })).toThrow('bounds')
    expect(() => s.queries.knownPeople(a, 'a', '', 0, 41)).toThrow('bounds')
  })

  it('separates committed restoration from execution cancellation and retries only its original epoch', async () => {
    const s = setup(); const a = s.create(); s.stage(a)
    let fail = true; const epochs: number[] = []
    const recovery = new RecoveryApplication(s.commands, { capture: async () => ({ entries: [] }), cancel: async (_id, epoch) => {
      epochs.push(epoch); if (fail) throw new Error('Cancellation transport unavailable')
    } })
    const checkpointScope = s.scope(a)
    const checkpoint = await recovery.checkpoint(checkpointScope, 'opening')
    s.cognition.revise(s.scope(a), 'a', { knowledge: [], state: [], lifecycle: [memoryChange('discard', 'This is a later branch.')] })
    expect((await recovery.checkpoint(checkpointScope, 'opening')).instance.revision).toBe(checkpoint.instance.revision)
    const scope = s.scope(a)
    const restored = await recovery.restore(scope, checkpoint.instance.revision, 'Try the opening again')
    expect(restored.execution).toBe('pending')
    expect(lifecycleFor(s.commands.snapshot(a), 'a').memories.size).toBe(0)
    fail = false
    s.cognition.revise(s.scope(a), 'a', { knowledge: [], state: [], lifecycle: [memoryChange('new', 'An independent continuation.')] })
    const retried = await recovery.restore(scope, checkpoint.instance.revision, 'Try the opening again')
    expect(retried.commit).toEqual(restored.commit)
    expect(retried.execution).toBe('cancelled')
    expect(epochs).toEqual([1, 1])
    expect(lifecycleFor(s.commands.snapshot(a), 'a').memories.size).toBe(1)
  })

  it('does not let a late failed execution overwrite a restored running checkpoint', async () => {
    const s = setup(); const a = s.create(); s.stage(a)
    let deliver!: (input: NpcTurnInput) => void
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(() =>
      new Promise((resolve) => { deliver = resolve })), s.values)
    const pending = runtime.run(s.scope(a), 'a')
    const opened = s.commands.snapshot(a)
    const recovery = new RecoveryApplication(s.commands, { capture: async () => null,
      cancel: (id, epoch, reason) => runtime.abort(id, epoch, reason) })
    const restoring = recovery.restore(s.scope(a), opened.instance.revision, 'Rewind this attempt')
    const committed = s.commands.snapshot(a)
    deliver({ posture: 'silent', memories: [{ content: 'Too late.' }] })
    await expect(pending).rejects.toThrow('cancelled')
    expect((await restoring).execution).toBe('cancelled')
    expect(s.commands.snapshot(a)).toEqual(committed)
    expect(lifecycleFor(committed, 'a').memories.size).toBe(0)
    await runtime.dispose()
  })

  it('extracts only selected material into a new draft and refuses stale author review', () => {
    const s = setup(); const a = s.create(); s.stage(a)
    const fact = s.world.observe(s.scope(a), { summary: 'A door is locked.', content: 'The north door is locked.', state: [], deliveries: [] })
    s.cognition.revise(s.scope(a), 'a', { knowledge: [], state: [], lifecycle: [memoryChange('secret-memory', 'I once bribed the guard.')] })
    const selection = { people: ['a'], factIds: [], knowledge: [], state: [], memories: [] }
    const extraction = new MaterialExtraction(s.commands, s.library)
    const preview = extraction.preview(a, selection, 'Reusable stranger')
    expect(JSON.stringify(preview.document)).not.toContain('bribed')
    expect(JSON.stringify(preview.document)).not.toContain('north door')
    const draft = extraction.save({ instanceId: a, expectedRevision: preview.revision, commandId: 'extract' as CommandId, selection, title: 'Reusable stranger' })
    expect(draft.document).toEqual(preview.document)
    const version = s.library.publish(draft.id, draft.revision)
    expect(s.commands.snapshot(a).instance.templateVersionId).not.toBe(version.id)
    const chosen = extraction.preview(a, { ...selection, factIds: [(fact.result as { factId: string }).factId], memories: [{ actorId: 'a', id: 'secret-memory' }] }, 'Selected history')
    expect(JSON.stringify(chosen.document)).toContain('bribed')
    expect(JSON.stringify(chosen.document)).toContain('north door')
    s.stage(a, ['a'])
    expect(() => extraction.save({ instanceId: a, expectedRevision: preview.revision, commandId: 'stale-extract' as CommandId, selection, title: 'Stale' })).toThrow('revision changed')
  })

  it('rejects imported ownership, source, and authority corruption without partial instances', async () => {
    const s = setup(); const a = s.create(); s.stage(a)
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'silent',
      memories: [{ content: 'An observed departure.' }], behavior: [{ kind: 'speech', text: 'Goodbye.' }],
    })), s.values)
    await runtime.run(s.scope(a), 'a')
    const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
    const original = archives.export(a, [])
    const count = s.library.instances().length
    const invalidSource = structuredClone(original)
    const memory = invalidSource.commits.flatMap(commit => commit.events).find(event => event.type === 'entity.replaced' && event.key.collection === 'lifecycle:a')!
    if (memory.type === 'entity.replaced') {
      const record = memory.value as { change: { data: { memory: { sourceRefs: string[] } } } }
      record.change.data.memory.sourceRefs = ['another-instance-secret']
    }
    expect(() => archives.import(invalidSource, 'bad-source' as CommandId)).toThrow('Private source')
    const invalidAuthority = structuredClone(original)
    const turn = invalidAuthority.commits.find(commit => commit.command.principal.kind === 'actor')!
    turn.events.push({ type: 'entity.replaced', key: { collection: 'facts', id: 'fabrication' },
      value: { id: 'fabrication', summary: 'A forced consequence.', content: 'A forced consequence.', revision: turn.revision } })
    expect(() => archives.import(invalidAuthority, 'bad-authority' as CommandId)).toThrow('write authority')
    const invalidAudience = structuredClone(original)
    const evidence = invalidAudience.commits.flatMap(commit => commit.events).find(event => event.type === 'entity.replaced' && event.key.collection === 'evidence:b')!
    if (evidence.type === 'entity.replaced') (evidence.value as { recipient: string }).recipient = 'c'
    expect(() => archives.import(invalidAudience, 'bad-audience' as CommandId)).toThrow('different owner')
    expect(s.library.instances()).toHaveLength(count)
    expect(s.commands.snapshot(a).instance.revision).toBe(original.commits.length)
    await runtime.dispose()
  })

  it('rebuilds exported history independently, keeps checkpoints, and rejects partial imports', () => {
    const s = setup(); const a = s.create(); s.stage(a)
    s.world.observe(s.scope(a), { summary: 'A claim.', content: 'A whisper was heard.', state: [],
      deliveries: [{ actorId: 'a', content: 'PRIVATE-EXPORT', kind: 'claim', sourceRefs: [] }] })
    const boundary = s.commands.snapshot(a)
    s.commands.checkpoint(a, 'before-rewind', boundary.instance.revision, { session: 'evidence-only', seq: 12 })
    s.commands.restore({ ...s.scope(a), kind: 'restore', input: { targetRevision: 1, reason: 'Player undo' } }, 1, 'Player undo')
    const archives = new NarrativeArchives(s.store, s.values, { verify: (resources) => {
      if (resources.length > 0) throw new Error('Fixture contains no resources')
    } })
    const original = archives.export(a, [{ id: 'request', content: { text: 'actual-request' } }])
    const imported = archives.import(original, 'import' as CommandId)
    expect(imported.instance.id).not.toBe(a)
    expect(imported.instance.templateVersionId).not.toBe(boundary.instance.templateVersionId)
    expect(imported.entities).toEqual(s.commands.snapshot(a).entities)
    expect(s.commands.replay(imported.instance.id, 2).entities).toEqual(boundary.entities)
    expect(archives.import(original, 'import' as CommandId).instance.id).toBe(imported.instance.id)
    expect(archives.export(imported.instance.id, []).executionEvidence).toContainEqual({ id: 'request', content: { text: 'actual-request' } })
    expect(archives.export(imported.instance.id, []).checkpoints).toEqual([{ name: 'before-rewind', revision: 2, execution: null }])
    const count = s.library.instances().length
    expect(() => archives.import({ ...original, checkpoints: [{ name: 'bad', revision: 100, execution: null }] }, 'bad-import' as CommandId)).toThrow('unavailable history')
    expect(s.library.instances()).toHaveLength(count)
    s.world.observe(s.scope(imported.instance.id), { summary: 'New event.', content: 'ONLY-IMPORTED', state: [], deliveries: [] })
    expect(JSON.stringify(s.commands.snapshot(a))).not.toContain('ONLY-IMPORTED')
  })
})

function directing(s: ReturnType<typeof setup>, executor: DirectorExecutor,
  actor: ActorExecutor = scripted(() => Promise.resolve(silence())), characters = 16000, feedbackLimit = 0,
  consolidationThreshold = 0, directorConsolidationThreshold = 0, reactiveLimit = 0) {
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, actor, s.values, consolidationThreshold)
  const directorQueries = new DirectorQueries(s.commands, characters, 100)
  const director = new DirectorRuntime(s.commands, new DirectorCommands(s.commands, s.values, 16), directorQueries, s.queries,
    executor, runtime, new DiscussionRuntime(s.commands, runtime, s.values, 12), s.values, 12, 16000, feedbackLimit,
    directorConsolidationThreshold, undefined, reactiveLimit)
  return { director, runtime, directorQueries }
}

describe('director preparation through application ports', () => {
  it('passes only an explicit player beat to initial and reactive actors for this advance', async () => {
    const s = setup(['a', 'b']); const id = s.create(); s.stage(id, ['a', 'b'])
    const privateInstruction = 'DIRECTOR PRIVATE: keep the hidden ending secret.'
    const beat = 'Stay with the wet letter in the kitchen; leave the route for later.'
    const scope = s.scope(id)
    const seen: Array<{ actorId: string; sections: ActorContextView['sections']; text: string }> = []
    const d = directing(s, { execute: async ({ context }, _signal, command) => {
      expect(context.sections.find(section => section.id === 'player-beat')).toMatchObject({
        role: 'user', sources: [`command:${scope.id}:actor-facing-beat`],
      })
      command('finish', { operation: 'finish', actors: [context.sections.some(section => section.id === 'execution-purpose')
        ? 'b' : 'a'], advanceDiscussion: false })
    } }, scripted(async ({ context }) => {
      seen.push({ actorId: context.actorId, sections: context.sections, text: context.text })
      return silence()
    }), 16000, 0, 0, 0, 1)
    try {
      await d.director.run(scope, privateInstruction, beat)
      expect(seen.map(item => item.actorId)).toEqual(['a', 'b'])
      for (const item of seen) {
        expect(item.sections.find(section => section.id === 'player-beat')).toEqual({
          id: 'player-beat', role: 'user',
          content: `[CURRENT PLAYER BEAT — author-side scene focus, not your lived knowledge or a required choice]\n${beat}`,
          sources: [`command:${scope.id}:actor-facing-beat`],
        })
        expect(item.text).not.toContain(privateInstruction)
      }
      expect(s.commands.receipt(id, scope.id)?.command.input).toMatchObject({
        actorFacingBeat: { text: beat, source: `command:${scope.id}:actor-facing-beat` },
      })
      const rootId = (s.commands.receipt(id, scope.id)?.result as { id: string }).id
      expect(s.commands.receipt(id, `${rootId}:actor:0` as CommandId)?.command.input).toMatchObject({
        actorFacingBeat: { text: beat, source: `command:${scope.id}:actor-facing-beat` },
      })
      await d.runtime.run(s.scope(id), 'a')
      expect(seen[2]?.sections.some(section => section.id === 'player-beat')).toBe(false)
      expect(seen[2]?.text).not.toContain(beat)
      await expect(d.director.run(scope, privateInstruction, 'Different beat')).rejects.toThrow('identity')
    } finally { await d.director.dispose(); await d.runtime.dispose() }
  })

  it('carries the explicit player beat into a world-feedback actor without exposing director instructions', async () => {
    const s = setup(['a', 'b']); const id = s.create(); s.stage(id, ['a', 'b'])
    const beat = 'Keep the wet letter as the immediate scene focus.'
    const actorBeats: Array<string | undefined> = []
    let directorCalls = 0
    const d = directing(s, { execute: async ({ context }, _signal, command) => {
      directorCalls++
      expect(context.sections.find(section => section.id === 'player-beat')?.content).toContain(beat)
      if (directorCalls === 2) {
        const attempts = pendingWorldAttempts(s.commands.snapshot(id))
        command('settle', { operation: 'observe', input: { summary: 'Letter checked', content: 'The letter is wet.',
          settles: attempts.map(item => item.id), state: [], deliveries: [
            { actorId: 'a', content: 'The letter is wet.', kind: 'observation', sourceRefs: [] },
            { actorId: 'b', content: 'The letter is wet.', kind: 'observation', sourceRefs: [] },
          ] } })
      }
      command('finish', { operation: 'finish', actors: [directorCalls === 1 ? 'a' : 'b'], advanceDiscussion: false })
    } }, scripted(async ({ context }) => {
      actorBeats.push(context.sections.find(section => section.id === 'player-beat')?.content)
      return context.actorId === 'a'
        ? { posture: 'waiting', behavior: [{ kind: 'action', attempt: 'Inspect the wet letter.', await_result: true }] }
        : silence()
    }), 16000, 1)
    try {
      await d.director.run(s.scope(id), 'DIRECTOR PRIVATE: do not reveal the ending.', beat)
      expect(directorCalls).toBe(2)
      expect(actorBeats).toHaveLength(2)
      expect(actorBeats.every(content => content?.includes(beat))).toBe(true)
    } finally { await d.director.dispose(); await d.runtime.dispose() }
  })

  it.each([0, 1])('selects a single responsive speaker within one advance when reactive limit is %i', async (reactiveLimit) => {
    const s = setup(['a', 'b', 'c']); const id = s.create(); s.stage(id, ['a', 'b', 'c'])
    const directorCalls: string[] = []
    const actorCalls: string[] = []
    const d = directing(s, { execute: async ({ context }, _signal, command) => {
      const purpose = context.sections.find(section => section.id === 'execution-purpose')
      directorCalls.push(purpose === undefined ? 'initial' : 'reactive')
      if (purpose === undefined) {
        command('finish', { operation: 'finish', actors: ['a'], advanceDiscussion: false })
        return
      }
      expect(purpose?.content).toContain('bounded response selection')
      expect(purpose?.content).toContain('after a completed a turn')
      expect(purpose?.content).toContain('Do not split one thought into repetitive turns')
      expect(context.text).toContain('The letter is wet.')
      const before = s.commands.snapshot(id)
      expect(() => command('crowd', { operation: 'finish', actors: ['b', 'c'], advanceDiscussion: false }))
        .toThrow('at most one actor')
      expect(() => command('new-event', { operation: 'observe', input: {
        summary: 'Bell', content: 'The bell rings.', state: [], deliveries: [],
      } })).toThrow('may only inspect context')
      expect(s.commands.snapshot(id)).toEqual(before)
      command('finish', { operation: 'finish', actors: ['b'], advanceDiscussion: false })
    } }, scripted(async ({ context }) => {
      actorCalls.push(context.actorId)
      return { posture: 'watching', behavior: [{ kind: 'speech', text: context.actorId === 'a'
        ? 'The letter is wet.' : 'Put it by the stove.' }] }
    }), 16000, 0, 0, 0, reactiveLimit)
    const scope = s.scope(id)
    try {
      const result = await d.director.run(scope, 'Read the letter.')
      expect(directorCalls).toEqual(reactiveLimit === 0 ? ['initial'] : ['initial', 'reactive'])
      expect(actorCalls).toEqual(reactiveLimit === 0 ? ['a'] : ['a', 'b'])
      expect(result.actors).toEqual(reactiveLimit === 0 ? ['a'] : ['b'])
      const opened = s.commands.receipt(id, `${scope.id}:reactive:0` as CommandId)
      if (reactiveLimit === 0) expect(opened).toBeUndefined()
      else {
        expect(opened?.command.input).toMatchObject({ reactive: true, playerInput: false, respondingTo: 'a' })
        const root = s.commands.receipt(id, scope.id)!
        const rootRun = root.result as { id: string }
        expect(opened?.command.expectedRevision).toBe(s.commands.receipt(id, `director-result:${rootRun.id}` as CommandId)?.revision)
      }
      const before = s.commands.snapshot(id)
      expect(await d.director.run(scope, 'Read the letter.')).toEqual(result)
      expect(s.commands.snapshot(id)).toEqual(before)
      expect(actorCalls).toHaveLength(reactiveLimit === 0 ? 1 : 2)
    } finally { await d.director.dispose(); await d.runtime.dispose() }
  })

  it('leaves pending world attempts for feedback and does not open a reactive pass', async () => {
    const s = setup(['a', 'b']); const id = s.create(); s.stage(id, ['a', 'b'])
    let calls = 0
    const d = directing(s, { execute: async (_request, _signal, command) => {
      calls++
      command('finish', { operation: 'finish', actors: ['a'], advanceDiscussion: false })
    } }, scripted(async () => ({ posture: 'waiting', behavior: [{ kind: 'action', attempt: 'Open the sealed box.', await_result: true }] })),
    16000, 0, 0, 0, 1)
    try {
      const scope = s.scope(id)
      await d.director.run(scope, 'Inspect the box.')
      expect(calls).toBe(1)
      expect(pendingWorldAttempts(s.commands.snapshot(id))).toHaveLength(1)
      expect(s.commands.receipt(id, `${scope.id}:reactive:0` as CommandId)).toBeUndefined()
    } finally { await d.director.dispose(); await d.runtime.dispose() }
  })

  it('keeps an active discussion floor ahead of ordinary reactive dispatch', async () => {
    const s = setup(['a', 'b', 'c']); const id = s.create(); s.stage(id, ['a', 'b', 'c'])
    let calls = 0
    const d = directing(s, { execute: async (_request, _signal, command) => {
      calls++
      command('discuss', { operation: 'discuss', input: { topic: 'Who keeps the letter?', participantIds: ['a', 'b'], maxRounds: 2 } })
      command('finish', { operation: 'finish', actors: ['c'], advanceDiscussion: false })
    } }, scripted(async () => ({ posture: 'watching', behavior: [{ kind: 'speech', text: 'Leave it here.' }] })),
    16000, 0, 0, 0, 1)
    try {
      const scope = s.scope(id)
      await d.director.run(scope, 'Begin the discussion.')
      expect(calls).toBe(1)
      expect(discussionsOf(s.commands.snapshot(id)).discussions[0]?.status).toBe('active')
      expect(s.commands.receipt(id, `${scope.id}:reactive:0` as CommandId)).toBeUndefined()
    } finally { await d.director.dispose(); await d.runtime.dispose() }
  })

  it('does not let a reactive selection take a player-controlled character', async () => {
    const s = setup(['a', 'b']); const id = s.create(); s.stage(id, ['a', 'b'])
    await new PlayerApplication(s.commands, s.values, { cancel: async () => {} }, 6000).control(s.scope(id), 'b')
    const spoken: string[] = []
    const d = directing(s, { execute: async ({ context }, _signal, command) => {
      command('finish', { operation: 'finish', actors: [context.sections.some(section => section.id === 'execution-purpose') ? 'b' : 'a'],
        advanceDiscussion: false })
    } }, scripted(async ({ context }) => {
      spoken.push(context.actorId)
      return { posture: 'watching', behavior: [{ kind: 'speech', text: 'I found the letter.' }] }
    }), 16000, 0, 0, 0, 1)
    try {
      const scope = s.scope(id)
      const result = await d.director.run(scope, 'Find the letter.')
      expect(result.actors).toEqual([])
      expect(spoken).toEqual(['a'])
      expect(s.commands.receipt(id, `${scope.id}:reactive:0` as CommandId)).toBeDefined()
    } finally { await d.director.dispose(); await d.runtime.dispose() }
  })

  it('cancels a reactive choice after the player pauses the advance', async () => {
    const s = setup(['a', 'b']); const id = s.create(); s.stage(id, ['a', 'b'])
    let entered!: () => void; let release!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    const blocked = new Promise<void>((resolve) => { release = resolve })
    const spoken: string[] = []
    const d = directing(s, { execute: async ({ context }, _signal, command) => {
      if (context.sections.some(section => section.id === 'execution-purpose')) {
        entered(); await blocked
        command('finish', { operation: 'finish', actors: ['b'], advanceDiscussion: false })
      } else command('finish', { operation: 'finish', actors: ['a'], advanceDiscussion: false })
    } }, scripted(async ({ context }) => {
      spoken.push(context.actorId)
      return { posture: 'watching', behavior: [{ kind: 'speech', text: 'The door is open.' }] }
    }), 16000, 0, 0, 0, 1)
    try {
      const running = d.director.run(s.scope(id), 'Open the door.')
      const rejected = expect(running).rejects.toThrow('cancelled')
      await started
      d.director.pause(s.scope(id), 'Player pauses')
      release()
      await rejected
      expect(spoken).toEqual(['a'])
      expect(s.commands.snapshot(id).entities.filter(item => item.key.collection === 'behavior')).toHaveLength(1)
    } finally { release?.(); await d.director.dispose(); await d.runtime.dispose() }
  })

  it('stops reactive handoffs at the configured limit even when every turn invites another reply', async () => {
    const s = setup(['a', 'b']); const id = s.create(); s.stage(id, ['a', 'b'])
    let choices = 0
    const spoken: string[] = []
    const d = directing(s, { execute: async (_request, _signal, command) => {
      command('finish', { operation: 'finish', actors: [choices++ % 2 === 0 ? 'a' : 'b'], advanceDiscussion: false })
    } }, scripted(async ({ context }) => {
      spoken.push(context.actorId)
      return { posture: 'watching', behavior: [{ kind: 'speech', text: 'And then?' }] }
    }), 16000, 0, 0, 0, 2)
    try {
      const scope = s.scope(id)
      await d.director.run(scope, 'Continue the exchange.')
      expect(choices).toBe(3)
      expect(spoken).toEqual(['a', 'b', 'a'])
      expect(s.commands.receipt(id, `${scope.id}:reactive:2` as CommandId)).toBeUndefined()
    } finally { await d.director.dispose(); await d.runtime.dispose() }
  })

  it.each([0, 2])('does not consolidate later events when retrying an old run with feedback limit %i', async (feedbackLimit) => {
    const s = setup(); const id = s.create(); s.stage(id)
    let calls = 0
    const d = directing(s, { execute: async (_request, _signal, command) => {
      calls++
      command('finish', { operation: 'finish', actors: [], advanceDiscussion: false })
    } }, undefined, 16000, feedbackLimit, 0, 2)
    const scope = s.scope(id)
    const result = await d.director.run(scope, 'Watch the door.')
    expect(calls).toBe(1)
    s.world.observe(s.scope(id), { summary: 'Later arrival', content: 'A messenger arrives later.', state: [], deliveries: [] })
    const before = s.commands.snapshot(id)
    expect(await d.director.run(scope, 'Watch the door.')).toEqual(result)
    expect(calls).toBe(1)
    expect(s.commands.snapshot(id)).toEqual(before)
    await d.director.dispose(); await d.runtime.dispose()
  })

  it.each(['pause', 'world-change', 'provider-failure'] as const)('preserves director memory sources after %s', async (interruption) => {
    const s = setup(); const id = s.create(); s.stage(id)
    new RetentionApplication(s.commands).review(s.scope(id), { operation: 'policy', owner: 'director', activation: 'automatic' })
    let entered!: () => void; let release!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    const blocked = new Promise<void>((resolve) => { release = resolve })
    let calls = 0
    const d = directing(s, { execute: async ({ context }, _signal, command) => {
      calls++
      const batch = context.sections.find(section => section.id === 'consolidation')
      if (batch !== undefined) {
        entered(); await blocked
        if (interruption === 'provider-failure') throw new Error('Memory provider unavailable')
        command('remember', { operation: 'context-update', input: [{ sourceIds: [...batch.sources], disposition: 'represented',
          reason: 'Late summary.', changes: [{ operation: 'add', kind: 'player-direction', text: 'LATE DIRECTOR MEMORY', sourceIds: [...batch.sources] }] }] })
      }
      command('finish', { operation: 'finish', actors: [], advanceDiscussion: false })
    } }, undefined, 16000, 0, 0, 1)
    const scope = s.scope(id)
    const running = d.director.run(scope, 'Watch the door.')
    expect(d.director.run(scope, 'Watch the door.')).toBe(running)
    const failure = interruption === 'pause' ? 'cancelled' : interruption === 'world-change' ? 'Story changed' : 'Memory provider unavailable'
    const rejected = expect(running).rejects.toThrow(failure)
    await started
    if (interruption === 'pause') d.director.pause(s.scope(id), 'Pause memory')
    if (interruption === 'world-change') s.world.observe(s.scope(id), { summary: 'Bell', content: 'A bell rings.', state: [], deliveries: [] })
    release(); await rejected
    const before = s.commands.snapshot(id)
    expect(retentionOf(before, 'director').notes).toHaveLength(0)
    expect(JSON.stringify(before)).not.toContain('LATE DIRECTOR MEMORY')
    expect(new RetentionQueries(s.commands, 10, 2000).recall(id, 'director', { query: 'Watch the door.', offset: 0, limit: 10 }).entries).toHaveLength(1)
    await expect(d.director.run(scope, 'Watch the door.')).rejects.toThrow(interruption === 'pause' ? 'superseded' : failure)
    expect(calls).toBe(2)
    expect(s.commands.snapshot(id)).toEqual(before)
    await d.director.dispose(); await d.runtime.dispose()
  })

  it('selects the first same-turn behavior for a director memory batch even with reverse-sorted IDs', async () => {
    const s = setup(); const id = s.create(); s.stage(id)
    let reverseId = 100000
    s.values.id = () => `reverse-${--reverseId}`
    const seed = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'waiting',
      behavior: [{ kind: 'speech', text: 'First I repeat the warning.' }, { kind: 'speech', text: 'Then I question its source.' }],
    })), s.values)
    await seed.run(s.scope(id), 'a'); await seed.dispose()
    const originals = narrativeOriginals(s.commands.snapshot(id), 'director')
    expect(originals[0]!.id > originals[1]!.id).toBe(true)
    let batches = 0
    const d = directing(s, { execute: async ({ context }, _signal, command) => {
      const batch = context.sections.find(section => section.id === 'consolidation')
      if (batch !== undefined) {
        batches++
        expect(batch.sources).toEqual([originals[0]!.id])
        expect(batch.content).toContain('First I repeat the warning.')
        expect(batch.content).not.toContain('Then I question its source.')
        command('remember', { operation: 'context-update', input: [{ sourceIds: [...batch.sources], disposition: 'represented',
          reason: 'Preserve the first contribution.', changes: [{ operation: 'add', kind: 'claim',
            text: 'The first contribution repeated a warning.', sourceIds: [...batch.sources] }] }] })
      }
      command('finish', { operation: 'finish', actors: [], advanceDiscussion: false })
    } }, undefined, 16000, 0, 0, 1)
    try {
      await d.director.run(s.scope(id), 'Remember the exchange.')
      expect(batches).toBe(1)
    } finally { await d.director.dispose(); await d.runtime.dispose() }
  })

  it('consolidates director records after an ordinary run without advancing the world', async () => {
    const s = setup(); const id = s.create(); s.stage(id)
    let calls = 0
    const d = directing(s, { execute: async ({ context }, _signal, command) => {
      calls++
      const batch = context.sections.find(section => section.id === 'consolidation')
      if (batch !== undefined) {
        const before = s.commands.snapshot(id)
        expect(() => command('invalid-event', { operation: 'observe', input: { summary: 'Invented', content: 'Invented', state: [], deliveries: [] } }))
          .toThrow('only accepts memory')
        expect(s.commands.snapshot(id)).toEqual(before)
        expect(() => command('early-finish', { operation: 'finish', actors: [], advanceDiscussion: false })).toThrow('exact source batch')
        for (const [fault, sourceIds] of Object.entries({ missing: [], unexpected: [...batch.sources, 'outside-batch'],
          duplicated: [...batch.sources, ...batch.sources] })) {
          const units = sourceIds.map(sourceId => ({ sourceIds: [sourceId], disposition: 'represented' as const,
            reason: 'Remember the assigned evidence.', changes: [{ operation: 'add' as const, kind: 'player-direction' as const,
              text: 'The player asked to watch the door.', sourceIds: [sourceId] }] }))
          let message = ''
          try { command(`invalid-${fault}`, { operation: 'context-update', input: units }) }
          catch (error) { message = (error as Error).message }
          expect(message).toContain('Coverage errors:')
          expect(message).toContain('No changes were submitted.')
          expect(s.commands.snapshot(id)).toEqual(before)
          await expect(message.replaceAll(batch.sources[0]!, '<assigned>') + '\n')
            .toMatchFileSnapshot(`./expected/director-memory-coverage-${fault}.txt`)
        }
        command('remember', { operation: 'context-update', input: [{ sourceIds: [...batch.sources], disposition: 'represented',
          reason: 'Keep player direction distinct from fact.', changes: [{ operation: 'add', kind: 'player-direction',
            text: 'The player asked to watch the door.', sourceIds: [...batch.sources] }] }] })
      }
      command('finish', { operation: 'finish', actors: [], advanceDiscussion: false })
    } }, undefined, 16000, 0, 0, 1)
    const scope = s.scope(id)
    const result = await d.director.run(scope, 'Watch the door.')
    expect(calls).toBe(2)
    expect(retentionOf(s.commands.snapshot(id), 'director').proposals).toHaveLength(1)
    expect(s.commands.snapshot(id).entities.filter(item => item.key.collection === 'facts')).toHaveLength(0)
    const before = s.commands.snapshot(id)
    expect(await d.director.run(scope, 'Watch the door.')).toEqual(result)
    expect(calls).toBe(2)
    expect(s.commands.snapshot(id)).toEqual(before)
    const archive = new NarrativeArchives(s.store, s.values, { verify: () => {} })
    expect(() => archive.import(archive.export(id, []), s.values.id() as CommandId)).not.toThrow()
    await d.director.dispose(); await d.runtime.dispose()
  })

  it('consolidates pending actor evidence before a directly requested director summary', async () => {
    const s = setup(); const id = s.create(); s.stage(id, ['a', 'b'])
    new DiscussionApplication(s.commands, s.values).start(s.scope(id), { topic: 'The promise', participantIds: ['a', 'b'], maxRounds: 1 })
    const speech = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async ({ context }) => {
      const preparing = discussionsOf(s.commands.snapshot(id)).discussions[0]!.preparationPendingIds?.includes(context.actorId)
      return { posture: 'waiting', discussion: { action: preparing ? 'pass' : 'speak', eagerness: 'medium' },
        ...(preparing ? {} : { behavior: [{ kind: 'speech' as const, text: 'We should return.' }] }) }
    }), s.values)
    await new DiscussionRuntime(s.commands, speech, s.values, 12).advance(s.scope(id))
    await speech.dispose()
    const calls: string[] = []
    const d = directing(s, { execute: async ({ context }, _signal, command) => {
      calls.push('director')
      expect(context.text).not.toContain('PRIVATE SUMMARY')
      expect(context.sections.find(section => section.id === 'execution-purpose')?.content).toContain('not a player request')
      expect(context.text).toContain('without restarting the exchange')
      const discussion = discussionsOf(s.commands.snapshot(id)).discussions[0]!
      command('close', { operation: 'discussion-control', input: { operation: 'close', discussionId: discussion.id, status: 'completed' } })
      command('finish', { operation: 'finish', actors: [], advanceDiscussion: false })
    } }, scripted(async ({ context }) => {
      calls.push(context.actorId)
      const batch = context.sections.find(section => section.id === 'consolidation')!
      return { posture: 'silent', context_update: [{ sourceIds: [...batch.sources], disposition: 'represented', reason: 'Remember.',
        changes: [{ operation: 'add', kind: 'promise', text: 'PRIVATE SUMMARY', sourceIds: [...batch.sources] }] }] }
    }), 16000, 0, 16)
    const scope = s.scope(id)
    const result = await d.director.summarizeDiscussion(scope)
    expect(calls).toEqual(['a', 'b', 'director'])
    expect(await d.director.summarizeDiscussion(scope)).toEqual(result)
    expect(calls).toEqual(['a', 'b', 'director'])
    await d.director.dispose(); await d.runtime.dispose()
  })

  it('keeps a feedback failure on retry even after its pending attempt was settled', async () => {
    const s = setup(['a']); const id = s.create(); s.stage(id, ['a'])
    let calls = 0
    const d = directing(s, { execute: async ({ context }, _signal, command) => {
      calls++
      const purpose = context.sections.find(section => section.id === 'execution-purpose')
      if (calls === 1) expect(purpose).toBeUndefined()
      else expect(purpose?.content).toContain('Resolve supplied pending attempts')
      const attempts = pendingWorldAttempts(s.commands.snapshot(id))
      if (attempts.length > 0) command('settle', { operation: 'observe', input: {
        summary: 'Door checked', content: 'The door is locked.', settles: attempts.map(item => item.id), state: [],
        deliveries: [{ actorId: 'a', content: 'The door is locked.', kind: 'observation', sourceRefs: [] }],
      } })
      command('finish', { operation: 'finish', actors: ['a'], advanceDiscussion: false })
    } }, scripted(async () => {
      if (calls > 1) throw new Error('Actor response unavailable')
      return { posture: 'waiting', behavior: [{ kind: 'action', attempt: 'Check the door.', await_result: true }] }
    }), 16000, 2)
    const scope = s.scope(id)
    await expect(d.director.run(scope, 'Explore')).rejects.toThrow('Actor response unavailable')
    const failed = s.commands.snapshot(id)
    expect(pendingWorldAttempts(failed)).toEqual([])
    await expect(d.director.run(scope, 'Explore')).rejects.toThrow('Actor response unavailable')
    expect(s.commands.snapshot(id)).toEqual(failed)
    expect(calls).toBe(2)
    await d.director.dispose(); await d.runtime.dispose()
  })

  it('rejects late feedback after the player pauses without settling the attempt', async () => {
    const s = setup(['a']); const id = s.create(); s.stage(id, ['a'])
    let entered!: () => void; let release!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    const blocked = new Promise<void>((resolve) => { release = resolve })
    const d = directing(s, { execute: async (_request, _signal, command) => {
      const attempts = pendingWorldAttempts(s.commands.snapshot(id))
      if (attempts.length > 0) {
        entered(); await blocked
        command('late', { operation: 'observe', input: { summary: 'Late result', content: 'The door opens.',
          settles: attempts.map(item => item.id), state: [], deliveries: [
            { actorId: 'a', content: 'The door opens.', kind: 'observation', sourceRefs: [] },
          ] } })
      }
      command('finish', { operation: 'finish', actors: ['a'], advanceDiscussion: false })
    } }, scripted(async () => ({ posture: 'waiting', behavior: [{ kind: 'action', attempt: 'Try the door.', await_result: true }] })), 16000, 2)
    const running = d.director.run(s.scope(id), 'Explore')
    const rejected = expect(running).rejects.toThrow('cancelled')
    await started
    d.director.pause(s.scope(id), 'Player pauses')
    const paused = s.commands.snapshot(id)
    release(); await rejected
    expect(s.commands.snapshot(id)).toEqual(paused)
    expect(pendingWorldAttempts(paused)).toHaveLength(1)
    await d.director.dispose(); await d.runtime.dispose()
  })

  it.each([false, true])('settles a waiting attempt and preserves accepted narration on repair (omitted link=%s)', async (omittedLink) => {
    const s = setup(['a']); const id = s.create(); s.stage(id, ['a'])
    let actorCalls = 0; let directorCalls = 0
    const d = directing(s, { execute: async ({ context }, _signal, command) => {
      directorCalls++
      if (directorCalls === 2) {
        expect(context.text).toContain('PENDING WORLD ATTEMPTS')
        const attempt = pendingWorldAttempts(s.commands.snapshot(id))[0]!
        if (omittedLink) {
          command('unlinked', { operation: 'observe', input: { summary: 'The latch opens', content: 'The latch opens.',
            narration: 'The latch opens with a click.',
            deliveries: [{ actorId: 'a', content: 'The latch gives way under your hand.', kind: 'observation', sourceRefs: [] }], state: [] } })
          expect(pendingWorldAttempts(s.commands.snapshot(id)).map(item => item.id)).toEqual([attempt.id])
        }
        expect(() => command('premature', { operation: 'finish', actors: ['a'], advanceDiscussion: false })).toThrow('Settle waiting')
        command('settle', { operation: 'observe', input: { summary: 'The latch opens', content: 'The latch opens.', settles: [attempt.id],
          deliveries: [{ actorId: 'a', content: 'The latch gives way under your hand.', kind: 'observation', sourceRefs: [] }], state: [] } })
      }
      command('finish', { operation: 'finish', actors: ['a'], advanceDiscussion: false })
    } }, scripted(async ({ context }) => {
      actorCalls++
      if (actorCalls === 1) return { posture: 'waiting', behavior: [{ kind: 'action', attempt: 'Try the latch.', await_result: true }] }
      expect(context.text).toContain('latch gives way')
      expect(context.text).toContain('respondsTo')
      expect(context.text).not.toContain('YOUR PENDING WORLD ATTEMPTS')
      return silence()
    }), 16000, 2)
    const scope = s.scope(id)
    const result = await d.director.run(scope, 'Investigate the door')
    expect([actorCalls, directorCalls]).toEqual([2, 2])
    expect(s.commands.snapshot(id).entities.filter(item => item.key.collection === 'narration')).toHaveLength(omittedLink ? 1 : 0)
    expect(pendingWorldAttempts(s.commands.snapshot(id))).toEqual([])
    expect(s.commands.snapshot(id).entities.filter(item => item.key.collection === 'player-input')).toHaveLength(1)
    const before = s.commands.snapshot(id)
    const originals = narrativeOriginals(before, 'actor:a')
    const attempted = originals.find(item => item.kind === 'action-attempt')!
    const linked = originals.find(item => item.kind === 'observation' && item.text.includes('respondsTo'))!
    expect(JSON.parse(linked.text)).toMatchObject({ id: linked.id, content: 'The latch gives way under your hand.',
      respondsTo: [attempted.id] })
    const recalled = new RetentionQueries(s.commands, 10, 6000).recall(id, 'actor:a', { query: linked.id, offset: 0, limit: 1 })
    expect(recalled.entries[0]?.text).toBe(linked.text)
    const directorResult = narrativeOriginals(before, 'director').find(item => item.kind === 'settled-fact' && item.text.includes('settles'))!
    expect(JSON.parse(directorResult.text)).toEqual({ content: 'The latch opens.', settles: [attempted.id] })
    expect(new RetentionQueries(s.commands, 10, 6000).recall(id, 'director', { query: directorResult.id, offset: 0, limit: 1 })
      .entries[0]?.text).toBe(directorResult.text)
    expect(narrativeOriginals(s.commands.replay(id, attempted.revision), 'actor:a').some(item => item.id === linked.id)).toBe(false)
    expect(await d.director.run(scope, 'Investigate the door')).toEqual(result)
    expect(s.commands.snapshot(id)).toEqual(before)
    const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
    const imported = archives.import(archives.export(id, []), s.values.id() as CommandId)
    expect(pendingWorldAttempts(s.commands.snapshot(imported.instance.id))).toEqual([])
    expect(narrativeOriginals(s.commands.snapshot(imported.instance.id), 'actor:a').find(item => item.id === linked.id)?.text).toBe(linked.text)
    await d.director.dispose(); await d.runtime.dispose()
  })

  it.each([false, true])('bounds feedback when each pass creates new work (settlement=%s)', async (settle) => {
    const s = setup(['a']); const id = s.create(); s.stage(id, ['a'])
    let calls = 0
    const d = directing(s, { execute: async (_request, _signal, command) => {
      calls++
      const pending = pendingWorldAttempts(s.commands.snapshot(id))
      if (pending.length > 0 && settle) command('settle', { operation: 'observe', input: {
        summary: 'One step checked', content: 'Another passage lies beyond.', settles: pending.map(item => item.id),
        deliveries: [{ actorId: 'a', content: 'You see another passage.', kind: 'observation', sourceRefs: [] }], state: [],
      } })
      command('finish', { operation: 'finish', actors: pending.length === 0 || settle ? ['a'] : [], advanceDiscussion: false })
    } }, scripted(async () => ({ posture: 'waiting', behavior: [{ kind: 'action', attempt: 'Check the next passage.', await_result: true }] })), 16000, 2)
    await d.director.run(s.scope(id), 'Explore')
    expect(calls).toBe(settle ? 3 : 2)
    expect(pendingWorldAttempts(s.commands.snapshot(id))).toHaveLength(1)
    await d.director.dispose(); await d.runtime.dispose()
  })
  it('retains length instructions and complete history regardless of the query-page character limit', async () => {
    const s = setup(['a']); const id = s.create(); s.stage(id, ['a'])
    const player = new PlayerApplication(s.commands, s.values, { cancel: async () => {} }, 6000)
    const scope = s.scope(id)
    const intervention = `The window opens. ${'Rain crosses the courtyard. '.repeat(45)}`.trim()
    const accepted = await player.interveneScene(scope, intervention)
    const instruction = 'Respond to the changed world.'
    const full = new DirectorQueries(s.commands, 30000, 100).context({ instanceId: id, instruction })
    const characters = full.text.length + full.sections.length * 2 + 10
    const queries = new DirectorQueries(s.commands, characters, 100)
    expect(queries.context({ instanceId: id, instruction }).text).toContain(intervention)
    new ConfigurationApplication(s.commands).setRecipe(s.scope(id), { ...recipeOf(s.commands.snapshot(id)),
      narrationLength: { enabled: true, minimum: 1000, target: 1500 } })
    const context = queries.context({ instanceId: id, instruction })
    expect(context.text.length).toBeGreaterThan(characters)
    expect(context.text).toContain('最低 1000 字，目标 1500 字')
    expect(context.text).toContain(intervention)
    expect(context.sources).toContain('recipe:narrationLength')
    expect(context.sections.map(section => section.content).join('\n\n')).toBe(context.text)
    expect(new DirectorQueries(s.commands, 128, 100)
      .context({ instanceId: id, instruction }).text).toBe(context.text)
    const d = directing(s, { execute: async ({ context: request }, _signal, command) => {
      expect(request.text).toContain(intervention)
      expect(request.text).toContain('最低 1000 字，目标 1500 字')
      command('finish', { operation: 'finish', actors: [], advanceDiscussion: false })
    } }, undefined, characters)
    expect((await d.director.run(s.scope(id), instruction)).status).toBe('completed')
    expect(await player.interveneScene(scope, intervention)).toEqual(accepted)
    expect(s.commands.snapshot(id).entities.filter(item => item.key.collection === 'facts')).toHaveLength(1)
    await d.director.dispose(); await d.runtime.dispose()
  })

  it('stages short prose, rejects stale revisions and dispatch, then publishes combined facts once', async () => {
    const s = setup(['a']); const id = s.create(); s.stage(id, ['a'])
    new ConfigurationApplication(s.commands).setRecipe(s.scope(id), { ...recipeOf(s.commands.snapshot(id)),
      narrationLength: { enabled: true, minimum: 10, target: 15 } })
    const input = { summary: 'Rain', content: 'Rain wets the sill.', narration: '**雨落窗边。**',
      deliveries: [{ actorId: 'a', content: 'You hear rain.', kind: 'observation' as const, sourceRefs: [] }], state: [] }
    const d = directing(s, { execute: async ({ context }, _signal, command) => {
      expect(context.text).toContain('最低 10 字，目标 15 字')
      const first = command('short', { operation: 'observe', input })
      expect(first.result).toMatchObject({ narrationDraft: { status: 'pending', characters: 4, remaining: 6, revision: 0 } })
      expect(command('short', { operation: 'observe', input })).toEqual(first)
      expect(s.commands.snapshot(id).entities.filter(item => ['facts', 'narration', 'evidence:a'].includes(item.key.collection))).toEqual([])
      expect(() => command('premature', { operation: 'finish', actors: ['a'], advanceDiscussion: false })).toThrow('pending narration')
      expect(() => command('duplicate', { operation: 'observe', input })).toThrow('unpublished narration')
      const append = { operation: 'revise-narration' as const, input: { draftRevision: 0, mode: 'append' as const, narration: '水珠滚动。' } }
      const second = command('append', append)
      expect(second.result).toMatchObject({ narrationDraft: { status: 'pending', characters: 8, revision: 1 } })
      expect(command('append', append)).toEqual(second)
      expect(() => command('stale', append)).toThrow('revision changed')
      expect(new PlayQueries(s.commands, 20).read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 20 }))
        .toMatchObject({ narrationDraft: { text: '**雨落窗边。**\n\n水珠滚动。', characters: 8 }, total: 1 })
      expect(command('expand', { operation: 'revise-narration', input: { draftRevision: 1, mode: 'replace',
        narration: '雨落窗边，水珠沿木框缓缓滚落。' } }).result).toMatchObject({ narrationDraft: { status: 'published', revision: 2 } })
      command('finish', { operation: 'finish', actors: [], advanceDiscussion: false })
    } })
    await d.director.run(s.scope(id), 'Continue.')
    const snapshot = s.commands.snapshot(id)
    for (const collection of ['facts', 'narration', 'evidence:a']) expect(snapshot.entities.filter(item => item.key.collection === collection)).toHaveLength(1)
    const view = new PlayQueries(s.commands, 20).read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 20 })
    expect(view.narrationDraft).toBeUndefined()
    expect(view.rows.filter(row => row.kind === 'narration').map(row => row.text)).toEqual(['雨落窗边，水珠沿木框缓缓滚落。'])
    expect(s.commands.replay(id, snapshot.instance.revision)).toEqual(snapshot)
    const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
    const imported = archives.import(archives.export(id, []), 'narration-import' as CommandId)
    expect(imported.entities).toEqual(snapshot.entities.filter(item => item.key.collection !== 'run'))
    await d.director.dispose(); await d.runtime.dispose()
  })

  it('retains an exhausted draft without publishing fiction or looping indefinitely', async () => {
    const s = setup(['a']); const id = s.create(); s.stage(id, ['a'])
    new ConfigurationApplication(s.commands).setRecipe(s.scope(id), { ...recipeOf(s.commands.snapshot(id)),
      narrationLength: { enabled: true, minimum: 1000, target: 1500 } })
    const d = directing(s, { execute: async (_request, _signal, command) => {
      command('short', { operation: 'observe', input: { summary: 'Rain', content: 'Rain.', narration: '雨。', deliveries: [], state: [] } })
      command('first', { operation: 'revise-narration', input: { draftRevision: 0, mode: 'append', narration: '风。' } })
      const last = command('second', { operation: 'revise-narration', input: { draftRevision: 1, mode: 'append', narration: '云。' } })
      expect(last.result).toMatchObject({ narrationDraft: { status: 'exhausted', characters: 3, revisionsRemaining: 0 } })
      expect(last.failure).toContain('3/1000')
      expect(() => command('third', { operation: 'revise-narration', input: { draftRevision: 2, mode: 'append', narration: '天。' } })).toThrow('unavailable')
      throw new Error(last.failure)
    } })
    await expect(d.director.run(s.scope(id), 'Continue.')).rejects.toThrow('3/1000')
    expect(s.commands.snapshot(id).entities.filter(item => ['facts', 'narration'].includes(item.key.collection))).toEqual([])
    expect(new PlayQueries(s.commands, 20).read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 20 }))
      .toMatchObject({ phase: 'failed', narrationDraft: { text: '雨。\n\n风。\n\n云。', status: 'exhausted' } })
    await d.director.dispose(); await d.runtime.dispose()
  })

  it('validates numeric ranges and counts visible Unicode prose without destinations or formatting', () => {
    expect(narrationLengthSchema.safeParse({ enabled: true, minimum: 1000, target: 900 }).success).toBe(false)
    expect(narrationLengthSchema.safeParse({ enabled: true, minimum: 0, target: 1500 }).success).toBe(false)
    expect(narrationCharacterCount('**雨落**\n\n[窗边](https://example.org/long) <b>ABC123</b>，𠮷。')).toBe(11)
    expect(narrationCharacterCount('[雨落][long-reference]\n\n[long-reference]: https://example.org/secret')).toBe(2)
    expect(narrationCharacterCount('```javascript\nABC123\n```')).toBe(6)
  })
  it('delivers director performance cues to the named actor without turning direction into evidence', async () => {
    const s = setup(['a', 'b'], 'a'); const id = s.create(); const other = s.create(); s.stage(id, ['a', 'b'])
    const cue = 'USER-DIRECTION: propose a practical route and develop your answer in full paragraphs.'
    const d = directing(s, { execute: async (_request, _signal, command) => {
      command('cue', { operation: 'style', input: { scope: 'scene', sceneId: 'inn', key: 'actor:a', instruction: cue } })
      const afterCue = s.commands.snapshot(id)
      expect(afterCue.entities.filter(item => ['behavior', 'facts', 'knowledge'].includes(item.key.collection)
        || item.key.collection.startsWith('evidence:')).some(item => JSON.stringify(item.value).includes(cue))).toBe(false)
      command('finish', { operation: 'finish', actors: ['a'], advanceDiscussion: false })
    } }, scripted(async (request) => {
      expect(request.context.text).toContain('author-side performance direction, not perceived facts or evidence')
      expect(request.context.text).toContain(cue)
      return { posture: 'finished', behavior: [{ kind: 'speech', text: 'We can take the north bridge before sunset.' }] }
    }))
    await d.director.run(s.scope(id), 'Let the protagonist propose a route in detail.')
    const revision = s.commands.snapshot(id).instance.revision
    expect(s.queries.actorContext({ instanceId: id, actorId: 'b', query: '' }).text).not.toContain(cue)
    expect(s.queries.actorContext({ instanceId: other, actorId: 'a', query: '' }).text).not.toContain(cue)
    expect(d.directorQueries.context({ instanceId: id, instruction: '' }).text).toContain('activePerformanceDirections')
    expect(d.directorQueries.context({ instanceId: id, instruction: '' }).text).toContain(cue)
    s.people.stage(s.scope(id), { id: 'bridge', location: 'Bridge', present: ['a', 'b'], appearances: [] })
    expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).text).not.toContain(cue)
    expect(d.directorQueries.context({ instanceId: id, instruction: '' }).text).not.toContain(cue)
    expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: '', revision }).text).toContain(cue)
    await d.director.dispose(); await d.runtime.dispose()
  })
  it.each([null, 'a'])('distinguishes narrative focus (%s) from live player ownership across dispatch and replay', async (protagonist) => {
    const s = setup(['a', 'b'], protagonist); const id = s.create(); s.stage(id, ['a', 'b'])
    const player = new PlayerApplication(s.commands, s.values, { cancel: async () => {} }, 6000)
    const calls: string[] = []
    const d = directing(s, { execute: async (_request, _signal, command) => {
      command('finish', { operation: 'finish', actors: ['a', 'b'], advanceDiscussion: false })
    } }, scripted(async (request) => { calls.push(request.context.actorId); return silence() }))
    const scene = (revision?: number) => {
      const context = d.directorQueries.context({ instanceId: id, instruction: 'Continue.',
        ...(revision === undefined ? {} : { revision }) })
      const section = context.sections.find(item => item.content.startsWith('[CURRENT SCENE]'))!
      return JSON.parse(section.content.slice('[CURRENT SCENE]\n'.length)) as Record<string, unknown>
    }
    const initial = s.commands.snapshot(id).instance.revision
    expect(scene()).toMatchObject({ protagonistActorId: protagonist, playerControlledActorId: null, aiControlledPresentActorIds: ['a', 'b'] })
    await d.director.run(s.scope(id), 'Continue.')
    expect(calls.splice(0)).toEqual(['a', 'b'])
    await player.control(s.scope(id), 'a')
    expect(scene()).toMatchObject({ playerControlledActorId: 'a', aiControlledPresentActorIds: ['b'] })
    await d.director.run(s.scope(id), 'Continue.')
    expect(calls.splice(0)).toEqual(['b'])
    await player.control(s.scope(id), 'b')
    expect(scene()).toMatchObject({ playerControlledActorId: 'b', aiControlledPresentActorIds: ['a'] })
    await d.director.run(s.scope(id), 'Continue.')
    expect(calls.splice(0)).toEqual(['a'])
    await player.control(s.scope(id), null)
    s.stage(id, ['b'])
    expect(scene()).toMatchObject({ protagonistActorId: protagonist, playerControlledActorId: null, aiControlledPresentActorIds: ['b'] })
    expect(scene(initial)).toMatchObject({ protagonistActorId: protagonist, playerControlledActorId: null, aiControlledPresentActorIds: ['a', 'b'] })
    await d.director.dispose(); await d.runtime.dispose()
  })
  it('tells the director who the player owns and filters accidental autonomous dispatch', async () => {
    const s = setup(); const id = s.create(); s.stage(id)
    await new PlayerApplication(s.commands, s.values, { cancel: async () => {} }, 6000).control(s.scope(id), 'b')
    const calls: string[] = []
    const d = directing(s, { execute: async (request, _signal, command) => {
      expect(request.context.text).toContain('playerControlledActorId')
      command('finish', { operation: 'finish', actors: ['a', 'b'], advanceDiscussion: false })
    } }, scripted(async (request) => { calls.push(request.context.actorId); return silence() }))
    await d.director.run(s.scope(id), 'Continue the scene.')
    expect(calls).toEqual(['a'])
    await d.director.dispose(); await d.runtime.dispose()
  })
  it.each([false, true])('distinguishes feedback from closure and preserves the next floor (player=%s)', async (controlled) => {
    const s = setup(); const id = s.create(); s.stage(id, ['a', 'b'])
    if (controlled) await new PlayerApplication(s.commands, s.values, { cancel: async () => {} }, 6000).control(s.scope(id), 'b')
    let directorCalls = 0; let discussionId = ''
    const speakers: string[] = []
    const d = directing(s, { execute: async ({ context }, _signal, command) => {
      directorCalls++
      if (directorCalls === 1) {
        expect(context.sections.some(section => section.id === 'execution-purpose')).toBe(false)
        const opened = command('discuss', { operation: 'discuss', input: { topic: 'Check the exit', participantIds: ['a', 'b'], maxRounds: 2 } })
        discussionId = (opened.result as { discussionIds: string[] }).discussionIds[0]!
        command('finish', { operation: 'finish', actors: [], advanceDiscussion: true })
      } else if (directorCalls === 2) {
        const purpose = context.sections.find(section => section.id === 'execution-purpose')!.content
        expect(purpose).toContain(controlled ? 'discussion is awaiting the player' : 'still active and paused for world feedback, not finished')
        expect(purpose).toContain(controlled ? 'Preserve the player floor' : 'resume its assigned floor')
        expect(purpose).not.toContain('has reached its summarizing phase')
        const attempt = pendingWorldAttempts(s.commands.snapshot(id))[0]!
        command('settle', { operation: 'observe', input: { summary: 'The exit opens', content: 'The latch opens.',
          settles: [attempt.id], shared: { actorIds: ['a', 'b'], content: 'The latch opens.', kind: 'observation', sourceRefs: [] },
          deliveries: [], state: [] } })
        command('resume', { operation: 'finish', actors: [], advanceDiscussion: !controlled })
      } else {
        expect(context.sections.find(section => section.id === 'execution-purpose')?.content).toContain('has reached its summarizing phase')
        command('close', { operation: 'discussion-control', input: { operation: 'close', discussionId, status: 'completed' } })
        command('finish', { operation: 'finish', actors: [], advanceDiscussion: false })
      }
    } }, scripted(async ({ context }) => {
      const preparing = discussionsOf(s.commands.snapshot(id)).discussions[0]!.preparationPendingIds?.includes(context.actorId)
      if (preparing) return { posture: 'watching', discussion: { action: 'pass', eagerness: 'medium' } }
      speakers.push(context.actorId)
      if (speakers.length === 1) return { posture: 'waiting', discussion: { action: 'speak', eagerness: 'medium' },
        behavior: [{ kind: 'speech', text: 'I will check the latch.' },
          { kind: 'action', attempt: 'Lift the exit latch.', await_result: true }] }
      expect(context.text).toContain('The latch opens.')
      return { posture: 'waiting', discussion: { action: 'conclude', eagerness: 'medium' },
        behavior: [{ kind: 'speech', text: 'It opens. I will go first.' }] }
    }), 16000, 2)
    try {
      await d.director.run(s.scope(id), '')
      if (controlled) await d.director.summarizeDiscussion(s.scope(id))
      expect(speakers).toEqual(controlled ? ['a'] : ['a', 'b'])
      expect(directorCalls).toBe(controlled ? 2 : 3)
      const discussion = discussionsOf(s.commands.snapshot(id)).discussions[0]!
      if (controlled) {
        expect(discussion.status).toBe('active')
        expect(discussion.currentSpeakerId).toBe('b')
      } else expect(discussion.status).toBe('completed')
    } finally { await d.director.dispose(); await d.runtime.dispose() }
  })

  it('retains public commitments during director discussion summary without reading actor memory', async () => {
    const s = setup(); const id = s.create(); s.stage(id, ['a', 'b'])
    new RetentionApplication(s.commands).review(s.scope(id), { operation: 'policy', owner: 'director', activation: 'automatic' })
    let directorCalls = 0; let actorCalls = 0; let discussionId = ''
    const d = directing(s, { execute: async ({ context }, _signal, command) => {
      directorCalls++
      if (directorCalls === 1) {
        const result = command('discuss', { operation: 'discuss', input: { topic: 'Returning the key', participantIds: ['a', 'b'], maxRounds: 1 } })
        discussionId = (result.result as { discussionIds: string[] }).discussionIds[0]!
        const beforeDispatch = s.commands.snapshot(id)
        for (const advanceDiscussion of [false, true]) {
          expect(() => command(`mixed-${advanceDiscussion}`, { operation: 'finish', actors: ['a', 'b'], advanceDiscussion }))
            .toThrowErrorMatchingInlineSnapshot('[Error: Use discussion scheduling for its participants. Remove discussion participants from finish.actors; use actors=[] when nobody outside the discussion should respond. Use advanceDiscussion=true to continue the discussion, or close it with discussion-control before ordinary dispatch. No scheduling changes were submitted.]')
          expect(s.commands.snapshot(id)).toEqual(beforeDispatch)
        }
        command('finish', { operation: 'finish', actors: [], advanceDiscussion: true })
        return
      }
      expect(context.text).not.toContain('PRIVATE-DOUBT')
      expect(context.text).toContain('DISCUSSION CONSOLIDATION')
      await expect(context.sections.find(section => section.sources.includes('discussion:consolidation'))?.content)
        .toMatchFileSnapshot('./expected/director-discussion-consolidation.txt')
      const sourceIds = s.commands.snapshot(id).entities.filter(item => item.key.collection === 'behavior').map(item => item.key.id)
      command('remember', { operation: 'context-update', input: [{ sourceIds, disposition: 'represented', reason: 'Keep the public commitment.',
        changes: [{ operation: 'add', kind: 'promise', text: 'The speaker promised to return the key tomorrow; return is not yet observed.', sourceIds }] }] })
      command('close', { operation: 'discussion-control', input: { operation: 'close', discussionId, status: 'completed' } })
      command('finish', { operation: 'finish', actors: [], advanceDiscussion: false })
    } }, scripted(async () => {
      actorCalls++
      if (actorCalls <= 2) return { posture: 'watching', memories: [{ content: 'PRIVATE-DOUBT: I might not return.' }],
        discussion: { action: 'pass', eagerness: 'medium' } }
      return { posture: 'waiting', behavior: [{ kind: 'speech', text: 'I will return the key tomorrow.' }],
        discussion: { action: 'conclude', eagerness: 'medium' } }
    }))
    const scope = s.scope(id)
    const result = await d.director.run(scope, 'Discuss the key.')
    expect(retentionOf(s.commands.snapshot(id), 'director').notes[0]?.text).toContain('return is not yet observed')
    expect(retentionOf(s.commands.snapshot(id), 'actor:a').notes).toEqual([])
    const before = s.commands.snapshot(id)
    expect(await d.director.run(scope, 'Discuss the key.')).toEqual(result)
    expect(s.commands.snapshot(id)).toEqual(before)
    expect(directorCalls).toBe(2)
    await d.director.dispose(); await d.runtime.dispose()
  })

  it('hands a concluded discussion back to the director once without adding a player message', async () => {
    const s = setup(); const a = s.create(); s.stage(a, ['a', 'b'])
    let preparations = 0
    let actorTurns = 0
    let discussionId = ''
    const d = directing(s, { execute: async (_request, _signal, command) => {
      preparations++
      if (preparations === 1) {
        const started = command('discuss', { operation: 'discuss', input: { topic: 'The key', participantIds: ['a', 'b'], maxRounds: 1 } })
        discussionId = (started.result as { discussionIds: string[] }).discussionIds[0]!
        command('finish', { operation: 'finish', actors: [], advanceDiscussion: true })
      } else {
        command('close', { operation: 'discussion-control', input: { operation: 'close', discussionId, status: 'completed' } })
        command('finish', { operation: 'finish', actors: [], advanceDiscussion: false })
      }
    } }, { execute: async (_request, _signal, submit) => {
      submit({ posture: 'silent', behavior: [], discussion: { action: ++actorTurns <= 2 ? 'pass' : 'conclude', eagerness: 'low' } })
    } })
    const scope = s.scope(a)
    const result = await d.director.run(scope, 'Discuss the key.')
    expect(preparations).toBe(2)
    expect(result.status).toBe('completed')
    const play = new PlayQueries(s.commands, 40).read({ instanceId: a, audience: { kind: 'observer' }, offset: 0, limit: 40 })
    expect(play.phase).toBe('ready')
    expect(play.rows.filter(row => row.kind === 'direction').map(row => row.text)).toEqual(['Discuss the key.'])
    expect(await d.director.run(scope, 'Discuss the key.')).toEqual(result)
    expect(preparations).toBe(2)
    await d.director.dispose(); await d.runtime.dispose()
  })
  it('queries an instance, settles projected stimuli, serially dispatches and replays without model reruns', async () => {
    const s = setup(); const a = s.create(); const b = s.create()
    const actorRequests: string[] = []
    let preparations = 0
    const d = directing(s, { execute: async (request, _signal, command) => {
      preparations++
      expect(new PlayQueries(s.commands, 40).read({ instanceId: a, audience: { kind: 'observer' }, offset: 0, limit: 10 }).phase).toBe('director-preparing')
      expect(request.context).toEqual(d.directorQueries.context({ instanceId: a, revision: request.context.revision, instruction: 'A bell rings.' }))
      const found = command('find', { operation: 'find', query: '', offset: 0, limit: 3 })
      expect((found.result as { total: number }).total).toBe(3)
      expect(found.commit).toBeUndefined()
      command('stage', { operation: 'stage', input: { id: 'inn', location: 'Inn', present: ['a', 'b'], appearances: [] } })
      command('observe', { operation: 'observe', input: { summary: 'A bell rang.', content: 'The bell rang.', narration: 'A bell rings beside [[person:b]].',
        state: [], deliveries: [{ actorId: 'a', content: 'A bell rings beside [[person:b]].', kind: 'observation', sourceRefs: [] }] } })
      const finish = { operation: 'finish' as const, actors: ['a', 'b'], advanceDiscussion: false }
      const reply = command('finish', finish)
      expect(command('finish', finish)).toEqual(reply)
      expect(() => command('finish', { ...finish, actors: [] })).toThrow('different content')
    } }, { execute: async (request, _signal, submit) => {
      actorRequests.push(request.context.text)
      submit({ posture: 'waiting', behavior: [{ kind: 'speech', text: request.context.actorId === 'a'
        ? 'Would you check the door?' : 'I heard your request; I will check.' }] })
      // The actor committed, but its Director still owns dispatch/settlement.
      const play = new PlayQueries(s.commands, 40).read({ instanceId: a, audience: { kind: 'observer' }, offset: 0, limit: 10 })
      expect(play.phase).toBe('character-responding')
      expect(play.activeActorId).toBe(request.context.actorId)
    } })
    const scope = s.scope(a)
    const pending = d.director.run(scope, 'A bell rings.')
    expect(d.director.run(scope, 'A bell rings.')).toBe(pending)
    await expect(d.director.run(scope, 'A different bell.')).rejects.toThrow('identity')
    const result = await pending
    expect(result).toMatchObject({ status: 'completed', completedActors: 2 })
    expect(actorRequests).toHaveLength(2)
    expect(actorRequests[0]).toContain('A bell rings beside')
    expect(actorRequests[0]).not.toContain('SECRET-NAME-b')
    expect(actorRequests[1]).not.toContain('A bell rings beside')
    expect(actorRequests[1]).toContain('Would you check the door?')
    expect(actorRequests[0]).not.toContain('I heard your request; I will check.')
    expect(s.commands.snapshot(b).instance.revision).toBe(0)
    expect(await d.director.run(scope, 'A bell rings.')).toEqual(result)
    expect(preparations).toBe(1)
    const play = new PlayQueries(s.commands, 40)
    expect(play.read({ instanceId: a, audience: { kind: 'observer' }, offset: 0, limit: 40 }).rows
      .filter(row => row.kind === 'direction')).toEqual([expect.objectContaining({ text: 'A bell rings.', origin: 'player' })])
    expect(play.read({ instanceId: a, audience: { kind: 'observer' }, revision: 0, offset: 0, limit: 40 }).rows).toEqual([])
    const archive = new NarrativeArchives(s.store, s.values, { verify: () => {} })
    const imported = archive.import(archive.export(a, []), s.values.id() as CommandId)
    expect(new PlayQueries(s.commands, 40).read({ instanceId: imported.instance.id, audience: { kind: 'observer' }, offset: 0, limit: 10 }).rows)
      .toEqual(new PlayQueries(s.commands, 40).read({ instanceId: a, audience: { kind: 'observer' }, offset: 0, limit: 10 }).rows)
    await d.director.dispose(); await d.runtime.dispose()
  })

  it('keeps accepted world changes when the next command conflicts with a player edit', async () => {
    const s = setup(); const a = s.create()
    const d = directing(s, { execute: async (_request, _signal, command) => {
      command('stage', { operation: 'stage', input: { id: 'inn', location: 'Inn', present: ['a'], appearances: [] } })
      s.world.observe(s.scope(a), { summary: 'Player opened the door.', content: 'The door is open.', state: [], deliveries: [] })
      command('finish', { operation: 'finish', actors: [], advanceDiscussion: false })
    } })
    await expect(d.director.run(s.scope(a), '')).rejects.toThrow('Story changed')
    expect(new PlayQueries(s.commands, 40).read({ instanceId: a, audience: { kind: 'observer' }, offset: 0, limit: 10 }).phase).toBe('failed')
    expect(s.commands.snapshot(a).entities.some(item => item.key.collection === 'facts')).toBe(true)
    await d.director.dispose(); await d.runtime.dispose()
  })

  it('dispatches an accepted plan even if the adapter fails to deliver its final tool response', async () => {
    const s = setup(); const a = s.create(); s.stage(a)
    const d = directing(s, { execute: async (_request, _signal, command) => {
      command('finish', { operation: 'finish', actors: ['a'], advanceDiscussion: false })
      throw new Error('Socket closed after receipt')
    } })
    expect(await d.director.run(s.scope(a), '')).toMatchObject({ status: 'completed', completedActors: 1 })
    await d.director.dispose(); await d.runtime.dispose()
  })

  it('rejects late director tools after restoration without recreating the removed run projection', async () => {
    const s = setup(); const a = s.create()
    let release!: () => void
    let entered!: () => void
    const blocked = new Promise<void>((resolve) => { release = resolve })
    const started = new Promise<void>((resolve) => { entered = resolve })
    const d = directing(s, { execute: async (_request, _signal, command) => {
      entered(); await blocked
      command('late', { operation: 'stage', input: { id: 'late', location: 'Late', present: ['a'], appearances: [] } })
    } })
    const executing = d.director.run(s.scope(a), '')
    const rejected = expect(executing).rejects.toThrow('cancelled')
    await started
    const recovery = new RecoveryApplication(s.commands, { capture: async () => null,
      cancel: (id, epoch, reason) => d.director.abort(id, epoch, reason) })
    const restoring = recovery.restore(s.scope(a), 0, 'Redo opening')
    const committed = s.commands.snapshot(a)
    release()
    await rejected
    expect((await restoring).execution).toBe('cancelled')
    expect(s.commands.snapshot(a)).toEqual(committed)
    expect(committed.entities.some(item => item.key.collection === 'run')).toBe(false)
    await d.director.dispose(); await d.runtime.dispose()
  })

  it('rejects offscene dispatch and oversized lookup without applying partial fictional changes', async () => {
    const s = setup(); const a = s.create()
    const d = directing(s, { execute: async (_request, _signal, command) => {
      const snapshot = s.commands.snapshot(a)
      expect(() => command('finish-invalid', { operation: 'finish', actors: ['a'], advanceDiscussion: false })).toThrow('not present')
      expect(() => command('find-invalid', { operation: 'find', query: '', offset: 0, limit: 99999 })).toThrow('bounds')
      expect(s.commands.snapshot(a)).toEqual(snapshot)
      command('finish', { operation: 'finish', actors: [], advanceDiscussion: false })
    } })
    expect(await d.director.run(s.scope(a), '')).toMatchObject({ status: 'completed' })
    await d.director.dispose(); await d.runtime.dispose()
  })
})

it('refuses an export whose narrative changes while technical evidence is being captured', async () => {
  const s = setup(); const a = s.create()
  const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
  const transfer = new NarrativeTransfer(s.commands, archives, { exportEvidence: async () => {
    s.stage(a)
    return []
  } })
  await expect(transfer.export(a, 0)).rejects.toThrow('Story changed while collecting')
  expect(s.commands.snapshot(a).instance.revision).toBe(1)
})

it('delivers a visible player intervention only to the reviewed scene and reuses its exact command after attendance changes', async () => {
  const s = setup(); const a = s.create(); const b = s.create(); s.stage(a, ['a', 'b'])
  const player = new PlayerApplication(s.commands, s.values, { cancel: async () => {} }, 6000)
  const scope = s.scope(a)
  const accepted = await player.interveneScene(scope, 'The window shatters.')
  expect(evidenceFor(s.commands.snapshot(a), 'a')[0]?.content).toBe('The window shatters.')
  expect(evidenceFor(s.commands.snapshot(a), 'b')).toHaveLength(1)
  expect(evidenceFor(s.commands.snapshot(a), 'c')).toHaveLength(0)
  const play = new PlayQueries(s.commands, 40)
  expect(play.read({ instanceId: a, audience: { kind: 'actor', actorId: 'a' }, offset: 0, limit: 20 }).rows)
    .toMatchObject([{ kind: 'perception', perception: 'observation', text: 'The window shatters.' }])
  expect(play.read({ instanceId: a, audience: { kind: 'actor', actorId: 'c' }, offset: 0, limit: 20 }).rows).toEqual([])
  expect(s.commands.snapshot(b).instance.revision).toBe(0)
  s.stage(a, ['c'])
  expect(await player.interveneScene(scope, 'The window shatters.')).toEqual(accepted)
  expect(evidenceFor(s.commands.snapshot(a), 'c')).toHaveLength(0)
  await expect(player.interveneScene({ ...s.scope(a), principal: { kind: 'actor', actorId: 'a', attempt: 'forged', epoch: 0 } }, 'Open the door.')).rejects.toThrow()
})

it('publishes player-origin embodiment without an Actor and preserves committed fiction on cancellation failure', async () => {
  const s = setup(); const a = s.create(); const b = s.create(); s.stage(a)
  const player = new PlayerApplication(s.commands, s.values, { cancel: async () => { throw new Error('Cancellation transport unavailable') } }, 6000)
  const scope = s.scope(a)
  const input = { actorId: 'a', reason: 'Player speaks.', behavior: [{ kind: 'speech' as const, text: 'Who are you?', to: [], delivery: 'spoken' as const }] }
  const accepted = await player.embody(scope, input)
  expect(accepted.execution).toBe('pending')
  expect(s.commands.snapshot(a).entities.some(item => item.key.collection === 'execution')).toBe(false)
  expect(await player.embody(scope, input)).toEqual(accepted)
  const play = new PlayQueries(s.commands, 40).read({ instanceId: a, audience: { kind: 'observer' }, offset: 0, limit: 10 })
  expect(play.rows).toMatchObject([{ kind: 'speech', origin: 'player', text: 'Who are you?' }])
  expect(new PlayQueries(s.commands, 40).read({ instanceId: a, audience: { kind: 'actor', actorId: 'b' }, offset: 0, limit: 20 }).rows)
    .toMatchObject([{ kind: 'speech', text: 'Who are you?' }])
  expect(play.rows[0]?.speaker).toMatchObject({ label: 'stranger-0', trueName: 'SECRET-NAME-a' })
  expect(s.queries.actorContext({ instanceId: a, actorId: 'b', query: '' }).text).not.toContain('SECRET-NAME-a')
  expect(s.queries.actorContext({ instanceId: a, actorId: 'b', query: '' }).text).toContain('Who are you?')
  expect(s.commands.snapshot(b).instance.revision).toBe(0)
  const unchanged = s.commands.snapshot(a)
  await expect(player.embody(s.scope(a), { ...input, behavior: [{ ...input.behavior[0]!, to: ['hidden-person'] }] })).rejects.toThrow('unavailable')
  expect(s.commands.snapshot(a)).toEqual(unchanged)
  const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
  const imported = archives.import(archives.export(a, []), s.values.id() as CommandId)
  expect(new PlayQueries(s.commands, 40).read({ instanceId: imported.instance.id, audience: { kind: 'observer' }, offset: 0, limit: 10 }).rows).toEqual(play.rows)
  const restoreScope = s.scope(a)
  s.commands.restore({ ...restoreScope, kind: 'restore', input: { targetRevision: scope.expectedRevision, reason: 'Undo player speech' } },
    scope.expectedRevision, 'Undo player speech')
  expect(new PlayQueries(s.commands, 40).read({ instanceId: a, audience: { kind: 'observer' }, offset: 0, limit: 10 }).rows).toEqual([])
  expect(s.commands.replay(a, accepted.commit.revision).entities.some(item => item.key.collection === 'behavior')).toBe(true)
})

it('advances an embodied discussion floor without inventing other participants’ private intentions', async () => {
  const s = setup(); const a = s.create(); s.stage(a)
  const discussions = new DiscussionApplication(s.commands, s.values)
  discussions.start(s.scope(a), { topic: 'The key', participantIds: ['a', 'b'], maxRounds: 2 })
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(() => Promise.resolve({ posture: 'watching',
    discussion: { action: 'pass', eagerness: 'medium' } })), s.values)
  await runtime.run(s.scope(a), 'a'); await runtime.run(s.scope(a), 'b')
  const before = discussionsOf(s.commands.snapshot(a)).discussions[0]!
  const speaker = before.currentSpeakerId!
  const other = speaker === 'a' ? 'b' : 'a'
  const player = new PlayerApplication(s.commands, s.values, { cancel: (id, epoch, reason) => runtime.abort(id, epoch, reason) }, 6000)
  await player.embody(s.scope(a), { actorId: speaker, reason: 'Speak on my turn', behavior: [{ kind: 'speech', text: 'Keep the key.', to: [], delivery: 'spoken' }] })
  const after = discussionsOf(s.commands.snapshot(a)).discussions[0]!
  expect(after.turns).toMatchObject([{ speakerId: speaker, text: 'Keep the key.' }])
  expect(after.currentSpeakerId).toBe(other)
  expect(after.participantIntents?.[other]).toEqual(before.participantIntents?.[other])
  await runtime.dispose()
})

it('commits a player world intervention before cancelling a late actor result', async () => {
  const s = setup(); const a = s.create(); s.stage(a)
  let entered!: () => void; let release!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  const blocked = new Promise<void>((resolve) => { release = resolve })
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, { execute: async (_request, _signal, submit) => {
    entered(); await blocked; submit({ posture: 'finished', memories: [{ content: 'This cancelled memory must not survive.' }] })
  } }, s.values)
  const running = runtime.run(s.scope(a), 'a')
  const rejected = expect(running).rejects.toThrow('cancelled')
  await started
  const player = new PlayerApplication(s.commands, s.values, { cancel: (id, epoch, reason) => runtime.abort(id, epoch, reason) }, 6000)
  const intervening = player.intervene(s.scope(a), { summary: 'Rain stops.', content: 'Rain has stopped.', narration: 'The rain stops.', state: [], deliveries: [] })
  const committed = s.commands.snapshot(a)
  release(); await rejected
  expect((await intervening).execution).toBe('cancelled')
  expect(s.commands.snapshot(a)).toEqual(committed)
  expect(lifecycleFor(committed, 'a').memories.size).toBe(0)
  await runtime.dispose()
})


describe('independent author workspace queries and configuration', () => {
  it('resolves explicit empty overrides, pinned versions and next-request guidance without leaking author truth', () => {
    const s = setup(); const a = s.create(); const b = s.create(); s.stage(a)
    const configuration = new ConfigurationApplication(s.commands)
    const author = new AuthorQueries(s.commands, s.library)
    const before = author.workspace({ instanceId: a, actorId: 'a' })
    const edit = s.scope(a)
    configuration.setSettings(edit, { overrides: { title: 'Only instance A', premise: '',
      worldTruth: { secret: 'AUTHOR-ONLY-MYSTERY' },
      contextRules: { director: { policy: 'DIRECTOR-ONLY-RULE', tools: '' },
        actor: { policy: 'ACTOR-EXPRESSION-RULE', tools: '' } } }, reason: 'Reviewed author revision' })
    const view = author.workspace({ instanceId: a, actorId: 'a' })
    expect(view.settings.sources.premise).toBe('instance')
    expect(view.settings.effective.premise).toBe('')
    expect(view.instance.title).toBe('Only instance A')
    expect(author.workspace({ instanceId: b }).instance.title).toBe('Ledger')
    expect(author.workspace({ instanceId: a, revision: before.instance.revision }).settings).toEqual(before.settings)
    const context = s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' })
    expect(context.text).toContain('ACTOR-EXPRESSION-RULE')
    expect(context.text).not.toContain('AUTHOR-ONLY-MYSTERY')
    expect(context.text).not.toContain('DIRECTOR-ONLY-RULE')
    expect(context.configurationRevision).toBe(view.configurationRevision)
    const director = new DirectorQueries(s.commands, 10000, 100)
    expect(director.context({ instanceId: a, instruction: '' }).text).toContain('AUTHOR-ONLY-MYSTERY')
    expect(() => configuration.setSettings({ ...edit, id: s.values.id() as CommandId }, { overrides: {}, reason: 'Stale' })).toThrow('revision')
    expect(() => configuration.setSettings(s.scope(a, { kind: 'director', attempt: 'fake', epoch: 0 }),
      { overrides: {}, reason: 'Unauthorized' })).toThrow('Only the player')
    const archive = new NarrativeArchives(s.store, s.values, { verify: () => {} })
    const imported = archive.import(archive.export(a, []), s.values.id() as CommandId)
    expect(author.workspace({ instanceId: imported.instance.id }).settings).toEqual(view.settings)
    const draft = s.library.list()[0]!
    s.library.saveDraft({ ...draft, expectedRevision: draft.revision, document: draft.document, title: 'New edition' })
    s.library.publish(draft.id, draft.revision + 1)
    s.library.remove(draft.id, draft.revision + 2)
    expect(author.workspace({ instanceId: a }).instance.book).toEqual(before.instance.book)
    const restore = s.scope(a)
    s.commands.restore({ ...restore, kind: 'restore', input: { targetRevision: before.instance.revision, reason: 'Undo edit' } },
      before.instance.revision, 'Undo edit')
    expect(author.workspace({ instanceId: a }).settings).toEqual(before.settings)
    expect(author.instances().find(item => item.id === a)?.book.version).toBe(1)
  })

  it('annotates player labels without disclosing names in actor context or changing historical perspective labels', () => {
    const s = setup(); const a = s.create(); s.stage(a)
    const query = new PlayQueries(s.commands, 40)
    expect(query.embodimentChoices(a).entries).toHaveLength(3)
    expect(query.embodimentChoices(a).entries.map(item => item.trueName)).toEqual(['SECRET-NAME-a', 'SECRET-NAME-b', 'SECRET-NAME-c'])
    expect(query.embodimentChoices(a).entries.map(item => item.label)).toEqual(['stranger-0', 'stranger-1', 'stranger-2'])
    expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).text).not.toContain('SECRET-NAME-b')
    expect(query.embodimentChoices(a).entries.map(item => item.actorId)).toEqual(['a', 'b', 'c'])
  })
})


it('keeps reviewed and locked director plans outside actor knowledge and settled facts across replay', () => {
  const s = setup(); const a = s.create(); const b = s.create(); s.stage(a)
  const planning = new PlanningApplication(s.commands, s.values)
  const outline = () => directorOutlineSchema.parse(entity(s.commands.snapshot(a), { collection: 'planning', id: 'current' }))
  planning.update(s.scope(a), { operation: 'replace', expectedOutlineRevision: 0, reason: 'Author plan',
    outline: { updateMode: 'review_all', premise: 'AUTHOR-PRIVATE-PLAN', premiseLocked: true,
      themes: [], hardConstraints: [], arcs: [], beats: [], foreshadows: [], mysteries: [], clocks: [] } })
  const frozen = s.commands.snapshot(a)
  planning.patch(s.scope(a, { kind: 'director', attempt: 'planning', epoch: 0 }),
    { expectedRevision: 1, reason: 'Candidate alternative', premise: 'ALTERNATE-PRIVATE-PLAN' })
  expect(outline().premise).toBe('AUTHOR-PRIVATE-PLAN')
  const proposal = outline().pendingSuggestions[0]!
  planning.update(s.scope(a), { operation: 'review', expectedOutlineRevision: 2, suggestionId: proposal.id, accept: true })
  expect(outline().premise).toBe('ALTERNATE-PRIVATE-PLAN')
  expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).text).not.toContain('PRIVATE-PLAN')
  expect(s.commands.snapshot(a).entities.filter(item => item.key.collection === 'facts')).toEqual([])
  expect(directorOutlineSchema.parse(entity(s.commands.snapshot(b), { collection: 'planning', id: 'current' })).revision).toBe(0)
  const author = new AuthorQueries(s.commands, s.library)
  expect(author.workspace({ instanceId: a, revision: frozen.instance.revision }).outline.premise).toBe('AUTHOR-PRIVATE-PLAN')
  expect(() => planning.patch(s.scope(a, { kind: 'director', attempt: 'planning', epoch: 0 }), {
    expectedRevision: outline().revision, reason: 'Invalid evidence', mysteries: [{ id: 'secret', question: 'Who?',
      answerIntent: 'Nobody', status: 'answered', evidenceEventRefs: ['another-instance-event'] }],
  })).toThrow('unavailable in this instance')
  const archive = new NarrativeArchives(s.store, s.values, { verify: () => {} })
  const imported = archive.import(archive.export(a, []), s.values.id() as CommandId)
  expect(author.workspace({ instanceId: imported.instance.id }).outline).toEqual(outline())
})


describe('independent context retention and original recall', () => {
  it('separates background knowledge for a newcomer, a child and a native without blocking later perception', () => {
    const actors = ['newcomer', 'child', 'native']
    const s = setup(actors, null, false, { newcomer: ['On Earth I used electric trains.'], child: [] })
    const id = s.create(); s.stage(id, actors)
    const context = (actorId: string) => s.queries.actorContext({ instanceId: id, actorId, query: '' }).text
    expect(context('newcomer')).toContain('On Earth I used electric trains.')
    expect(context('newcomer')).not.toContain('Rain wets clothing.')
    expect(context('child')).not.toContain('Rain wets clothing.')
    expect(context('child')).not.toContain('electric trains')
    expect(context('native')).toContain('Rain wets clothing.')
    expect(context('native')).not.toContain('electric trains')
    s.world.observe(s.scope(id), { summary: 'Rain falls', content: 'Rain falls on the child.', state: [], deliveries: [
      { actorId: 'child', content: 'Your sleeve becomes wet in the rain.', kind: 'observation', sourceRefs: [] },
    ] })
    expect(context('child')).toContain('Your sleeve becomes wet in the rain.')
    expect(context('child')).not.toContain('Rain wets clothing.')
    const archive = new NarrativeArchives(s.store, s.values, { verify: () => {} })
    const imported = archive.import(archive.export(id, []), s.values.id() as CommandId)
    expect(s.queries.actorContext({ instanceId: imported.instance.id, actorId: 'child', query: '' }).text).not.toContain('Rain wets clothing.')
    expect(s.queries.actorContext({ instanceId: imported.instance.id, actorId: 'newcomer', query: '' }).text).toContain('electric trains')
  })

  it('consolidates a full evidence batch in a separate private execution and replays without new speech', async () => {
    const s = setup(); const id = s.create(); s.stage(id)
    new RetentionApplication(s.commands).review(s.scope(id), { operation: 'policy', owner: 'actor:a', activation: 'automatic' })
    let calls = 0
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async ({ context }) => {
      calls++
      const batch = context.sections.find(section => section.id === 'consolidation')
      if (batch === undefined) return { posture: 'watching', behavior: [
        { kind: 'speech', text: 'I will return.' }, { kind: 'speech', text: 'Keep the key until then.' },
      ] }
      expect(batch.content).toContain('PRIVATE MEMORY CONSOLIDATION')
      expect(batch.content).toContain('Keep the key until then.')
      await expect(batch.content).toMatchFileSnapshot('./expected/memory-consolidation-context.txt')
      return { posture: 'silent', context_update: [{ sourceIds: ['$source:1', '$source:2'], disposition: 'represented', reason: 'My commitment.',
        changes: [{ operation: 'add', kind: 'promise', text: 'I promised to return for the key.', sourceIds: ['$source:1', '$source:2'] }] }] }
    }), s.values, 2)
    const scope = s.scope(id)
    const accepted = await runtime.run(scope, 'a')
    const snapshot = s.commands.snapshot(id)
    expect(calls).toBe(2)
    expect(snapshot.entities.filter(item => item.key.collection === 'behavior')).toHaveLength(2)
    expect(retentionOf(snapshot, 'actor:a').notes[0]?.sourceIds).toEqual(evidenceFor(snapshot, 'a').map(item => item.id))
    expect(entity(snapshot, { collection: 'posture', id: 'a' })).toBe('watching')
    expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).text).toContain('I promised to return for the key.')
    expect(await runtime.run(scope, 'a')).toEqual(accepted)
    expect(calls).toBe(2)
    expect(s.commands.snapshot(id)).toEqual(snapshot)
    const archive = new NarrativeArchives(s.store, s.values, { verify: () => {} })
    const imported = archive.import(archive.export(id, []), s.values.id() as CommandId)
    expect(retentionOf(s.commands.snapshot(imported.instance.id), 'actor:a').notes).toHaveLength(1)
    await runtime.dispose()
  })

  it('keeps review-pending originals visible without paying to consolidate the same batch again', async () => {
    const s = setup(); const id = s.create(); s.stage(id)
    let ordinaryCalls = 0; let privateCalls = 0
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async ({ context }) => {
      const batch = context.sections.find(section => section.id === 'consolidation')
      if (batch === undefined) {
        ordinaryCalls++
        return { posture: 'watching', behavior: ordinaryCalls === 1
          ? [{ kind: 'speech', text: 'Keep my key.' }, { kind: 'speech', text: 'I will return at dawn.' }] : [] }
      }
      privateCalls++
      return { posture: 'silent', context_update: [{ sourceIds: ['$source:1', '$source:2'], disposition: 'represented', reason: 'Pending review.',
        changes: [{ operation: 'add', kind: 'promise', text: 'A dawn appointment.', sourceIds: ['$source:1', '$source:2'] }] }] }
    }), s.values, 2)
    try {
      await runtime.run(s.scope(id), 'a')
      const pending = retentionOf(s.commands.snapshot(id), 'actor:a')
      expect(pending.proposals).toHaveLength(1)
      expect(pending.proposals[0]?.status).toBe('proposed')
      expect(pending.notes).toEqual([])
      await runtime.run(s.scope(id), 'a')
      expect({ ordinaryCalls, privateCalls }).toEqual({ ordinaryCalls: 2, privateCalls: 1 })
      expect(retentionOf(s.commands.snapshot(id), 'actor:a').proposals).toEqual(pending.proposals)
      const text = s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).text
      expect(text).toContain('I will return at dawn.')
      expect(text).not.toContain('A dawn appointment.')
    } finally { await runtime.dispose() }
  })

  it('preserves pending feedback status in a private batch without advancing or settling the action', async () => {
    const s = setup(); const id = s.create(); s.stage(id)
    let privateCalls = 0
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async ({ context }) => {
      const batch = context.sections.find(section => section.id === 'consolidation')
      if (batch === undefined) return { posture: 'waiting',
        behavior: [{ kind: 'action', attempt: 'Try moving the tray.', await_result: true }] }
      privateCalls++
      const pending = context.sections.find(section => section.id === 'consolidation-pending')!
      expect(pending.sources).toEqual(batch.sources)
      const header = batch.content.split('\n').find(line => line.startsWith('{'))!
      expect(JSON.parse(header)).toMatchObject({ id: pending.sources[0], sourceRef: '$source:1',
        resultStatus: 'awaiting-world-feedback' })
      expect(pending.content).toContain('no accepted result at this request revision')
      expect(pending.content).not.toContain('Try moving the tray.')
      return { posture: 'silent', context_update: [{ sourceIds: ['$source:1'], disposition: 'represented',
        reason: 'Remember my unfinished attempt.', changes: [{ operation: 'add', kind: 'claim',
          text: 'I tried moving the tray and still await its result.', sourceIds: ['$source:1'] }] }] }
    }), s.values, 1)
    try {
      await runtime.run(s.scope(id), 'a')
      expect(privateCalls).toBe(1)
      expect(pendingWorldAttempts(s.commands.snapshot(id))).toHaveLength(1)
      expect(retentionOf(s.commands.snapshot(id), 'actor:a').proposals[0]?.status).toBe('proposed')
      expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).text).toContain('YOUR PENDING WORLD ATTEMPTS')
    } finally { await runtime.dispose() }
  })

  it('keeps a partially summarized ordinary history until new evidence fills the private batch', async () => {
    const s = setup(); const id = s.create(); s.stage(id)
    new RetentionApplication(s.commands).review(s.scope(id), { owner: 'actor:a', operation: 'policy', activation: 'automatic' })
    for (const content of ['A traveler warns about water.', 'I watched the stone remain intact.']) {
      s.world.observe(s.scope(id), { summary: content, content, state: [],
        deliveries: [{ actorId: 'a', kind: 'observation', content, sourceRefs: [] }] })
    }
    const sources = evidenceFor(s.commands.snapshot(id), 'a').map(item => item.id)
    let ordinaryCalls = 0; let privateCalls = 0
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async ({ context }) => {
      const batch = context.sections.find(section => section.id === 'consolidation')
      if (batch !== undefined) {
        privateCalls++
        expect(batch.sources).not.toContain(sources[0])
        expect(batch.sources).toHaveLength(2)
        return { posture: 'silent', context_update: [{ sourceIds: ['$source:1', '$source:2'], disposition: 'represented',
          reason: 'Retain the observations.', changes: [{ operation: 'add', kind: 'claim',
            text: 'The stone stayed intact during both observations.', sourceIds: ['$source:1', '$source:2'] }] }] }
      }
      ordinaryCalls++
      return ordinaryCalls === 1 ? { posture: 'watching', context_update: [{ sourceIds: [sources[0]!], disposition: 'represented',
        reason: 'Retain the warning.', changes: [{ operation: 'add', kind: 'claim',
          text: 'A traveler gave an untested warning.', sourceIds: [sources[0]!] }] }] } : { posture: 'watching' }
    }), s.values, 2)
    try {
      await runtime.run(s.scope(id), 'a')
      expect({ ordinaryCalls, privateCalls }).toEqual({ ordinaryCalls: 1, privateCalls: 0 })
      const context = s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' })
      expect(context.text).toContain('A traveler gave an untested warning.')
      expect(context.sections.some(section => section.id === 'evidence' && section.sources.includes(sources[0]!))).toBe(false)
      expect(context.sections.some(section => section.id === 'evidence' && section.sources.includes(sources[1]!))).toBe(true)
      const recall = new RetentionQueries(s.commands, 10, 6000)
      expect(recall.recall(id, 'actor:a', { query: sources[0]!, offset: 0, limit: 1 }).entries).toHaveLength(1)
      s.world.observe(s.scope(id), { summary: 'Later observation', content: 'The stone remains intact later.', state: [],
        deliveries: [{ actorId: 'a', kind: 'observation', content: 'The stone remains intact later.', sourceRefs: [] }] })
      await runtime.run(s.scope(id), 'a')
      expect({ ordinaryCalls, privateCalls }).toEqual({ ordinaryCalls: 2, privateCalls: 1 })
      expect(retentionOf(s.commands.snapshot(id), 'actor:a').notes).toHaveLength(2)
    } finally { await runtime.dispose() }
  })

  it('uses later recalled evidence to resolve an old episode without expanding the processed batch', async () => {
    const s = setup(); const id = s.create(); s.stage(id)
    new RetentionApplication(s.commands).review(s.scope(id), { owner: 'actor:a', operation: 'policy', activation: 'automatic' })
    for (const content of ['I heard a promise to return the key.', 'I waited for that return.', 'I received the returned key.']) {
      s.world.observe(s.scope(id), { summary: content, content, state: [],
        deliveries: [{ actorId: 'a', kind: 'observation', content, sourceRefs: [] }] })
    }
    const sources = evidenceFor(s.commands.snapshot(id), 'a').map(item => item.id)
    s.world.observe(s.scope(id), { summary: 'Private clue', content: 'B learns a secret.', state: [],
      deliveries: [{ actorId: 'b', kind: 'observation', content: 'A private clue.', sourceRefs: [] }] })
    const secret = evidenceFor(s.commands.snapshot(id), 'b').at(-1)!.id
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, {
      execute: async ({ context }, _signal, submit, recall) => {
        const batch = context.sections.find(section => section.id === 'consolidation')
        if (batch === undefined) { submit({ posture: 'watching' }); return }
        expect(batch.sources).toEqual(sources.slice(0, 2))
        expect(context.sections.find(section => section.id === 'consolidation-window')?.sources).toEqual([sources[2]])
        expect(context.text).not.toContain(secret)
        expect(recall({ query: sources[2]!, offset: 0, limit: 1 }).entries[0]?.text).toContain('received the returned key')
        const update = (support: string): NpcTurnInput => ({ posture: 'silent', context_update: [{
          sourceIds: ['$source:1', '$source:2'], disposition: 'represented', reason: 'Keep the promise and its later resolution.',
          changes: [{ operation: 'add', kind: 'promise', text: 'The key was promised and subsequently returned.',
            sourceIds: ['$source:1', '$source:2', support], episode: { topic: 'Key return',
              experience: 'I heard the promise, waited, and later received the key.', unresolved: [] } }],
        }] })
        expect(() => submit(update(secret))).toThrow('Context source is unavailable')
        expect(retentionOf(s.commands.snapshot(id), 'actor:a').notes).toEqual([])
        submit(update(sources[2]!))
      },
    }, s.values, 2)
    try {
      await runtime.run(s.scope(id), 'a')
      const retained = retentionOf(s.commands.snapshot(id), 'actor:a')
      expect(retained.proposals[0]?.unit.sourceIds).toEqual(sources.slice(0, 2))
      expect(retained.notes[0]?.sourceIds).toEqual(sources)
      expect(retained.notes[0]?.episode?.unresolved).toEqual([])
      const context = s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' })
      expect(context.sections.some(section => section.id === 'evidence' && section.sources.includes(sources[2]!))).toBe(true)
    } finally { await runtime.dispose() }
  })

  it('scopes consolidation source aliases to the current batch and preserves atomic rejection', async () => {
    const s = setup(); const id = s.create(); s.stage(id)
    new RetentionApplication(s.commands).review(s.scope(id), { operation: 'policy', owner: 'actor:a', activation: 'automatic' })
    const batches: string[][] = []
    const turn = (sourceIds: string[]): NpcTurnInput => ({ posture: 'silent', context_update: [{
      sourceIds, disposition: 'represented', reason: 'Remember this promise.', changes: [{
        operation: 'add', kind: 'promise', text: 'I will return.', sourceIds,
      }],
    }] })
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, {
      execute: async ({ context }, _signal, submit) => {
        const batch = context.sections.find(section => section.id === 'consolidation')
        const before = s.commands.snapshot(id)
        if (batch === undefined) {
          expect(() => submit(turn(['$source:1']))).toThrow('Context source is unavailable')
          expect(s.commands.snapshot(id)).toEqual(before)
          submit({ posture: 'watching', behavior: [{ kind: 'speech', text: 'I will return.' }] })
          return
        }
        batches.push([...batch.sources])
        expect(() => submit(turn(['$source:0']))).toThrow('Unavailable local source')
        expect(() => submit(turn(['$source:2']))).toThrow('Unavailable local source')
        expect(() => submit(turn(['$source:1', batch.sources[0]!]))).toThrow('Duplicate source')
        expect(s.commands.snapshot(id)).toEqual(before)
        submit(turn(['$source:1']))
      },
    }, s.values, 1)
    try {
      await runtime.run(s.scope(id), 'a')
      await runtime.run(s.scope(id), 'a')
      expect(batches).toHaveLength(2)
      expect(batches[0]).not.toEqual(batches[1])
      expect(retentionOf(s.commands.snapshot(id), 'actor:a').notes.map(note => note.sourceIds)).toEqual(batches)
    } finally { await runtime.dispose() }
  })

  it('rejects speech from a consolidation attempt while keeping the accepted ordinary turn', async () => {
    const s = setup(); const id = s.create(); s.stage(id)
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async ({ context }) => ({ posture: 'silent', behavior: [
      { kind: 'speech', text: context.sections.some(section => section.id === 'consolidation') ? 'INVALID EXTRA SPEECH' : 'Keep my promise.' },
    ] })), s.values, 1)
    await expect(runtime.run(s.scope(id), 'a')).rejects.toThrow('only posture and context_update')
    expect(JSON.stringify(s.commands.snapshot(id))).not.toContain('INVALID EXTRA SPEECH')
    expect(s.commands.snapshot(id).entities.filter(item => item.key.collection === 'behavior')).toHaveLength(1)
    await runtime.dispose()
  })

  it.each(['pause', 'world-change'] as const)('rejects late consolidation after %s without losing its original evidence', async (interruption) => {
    const s = setup(); const id = s.create(); s.stage(id)
    new RetentionApplication(s.commands).review(s.scope(id), { operation: 'policy', owner: 'actor:a', activation: 'automatic' })
    let entered!: () => void; let release!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    const blocked = new Promise<void>((resolve) => { release = resolve })
    let calls = 0
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async ({ context }) => {
      calls++
      const batch = context.sections.find(section => section.id === 'consolidation')
      if (batch === undefined) return { posture: 'watching', behavior: [{ kind: 'speech', text: 'I will keep the key.' }] }
      entered(); await blocked
      return { posture: 'silent', context_update: [{ sourceIds: [...batch.sources], disposition: 'represented', reason: 'Remember the key.',
        changes: [{ operation: 'add', kind: 'promise', text: 'LATE SUMMARY', sourceIds: [...batch.sources] }] }] }
    }), s.values, 1)
    const scope = s.scope(id)
    const running = runtime.run(scope, 'a')
    expect(runtime.run(scope, 'a')).toBe(running)
    const rejected = expect(running).rejects.toThrow(interruption === 'pause' ? 'cancelled' : 'revision')
    await started
    if (interruption === 'pause') runtime.cancel(s.scope(id), 'Player stops consolidation')
    else s.world.observe(s.scope(id), { summary: 'A bell rings', content: 'A bell rings.', state: [],
      deliveries: [{ actorId: 'a', content: 'You hear a bell.', kind: 'observation', sourceRefs: [] }] })
    release(); await rejected
    const snapshot = s.commands.snapshot(id)
    expect(retentionOf(snapshot, 'actor:a').notes).toEqual([])
    expect(snapshot.entities.filter(item => item.key.collection === 'behavior')).toHaveLength(1)
    expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).text).toContain('I will keep the key.')
    expect(JSON.stringify(snapshot)).not.toContain('LATE SUMMARY')
    await expect(runtime.run(scope, 'a')).rejects.toThrow('no longer current')
    expect(calls).toBe(2)
    expect(s.commands.snapshot(id)).toEqual(snapshot)
    await runtime.dispose()
  })

  it.each(['missing', 'unexpected', 'duplicated'] as const)('reports %s consolidation sources without activating a partial summary', async (fault) => {
    const s = setup(); const id = s.create(); s.stage(id)
    const diagnostics = { missing: [] as string[], unexpected: [] as string[], duplicated: [] as string[] }
    new RetentionApplication(s.commands).review(s.scope(id), { operation: 'policy', owner: 'actor:a', activation: 'automatic' })
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async ({ context }) => {
      const batch = context.sections.find(section => section.id === 'consolidation')
      if (batch === undefined) return { posture: 'silent', behavior: [
        { kind: 'speech', text: 'I will keep the key.' }, { kind: 'speech', text: 'Only until tomorrow.' },
        { kind: 'speech', text: 'Ask for me at the desk.' },
      ] }
      const sourceIds = [...batch.sources]
      if (fault === 'missing') diagnostics.missing.push(...sourceIds.splice(1))
      if (fault === 'unexpected') {
        const extra = evidenceFor(s.commands.snapshot(id), 'a').find(item => !batch.sources.includes(item.id))!
        sourceIds.push(extra.id)
        diagnostics.unexpected.push(extra.id)
      }
      if (fault === 'duplicated') {
        sourceIds.push(batch.sources[0]!)
        diagnostics.duplicated.push(batch.sources[0]!)
      }
      return { posture: 'silent', context_update: sourceIds.map(sourceId => ({ sourceIds: [sourceId],
        disposition: 'represented', reason: 'An invalid batch.', changes: [{ operation: 'add', kind: 'promise',
          text: 'I will keep the key forever.', sourceIds: [sourceId] }] })) }
    }), s.values, 2)
    const failure = await runtime.run(s.scope(id), 'a').catch((error: unknown) => error)
    expect(diagnostics[fault].length).toBeGreaterThan(0)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain(JSON.stringify(diagnostics))
    expect((failure as Error).message).toContain('No changes were submitted. Correct and resend the complete consolidation.')
    await expect((failure as Error).message + '\n').toMatchFileSnapshot(`./expected/memory-consolidation-${fault}.txt`)
    expect(retentionOf(s.commands.snapshot(id), 'actor:a').notes).toEqual([])
    expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).text).toContain('Only until tomorrow.')
    await runtime.dispose()
  })

  it('keeps an episode brief in context and retrieves its private details by retained reference', async () => {
    const s = setup(); const id = s.create(); s.stage(id)
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'waiting',
      behavior: [{ kind: 'speech', text: 'I promise to return.' }], context_update: [{ sourceIds: ['$behavior:0'],
        disposition: 'represented', reason: 'Remember my commitment.', changes: [{ operation: 'add', kind: 'promise',
          text: 'I owe them a return visit.', sourceIds: ['$behavior:0'], episode: {
            topic: 'Return visit', experience: 'I promised to return at the doorway.',
            interpretation: 'PRIVATE-INTERPRETATION: I think they trust me.', impact: 'I feel responsible.', unresolved: ['When can I return?'],
          } }] }] })), s.values)
    await runtime.run(s.scope(id), 'a'); await runtime.dispose()
    const queries = new RetentionQueries(s.commands, 10, 2000)
    const pending = queries.review(id, 'actor:a')
    const proposal = pending.retention.proposals[0]!
    expect(queries.recall(id, 'actor:a', { query: 'PRIVATE-INTERPRETATION', offset: 0, limit: 10 }).entries).toEqual([])
    new RetentionApplication(s.commands).review(s.scope(id), { owner: 'actor:a', operation: 'review',
      reviews: [{ id: proposal.id, revision: proposal.revision, approve: true }] })
    const note = queries.review(id, 'actor:a').retention.notes[0]!
    const ref = `retention:${note.id}:r${note.revision}`
    const context = s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).text
    expect(context).toContain('I owe them a return visit.')
    expect(context).toContain(ref)
    expect(context).not.toContain('PRIVATE-INTERPRETATION')
    const projected: unknown[] = []
    appendRetention(s.commands.snapshot(id), 'actor:a', (_label, value) => { projected.push(value); return true })
    const brief = projected.find(value => typeof value === 'object' && value !== null && 'id' in value && value.id === note.id)
    expect(brief).toMatchObject({ id: note.id, revision: note.revision, kind: 'promise', status: 'active',
      text: note.text, unresolvedCount: note.episode!.unresolved.length, detailReference: ref })
    for (const field of ['scope', 'author', 'sourceIds', 'episode']) expect(brief).not.toHaveProperty(field)
    await expect(JSON.stringify(brief, null, 2) + '\n').toMatchFileSnapshot('./expected/compact-episode-brief.json')
    const details = queries.recall(id, 'actor:a', { query: ref, offset: 0, limit: 10 })
    expect(details.entries[0]?.text).toContain('PRIVATE-INTERPRETATION')
    expect(details.entries[0]?.text).toContain(proposal.unit.sourceIds[0])
    expect(JSON.parse(details.entries[0]!.text)).toMatchObject({ scope: 'actor:a', author: 'actor:a', sourceIds: note.sourceIds })
    expect(queries.recall(id, 'actor:b', { query: ref, offset: 0, limit: 10 }).entries).toEqual([])
    expect(queries.recall(id, 'director', { query: ref, offset: 0, limit: 10 }).entries).toEqual([])
    expect(queries.recall(id, 'actor:a', { query: 'I promise to return.', offset: 0, limit: 10 }).entries).toHaveLength(1)
    const archive = new NarrativeArchives(s.store, s.values, { verify: () => {} })
    const imported = archive.import(archive.export(id, []), s.values.id() as CommandId)
    expect(queries.recall(imported.instance.id, 'actor:a', { query: ref, offset: 0, limit: 10 }).entries).toEqual(details.entries)
    new RetentionApplication(s.commands).review(s.scope(imported.instance.id), {
      operation: 'correct', owner: 'actor:a', id: note.id, revision: note.revision,
      content: { text: 'I have returned.', episode: { ...note.episode!, unresolved: [] } },
    })
    const correctedBriefs: unknown[] = []
    appendRetention(s.commands.snapshot(imported.instance.id), 'actor:a', (_label, value) => { correctedBriefs.push(value); return true })
    expect(correctedBriefs).toContainEqual(expect.objectContaining({ id: note.id, revision: note.revision + 1, unresolvedCount: 0 }))
    expect(queries.recall(id, 'actor:a', { query: ref, offset: 0, limit: 10 }).entries).toEqual(details.entries)
    const review = new RetentionApplication(s.commands)
    const before = s.commands.snapshot(id)
    expect(() => review.review(s.scope(id), { operation: 'revoke', owner: 'actor:b', id: note.id, revision: note.revision })).toThrow('revision conflict')
    expect(s.commands.snapshot(id)).toEqual(before)
    const scope = s.scope(id)
    const revoke = { operation: 'revoke' as const, owner: 'actor:a', id: note.id, revision: note.revision }
    const receipt = review.review(scope, revoke)
    expect(review.review(scope, revoke)).toEqual(receipt)
    expect(() => review.review(s.scope(id), revoke)).toThrow('revision conflict')
    const restored = s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).text
    expect(restored).toContain('I promise to return.')
    expect(restored).not.toContain('I owe them a return visit.')
    expect(queries.recall(id, 'actor:a', { query: ref, offset: 0, limit: 10 }).entries).toEqual([])
    expect(queries.recall(id, 'actor:a', { query: ref, offset: 0, limit: 10 }, before.instance.revision).entries).toEqual(details.entries)
    const revokedImport = archive.import(archive.export(id, []), s.values.id() as CommandId)
    expect(queries.review(revokedImport.instance.id, 'actor:a').retention.notes[0]).toMatchObject({ status: 'archived', episode: note.episode })
  })

  const unit = (source: string, text = 'APPROVED-SHORT-NOTE'): ContextUpdateUnit => ({ sourceIds: [source], disposition: 'represented',
    reason: 'Keep the stated promise as a claim.', changes: [{ operation: 'add', kind: 'claim', text, sourceIds: [source] }] })
  const propose = async (s: ReturnType<typeof setup>, id: InstanceId) => {
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'waiting',
      behavior: [{ kind: 'speech', text: 'I will wait until midnight.' }], context_update: [unit('$behavior:0')] })), s.values)
    const scope = s.scope(id)
    const result = await runtime.run(scope, 'a')
    expect(await runtime.run(scope, 'a')).toEqual(result)
    await runtime.dispose()
    return result
  }

  it('includes all retained briefs and recalls source details privately', async () => {
    const s = setup(); const id = s.create(); s.stage(id)
    new RetentionApplication(s.commands).review(s.scope(id), { operation: 'policy', owner: 'actor:a', activation: 'automatic' })
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'waiting',
      behavior: [{ kind: 'speech', text: 'I saw the silver key.' }], context_update: [{ sourceIds: ['$behavior:0'],
        disposition: 'represented', reason: 'Keep my impressions.', changes: [
          { operation: 'add', kind: 'clue', text: 'The silver key belongs to my sister.', sourceIds: ['$behavior:0'] },
          { operation: 'add', kind: 'claim', text: 'UNRELATED: I prefer autumn walks.', sourceIds: ['$behavior:0'] },
        ] }] })), s.values)
    await runtime.run(s.scope(id), 'a'); await runtime.dispose()
    const queries = new PerspectiveQueries(s.commands, 6000, value => value, 40)
    const context = queries.actorContext({ instanceId: id, actorId: 'a', query: '' })
    expect(context.text).toContain('The silver key belongs to my sister.')
    expect(context.text).toContain('UNRELATED')
    expect(context.text).not.toContain('I saw the silver key.')
    const recall = new RetentionQueries(s.commands, 10, 2000)
    expect(recall.recall(id, 'actor:a', { query: '', offset: 0, limit: 1 }).entries[0]?.text).toContain('UNRELATED')
    const result = recall.recall(id, 'actor:a', { query: 'UNRELATED', offset: 0, limit: 10 })
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.kind).toBe('context-summary')
    expect(recall.recall(id, 'actor:b', { query: 'UNRELATED', offset: 0, limit: 10 }).entries).toEqual([])
    expect(queries.actorContext({ instanceId: id, actorId: 'a', query: 'autumn walks' }).text).toContain('UNRELATED')
    const original = retentionOf(s.commands.snapshot(id), 'actor:a').notes[0]!.sourceIds[0]!
    expect(recall.recall(id, 'actor:a', { query: original, offset: 0, limit: 1 }).entries[0]?.id).toBe(original)
    const beforeCorrection = s.commands.snapshot(id)
    const firstNote = retentionOf(beforeCorrection, 'actor:a').notes[0]!
    new RetentionApplication(s.commands).review(s.scope(id), { operation: 'correct', owner: 'actor:a',
      id: firstNote.id, revision: firstNote.revision, content: { text: 'I do not know who owns the silver key.' } })
    const sourceRevision = evidenceFor(beforeCorrection, 'a').find(item => item.id === original)!.revision
    const projected: unknown[] = []
    appendRetention(s.commands.snapshot(id), 'actor:a', (_label, value) => { projected.push(value); return true })
    expect(projected).toContainEqual(expect.objectContaining({ id: firstNote.id, revision: firstNote.revision + 1,
      sourceRevisionRange: { from: sourceRevision, to: sourceRevision } }))
    await expect(JSON.stringify(projected, null, 2) + '\n').toMatchFileSnapshot('./expected/memory-source-revision-range.json')
    const recalled = recall.recall(id, 'actor:a', {
      query: `retention:${firstNote.id}:r${firstNote.revision + 1}`, offset: 0, limit: 1,
    }).entries[0]!
    expect(JSON.parse(recalled.text)).toMatchObject({ revision: firstNote.revision + 1,
      sourceIds: firstNote.sourceIds, scope: 'actor:a', author: 'actor:a',
      sourceRevisionRange: { from: sourceRevision, to: sourceRevision } })
    const historical = recall.recall(id, 'actor:a', {
      query: `retention:${firstNote.id}:r${firstNote.revision}`, offset: 0, limit: 1,
    }, beforeCorrection.instance.revision).entries[0]!
    expect(JSON.parse(historical.text)).toMatchObject({ revision: firstNote.revision, text: firstNote.text,
      sourceRevisionRange: { from: sourceRevision, to: sourceRevision } })
    expect(recall.recall(id, 'actor:b', { query: recalled.id, offset: 0, limit: 1 }).entries).toEqual([])
    expect(recall.recall(id, 'actor:a', { query: '', offset: 0, limit: 1 }).entries[0]?.text).toContain('I do not know')
    expect(recall.recall(id, 'actor:a', { query: '', offset: 0, limit: 1 }, beforeCorrection.instance.revision).entries[0]?.text).toContain('UNRELATED')
    new RetentionApplication(s.commands).review(s.scope(id), { operation: 'pin', owner: 'actor:a', sourceId: original, pinned: true })
    const pinned = queries.actorContext({ instanceId: id, actorId: 'a', query: 'autumn walks' }).text
    expect(pinned).toContain('PINNED ORIGINAL')
    expect(pinned).toContain('I saw the silver key.')
    expect(recall.recall(id, 'actor:a', { query: 'I saw the silver key.', offset: 0, limit: 10 }).entries.length).toBeGreaterThan(0)
  })

  it('corrects effective memory without changing its evidence, policy or historical version', async () => {
    const s = setup(); const id = s.create(); s.stage(id)
    const review = new RetentionApplication(s.commands)
    const queries = new RetentionQueries(s.commands, 10, 2000)
    review.review(s.scope(id), { operation: 'policy', owner: 'actor:a', activation: 'automatic' })
    await propose(s, id)
    const before = queries.review(id, 'actor:a')
    const note = before.retention.notes[0]!
    const input = { operation: 'correct' as const, owner: 'actor:a', id: note.id, revision: note.revision,
      content: { text: 'I agreed to wait, but only until midnight.' } }
    expect(() => review.review(s.scope(id), { ...input, owner: 'actor:b' })).toThrow('revision conflict')
    const scope = s.scope(id)
    const receipt = review.review(scope, input)
    expect(review.review(scope, input)).toEqual(receipt)
    expect(() => review.review(s.scope(id), input)).toThrow('revision conflict')
    const after = queries.review(id, 'actor:a')
    expect(after.retention.activation).toBe('automatic')
    expect(after.retention.notes[0]).toEqual({ ...note, revision: note.revision + 1, text: input.content.text })
    expect(after.retention.proposals.at(-1)).toMatchObject({ status: 'approved', retainedNoteIds: [note.id] })
    expect(after.retention.proposals.at(-1)?.activation).not.toBe('automatic')
    expect(queries.review(id, 'actor:a', before.revision)).toEqual(before)
    expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).text).toContain(input.content.text)
    expect(s.queries.actorContext({ instanceId: id, actorId: 'b', query: '' }).text).not.toContain(input.content.text)
    const archive = new NarrativeArchives(s.store, s.values, { verify: () => {} })
    const imported = archive.import(archive.export(id, []), s.values.id() as CommandId)
    expect(queries.review(imported.instance.id, 'actor:a').retention).toEqual(after.retention)
  })

  it('automatically activates only new units under the saved owner policy and preserves review mode', async () => {
    const s = setup(); const id = s.create(); s.stage(id)
    const review = new RetentionApplication(s.commands)
    const queries = new RetentionQueries(s.commands, 10, 2000)
    await propose(s, id)
    review.review(s.scope(id), { operation: 'policy', owner: 'actor:a', activation: 'automatic' })
    expect(queries.review(id, 'actor:a').retention.proposals[0]?.status).toBe('proposed')
    expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).text).toContain('MEMORY ACTIVATION POLICY')
    expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).text).not.toContain('USING RETAINED NOTES')
    expect(s.queries.actorContext({ instanceId: id, actorId: 'b', query: '' }).text).not.toContain('MEMORY ACTIVATION POLICY')
    await propose(s, id)
    const active = queries.review(id, 'actor:a').retention
    expect(active.proposals.map(item => item.status)).toEqual(['proposed', 'approved'])
    expect(active.proposals[1]?.activation).toBe('automatic')
    expect(active.notes).toHaveLength(1)
    expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).text).toContain('AUTOMATIC CONTEXT NOTE')
    expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).text).toContain('Active means retained, not proof that every described condition or obligation still applies.')
    expect(s.queries.actorContext({ instanceId: id, actorId: 'b', query: '' }).text).not.toContain('USING RETAINED NOTES')
    review.review(s.scope(id), { operation: 'policy', owner: 'actor:a', activation: 'review' })
    await propose(s, id)
    expect(queries.review(id, 'actor:a').retention.proposals.map(item => item.status)).toEqual(['proposed', 'approved', 'proposed'])
    const archive = new NarrativeArchives(s.store, s.values, { verify: () => {} })
    const imported = archive.import(archive.export(id, []), s.values.id() as CommandId)
    expect(queries.review(imported.instance.id, 'actor:a').retention).toEqual(queries.review(id, 'actor:a').retention)
  })

  it('reviews without an Actor, survives export/reimport and restores pending history by compensation', async () => {
    const s = setup(); const a = s.create(); const b = s.create(); s.stage(a)
    const review = new RetentionApplication(s.commands)
    const queries = new RetentionQueries(s.commands, 10, 2000)
    await propose(s, a)
    const pending = queries.review(a, 'actor:a')
    const proposal = pending.retention.proposals[0]!
    expect(pending.retention.notes).toEqual([])
    expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).text).not.toContain('APPROVED-SHORT-NOTE')
    s.commands.checkpoint(a, 'pending-note', pending.revision)
    const scope = s.scope(a)
    const input = { owner: 'actor:a', operation: 'review' as const, reviews: [{ id: proposal.id, revision: proposal.revision, approve: true }] }
    const accepted = review.review(scope, input)
    expect(review.review(scope, input)).toEqual(accepted)
    expect(() => review.review(scope, { ...input, reviews: [{ ...input.reviews[0]!, approve: false }] })).toThrow()
    expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).text).toContain('APPROVED-SHORT-NOTE')
    expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).text).not.toContain('I will wait until midnight.')
    expect(queries.recall(a, 'actor:a', { query: 'midnight', offset: 0, limit: 1 }).total).toBe(1)
    expect(s.queries.actorContext({ instanceId: a, actorId: 'b', query: '' }).text).not.toContain('APPROVED-SHORT-NOTE')
    expect(queries.review(b, 'actor:a').retention.notes).toEqual([])
    expect(queries.review(a, 'actor:a', pending.revision)).toEqual(pending)
    expect(() => review.review(s.scope(a), input)).toThrow('revision conflict')
    const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
    const original = archives.export(a, [])
    const imported = archives.import(original, s.values.id() as CommandId)
    expect(s.queries.actorContext({ instanceId: imported.instance.id, actorId: 'a', query: '' }).text).toContain('APPROVED-SHORT-NOTE')
    const twice = archives.import(archives.export(imported.instance.id, []), s.values.id() as CommandId)
    expect(queries.review(twice.instance.id, 'actor:a').retention.notes).toEqual(queries.review(a, 'actor:a').retention.notes)
    const restore = s.scope(a)
    s.commands.restore({ ...restore, kind: 'restore', input: { targetRevision: pending.revision, reason: 'Review again' } }, pending.revision, 'Review again')
    expect(queries.review(a, 'actor:a').retention).toEqual(pending.retention)
    expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).text).not.toContain('APPROVED-SHORT-NOTE')
    expect(retentionOf(s.commands.replay(a, accepted.revision), 'actor:a').notes).toHaveLength(1)
  })

  it('rejects invisible sources with the whole turn, forged imported approvals, and non-player review', async () => {
    const s = setup(); const a = s.create(); s.stage(a)
    s.world.observe(s.scope(a), { summary: 'Private delivery', content: 'A sealed message arrives.', state: [],
      deliveries: [{ actorId: 'b', kind: 'report', content: 'B-PRIVATE-REPORT', sourceRefs: [] }] })
    const secret = evidenceFor(s.commands.snapshot(a), 'b')[0]!.id
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'waiting',
      behavior: [{ kind: 'speech', text: 'REJECTED-TURN' }], memories: [{ content: 'REJECTED-MEMORY' }], context_update: [unit(secret)] })), s.values)
    await expect(runtime.run(s.scope(a), 'a')).rejects.toThrow('unavailable')
    expect(JSON.stringify(s.commands.snapshot(a))).not.toContain('REJECTED-')
    await runtime.dispose(); await propose(s, a)
    const review = new RetentionApplication(s.commands)
    const pending = retentionOf(s.commands.snapshot(a), 'actor:a')
    const proposal = pending.proposals[0]!
    expect(() => review.review(s.scope(a, { kind: 'director', epoch: 0, attempt: 'fake' }), {
      operation: 'review', owner: 'actor:a', reviews: [{ id: proposal.id, revision: 1, approve: true }] })).toThrow('Only the player')
    const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
    const forged = structuredClone(archives.export(a, []))
    const event = forged.commits.flatMap(commit => commit.command.principal.kind === 'actor' ? commit.events : [])
      .find(event => event.type === 'entity.replaced' && event.key.collection === 'retention')!
    if (event.type !== 'entity.replaced') throw new Error('Missing retention event')
    const state = storyContextRetentionSchema.parse(event.value)
    state.proposals[0]!.status = 'approved'
    event.value = json(state)
    expect(() => archives.import(forged, s.values.id() as CommandId)).toThrow('cannot approve')
    const foreign = structuredClone(archives.export(a, []))
    const changed = foreign.commits.flatMap(commit => commit.events).find(event => event.type === 'entity.replaced' && event.key.collection === 'retention')!
    if (changed.type !== 'entity.replaced') throw new Error('Missing retention event')
    changed.key.id = 'actor:b'
    expect(() => archives.import(foreign, s.values.id() as CommandId)).toThrow('write authority')
  })

  it('keeps proposal edits and multi-review conflicts atomic and retains pinned originals in full', async () => {
    const s = setup(); const a = s.create(); s.stage(a); await propose(s, a)
    const review = new RetentionApplication(s.commands)
    const proposal = retentionOf(s.commands.snapshot(a), 'actor:a').proposals[0]!
    const before = s.commands.snapshot(a)
    expect(() => review.review(s.scope(a), { operation: 'review', owner: 'actor:a', reviews: [
      { id: proposal.id, revision: 1, approve: true }, { id: 'unavailable', revision: 1, approve: true },
    ] })).toThrow('revision conflict')
    expect(s.commands.snapshot(a)).toEqual(before)
    review.review(s.scope(a), { operation: 'edit', owner: 'actor:a', id: proposal.id, revision: 1, unit: unit(proposal.unit.sourceIds[0]!, 'PLAYER-EDITED-NOTE') })
    expect(() => review.review(s.scope(a), { operation: 'review', owner: 'actor:a', reviews: [{ id: proposal.id, revision: 1, approve: true }] })).toThrow('revision conflict')
    review.review(s.scope(a), { operation: 'review', owner: 'actor:a', reviews: [{ id: proposal.id, revision: 2, approve: true }] })
    review.review(s.scope(a), { operation: 'pin', owner: 'actor:a', sourceId: proposal.unit.sourceIds[0]!, pinned: true })
    expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).text).toContain('[PINNED ORIGINAL]')
    expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).text).toContain('PLAYER-EDITED-NOTE')
    s.world.observe(s.scope(a), { summary: 'Long evidence', content: 'A long public announcement.', state: [],
      deliveries: [{ actorId: 'a', kind: 'observation', content: 'x'.repeat(7000), sourceRefs: [] }] })
    const long = evidenceFor(s.commands.snapshot(a), 'a').find(item => item.content.length === 7000)!
    review.review(s.scope(a), { operation: 'pin', owner: 'actor:a', sourceId: long.id, pinned: true })
    expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).text).toContain('x'.repeat(7000))
  })

  it('filters before bounded recall and preserves request revision and cancellation fences', async () => {
    const s = setup(); const a = s.create(); const b = s.create(); s.stage(a)
    for (let index = 0; index < 55; index++) s.world.observe(s.scope(a), { summary: 'Separate reports', content: `WORLD-SECRET-${index}`, state: [],
      deliveries: [{ actorId: 'a', kind: 'report', content: `A-REPORT-${index}`, sourceRefs: [] },
        { actorId: 'b', kind: 'report', content: `B-SECRET-${index}`, sourceRefs: [] }] })
    const queries = new RetentionQueries(s.commands, 10, 30)
    const page = queries.recall(a, 'actor:a', { query: '', offset: 0, limit: 10 })
    expect(page.total).toBe(55)
    expect(page.entries.reduce((size, item) => size + item.text.length, 0)).toBeLessThanOrEqual(30)
    expect(page.nextOffset).toBe(page.entries.length - 1)
    expect(page.continuation?.sourceId).toBe(page.entries.at(-1)?.id)
    expect(JSON.stringify(page)).not.toContain('SECRET')
    expect(queries.recall(b, 'actor:a', { query: '', offset: 0, limit: 10 }).entries).toEqual([])
    expect(queries.recall(a, 'actor:a', { query: 'B-SECRET', offset: 0, limit: 10 }).total).toBe(0)
    expect(() => queries.recall(a, 'actor:a', { query: '', offset: 0, limit: 11 })).toThrow('bounds')
    let recall!: Parameters<ActorExecutor['execute']>[3]
    let release!: () => void
    let frozen = 0
    const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, { execute: async (request, _signal, submit, query) => {
      recall = query; frozen = request.context.revision
      expect(query({ query: '', offset: 0, limit: 1 }).revision).toBe(frozen)
      await new Promise<void>((resolve) => { release = resolve })
      submit(silence())
    } }, s.values)
    const pending = runtime.run(s.scope(a), 'a')
    s.world.observe(s.scope(a), { summary: 'Later report', content: 'Later.', state: [],
      deliveries: [{ actorId: 'a', kind: 'report', content: 'FUTURE-REPORT', sourceRefs: [] }] })
    expect(recall({ query: 'FUTURE-REPORT', offset: 0, limit: 1 })).toMatchObject({ revision: frozen, total: 0 })
    runtime.cancel(s.scope(a), 'Stop before recall')
    expect(() => recall({ query: '', offset: 0, limit: 1 })).toThrow('no longer current')
    release(); await expect(pending).rejects.toThrow('cancelled'); await runtime.dispose()
  })
})


it('separates a character named director from director recall and player-approved notes', async () => {
  const s = setup(['director', 'b', 'c']); const a = s.create(); s.stage(a, ['director', 'b'])
  s.world.observe(s.scope(a), { summary: 'Settled fact', content: 'DIRECTOR-WORLD-FACT', state: [], deliveries: [] })
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'silent',
    memories: [{ content: 'CHARACTER-PRIVATE-RECOLLECTION' }], behavior: [] })), s.values)
  await runtime.run(s.scope(a), 'director')
  const queries = new RetentionQueries(s.commands, 10, 10000)
  expect(JSON.stringify(queries.recall(a, 'actor:director', { query: '', offset: 0, limit: 10 }))).toContain('CHARACTER-PRIVATE-RECOLLECTION')
  expect(JSON.stringify(queries.recall(a, 'actor:director', { query: '', offset: 0, limit: 10 }))).not.toContain('DIRECTOR-WORLD-FACT')
  expect(JSON.stringify(queries.recall(a, 'director', { query: '', offset: 0, limit: 10 }))).not.toContain('CHARACTER-PRIVATE-RECOLLECTION')
  const d = directing(s, { execute: async (_request, _signal, command) => {
    const recall = command('recall-fact', { operation: 'recall', input: { query: 'DIRECTOR-WORLD-FACT', offset: 0, limit: 1 } })
    const factId = (recall.result as { entries: { id: string }[] }).entries[0]!.id
    command('propose-fact', { operation: 'context-update', input: [{ sourceIds: [factId], disposition: 'represented', reason: 'Keep the settled fact.',
      changes: [{ operation: 'add', kind: 'fact', text: 'DIRECTOR-RETAINED-FACT', sourceIds: [factId] }] }] })
    command('finish', { operation: 'finish', actors: [], advanceDiscussion: false })
  } })
  await d.director.run(s.scope(a), '')
  expect(d.directorQueries.context({ instanceId: a, instruction: '' }).text).not.toContain('DIRECTOR-RETAINED-FACT')
  const proposal = queries.review(a, 'director').retention.proposals[0]!
  new RetentionApplication(s.commands).review(s.scope(a), { owner: 'director', operation: 'review', reviews: [{ id: proposal.id, revision: 1, approve: true }] })
  expect(d.directorQueries.context({ instanceId: a, instruction: '' }).text).toContain('DIRECTOR-RETAINED-FACT')
  expect(s.queries.actorContext({ instanceId: a, actorId: 'director', query: '' }).text).not.toContain('DIRECTOR-RETAINED-FACT')
  const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
  const imported = archives.import(archives.export(a, []), s.values.id() as CommandId)
  expect(queries.review(imported.instance.id, 'director').retention.notes).toHaveLength(1)
  const forged = structuredClone(archives.export(a, []))
  const change = forged.commits.flatMap(commit => commit.command.kind === 'retention.propose' ? commit.events : [])
    .find(event => event.type === 'entity.replaced' && event.key.collection === 'retention')!
  if (change.type !== 'entity.replaced') throw new Error('Missing retention event')
  const state = storyContextRetentionSchema.parse(change.value); state.proposals[0]!.status = 'approved'; change.value = json(state)
  expect(() => archives.import(forged, s.values.id() as CommandId)).toThrow('Director history cannot approve')
  await runtime.dispose(); await d.director.dispose(); await d.runtime.dispose()
})

it('does not resurrect an explicitly forgotten memory through an approved summary or pin', async () => {
  const s = setup(); const a = s.create(); s.stage(a)
  s.cognition.revise(s.scope(a), 'a', { state: [], knowledge: [], lifecycle: [memoryChange('old', 'FORGOTTEN-ORIGINAL')] })
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'silent', behavior: [],
    context_update: [{ sourceIds: ['memory:old'], disposition: 'represented', reason: 'Keep this memory.',
      changes: [{ operation: 'add', kind: 'claim', text: 'FORGOTTEN-SUMMARY', sourceIds: ['memory:old'] }] }] })), s.values)
  await runtime.run(s.scope(a), 'a'); await runtime.dispose()
  const review = new RetentionApplication(s.commands)
  const proposal = retentionOf(s.commands.snapshot(a), 'actor:a').proposals[0]!
  review.review(s.scope(a), { owner: 'actor:a', operation: 'review', reviews: [{ id: proposal.id, revision: 1, approve: true }] })
  review.review(s.scope(a), { owner: 'actor:a', operation: 'pin', sourceId: 'memory:old', pinned: true })
  expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).text).toContain('FORGOTTEN-SUMMARY')
  const known = s.commands.snapshot(a).instance.revision
  s.cognition.revise(s.scope(a), 'a', { state: [], knowledge: [], lifecycle: [characterLifecycleChangeSchema.parse({
    type: 'memory.forgotten', data: { version: 1, actorId: 'a', memoryId: 'old', reason: 'Explicit amnesia' },
  })] })
  expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).text).not.toContain('FORGOTTEN-')
  expect(new RetentionQueries(s.commands, 10, 5000).recall(a, 'actor:a', { query: 'FORGOTTEN-', offset: 0, limit: 10 }).total).toBe(0)
  const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
  const imported = archives.import(archives.export(a, []), s.values.id() as CommandId)
  expect(s.queries.actorContext({ instanceId: imported.instance.id, actorId: 'a', query: '' }).text).not.toContain('FORGOTTEN-')
  const scope = s.scope(a)
  s.commands.restore({ ...scope, kind: 'restore', input: { targetRevision: known, reason: 'Recall restored' } }, known, 'Recall restored')
  expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).text).toContain('FORGOTTEN-SUMMARY')
})


it('removes all revisions of forgotten knowledge from recall and refuses them as new inference sources', async () => {
  const s = setup(); const a = s.create(); s.stage(a)
  const initial = knowledgeChangeSchema.parse({ id: 'private-belief', expectedRevision: 0, kind: 'belief', attitude: 'believed',
    acquisition: 'authored', entityRefs: [], sourceRefs: [], status: 'active', reason: 'Player recollection', text: 'FORGOTTEN-BELIEF' })
  s.cognition.revise(s.scope(a), 'a', { state: [], lifecycle: [], knowledge: [initial] })
  const known = s.commands.snapshot(a).instance.revision
  s.cognition.revise(s.scope(a), 'a', { state: [], lifecycle: [], knowledge: [{ ...initial, expectedRevision: 1, status: 'forgotten' }] })
  const queries = new RetentionQueries(s.commands, 10, 5000)
  expect(queries.recall(a, 'actor:a', { query: 'FORGOTTEN-BELIEF', offset: 0, limit: 10 }).total).toBe(0)
  expect(queries.recall(a, 'actor:a', { query: 'FORGOTTEN-BELIEF', offset: 0, limit: 10 }, known).total).toBe(1)
  const runtime = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'silent', behavior: [],
    knowledge_changes: [{ ...initial, id: 'new-inference', acquisition: 'inferred', sourceRefs: ['knowledge:private-belief:r1'] }] })), s.values)
  await expect(runtime.run(s.scope(a), 'a')).rejects.toThrow('unavailable')
  expect(knowledgeOf(s.commands.snapshot(a), 'a').entries).toHaveLength(1)
  await runtime.dispose()
})


it('repairs only shipped recipe defects explicitly and renders language instructions for both perspectives', () => {
  const s = setup(); const id = s.create(); s.stage(id)
  const configuration = new ConfigurationApplication(s.commands)
  const initial = recipeOf(s.commands.snapshot(id))
  for (const side of ['director', 'actor'] as const) {
    expect(initial[side].at(-1)).toMatchObject({ id: 'reasoning-mode', role: 'user' })
    expect(initial[side].filter(section => section.role === 'user').map(section => section.id))
      .toEqual(side === 'director' ? ['player-guidance', 'reasoning-mode'] : ['reasoning-mode'])
  }
  const obsolete = { ...initial, actor: initial.actor.map(section => ({ ...section, role: 'user' as const })) }
  obsolete.actor.push({ id: 'custom:keep', role: 'user', enabled: false, title: 'Keep', content: 'User-owned reference' })
  configuration.setRecipe(s.scope(id), obsolete)
  const before = s.commands.snapshot(id)
  expect(recipeOf(before)).toMatchObject({ actor: obsolete.actor })
  const repaired = repairContextRecipe(recipeOf(before))
  expect(repaired.actor.find(section => section.id === 'custom:keep')).toEqual(obsolete.actor.at(-1))
  expect(repaired.actor.find(section => section.id === 'identity')?.role).toBe('system')
  expect(s.commands.snapshot(id)).toEqual(before)
  configuration.setRecipe(s.scope(id), repaired)
  expect(recipeOf(s.commands.snapshot(id)).revision).toBe(recipeOf(before).revision + 1)
  const mixed = { ...initial, actor: initial.actor.map(section => section.id === 'identity' ? { ...section, role: 'assistant' as const } : section) }
  expect(repairContextRecipe(mixed)).toEqual(mixed)
  configuration.setSettings(s.scope(id), { overrides: { reasoningLanguage: '简体中文' }, reason: 'Language regression' })
  const director = new DirectorQueries(s.commands, 16000, 100)
  const views = () => [director.context({ instanceId: id, instruction: 'Continue' }), s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' })]
  for (const view of views()) {
    const languageSection = view.sections.find(section => section.id === 'reasoning-language')
    expect(languageSection?.role).toBe('system')
    expect(languageSection?.content).toContain('所有私有思考、分析、计划与工具调用前的推理均使用简体中文')
  }
  const recipe = recipeOf(s.commands.snapshot(id))
  configuration.setRecipe(s.scope(id), { ...recipe, director: recipe.director.map(section => section.id === 'reasoning-language' ? { ...section, enabled: false } : section) })
  expect(views()[0]?.text).not.toContain('【推理语言要求】')
  expect(views()[1]?.text).toContain('【推理语言要求】')
})

it('keeps context recipes instance-scoped and replays exact source order, roles and custom references', () => {
  const s = setup(); const a = s.create(); const b = s.create(); s.stage(a)
  const configuration = new ConfigurationApplication(s.commands)
  const before = s.commands.snapshot(a)
  const initial = recipeOf(before)
  const actor = [...initial.actor].reverse().map(section => section.id === 'style' ? { ...section, role: 'system' as const } : section)
  actor.push({ id: 'custom:performance-example', enabled: true, role: 'assistant', title: 'A reference', content: 'EXAMPLE-ONLY: Tomorrow, perhaps.' })
  const command = s.scope(a)
  const input = { ...initial, actor }
  const accepted = configuration.setRecipe(command, input)
  expect(configuration.setRecipe(command, input)).toEqual(accepted)
  const preview = s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' })
  expect(preview.sections.at(-1)).toMatchObject({ role: 'assistant', id: 'custom:performance-example' })
  expect(preview.text).toContain('AUTHOR REFERENCE — not lived history')
  expect(preview.text).toContain('EXAMPLE-ONLY')
  expect(preview.sections.find(section => section.id === 'style')?.role).toBe('system')
  expect(s.queries.actorContext({ instanceId: b, actorId: 'a', query: '' }).text).not.toContain('EXAMPLE-ONLY')
  expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '', revision: before.instance.revision }).text).not.toContain('EXAMPLE-ONLY')
  expect(() => configuration.setRecipe(s.scope(a), initial)).toThrow('revision changed')
  const disabled = { ...recipeOf(s.commands.snapshot(a)), actor: actor.map(section => section.id === 'identity' ? { ...section, enabled: false } : section) }
  configuration.setRecipe(s.scope(a), disabled)
  expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).sections.some(section => section.id === 'identity')).toBe(false)
  expect(s.queries.actorContext({ instanceId: b, actorId: 'a', query: '' }).sections.some(section => section.id === 'identity')).toBe(true)
  const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
  const imported = archives.import(archives.export(a, []), s.values.id() as CommandId)
  expect(s.queries.actorContext({ instanceId: imported.instance.id, actorId: 'a', query: '' }).sections)
    .toEqual(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).sections)
  const scope = s.scope(a)
  s.commands.restore({ ...scope, kind: 'restore', input: { targetRevision: before.instance.revision, reason: 'Restore recipe' } }, before.instance.revision, 'Restore recipe')
  expect(recipeOf(s.commands.snapshot(a))).toEqual(initial)
})

it('saves cache ordering explicitly without changing selected actor context or historical replay', () => {
  const s = setup(); const id = s.create(); s.stage(id)
  const configuration = new ConfigurationApplication(s.commands)
  const initial = recipeOf(s.commands.snapshot(id))
  configuration.setRecipe(s.scope(id), { ...initial, actor: [...initial.actor].reverse() })
  const revision = s.commands.snapshot(id).instance.revision
  const request = { instanceId: id, actorId: 'a', query: '' }
  const before = s.queries.actorContext(request)
  const oldRecipe = recipeOf(s.commands.snapshot(id))
  configuration.setRecipe(s.scope(id), optimizeActorContextRecipe(oldRecipe))
  const after = s.queries.actorContext(request)
  expect(after.sections.map(item => JSON.stringify(item)).sort()).toEqual(before.sections.map(item => JSON.stringify(item)).sort())
  expect(after.sections.map(item => item.id)).not.toEqual(before.sections.map(item => item.id))
  expect(s.queries.actorContext({ ...request, revision }).sections).toEqual(before.sections)
  expect(recipeOf(s.commands.snapshot(id)).revision).toBe(oldRecipe.revision + 1)
  expect(() => configuration.setRecipe(s.scope(id), optimizeActorContextRecipe(oldRecipe))).toThrow('revision changed')
})

it('exposes inherited creative rules, saves exact edits and disables them without a fallback or cross-instance writes', () => {
  const s = setup(); const id = s.create(); const other = s.create(); s.stage(id)
  const configuration = new ConfigurationApplication(s.commands)
  const initial = recipeOf(s.commands.snapshot(id))
  configuration.setRecipe(s.scope(id), { ...initial, actor: initial.actor.filter(item => item.id !== 'performance'),
    director: initial.director.filter(item => item.id !== 'performance') })
  const before = s.commands.snapshot(id)
  const inherited = recipeOf(before)
  expect(inherited.actor.find(item => item.id === 'performance')).toEqual(legacyContextRecipe().actor.find(item => item.id === 'performance'))
  expect(inherited.director.find(item => item.id === 'performance')).toEqual(legacyContextRecipe().director.find(item => item.id === 'performance'))
  expect(s.commands.snapshot(id)).toEqual(before)
  const director = new DirectorQueries(s.commands, 16000, 100)
  const views = () => [director.context({ instanceId: id, instruction: 'Continue' }), s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' })]
  configuration.setRecipe(s.scope(id), { ...inherited,
    actor: inherited.actor.map(item => item.id === 'performance' ? { ...item, content: 'ACTOR: one purposeful paragraph.', role: 'user' as const } : item),
    director: inherited.director.map(item => item.id === 'performance' ? { ...item, content: 'DIRECTOR: a quiet transition.' } : item) })
  expect(views().map(view => view.sections.find(item => item.id === 'performance'))).toEqual([
    { id: 'performance', role: 'system', content: 'DIRECTOR: a quiet transition.', sources: ['recipe:performance'] },
    { id: 'performance', role: 'user', content: 'ACTOR: one purposeful paragraph.', sources: ['recipe:performance'] },
  ])
  const edited = recipeOf(s.commands.snapshot(id))
  configuration.setRecipe(s.scope(id), { ...edited, actor: edited.actor.map(item => item.id === 'performance' ? { ...item, enabled: false } : item),
    director: edited.director.map(item => item.id === 'performance' ? { ...item, enabled: false } : item) })
  for (const view of views()) {
    expect(view.sections.some(item => item.id === 'performance')).toBe(false)
    expect(view.text).not.toMatch(/400–800|500–900|one purposeful paragraph|a quiet transition/u)
  }
  expect(recipeOf(s.commands.snapshot(other)).actor.find(item => item.id === 'performance')).toEqual(performanceSection('actor'))
  expect(s.commands.replay(id, s.commands.snapshot(id).instance.revision)).toEqual(s.commands.snapshot(id))
})

it('restores missing reasoning instructions only through an explicit revisioned edit', () => {
  const s = setup(); const id = s.create()
  const configuration = new ConfigurationApplication(s.commands)
  const initial = recipeOf(s.commands.snapshot(id))
  const without = { ...initial, actor: initial.actor.filter(section => section.id !== 'reasoning-mode') }
  configuration.setRecipe(s.scope(id), without)
  const before = s.commands.snapshot(id)
  expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).sections.some(section => section.id === 'reasoning-mode')).toBe(false)
  expect(s.commands.snapshot(id)).toEqual(before)
  configuration.setRecipe(s.scope(id), { ...recipeOf(before), actor: [...without.actor, reasoningSection('actor')] })
  const restored = s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).sections.at(-1)!
  expect(restored).toMatchObject({ id: 'reasoning-mode', role: 'user', content: reasoningSection('actor').content })
  expect(restored.content).not.toContain('AUTHOR REFERENCE')
  configuration.setRecipe(s.scope(id), { ...recipeOf(s.commands.snapshot(id)), actor: [...without.actor, { ...reasoningSection('actor'), enabled: false }] })
  expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' }).sections.some(section => section.id === 'reasoning-mode')).toBe(false)
})

it('preserves complete custom context and never lets a source choose an undeclared section', () => {
  const assembly = new ContextAssembly([{ id: 'evidence', enabled: false, role: 'user' },
    { id: 'custom:test', enabled: true, role: 'user', title: 'Reference', content: 'x'.repeat(100000) }])
  expect(assembly.add('evidence', 'hidden', 'source')).toBe(false)
  expect(() => assembly.add('identity', 'identity', 'self')).toThrow('no declared')
  expect(assembly.finish().text).not.toContain('hidden')
  expect(assembly.finish().text).toContain('x'.repeat(100000))
})

it('keeps long actor perceptions, director facts and pinned originals beyond the query-page character limit', () => {
  const s = setup(); const id = s.create(); s.stage(id)
  const text = '这段亲历必须完整保留。'.repeat(5000)
  s.world.observe(s.scope(id), { summary: 'A long event', content: text, narration: text, state: [],
    deliveries: [{ actorId: 'a', content: text, kind: 'observation', sourceRefs: [] }] })
  const source = evidenceFor(s.commands.snapshot(id), 'a')[0]!.id
  new RetentionApplication(s.commands).review(s.scope(id), { owner: 'actor:a', operation: 'pin', sourceId: source, pinned: true })
  const context = s.queries.actorContext({ instanceId: id, actorId: 'a', query: '' })
  expect(context.text).toContain(text)
  expect(context.sections.find(section => section.id === 'retention')!.content).toContain(text)
  expect(new DirectorQueries(s.commands, 6000, 100)
    .context({ instanceId: id, instruction: '' }).text).toContain(text)
  expect(s.queries.actorContext({ instanceId: id, actorId: 'b', query: '' }).text).not.toContain(text)
})


it('rewrites a player direction in the same instance while preserving its old history and sibling runs', async () => {
  const s = setup()
  const a = s.create(); const b = s.create()
  const beforeSibling = s.commands.snapshot(b)
  const original = s.commands.execute({ ...s.scope(a), kind: 'director.open', input: { instruction: 'Original instruction' } }, snapshot => ({
    events: [replace('player-input', 'original', { id: 'original', revision: snapshot.instance.revision + 1, text: 'Original instruction' })], result: {},
  }))
  s.world.observe(s.scope(a), { summary: 'Old continuation', content: 'Old continuation', narration: 'Old continuation', state: [], deliveries: [] })
  const configuration = new ConfigurationApplication(s.commands)
  const originalRecipe = recipeOf(s.commands.snapshot(a))
  configuration.setRecipe(s.scope(a), { ...originalRecipe,
    director: originalRecipe.director.map(item => item.id === 'performance' ? { ...item, content: 'Write 1000–1500 characters.' } : item),
    actor: originalRecipe.actor.map(item => item.id === 'performance' ? { ...item, enabled: false } : item) })
  const savedRecipe = recipeOf(s.commands.snapshot(a))
  const old = s.commands.snapshot(a)
  const cancelled: number[] = []
  const recovery = new RecoveryApplication(s.commands, { capture: async () => null,
    cancel: async (_id, epoch) => { cancelled.push(epoch) } })
  const command = s.scope(a)
  const resume = async (scope: CommandScope, instruction: string) => {
    expect(scope.instanceId).toBe(a)
    expect(recipeOf(s.commands.snapshot(a))).toEqual(savedRecipe)
    expect(new DirectorQueries(s.commands, 16000, 100)
      .context({ instanceId: a, instruction }).text).toContain('Write 1000–1500 characters.')
    expect(s.queries.actorContext({ instanceId: a, actorId: 'a', query: '' }).sections.some(item => item.id === 'performance')).toBe(false)
    s.commands.execute({ ...scope, kind: 'director.open', input: { instruction } }, snapshot => ({
      events: [replace('player-input', 'replacement', { id: 'replacement', revision: snapshot.instance.revision + 1,
        text: instruction })], result: {},
    }))
    return { id: 'rewritten', epoch: 1, status: 'completed' as const, actors: [], advanceDiscussion: false, completedActors: 0 }
  }
  await recovery.rewrite(command, original.revision, 'Revised instruction', resume)
  await recovery.rewrite(command, original.revision, 'Revised instruction', resume)
  expect(s.commands.snapshot(a).instance.revision).toBe(old.instance.revision + 2)
  expect(s.commands.snapshot(a).instance.epoch).toBe(1)
  expect(JSON.stringify(s.commands.snapshot(a))).toContain('Revised instruction')
  expect(JSON.stringify(s.commands.snapshot(a))).not.toContain('Old continuation')
  expect(s.commands.replay(a, old.instance.revision)).toEqual(old)
  expect(s.commands.replay(a, s.commands.snapshot(a).instance.revision)).toEqual(s.commands.snapshot(a))
  const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
  const imported = archives.import(archives.export(a, []), s.values.id() as CommandId)
  expect(recipeOf(imported)).toEqual(savedRecipe)
  await recovery.restore(s.scope(a), original.revision - 1, 'Explicit full checkpoint restore')
  expect(recipeOf(s.commands.snapshot(a))).toEqual(originalRecipe)
  expect(s.commands.snapshot(b)).toEqual(beforeSibling)
  expect(cancelled).toEqual([1, 1, 2])
  await expect(recovery.rewrite(s.scope(a), 0, 'Invalid', resume)).rejects.toThrow('existing player direction')
  const removeScope = s.scope(a)
  const removed = await recovery.remove(removeScope, 'Remove test run')
  expect(removed.execution).toBe('cancelled')
  expect(s.library.instances().map(instance => instance.id).sort()).toEqual([b, imported.instance.id].sort())
  expect(() => s.commands.snapshot(a)).toThrow('unavailable')
  expect(s.commands.replay(a, old.instance.revision)).toEqual(old)
  expect((await recovery.remove(removeScope, 'Remove test run')).commit).toEqual(removed.commit)
})

it('reads every character of a long original and recalls director instructions and published narration', () => {
  const s = setup(); const a = s.create(); s.stage(a)
  const original = '长篇原始证据。'.repeat(40)
  s.world.observe(s.scope(a), { summary: 'Announcement', content: 'A notice exists.', narration: 'PUBLIC-NARRATION-ORIGINAL', state: [],
    deliveries: [{ actorId: 'a', kind: 'observation', content: original, sourceRefs: [] }] })
  const queries = new RetentionQueries(s.commands, 10, 23)
  let input: import('../src/command-inputs.ts').NarrativeRecallInput = { query: '长篇', offset: 0, limit: 1 }
  let restored = ''
  let pages = 0
  do {
    const page = queries.recall(a, 'actor:a', input)
    restored += page.entries[0]!.text
    expect(page.entries[0]!.text.length).toBeLessThanOrEqual(23)
    if (page.continuation === undefined) { expect(page.nextOffset).toBeNull(); break }
    expect(page.nextOffset).toBe(0)
    input = { ...input, ...page.continuation }
    expect(++pages).toBeLessThan(100)
  } while (true)
  expect(restored).toBe(original)
  expect(queries.recall(a, 'director', { query: 'PUBLIC-NARRATION', offset: 0, limit: 1 }).total).toBe(1)
  expect(queries.recall(a, 'actor:a', { query: 'PUBLIC-NARRATION', offset: 0, limit: 1 }).total).toBe(0)
  expect(() => queries.recall(a, 'actor:a', { ...input, sourceId: 'another-source' })).toThrow('Recall page changed')
})


describe('shared creative settings preserve independent instances', () => {
  it('applies selected modules in one commit and rejects a batch containing an unavailable shared value', () => {
    const s = setup(['a']); const id = s.create(); const other = s.create()
    const app = new CreativeSettingsApplication(s.store, s.commands, s.values)
    app.publish({ bookId: app.read(id).bookId, commandId: s.values.id() as CommandId, expectedGlobalRevision: 0,
      modules: { narrationLength: { enabled: true, minimum: 10, target: 20 },
        'actor.performance': { id: 'performance', enabled: true, role: 'system', title: 'Character voices', content: 'Shared character voices.' } } })
    const before = s.commands.snapshot(id); const untouched = s.commands.snapshot(other)
    const input = { modules: ['narrationLength', 'director.performance'] as const, source: 'global' as const,
      expectedBindingRevision: app.read(id).bindings.revision, expectedGlobalRevision: 1 }
    expect(() => app.bind(s.scope(id), { ...input, modules: [...input.modules] })).toThrow('Set this global module')
    expect(s.commands.snapshot(id)).toEqual(before)
    const modules = ['narrationLength', 'actor.performance'] as const
    app.bind(s.scope(id), { ...input, modules: [...modules] })
    expect(s.commands.snapshot(id).instance.revision).toBe(before.instance.revision + 1)
    const synced = app.read(id)
    expect(synced.recipe.narrationLength?.minimum).toBe(10)
    expect(creativeValue(synced.recipe, 'actor.performance')).toMatchObject({ content: 'Shared character voices.' })
    expect(modules.every(key => synced.bindings.modules[key].source === 'global')).toBe(true)
    expect(() => app.bind(s.scope(id), { ...input, modules: [...modules] })).toThrow('Creative sources changed')
    app.bind(s.scope(id), { ...input, modules: [...modules], source: 'copy-global', expectedBindingRevision: synced.bindings.revision })
    expect(modules.every(key => app.read(id).bindings.modules[key].source === 'local')).toBe(true)
    expect(s.commands.snapshot(other)).toEqual(untouched)
  })
  it('isolates books even with identical document IDs and rejects publishing from another book', async () => {
    const s = setup(['a']); const a = s.create()
    const draft = s.library.saveDraft({ id: 'other-book' as BookId, expectedRevision: 0, title: 'Another ledger',
      document: json(parseStorybookDocument(entity(s.commands.snapshot(a), { collection: 'setting', id: 'book' }))) as Record<string, ReturnType<typeof json>>, resources: [] })
    const version = s.library.publish(draft.id, draft.revision)
    const b = s.library.createStory({ templateVersionId: version.id, commandId: s.values.id() as CommandId },
      value => initializeWorld(value, s.values)).instance.id
    const app = new CreativeSettingsApplication(s.store, s.commands, s.values)
    const modules = { narrationLength: { enabled: true, minimum: 10, target: 15 } }
    app.publish({ bookId: 'book' as BookId, commandId: 'same-command' as CommandId, expectedGlobalRevision: 0, modules })
    expect(app.global('other-book' as BookId)).toMatchObject({ revision: 0, modules: {} })
    expect(app.read(a).bookId).toBe('book'); expect(app.read(b).bookId).toBe('other-book')
    expect(() => app.bind(s.scope(b), { module: 'narrationLength', source: 'global', expectedBindingRevision: 0, expectedGlobalRevision: 0 })).toThrow('Set this global module')
    expect(() => app.publish({ bookId: 'other-book' as BookId, commandId: s.values.id() as CommandId, expectedGlobalRevision: 0,
      modules, fromInstance: { instanceId: a, expectedRevision: s.commands.snapshot(a).instance.revision } })).toThrow('own storybook')
    app.publish({ bookId: 'other-book' as BookId, commandId: 'same-command' as CommandId, expectedGlobalRevision: 0,
      modules: { narrationLength: { enabled: false, minimum: 20, target: 25 } } })
    expect(app.global('book' as BookId).modules).toEqual(modules)
    app.bind(s.scope(b), { module: 'narrationLength', source: 'global', expectedBindingRevision: 0, expectedGlobalRevision: 1 })
    app.publish({ bookId: 'book' as BookId, commandId: s.values.id() as CommandId, expectedGlobalRevision: 1,
      modules: { narrationLength: { enabled: true, minimum: 100, target: 150 } } })
    await new PlayerApplication(s.commands, s.values, { cancel: async () => {} }, 6000).interveneScene(s.scope(b), 'A bell rings.')
    expect(recipeOf(s.commands.snapshot(b)).narrationLength?.minimum).toBe(20)
  })

  it('publishes selected modules, follows only at a player boundary, and restores local backups', async () => {
    const s = setup(['a']); const a = s.create(); const b = s.create(); s.stage(a, ['a']); s.stage(b, ['a'])
    const app = new CreativeSettingsApplication(s.store, s.commands, s.values)
    const configuration = new ConfigurationApplication(s.commands)
    configuration.setRecipe(s.scope(a), { ...recipeOf(s.commands.snapshot(a)),
      narrationLength: { enabled: true, minimum: 10, target: 15 } })
    const publish = { bookId: 'book' as BookId, commandId: s.values.id() as CommandId, expectedGlobalRevision: 0,
      fromInstance: { instanceId: a, expectedRevision: s.commands.snapshot(a).instance.revision },
      modules: { narrationLength: { enabled: true, minimum: 10, target: 15 } } }
    expect(app.publish(publish).revision).toBe(1)
    expect(app.publish(publish).revision).toBe(1)
    const original = recipeOf(s.commands.snapshot(b))
    const bind = () => app.bind(s.scope(b), { module: 'narrationLength', source: 'global',
      expectedBindingRevision: app.read(b).bindings.revision, expectedGlobalRevision: app.global('book' as BookId).revision })
    bind()
    expect(recipeOf(s.commands.snapshot(b)).narrationLength?.minimum).toBe(10)
    expect(() => configuration.setRecipe(s.scope(b), { ...recipeOf(s.commands.snapshot(b)),
      narrationLength: { enabled: true, minimum: 20, target: 30 } })).toThrow('independent')
    app.publish({ bookId: 'book' as BookId, commandId: s.values.id() as CommandId, expectedGlobalRevision: 1,
      modules: { narrationLength: { enabled: false, minimum: 20, target: 30 } } })
    const beforePreview = s.commands.snapshot(b)
    const preview = app.read(b)
    expect(preview.recipe.narrationLength?.minimum).toBe(10)
    expect(preview.storybook).toEqual(original)
    expect(preview.global.modules.narrationLength).toEqual({ enabled: false, minimum: 20, target: 30 })
    expect(s.commands.snapshot(b)).toEqual(beforePreview)
    expect(recipeOf(s.commands.snapshot(b)).narrationLength?.minimum).toBe(10)
    const player = new PlayerApplication(s.commands, s.values, { cancel: async () => {} }, 6000)
    const scope = s.scope(b)
    const result = await player.interveneScene(scope, 'The window opens.')
    expect(recipeOf(s.commands.snapshot(b)).narrationLength).toEqual({ enabled: false, minimum: 20, target: 30 })
    expect(recipeOf(s.commands.snapshot(a)).narrationLength?.minimum).toBe(10)
    expect(await player.interveneScene(scope, 'The window opens.')).toEqual(result)
    expect(s.commands.snapshot(b).entities.filter(item => item.key.collection === 'facts')).toHaveLength(1)
    app.bind(s.scope(b), { module: 'narrationLength', source: 'local', expectedBindingRevision: app.read(b).bindings.revision, expectedGlobalRevision: 2 })
    expect(recipeOf(s.commands.snapshot(b)).narrationLength).toEqual(original.narrationLength)
    app.bind(s.scope(b), { module: 'narrationLength', source: 'copy-global', expectedBindingRevision: app.read(b).bindings.revision, expectedGlobalRevision: 2 })
    expect(recipeOf(s.commands.snapshot(b)).narrationLength?.minimum).toBe(20)
    expect(app.read(b).bindings.modules.narrationLength.source).toBe('local')
    expect(materializeCreative(s.commands.snapshot(b), creativeBindings(s.commands.snapshot(b)))).toEqual(recipeOf(s.commands.snapshot(b)))
  })

  it('rejects stale global publication, mismatched modules, unsaved values and stale source changes', () => {
    const s = setup(['a']); const id = s.create()
    const app = new CreativeSettingsApplication(s.store, s.commands, s.values)
    const input = { bookId: 'book' as BookId, commandId: s.values.id() as CommandId, expectedGlobalRevision: 0,
      modules: { narrationLength: { enabled: true, minimum: 10, target: 15 } } }
    app.publish(input)
    expect(() => app.publish({ ...input, bookId: 'book' as BookId, commandId: s.values.id() as CommandId })).toThrow('changed')
    expect(() => app.publish({ ...input, modules: {} })).toThrow('Select')
    expect(() => app.publish({ ...input, bookId: 'book' as BookId, commandId: s.values.id() as CommandId, expectedGlobalRevision: 1,
      fromInstance: { instanceId: id, expectedRevision: 0 } })).toThrow('Save instance edits')
    expect(() => app.bind(s.scope(id), { module: 'actor.performance', source: 'global', expectedBindingRevision: 0, expectedGlobalRevision: 1 })).toThrow('Set this global module')
    app.bind(s.scope(id), { module: 'narrationLength', source: 'global', expectedBindingRevision: 0, expectedGlobalRevision: 1 })
    expect(() => app.bind(s.scope(id), { module: 'narrationLength', source: 'local', expectedBindingRevision: 0, expectedGlobalRevision: 1 })).toThrow('sources changed')
  })

  it('rolls back synchronization and world intervention together when the candidate exceeds budget', async () => {
    const s = setup(['a']); const id = s.create(); s.stage(id, ['a'])
    const app = new CreativeSettingsApplication(s.store, s.commands, s.values)
    app.publish({ bookId: 'book' as BookId, commandId: s.values.id() as CommandId, expectedGlobalRevision: 0, modules: { narrationLength: { enabled: true, minimum: 10, target: 15 } } })
    app.bind(s.scope(id), { module: 'narrationLength', source: 'global', expectedBindingRevision: 0, expectedGlobalRevision: 1 })
    app.publish({ bookId: 'book' as BookId, commandId: s.values.id() as CommandId, expectedGlobalRevision: 1, modules: { narrationLength: { enabled: true, minimum: 100, target: 150 } } })
    const before = s.commands.snapshot(id)
    const guarded = new NarrativeCommands(s.store, s.values, (snapshot) => {
      expect(snapshot.entities.some(item => item.key.collection === 'facts')).toBe(true)
      expect(recipeOf(snapshot).narrationLength?.minimum).toBe(100)
      throw new Error('Required context exceeds budget')
    })
    const player = new PlayerApplication(guarded, s.values, { cancel: async () => {} }, 6000)
    await expect(player.interveneScene(s.scope(id), 'A bell rings.')).rejects.toThrow('budget')
    expect(s.commands.snapshot(id)).toEqual(before)
  })

  it('freezes followed settings through execution and pauses subscriptions on restore or archive import', async () => {
    const s = setup(['a']); const id = s.create(); s.stage(id, ['a'])
    const app = new CreativeSettingsApplication(s.store, s.commands, s.values)
    app.publish({ bookId: 'book' as BookId, commandId: s.values.id() as CommandId, expectedGlobalRevision: 0, modules: { narrationLength: { enabled: true, minimum: 10, target: 15 } } })
    app.bind(s.scope(id), { module: 'narrationLength', source: 'global', expectedBindingRevision: 0, expectedGlobalRevision: 1 })
    const revision = s.commands.snapshot(id).instance.revision
    const d = directing(s, { execute: async ({ context }, _signal, command) => {
      app.publish({ bookId: 'book' as BookId, commandId: s.values.id() as CommandId, expectedGlobalRevision: 1, modules: { narrationLength: { enabled: true, minimum: 100, target: 150 } } })
      expect(context.text).toContain('最低 10 字')
      expect(recipeOf(s.commands.snapshot(id)).narrationLength?.minimum).toBe(10)
      expect(() => app.bind(s.scope(id), { module: 'narrationLength', source: 'local', expectedBindingRevision: 1, expectedGlobalRevision: 2 })).toThrow('finish')
      command('finish', { operation: 'finish', actors: [], advanceDiscussion: false })
    } })
    await d.director.run(s.scope(id), 'Continue.')
    const archives = new NarrativeArchives(s.store, s.values, { verify: () => {} })
    const imported = archives.import(archives.export(id, []), 'creative-import' as CommandId)
    expect(creativeBindings(imported).modules.narrationLength.followPaused).toBe(true)
    expect(creativeValue(recipeOf(s.commands.replay(id, revision)), 'narrationLength')).toEqual({ enabled: true, minimum: 10, target: 15 })
    const scope = s.scope(id)
    s.commands.restore({ ...scope, kind: 'history.restore', input: { targetRevision: revision, reason: 'Return.' } }, revision, 'Return.')
    expect(creativeBindings(s.commands.snapshot(id)).modules.narrationLength.followPaused).toBe(true)
    await d.director.dispose(); await d.runtime.dispose()
  })
})


it('includes all director briefs while originals remain recallable', async () => {
  const s = setup(); const id = s.create(); s.stage(id)
  let speech = 'Wait in the courtyard.'
  const actors = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async () => ({ posture: 'watching',
    behavior: [{ kind: 'speech', text: speech }] })), s.values)
  await actors.run(s.scope(id), 'a')
  speech = 'Watch the harbor.'
  await actors.run(s.scope(id), 'a')
  for (const text of ['The key is promised.', 'The weather is cold.', 'The meal is ready.']) {
    s.world.observe(s.scope(id), { summary: text, content: text, state: [], deliveries: [] })
  }
  const retention = new RetentionApplication(s.commands)
  retention.review(s.scope(id), { owner: 'director', operation: 'policy', activation: 'automatic' })
  const d = directing(s, { execute: async (_request, _signal, command) => {
    const result = command('sources', { operation: 'recall', input: { query: '', offset: 0, limit: 8 } }).result as { entries: { id: string; kind: string; text: string }[] }
    const facts = result.entries.filter(item => item.kind === 'settled-fact' || item.kind === 'claim')
    command('summaries', { operation: 'context-update', input: facts.map(item => ({ sourceIds: [item.id], disposition: 'represented', reason: 'Retain the event.',
      changes: [{ operation: 'add', kind: item.kind === 'claim' ? 'claim' : 'fact', text: `BRIEF ${item.text}`, sourceIds: [item.id] }] })) })
    command('finish', { operation: 'finish', actors: [], advanceDiscussion: false })
  } })
  await d.director.run(s.scope(id), '')
  const query = new DirectorQueries(s.commands, 6000, 100)
  const frozen = s.commands.snapshot(id).instance.revision
  const key = query.context({ instanceId: id, instruction: 'key' })
  expect(key.sections.filter(section => section.id === 'retention').map(section => section.content).join('\n')).toContain('BRIEF The key is promised.')
  expect(key.sections.filter(section => section.id === 'retention').map(section => section.content).join('\n')).toMatch(/BRIEF The (weather|meal)/)
  expect(key.text).not.toContain('[SETTLED FACT]')
  expect(query.context({ instanceId: id, instruction: '' }).sections.filter(section => section.id === 'retention').map(section => section.content).join('\n')).toContain('BRIEF The meal is ready.')
  expect(query.context({ instanceId: id, instruction: 'meal' }).text).toContain('BRIEF The weather is cold.')
  expect(query.context({ instanceId: id, instruction: 'harbor' }).text).toContain('Wait in the courtyard.')
  expect(JSON.stringify(query.recall(id, { query: 'weather', offset: 0, limit: 1 }, frozen))).toContain('weather')
  s.world.observe(s.scope(id), { summary: 'New evidence', content: 'The weather changes.', state: [], deliveries: [] })
  expect(query.context({ instanceId: id, revision: frozen, instruction: 'key' }).text).toBe(key.text)
  await d.director.dispose(); await d.runtime.dispose(); await actors.dispose()
})


it('lets an actor revise a heard belief and its memory after counterevidence without rewriting the earlier understanding', async () => {
  const s = setup(); const id = s.create(); s.stage(id)
  const retention = new RetentionApplication(s.commands)
  retention.review(s.scope(id), { owner: 'actor:a', operation: 'policy', activation: 'automatic' })
  s.world.observe(s.scope(id), { summary: 'A warning is heard', content: 'A traveler warned about the bridge.', state: [],
    deliveries: [{ actorId: 'a', kind: 'claim', content: 'A traveler claims the bridge is impassable.', sourceRefs: [] }] })
  const claimId = evidenceFor(s.commands.snapshot(id), 'a')[0]!.id
  const initial = knowledgeChangeSchema.parse({ id: 'bridge-belief', expectedRevision: 0, text: 'The bridge may be impassable.',
    kind: 'belief', attitude: 'believed', acquisition: 'heard', entityRefs: [], sourceRefs: [claimId], status: 'active', reason: 'I trust the warning.' })
  let noteId = ''
  let crossingId = ''
  const actor = new ActorRuntime(s.commands, s.cognition, s.queries, scripted(async (request) => {
    if (noteId === '') return { posture: 'watching', behavior: [], knowledge_changes: [initial],
      context_update: [{ sourceIds: [claimId], disposition: 'represented', reason: 'Keep the warning and my response.', changes: [{
        operation: 'add', kind: 'claim', text: 'I trust a traveler’s warning and intend to avoid the bridge.', sourceIds: [claimId],
        episode: { topic: 'The bridge warning', experience: 'A traveler said the bridge was impassable.',
          interpretation: 'I think the warning is reliable.', impact: 'I intend to take a detour.', unresolved: ['Has anyone checked the bridge?'] },
      }] }] }
    expect(request.context.text).toContain('A cart crosses the bridge in front of you.')
    expect(request.context.text).toContain('I trust a traveler’s warning')
    return { posture: 'finished', behavior: [{ kind: 'speech', text: 'That cart crossed safely. I will inspect the bridge before taking a detour.' }],
      knowledge_changes: [{ ...initial, expectedRevision: 1, text: 'A cart crossed; the warning may be outdated.', attitude: 'doubted',
        acquisition: 'observed', sourceRefs: [claimId, crossingId], reason: 'I witnessed a crossing that contradicts the warning.' }],
      context_update: [{ sourceIds: [crossingId], disposition: 'represented', reason: 'Add counterevidence to the retained warning.', changes: [{
        operation: 'revise', noteId, expectedRevision: 1, kind: 'claim', sourceIds: [crossingId],
        text: 'I doubt the warning after seeing a cart cross; I will inspect before detouring.',
        episode: { topic: 'The bridge warning', experience: 'I first heard a warning, then saw a cart cross.',
          interpretation: 'The warning may be outdated; I have not inspected the whole bridge.',
          impact: 'Inspect before taking a detour.', unresolved: ['Is it safe for my crossing?'] },
      }] }] }
  }), s.values)
  try {
    await actor.run(s.scope(id), 'a')
    const before = s.commands.snapshot(id)
    noteId = retentionOf(before, 'actor:a').notes[0]!.id
    s.world.observe(s.scope(id), { summary: 'A cart crosses', content: 'One cart crosses the bridge.', state: [],
      deliveries: [{ actorId: 'a', kind: 'observation', content: 'A cart crosses the bridge in front of you.', sourceRefs: [] }] })
    crossingId = evidenceFor(s.commands.snapshot(id), 'a').at(-1)!.id
    await actor.run(s.scope(id), 'a')
    const after = s.commands.snapshot(id)
    expect(knowledgeOf(after, 'a').entries[0]).toMatchObject({ revision: 2, attitude: 'doubted', acquisition: 'observed' })
    expect(knowledgeOf(after, 'a').history).toHaveLength(2)
    expect(knowledgeOf(s.commands.replay(id, before.instance.revision), 'a').entries[0]).toMatchObject({ attitude: 'believed', acquisition: 'heard' })
    expect(retentionOf(after, 'actor:a').notes[0]).toMatchObject({ id: noteId, revision: 2, sourceIds: [claimId, crossingId] })
    const recall = new RetentionQueries(s.commands, 10, 6000)
    expect(recall.recall(id, 'actor:a', { query: `retention:${noteId}:r2`, offset: 0, limit: 1 }).entries[0]?.text).toContain('not inspected the whole bridge')
    expect(recall.recall(id, 'actor:a', { query: `retention:${noteId}:r1`, offset: 0, limit: 1 }, before.instance.revision).entries[0]?.text).toContain('warning is reliable')
    expect(recall.recall(id, 'actor:b', { query: 'warning', offset: 0, limit: 10 }).entries).toEqual([])
    expect(s.queries.actorContext({ instanceId: id, actorId: 'a', query: 'bridge' }).text).toContain('I doubt the warning')
    const director = new DirectorQueries(s.commands, 6000, 100)
    expect(director.context({ instanceId: id, instruction: '' }).text).not.toContain('I doubt the warning after seeing')
  } finally { await actor.dispose() }
})
