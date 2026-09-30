// @vitest-environment jsdom
/** Conversation assembly acceptance independent of Tool presentation. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import type { StorySnapshot, StoryView } from '@deepseek-ai/dsh-api-story-controller/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { ISession } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotTestRuntime, usePinnedBrowserLanguages, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { InputHub } from '../src/client/input/hub.ts'
import { apply, inject, type EmptyStoryOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { StoryId } from '@deepseek-ai/dsh-story/types'
import {
  defaultStoryContextRecipe, emptyStoryDiscussions, emptyStoryMemory, emptyStoryWorld,
} from '@deepseek-ai/dsh-story'

// jsdom implements no Range geometry (Lexical's scroll-into-view measures the
// caret with one once the surface is genuinely contenteditable).
Range.prototype.getBoundingClientRect = () => ({
  top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}),
})


usePinnedBrowserLanguages('zh-CN')

const SID = 's1' as SessionId
const STORY_ID = 'story-1' as StoryId

/** jsdom has no ResizeObserver; the composer seat publishes its height through one. */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

type AppRootProps = PropsRenderSlots<'conversation'>
function AppRoot({ renderSlot }: AppRootProps) {
  return <>{renderSlot('conversation', {})}</>
}

const LAYOUT_CHILDREN = {
  'conversation': { kind: 'single', scope: 'session-maybe' },
} as const

function StoryProbe({ open }: EmptyStoryOwnerProps) {
  const [count, setCount] = useState(0)
  return (
    <button data-testid="story-probe" onClick={() => { setCount(value => value + 1) }}>
      {String(open)}:{count}
    </button>
  )
}

function provideStory(runtime: SlotTestRuntime): void {
  const story: StoryView = {
    storyId: STORY_ID,
    templateId: 'story-1',
    templateOnly: false,
    title: 'Story',
    premise: '',
    sceneSessionIds: [SID],
    currentSceneSessionId: SID,
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
  runtime.slots.provideRoot({
    hooks: { stories: createSnapshotStore<StorySnapshot>({ items: [story], phase: 'ready', error: null }) },
  })
}

async function bench(opts?: { blank?: boolean }) {
  const runtime = await SlotTestRuntime.create()
  runtime.ctx.provide('uiStory', { connectStory: vi.fn(async () => SID) } as never)
  provideStory(runtime)
  runtime.ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  await runtime.sessions.add({
    id: SID,
    summary: { title: 'S', displayTitle: 'S', cwd: '/proj' },
    ...(opts?.blank === true ? { snapshot: { blank: true } } : {}),
    session: {
      loadOlder: vi.fn<ISession['loadOlder']>(),
      prompt: vi.fn<ISession['prompt']>(async () => ({ ok: true, value: { accepted: true } })),
    },
  })
  await runtime.root.declare(LAYOUT_CHILDREN, AppRoot)
  await runtime.mount({ inject: [...inject], apply })
  return runtime
}

describe('resident composer', () => {
  it('renders the locked view state while no session exists at all', async () => {
    const runtime = await SlotTestRuntime.create()
    runtime.ctx.provide('uiStory', { connectStory: vi.fn(async () => SID) } as never)
    provideStory(runtime)
    runtime.ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
    const locale = new LocaleRuntime(runtime.ctx)
    runtime.ctx.provide('locale', locale)
    runtime.slots.installLocale(locale)
    await runtime.root.declare(LAYOUT_CHILDREN, AppRoot)
    await runtime.mount({ inject: [...inject], apply })
    runtime.slots.register({ name: 'conversation.hero.story' }, StoryProbe)
    const view = runtime.renderRoot()
    const textarea = view.container.querySelector<HTMLDivElement>('[data-composer-input]')
    expect(textarea).not.toBeNull()
    expect(textarea!.getAttribute('aria-disabled')).not.toBe('true')
    expect(textarea!.getAttribute('contenteditable')).not.toBe('true')
    expect(textarea!.getAttribute('aria-haspopup')).toBe('menu')
    expect(view.getByTestId('story-probe').textContent).toBe('false:0')
    fireEvent.click(textarea!)
    expect(view.getByTestId('story-probe').textContent).toBe('true:0')
    expect(textarea!.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(view.getByRole('button', { name: '选择故事' }))
    fireEvent.keyDown(textarea!, { key: 'Enter' })
    expect(view.getByTestId('story-probe').textContent).toBe('true:0')
    expect(view.getByRole('button', { name: '选择故事' })).toBeTruthy()
    await runtime.dispose()
  })

  it('keeps the complete Hero tree mounted when the first Story scene appears', async () => {
    const runtime = await SlotTestRuntime.create()
    runtime.ctx.provide('uiStory', { connectStory: vi.fn(async () => SID) } as never)
    provideStory(runtime)
    runtime.ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
    const locale = new LocaleRuntime(runtime.ctx)
    runtime.ctx.provide('locale', locale)
    runtime.slots.installLocale(locale)
    await runtime.root.declare(LAYOUT_CHILDREN, AppRoot)
    await runtime.mount({ inject: [...inject], apply })
    runtime.slots.register({ name: 'conversation.hero.story' }, StoryProbe)
    const view = runtime.renderRoot()

    const root = view.container.querySelector('[data-phase="hero"]')!
    const scrollBody = view.container.querySelector('[data-conversation-scroll]')!
    const composerSeat = view.container.querySelector('[data-composer-seat]')!
    const textarea = view.container.querySelector<HTMLDivElement>('[data-composer-input]')!
    const storyChip = view.getByRole('button', { name: '选择故事' })
    const storyProbe = view.getByTestId('story-probe')
    expect(textarea.getAttribute('aria-disabled')).not.toBe('true')
    expect(textarea.getAttribute('contenteditable')).not.toBe('true')

    fireEvent.click(storyChip)
    fireEvent.click(storyProbe)
    expect(storyProbe.textContent).toBe('true:1')

    await runtime.sessions.add({
      id: SID,
      summary: { title: 'S', displayTitle: 'S', cwd: '/proj', blank: true },
      snapshot: { blank: true },
    })

    expect(view.container.querySelector('[data-phase="hero"]')).toBe(root)
    expect(view.container.querySelector('[data-conversation-scroll]')).toBe(scrollBody)
    expect(view.container.querySelector('[data-composer-seat]')).toBe(composerSeat)
    expect(view.container.querySelector<HTMLDivElement>('[data-composer-input]')).toBe(textarea)
    expect(view.getByRole('button', { name: '选择故事' })).toBe(storyChip)
    expect(view.getByTestId('story-probe')).toBe(storyProbe)
    expect(storyProbe.textContent).toBe('true:1')
    expect(textarea.getAttribute('aria-disabled')).not.toBe('true')
    expect(textarea.getAttribute('contenteditable')).toBe('true')
    await runtime.dispose()
  })

  it('the textarea survives the blank→active conversion as the same DOM node', async () => {
    const runtime = await bench({ blank: true })
    const view = runtime.renderRoot()
    const hero = view.container.querySelector<HTMLDivElement>('[data-composer-input]')
    expect(hero).not.toBeNull()
    expect(hero!.getAttribute('aria-disabled')).not.toBe('true')

    await runtime.sessions.updateSessionSnapshot(SID, (draft) => {
      draft.blank = false
    })
    expect(view.container.querySelector<HTMLDivElement>('[data-composer-input]')).toBe(hero)
    await runtime.dispose()
  })
})

describe('prompt rejection through the assembled composer', () => {
  it('renders the promptError alert strip and keeps the draft in the machine', async () => {
    const runtime = await SlotTestRuntime.create()
    runtime.ctx.provide('uiStory', { connectStory: vi.fn(async () => SID) } as never)
    provideStory(runtime)
    runtime.ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
    const locale = new LocaleRuntime(runtime.ctx)
    runtime.ctx.provide('locale', locale)
    runtime.slots.installLocale(locale)
    const prompt = vi.fn<ISession['prompt']>(async () => ({
      ok: false, error: { code: 'agent-busy', message: 'prompt rejected before acceptance', details: { reason: 'busy' } },
    }))
    await runtime.sessions.add({
      id: SID,
      summary: { title: 'S', displayTitle: 'S', cwd: '/proj' },
      session: { prompt, loadOlder: vi.fn<ISession['loadOlder']>() },
    })
    await runtime.root.declare(LAYOUT_CHILDREN, AppRoot)
    await runtime.mount({ inject: [...inject], apply })
    const view = runtime.renderRoot()

    const composer = view.container.querySelector<HTMLDivElement>('[data-composer-input]')!
    // Write through the assembled input resolver (contenteditable change
    // events carry no value; the resolver is the public draft write path).
    const conversation = runtime.ctx.get('conversation') as { input: unknown }
    const shell = (conversation.input as InputHub).shell(SID)
    act(() => { shell.setDraft('do not lose this') })
    fireEvent.keyDown(composer, { key: 'Enter' })
    await waitFor(() => { expect(prompt).toHaveBeenCalledOnce() })

    await runtime.sessions.updateSessionSnapshot(SID, (draft) => {
      draft.promptError = {
        op: 'send',
        error: { code: 'agent-busy', message: 'prompt rejected before acceptance', details: { reason: 'busy' } },
      }
    })
    const alert = await view.findByRole('alert')
    expect(alert.textContent).toContain('prompt rejected before acceptance (agent-busy)')
    await waitFor(() => {
      expect(shell.snapshot.draft).toBe('do not lose this')
    })
    await runtime.dispose()
  })
})

describe('title projection across assembled surfaces', () => {
  it('one summary update re-labels the current-session crumb', async () => {
    const runtime = await bench()
    const view = runtime.renderRoot()
    const hierarchy = view.getByRole('navigation', { name: '会话层级' })
    expect(within(hierarchy).getByRole('button', { name: 'S' }).hasAttribute('disabled')).toBe(true)

    await runtime.sessions.updateSummary(SID, { displayTitle: '修订标题', title: '修订标题' })
    await waitFor(() => {
      expect(within(hierarchy).getByRole('button', { name: '修订标题' }).hasAttribute('disabled')).toBe(true)
    })
    expect(within(hierarchy).queryByRole('button', { name: 'S' })).toBeNull()
    await runtime.dispose()
  })
})
