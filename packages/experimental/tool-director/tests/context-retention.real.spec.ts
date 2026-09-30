/** Keyless roleplay replay through the shipped Web/Storyweaver Loader and actual presets, without a browser. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { createUserMessage, ToolCallId, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { contextSourceCanArchive, storyContextRetentionSchema } from '@deepseek-ai/dsh-story'
import { launchWebScaffold, type LaunchOptions } from '../../../../apps/web/tests/scaffold.ts'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { sourceText } from '../src/context-sources.ts'

class ReplayAdapter extends MockAdapter {
  override reconstructRequest(options: GenerateOptions): string { return JSON.stringify(options) }
}

it('replays full sources, normal-turn proposals, player approval and scoped recall in the real roleplay composition', async () => {
  const storyHome = await mkdtemp(join(tmpdir(), 'dsh-retention-replay-'))
  const options: LaunchOptions = {
    extraOverlayPath: fileURLToPath(new URL('../../roleplay-web-profile/tests/fixtures/legacy-profile/cordis.patch.yml', import.meta.url)),
    extraInstallAnchors: [fileURLToPath(new URL('../../roleplay-web-profile/tests/fixtures/legacy-profile/package.json', import.meta.url))],
    directoryPickerMode: 'overlay',
    extraEntryOverrides: [
      { id: 'story-home', config: { root: storyHome } },
      { id: 'session-persistence-jsonl', config: { root: join(storyHome, 'sessions') } },
      { id: 'storage-json', config: { root: join(storyHome, 'storages') } },
      { id: 'roleplay-directory-picker-native', disabled: true },
      { id: 'roleplay-directory-picker-controller', disabled: true },
    ],
  }
  let scaffold = await launchWebScaffold(options)
  try {
    const { ctx } = scaffold
    const story = await ctx.storyRegistry.create('条件承诺回放')
    await writeFile(ctx.storyHome.storyPath(story.id, 'world', 'storybook.json'), JSON.stringify({
      schemaVersion: 6, id: 'retention-replay', title: '条件承诺回放', directorPrompt: '保持信息不对称。',
      directorGuidance: { narrativeStyle: '克制。' }, worldTruth: { secret: '钥匙藏在钟底。' }, reasoningLanguage: '简体中文', characters: [{
        actorId: 'a', displayName: '甲', publicPersona: '谨慎的守卫', rolePrompt: '只根据收到的信息行动。',
        actingGuidance: { speechStyle: '简短。' }, capabilities: ['speak', 'act', 'reflect'], privateContext: { perspective: ['私下怀疑账簿被调包。'] },
      }],
    }), 'utf8')
    await writeFile(ctx.storyHome.storyPath(story.id, 'world', 'opening.md'), '甲守在门前。', 'utf8')
    await ctx.storyRegistry.replaceDirectorOutline(story.id, 0, {
      updateMode: 'auto_unlocked', premise: '核实账簿与钥匙交换。', premiseLocked: false,
      themes: [], hardConstraints: [], arcs: [], beats: [], foreshadows: [], mysteries: [], clocks: [],
    }, '回放初稿')
    const narration = '钟楼密室的红色封蜡已经裂开。\n账簿交付后，天亮前必须交出钥匙；违约将失去通行资格。'
    const adapter = new ReplayAdapter([
      toolCallResponse('brief', 'director_commit_brief', { expected_ledger_revision: 0, situation: '钟响前完成交换。',
        actor_briefs: [{ actor_id: 'a', perceptions: ['听见钟响，账簿在桌上。'], uncertainties: ['钟楼内发生了什么？'] }] }),
      toolCallResponse('narrate', 'director_narrate', { expected_world_revision: 1, text: narration,
        summary: '钟响，交换即将开始。', audience_actor_ids: [], perceptions: [].map(actorId => ({ actorId, content: '雨势增强，账簿自行翻过一页。' })), patch: [], context_update: [{
          sourceIds: ['$narration'], disposition: 'represented', reason: '保留条件、期限和代价',
          changes: [{ operation: 'add', kind: 'condition', text: '账簿交付后须在天亮前交钥匙；违约失去通行资格。', sourceIds: ['$narration'] }],
        }] }),
      toolCallResponse('dispatch', 'director_dispatch_actors', {}),
      toolCallResponse('actor', 'npc_commit_turn', { posture: 'waiting', behavior: [{ kind: 'speech', text: '先让我检查账簿。' }],
        context_update: [{ sourceIds: ['$behavior:0'], disposition: 'represented', reason: '保留检查条件',
          changes: [{ operation: 'add', kind: 'claim', text: '我要求先检查账簿。', sourceIds: ['$behavior:0'] }],
        }] }),
      textResponse('等待玩家决定。'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const handle = await ctx.agentLoop.createAgent(ctx, {
      sessionId: SessionId('retention-replay-director'), agentOptions: { provider: 'mock', model: 'mock' },
      meta: { cwd: scaffold.workspaceCwd, agentPreset: 'storyweaver' },
      setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'storyweaver') },
    })
    const director = handle.agent
    await ctx.storyRegistry.attachSession(story.id, director.session.id, 'scene')
    await ctx.storyRegistry.stageScene(story.id, { expectedWorldRevision: 0, sceneId: 'clock-room',
      location: '钟楼门外', summary: '守卫与玩家站在门口。', presentActorIds: ['a'] })
    director.followup(createUserMessage({ content: [{ type: 'text', text: '【旁观推进】玩家原始指令：检查红色封蜡。' }], source: { kind: 'user' } }))
    await director.whenIdle()
    expect(director.session.events.filter(event => event.type === 'tool/result' && event.data.error !== undefined)).toEqual([])
    expect(director.session.events.findLast(event => event.type === 'turn/end')?.data.reason.kind).not.toBe('error')
    expect(story.world.context.proposals).toHaveLength(2)
    expect(story.world.context.notes).toEqual([])
    const proposal = story.world.context.proposals[0]!
    const narrationId = proposal.unit.sourceIds[0]!
    expect(contextSourceCanArchive(story.world.context, narrationId, 'director')).toBe(false)
    expect(await sourceText(ctx, story, story.world.context.sources.find(source => source.id === narrationId)!)).toBe(narration)
    const original = await ctx.storyController.contextSource({ storyId: story.id, sourceId: narrationId })
    expect(original.text).toBe(narration)
    const actorRegistration = story.sessions.find(session => session.actorId === 'a')!
    const actor = ctx.agents.get(actorRegistration.sessionId)!
    const recall = async (agent: typeof director, args: object) => ctx.tools.execute({ agent, name: 'roleplay_recall',
      callId: ToolCallId('recall'), signal: new AbortController().signal, arguments: args })
    expect(JSON.stringify(await recall(director, { event_ids: [narrationId] }))).toContain('红色封蜡')
    expect(JSON.stringify(await recall(actor, { event_ids: [narrationId] }))).not.toContain('红色封蜡')
    expect(JSON.stringify(await recall(director, { query: '玩家原始指令', scene_id: 'clock-room' }))).toContain('检查红色封蜡')
    const actorRequest = adapter.requests.find(request => request.sessionId === actor.session.id)!
    expect(JSON.stringify(actorRequest.messages)).not.toContain('钟楼密室的红色封蜡')
    expect(JSON.stringify(actorRequest.messages)).not.toContain('违约失去通行资格')
    expect(actorRequest.tools?.map(tool => tool.name).sort()).toEqual(['npc_commit_turn', 'npc_recall_knowledge', 'roleplay_recall'])
    await ctx.storyController.reviewContext({ storyId: story.id,
      reviews: [{ id: proposal.id, revision: proposal.revision, approve: true }] })
    expect(contextSourceCanArchive(story.world.context, narrationId, 'director')).toBe(true)
    expect(story.plotLedger.openThreads).toContain('账簿交付后须在天亮前交钥匙；违约失去通行资格。')
    const actorProposal = story.world.context.proposals.find(item => item.scope === 'actor:a')!
    await ctx.storyController.editContext({ storyId: story.id, id: actorProposal.id, revision: actorProposal.revision,
      unit: { ...actorProposal.unit, changes: actorProposal.unit.changes.map(change => ({ ...change, text: '我要求检查账簿；检查尚未完成。' })) },
    })
    await ctx.storyController.reviewContext({ storyId: story.id,
      reviews: [{ id: actorProposal.id, revision: actorProposal.revision + 1, approve: true }] })
    const saved = storyContextRetentionSchema.parse(JSON.parse(JSON.stringify(story.world.context)))
    expect(saved.notes[0]?.sourceIds).toEqual([narrationId])
    director.followup(createUserMessage({ content: [{ type: 'text', text: '【恢复推进】检查尚未完成事项。' }], source: { kind: 'user' } }))
    await director.whenIdle()
    expect(director.session.events.findLast(event => event.type === 'turn/end')?.data.reason.kind).not.toBe('error')
    const last = adapter.requests.at(-1)!
    expect(JSON.stringify(last.messages)).toContain('账簿交付后须在天亮前交钥匙')
    expect(last.tools).toEqual(adapter.requests[0]?.tools)
    expect(JSON.stringify(last.messages)).not.toContain('我要求检查账簿；检查尚未完成。')
    expect(story.world.context.proposals).toHaveLength(2)
    expect(story.world.context.notes.find(note => note.scope === 'actor:a')?.text).toBe('我要求检查账簿；检查尚未完成。')
    expect(adapter.requests).toHaveLength(5)
    await expect(ctx.storyController.reviewContext({ storyId: story.id,
      reviews: [{ id: proposal.id, revision: 1, approve: true }] })).rejects.toThrow()
    const preview = await ctx.storyController.requestContextPreview({ storyId: story.id, sessionId: director.session.id,
      beforeEventSeq: director.session.events.length })
    expect(preview.retention?.notes).toBe(1)
    expect({ sourceKinds: [...new Set(saved.sources.map(source => source.kind))], note: saved.notes[0]?.text,
      status: saved.proposals[0]?.status, actorTools: actorRequest.tools?.map(tool => tool.name).sort() }).toMatchInlineSnapshot(`
        {
          "actorTools": [
            "npc_commit_turn",
            "npc_recall_knowledge",
            "roleplay_recall",
          ],
          "note": "账簿交付后须在天亮前交钥匙；违约失去通行资格。",
          "sourceKinds": [
            "director-scene",
            "perception",
            "player-input",
            "director-narration",
            "actor-speech",
          ],
          "status": "approved",
        }
      `)
    await ctx.sessions.flush(director.session)
    await scaffold.close()
    scaffold = await launchWebScaffold(options)
    const restored = scaffold.ctx.storyRegistry.get(story.id)!
    expect(restored.world.context.notes).toEqual(saved.notes)
    expect(restored.world.context.proposals).toEqual(saved.proposals)
    expect((await scaffold.ctx.storyController.contextSource({ storyId: story.id, sourceId: narrationId })).text).toBe(narration)
  } finally { await scaffold.close(); await rm(storyHome, { recursive: true, force: true }) }
}, 120_000)
