import type {} from '../../../api/roleplay-controller/src/index.ts'
import { performanceUsage } from './performance-usage.ts'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
/** Supported Loader composition owns SQLite, application capabilities, and their disposal. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { expect, it, vi } from 'vitest'
import type {} from '../src/index.ts'
import { createPersonSchema, canonical } from '@deepseek-ai/dsh-roleplay-core'
import type { BookId, CommandId, CommandScope, InstanceId } from '@deepseek-ai/dsh-roleplay-core'
import { parseStorybookDocument } from '@deepseek-ai/dsh-roleplay-core/storybook'
import { castOf, discussionsOf } from '@deepseek-ai/dsh-roleplay-core/world'
import { launchWebScaffold, type LaunchOptions } from '../../../../apps/web/tests/scaffold.ts'
import { MockAdapter, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

class RecordedMock extends MockAdapter {
  override reconstructRequest(options: GenerateOptions): string { return JSON.stringify(options) }
}

class ConcurrentPreparationMock extends RecordedMock {
  readonly release: (() => void)[] = []
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    let first = true
    for await (const chunk of super.stream(options)) {
      if (first && this.requests.indexOf(options) < 2) {
        await new Promise<void>((resolve) => {
          const release = () => { options.signal?.removeEventListener('abort', release); resolve() }
          this.release[this.requests.indexOf(options)] = release
          options.signal?.addEventListener('abort', release, { once: true })
        })
      }
      first = false
      yield chunk
    }
  }
}

it('loads independent application services, restarts pinned versions, and releases and reloads their ownership', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-roleplay-services-'))
  const options: LaunchOptions = {
    extraOverlayPath: fileURLToPath(new URL('../../../experimental/roleplay-web-profile/cordis.patch.yml', import.meta.url)),
    extraInstallAnchors: [fileURLToPath(new URL('../../../experimental/roleplay-web-profile/package.json', import.meta.url))],
    directoryPickerMode: 'overlay', extraEntryOverrides: [
      { id: 'story-home', config: { root } },
      { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions') } },
      { id: 'storage-json', config: { root: join(root, 'storages') } },
      { id: 'roleplay-services', config: {
        databasePath: join(root, 'independent.sqlite'), journalMode: 'wal', busyTimeoutMs: 1000, provider: 'mock', model: 'mock',
        characterLimits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
          maxActiveGoals: 32, maxScheduledIntentions: 32 },
        recallCharacterLimit: 6000,
        queryPageLimit: 40, notificationIntervalMs: 10, directorCommandLimit: 12, reactiveDirectorLimit: 1,
        discussionTurnLimit: 16,
        maxContextUpdateUnits: 16,
      } },
    ],
  }
  let scaffold = await launchWebScaffold(options)
  const scope = (id: InstanceId): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
    expectedRevision: scaffold.ctx.roleplayHistory.snapshot(id).instance.revision, principal: { kind: 'player' } })
  const rpc = async <T>(method: string, request: unknown): Promise<T> => {
    const endpoint = `roleplay/${method}`
    const response = await scaffold.hostFetch(`/api/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: endpoint, payload: { args: { request } } }) })
    expect(response.status).toBe(200)
    const result = (await response.json() as { result: { ok: boolean; value: T; error?: unknown } }).result
    expect(result, JSON.stringify(result.error)).toMatchObject({ ok: true })
    return result.value
  }
  try {
    const { ctx } = scaffold
    const minimalDraft = await rpc<import('@deepseek-ai/dsh-roleplay-core').BookDraft>('saveDraft', {
      id: 'minimal', expectedRevision: 0, title: 'Minimal world', resources: [],
      document: { schemaVersion: 6, id: 'minimal', title: 'Unreviewed title', directorPrompt: '', directorGuidance: {}, characters: [] },
    })
    const publication = await rpc<import('@deepseek-ai/dsh-roleplay-core').BookDraft>('previewPublication', {
      bookId: minimalDraft.id, expectedRevision: minimalDraft.revision,
    })
    expect(publication.document.title).toBe('Minimal world')
    expect(publication.document.contextRules).toBeDefined()
    expect(ctx.roleplayBooks.draft(minimalDraft.id)?.document.contextRules).toBeUndefined()
    const minimalVersion = await rpc<import('@deepseek-ai/dsh-roleplay-core').TemplateVersion>('publish', {
      bookId: minimalDraft.id, expectedRevision: minimalDraft.revision,
    })
    expect(minimalVersion.document).toEqual(publication.document)
    const initialAgentCount = ctx.agents.list().length
    const document = JSON.parse(canonical(parseStorybookDocument({ schemaVersion: 6, id: 'inn', title: 'Inn', directorPrompt: '', directorGuidance: {},
      characters: [{ actorId: 'keeper', displayName: 'The keeper', publicPersona: 'Keeps an inn.', rolePrompt: '',
        capabilities: ['speak', 'memory'], actingGuidance: {} }] }))) as import('@deepseek-ai/dsh-roleplay-core/types').Document
    const draft = ctx.roleplayBooks.saveDraft({ id: 'inn' as BookId, expectedRevision: 0, title: 'Inn', document, resources: [] })
    const version = ctx.roleplayBooks.publish(draft.id, draft.revision)
    const a = (await rpc<{ id: InstanceId }>('createStory', { templateVersionId: version.id, commandId: randomUUID() })).id
    const b = ctx.roleplayInstances.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId }).instance.id
    for (const id of [a, b]) ctx.roleplayPeople.stage(scope(id), { id: 'inn', location: 'Inn', present: ['keeper'], appearances: [] })
    expect(ctx.agents.list()).toHaveLength(initialAgentCount)
    const openingRevision = scope(a).expectedRevision
    await rpc('checkpoint', { instanceId: a, commandId: randomUUID(), expectedRevision: openingRevision, name: 'opening' })
    const workspace = await rpc<import('@deepseek-ai/dsh-roleplay-core').AuthorWorkspaceView>('authorWorkspace', { instanceId: a })
    await rpc('contextRecipe', { instanceId: a, commandId: randomUUID(), expectedRevision: workspace.instance.revision,
      input: { ...workspace.contextRecipe, actor: [
        { id: 'custom:voice-example', enabled: true, role: 'system', title: 'Voice example', content: 'REFERENCE-ONLY-VOICE: A room, perhaps.' },
        ...workspace.contextRecipe.actor,
      ] } })
    const model = new MockAdapter([toolCallResponse('commit-a', 'npc_commit_turn', { posture: 'waiting',
      memories: [{ content: 'ONLY-IN-A: I promised the room.' }], behavior: [{ kind: 'speech', text: 'It is yours.' }],
      context_update: [{ sourceIds: ['$behavior:0'], disposition: 'represented', reason: 'Keep the claim.',
        changes: [{ operation: 'add', kind: 'claim', text: 'REVIEWED-ROOM-CLAIM', sourceIds: ['$behavior:0'] }] }] })])
    ctx.llm.registerAdapter(['mock'], model)
    await ctx.roleplayRuntime.run(scope(a), 'keeper')
    expect(ctx.roleplayViews.actorContext({ instanceId: a, actorId: 'keeper', query: '' }).text).toContain('ONLY-IN-A')
    expect(model.requests[0]?.messages[0]).toMatchObject({ role: 'system' })
    expect(JSON.stringify(model.requests[0]?.messages[0])).toContain('REFERENCE-ONLY-VOICE')
    expect(ctx.roleplayViews.actorContext({ instanceId: b, actorId: 'keeper', query: '' }).text).not.toContain('ONLY-IN-A')
    const retained = await rpc<import('@deepseek-ai/dsh-roleplay-core').RetentionReviewView>('retention', { instanceId: a, owner: 'actor:keeper' })
    expect(retained.retention.notes).toEqual([])
    const proposal = retained.retention.proposals[0]!
    const actorCount = ctx.agents.list().length
    await rpc('reviewRetention', { instanceId: a, commandId: randomUUID(), expectedRevision: retained.revision,
      input: { operation: 'review', owner: 'actor:keeper', reviews: [{ id: proposal.id, revision: proposal.revision, approve: true }] } })
    expect(ctx.agents.list()).toHaveLength(actorCount)
    expect(ctx.roleplayViews.actorContext({ instanceId: a, actorId: 'keeper', query: '' }).text).toContain('REVIEWED-ROOM-CLAIM')
    const recalled = await rpc<import('@deepseek-ai/dsh-roleplay-core').NarrativeRecallView>('recall', {
      instanceId: a, owner: 'actor:keeper', input: { query: 'ONLY-IN-A', offset: 0, limit: 2 } })
    expect(recalled.total).toBe(1)
    const recalledNote = await rpc<import('@deepseek-ai/dsh-roleplay-core').NarrativeRecallView>('recall', {
      instanceId: a, owner: 'actor:keeper', input: { query: 'REVIEWED-ROOM-CLAIM', offset: 0, limit: 1 } })
    expect(recalledNote.entries[0]).toMatchObject({ kind: 'context-summary', revision: 1, revisionScope: 'record' })
    expect(recalled.entries[0]).not.toHaveProperty('revisionScope')
    const edited = ctx.roleplayBooks.saveDraft({ id: draft.id, expectedRevision: ctx.roleplayBooks.draft(draft.id)!.revision,
      title: 'New inn', document: { ...document, title: 'New inn' }, resources: [] })
    const latest = ctx.roleplayBooks.publish(edited.id, edited.revision)
    const restart = ctx.roleplayInstances.restart({ instanceId: a, commandId: randomUUID() as CommandId })
    expect(restart.instance.templateVersionId).toBe(version.id)
    expect(restart.instance.templateVersionId).not.toBe(latest.id)
    expect(ctx.roleplayViews.actorContext({ instanceId: restart.instance.id, actorId: 'keeper', query: '' }).text).not.toContain('ONLY-IN-A')
    const exported = ctx.roleplayArchives.export(a, [])
    const imported = ctx.roleplayArchives.import(exported, randomUUID() as CommandId)
    expect(imported.instance.id).not.toBe(a)
    await scaffold.close()
    expect(ctx.get('roleplayBooks')).toBeUndefined()
    expect(ctx.get('roleplayRuntime')).toBeUndefined()
    expect(ctx.get('roleplayController')).toBeUndefined()
    scaffold = await launchWebScaffold(options)
    expect(scaffold.ctx.roleplayHistory.snapshot(a).instance.templateVersionId).toBe(version.id)
    expect(scaffold.ctx.roleplayViews.actorContext({ instanceId: imported.instance.id, actorId: 'keeper', query: '' }).text).toContain('ONLY-IN-A')
    const resumed = new MockAdapter([toolCallResponse('recall-room', 'narrative_recall', { query: 'ONLY-IN-A', offset: 0, limit: 2 }), toolCallResponse('resume', 'npc_commit_turn', { posture: 'silent', behavior: [] })])
    const stopResumed = scaffold.ctx.llm.registerAdapter(['mock'], resumed)
    await scaffold.ctx.roleplayRuntime.run(scope(a), 'keeper')
    expect(resumed.requests[0]?.sessionId).toBe(model.requests[0]?.sessionId)
    expect(resumed.requests).toHaveLength(2)
    expect(JSON.stringify(resumed.requests[1]?.messages.flatMap(message => message.content.filter(block => block.type === 'tool-result')))).toContain('ONLY-IN-A')
    stopResumed()
    const visitor = scaffold.ctx.roleplayPeople.create(scope(a), createPersonSchema.parse({
      definition: { displayName: 'PRIVATE-NAME-Visitor', appearance: 'a soaked traveler', publicPersona: 'Needs a room.',
        rolePrompt: '', capabilities: ['speak'], actingGuidance: {} },
      purpose: 'Arrives to ask for lodging.', sourceRefs: [], location: 'Inn', importance: 'supporting',
    }))
    const visitorId = (visitor.result as { actorId: string }).actorId
    const openingPeople = await rpc<{ revision: number; entries: { definition: { actorId: string } }[] }>('characters',
      { instanceId: a, revision: openingRevision, query: { query: '', offset: 0, limit: 40 } })
    expect(openingPeople.revision).toBe(openingRevision)
    expect(openingPeople.entries.some(person => person.definition.actorId === visitorId)).toBe(false)
    scaffold.ctx.roleplayPeople.stage(scope(a), { id: 'inn', location: 'Inn', present: ['keeper', visitorId], appearances: [] })
    const startedDiscussion = scaffold.ctx.roleplayDiscussions.start(scope(a), { topic: 'A room', participantIds: ['keeper', visitorId], maxRounds: 1 })
    const discussionModel = new ConcurrentPreparationMock([
      toolCallResponse('prepare-keeper', 'npc_commit_turn', { posture: 'watching', discussion: { action: 'pass', eagerness: 'high' } }),
      toolCallResponse('prepare-visitor', 'npc_commit_turn', { posture: 'watching', discussion: { action: 'pass', eagerness: 'low' } }),
      toolCallResponse('keeper-speaks', 'npc_commit_turn', { posture: 'finished', discussion: { action: 'speak', eagerness: 'high' },
        behavior: [{ kind: 'speech', text: 'One room remains.' }] }),
      toolCallResponse('visitor-speaks', 'npc_commit_turn', { posture: 'finished', discussion: { action: 'speak', eagerness: 'low' },
        behavior: [{ kind: 'speech', text: 'I will take it.' }] }),
    ])
    const stopDiscussion = scaffold.ctx.llm.registerAdapter(['mock'], discussionModel)
    const discussionAdvance = scaffold.ctx.roleplayDiscussionRuntime.advance(scope(a))
    void discussionAdvance.catch(() => { /* Awaited below; also contain teardown after an earlier assertion fails. */ })
    await expect.poll(() => discussionModel.release.filter(Boolean).length).toBe(2)
    const preparationView = () => scaffold.ctx.roleplayPlay.read({ instanceId: a, audience: { kind: 'observer' }, offset: 0, limit: 40 })
    expect(preparationView().discussion?.preparation).toEqual({ completed: 0, total: 2 })
    const preparationRecords = preparationView().discussionPreparation!.actors
    expect(preparationRecords.every(actor => actor.revision !== undefined && actor.attempt !== undefined)).toBe(true)
    const beforePreparationRows = preparationView().rows
    const preparationRevisions = discussionModel.requests.map((request) => {
      const session = scaffold.ctx.sessions.get(request.sessionId!)!
      const event = session.events.findLast(event => event.type === 'roleplay/execution-request')!
      if (event.type !== 'roleplay/execution-request') throw new Error('Missing preparation request')
      return event.data.context.revision
    })
    expect(preparationRevisions[0]).toBe(preparationRevisions[1])
    discussionModel.release[1]!()
    await expect.poll(() => preparationView().discussion?.preparation?.completed).toBe(1)
    expect(discussionModel.requests).toHaveLength(2)
    expect(preparationView().rows).toEqual(beforePreparationRows)
    discussionModel.release[0]!()
    expect(await discussionAdvance).toMatchObject({ status: 'awaiting-director', completedTurns: 4 })
    expect(preparationView().discussion?.preparation).toBeUndefined()
    expect(preparationView().discussionPreparation).toMatchObject({ completed: 2, total: 2 })
    for (const record of preparationRecords) {
      expect(preparationView().discussionPreparation!.actors.find(actor => actor.actorId === record.actorId))
        .toMatchObject({ revision: record.revision, attempt: record.attempt, ready: true })
      const prepScope = { instanceId: a, actorId: record.actorId, revision: record.revision! }
      const prepRequests = await scaffold.ctx.roleplayExecutionHistory.list(prepScope, 0, 40)
      expect(prepRequests.entries[0]?.attempt).toBe(record.attempt)
      const prepDetail = await scaffold.ctx.roleplayExecutionHistory.read(prepScope, prepRequests.entries[0]!.requestId)
      expect(prepDetail.response?.toolCalls[0]?.arguments).toContain('"action":"pass"')
    }
    expect(discussionModel.requests).toHaveLength(4)
    expect(JSON.stringify(discussionModel.requests)).not.toContain('PRIVATE-NAME-Visitor')
    const requestSession = scaffold.ctx.sessions.get(discussionModel.requests[0]!.sessionId!)!
    const requestPreview = await scaffold.ctx.roleplayRequests.inspect({ sessionId: requestSession.id,
      beforeEventSeq: requestSession.events.length })
    expect(requestPreview.requestJson).toContain('[DISCUSSION FLOOR]')
    expect(requestPreview.requestJson).not.toContain('I will take it.')
    expect((JSON.parse(requestPreview.requestJson) as { messages: unknown }).messages).toEqual(discussionModel.requests[2]?.messages)
    const historyScope = { instanceId: a, revision: scaffold.ctx.roleplayHistory.snapshot(a).instance.revision, actorId: 'keeper' }
    const requests = await scaffold.ctx.roleplayExecutionHistory.list(historyScope, 0, 1)
    expect(requests.entries[0]).toMatchObject({ provider: 'mock', status: 'response-recorded' })
    expect(requests.nextOffset).toBe(1)
    const actual = await scaffold.ctx.roleplayExecutionHistory.read(historyScope, requests.entries[0]!.requestId)
    expect((JSON.parse(actual.requestJson) as { messages: unknown }).messages).toEqual(discussionModel.requests[2]?.messages)
    expect((await scaffold.ctx.roleplayExecutionHistory.list({ ...historyScope, revision: 0 }, 0, 10)).entries).toEqual([])
    expect((await scaffold.ctx.roleplayExecutionHistory.list({ ...historyScope, instanceId: b,
      revision: scaffold.ctx.roleplayHistory.snapshot(b).instance.revision }, 0, 10)).entries).toEqual([])
    await expect(scaffold.ctx.roleplayExecutionHistory.read(historyScope, Number.MAX_SAFE_INTEGER)).rejects.toThrow('unavailable')
    const historicalRpc = await rpc<{ requestJson: string }>('executionRequest', { ...historyScope, requestId: requests.entries[0]!.requestId })
    expect(historicalRpc.requestJson).toBe(actual.requestJson)
    expect(scaffold.ctx.roleplayArchives.export(a, []).commits.length).toBeGreaterThan(exported.commits.length)
    const play = await rpc<{ phase: string; rows: { text: string }[] }>('play', { instanceId: a, audience: { kind: 'observer' }, offset: 0, limit: 40 })
    expect(play.phase).toBe('awaiting-director')
    expect(play.rows.map(row => row.text)).toContain('I will take it.')
    expect(play.rows.find(row => row.text === 'I will take it.')).toMatchObject({
      speaker: { label: 'a soaked traveler', trueName: 'PRIVATE-NAME-Visitor' },
    })
    const castImport = scaffold.ctx.roleplayArchives.import(scaffold.ctx.roleplayArchives.export(a, []), randomUUID() as CommandId)
    const importedPlay = scaffold.ctx.roleplayPlay.read({ instanceId: castImport.instance.id, audience: { kind: 'observer' }, offset: 0, limit: 40 })
    expect(importedPlay.rows).toEqual(play.rows)
    const followSignal = new AbortController()
    const following = scaffold.ctx.roleplayController.followPlay({ instanceId: a, audience: { kind: 'observer' }, offset: 0, limit: 40 },
      followSignal.signal)[Symbol.asyncIterator]()
    const initialFollow = await following.next()
    expect(initialFollow.done ? [] : initialFollow.value.rows.map(row => row.text)).toContain('I will take it.')
    const nextView = following.next()
    const noticeScope = scope(a)
    await rpc('observe', { instanceId: a, commandId: noticeScope.id, expectedRevision: noticeScope.expectedRevision,
      input: { summary: 'Lantern brightens.', content: 'A lantern brightens.', narration: 'The lantern brightens.', state: [], deliveries: [] } })
    const notified = await nextView
    expect(notified.done ? [] : notified.value.rows.map(row => row.text)).toContain('The lantern brightens.')
    expect(notified.done ? [] : notified.value.people).toContainEqual(expect.objectContaining({
      label: 'a soaked traveler', trueName: 'PRIVATE-NAME-Visitor',
    }))
    followSignal.abort()
    expect((await following.next()).done).toBe(true)
    const agentsBeforeInspect = scaffold.ctx.agents.list().length
    const cognition = await rpc<{ current: { memories: { content: string }[] } }>('cognition', { instanceId: b, actorId: 'keeper' })
    expect(cognition.current.memories).toEqual([])
    expect(scaffold.ctx.agents.list()).toHaveLength(agentsBeforeInspect)
    stopDiscussion()
    const directorModel = new RecordedMock([
      toolCallResponse('director-outline', 'director_command', { command: { operation: 'outline', input: { expectedRevision: 0,
        reason: 'Give the scene a direction.', premise: 'DIRECTOR-PRIVATE-KEY-PLAN' } } }),
      toolCallResponse('director-find', 'director_command', { command: { operation: 'find', query: 'Visitor', offset: 0, limit: 2 } }),
      toolCallResponse('director-resolve', 'director_command', { command: { operation: 'discussion-control', input: { operation: 'close',
        discussionId: (startedDiscussion.result as { discussionIds: string[] }).discussionIds[0],
        status: 'completed' } } }),
      toolCallResponse('director-invalid-observe', 'director_observe', { command: { command: { operation: 'observe',
        input: { summary: 'REJECTED-NARRATION', content: 'REJECTED-NARRATION', narration: 'REJECTED-NARRATION', deliveries: [], state: [] } } } }),
      toolCallResponse('director-observe', 'director_observe', { settles: [], summary: 'A key was laid down.',
        content: 'A room key lies on the table.', narration: 'A key glints beside [[person:keeper]].', state: [],
        deliveries: [{ actorId: visitorId, content: 'A key lies beside [[person:keeper]].', kind: 'observation', sourceRefs: [] }] }),
      toolCallResponse('director-finish', 'director_command', { command: { operation: 'finish', actors: ['keeper'], advanceDiscussion: false } }),
      toolCallResponse('actor-after-director', 'npc_commit_turn', { posture: 'finished',
        behavior: [{ kind: 'speech', text: 'I have the key.' }] }),
      (options) => {
        expect(JSON.stringify(options.messages)).toContain('I have the key.')
        return toolCallResponse('director-reactive-finish', 'director_command', {
          command: { operation: 'finish', actors: [], advanceDiscussion: false },
        })
      },
    ])
    const stopDirector = scaffold.ctx.llm.registerAdapter(['mock'], directorModel)
    const directorScope = scope(a)
    expect(await rpc<{ status: string }>('advance', { instanceId: a, commandId: directorScope.id,
      expectedRevision: directorScope.expectedRevision, instruction: 'Give them the room key.' })).toMatchObject({ status: 'completed' })
    expect(directorModel.requests).toHaveLength(8)
    expect(JSON.stringify(directorModel.requests[7])).toContain('bounded response selection')
    expect(directorModel.requests[0]!.sessionId).not.toBe(directorModel.requests[6]!.sessionId)
    expect(JSON.stringify(directorModel.requests[6])).not.toContain('PRIVATE-NAME-Visitor')
    expect(JSON.stringify(directorModel.requests[6])).not.toContain('DIRECTOR-PRIVATE-KEY-PLAN')
    expect(JSON.stringify(scaffold.ctx.roleplayHistory.snapshot(a))).not.toContain('REJECTED-NARRATION')
    await expect(JSON.stringify({ system: directorModel.requests[0]!.system, tools: directorModel.requests[0]!.tools }, null, 2) + '\n')
      .toMatchFileSnapshot('./expected/director-request-protocol.json')
    expect((await rpc<{ outline: { premise: string } }>('authorWorkspace', { instanceId: a })).outline.premise)
      .toBe('DIRECTOR-PRIVATE-KEY-PLAN')
    const directorSession = scaffold.ctx.sessions.get(directorModel.requests[0]!.sessionId!)!
    expect(directorSession.events.filter(event => event.type === 'roleplay/execution-receipt')).toHaveLength(5)
    const directorRequest = directorSession.events.find(event => event.type === 'roleplay/execution-request')!
    if (directorRequest.type !== 'roleplay/execution-request') throw new Error('Expected director request')
    const context = await rpc<{ text: string }>('directorContextPreview', { instanceId: a,
      revision: directorRequest.data.context.revision, instruction: 'Give them the room key.' })
    expect(context.text).toBe(directorRequest.data.context.text)
    const header = await scaffold.ctx.roleplayRequests.inspect({ sessionId: directorSession.id,
      beforeEventSeq: directorSession.events.length })
    expect((JSON.parse(header.requestJson) as { messages: unknown }).messages).toEqual(directorModel.requests[7]!.messages)
    const coordinates = await scaffold.ctx.roleplayRequests.capture(a, ['keeper', visitorId])
    expect(JSON.stringify(coordinates)).toContain(directorSession.id)
    const beforeEmbodiment = scaffold.ctx.agents.list().length
    const embodiedScope = scope(a)
    const embodied = await rpc<{ execution: string }>('embody', { instanceId: a, commandId: embodiedScope.id,
      expectedRevision: embodiedScope.expectedRevision, input: { actorId: 'keeper', reason: 'Player takes over.',
        behavior: [{ kind: 'speech', text: 'I will wait here.', to: [], delivery: 'spoken' }] } })
    expect(embodied.execution).toBe('cancelled')
    expect((await rpc<{ acceptedRevision: number }>('commandStatus', { instanceId: a, commandId: embodiedScope.id })).acceptedRevision).toBeGreaterThan(0)
    expect(await rpc('commandStatus', { instanceId: b, commandId: embodiedScope.id })).toEqual({ acceptedRevision: null, execution: 'none' })
    expect(scaffold.ctx.agents.list()).toHaveLength(beforeEmbodiment)
    const embodiedPlay = await rpc<{ rows: { origin?: string; text: string }[] }>('play', { instanceId: a, audience: { kind: 'observer' }, offset: 0, limit: 40 })
    expect(embodiedPlay.rows.find(row => row.text === 'I will wait here.')?.origin).toBe('player')
    const worldScope = scope(a)
    expect(await rpc<{ execution: string }>('intervene', { instanceId: a, commandId: worldScope.id, expectedRevision: worldScope.expectedRevision,
      input: { summary: 'Rain stops.', content: 'Rain has stopped.', narration: 'The rain stops.', state: [], deliveries: [] } }))
      .toMatchObject({ execution: 'cancelled' })
    const directedArchive = await rpc<import('@deepseek-ai/dsh-roleplay-core').NarrativeArchive>('exportArchive', {
      instanceId: a, expectedRevision: scope(a).expectedRevision,
    })
    expect(directedArchive.executionEvidence.some(item => item.id === directorSession.id)).toBe(true)
    expect(JSON.stringify(directedArchive.executionEvidence)).toContain('roleplay/execution-request')
    expect(JSON.stringify(directedArchive.executionEvidence)).toContain('Give them the room key.')
    const independent = await rpc<{ id: InstanceId }>('importArchive', { commandId: randomUUID(), archive: directedArchive })
    expect(independent.id).not.toBe(a)
    const importedScope = { instanceId: independent.id, revision: scope(independent.id).expectedRevision, actorId: 'keeper' }
    const archivedRequests = await rpc<import('@deepseek-ai/dsh-roleplay-core/types').ExecutionRequestPage>('executionRequests', {
      ...importedScope, offset: 0, limit: 40,
    })
    expect(archivedRequests.entries.length).toBeGreaterThan(0)
    const archivedRequest = archivedRequests.entries[0]!
    expect(archivedRequest.evidenceId).toBeDefined()
    const archivedBody = await rpc<import('@deepseek-ai/dsh-roleplay-core/types').ExecutionRequestDetail>('executionRequest', {
      ...importedScope, requestId: archivedRequest.requestId, evidenceId: archivedRequest.evidenceId,
    })
    expect(archivedBody.requestJson.length).toBeGreaterThan(100)
    await expect(scaffold.ctx.roleplayExecutionHistory.read({ instanceId: b, revision: scope(b).expectedRevision, actorId: 'keeper' },
      archivedRequest.requestId, archivedRequest.evidenceId)).rejects.toThrow('unavailable')
    const reexported = await rpc<import('@deepseek-ai/dsh-roleplay-core').NarrativeArchive>('exportArchive', {
      instanceId: independent.id, expectedRevision: scope(independent.id).expectedRevision,
    })
    expect(reexported.executionEvidence).toEqual(expect.arrayContaining(directedArchive.executionEvidence))
    stopDirector()
    const restoreScope = scope(a)
    const restored = await rpc<{ execution: string }>('restore', { instanceId: a, commandId: restoreScope.id,
      expectedRevision: restoreScope.expectedRevision, targetRevision: openingRevision, reason: 'Try the opening again.' })
    expect(restored.execution).toBe('cancelled')
    const resend = new MockAdapter([toolCallResponse('resend', 'npc_commit_turn', { posture: 'silent', behavior: [] })])
    scaffold.ctx.llm.registerAdapter(['mock'], resend)
    await scaffold.ctx.roleplayRuntime.run(scope(a), 'keeper')
    expect(resend.requests[0]?.sessionId).toBe(model.requests[0]?.sessionId)
    expect(JSON.stringify(resend.requests[0])).not.toContain('ONLY-IN-A')
    expect(scaffold.ctx.sessions.get(resend.requests[0]!.sessionId!)!.events.some(event => event.type === 'roleplay/execution-receipt')).toBe(true)



  } finally { await scaffold.close(); await rm(root, { recursive: true, force: true }) }
}, 30000)


it('consolidates a discussion through the shipped executors and records every private call in native usage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-discussion-memory-'))
  const scaffold = await launchWebScaffold({
    extraOverlayPath: fileURLToPath(new URL('../../../experimental/roleplay-web-profile/cordis.patch.yml', import.meta.url)),
    extraInstallAnchors: [fileURLToPath(new URL('../../../experimental/roleplay-web-profile/package.json', import.meta.url))],
    directoryPickerMode: 'overlay', extraEntryOverrides: [
      { id: 'story-home', config: { root } },
      { id: 'roleplay-services', config: {
        databasePath: join(root, 'narrative.sqlite'), journalMode: 'wal', busyTimeoutMs: 1000, provider: 'mock', model: 'mock',
        consolidationThreshold: 2, consolidationBatchLimit: 2, directorConsolidationThreshold: 2, memoryQueueIntervalMs: 50,
        characterLimits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
          maxActiveGoals: 32, maxScheduledIntentions: 32 },
        recallCharacterLimit: 6000,
        queryPageLimit: 40, notificationIntervalMs: 10, directorCommandLimit: 12, discussionTurnLimit: 16, maxContextUpdateUnits: 16,
      } },
    ],
  })
  try {
    const { ctx } = scaffold
    const draft = ctx.roleplayBooks.saveDraft({ id: 'promise' as BookId, expectedRevision: 0, title: 'Promise', resources: [],
      document: { schemaVersion: 6, id: 'promise', title: 'Promise', directorPrompt: '', directorGuidance: {},
        characters: ['keeper', 'guest'].map(actorId => ({ actorId, displayName: actorId, appearance: actorId,
          publicPersona: `An inn ${actorId}.`, rolePrompt: '', actingGuidance: {}, capabilities: ['speak', 'memory'] })) } })
    const version = ctx.roleplayBooks.publish(draft.id, draft.revision)
    const id = ctx.roleplayInstances.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId }).instance.id
    const scope = (): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
      expectedRevision: ctx.roleplayHistory.snapshot(id).instance.revision, principal: { kind: 'player' } })
    ctx.roleplayPeople.stage(scope(), { id: 'inn', location: 'Inn', present: ['keeper', 'guest'], appearances: [] })
    for (const owner of ['actor:keeper', 'actor:guest', 'director']) ctx.roleplayRetention.review(scope(),
      { owner, operation: 'policy', activation: 'automatic' })
    const started = ctx.roleplayDiscussions.start(scope(), { topic: 'Keep the key safe', participantIds: ['keeper', 'guest'], maxRounds: 1 })
    const discussionId = (started.result as { discussionIds: string[] }).discussionIds[0]!
    const prepare = toolCallResponse('prepare', 'npc_commit_turn', { posture: 'watching', discussion: { action: 'pass', eagerness: 'medium' } })
    const memoryOwners: string[] = []
    const consolidate = (options: GenerateOptions) => {
      const event = ctx.sessions.get(options.sessionId!)!.events.findLast(item => item.type === 'roleplay/execution-request')!
      if (event.type !== 'roleplay/execution-request') throw new Error('Missing recorded consolidation request')
      const context = event.data.context
      const section = context.sections.find(item => item.id === 'consolidation')!
      expect(context.sections.filter(item => ['evidence', 'behavior'].includes(item.id)
        && !item.sources.includes(`recipe:${item.id}`))).toEqual([])
      expect(context.sources).toEqual(context.sections.flatMap(item => item.sources))
      expect(section.sources).toHaveLength(2)
      expect(section.content).toContain('I will keep the key.')
      expect(section.content).toContain('Return it before dawn.')
      const actorId = 'actorId' in context ? context.actorId : undefined
      const owner = actorId === undefined ? 'director' : `actor:${actorId}`
      memoryOwners.push(owner)
      const input = [{ sourceIds: [...section.sources], disposition: 'represented', reason: 'Retain the promise and condition.', changes: [{
        operation: 'add', kind: 'promise', text: `${owner}: The key must be returned before dawn.`, sourceIds: [...section.sources],
        episode: { topic: 'The key', experience: 'The keeper offered to hold the key; the guest set a deadline.',
          unresolved: ['Will it be returned?'] },
      }] }]
      return toolCallResponse(`memory-${owner}`, 'memory_submit', { context_update: input })
    }
    const model = new RecordedMock([prepare, prepare,
      toolCallResponse('keeper-speech', 'npc_commit_turn', { posture: 'finished', discussion: { action: 'speak', eagerness: 'medium' },
        behavior: [{ kind: 'speech', text: 'I will keep the key.' }] }),
      (options) => {
        const event = ctx.sessions.get(options.sessionId!)!.events.findLast(item => item.type === 'roleplay/execution-request')!
        if (event.type !== 'roleplay/execution-request') throw new Error('Missing guest response request')
        expect(event.data.context.text).toContain('I will keep the key.')
        expect(event.data.context.text).not.toContain('Return it before dawn.')
        return toolCallResponse('guest-speech', 'npc_commit_turn', { posture: 'finished', discussion: { action: 'speak', eagerness: 'medium' },
          behavior: [{ kind: 'speech', text: 'Return it before dawn.' }] })
      },
      toolCallResponse('close', 'director_command', { command: { operation: 'discussion-control', input: { operation: 'close', discussionId, status: 'completed' } } }),
      toolCallResponse('finish', 'director_command', { command: { operation: 'finish', actors: [], advanceDiscussion: false } }),
      consolidate, consolidate, consolidate,
    ])
    const stopModel = ctx.llm.registerAdapter(['mock'], model)
    const advanceScope = scope()
    expect(await ctx.roleplayDiscussionRuntime.advance(advanceScope)).toMatchObject({ status: 'awaiting-director', completedTurns: 4 })
    const directorScope = scope()
    await ctx.roleplayDirector.run(directorScope, '')
    expect(memoryOwners).toEqual([])
    await vi.waitFor(() => { expect(ctx.roleplayMemoryQueue.list(id).filter(job => job.status === 'applied')).toHaveLength(3) }, { timeout: 15000 })
    expect(memoryOwners).toEqual(['actor:keeper', 'actor:guest', 'director'])
    expect(model.requests).toHaveLength(9)
    for (const owner of memoryOwners) {
      const notes = ctx.roleplayRetentionViews.review(id, owner).retention.notes
      expect(notes).toHaveLength(1)
      expect(notes[0]?.episode?.unresolved).toEqual(['Will it be returned?'])
      expect(notes[0]?.episode).not.toHaveProperty('interpretation')
      expect(notes[0]?.episode).not.toHaveProperty('impact')
    }
    const play = ctx.roleplayPlay.read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 40 })
    expect(play.rows.filter(row => row.kind === 'speech')).toHaveLength(2)
    const usage = await ctx.roleplayExecutionHistory.usage(id)
    expect(usage.usage).toMatchObject({ uncachedInputTokens: 90, outputTokens: 45 })
    const byPurpose = performanceUsage(ctx.agents.list().filter(agent => agent.session.events.some(event =>
      event.type === 'roleplay/execution-request' && event.data.context.instanceId === id))
      .map(agent => ({ id: agent.session.id, events: agent.session.events })))
    expect(byPurpose.actor.usage).toMatchObject({ uncachedInputTokens: 40, outputTokens: 20 })
    expect(byPurpose.director.usage).toMatchObject({ uncachedInputTokens: 20, outputTokens: 10 })
    expect(byPurpose.consolidation.usage).toMatchObject({ uncachedInputTokens: 30, outputTokens: 15 })
    expect(byPurpose.unclassified.usage.outputTokens).toBe(0)
    await ctx.roleplayDiscussionRuntime.advance(advanceScope)
    await ctx.roleplayDirector.run(directorScope, '')
    expect(model.requests).toHaveLength(9)
    expect(await ctx.roleplayExecutionHistory.usage(id)).toEqual(usage)
    const archive = await ctx.roleplayTransfer.export(id, ctx.roleplayHistory.snapshot(id).instance.revision)
    const imported = ctx.roleplayTransfer.import(archive, randomUUID() as CommandId)
    for (const owner of memoryOwners) expect(ctx.roleplayRetentionViews.review(imported.id, owner).retention.notes)
      .toEqual(ctx.roleplayRetentionViews.review(id, owner).retention.notes)
    expect(await ctx.roleplayExecutionHistory.usage(imported.id)).toEqual(usage)
    const directorContext = ctx.roleplayDirectorViews.context({ instanceId: imported.id, instruction: 'key' })
    expect(directorContext.text).not.toContain('actor:keeper: The key')
    expect(directorContext.text).not.toContain('actor:guest: The key')
    expect(directorContext.text).toContain('director: The key')
    const directorBriefs = directorContext.sections.filter(section => section.sources.some(source => source.startsWith('retention:note:')))
    expect(directorBriefs).toHaveLength(1)
    for (const section of directorBriefs) {
      expect(section.content).not.toContain('"sourceIds"')
      expect(section.content).not.toContain('"author"')
      expect(section.content).not.toContain('"scope"')
    }
    expect(directorContext.text).toContain('Active means retained, not proof that every described condition or obligation still applies.')
    const keeperNote = ctx.roleplayRetentionViews.review(imported.id, 'actor:keeper').retention.notes[0]!
    const followup = new RecordedMock([
      (options) => {
        const event = ctx.sessions.get(options.sessionId!)!.events.findLast(item => item.type === 'roleplay/execution-request')!
        if (event.type !== 'roleplay/execution-request') throw new Error('Missing post-discussion request')
        expect(event.data.context.text).toContain('actor:keeper: The key must be returned before dawn.')
        expect(event.data.context.text).toContain('Active means retained, not proof that every described condition or obligation still applies.')
        expect(event.data.context.text).not.toContain('actor:guest: The key')
        expect(event.data.context.text).not.toContain('The keeper offered to hold the key; the guest set a deadline.')
        expect(event.data.context.sections.some(section => section.id === 'consolidation')).toBe(false)
        const retained = event.data.context.sections.filter(section => section.sources.includes(`retention:${keeperNote.id}:r${keeperNote.revision}`))
        expect(retained).toHaveLength(1)
        expect(retained[0]!.content).not.toContain('"sourceIds"')
        return toolCallResponse('recall-promise', 'narrative_recall', {
          query: `retention:${keeperNote.id}:r${keeperNote.revision}`, offset: 0, limit: 1,
        })
      },
      (options) => {
        expect(JSON.stringify(options.messages)).toContain('The keeper offered to hold the key; the guest set a deadline.')
        expect(JSON.stringify(options.messages)).toContain('Will it be returned?')
        return toolCallResponse('honor-promise', 'npc_commit_turn', { posture: 'finished',
          behavior: [{ kind: 'speech', text: 'Before you leave, let us check that you have your key.' }] })
      },
    ])
    stopModel()
    const stopFollowup = ctx.llm.registerAdapter(['mock'], followup)
    await ctx.roleplayRuntime.run({ instanceId: imported.id, id: randomUUID() as CommandId,
      expectedRevision: ctx.roleplayHistory.snapshot(imported.id).instance.revision, principal: { kind: 'player' } }, 'keeper')
    expect(followup.requests).toHaveLength(2)
    expect((await ctx.roleplayExecutionHistory.usage(imported.id)).usage).toMatchObject({ uncachedInputTokens: 110, outputTokens: 55 })
    expect(ctx.roleplayPlay.read({ instanceId: imported.id, audience: { kind: 'observer' }, offset: 0, limit: 40 }).rows
      .some(row => row.text === 'Before you leave, let us check that you have your key.')).toBe(true)
    expect(await ctx.roleplayExecutionHistory.usage(id)).toEqual(usage)
    const guestRef = castOf(ctx.roleplayHistory.snapshot(imported.id)).encounters
      .find(encounter => encounter.observerId === 'keeper' && encounter.actorId === 'guest')!.ref
    const invitationScope = (): CommandScope => ({ instanceId: imported.id, id: randomUUID() as CommandId,
      expectedRevision: ctx.roleplayHistory.snapshot(imported.id).instance.revision, principal: { kind: 'player' } })
    stopFollowup()
    const stopInvitation = ctx.llm.registerAdapter(['mock'], new RecordedMock([
      toolCallResponse('invite-return-check', 'npc_commit_turn', { posture: 'waiting',
        discussion_request: { topic: 'Check the return together', opening: 'Ask whether the handover needs another check.',
          participant_refs: [guestRef] } }),
    ]))
    await ctx.roleplayRuntime.run(invitationScope(), 'keeper')
    const pending = discussionsOf(ctx.roleplayHistory.snapshot(imported.id)).requests!.at(-1)!
    expect(pending.status).toBe('pending')
    const accepted = new RecordedMock([
      (options) => {
        expect(JSON.stringify(options.messages)).toContain(pending.topic)
        return toolCallResponse('accept-return-check', 'director_command', { command: { operation: 'discussion-control',
          input: { operation: 'request', requestId: pending.id, expectedRequestRevision: pending.revision,
            decision: 'accept', reason: 'Let them discuss the return.' } } })
      },
      toolCallResponse('finish-invitation-review', 'director_command', {
        command: { operation: 'finish', actors: [], advanceDiscussion: false },
      }),
    ])
    stopInvitation()
    ctx.llm.registerAdapter(['mock'], accepted)
    const acceptScope = invitationScope()
    const receipt = await ctx.roleplayDirector.run(acceptScope, 'Consider the pending invitation.')
    const discussionState = discussionsOf(ctx.roleplayHistory.snapshot(imported.id))
    const resolved = discussionState.requests!.find(request => request.id === pending.id)!
    expect(resolved).toMatchObject({ status: 'accepted', revision: pending.revision + 1 })
    expect(discussionState.discussions.filter(discussion => discussion.id === resolved.discussionId)).toHaveLength(1)
    expect(discussionState.discussions.find(discussion => discussion.id === resolved.discussionId))
      .toMatchObject({ participantIds: ['keeper', 'guest'], preparationPendingIds: ['keeper', 'guest'] })
    expect(accepted.requests).toHaveLength(2)
    expect(await ctx.roleplayDirector.run(acceptScope, 'Consider the pending invitation.')).toEqual(receipt)
    expect(accepted.requests).toHaveLength(2)
  } finally { await scaffold.close(); await rm(root, { recursive: true, force: true }) }
}, 30000)
