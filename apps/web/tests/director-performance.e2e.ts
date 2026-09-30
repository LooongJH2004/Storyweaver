/** Optional real-provider probe of director cues and public response depth in isolated fiction. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import type {} from '@deepseek-ai/dsh-roleplay-services'
import type { BookId, CommandId } from '@deepseek-ai/dsh-roleplay-core/types'
import { initializeWorld } from '@deepseek-ai/dsh-roleplay-core'
import { launchWebScaffold } from './scaffold.ts'

it.skipIf(!process.env.DEEPSEEK_API_KEY)('measures developed performances after user-directed scene cues', async () => {
  vi.stubEnv('DSH_SNAPSHOT', 'record')
  const root = await mkdtemp(join(tmpdir(), 'storyweaver-performance-'))
  const scaffold = await launchWebScaffold({
    extraOverlayPath: fileURLToPath(new URL('../../../packages/experimental/roleplay-web-profile/cordis.patch.yml', import.meta.url)),
    extraInstallAnchors: [fileURLToPath(new URL('../../../packages/experimental/roleplay-web-profile/package.json', import.meta.url))],
    directoryPickerMode: 'overlay', extraEntryOverrides: [
      { id: 'story-home', config: { root } },
      { id: 'storage-json', config: { root: join(root, 'storages') } },
      { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions') } },
    ],
  })
  try {
    const draft = scaffold.ctx.roleplayBooks.saveDraft({ id: 'performance-probe' as BookId, expectedRevision: 0,
      title: '渡口修桥', resources: [], document: { schemaVersion: 6, id: 'performance-probe', title: '渡口修桥',
        protagonistActorId: 'courier', premise: '雨后，送药人和守桥人需要在天黑前找到过河的办法。',
        directorPrompt: '这是合作解决困难的冒险故事，角色由 AI 演绎。推进实际问题，避免反复试探和原地等待。',
        reasoningLanguage: '简体中文', directorGuidance: {}, characters: [
          { actorId: 'courier', displayName: '林舟', appearance: '背着药箱的年轻送药人', publicPersona: '急于将药送到河对岸。',
            rolePrompt: '你想在天黑前送药，愿意和守桥人合作，主动提出能做的事情。',
            capabilities: ['speak', 'act'], actingGuidance: {} },
          { actorId: 'keeper', displayName: '陈师傅', appearance: '带着工具袋的年长守桥人', publicPersona: '熟悉渡口和木桥。',
            rolePrompt: '你认真务实，愿意帮助送药人，提出具体可行的办法并解释风险。',
            capabilities: ['speak', 'act'], actingGuidance: {} },
        ] } })
    const version = scaffold.ctx.roleplayBooks.publish(draft.id, draft.revision)
    const instance = scaffold.ctx.roleplayBooks.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId },
      version => initializeWorld(version, { id: randomUUID, now: () => new Date().toISOString() })).instance
    const selected = scaffold.ctx.roleplayExecutionModel.read()
    await scaffold.ctx.roleplayExecutionModel.save({ expectedRevision: selected.revision,
      selection: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'low' } })
    const started = Date.now()
    const result = await scaffold.ctx.roleplayDirector.run({ instanceId: instance.id, id: randomUUID() as CommandId,
      expectedRevision: instance.revision, principal: { kind: 'player' } },
    '旁观推进：让送药人与守桥人在渡口相遇，尽快展开具体的过河方案。请给两人明确的本场表演指引，再让他们实际回应。正文充分展开，避免每人只说一句或一直犹豫。不需要创建角色或群组讨论。')
    const snapshot = scaffold.ctx.roleplayHistory.snapshot(instance.id)
    const view = scaffold.ctx.roleplayPlay.read({ instanceId: instance.id, audience: { kind: 'observer' }, offset: 0, limit: 40 })
    const rows = view.rows.filter(row => row.kind !== 'direction')
    const events = scaffold.ctx.agents.list().flatMap(agent => agent.session.events)
    const contexts = events.flatMap(event => event.type === 'roleplay/execution-request'
      && event.data.context.instanceId === instance.id ? [event.data.context] : [])
    const actorContexts = contexts.filter(context => 'actorId' in context)
    const metrics = { elapsedMs: Date.now() - started, status: result.status,
      rows: rows.map(row => ({ kind: row.kind, actorId: row.speaker?.actorId, text: row.text, characters: row.text.length })),
      cues: actorContexts.map(context => ({ actorId: context.actorId,
        guidance: context.sections.find(section => section.id === 'scene-style')?.content })),
      revision: snapshot.instance.revision }
    await writeFile(fileURLToPath(new URL('../../../.tmp/director-performance-live.json', import.meta.url)),
      JSON.stringify(metrics, null, 2), 'utf8')
    expect(result.status).toBe('completed')
    expect(result.actors).toEqual(expect.arrayContaining(['courier', 'keeper']))
    expect(actorContexts).toHaveLength(2)
    expect(metrics.cues.every(cue => cue.guidance !== undefined)).toBe(true)
    expect(rows.some(row => row.kind === 'narration')).toBe(true)
    // Length is recorded for human review rather than treated as a deterministic model guarantee.
    for (const actorId of ['courier', 'keeper']) expect(rows.some(row => row.speaker?.actorId === actorId)).toBe(true)
  } finally {
    await scaffold.close(); await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs()
  }
}, 180000)
