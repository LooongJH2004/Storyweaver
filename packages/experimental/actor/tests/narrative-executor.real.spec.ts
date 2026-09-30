/** Real Loader and Agent loop execute against an independent SQLite narrative authority. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { StorybookLibrary, NarrativeCommands, PeopleApplication, CognitionApplication, PerspectiveQueries, ActorRuntime, initializeWorld,
  DirectorQueries, DirectorRuntime, DirectorCommands, DiscussionRuntime, DiscussionApplication, PlayQueries, RecoveryApplication } from '@deepseek-ai/dsh-roleplay-core'
import type { BookId, CommandId, CommandScope, InstanceId, Document } from '@deepseek-ai/dsh-roleplay-core'
import { parseStorybookDocument } from '@deepseek-ai/dsh-roleplay-core/storybook'
import { SqliteRoleplayStore, embeddedResourceVerifier } from '@deepseek-ai/dsh-roleplay-store-sqlite'
import { launchWebScaffold, type LaunchOptions } from '../../../../apps/web/tests/scaffold.ts'
import { MockAdapter, toolCallResponse, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { HarnessActorExecutor } from '../src/narrative-executor.ts'
import { HarnessDirectorExecutor } from '../src/director-executor.ts'
import { ConfigurationApplication } from '@deepseek-ai/dsh-roleplay-core/configuration'
import { styleProfileSchema } from '@deepseek-ai/dsh-roleplay-core/style'
import { recipeOf } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import { evidenceFor } from '@deepseek-ai/dsh-roleplay-core/world'
import { sumExecutionUsage } from '../src/execution-usage.ts'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'

it('commits through the real NPC tool, restores execution separately, and isolates other instances', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-narrative-executor-'))
  const options: LaunchOptions = {
    extraOverlayPath: fileURLToPath(new URL('../../roleplay-web-profile/cordis.patch.yml', import.meta.url)),
    extraInstallAnchors: [fileURLToPath(new URL('../../roleplay-web-profile/package.json', import.meta.url))],
    directoryPickerMode: 'overlay', extraEntryOverrides: [
      { id: 'story-home', config: { root } },
      { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions') } },
      { id: 'storage-json', config: { root: join(root, 'storages') } },
      { id: 'roleplay-directory-picker-native', disabled: true },
      { id: 'roleplay-directory-picker-controller', disabled: true },
    ],
  }
  const store = new SqliteRoleplayStore({ path: join(root, 'narrative.sqlite'), journalMode: 'wal', busyTimeoutMs: 1000 })
  const values = { id: randomUUID, now: () => new Date().toISOString() }
  const commands = new NarrativeCommands(store, values)
  const books = new StorybookLibrary(store, values, embeddedResourceVerifier, ({ document }) => document)
  const people = new PeopleApplication(commands, values)
  const fieldReference = (id: string) => `field-${id}`
  const cognition = new CognitionApplication(commands, values, { fieldReference, maxContextUpdateUnits: 16, limits: {
    maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
    maxActiveGoals: 32, maxScheduledIntentions: 32,
  } })
  const queries = new PerspectiveQueries(commands, 6000, fieldReference, 40)
  const book = parseStorybookDocument({ schemaVersion: 6, id: 'inn', title: 'Two independent inns', protagonistActorId: 'keeper', directorPrompt: '', directorGuidance: {},
    characters: [{ actorId: 'keeper', displayName: 'UNREVEALED-NAME', appearance: 'A tired innkeeper',
      publicPersona: 'Keeps the inn.', rolePrompt: 'Respond in your own words.', capabilities: ['speak', 'act', 'memory'], actingGuidance: {} }] })
  const draft = books.saveDraft({ id: 'inn' as BookId, expectedRevision: 0, title: book.title,
    document: JSON.parse(JSON.stringify(book)) as Document, resources: [] })
  const version = books.publish(draft.id, draft.revision)
  const create = () => books.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId },
    version => initializeWorld(version, values)).instance.id
  const scope = (id: InstanceId): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
    expectedRevision: commands.snapshot(id).instance.revision, principal: { kind: 'player' } })
  const a = create(); const b = create()
  for (const id of [a, b]) people.stage(scope(id), { id: 'inn', location: 'Inn', present: ['keeper'], appearances: [] })
  let scaffold = await launchWebScaffold(options)
  let selectedModel = 'mock'
  let selectedProvider = 'mock'
  const executor = () => new HarnessActorExecutor(scaffold.ctx.agents, {
    agentOptions: { provider: 'mock', model: 'mock' }, setup: async () => {},
    selection: () => ({ provider: selectedProvider, model: selectedModel }),
    exists: async id => (await scaffold.ctx.sessionPersistence.list()).some(session => session.id === id),
    flush: async (session) => { await scaffold.ctx.sessions.flush(session) },
  })
  let harness = executor()
  try {
    const rawResponse = (id: string, argumentsText: string) => toolCallResponse(id, 'npc_commit_turn', {}).map((chunk) => {
      if (chunk.type === 'tool-call-delta') {
        return { ...chunk, argumentsDelta: chunk.id === undefined ? '' : argumentsText }
      }
      if (chunk.type === 'block-end' && chunk.block.type === 'tool-call') {
        return { ...chunk, block: { ...chunk.block, arguments: argumentsText } }
      }
      return chunk
    })
    const first = new MockAdapter([toolCallResponse('reject-a', 'npc_commit_turn', { posture: 'waiting',
      memories: [{ content: 'MUST-ROLL-BACK', importance: 99 }], behavior: [{ kind: 'speech', text: 'REJECTED-UTTERANCE' }],
    }), toolCallResponse('reject-label', 'npc_commit_turn', {
      posture: 'waiting', memories: [{ content: 'MUST-ROLL-BACK', importance: 4 }],
      behavior: [{ kind: 'speech', text: 'REJECTED-UTTERANCE', to: ['A tired innkeeper'] }],
    }), rawResponse('broken-json', '{"posture":"silent"'), rawResponse('quoted-json', '"not an object"'), toolCallResponse('accept-a', 'npc_commit_turn', {
      posture: 'waiting', memories: [{ content: 'INSTANCE-A-ONLY: I promised to keep the room.', importance: 4 }],
      behavior: [{ kind: 'speech', text: 'Your room is ready.' }],
    })])
    scaffold.ctx.llm.registerAdapter(['mock'], first)
    const runtime = new ActorRuntime(commands, cognition, queries, harness, values)
    const accepted = await runtime.run(scope(a), 'keeper')
    const session = scaffold.ctx.agents.list().find(agent => agent.session.events.some(event => event.type === 'roleplay/execution-receipt'))!
    const originalSessionId = session.id
    const request = session.session.events.find(event => event.type === 'roleplay/execution-request')!
    expect(request.type).toBe('roleplay/execution-request')
    if (request.type !== 'roleplay/execution-request') throw new Error('Missing recorded request')
    expect(request.data.context).toEqual(queries.actorContext({ instanceId: a, actorId: 'keeper', revision: accepted.revision - 1, query: '' }))
    expect(JSON.stringify(first.requests[0]?.messages)).toContain('CURRENT SUBJECTIVE STATE')
    expect(JSON.stringify(first.requests[0]?.system)).toContain('recall marks such versions with revisionScope=record')
    expect(JSON.stringify(first.requests[0]?.system)).toContain('A null range means at least one source has no recorded story time')
    expect(JSON.stringify(first.requests[0]?.messages)).toContain('No assigned group discussion')
    expect(JSON.stringify(first.requests[0]?.messages)).toContain('label is display text, never a routing value')
    expect(JSON.stringify(first.requests[2]?.messages)).toContain('behavior[0].to[0]')
    expect(JSON.stringify(first.requests[2]?.messages)).toContain('No part of this turn was committed')
    expect(JSON.stringify(first.requests[3]?.messages)).toContain('Malformed JSON:')
    expect(JSON.stringify(first.requests[3]?.messages)).toContain('Delimiter check: remaining closing delimiters, from inside out: }.')
    expect(JSON.stringify(first.requests[3]?.messages)).toContain('closing braces and brackets')
    expect(JSON.stringify(first.requests[3]?.messages)).toContain('No changes were submitted')
    expect(JSON.stringify(first.requests[4]?.messages)).toContain('Pass a JSON object directly')
    const creative = request.data.context.sections.find(section => section.id === 'performance')!
    expect(first.requests[0]?.messages.some(message => message.content.some(block => block.type === 'text' && block.text.includes(creative.content)))).toBe(true)
    await expect(JSON.stringify({ system: first.requests[0]?.system, tools: first.requests[0]?.tools, creative }, null, 2) + '\n')
      .toMatchFileSnapshot('./expected/npc-request-protocol.json')
    expect(session.session.events.filter(event => event.type === 'actor/commit')).toEqual([])
    expect(JSON.stringify(commands.snapshot(a))).not.toContain('MUST-ROLL-BACK')
    expect(JSON.stringify(commands.snapshot(a))).not.toContain('REJECTED-UTTERANCE')
    expect(JSON.stringify(first.requests[1]?.messages)).toContain('reject-a')
    expect(first.requests[1]?.messages.some(message => message.content.some(block => block.type === 'tool-result'))).toBe(true)
    expect(session.session.events.filter(event => event.type === 'roleplay/execution-receipt')).toHaveLength(1)
    expect(queries.actorContext({ instanceId: b, actorId: 'keeper', query: '' }).text).not.toContain('INSTANCE-A-ONLY')
    await runtime.dispose(); await harness.dispose(); await scaffold.close()
    scaffold = await launchWebScaffold(options); harness = executor()
    const second = new MockAdapter([
      toolCallResponse('resume-a', 'npc_commit_turn', { posture: 'silent', behavior: [] }),
      toolCallResponse('begin-b', 'npc_commit_turn', { posture: 'waiting', behavior: [{ kind: 'speech', text: 'No room is promised.' }] }),
      toolCallResponse('switch-a', 'npc_commit_turn', { posture: 'silent', behavior: [] }),
    ])
    scaffold.ctx.llm.registerAdapter(['mock'], second)
    const resumed = new ActorRuntime(commands, cognition, queries, harness, values)
    const configuration = new ConfigurationApplication(commands)
    const recipeA = recipeOf(commands.snapshot(a)); const recipeB = recipeOf(commands.snapshot(b))
    configuration.setRecipe(scope(a), { ...recipeA, actor: recipeA.actor.map(section => section.id === 'performance'
      ? { ...section, content: 'AUTHOR-EDIT: keep this response to two short paragraphs.' } : section) })
    configuration.setRecipe(scope(b), { ...recipeB, actor: recipeB.actor.map(section => section.id === 'performance'
      ? { ...section, enabled: false } : section), director: recipeB.director.map(section => section.id === 'performance'
      ? { ...section, content: 'AUTHOR-EDIT: give one quiet scene transition.' } : section) })
    await resumed.run(scope(a), 'keeper'); await resumed.run(scope(b), 'keeper')
    expect(JSON.stringify(second.requests[0])).toContain('AUTHOR-EDIT: keep this response')
    expect(JSON.stringify(second.requests[0])).not.toMatch(/400–800|3–5 developed paragraphs/u)
    expect(JSON.stringify(second.requests[1])).not.toMatch(/AUTHOR-EDIT|400–800|3–5 developed paragraphs|创作与推进规则：演员/u)
    expect(second.requests[0]?.sessionId).toBe(originalSessionId)
    expect(second.requests[1]?.sessionId).not.toBe(originalSessionId)
    expect(JSON.stringify(second.requests[0]?.messages)).toContain('INSTANCE-A-ONLY')
    expect(second.requests[0]?.messages.map(message => message.role)).toEqual(['system', 'user'])
    expect(JSON.stringify(second.requests[0]?.messages)).not.toContain('accept-a')
    expect(JSON.stringify(second.requests[1]?.messages)).not.toContain('INSTANCE-A-ONLY')
    selectedModel = 'second-model'
    await resumed.run(scope(a), 'keeper')
    expect(second.requests[2]?.sessionId).toBe(originalSessionId)
    expect(second.requests[2]?.model).toBe('second-model')
    expect(second.requests[0]?.model).toBe('mock')
    const { actorId: _actorId, ...visitorDefinition } = book.characters[0]!
    const visitor = people.create(scope(a), { definition: { ...visitorDefinition, displayName: 'UNREVEALED-VISITOR',
      appearance: 'A rain-soaked traveler', publicPersona: 'A traveler seeking shelter.' }, location: 'Inn',
    importance: 'supporting', purpose: 'Shelter', sourceRefs: [] })
    const visitorId = (visitor.result as { actorId: string }).actorId
    people.stage(scope(a), { id: 'inn', location: 'Inn', present: ['keeper', visitorId], appearances: [] })
    const directory = queries.actorContext({ instanceId: a, actorId: visitorId, query: '' }).sections.find(section => section.id === 'people')!.content
    const keeperRef = (JSON.parse(directory.slice(directory.lastIndexOf('\n') + 1)) as { ref: string }[])[0]!.ref
    selectedProvider = 'perception-mock'
    const perception = new MockAdapter([
      toolCallResponse('missing-feedback-decision', 'npc_commit_turn', { posture: 'waiting', behavior: [
        { kind: 'action', attempt: 'REJECTED-WITHOUT-FEEDBACK-DECISION' },
      ] }),
      toolCallResponse('visitor-speaks', 'npc_commit_turn', { posture: 'waiting', behavior: [
        { kind: 'speech', text: 'How should I address you?', to: [keeperRef], delivery: 'spoken', intent: 'PRIVATE-VISITOR-MOTIVE' },
        { kind: 'action', attempt: 'Reaches toward the lantern.', visibility: 'public', await_result: false },
        { kind: 'action', attempt: 'HIDDEN-POCKET-INSPECTION', target: keeperRef, visibility: 'concealed', await_result: true },
      ] }),
      toolCallResponse('keeper-hears', 'npc_commit_turn', { posture: 'silent', behavior: [] }),
    ])
    scaffold.ctx.llm.registerAdapter(['perception-mock'], perception)
    await resumed.run(scope(a), visitorId)
    expect(JSON.stringify(perception.requests[1]!.messages)).toContain('must match exactly one oneOf branch')
    expect(JSON.stringify(perception.requests[1]!.tools)).toContain('Choose explicitly for every action')
    expect(JSON.stringify(commands.snapshot(a))).not.toContain('REJECTED-WITHOUT-FEEDBACK-DECISION')
    const pendingFeedback = queries.actorContext({ instanceId: a, actorId: visitorId, query: '' }).sections
      .find(section => section.content.startsWith('[YOUR PENDING WORLD ATTEMPTS'))!.content
    expect(pendingFeedback).toContain('HIDDEN-POCKET-INSPECTION')
    expect(pendingFeedback).not.toContain('Reaches toward the lantern.')
    const heard = await resumed.run(scope(a), 'keeper')
    const receptionContext = queries.actorContext({ instanceId: a, actorId: 'keeper', revision: heard.revision - 1, query: '' })
    const receptionText = perception.requests[2]!.messages.flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : [])).join('\n')
    for (const section of receptionContext.sections.filter(section => section.id === 'evidence')) expect(receptionText).toContain(section.content)
    expect(receptionText).toContain('A rain-soaked traveler')
    expect(receptionText).toContain('"addressedTo":[{"ref":"self","label":"你"}]')
    expect(receptionText.indexOf('How should I address you?')).toBeLessThan(receptionText.indexOf('Reaches toward the lantern.'))
    expect(receptionText).not.toMatch(/PRIVATE-VISITOR-MOTIVE|UNREVEALED-VISITOR|HIDDEN-POCKET-INSPECTION/)
    expect(perception.requests[2]!.system).toContain('Ask how to address them')
    const discussionApp = new DiscussionApplication(commands, values)
    selectedProvider = 'invitation-mock'
    const visitorRef = queries.knownPeople(a, 'keeper', 'rain-soaked', 0, 40).entries[0]!.ref
    const invitationAdapter = new MockAdapter([toolCallResponse('invite', 'npc_commit_turn', { posture: 'waiting', behavior: [],
      discussion_request: { topic: 'Check the footbridge', opening: 'Agree on a safe route', participant_refs: [visitorRef] },
    })])
    scaffold.ctx.llm.registerAdapter(['invitation-mock'], invitationAdapter)
    await resumed.run(scope(a), 'keeper')
    const invitation = new PlayQueries(commands, 40).read({ instanceId: a, audience: { kind: 'observer' }, offset: 0, limit: 40 }).discussionRequests![0]!
    configuration.setSettings(scope(a), { overrides: { discussionSettings: { maxRounds: 1, floorPolicy: 'balanced' } }, reason: 'Fixture exchange policy' })
    const started = discussionApp.control(scope(a), { operation: 'request', requestId: invitation.id,
      expectedRequestRevision: invitation.revision, decision: 'accept', reason: 'Inspect together' })
    selectedProvider = 'discussion-budget-mock'
    const discussionAdapter = new MockAdapter(['prepare-keeper', 'prepare-visitor', 'public-pass'].map(callId =>
      toolCallResponse(callId, 'npc_commit_turn', { posture: 'watching', behavior: [], discussion: { action: 'pass', eagerness: 'medium' } })))
    scaffold.ctx.llm.registerAdapter(['discussion-budget-mock'], discussionAdapter)
    await resumed.prepareDiscussion(scope(a), ['keeper', visitorId])
    const publicContext = queries.actorContext({ instanceId: a, actorId: 'keeper', query: '' })
    const floorSection = publicContext.sections.find(section => section.id === 'discussion')!.content
    await resumed.run(scope(a), 'keeper')
    const publicRequest = discussionAdapter.requests[2]!
    expect(publicRequest.messages.some(message => message.content.some(block => block.type === 'text' && block.text.includes(floorSection)))).toBe(true)
    const floorMetadata = JSON.parse(floorSection.slice(floorSection.indexOf('{'))) as {
      publicTurns: unknown
      instruction: string
      opportunities: { actorId: string; publicTurns: number }[]
    }
    expect(floorMetadata.opportunities).toEqual([
      { actorId: 'self', publicTurns: 0 }, { actorId: expect.stringMatching(/^person-/u) as unknown, publicTurns: 0 },
    ])
    await expect(JSON.stringify({ publicTurns: floorMetadata.publicTurns,
      opportunities: floorMetadata.opportunities.map(item => item.publicTurns), instruction: floorMetadata.instruction }, null, 2) + '\n')
      .toMatchFileSnapshot('./expected/discussion-exchange-guidance.json')
    expect(queries.actorContext({ instanceId: a, actorId: visitorId, query: '' }).text).toContain('"publicTurns":{"used":1,"total":2,"remaining":1')
    discussionApp.control(scope(a), { operation: 'close', discussionId: (started.result as { discussionId: string }).discussionId, status: 'completed' })
    selectedProvider = 'unregistered-route'
    await expect(resumed.run(scope(a), 'keeper')).rejects.toThrow('no adapter registered for provider "unregistered-route"')
    expect(commands.replay(a, commands.snapshot(a).instance.revision)).toEqual(commands.snapshot(a))
    await resumed.dispose()
    selectedProvider = 'observer-mock'
    const performanceCue = 'Explain a practical route and take the initiative. Use developed paragraphs, in your own voice.'
    const observing = new MockAdapter([
      toolCallResponse('cue-protagonist', 'director_command', { command: { operation: 'style', input: {
        scope: 'scene', sceneId: 'inn', key: 'actor:keeper', instruction: performanceCue,
      } } }),
      toolCallResponse('schedule-protagonist', 'director_command', { command: { operation: 'finish', actors: ['keeper'], advanceDiscussion: false } }),
      toolCallResponse('protagonist-initiative', 'npc_commit_turn', { posture: 'finished', behavior: [
        { kind: 'speech', text: 'The road is flooded. I can show you the footbridge.\n\nWe can check the water from the porch first.' },
        { kind: 'action', attempt: 'I reach for the lantern by the door.', visibility: 'public', await_result: false },
      ] }),
      toolCallResponse('rewrite-finish', 'director_command', { command: { operation: 'finish', actors: [], advanceDiscussion: false } }),
      toolCallResponse('short-narration', 'director_observe', { settles: [], summary: 'Rain', content: 'Rain wets the window.', narration: '雨落窗边。',
        shared: { actorIds: ['keeper'], content: 'SHARED-RAIN on the windowsill.', kind: 'observation', sourceRefs: [] }, deliveries: [], state: [] }),
      toolCallResponse('append-narration', 'director_revise_narration', { draftRevision: 0, mode: 'append', narration: '水珠顺着木框慢慢滚落。' }),
      toolCallResponse('narration-finish', 'director_command', { command: { operation: 'finish', actors: [], advanceDiscussion: false } }),
      toolCallResponse('short-again', 'director_observe', { settles: [], summary: 'Clouds', content: 'Clouds pass.', narration: '云。', deliveries: [], state: [] }),
      toolCallResponse('revise-first', 'director_revise_narration', { draftRevision: 0, mode: 'append', narration: '风。' }),
      toolCallResponse('revise-last', 'director_revise_narration', { draftRevision: 1, mode: 'append', narration: '雨。' }),
    ])
    scaffold.ctx.llm.registerAdapter(['observer-mock'], observing)
    const directorHarness = new HarnessDirectorExecutor(scaffold.ctx.agents, {
      agentOptions: { provider: 'observer-mock', model: 'mock' }, setup: async () => {},
      exists: async id => (await scaffold.ctx.sessionPersistence.list()).some(session => session.id === id),
      flush: async (session) => { await scaffold.ctx.sessions.flush(session) },
    })
    const actorRuntime = new ActorRuntime(commands, cognition, queries, harness, values)
    const directorQueries = new DirectorQueries(commands, 20000, 100)
    const director = new DirectorRuntime(commands, new DirectorCommands(commands, values, 16), directorQueries, queries,
      directorHarness, actorRuntime, new DiscussionRuntime(commands, actorRuntime, values, 12), values, 12, 20000)
    try {
      const result = await director.run(scope(b), 'Continue.')
      expect(result).toMatchObject({ status: 'completed', actors: ['keeper'], completedActors: 1 })
      const directorSession = scaffold.ctx.agents.list().find(agent => agent.session.events.some(event =>
        event.type === 'roleplay/execution-request' && 'role' in event.data.context))!
      const recorded = directorSession.session.events.find(event => event.type === 'roleplay/execution-request')!
      if (recorded.type !== 'roleplay/execution-request') throw new Error('Missing director request')
      expect(recorded.data.context).toEqual(directorQueries.context({ instanceId: b, revision: recorded.data.context.revision, instruction: 'Continue.' }))
      const scene = recorded.data.context.sections.find(section => section.content.startsWith('[CURRENT SCENE]'))?.content
      expect(scene).toContain('"protagonistActorId":"keeper"')
      expect(scene).toContain('"playerControlledActorId":null')
      expect(observing.requests[0]?.messages.some(message => message.content.some(block =>
        block.type === 'text' && block.text.includes(scene!)))).toBe(true)
      const creative = recorded.data.context.sections.find(section => section.id === 'performance')!
      expect(JSON.stringify(observing.requests[0])).toContain(creative.content)
      expect(JSON.stringify(observing.requests[0])).not.toMatch(/500–900|4–6 developed paragraphs/u)
      await expect(JSON.stringify({ system: observing.requests[0]?.system, scene, creative }, null, 2) + '\n')
        .toMatchFileSnapshot('./expected/director-observer-request.json')
      const actorRequest = observing.requests[2]!
      expect(actorRequest.messages.some(message => message.content.some(block =>
        block.type === 'text' && block.text.includes(performanceCue)))).toBe(true)
      const cued = scaffold.ctx.agents.list().flatMap(agent => agent.session.events).findLast(event =>
        event.type === 'roleplay/execution-request' && 'actorId' in event.data.context && event.data.context.instanceId === b)
      if (cued?.type !== 'roleplay/execution-request') throw new Error('Missing cued actor request')
      await expect(JSON.stringify(cued.data.context.sections.find(section => section.id === 'scene-style'), null, 2) + '\n')
        .toMatchFileSnapshot('./expected/actor-performance-cue.json')
      const recipe = recipeOf(commands.snapshot(b))
      configuration.setRecipe(scope(b), { ...recipe, director: recipe.director.map(section => section.id === 'performance'
        ? { ...section, content: 'Write 1000–1500 characters for the next substantive narration.' } : section) })
      const recovery = new RecoveryApplication(commands, { capture: async () => null, cancel: async () => {} })
      await recovery.rewrite(scope(b), recorded.data.context.revision, 'Continue again.', (scope, instruction) => director.run(scope, instruction))
      const rewritten = observing.requests[3]!
      expect(JSON.stringify(rewritten)).toContain('Write 1000–1500 characters')
      expect(JSON.stringify(rewritten)).not.toContain('500–900')
      const activeCreative = directorQueries.context({ instanceId: b, instruction: '' }).sections.find(section => section.id === 'performance')!
      expect(rewritten.messages.some(message => message.content.some(block => block.type === 'text' && block.text.includes(activeCreative.content)))).toBe(true)
      await expect(JSON.stringify(activeCreative, null, 2) + '\n').toMatchFileSnapshot('./expected/rewritten-director-creative.json')
      configuration.setRecipe(scope(b), { ...recipeOf(commands.snapshot(b)), narrationLength: { enabled: true, minimum: 10, target: 15 } })
      await director.run(scope(b), 'Describe the rain.')
      expect(JSON.stringify(observing.requests[4])).toContain('最低 10 字，目标 15 字')
      expect(JSON.stringify(observing.requests[5])).toContain('Nothing was published')
      expect(JSON.stringify(observing.requests[5])).toContain('short-narration')
      const published = commands.snapshot(b).entities.filter(item => item.key.collection === 'narration')
      expect(published).toHaveLength(1)
      expect(queries.actorContext({ instanceId: b, actorId: 'keeper', query: '' }).text.split('SHARED-RAIN')).toHaveLength(2)
      expect(JSON.stringify(published)).toContain('雨落窗边。\\n\\n水珠顺着木框慢慢滚落。')
      await expect(director.run(scope(b), 'Describe the clouds.')).rejects.toThrow('3/10')
      expect(observing.requests).toHaveLength(10)
      expect(commands.snapshot(b).entities.filter(item => item.key.collection === 'facts')).toHaveLength(1)
      const length = directorQueries.context({ instanceId: b, instruction: '' }).sections.find(section => section.id === 'narration-length')
      await expect(JSON.stringify({ length, tools: observing.requests[4]?.tools }, null, 2) + '\n')
        .toMatchFileSnapshot('./expected/narration-length-protocol.json')
    } finally {
      await director.dispose(); await actorRuntime.dispose(); await directorHarness.dispose()
    }
    const consolidatedInstance = create()
    people.stage(scope(consolidatedInstance), { id: 'inn', location: 'Inn', present: ['keeper'], appearances: [] })
    configuration.setStyle(scope(consolidatedInstance), { scope: 'story', key: 'actor:keeper',
      profile: styleProfileSchema.parse({ kind: 'actor', guidance: { lengthPreference: 'PUBLIC-ACTOR-LENGTH: write 400–800 characters.' } }) })
    new ConfigurationApplication(commands).setStyle(scope(consolidatedInstance), {
      scope: 'scene', sceneId: 'inn', key: 'actor:keeper', instruction: 'PUBLIC-SCENE-CUE: greet the next visitor in three paragraphs.',
    })
    selectedProvider = 'consolidation'; selectedModel = 'mock'
    const consolidating = new MockAdapter([
      toolCallResponse('ordinary-memory-source', 'npc_commit_turn', { posture: 'watching',
        memories: [{ content: 'PERSONAL-RETELLING: I remember promising the room.', importance: 4 }],
        behavior: [{ kind: 'speech', text: 'I will keep the room until morning.' }] }),
      textResponse('I remember the promise.'),
      toolCallResponse('missing-memory-sources', 'npc_commit_turn', { posture: 'silent', context_update: [] }),
      () => {
        const sourceIds = evidenceFor(commands.snapshot(consolidatedInstance), 'keeper').map(item => item.id)
        return toolCallResponse('wrong-note-target', 'npc_commit_turn', { posture: 'silent', context_update: [{
          sourceIds, disposition: 'represented', reason: 'Remember the promise.', changes: [{
            operation: 'revise', noteId: 'my-personal-memory', expectedRevision: 1, kind: 'promise',
            text: 'I promised a room until morning.', sourceIds,
          }],
        }] })
      },
      (request) => {
        expect(JSON.stringify(request.messages)).toContain('PRIVATE MEMORY CONSOLIDATION')
        expect(request.system).toContain('You privately consolidate')
        expect(request.system).not.toContain('Read DISCUSSION FLOOR before choosing behavior')
        expect(JSON.stringify(request.messages)).toContain('Ordinary assistant prose does not save memory.')
        expect(JSON.stringify(request.messages)).toContain('Context note target is unavailable.')
        expect(JSON.stringify(request.messages)).toContain('use operation=add and omit noteId and expectedRevision')
        expect(JSON.stringify(request.messages)).not.toContain('submit an empty behavior array with the appropriate posture')
        expect(JSON.stringify(request.messages)).not.toContain('INSTANCE-A-ONLY')
        expect(JSON.stringify(request.messages)).not.toContain('PERSONAL-RETELLING')
        const tool = request.tools!.find(tool => tool.name === 'npc_commit_turn')!
        expect(Object.keys(tool.parameters.properties!)).toEqual(['posture', 'context_update'])
        expect(validateJsonSchemaValue(tool.parameters, { posture: 'finished', context_update: [] }, '')).not.toEqual([])
        const sourceIds = evidenceFor(commands.snapshot(consolidatedInstance), 'keeper').map(item => item.id)
        expect(JSON.stringify(request.messages)).toContain('Coverage errors:')
        expect(JSON.stringify(request.messages)).toContain('$source:1')
        expect(JSON.stringify(request.messages)).toContain('Use each listed sourceRef')
        for (const sourceId of sourceIds) expect(JSON.stringify(request.messages)).toContain(sourceId)
        const refs = sourceIds.map((_, index) => `$source:${index + 1}`)
        expect(commands.snapshot(consolidatedInstance).entities.filter(item => item.key.collection === 'retention')).toEqual([])
        return toolCallResponse('private-consolidation', 'npc_commit_turn', { posture: 'silent', context_update: [{
          sourceIds: refs, disposition: 'represented', reason: 'Remember my deadline.', changes: [{ operation: 'add', kind: 'promise',
            text: 'I promised a room until morning.', sourceIds: refs,
          }],
        }] })
      },
      (request) => {
        expect(request.system).toContain('You perform one autonomous fictional character')
        expect(request.system).not.toContain('You privately consolidate')
        expect(JSON.stringify(request)).toContain('PUBLIC-SCENE-CUE')
        expect(JSON.stringify(request)).toContain('PUBLIC-ACTOR-LENGTH')
        expect(JSON.stringify(request)).toContain('PERSONAL-RETELLING')
        expect(JSON.stringify(request.messages)).not.toContain('[PRIVATE MEMORY CONSOLIDATION]')
        const tool = request.tools!.find(tool => tool.name === 'npc_commit_turn')!
        expect(tool.parameters.properties).toHaveProperty('behavior')
        expect(validateJsonSchemaValue(tool.parameters, { posture: 'watching' }, '')).toEqual([])
        return toolCallResponse('ordinary-after-consolidation', 'npc_commit_turn', { posture: 'watching' })
      },
    ])
    scaffold.ctx.llm.registerAdapter(['consolidation'], consolidating)
    const consolidator = new ActorRuntime(commands, cognition, queries, harness, values, 1)
    try {
      const requestScope = scope(consolidatedInstance)
      const accepted = await consolidator.run(requestScope, 'keeper')
      const actor = scaffold.ctx.agents.list().find(agent => agent.session.events.some(event =>
        event.type === 'roleplay/execution-request' && event.data.context.instanceId === consolidatedInstance))!
      const requests = actor.session.events.filter(event => event.type === 'roleplay/execution-request')
      expect(requests).toHaveLength(2)
      const ordinarySections = requests[0]!.data.context.sections
      const privateSections = requests[1]!.data.context.sections
      expect(ordinarySections.some(section => section.id === 'performance')).toBe(true)
      expect(ordinarySections.some(section => section.id === 'scene-style')).toBe(true)
      expect(JSON.stringify(ordinarySections)).toContain('PUBLIC-ACTOR-LENGTH')
      expect(privateSections.some(section => ['performance', 'style', 'scene-style'].includes(section.id))).toBe(false)
      expect(privateSections.filter(section => section.id === 'evidence' && !section.sources.includes('recipe:evidence'))).toEqual([])
      expect(privateSections.some(section => section.id === 'identity')).toBe(true)
      expect(privateSections.find(section => section.id === 'consolidation')?.content).toContain('\n```\n')
      expect(requests[1]!.data.context.sources).toEqual(privateSections.flatMap(section => section.sources))
      expect(JSON.stringify(consolidating.requests[1])).not.toContain('PUBLIC-SCENE-CUE')
      expect(JSON.stringify(consolidating.requests[1])).not.toContain('PUBLIC-ACTOR-LENGTH')
      await expect(JSON.stringify(privateSections.map(section => ({ id: section.id, role: section.role })), null, 2) + '\n')
        .toMatchFileSnapshot('./expected/private-actor-context-sections.json')
      expect(requests[1]?.type === 'roleplay/execution-request' && requests[1].data.context.sections.some(section => section.id === 'consolidation')).toBe(true)
      expect(actor.session.events.filter(event => event.type === 'roleplay/execution-receipt')).toHaveLength(2)
      const retained = commands.snapshot(consolidatedInstance).entities.filter(item => item.key.collection === 'retention')
      expect(JSON.stringify(retained)).not.toContain('$source:')
      for (const source of evidenceFor(commands.snapshot(consolidatedInstance), 'keeper')) expect(JSON.stringify(retained)).toContain(source.id)
      const usage = sumExecutionUsage([{ id: actor.session.id, events: actor.session.events }])
      expect(usage.usage).toMatchObject({ uncachedInputTokens: 50, outputTokens: 43 })
      expect(await consolidator.run(requestScope, 'keeper')).toEqual(accepted)
      expect(consolidating.requests).toHaveLength(5)
      await expect(JSON.stringify({ system: consolidating.requests[1]?.system, tools: consolidating.requests[1]?.tools }, null, 2) + '\n')
        .toMatchFileSnapshot('./expected/private-consolidation-protocol.json')
      expect(sumExecutionUsage([{ id: actor.session.id, events: actor.session.events }])).toEqual(usage)
      await consolidator.run(scope(consolidatedInstance), 'keeper')
      expect(consolidating.requests).toHaveLength(6)
      expect(actor.session.events.filter(event => event.type === 'roleplay/execution-receipt')).toHaveLength(3)
      expect(commands.snapshot(consolidatedInstance).entities.filter(item => item.key.collection === 'behavior')).toHaveLength(1)
    } finally { await consolidator.dispose() }
    const directorMemoryInstance = create()
    people.stage(scope(directorMemoryInstance), { id: 'inn', location: 'Inn', present: ['keeper'], appearances: [] })
    configuration.setStyle(scope(directorMemoryInstance), { scope: 'story', key: 'director',
      profile: styleProfileSchema.parse({ kind: 'director', guidance: { lengthPreference: 'PUBLIC-DIRECTOR-LENGTH: write three paragraphs.' } }) })
    configuration.setStyle(scope(directorMemoryInstance), { scope: 'scene', sceneId: 'inn', key: 'director',
      instruction: 'PUBLIC-DIRECTOR-CUE: describe the rain.' })
    const memoryScope = scope(directorMemoryInstance)
    const sourceIds = [`player-input:${memoryScope.id}`]
    const memoryProvider = new MockAdapter([
      toolCallResponse('ordinary-finish', 'director_command', { command: { operation: 'finish', actors: [], advanceDiscussion: false } }),
      toolCallResponse('wrapped-director-memory', 'director_command', {
        arguments: { command: { operation: 'context-update', input: [] } },
      }),
      toolCallResponse('incomplete-director-memory', 'director_command', { command: { operation: 'context-update', input: [] } }),
      (request) => {
        expect(JSON.stringify(request.messages)).toContain('DIRECTOR MEMORY CONSOLIDATION')
        expect(request.system).toContain('You privately consolidate the director')
        expect(request.system).toContain('Never add an arguments wrapper or nest command.command.')
        expect(JSON.stringify(request.messages)).toContain('missing required property')
        expect(request.tools!.map(tool => tool.name)).toEqual(['director_command'])
        const schema = request.tools![0]!.parameters
        expect(validateJsonSchemaValue(schema, { command: { operation: 'finish', actors: [], advanceDiscussion: false } }, '')).toEqual([])
        expect(validateJsonSchemaValue(schema, { command: { operation: 'stage', input: { id: 'inn', location: 'Inn', present: ['keeper'], appearances: [] } } }, '')).not.toEqual([])
        expect(JSON.stringify(request.messages)).toContain('Coverage errors:')
        expect(JSON.stringify(request.messages)).toContain('Send one complete context-update')
        expect(JSON.stringify(request.messages)).toContain('$source:1')
        expect(commands.snapshot(directorMemoryInstance).entities.filter(item => item.key.collection === 'retention')).toEqual([])
        expect(JSON.stringify(request.messages)).not.toContain('INSTANCE-A-ONLY')
        return toolCallResponse('director-memory', 'director_command', { command: { operation: 'context-update', input: [{
          sourceIds: ['$source:1'], disposition: 'represented', reason: 'Retain the direction.', changes: [{ operation: 'add', kind: 'player-direction',
            text: 'The player asked to watch the door.', sourceIds: ['$source:1'] }],
        }] } })
      },
      toolCallResponse('memory-finish', 'director_command', { command: { operation: 'finish', actors: [], advanceDiscussion: false } }),
      (request) => {
        expect(request.system).not.toContain('You privately consolidate the director')
        expect(request.tools!.map(tool => tool.name)).toContain('director_observe')
        expect(request.tools!.map(tool => tool.name)).toContain('director_revise_narration')
        expect(JSON.stringify(request)).toContain('PUBLIC-DIRECTOR-LENGTH')
        expect(JSON.stringify(request)).toContain('PUBLIC-DIRECTOR-CUE')
        return toolCallResponse('ordinary-after-director-memory', 'director_command', { command: { operation: 'finish', actors: [], advanceDiscussion: false } })
      },
    ])
    scaffold.ctx.llm.registerAdapter(['director-memory'], memoryProvider)
    const memoryHarness = new HarnessDirectorExecutor(scaffold.ctx.agents, {
      agentOptions: { provider: 'director-memory', model: 'mock' }, setup: async () => {},
      exists: async id => (await scaffold.ctx.sessionPersistence.list()).some(session => session.id === id),
      flush: async (session) => { await scaffold.ctx.sessions.flush(session) },
    })
    const memoryActors = new ActorRuntime(commands, cognition, queries, harness, values)
    const memoryDirector = new DirectorRuntime(commands, new DirectorCommands(commands, values, 16), directorQueries, queries,
      memoryHarness, memoryActors, new DiscussionRuntime(commands, memoryActors, values, 12), values, 12, 20000, 0, 1)
    try {
      const result = await memoryDirector.run(memoryScope, 'Watch the door.')
      const agent = scaffold.ctx.agents.list().find(agent => agent.session.events.some(event =>
        event.type === 'roleplay/execution-request' && event.data.context.instanceId === directorMemoryInstance))!
      const requests = agent.session.events.filter(event => event.type === 'roleplay/execution-request')
      expect(requests).toHaveLength(2)
      expect(JSON.stringify(requests[1])).toContain('DIRECTOR MEMORY CONSOLIDATION')
      expect(JSON.stringify(requests[0])).toContain('PUBLIC-DIRECTOR-LENGTH')
      expect(JSON.stringify(requests[0])).toContain('PUBLIC-DIRECTOR-CUE')
      expect(JSON.stringify(memoryProvider.requests[1])).not.toContain('PUBLIC-DIRECTOR-LENGTH')
      expect(JSON.stringify(memoryProvider.requests[1])).not.toContain('PUBLIC-DIRECTOR-CUE')
      const memorySections = requests[1]!.data.context.sections
      expect(memorySections.find(section => section.id === 'consolidation')?.content).toContain('\n```\n')
      expect(memorySections.some(section => ['performance', 'style', 'scene-style', 'narration-length'].includes(section.id))).toBe(false)
      await expect(JSON.stringify(memorySections.map(section => ({ id: section.id, role: section.role })), null, 2) + '\n')
        .toMatchFileSnapshot('./expected/private-director-context-sections.json')
      const retained = commands.snapshot(directorMemoryInstance).entities.filter(item => item.key.collection === 'retention')
      expect(JSON.stringify(retained)).not.toContain('$source:')
      expect(JSON.stringify(retained)).toContain(sourceIds[0])
      const usage = sumExecutionUsage([{ id: agent.session.id, events: agent.session.events }])
      expect(usage.usage).toMatchObject({ uncachedInputTokens: 50, outputTokens: 25 })
      expect(await memoryDirector.run(memoryScope, 'Watch the door.')).toEqual(result)
      expect(memoryProvider.requests).toHaveLength(5)
      expect(sumExecutionUsage([{ id: agent.session.id, events: agent.session.events }])).toEqual(usage)
      await expect(JSON.stringify({ system: memoryProvider.requests[1]?.system, tools: memoryProvider.requests[1]?.tools }, null, 2) + '\n')
        .toMatchFileSnapshot('./expected/private-director-consolidation-protocol.json')
      expect(memoryProvider.requests[0]!.tools!.map(tool => tool.name)).toContain('director_observe')
      const ordinaryDirector = new DirectorRuntime(commands, new DirectorCommands(commands, values, 16), directorQueries, queries,
        memoryHarness, memoryActors, new DiscussionRuntime(commands, memoryActors, values, 12), values, 12, 20000, 0, 0)
      try {
        await ordinaryDirector.run(scope(directorMemoryInstance), 'Keep watching.')
        expect(memoryProvider.requests).toHaveLength(6)
      } finally { await ordinaryDirector.dispose() }
    } finally { await memoryDirector.dispose(); await memoryActors.dispose(); await memoryHarness.dispose() }
  } finally {
    await harness.dispose(); await scaffold.close(); store.close(); await rm(root, { recursive: true, force: true })
  }
}, 30000)
