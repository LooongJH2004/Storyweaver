import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Context } from '@deepseek-ai/cordis'
import type { ISessions, SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IStories, StorySnapshot, StoryView } from '@deepseek-ai/dsh-api-story-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { StoryId } from '@deepseek-ai/dsh-story/types'
import {
  defaultStoryContextRecipe, emptyStoryDiscussions, emptyStoryMemory, emptyStoryWorld,
} from '@deepseek-ai/dsh-story'
import { groupStories, sceneTitle, StoryBrowser } from '../src/client/StoryBrowser.tsx'
import { UiStoryService } from '../src/client/navigation.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

const sid = (value: string) => value as SessionId
const storyId = (value: string) => value as StoryId

it('does not expose the managed .runtime directory as a scene title', () => {
  expect(sceneTitle('.runtime', '场景 1')).toBe('场景 1')
  expect(sceneTitle('月下会面', '场景 1')).toBe('月下会面')
})

it('renders an empty storybook with a direct start action', () => {
  const template = {
    ...story('template-anchor'),
    templateId: 'moonshadow-ledger',
    templateOnly: true,
    title: '月影账簿',
  }
  const html = renderToStaticMarkup(createElement(StoryBrowser, {
    wide: true,
    expandSidebar: vi.fn(),
    useStories: (select: (value: StorySnapshot) => unknown) => select({
      items: [template], phase: 'ready', error: null,
    }),
    useSessions: (select: (value: SessionListState) => unknown) => select(sessionState()),
    startStory: vi.fn(),
    newStory: vi.fn(),
    renameStory: vi.fn(),
    deleteStory: vi.fn(),
    deleteTemplate: vi.fn(),
    t: (key: string) => key === 'run.empty' ? '还没有故事，点击开始' : key,
  } as never))

  expect(html).toContain('月影账簿')
  expect(html).toContain('还没有故事，点击开始')
  expect(html).not.toContain('删除本次故事')
})

it('does not render creator Sessions that are no longer managed by a Story', () => {
  const creator = sid('orphaned-creator')
  const sessions: SessionListState = {
    ...sessionState(),
    ids: [creator],
    byId: {
      [creator]: {
        id: creator, displayTitle: 'Orphaned creation task', running: false, blank: false, updatedAt: 1,
        projectionValues: { agentPreset: 'storyweaver-creator' },
      },
    },
  }
  const html = renderToStaticMarkup(createElement(StoryBrowser, {
    wide: true,
    expandSidebar: vi.fn(),
    useStories: (select: (value: StorySnapshot) => unknown) => select({
      items: [], phase: 'ready', error: null,
    }),
    useSessions: (select: (value: SessionListState) => unknown) => select(sessions),
    startStory: vi.fn(),
    createCreationTask: vi.fn(),
    openCreationTask: vi.fn(),
    deleteCreationTask: vi.fn(),
    importStory: vi.fn(),
    newStory: vi.fn(),
    renameStory: vi.fn(),
    deleteStory: vi.fn(),
    deleteTemplate: vi.fn(),
    t: (key: string) => key,
  } as never))

  expect(html).not.toContain('Orphaned creation task')
  expect(html).toContain('creator.empty')
  expect(html).toContain('story.import')
})

function story(id: string, scenes: readonly SessionId[] = []): StoryView {
  return {
    storyId: storyId(id),
    templateId: id,
    templateOnly: false,
    title: id,
    premise: '',
    sceneSessionIds: scenes,
    ...(scenes[0] === undefined ? {} : { currentSceneSessionId: scenes[0] }),
    matters: { public: [], actors: {} },
    actors: [],
    plotLedger: {
      revision: 0, situation: '', establishedFacts: [], openThreads: [], pendingNpcEvents: [],
    },
    directorOutline: {
      schemaVersion: 1, revision: 0, updateMode: 'auto_unlocked', premise: '',
      premiseLocked: false, themes: [], hardConstraints: [], arcs: [], beats: [],
      foreshadows: [], mysteries: [], clocks: [], pendingSuggestions: [], history: [],
      updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'system',
    },
    world: emptyStoryWorld(),
    memory: emptyStoryMemory(),
    discussions: emptyStoryDiscussions(),
    contextRecipe: defaultStoryContextRecipe(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function sessionState(current?: SessionId): SessionListState {
  return {
    ids: [], byId: {}, current, phase: 'ready', subagentsByParent: {}, jobsBySession: {},
    currentAddress: undefined,
  }
}

function harness(initialStories: StoryView[], current?: SessionId) {
  const ctx = new Context()
  contexts.push(ctx)
  const storyStore = createSnapshotStore<StorySnapshot>({
    items: initialStories, phase: 'ready', error: null,
  })
  const sessionsStore = createSnapshotStore<SessionListState>(sessionState(current))
  const selectScene = vi.fn(async (id: StoryId, sessionId: SessionId) => {
    const found = storyStore.getSnapshot().items.find(item => item.storyId === id)
    if (found === undefined) throw new Error('missing Story')
    const changed = { ...found, currentSceneSessionId: sessionId }
    storyStore.set({
      ...storyStore.getSnapshot(),
      items: storyStore.getSnapshot().items.map(item => item.storyId === id ? changed : item),
    })
    return changed
  })
  const touch = vi.fn(async (id: StoryId) => {
    const found = storyStore.getSnapshot().items.find(item => item.storyId === id)
    if (found === undefined) throw new Error('missing Story')
    return found
  })
  const createStory = vi.fn(async (input: { readonly title?: string } = {}) => {
    const created = { ...story(`created-${storyStore.getSnapshot().items.length + 1}`), title: input.title ?? 'Untitled' }
    storyStore.set({ ...storyStore.getSnapshot(), items: [created, ...storyStore.getSnapshot().items] })
    return created
  })
  const createFromTemplate = vi.fn(async (sourceStoryId: StoryId) => {
    const source = storyStore.getSnapshot().items.find(item => item.storyId === sourceStoryId)
    if (source === undefined) throw new Error('missing Story template')
    const created = {
      ...story(`created-${storyStore.getSnapshot().items.length + 1}`),
      templateId: source.templateId,
      title: source.title,
      premise: source.premise,
    }
    storyStore.set({ ...storyStore.getSnapshot(), items: [created, ...storyStore.getSnapshot().items] })
    return created
  })
  const importStorybook = vi.fn(async () => {
    const imported = { ...story('imported-storybook'), templateOnly: true, title: 'Imported Storybook' }
    storyStore.set({ ...storyStore.getSnapshot(), items: [imported, ...storyStore.getSnapshot().items] })
    return imported
  })
  const importPackage = vi.fn(async () => {
    const imported = { ...story('imported-package'), title: 'Imported Package' }
    storyStore.set({ ...storyStore.getSnapshot(), items: [imported, ...storyStore.getSnapshot().items] })
    return imported
  })
  const deleteStory = vi.fn(async (id: StoryId) => {
    storyStore.set({
      ...storyStore.getSnapshot(), items: storyStore.getSnapshot().items.filter(item => item.storyId !== id),
    })
  })
  const deleteRun = vi.fn(async (id: StoryId) => {
    const items = storyStore.getSnapshot().items
    const target = items.find(item => item.storyId === id)
    if (target === undefined) throw new Error('missing Story run')
    const hasSibling = items.some(item => item.storyId !== id && item.templateId === target.templateId)
    if (hasSibling) {
      storyStore.set({ ...storyStore.getSnapshot(), items: items.filter(item => item.storyId !== id) })
      return
    }
    const { currentSceneSessionId: _currentSceneSessionId, controlSessionId: _controlSessionId, ...base } = target
    storyStore.set({
      ...storyStore.getSnapshot(),
      items: items.map(item => item.storyId === id
        ? { ...base, templateOnly: true, sceneSessionIds: [], actors: [] }
        : item),
    })
  })
  const archive = vi.fn(async (id: StoryId) => {
    storyStore.set({
      ...storyStore.getSnapshot(), items: storyStore.getSnapshot().items.filter(item => item.storyId !== id),
    })
  })
  const archiveSession = vi.fn(async (sessionId: SessionId) => {
    const found = storyStore.getSnapshot().items.find(item => (
      item.sceneSessionIds.includes(sessionId) || item.controlSessionId === sessionId
    ))
    if (found === undefined) throw new Error('missing Story Session')
    const remaining = found.sceneSessionIds.filter(id => id !== sessionId)
    const {
      currentSceneSessionId: _currentSceneSessionId,
      controlSessionId: _controlSessionId,
      ...withoutCurrent
    } = found
    const changed: StoryView = {
      ...withoutCurrent,
      sceneSessionIds: remaining,
      ...(remaining[0] === undefined ? {} : { currentSceneSessionId: remaining[0] }),
      ...(found.controlSessionId === sessionId || found.controlSessionId === undefined
        ? {}
        : { controlSessionId: found.controlSessionId }),
    }
    storyStore.set({
      ...storyStore.getSnapshot(),
      items: storyStore.getSnapshot().items.map(item => item.storyId === found.storyId ? changed : item),
    })
    return changed
  })
  const stories = {
    list: storyStore,
    create: createStory,
    createFromTemplate,
    importStorybook,
    importPackage,
    deleteRun,
    delete: deleteStory,
    rename: vi.fn(),
    setPremise: vi.fn(),
    archive,
    touch,
    archiveSession,
    selectScene,
  } as unknown as IStories
  let nextScene = 0
  const createSession = vi.fn(async () => {
    nextScene += 1
    return sid(`new-scene-${nextScene}`)
  })
  const open = vi.fn((id: SessionId) => {
    sessionsStore.set({ ...sessionsStore.getSnapshot(), current: id })
  })
  const clear = vi.fn(() => {
    sessionsStore.set({ ...sessionsStore.getSnapshot(), current: undefined })
  })
  const sessions = {
    list: sessionsStore,
    create: createSession,
    open,
    clear,
  } as unknown as ISessions
  const navigation = new UiStoryService(ctx, stories, sessions, {
    pick: vi.fn(async () => ({ ok: true as const, value: 'D:\\authorized-creator-workspace' })),
  } as never)
  return {
    navigation, storyStore, sessionsStore, selectScene, touch, createStory,
    createFromTemplate, importStorybook, importPackage, deleteRun, deleteStory,
    createSession, open, clear, archive, archiveSession,
  }
}

describe('UiStoryService', () => {
  it('opens an existing current scene through Story commands', async () => {
    const scene = sid('scene-one')
    const item = story('story-one', [scene])
    const b = harness([item], scene)
    await expect(b.navigation.connectStory(item.storyId)).resolves.toBe(scene)
    expect(b.selectScene).toHaveBeenCalledWith(item.storyId, scene)
    expect(b.touch).toHaveBeenCalledWith(item.storyId)
    expect(b.createSession).not.toHaveBeenCalled()
  })

  it('coalesces concurrent first-scene creation and uses Story Session semantics', async () => {
    const item = story('story-empty')
    const b = harness([item], sid('unowned-current'))
    const [first, second] = await Promise.all([
      b.navigation.connectStory(item.storyId),
      b.navigation.connectStory(item.storyId),
    ])
    expect(first).toBe(second)
    expect(b.createSession).toHaveBeenCalledOnce()
    expect(b.createSession).toHaveBeenCalledWith({
      storyId: item.storyId, storySessionRole: 'scene',
    })
    expect(b.selectScene).toHaveBeenCalledWith(item.storyId, first)
  })

  it('creates and opens a new Story from the product-level action', async () => {
    const b = harness([], sid('keep-auto-selection-idle'))
    b.navigation.startStory()
    await vi.waitFor(() => { expect(b.open).toHaveBeenCalledWith(sid('new-scene-1')) })
    expect(b.createStory).toHaveBeenCalledWith({})
    expect(b.createSession).toHaveBeenCalledWith({
      storyId: storyId('created-1'), storySessionRole: 'scene',
    })
  })

  it('starts a new independent Story from the selected authored baseline', async () => {
    const source = { ...story('story-source', [sid('source-scene')]), templateId: 'moonshadow-ledger' }
    const b = harness([source], source.currentSceneSessionId)
    const sessionId = await b.navigation.newStory(source.storyId)
    expect(b.createFromTemplate).toHaveBeenCalledWith(source.storyId)
    expect(b.createSession).toHaveBeenCalledWith({
      storyId: storyId('created-2'), storySessionRole: 'scene',
    })
    expect(b.open).toHaveBeenCalledWith(sessionId)
    expect(b.storyStore.getSnapshot().items).toHaveLength(2)
  })

  it('imports standalone Storybooks and complete Story Packages through one library action', async () => {
    const b = harness([])
    await expect(b.navigation.importStory(JSON.stringify({ schemaVersion: 4 })))
      .resolves.toMatchObject({ title: 'Imported Storybook' })
    expect(b.importStorybook).toHaveBeenCalledOnce()
    expect(b.importPackage).not.toHaveBeenCalled()

    await expect(b.navigation.importStory(JSON.stringify({
      format: 'dsh-roleplay-story-package', version: 3,
    }))).resolves.toMatchObject({ title: 'Imported Package' })
    expect(b.importPackage).toHaveBeenCalledOnce()
  })

  it('deletes a creation task through its managed draft Story', async () => {
    const control = sid('creator-control')
    const draft = { ...story('creator-draft'), controlSessionId: control }
    const b = harness([draft], control)
    b.sessionsStore.set({
      ...sessionState(control),
      ids: [control],
      byId: {
        [control]: {
          id: control, displayTitle: 'Creation task', running: false, blank: false, updatedAt: 1,
          projectionValues: { agentPreset: 'storyweaver-creator' },
        },
      },
    })

    await b.navigation.deleteCreationTask(control)

    expect(b.deleteStory).toHaveBeenCalledWith(draft.storyId)
    expect(b.archiveSession).not.toHaveBeenCalled()
    expect(b.clear).toHaveBeenCalledOnce()
  })

  it('deletes a published creation task without deleting its published storybook', async () => {
    const control = sid('published-creator-control')
    const template = { ...story('published-template'), templateOnly: true, controlSessionId: control }
    const b = harness([template], control)
    b.sessionsStore.set({
      ...sessionState(control),
      ids: [control],
      byId: {
        [control]: {
          id: control, displayTitle: 'Published creation task', running: false, blank: false, updatedAt: 1,
          projectionValues: { agentPreset: 'storyweaver-creator' },
        },
      },
    })

    await b.navigation.deleteCreationTask(control)

    expect(b.deleteStory).not.toHaveBeenCalled()
    expect(b.archiveSession).toHaveBeenCalledWith(control)
    expect(b.storyStore.getSnapshot().items).toEqual([
      expect.objectContaining({ storyId: template.storyId, templateOnly: true }),
    ])
    expect(b.storyStore.getSnapshot().items[0]?.controlSessionId).toBeUndefined()
    expect(b.clear).toHaveBeenCalledOnce()
  })

  it('deletes a selected Story run and opens another run from the same storybook', async () => {
    const scene = sid('scene-owned')
    const first = { ...story('story-one', [scene]), templateId: 'moonshadow-ledger' }
    const second = { ...story('story-two', [sid('scene-two')]), templateId: 'moonshadow-ledger' }
    const b = harness([first, second], scene)
    await b.navigation.deleteStory(first.storyId)
    expect(b.deleteRun).toHaveBeenCalledWith(first.storyId)
    await vi.waitFor(() => { expect(b.open).toHaveBeenCalledWith(sid('scene-two')) })
  })

  it('keeps an empty storybook after deleting its final Story run', async () => {
    const scene = sid('only-scene')
    const only = { ...story('only-run', [scene]), templateId: 'moonshadow-ledger' }
    const b = harness([only], scene)

    await b.navigation.deleteStory(only.storyId)

    expect(b.deleteRun).toHaveBeenCalledWith(only.storyId)
    expect(b.clear).toHaveBeenCalledOnce()
    const retained = b.storyStore.getSnapshot().items
    expect(retained).toEqual([expect.objectContaining({
      storyId: only.storyId,
      templateId: 'moonshadow-ledger',
      templateOnly: true,
      sceneSessionIds: [],
    })])
    expect(groupStories(retained)).toEqual([expect.objectContaining({
      templateId: 'moonshadow-ledger',
      runs: [],
    })])
  })

  it('groups independent Story runs by their authored setting', () => {
    const first = {
      ...story('run-one'), templateId: 'moonshadow-ledger',
      createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const second = {
      ...story('run-two'), templateId: 'moonshadow-ledger',
      createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-04T00:00:00.000Z',
    }
    const other = {
      ...story('other'), templateId: 'other-book',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z',
    }
    expect(groupStories([second, first, other]).map(group => ({
      templateId: group.templateId,
      runs: group.runs.map(run => run.storyId),
    }))).toEqual([
      { templateId: 'moonshadow-ledger', runs: [first.storyId, second.storyId] },
      { templateId: 'other-book', runs: [other.storyId] },
    ])
  })

  it('uses a template-only record as the storybook representative without rendering it as a run', () => {
    const template = {
      ...story('template-anchor'), templateId: 'moonshadow-ledger', templateOnly: true,
    }
    const run = { ...story('runtime-story'), templateId: 'moonshadow-ledger' }
    expect(groupStories([run, template])).toEqual([expect.objectContaining({
      representative: template,
      runs: [run],
    })])
    expect(groupStories([template])).toEqual([expect.objectContaining({
      representative: template,
      runs: [],
    })])
  })
})
