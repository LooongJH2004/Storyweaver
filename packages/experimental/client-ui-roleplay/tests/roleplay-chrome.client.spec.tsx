// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  RoleplayIntentDock,
} from '../src/client/RoleplayChrome.tsx'
import { ExecutionStatus } from '../src/client/ExecutionStatus.tsx'
import { roleplaySessionTools, roleplayStoryDock } from '../src/client/RoleplayStoryDock.tsx'
import { storyOperationsPanel } from '../src/client/StoryOperationsPanel.tsx'
import { zh, type RoleplayKey } from '../src/client/locales.ts'

function t(key: RoleplayKey, params?: Record<string, unknown>): string {
  let value: string = zh[key]
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

const emptyOutline = {
  schemaVersion: 1 as const, revision: 0, updateMode: 'auto_unlocked' as const,
  premise: '', premiseLocked: false, themes: [], hardConstraints: [], arcs: [], beats: [],
  foreshadows: [], mysteries: [], clocks: [], pendingSuggestions: [], history: [],
  updatedAt: '', updatedBy: 'system' as const,
}

const emptyRoleplayState = {
  matters: { public: [], actors: {} },
  world: { revision: 0,
    facts: {},
    events: [],
    perceptions: [],
    continuity: [],
    context: { revision: 0,
      sources: [],
      notes: [],
      proposals: [],
      pins: [] } },
  memory: { revision: 0, entries: [] },
  discussions: { revision: 0, discussions: [] },
  contextRecipe: {
    revision: 0,
    director: [
      { id: 'policy', enabled: true, locked: true },
      { id: 'tools', enabled: true, locked: true },
    ],
    actor: [
      { id: 'policy', enabled: true, locked: true },
      { id: 'tools', enabled: true, locked: true },
      { id: 'identity', enabled: true, locked: true },
    ],
  },
}

afterEach(cleanup)

describe('roleplay player-intent dock', () => {
  it('continues a waiting scene directly with an observe intent', async () => {
    const prompt = vi.fn().mockResolvedValue({ ok: true })
    render(<ExecutionStatus {...{
      story: { ...emptyRoleplayState, storyId: 's', plotLedger: {} }, running: false, failure: null,
      stories: {}, sessions: { binding: () => ({ session: { prompt } }) }, sessionId: SessionId('scene'), t,
    } as unknown as ComponentProps<typeof ExecutionStatus>} />)
    fireEvent.click(screen.getByRole('button', { name: zh['stage.continue'] }))
    await waitFor(() => { expect(prompt).toHaveBeenCalledWith(
      [{ type: 'text', text: zh['stage.advanceText'] }], 'queue', undefined, undefined,
      { kind: 'storyweaver', payload: { mode: 'observe' } },
    ) })
  })

  it('selects all input modes and a concrete character without changing the body', async () => {
    const setDraft = vi.fn(), submit = vi.fn()
    const setIntent = vi.fn<ComponentProps<typeof RoleplayIntentDock>['inputActions']['setIntent']>()
    const props = {
      sessionId: 'scene', input: { draft: '保留这段话', intent: { kind: 'storyweaver', payload: { mode: 'observe' } } },
      inputActions: { setDraft, submit, setIntent }, loadActors: async () => [{ actorId: 'a', displayName: '甲' }],
      useStories: (select: (value: unknown) => unknown) => select({ items: [{ storyId: 's', sceneSessionIds: ['scene'], actors: [] }] }), t,
    } as unknown as ComponentProps<typeof RoleplayIntentDock>
    render(<RoleplayIntentDock {...props} />)
    const embody = screen.getByRole<HTMLButtonElement>('button', { name: /代演角色/ })
    await waitFor(() => { expect(embody.disabled).toBe(false) })
    for (const label of [/旁观推进/, /指定走向/, /介入世界/, /代演角色/]) fireEvent.click(screen.getByRole('button', { name: label }))
    expect(setIntent.mock.calls.map(call => call[0]?.payload)).toEqual([
      { mode: 'observe' }, { mode: 'direction' }, { mode: 'intervene' }, { mode: 'embody', actorId: 'a' },
    ])
    expect(setDraft).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
  })

  it('fills and replaces untouched suggestions but preserves player edits and another session draft', async () => {
    const setDraft = vi.fn(), submit = vi.fn()
    let props = {
      sessionId: 'scene', input: { draft: '', intent: { kind: 'storyweaver', payload: { mode: 'observe' } } },
      inputActions: { setDraft, submit, setIntent: vi.fn() },
      loadActors: async () => [{ actorId: 'a', displayName: '甲' }],
      useStories: (select: (value: unknown) => unknown) => select({ items: [{ storyId: 's', sceneSessionIds: ['scene'], actors: [] }] }), t,
    } as unknown as ComponentProps<typeof RoleplayIntentDock>
    const view = render(<RoleplayIntentDock {...props} />)
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: /代演角色/ }).disabled).toBe(false) })
    for (const mode of ['observe', 'direction', 'intervene', 'embody'] as const) {
      fireEvent.click(screen.getByRole('button', { name: zh[`intent.${mode}`] }))
      expect(setDraft).toHaveBeenLastCalledWith(zh[`draft.${mode}`])
      props = { ...props, input: { ...props.input, draft: zh[`draft.${mode}`] } }
      view.rerender(<RoleplayIntentDock {...props} />)
    }
    props = { ...props, input: { ...props.input, draft: '我想先听听影心的意见。' } }
    view.rerender(<RoleplayIntentDock {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh['intent.observe'] }))
    expect(setDraft).toHaveBeenCalledTimes(4)
    expect(submit).not.toHaveBeenCalled()
    props.sessionId = SessionId('another-scene')
    props = { ...props, input: { ...props.input, draft: zh['draft.embody'] } }
    view.rerender(<RoleplayIntentDock {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh['intent.direction'] }))
    expect(setDraft).toHaveBeenCalledTimes(4)
  })

  it('keeps authoring tools reachable in a blank scene and moves them to the visible header later', () => {
    const sceneSessionId = SessionId('scene-blank')
    const snapshot = {
      phase: 'ready', error: null,
      items: [{
        storyId: 'story-blank', title: '未命名故事', premise: '',
        sceneSessionIds: [sceneSessionId], currentSceneSessionId: sceneSessionId,
        actors: [], createdAt: '', updatedAt: '', directorOutline: emptyOutline, plotLedger: {},
        ...emptyRoleplayState,
      }],
    }
    const commands = { actorStates: vi.fn().mockResolvedValue([]),
      storybook: vi.fn(), updateStorybook: vi.fn(), contextPreview: vi.fn(),
      rename: vi.fn(), setPremise: vi.fn(),
      updateDirectorOutline: vi.fn(), resolveDirectorOutlineSuggestion: vi.fn(),
      resumeDirectorRun: vi.fn(), retryDirectorRunActor: vi.fn(), pauseDirectorRun: vi.fn(),
      cancelDirectorRun: vi.fn(), skipDirectorRunActor: vi.fn(), cancelDirectorRunActor: vi.fn(),
    } as never
    const Dock = roleplayStoryDock(commands)
    const SessionTools = roleplaySessionTools(commands)
    const props = {
      sessionId: sceneSessionId,
      input: { draft: '' },
      inputActions: { setIntent: () => {}, setDraft: vi.fn(), submit: vi.fn() },
      session: { blank: true, running: false, lastAgentError: null },
      useSessions: (selector: (value: { byId: Record<string, unknown> }) => unknown) => selector({ byId: {} }),
      useStories: (selector: (value: typeof snapshot) => unknown) => selector(snapshot),
      t,
    } as unknown as ComponentProps<typeof Dock>

    const dock = render(<Dock {...props} />)
    expect(dock.getByRole('button', { name: zh['workspace.story'] })).toBeTruthy()
    expect(dock.getByRole('button', { name: zh['outline.open'] })).toBeTruthy()
    expect(dock.getByRole('button', { name: zh['operations.open'] })).toBeTruthy()
    dock.unmount()

    render(<SessionTools {...props} />)
    expect(screen.getByRole('button', { name: zh['run.open'] })).toBeTruthy()
    const tools = screen.getByRole('group', { name: zh['workspace.tools'] })
    expect(tools.querySelector('details')).toBeNull()
    expect(tools.querySelector('summary')).toBeNull()
    expect(tools.children).toHaveLength(3)
    expect(screen.getByRole('button', { name: zh['workspace.story'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['outline.open'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['operations.open'] })).toBeTruthy()
  })

  it('resumes an incomplete run at the displayed revision without submitting duplicate observation', async () => {
    const sceneSessionId = SessionId('scene-resume')
    const snapshot = {
      phase: 'ready', error: null,
      items: [{
        storyId: 'story-resume', title: '恢复测试', premise: '',
        sceneSessionIds: [sceneSessionId], currentSceneSessionId: sceneSessionId,
        actors: [], createdAt: '', updatedAt: '',
        directorOutline: emptyOutline,
        plotLedger: {
          revision: 1, situation: '', establishedFacts: [], openThreads: [], pendingNpcEvents: [],
          directorRun: {
            id: 'run:scene-resume:1', revision: 3, briefLedgerRevision: 1,
            directorSessionId: sceneSessionId, sceneSessionId,
            status: 'awaiting_retry', createdAt: '', updatedAt: '',
            actors: [
              { actorId: 'shadowheart', status: 'completed', attempts: 1, generation: 1, eventRefs: ['actor:1'] },
              { actorId: 'astarion', status: 'failed', attempts: 1, generation: 1, eventRefs: [] },
            ],
          },
        },
      }],
    }
    const resumeDirectorRun = vi.fn().mockResolvedValue(undefined)
    render(<ExecutionStatus {...{ story: { ...snapshot.items[0], discussions: { discussions: [] } }, running: false, failure: null,
      stories: { resumeDirectorRun }, sessions: undefined, sessionId: sceneSessionId, t,
    } as unknown as ComponentProps<typeof ExecutionStatus>} />)
    expect(screen.getByRole('status').textContent).toBe(zh['stage.failed'])
    fireEvent.click(screen.getByRole('button', { name: zh['stage.retry'] }))
    await waitFor(() => { expect(resumeDirectorRun).toHaveBeenCalledWith('story-resume', 3) })
  })

  it('keeps input modes alongside the live discussion console', async () => {
    const sceneSessionId = SessionId('scene-discussion')
    const requestDiscussionIntervention = vi.fn().mockResolvedValue(undefined)
    const snapshot = {
      phase: 'ready', error: null,
      items: [{
        storyId: 'story-discussion', title: '讨论测试', premise: '',
        sceneSessionIds: [sceneSessionId], currentSceneSessionId: sceneSessionId,
        actors: [{ actorId: 'shadowheart' }, { actorId: 'astarion' }],
        createdAt: '', updatedAt: '', directorOutline: emptyOutline, plotLedger: {},
        ...emptyRoleplayState,
        discussions: {
          revision: 5,
          discussions: [{
            id: 'discussion-live', revision: 5, topic: '是否剪断红线？',
            participantIds: ['shadowheart', 'astarion'], status: 'active' as const,
            currentSpeakerId: 'astarion', floorQueue: [],
            participantIntents: {
              shadowheart: { stance: '不能冒险剪断。', eagerness: 'high' as const, updatedAt: '' },
              astarion: { stance: '先追踪另一端。', eagerness: 'medium' as const, updatedAt: '' },
            },
            round: 1, maxRounds: 3, initiatedBy: 'director' as const,
            turns: [{
              id: 'turn-1', speakerId: 'shadowheart', text: '先查清另一端。', action: 'speak' as const,
              round: 1, createdAt: '',
            }],
            createdAt: '', updatedAt: '',
          }],
        },
      }],
    }
    const commands = { actorStates: vi.fn().mockResolvedValue([]), requestDiscussionIntervention } as never
    const Dock = roleplayStoryDock(commands)
    const props = {
      sessionId: sceneSessionId,
      input: { draft: '' }, inputActions: { setIntent: () => {}, setDraft: vi.fn(), submit: vi.fn() },
      session: { blank: false, running: false, lastAgentError: null },
      useSessions: (selector: (value: { byId: Record<string, unknown> }) => unknown) => selector({ byId: {} }),
      useStories: (selector: (value: typeof snapshot) => unknown) => selector(snapshot),
      t,
    } as unknown as ComponentProps<typeof Dock>

    render(<Dock {...props} />)

    expect(screen.getByRole('region', { name: zh['discussion.dock.title'] }).textContent).toContain('是否剪断红线？')
    expect(screen.getByText('先查清另一端。')).toBeTruthy()
    expect(screen.getByRole('button', { name: /旁观推进/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['operations.discussion.playerSpeak'] }))
    await waitFor(() => {
      expect(requestDiscussionIntervention).toHaveBeenCalledWith(
        'story-discussion', 5, 'discussion-live', 'speak',
      )
    })
  })

  it('shows individual private preparation states without assigning a public speaker', () => {
    const scene = SessionId('preparation-scene')
    const Dock = roleplayStoryDock({ actorStates: vi.fn().mockResolvedValue([]) } as never)
    const snapshot = { items: [{ ...emptyRoleplayState, storyId: 'prep-story', sceneSessionIds: [scene],
      currentSceneSessionId: scene, actors: [], plotLedger: { directorRun: { actors: [
        { actorId: 'a', status: 'running' }, { actorId: 'b', status: 'failed' },
      ] } }, discussions: { revision: 1, discussions: [{ id: 'discussion', topic: '准备', status: 'active',
        participantIds: ['a', 'b', 'c'], preparationPendingIds: ['a', 'b'], turns: [], round: 1, maxRounds: 2,
      }] } }] }
    render(<Dock {...{ input: { draft: '' }, inputActions: { setIntent: vi.fn() }, sessionId: scene, session: { blank: false, running: false, lastAgentError: null }, t,
      useSessions: () => undefined,
      useStories: (select: (value: typeof snapshot) => unknown) => select(snapshot),
    } as unknown as ComponentProps<typeof Dock>} />)
    expect(screen.getAllByRole('status').map(item => item.textContent).join(' ')).toContain('私下准备：1 / 3 已完成')
    expect(['正在准备', '准备中断，可重试', '准备完成'].map(text => screen.getByText(text).textContent)).toMatchInlineSnapshot(`
      [
        "正在准备",
        "准备中断，可重试",
        "准备完成",
      ]
    `)
  })

  it('renders matter state by viewer and exposes the original source text', () => {
    const scene = SessionId('matter-scene')
    const Panel = storyOperationsPanel({} as never)
    const matter = { id: 'condition', actorId: 'a', kind: 'condition', status: 'open', text: '先交出钥匙才开门。', sourceEventIds: ['source'], private: false }
    const snapshot = { items: [{ ...emptyRoleplayState, storyId: 'matter-story', sceneSessionIds: [scene],
      currentSceneSessionId: scene, actors: [{ actorId: 'a' }], plotLedger: { pendingNpcEvents: [] },
      matters: { public: [matter], actors: { a: [{ ...matter, status: 'withdrawn' }] } },
      world: { ...emptyRoleplayState.world, events: [{ id: 'source', summary: '甲：先交出钥匙才开门。', status: 'established', revision: 1, audience: ['a'] }] },
    }] }
    render(<Panel {...{ sessionId: scene, t,
      useStories: (select: (value: typeof snapshot) => unknown) => select(snapshot),
    } as unknown as ComponentProps<typeof Panel>} />)
    fireEvent.click(screen.getByRole('button', { name: zh['operations.open'] }))
    expect(screen.getByText('条件 · a · 未解决')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: zh['operations.matters.title'] }), { target: { value: 'a' } })
    expect(screen.getByText('条件 · a · 已撤回')).toBeTruthy()
    expect(screen.getByText(zh['operations.matters.sources']).parentElement?.textContent).toContain('甲：先交出钥匙才开门。')
  })

  it('lets the player cancel a pending speaking request from the live dock', async () => {
    const sceneSessionId = SessionId('scene-discussion-cancel')
    const clearDiscussionIntervention = vi.fn().mockResolvedValue(undefined)
    const snapshot = {
      phase: 'ready', error: null,
      items: [{
        storyId: 'story-discussion', title: '讨论测试', premise: '',
        sceneSessionIds: [sceneSessionId], currentSceneSessionId: sceneSessionId,
        actors: [], createdAt: '', updatedAt: '', directorOutline: emptyOutline, plotLedger: {},
        ...emptyRoleplayState,
        discussions: {
          revision: 6,
          discussions: [{
            id: 'discussion-live', revision: 6, topic: '是否剪断红线？',
            participantIds: ['shadowheart'], status: 'awaiting-player' as const,
            playerIntervention: 'speak' as const, currentSpeakerId: null, floorQueue: [],
            participantIntents: {}, round: 1, maxRounds: 3, initiatedBy: 'director' as const,
            turns: [], createdAt: '', updatedAt: '',
          }],
        },
      }],
    }
    const Dock = roleplayStoryDock({ actorStates: vi.fn().mockResolvedValue([]), clearDiscussionIntervention } as never)
    const props = {
      sessionId: sceneSessionId,
      input: { draft: '' }, inputActions: { setIntent: () => {}, setDraft: vi.fn(), submit: vi.fn() },
      session: { blank: false, running: false, lastAgentError: null },
      useSessions: (selector: (value: { byId: Record<string, unknown> }) => unknown) => selector({ byId: {} }),
      useStories: (selector: (value: typeof snapshot) => unknown) => selector(snapshot),
      t,
    } as unknown as ComponentProps<typeof Dock>

    render(<Dock {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh['discussion.dock.cancelIntervention'] }))
    await waitFor(() => {
      expect(clearDiscussionIntervention).toHaveBeenCalledWith('story-discussion', 6, 'discussion-live')
    })
  })
})
