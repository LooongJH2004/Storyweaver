import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  defaultStoryContextRecipe,
  emptyDirectorOutline,
  emptyPlotLedger,
  emptyStoryDiscussions,
  emptyStoryMemory,
  emptyStoryWorld,
  StoryId,
  type DirectorRunExecutor,
  type Story,
} from '@deepseek-ai/dsh-story'
import StoryController from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('Story Controller Director Run controls', () => {
  it('forwards exact Run revisions and Actor identities to the Host executor', async () => {
    const story = fixtureStory()
    const runtime = {
      resume: vi.fn().mockResolvedValue(story),
      retryActor: vi.fn().mockResolvedValue(story),
      pause: vi.fn().mockResolvedValue(story),
      cancel: vi.fn().mockResolvedValue(story),
      skipActor: vi.fn().mockResolvedValue(story),
      cancelActor: vi.fn().mockResolvedValue(story),
    } satisfies DirectorRunExecutor
    const controller = harness(story, runtime)

    await expect(controller.resumeDirectorRun({ storyId: story.id, expectedRunRevision: 4 }))
      .resolves.toMatchObject({ story: { storyId: story.id } })
    await controller.retryDirectorRunActor({
      storyId: story.id, expectedRunRevision: 5, actorId: 'shadowheart',
    })
    await controller.pauseDirectorRun({ storyId: story.id, expectedRunRevision: 6 })
    await controller.cancelDirectorRun({ storyId: story.id, expectedRunRevision: 7 })
    await controller.skipDirectorRunActor({
      storyId: story.id, expectedRunRevision: 8, actorId: 'shadowheart',
    })
    await controller.cancelDirectorRunActor({
      storyId: story.id, expectedRunRevision: 9, actorId: 'shadowheart',
    })

    expect(runtime.resume).toHaveBeenCalledWith(story.id, 4)
    expect(runtime.retryActor).toHaveBeenCalledWith(story.id, 5, 'shadowheart')
    expect(runtime.pause).toHaveBeenCalledWith(story.id, 6)
    expect(runtime.cancel).toHaveBeenCalledWith(story.id, 7)
    expect(runtime.skipActor).toHaveBeenCalledWith(story.id, 8, 'shadowheart')
    expect(runtime.cancelActor).toHaveBeenCalledWith(story.id, 9, 'shadowheart')
  })

  it('reports an unavailable executor as a stable Remote failure', async () => {
    const story = fixtureStory()
    const controller = harness(story)
    await expect(controller.resumeDirectorRun({ storyId: story.id, expectedRunRevision: 0 }))
      .rejects.toMatchObject({ failure: { code: 'director-run-unavailable' } })
  })

  it('retains the final runtime Story as a template-only storybook', async () => {
    const story = fixtureStory()
    const retained = { ...story, templateOnly: true, sessions: [], sceneSessionIds: [] }
    const retainAsTemplate = vi.fn().mockResolvedValue(retained)
    const hardDelete = vi.fn()
    const controller = harness(story, undefined, { retainAsTemplate, delete: hardDelete })

    const result = await controller.delete({ storyId: story.id, preserveTemplate: true })
    expect(result.storyId).toBe(story.id)
    expect(result.retainedTemplate).toMatchObject({
      storyId: story.id,
      templateId: story.templateId,
      templateOnly: true,
    })
    expect(retainAsTemplate).toHaveBeenCalledWith(story.id)
    expect(hardDelete).not.toHaveBeenCalled()
  })

  it('hard-deletes a runtime Story when the storybook has another record', async () => {
    const story = fixtureStory()
    const sibling = { ...fixtureStory(), id: StoryId('story-87654321-4321-4321-8321-cba987654321') }
    const retainAsTemplate = vi.fn()
    const hardDelete = vi.fn().mockResolvedValue(undefined)
    const controller = harness(story, undefined, {
      list: () => [story, sibling], retainAsTemplate, delete: hardDelete,
    })

    await expect(controller.delete({ storyId: story.id, preserveTemplate: true }))
      .resolves.toEqual({ storyId: story.id })
    expect(hardDelete).toHaveBeenCalledWith(story.id)
    expect(retainAsTemplate).not.toHaveBeenCalled()
  })
})

function harness(story: Story, runtime?: DirectorRunExecutor, registry: object = {}): StoryController {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('storyRegistry', { list: () => [story], get: () => story, ...registry } as never)
  ctx.provide('storyHome', {} as never)
  ctx.provide('typert', {
    lookups: { configure: () => () => undefined },
    contexts: { configureHost: () => () => undefined },
  } as never)
  if (runtime !== undefined) ctx.provide('directorRuns', runtime)
  return new StoryController(ctx)
}

function fixtureStory(): Story {
  const scene = SessionId('scene-moonshadow')
  return {
    id: StoryId('story-12345678-1234-4123-8123-123456789abc'),
    templateId: 'bg3-moonshadow-ledger',
    templateOnly: false,
    title: '月影账簿',
    premise: '',
    sessions: [{ sessionId: scene, role: 'scene', createdAt: '2026-08-30T00:00:00.000Z' }],
    currentSceneSessionId: scene,
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
    archivedAt: undefined,
    plotLedger: emptyPlotLedger(),
    directorOutline: emptyDirectorOutline(),
    world: emptyStoryWorld(),
    memory: emptyStoryMemory(),
    discussions: emptyStoryDiscussions(),
    contextRecipe: defaultStoryContextRecipe(),
    promptOverrides: { revision: 0, actorPrompts: {}, contextRules: {}, styles: { profiles: {} } },
    sceneSessionIds: [scene],
    controlSessionId: undefined,
  }
}
