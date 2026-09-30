/** Optional live-provider diagnostic with synthetic fiction and isolated storage. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import type {} from '@deepseek-ai/dsh-roleplay-services'
import type { BookId, CommandId } from '@deepseek-ai/dsh-roleplay-core/types'
import { initializeWorld } from '@deepseek-ai/dsh-roleplay-core'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { launchWebScaffold } from './scaffold.ts'
import { HarnessDirectorExecutor } from '../../../packages/experimental/actor/src/director-executor.ts'
import { executionResponse } from '../../../packages/experimental/actor/src/execution-response.ts'

it.skipIf(!process.env.DEEPSEEK_API_KEY)('records actual director language and analysis across tool steps', async () => {
  vi.stubEnv('DSH_SNAPSHOT', 'record')
  const root = await mkdtemp(join(tmpdir(), 'storyweaver-director-language-'))
  const scaffold = await launchWebScaffold({
    extraOverlayPath: fileURLToPath(new URL('../../../packages/experimental/roleplay-web-profile/cordis.patch.yml', import.meta.url)),
    extraInstallAnchors: [fileURLToPath(new URL('../../../packages/experimental/roleplay-web-profile/package.json', import.meta.url))],
    directoryPickerMode: 'overlay', extraEntryOverrides: [
      { id: 'story-home', config: { root } },
      { id: 'storage-json', config: { root: join(root, 'storages') } },
      { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions') } },
      { id: 'roleplay-services', config: { databasePath: join(root, 'narrative.sqlite'), provider: 'deepseek-official', model: 'deepseek-v4-flash',
        journalMode: 'wal', busyTimeoutMs: 1000, queryPageLimit: 40, directorCommandLimit: 12,
        discussionTurnLimit: 16, maxContextUpdateUnits: 16, notificationIntervalMs: 10,
        recallCharacterLimit: 16000,
        characterLimits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
          maxActiveGoals: 32, maxScheduledIntentions: 32 } } },
    ],
  })
  const executor = new HarnessDirectorExecutor(scaffold.ctx.agents, {
    agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: ReasoningEffortId('low'), maxTokens: 2048 },
    setup: async () => {}, exists: async () => false, flush: async (session) => { await scaffold.ctx.sessions.flush(session) },
  })
  try {
    const draft = scaffold.ctx.roleplayBooks.saveDraft({ id: 'language-diagnostic' as BookId, expectedRevision: 0,
      title: '灯塔测试', resources: [], document: { schemaVersion: 6, id: 'language-diagnostic', title: '灯塔测试',
        premise: '黄昏的灯塔外传来两下敲门声。', directorPrompt: '保持场景简洁，只推进客观环境。',
        reasoningLanguage: '简体中文', directorGuidance: {}, characters: ['安宁', '白榆', '陈墨', '丁岚'].map((name, index) => ({
          actorId: `lighthouse-${index}`, displayName: name, publicPersona: '在灯塔等候的旅人。',
          rolePrompt: '独立观察与决定。', capabilities: ['speak', 'act'], actingGuidance: {},
        })) } })
    const version = scaffold.ctx.roleplayBooks.publish(draft.id, draft.revision)
    const values = { id: randomUUID, now: () => new Date().toISOString() }
    const instance = scaffold.ctx.roleplayBooks.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId },
      version => initializeWorld(version, values)).instance
    const context = scaffold.ctx.roleplayDirectorViews.context({ instanceId: instance.id,
      instruction: '先用 find 查询现有人物，然后用 finish 结束准备。本次不创建人物，不调度角色。' })
    const operations: string[] = []
    await executor.execute({ attempt: randomUUID(), context }, AbortSignal.timeout(90000), (_id, command) => {
      operations.push(command.operation)
      if (operations.length > 4) throw new Error('Diagnostic tool-step limit exceeded')
      return { complete: command.operation === 'finish', result: command.operation === 'find'
        ? JSON.parse(JSON.stringify(scaffold.ctx.roleplayViews.authorPeople(instance.id, command, context.revision))) : {} }
    })
    const agent = scaffold.ctx.agents.list().find(agent => agent.session.events.some(event => event.type === 'roleplay/execution-request'))!
    const responses = agent.session.events.filter(event => event.type === 'request/header').map(event => executionResponse(agent.session.events, event.seq))
    await writeFile(fileURLToPath(new URL('../../../.tmp/director-language-live.json', import.meta.url)),
      JSON.stringify({ model: 'deepseek-v4-flash', reasoningEffort: 'low', operations, responses }, null, 2), 'utf8')
    expect(operations).toEqual(['find', 'finish'])
    expect(responses.length).toBeGreaterThanOrEqual(2)
    expect(responses.length).toBeLessThanOrEqual(4)
    expect(responses.some(response => response.reasoning.length > 0)).toBe(true)
    for (const response of responses.filter(response => response.reasoning !== '')) {
      expect(response.reasoning).toMatch(/[\u4e00-\u9fff]/u)
      expect(response.reasoning).not.toMatch(/我心想|我觉得|我暗自|[（(](?:心想|内心)/u)
      expect(response.reasoning.length).toBeLessThan(500)
    }
    const opening = scaffold.ctx.roleplayBooks.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId },
      version => initializeWorld(version, values)).instance
    const selection = scaffold.ctx.roleplayExecutionModel.read()
    await scaffold.ctx.roleplayExecutionModel.save({ expectedRevision: selection.revision,
      selection: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'low' } })
    const result = await scaffold.ctx.roleplayDirector.run({ instanceId: opening.id, id: randomUUID() as CommandId,
      expectedRevision: opening.revision, principal: { kind: 'player' } },
    '请把现有的四名旅人安排在灯塔门外，用一小段旁白开场。沿用已有角色，不创建新人物；本次只完成场景与旁白，暂不调度角色回应。')
    expect(result.status).toBe('completed')
    const snapshot = scaffold.ctx.roleplayHistory.snapshot(opening.id)
    expect(snapshot.entities.filter(item => item.key.collection === 'people')).toHaveLength(4)
    expect(snapshot.entities.some(item => item.key.collection === 'narration')).toBe(true)
    const history = await scaffold.ctx.roleplayExecutionHistory.list(
      { instanceId: opening.id, revision: snapshot.instance.revision }, 0, 40)
    const openingAgent = scaffold.ctx.agents.list().find(agent => agent.session.events.some(event =>
      event.type === 'roleplay/execution-request' && event.data.context.instanceId === opening.id))!
    const failures = openingAgent.session.events.filter(event => event.type === 'tool/result' && event.data.error !== undefined)
    const openingResponses = openingAgent.session.events.filter(event => event.type === 'request/header').map(event => executionResponse(openingAgent.session.events, event.seq))
    await writeFile(fileURLToPath(new URL('../../../.tmp/director-opening-live.json', import.meta.url)),
      JSON.stringify({ model: 'deepseek-v4-flash', reasoningEffort: 'low', people: 4, failures, requests: history.entries, responses: openingResponses }, null, 2), 'utf8')
    expect(failures).toHaveLength(0)
    expect(history.total).toBeLessThanOrEqual(6)
    expect(history.entries[0]?.turnUsage?.totalTokens).toBeGreaterThan(0)
    for (const response of openingResponses.filter(response => response.reasoning !== '')) expect(response.reasoning).toMatch(/[\u4e00-\u9fff]/u)
  } finally { await executor.dispose(); await scaffold.close(); await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs() }
}, 120000)
