/** Keyless scripted model responses through shipped Storyweaver plugins and durable stores. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { stateDefinitionSchema } from '@deepseek-ai/dsh-story/state'
import { styleProfileSchema } from '@deepseek-ai/dsh-story/style'
import { launchWebScaffold, type LaunchOptions } from '../../../../apps/web/tests/scaffold.ts'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

class ReplayAdapter extends MockAdapter {
  beforeStream?: (options: GenerateOptions) => Promise<void>
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    await this.beforeStream?.(options)
    yield * super.stream(options)
  }
  override reconstructRequest(options: GenerateOptions): string { return JSON.stringify(options) }
}

it('round-trips custom state, exact player revisions, atomic behavior and scoped performance guidance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-state-style-'))
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
    const story = await ctx.storyRegistry.create('状态与表演回放')
    await ctx.storyRegistry.replaceDirectorOutline(story.id, 0, {
      updateMode: 'auto_unlocked', premise: '甲受伤后，乙提供帮助。', premiseLocked: false,
      themes: [], hardConstraints: [], arcs: [], beats: [], foreshadows: [], mysteries: [], clocks: [],
    }, '回放初稿')
    const mood = stateDefinitionSchema.parse({ id: 'a:mood', name: '心境', description: '主观感受', group: '心理',
      type: 'text', owner: 'actor', actorId: 'a', guidance: '根据看见的刺激更新' })
    const wound = stateDefinitionSchema.parse({ id: 'a:wound', name: '伤势', description: '客观伤势', group: '身体',
      type: 'number', minimum: 0, maximum: 10, owner: 'world', actorId: 'a', audience: ['a'], guidance: '世界结算' })
    const relation = stateDefinitionSchema.parse({ id: 'a:trust-b', name: '对乙的看法', description: '与乙的关系', group: '关系',
      type: 'text', owner: 'actor', actorId: 'a', targetActorId: 'b', guidance: '依据共同经历' })
    await writeFile(ctx.storyHome.storyPath(story.id, 'world', 'storybook.json'), JSON.stringify({
      schemaVersion: 6, id: 'state-style', title: '状态与表演回放', directorPrompt: '尊重人物主观认知。', reasoningLanguage: '简体中文',
      directorGuidance: {}, characters: [
        { actorId: 'a', displayName: '甲', publicPersona: '守卫', rolePrompt: '自主回应。', actingGuidance: {}, capabilities: ['speak', 'act', 'reflect'],
          state: [{ definition: mood, value: '暂且警惕' }, { definition: wound, value: 2 }] },
        { actorId: 'b', displayName: '乙', publicPersona: '旅客', rolePrompt: '自主回应。', actingGuidance: {}, capabilities: ['speak', 'act', 'reflect'],
          state: [{ definition: { ...mood, id: 'b:secret', actorId: 'b' }, value: '仅乙知道的秘密状态' }] },
      ],
    }), 'utf8')
    const actorStyle = styleProfileSchema.parse({ kind: 'actor', guidance: { speechStyle: '仅甲的口语风格',
      examples: ['虚构表演示例：你先走。这回别问。'] } })
    await ctx.storyController.updateStyle({ storyId: story.id, scope: 'story', key: 'actor:a',
      profile: actorStyle, expectedStoryPromptRevision: 0 })
    const snapshotBeforePreview = ctx.storyRegistry.exportRecord(story.id)
    const unopened = await ctx.storyController.contextPreview({ storyId: story.id, audience: 'actor', actorId: 'a' })
    expect(unopened.pendingActorInitialization).toBe(true)
    expect(unopened.sections.some(section => section.id === 'actor-state')).toBe(false)
    expect(unopened.sections.find(section => section.id === 'style')?.content).toContain('仅甲的口语风格')
    expect(ctx.storyRegistry.exportRecord(story.id)).toEqual(snapshotBeforePreview)
    const adapter = new ReplayAdapter([
      toolCallResponse('brief', 'director_commit_brief', { expected_ledger_revision: 0, situation: '乙递来一卷绷带。',
        actor_briefs: [{ actor_id: 'a', perceptions: ['乙把干净绷带放在桌上。'], uncertainties: ['乙为什么帮忙？'] }] }),
      toolCallResponse('narrate', 'director_narrate', { expected_world_revision: 1, text: '绷带放在桌角。',
        summary: '乙放下绷带。', perceptions: [{ actorId: 'a', content: '旅客放下绷带。' }], audience_actor_ids: ['a'], patch: [] }),
      toolCallResponse('dispatch', 'director_dispatch_actors', {}),
      () => toolCallResponse('actor', 'npc_commit_turn', { posture: 'waiting',
        state_changes: [
          { fieldId: mood.id, expectedRevision: 1, value: '仍然警惕，但愿意听他说完', reason: '乙拿来了绷带', sourceRefs: [] },
          { fieldId: relation.id, expectedRevision: 0, definition: { ...relation, actorId: 'self', targetActorId: story.world.characters.encounters.find(item => item.observerId === 'a' && item.actorId === 'b')!.ref }, value: '愿意暂时合作', reason: '乙帮忙包扎', sourceRefs: [] },
        ], behavior: [{ kind: 'speech', text: '放在那里吧。' }, { kind: 'speech', text: '多谢。' }] }),
      textResponse('等待玩家。'),
    ])
    const previewed = new Set<string>()
    adapter.beforeStream = async (request) => {
      if (request.sessionId === undefined) throw new Error('Missing request Session identity')
      if (previewed.has(request.sessionId)) return
      previewed.add(request.sessionId)
      const owner = ctx.storyRegistry.storyForSession(request.sessionId)!
      const before = ctx.storyRegistry.exportRecord(story.id)
      const preview = await ctx.storyController.contextPreview({ storyId: story.id,
        audience: owner.role === 'actor' ? 'actor' : 'director',
        ...(owner.actorId === undefined ? {} : { actorId: owner.actorId }) })
      expect(preview.pendingActorInitialization).toBe(false)
      const text = request.messages.flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : [])).join('\n')
      for (const section of preview.sections) expect(text, section.id).toContain(section.content)
      expect(ctx.storyRegistry.exportRecord(story.id)).toEqual(before)
    }
    const releaseAdapter = ctx.llm.registerAdapter(['mock'], adapter)
    const { agent: director } = await ctx.agentLoop.createAgent(ctx, {
      sessionId: SessionId('state-style-director'), agentOptions: { provider: 'mock', model: 'mock' },
      meta: { cwd: scaffold.workspaceCwd, agentPreset: 'storyweaver' },
      setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'storyweaver') },
    })
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    await ctx.storyRegistry.stageScene(story.id, { expectedWorldRevision: 0, sceneId: 'room', location: '门房', summary: '乙来到门前。', presentActorIds: ['a', 'b'] })
    await ctx.storyController.updateStyle({ storyId: story.id, scope: 'scene', key: 'director', sceneId: 'room',
      instruction: '仅导演的场景提示：留意门外雨声。', expectedStoryPromptRevision: 1 })
    director.followup(createUserMessage({ content: [{ type: 'text', text: '让甲回应绷带。' }],
      source: { kind: 'user', inputIntent: { kind: 'storyweaver', payload: { mode: 'observe' } } } }))
    await director.whenIdle()
    expect(director.session.events.filter(event => event.type === 'tool/result' && event.data.error !== undefined),
      JSON.stringify(director.session.events.filter(event => event.type === 'tool/result').map(event => event.data))).toEqual([])
    const registration = story.sessions.find(item => item.actorId === 'a')!
    const actor = ctx.agents.get(registration.sessionId)!
    expect(actor.session.events.filter(event => event.type === 'actor/commit'
      && event.data.operations.some(operation => operation.type === 'actor/expression'))).toHaveLength(1)
    expect(actor.session.events.some(event => event.type === 'actor/expression')).toBe(false)
    const actorRequest = adapter.requests.find(request => request.sessionId === actor.session.id)!
    expect(JSON.stringify(actorRequest.messages)).toContain('仅甲的口语风格')
    expect(JSON.stringify(actorRequest.messages)).toContain('伤势: 2')
    expect(JSON.stringify(actorRequest.messages)).not.toContain('仅乙知道的秘密状态')
    expect(JSON.stringify(actorRequest.messages)).not.toContain('仅导演的场景提示')
    expect(JSON.stringify(adapter.requests[0]?.messages)).toContain('仅导演的场景提示')
    expect(JSON.stringify(adapter.requests[0]?.messages)).not.toContain('仅甲的口语风格')
    const producing = await ctx.storyController.requestContextPreview({ storyId: story.id,
      sessionId: actor.session.id,
      beforeEventSeq: actor.session.events.length })
    const reconstructed = JSON.parse(producing.requestJson) as { messages: unknown }
    expect(reconstructed.messages).toEqual(JSON.parse(JSON.stringify(actorRequest.messages)))
    const before = (await ctx.storyController.actorStates({ storyId: story.id })).actors.find(item => item.actorId === 'a')!.dynamicState
    expect(before.entries.find(item => item.definition.id === relation.id)?.value).toBe('愿意暂时合作')
    expect(JSON.stringify(before)).not.toContain('虚构表演示例')
    const correction = { storyId: story.id, actorId: 'a', owner: 'actor' as const, changes: [
      { fieldId: mood.id, expectedRevision: 2, value: '玩家修订：仍未放下戒备', reason: '纠正过快的转变', sourceRefs: [] },
    ] }
    await ctx.storyController.updateState(correction)
    await expect(ctx.storyController.updateState(correction)).rejects.toThrow('Stale')
    await expect(ctx.storyController.updateState({ ...correction,
      changes: [{ ...correction.changes[0]!,
        fieldId: wound.id }] })).rejects.toThrow()
    const selected = story.world.characters.entries.find(item => item.definition.actorId === 'a')!
    await ctx.storyController.saveCharacter({ storyId: story.id, actorId: 'a', expectedRevision: story.world.characters.revision,
      importance: selected.importance, purpose: selected.purpose, location: selected.location, archived: false,
      definitionJson: JSON.stringify({ ...selected.definition, displayName: '甲的新名字', publicPersona: '新修订的谨慎门卫设定', capabilities: ['speak', 'reflect'],
        state: selected.definition.state.map(item => item.definition.id !== mood.id ? item : { ...item, value: '仅供未来故事使用的新开局值' }) }) })
    const editPreview = await ctx.storyController.contextPreview({ storyId: story.id, audience: 'actor', actorId: 'a' })
    expect(editPreview.sections.find(section => section.id === 'actor-state')?.content).toContain('新修订的谨慎门卫设定')
    expect(editPreview.sections.find(section => section.id === 'actor-state')?.content).toContain('玩家修订：仍未放下戒备')
    expect(JSON.stringify(editPreview)).not.toContain('仅供未来故事使用的新开局值')
    const nextAdapter = new ReplayAdapter([
      () => toolCallResponse('revised-brief', 'director_commit_brief', { expected_ledger_revision: story.plotLedger.revision,
        situation: '乙仍在门前等待。', actor_briefs: [{ actor_id: 'a', perceptions: ['乙仍在门前等待。'], uncertainties: [] }] }),
      () => toolCallResponse('revised-narration', 'director_narrate', { expected_world_revision: story.world.revision,
        text: '门外的雨仍未停。', summary: '雨声持续。', perceptions: [{ actorId: 'a', content: '雨声持续。' }], audience_actor_ids: ['a'], patch: [] }),
      toolCallResponse('revised-dispatch', 'director_dispatch_actors', {}),
      toolCallResponse('revised-actor', 'npc_commit_turn', { posture: 'waiting', behavior: [{ kind: 'speech', text: '进来避雨吧。' }] }),
    ])
    releaseAdapter()
    ctx.llm.registerAdapter(['mock'], nextAdapter)
    director.followup(createUserMessage({ content: [{ type: 'text', text: '让甲继续回应门前的人。' }],
      source: { kind: 'user', inputIntent: { kind: 'storyweaver', payload: { mode: 'observe' } } } }))
    await director.whenIdle()
    const nextActorRequest = nextAdapter.requests.find(request => request.sessionId === actor.session.id)
    expect(nextActorRequest !== undefined, JSON.stringify(story.plotLedger.directorRun)).toBe(true)
    const nextText = JSON.stringify(nextActorRequest!.messages)
    expect(nextText).toContain('新修订的谨慎门卫设定')
    expect(nextText).toContain('甲的新名字')
    expect(nextText).toContain('玩家修订：仍未放下戒备')
    expect(nextText).not.toContain('仅供未来故事使用的新开局值')
    expect(ctx.actors.modelContext(actor).descriptor.capabilities).toEqual(['speak', 'reflect'])
    expect(() => ctx.actors.act(actor, { description: 'A revoked action capability.' })).toThrow('capability')
    expect(actor.session.events.filter(event => event.type === 'actor/configuration')).toHaveLength(1)
    await ctx.sessions.flush(actor.session)
    await ctx.sessions.flush(director.session)
    await scaffold.close()
    expect(ctx.get('storyContextRenderer') === undefined).toBe(true)
    scaffold = await launchWebScaffold(options)
    const restored = (await scaffold.ctx.storyController.actorStates({ storyId: story.id })).actors.find(item => item.actorId === 'a')!
    expect(restored.dynamicState.entries.find(item => item.definition.id === mood.id)?.value).toBe('玩家修订：仍未放下戒备')
    const dormantPreview = await scaffold.ctx.storyController.contextPreview({ storyId: story.id, audience: 'actor', actorId: 'a' })
    expect(dormantPreview.sections.find(section => section.id === 'actor-state')?.content).toContain('玩家修订：仍未放下戒备')
    expect(scaffold.ctx.agents.get(registration.sessionId) === undefined).toBe(true)
    await scaffold.ctx.storyController.updateState({ ...correction,
      changes: [{ ...correction.changes[0]!,
        expectedRevision: 3,
        active: false }] })
    const coldPreview = await scaffold.ctx.storyController.contextPreview({ storyId: story.id, audience: 'actor', actorId: 'a' })
    expect(coldPreview.pendingActorInitialization).toBe(false)
    const coldState = coldPreview.sections.find(section => section.id === 'actor-state')!.content
    expect(coldState).toContain('愿意暂时合作')
    expect(coldState).not.toContain('玩家修订：仍未放下戒备')
    expect(coldState).not.toContain('暂且警惕')
    const exported = await scaffold.ctx.storyController.exportPackage({ storyId: story.id })
    const imported = await scaffold.ctx.storyController.importPackage({ packageJson: exported.packageJson })
    const importedActors = await scaffold.ctx.storyController.actorStates({ storyId: imported.story.storyId })
    const importedA = importedActors.actors.find(item => item.actorId === 'a')!
    expect(importedA.dynamicState.entries.find(item => item.definition.id === mood.id)).toMatchObject({ active: false, revision: 4 })
    expect(importedA.dynamicState.entries.find(item => item.definition.id === relation.id)?.value).toBe('愿意暂时合作')
    expect(importedA.dynamicState.entries.find(item => item.definition.id === wound.id)?.value).toBe(2)
    expect((await scaffold.ctx.storyController.prompts({ storyId: imported.story.storyId })).styles.overrides.profiles['actor:a']).toEqual(actorStyle)
    scaffold.ctx.llm.registerAdapter(['mock'], new ReplayAdapter([textResponse('新的分支等待玩家。')]))
    await scaffold.ctx.storyController.updateState({ ...correction, storyId: imported.story.storyId,
      changes: [{ ...correction.changes[0]!, expectedRevision: 4, active: true }] })
    const importedSceneId = imported.story.currentSceneSessionId!
    const resolvedScene = await scaffold.ctx.sessionController.resolveAgent(importedSceneId)
    if ('error' in resolvedScene) throw new Error(resolvedScene.error.message)
    const importedScene = scaffold.ctx.sessions.get(importedSceneId)!
    const firstPlayer = importedScene.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')!
    await scaffold.ctx.sessionController.prompt({ sessionId: importedSceneId, requestId: 'rewrite-state-style' as never,
      mode: 'queue', rewriteBeforeSeq: firstPlayer.seq, content: [{ type: 'text', text: '重新考虑刚才的情境。' }],
      inputIntent: { kind: 'storyweaver', payload: { mode: 'direction' } } }, new AbortController().signal)
    await scaffold.ctx.agents.get(importedSceneId)!.whenIdle()
    const rewritten = (await scaffold.ctx.storyController.actorStates({ storyId: imported.story.storyId })).actors.find(item => item.actorId === 'a')!
    expect(rewritten.dynamicState.entries.some(item => item.definition.id === relation.id)).toBe(false)
    const rewrittenPlayer = importedScene.events.findLast(event => event.type === 'user/message' && event.data.source.kind === 'user')
    if (rewrittenPlayer?.type !== 'user/message') throw new Error('Missing rewritten player input')
    expect(rewrittenPlayer.data.source).toMatchObject({
      inputIntent: { kind: 'storyweaver', payload: { mode: 'direction' } },
    })
    const restoredStory = scaffold.ctx.storyRegistry.get(imported.story.storyId)!
    await scaffold.ctx.storyRegistry.stageScene(restoredStory.id, { expectedWorldRevision: restoredStory.world.revision,
      sceneId: 'street', location: '街道', summary: '离开门房。', perceptions: [{ actorId: 'a', content: '离开门房。' }], presentActorIds: ['a'] })
    await scaffold.ctx.storyRegistry.stageScene(restoredStory.id, { expectedWorldRevision: restoredStory.world.revision,
      sceneId: 'room', location: '门房', summary: '返回门房。', perceptions: [{ actorId: 'a', content: '返回门房。' }], presentActorIds: ['a'] })
    expect(restoredStory.promptOverrides.styles.scene).toBeUndefined()
  } finally { await scaffold.close(); await rm(root, { recursive: true, force: true }) }
}, 120_000)
