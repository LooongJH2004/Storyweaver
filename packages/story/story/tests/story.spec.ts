import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import StoryHome from '@deepseek-ai/dsh-story-home'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import StoryRegistry, { StorySessionOwnershipError } from '../src/index.ts'

const contexts: Context[] = []
const roots: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function harness(pool = new MemoryMediaPool()) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-story-registry-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  await ctx.plugin(StoryHome, { root })
  await ctx.plugin(StoryRegistry)
  return { ctx, pool, registry: ctx.storyRegistry, root }
}

describe('StoryRegistry', () => {
  it('owns Story metadata, scene selection, and path-free Session roles', async () => {
    const { registry, root } = await harness()
    const story = await registry.create('  雾港来信  ', '  一封无人寄出的信。  ')
    const first = SessionId('scene-first')
    const second = SessionId('scene-second')
    const control = SessionId('director-control')
    const actor = SessionId('actor-lin')

    expect(story.title).toBe('雾港来信')
    expect(story.premise).toBe('一封无人寄出的信。')
    expect(story.plotLedger).toEqual({
      revision: 0,
      situation: '',
      establishedFacts: [],
      openThreads: [],
      pendingNpcEvents: [],
    })
    expect(story.directorOutline).toMatchObject({
      schemaVersion: 1,
      revision: 0,
      updateMode: 'auto_unlocked',
      premise: '',
      pendingSuggestions: [],
    })
    await registry.attachSession(story.id, first, 'scene')
    await registry.attachSession(story.id, second, 'scene')
    await registry.attachSession(story.id, control, 'control')
    await registry.attachSession(story.id, actor, 'actor', '林岚')

    expect(story.sceneSessionIds).toEqual([second, first])
    expect(story.currentSceneSessionId).toBe(second)
    expect(story.controlSessionId).toBe(control)
    expect(registry.storyForSession(actor)).toEqual({
      storyId: story.id, role: 'actor', actorId: '林岚', archived: false,
    })
    expect(registry.runtimePath(story.id)).toBe(join(root, 'stories', story.id, '.runtime'))

    await registry.setCurrentScene(story.id, first)
    await registry.archiveSession(first)
    expect(story.currentSceneSessionId).toBe(second)
    expect(registry.storyForSession(first)?.archived).toBe(true)

    const manifest = JSON.parse(await readFile(
      join(root, 'stories', story.id, 'story.json'), 'utf8',
    )) as Record<string, unknown>
    expect(manifest).toMatchObject({ storyId: story.id, title: '雾港来信' })
    expect(JSON.stringify(manifest)).not.toContain(root)
  })

  it('commits strict revisioned Director Briefs without character behavior fields', async () => {
    const { registry } = await harness()
    const story = await registry.create('雾港来信')
    const scene = SessionId('scene-current')
    const control = SessionId('director-control')
    const actor = SessionId('actor-lin')
    await registry.attachSession(story.id, scene, 'scene')
    await registry.attachSession(story.id, control, 'control')
    await registry.attachSession(story.id, actor, 'actor', 'lin')
    await registry.stageScene(story.id, {
      expectedWorldRevision: 0,
      sceneId: 'fog-harbor-warehouse',
      location: '旧码头仓库外',
      summary: '林岚独自在旧码头仓库外。',
      presentActorIds: ['lin'],
    })

    await registry.commitDirectorBrief(story.id, control, {
      expectedLedgerRevision: 0,
      sceneSessionId: scene,
      situation: '潮水没过旧码头，仓库里仍亮着一盏灯。',
      establishedFacts: ['林岚看见仓库门缝透出灯光。'],
      openThreads: ['灯是谁点亮的？'],
      actorBriefs: [{
        actorId: 'lin',
        perceptions: ['能闻到潮湿木料和灯油。'],
        uncertainties: ['门后是否有人。'],
      }],
    })

    expect(story.plotLedger).toMatchObject({
      revision: 1,
      situation: '潮水没过旧码头，仓库里仍亮着一盏灯。',
      latestBrief: {
        sourceLedgerRevision: 0,
        ledgerRevision: 1,
        directorSessionId: control,
        sceneSessionId: scene,
        sourceNpcEvents: [],
      },
    })
    expect(() => registry.commitDirectorBrief(story.id, control, {
      expectedLedgerRevision: 1,
      sceneSessionId: scene,
      situation: '导演越权。',
      establishedFacts: [],
      openThreads: [],
      actorBriefs: [],
      dialogue: '林岚说：“我进去。”',
    } as never)).toThrow(expect.objectContaining({ code: 'DIRECTOR_INVALID_BRIEF' }))
    await expect(registry.commitDirectorBrief(story.id, control, {
      expectedLedgerRevision: 0,
      sceneSessionId: scene,
      situation: '过期计划。',
      establishedFacts: [],
      openThreads: [],
      actorBriefs: [],
    })).rejects.toMatchObject({ code: 'DIRECTOR_STALE_LEDGER' })
    await expect(registry.commitDirectorBrief(story.id, actor, {
      expectedLedgerRevision: 1,
      sceneSessionId: scene,
      situation: '角色不能成为导演。',
      establishedFacts: [],
      openThreads: [],
      actorBriefs: [],
    })).rejects.toMatchObject({ code: 'DIRECTOR_INVALID_SESSION' })
  })

  it('rejects duplicate control, Actor, and cross-Story Session ownership', async () => {
    const { registry } = await harness()
    const first = await registry.create('第一幕')
    const second = await registry.create('第二幕')
    await registry.attachSession(first.id, SessionId('control-one'), 'control')
    await expect(registry.attachSession(first.id, SessionId('control-two'), 'control'))
      .rejects.toBeInstanceOf(StorySessionOwnershipError)
    await registry.attachSession(first.id, SessionId('actor-one'), 'actor', '守门人')
    await expect(registry.attachSession(first.id, SessionId('actor-two'), 'actor', '守门人'))
      .rejects.toBeInstanceOf(StorySessionOwnershipError)
    await registry.attachSession(first.id, SessionId('shared-scene'), 'scene')
    await expect(registry.attachSession(second.id, SessionId('shared-scene'), 'scene'))
      .rejects.toBeInstanceOf(StorySessionOwnershipError)
    await expect(registry.attachSession(first.id, SessionId('actor-without-id'), 'actor'))
      .rejects.toThrow(/requires actorId/)
  })

  it('groups independent runs by template identity and hard-deletes registry ownership', async () => {
    const { registry, root } = await harness()
    const story = await registry.create('月影账簿', '测试前提', 'bg3-moonshadow-ledger')
    const scene = SessionId('moonshadow-run')
    await registry.attachSession(story.id, scene, 'scene')
    expect(story.templateId).toBe('bg3-moonshadow-ledger')

    await registry.delete(story.id)
    expect(registry.get(story.id)).toBeUndefined()
    expect(registry.storyForSession(scene)).toBeUndefined()
    await expect(readFile(join(root, 'stories', story.id, 'story.json'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('retains the final run as an empty storybook anchor', async () => {
    const { registry, root } = await harness()
    const story = await registry.create('月影账簿', '测试前提', 'bg3-moonshadow-ledger')
    const scene = SessionId('moonshadow-final-run')
    await registry.attachSession(story.id, scene, 'scene')

    const retained = await registry.retainAsTemplate(story.id)

    expect(retained).toBe(story)
    expect(retained.templateOnly).toBe(true)
    expect(retained.sessions).toEqual([])
    expect(retained.sceneSessionIds).toEqual([])
    expect(retained.currentSceneSessionId).toBeUndefined()
    expect(retained.plotLedger.revision).toBe(0)
    expect(retained.world.revision).toBe(0)
    expect(registry.storyForSession(scene)).toBeUndefined()
    expect(JSON.parse(await readFile(
      join(root, 'stories', story.id, 'story.json'), 'utf8',
    ))).toMatchObject({ templateOnly: true, sessions: [] })
  })

  it('reopens canonical Stories without scanning or migrating another source', async () => {
    const pool = new MemoryMediaPool()
    const first = await harness(pool)
    const story = await first.registry.create('持久故事')
    const scene = SessionId('persisted-scene')
    await first.registry.attachSession(story.id, scene, 'scene')
    await first.registry.stageScene(story.id, {
      expectedWorldRevision: 0,
      sceneId: 'persisted-opening',
      location: '持久场景',
      summary: '故事进入持久场景。',
      presentActorIds: [],
    })
    await first.registry.commitDirectorBrief(story.id, scene, {
      expectedLedgerRevision: 0,
      sceneSessionId: scene,
      situation: '持久态势',
      establishedFacts: ['潮水正在上涨。'],
      openThreads: ['谁会先离开？'],
      actorBriefs: [],
    })
    await first.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(first.ctx), 1)

    const second = await harness(pool)
    const restored = second.registry.get(story.id)
    expect(restored?.title).toBe('持久故事')
    expect(restored?.sceneSessionIds).toEqual([SessionId('persisted-scene')])
    expect(restored?.plotLedger).toMatchObject({ revision: 1, situation: '持久态势' })
    expect(second.registry.storyForSession(SessionId('persisted-scene'))).toMatchObject({
      storyId: story.id, role: 'scene', archived: false,
    })
  })
})
