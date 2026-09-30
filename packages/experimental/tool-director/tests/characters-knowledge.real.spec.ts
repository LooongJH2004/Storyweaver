/** Offline replay through shipped character tools, Actor commits and persistent Story APIs. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { createUserMessage, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { styleProfileSchema } from '@deepseek-ai/dsh-story/style'
import { parseStorybookDocument } from '@deepseek-ai/dsh-story'
import { SessionId } from '@deepseek-ai/dsh-session'
import { launchWebScaffold, type LaunchOptions } from '../../../../apps/web/tests/scaffold.ts'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

class ReplayAdapter extends MockAdapter {
  override reconstructRequest(options: GenerateOptions): string { return JSON.stringify(options) }
}

it('creates a supporting Actor, rejects private-source writes atomically and preserves knowledge across cold reload and package import', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-cognition-'))
  const options: LaunchOptions = {
    extraOverlayPath: fileURLToPath(new URL('../../roleplay-web-profile/tests/fixtures/legacy-profile/cordis.patch.yml', import.meta.url)),
    extraInstallAnchors: [fileURLToPath(new URL('../../roleplay-web-profile/tests/fixtures/legacy-profile/package.json', import.meta.url))],
    directoryPickerMode: 'overlay', extraEntryOverrides: [
      { id: 'story-home', config: { root } },
      { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions') } },
      { id: 'storage-json', config: { root: join(root, 'storages') } },
      { id: 'roleplay-directory-picker-native', disabled: true },
      { id: 'roleplay-directory-picker-controller', disabled: true },
    ],
  }
  let scaffold = await launchWebScaffold(options)
  try {
    const { ctx } = scaffold
    const story = await ctx.storyRegistry.create('Identity replay')
    await ctx.storyRegistry.replaceDirectorOutline(story.id, 0, {
      updateMode: 'auto_unlocked', premise: 'A stranger enters the inn.', premiseLocked: false,
      themes: [], hardConstraints: [], arcs: [], beats: [], foreshadows: [], mysteries: [], clocks: [],
    }, 'Replay outline')
    const book = { schemaVersion: 6, id: 'identity-replay', title: 'Identity replay', directorPrompt: 'Preserve personal perspectives.',
      directorGuidance: {}, commonKnowledge: ['Innkeepers usually charge for rooms.'], characters: [
        { actorId: 'guard-canonical', displayName: 'Arden', appearance: 'A tired guard', publicPersona: 'Keeps the gate', rolePrompt: 'Respond independently.',
          actingGuidance: {}, capabilities: ['speak', 'reflect'], initialKnowledge: [{ text: 'I have never met the traveler.' }] },
        { actorId: 'secret-canonical', displayName: 'Hidden Oracle', appearance: 'A hooded traveler', publicPersona: 'Travels alone', rolePrompt: 'Keep your secrets.',
          actingGuidance: {}, capabilities: ['speak', 'reflect'], initialKnowledge: [{ text: 'PRIVATE-ORACLE-SECRET: the ledger opens beneath the well.' }] },
      ] }
    await writeFile(ctx.storyHome.storyPath(story.id, 'world', 'storybook.json'), JSON.stringify(book), 'utf8')
    const npcId = () => story.world.characters.entries.find(item => item.origin === 'director')!.definition.actorId
    const ref = () => story.world.characters.encounters.find(item => item.observerId === 'guard-canonical' && item.actorId === npcId())!.ref
    const change = (source: string) => ({ id: 'alias-judgment', expectedRevision: 0, text: 'The traveler claims to be Rowan; I am unsure of the story.',
      kind: 'identity', attitude: 'believed', acquisition: 'heard', entityRefs: [ref()], sourceRefs: [source], status: 'active', label: 'Rowan', reason: 'I heard the introduction.' })
    const adapter = new ReplayAdapter([
      () => toolCallResponse('find', 'director_find_characters', { query: 'Rowan' }),
      () => toolCallResponse('create', 'director_create_character', { expected_registry_revision: story.world.characters.revision,
        name: 'UNREVEALED-TRUE-NAME', appearance: 'A rain-soaked traveler', persona: 'Wants a room', role_prompt: 'Be cautious with strangers.',
        purpose: 'Ask for lodging', location: 'Inn', backstory: 'ordinary', source_refs: [], initial_knowledge: ['I need a dry room.'] }),
      () => toolCallResponse('stage', 'director_stage_scene', { expected_world_revision: story.world.revision, scene_id: 'inn', location: 'Inn',
        summary: 'A traveler approaches a guard.', present_actor_ids: ['guard-canonical', npcId()],
        perceptions: [{ actorId: 'guard-canonical', content: '[[person:'+npcId()+']] approaches you.' }, { actorId: npcId(), content: 'A tired guard stands by the door.' }] }),
      () => toolCallResponse('brief', 'director_commit_brief', { expected_ledger_revision: story.plotLedger.revision, situation: 'The guard hears an introduction.',
        actor_briefs: [{ actor_id: 'guard-canonical', perceptions: ['The rain-soaked traveler says: Call me Rowan.'], uncertainties: ['Is that their real name?'] }] }),
      () => toolCallResponse('narrate', 'director_narrate', { expected_world_revision: story.world.revision, text: 'The traveler gives the name Rowan.', summary: 'The traveler claims a name.',
        audience_actor_ids: ['guard-canonical'], perceptions: [{ actorId: 'guard-canonical', content: 'The traveler says: Call me Rowan.' }], patch: [] }),
      toolCallResponse('dispatch', 'director_dispatch_actors', {}),
      () => toolCallResponse('bad-source', 'npc_commit_turn', { posture: 'waiting', knowledge_changes: [change('foreign-private-source')], behavior: [{ kind: 'speech', text: 'REJECTED-UTTERANCE' }] }),
      () => toolCallResponse('good-source', 'npc_commit_turn', { posture: 'waiting', knowledge_changes: [change(story.world.perceptions.findLast(item => item.actorId === 'guard-canonical')!.id)], behavior: [{ kind: 'speech', text: 'There is a room upstairs.' }] }),
      textResponse('Waiting.'),
    ])
    const release = ctx.llm.registerAdapter(['mock'], adapter)
    const { agent: director } = await ctx.agentLoop.createAgent(ctx, { sessionId: SessionId('cognition-director'),
      agentOptions: { provider: 'mock', model: 'mock' }, meta: { cwd: scaffold.workspaceCwd, agentPreset: 'storyweaver' },
      setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'storyweaver') } })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    director.followup(createUserMessage({ content: [{ type: 'text', text: 'Continue.' }], source: { kind: 'user', inputIntent: { kind: 'storyweaver', payload: { mode: 'observe' } } } }))
    await director.whenIdle()
    expect(director.session.events.filter(e => e.type === 'tool/result' && e.data.error !== undefined), JSON.stringify(director.session.events.filter(e => e.type === 'tool/result'))).toEqual([])
    const registration = story.sessions.find(item => item.actorId === 'guard-canonical')!
    expect(registration, JSON.stringify(director.session.events)).toBeDefined()
    const actor = ctx.agents.get(registration.sessionId)!
    const actorText = JSON.stringify(adapter.requests.find(request => request.sessionId === actor.session.id)!.messages)
    expect(actorText).not.toContain('UNREVEALED-TRUE-NAME')
    expect(actorText).not.toContain('PRIVATE-ORACLE-SECRET')
    expect(actorText).not.toContain('secret-canonical')
    expect(actorText).toContain('A rain-soaked traveler')
    expect(actorText).toContain(ref())
    expect(ctx.actors.playerInspect(actor).knowledge.entries.find(item => item.id === 'alias-judgment')?.revision).toBe(1)
    expect(actor.session.events.filter(e => e.type === 'tool/result' && e.data.message.content.some(block => block.type === 'tool-result' && block.isError))).toHaveLength(1)
    expect(JSON.stringify(story.plotLedger)).not.toContain('REJECTED-UTTERANCE')
    expect(story.sessions.some(item => item.actorId === npcId())).toBe(false)
    const observed = await ctx.storyController.characterWorkspace({ storyId: story.id, observerId: 'guard-canonical' })
    expect(observed.people.find(item => item.actorId === npcId())?.label).toBe('Rowan')
    const frozen = story.world.events.map(event => event.identityLabels)
    const correction = { ...change('player-correction'), expectedRevision: 1, label: 'Possible alias', text: 'Rowan may be an alias.', reason: 'Player correction.' }
    await ctx.storyController.updateKnowledge({ storyId: story.id, actorId: 'guard-canonical', changes: [correction as never] })
    await expect(ctx.storyController.updateKnowledge({ storyId: story.id, actorId: 'guard-canonical', changes: [correction as never] })).rejects.toThrow('revision')
    expect(story.world.events.map(event => event.identityLabels)).toEqual(frozen)
    const savedId = npcId()
    release()
    const second = new ReplayAdapter([
      () => toolCallResponse('npc-brief', 'director_commit_brief', { expected_ledger_revision: story.plotLedger.revision, situation: 'The traveler responds.', actor_briefs: [{ actor_id: savedId, perceptions: ['You see an open doorway.'], uncertainties: [] }] }),
      () => toolCallResponse('npc-narration', 'director_narrate', { expected_world_revision: story.world.revision, text: 'The doorway is open.', summary: 'The doorway is open.', audience_actor_ids: [savedId], perceptions: [{ actorId: savedId, content: 'The doorway is open.' }], patch: [] }),
      toolCallResponse('npc-dispatch', 'director_dispatch_actors', {}),
      toolCallResponse('npc-turn', 'npc_commit_turn', { posture: 'waiting', behavior: [{ kind: 'speech', text: 'Thank you.' }] }),
      textResponse('Waiting.'),
    ])
    ctx.llm.registerAdapter(['mock'], second)
    director.followup(createUserMessage({ content: [{ type: 'text', text: 'Let the traveler respond.' }], source: { kind: 'user' } }))
    await director.whenIdle()
    const npcSession = story.sessions.find(item => item.actorId === savedId)!
    expect(npcSession).toBeDefined()
    const npcText = JSON.stringify(second.requests.find(item => item.sessionId === npcSession.sessionId)!.messages)
    expect(npcText).toContain('I need a dry room.')
    expect(npcText).not.toContain('Call me Rowan.')
    expect(npcText).not.toContain('PRIVATE-ORACLE-SECRET')
    await ctx.sessions.flush(actor.session); await ctx.sessions.flush(director.session)
    await ctx.sessions.flush(ctx.agents.get(npcSession.sessionId)!.session)
    await scaffold.close(); scaffold = await launchWebScaffold(options)
    const cold = await scaffold.ctx.storyController.characterWorkspace({ storyId: story.id, observerId: 'guard-canonical' })
    expect(cold.knowledge.entries.find(item => item.id === 'alias-judgment')).toMatchObject({ revision: 2, label: 'Possible alias' })
    const exported = await scaffold.ctx.storyController.exportPackage({ storyId: story.id })
    const imported = await scaffold.ctx.storyController.importPackage({ packageJson: exported.packageJson })
    const importedCast = scaffold.ctx.storyRegistry.get(imported.story.storyId)!.world.characters
    expect(importedCast).toEqual(scaffold.ctx.storyRegistry.get(story.id)!.world.characters)
    expect(importedCast.entries.find(item => item.definition.actorId === savedId)?.definition.displayName).toBe('UNREVEALED-TRUE-NAME')
    const runtimeBook = await scaffold.ctx.storyController.storybook({ storyId: story.id })
    await scaffold.ctx.storyController.updateStyle({ storyId: story.id, scope: 'storybook',
      expectedStorybookRevision: runtimeBook.revision, key: 'director',
      profile: styleProfileSchema.parse({ kind: 'director', guidance: {} }) })
    const afterStyle = await scaffold.ctx.storyController.storybook({ storyId: story.id })
    expect(parseStorybookDocument(JSON.parse(afterStyle.storybookJson)).characters).toHaveLength(2)
    await expect(scaffold.ctx.storyController.updateStyle({ storyId: story.id, scope: 'storybook',
      expectedStorybookRevision: afterStyle.revision, key: `actor:${savedId}`,
      profile: styleProfileSchema.parse({ kind: 'actor', guidance: {} }) })).rejects.toThrow('Collect this story-local character')
    const template = await scaffold.ctx.storyController.importStorybook({ storybookJson: JSON.stringify(book) })
    await scaffold.ctx.storyRegistry.setTemplateId(story.id, book.id)
    const baseline = await scaffold.ctx.storyController.storybook({ storyId: template.story.storyId })
    const collection = { storyId: story.id, actorId: savedId, targetStoryId: template.story.storyId,
      expectedRevision: baseline.revision,
      expectedCharacterRevision: importedCast.entries.find(item => item.definition.actorId === savedId)!.revision,
      includeKnowledge: true, includeState: false, includeMemories: false, preview: true }
    const preview = await scaffold.ctx.storyController.collectCharacter(collection)
    expect(parseStorybookDocument(JSON.parse(preview.storybookJson)).characters).toHaveLength(3)
    expect(parseStorybookDocument(JSON.parse((await scaffold.ctx.storyController.storybook({
      storyId: template.story.storyId,
    })).storybookJson)).characters).toHaveLength(2)
    await expect(scaffold.ctx.storyController.collectCharacter({ ...collection, preview: false, expectedPreviewJson: '{}' })).rejects.toThrow('preview')
    await scaffold.ctx.storyController.collectCharacter({ ...collection, preview: false, expectedPreviewJson: preview.storybookJson })
    const independent = await scaffold.ctx.storyController.createFromTemplate({ sourceStoryId: template.story.storyId })
    const independentCast = scaffold.ctx.storyRegistry.get(independent.story.storyId)!.world.characters
    expect(independentCast.entries).toHaveLength(3)
    expect(independentCast.knowledge[savedId]?.entries.some(item => item.text === 'I need a dry room.')).toBe(true)
    expect(independentCast.knowledge['guard-canonical']?.entries.some(item => item.id === 'alias-judgment')).toBe(false)
    scaffold.ctx.llm.registerAdapter(['mock'], new ReplayAdapter([textResponse('Waiting for a different direction.')]))
    const importedSceneId = imported.story.currentSceneSessionId!
    const resolved = await scaffold.ctx.sessionController.resolveAgent(importedSceneId)
    if ('error' in resolved) throw new Error(resolved.error.message)
    const sceneSession = scaffold.ctx.sessions.get(importedSceneId)!
    const firstPlayer = sceneSession.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')!
    await scaffold.ctx.sessionController.prompt({ sessionId: importedSceneId, requestId: 'rewrite-cognition' as never,
      mode: 'queue', rewriteBeforeSeq: firstPlayer.seq, content: [{ type: 'text', text: 'Take another direction.' }],
      inputIntent: { kind: 'storyweaver', payload: { mode: 'direction' } } }, new AbortController().signal)
    await scaffold.ctx.agents.get(importedSceneId)!.whenIdle()
    const rewound = scaffold.ctx.storyRegistry.get(imported.story.storyId)!.world.characters
    expect(rewound.entries.some(item => item.definition.actorId === savedId)).toBe(false)
    expect(rewound.knowledge['guard-canonical']?.entries.some(item => item.id === 'alias-judgment')).toBe(false)
    expect(sceneSession.events.some(event => event.type === 'tool/call' && event.data.name === 'director_create_character')).toBe(true)

  } finally { await scaffold.close(); await rm(root, { recursive: true, force: true }) }
}, 120_000)
