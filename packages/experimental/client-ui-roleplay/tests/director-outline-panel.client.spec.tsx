// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { IStories } from '@deepseek-ai/dsh-api-story-controller/client'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { directorOutlinePanel, editableDirectorOutline } from '../src/client/DirectorOutlinePanel.tsx'
import { zh, type RoleplayKey } from '../src/client/locales.ts'

function t(key: RoleplayKey, values?: Record<string, unknown>): string {
  return Object.entries(values ?? {}).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    zh[key],
  )
}

afterEach(cleanup)

const outline = {
  schemaVersion: 1 as const,
  revision: 4,
  updateMode: 'review_all' as const,
  premise: '让每段记忆由本人重新定义。',
  premiseLocked: true,
  themes: [{ id: 'theme-autonomy', text: '自主权', locked: true, source: 'player' as const }],
  hardConstraints: [],
  arcs: [],
  beats: [],
  foreshadows: [],
  mysteries: [],
  clocks: [],
  pendingSuggestions: [{
    id: 'suggestion-1',
    baseRevision: 3,
    reason: '加入午夜时钟',
    patch: { expectedRevision: 3, reason: '加入午夜时钟' },
    createdAt: '2026-08-29T00:00:00.000Z',
  }],
  history: [{
    revision: 3, author: 'director' as const, reason: '建立长期自主权主题',
    changedSections: ['themes'], createdAt: '2026-08-28T00:00:00.000Z',
  }],
  updatedAt: '2026-08-29T00:00:00.000Z',
  updatedBy: 'player' as const,
}

describe('player-visible Director Outline panel', () => {
  it('opens as a closable modal workspace and preserves an unsaved draft across close', () => {
    const Panel = directorOutlinePanel({
      updateDirectorOutline: vi.fn(), resolveDirectorOutlineSuggestion: vi.fn(),
    })
    const props = {
      sessionId: 'scene-1',
      useStories: (selector: (snapshot: unknown) => unknown) => selector({ items: [{
        storyId: 'story-1', sceneSessionIds: ['scene-1'], actors: [], directorOutline: outline,
        plotLedger: { revision: 0, pendingNpcEvents: [], situation: '', establishedFacts: [], openThreads: [] },
      }] }),
      t,
    } as unknown as ComponentProps<typeof Panel>

    render(<Panel {...props} />)
    const trigger = screen.getByRole('button', { name: zh['outline.open'] })
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: zh['outline.title'] })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: zh['outline.edit'] }))
    const commands = screen.getByRole('toolbar', { name: '编辑命令' })
    expect(within(commands).getByRole('button', { name: zh['outline.save'] })).toBeTruthy()
    expect(within(commands).getByRole('button', { name: zh['outline.cancel'] })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: zh['outline.premise'] }), {
      target: { value: '仍在编辑的导演大纲。' },
    })
    fireEvent.click(screen.getByRole('button', { name: zh['workspace.close'] }))
    expect(screen.queryByRole('dialog', { name: zh['outline.title'] })).toBeNull()
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: zh['outline.premise'] }).value)
      .toBe('仍在编辑的导演大纲。')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: zh['outline.title'] })).toBeNull()
  })

  it('shows private planning and saves a structured exact-revision player edit', async () => {
    const updateDirectorOutline = vi.fn<IStories['updateDirectorOutline']>().mockResolvedValue({} as never)
    const resolveDirectorOutlineSuggestion = vi.fn().mockResolvedValue(undefined)
    const Panel = directorOutlinePanel({ updateDirectorOutline, resolveDirectorOutlineSuggestion })
    const props = {
      sessionId: 'scene-1',
      useStories: (selector: (snapshot: unknown) => unknown) => selector({
        items: [{
          storyId: 'story-1', sceneSessionIds: ['scene-1'], actors: [], directorOutline: outline,
          plotLedger: {
            revision: 7, pendingNpcEvents: [], situation: '', establishedFacts: [], openThreads: [],
            latestBrief: { ledgerRevision: 6, actorBriefs: [{ actorId: 'shadowheart' }] },
            directorRun: { status: 'completed' },
          },
        }],
      }),
      t,
    } as unknown as ComponentProps<typeof Panel>

    render(<Panel {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh['outline.open'] }))
    expect(screen.getByText(outline.premise)).toBeTruthy()
    expect(screen.getByText('加入午夜时钟')).toBeTruthy()
    expect(screen.getByText('建立长期自主权主题')).toBeTruthy()
    expect(screen.getByText(zh['outline.recordBoundaryHint'])).toBeTruthy()
    expect(screen.getByText(zh['outline.run.completed'])).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh['outline.edit'] }))
    const premise = screen.getByRole('textbox', { name: zh['outline.premise'] })
    fireEvent.change(premise, { target: { value: '玩家修订后的长期意图。' } })
    fireEvent.click(screen.getByRole('button', { name: zh['outline.save'] }))

    await waitFor(() => {
      expect(updateDirectorOutline).toHaveBeenCalledOnce()
    })
    const [storyId, revision, edited, reason] = updateDirectorOutline.mock.calls[0] ?? []
    expect([storyId, revision, reason]).toEqual(['story-1', 4, zh['outline.playerEditReason']])
    expect(edited).toMatchObject({ premise: '玩家修订后的长期意图。', themes: [{ id: 'theme-autonomy', locked: true }] })
    expect(JSON.stringify(edited)).not.toContain('"source"')
    expect(JSON.stringify(edited)).not.toContain('pendingSuggestions')
  })

  it('keeps advanced JSON as a bidirectional expert entry', async () => {
    const updateDirectorOutline = vi.fn().mockResolvedValue(undefined)
    const Panel = directorOutlinePanel({ updateDirectorOutline, resolveDirectorOutlineSuggestion: vi.fn() })
    const props = {
      sessionId: 'scene-1',
      useStories: (selector: (snapshot: unknown) => unknown) => selector({ items: [{
        storyId: 'story-1', sceneSessionIds: ['scene-1'], actors: [], directorOutline: outline,
        plotLedger: { revision: 0, pendingNpcEvents: [], situation: '', establishedFacts: [], openThreads: [] },
      }] }),
      t,
    } as unknown as ComponentProps<typeof Panel>

    render(<Panel {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh['outline.open'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['outline.edit'] }))
    fireEvent.click(screen.getByRole('tab', { name: zh['outline.mode.json'] }))
    const editor = screen.getByRole<HTMLTextAreaElement>('textbox', { name: zh['outline.editorLabel'] })
    expect(editor.value).not.toContain('"source"')
    expect(editor.value).not.toContain('pendingSuggestions')
    const edited = { ...editableDirectorOutline(outline), premise: '高级入口修订。' }
    fireEvent.change(editor, { target: { value: JSON.stringify(edited) } })
    fireEvent.click(screen.getByRole('tab', { name: zh['outline.mode.structured'] }))
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: zh['outline.premise'] }).value)
      .toBe('高级入口修订。')
  })

  it('adds, locks, and keyboard-reorders timeline cards before saving', async () => {
    const richOutline = {
      ...outline,
      arcs: [{
        id: 'arc-one', title: '第一幕', intent: '建立危机', status: 'active' as const,
        tensions: [], desiredQuestions: [], completionSignals: [], locked: false, source: 'director' as const,
      }],
      beats: [
        {
          id: 'beat-one', arcId: 'arc-one', title: '初见', intent: '让双方相遇', status: 'armed' as const,
          priority: 4, prerequisiteLedgerFacts: [], prerequisiteBeatIds: [], triggerConditions: [],
          externalPressure: [], revealCandidates: [], exitConditions: [], fallbackOptions: [],
          resolvedByEventRefs: ['scene-1:event-3'], locked: false, source: 'director' as const,
        },
        {
          id: 'beat-two', title: '追问', intent: '扩大疑问', status: 'candidate' as const,
          priority: 3, prerequisiteLedgerFacts: [], prerequisiteBeatIds: ['beat-one'], triggerConditions: [],
          externalPressure: [], revealCandidates: [], exitConditions: [], fallbackOptions: [],
          resolvedByEventRefs: [], locked: false, source: 'player' as const,
        },
      ],
    }
    const updateDirectorOutline = vi.fn().mockResolvedValue(undefined)
    const Panel = directorOutlinePanel({ updateDirectorOutline, resolveDirectorOutlineSuggestion: vi.fn() })
    const props = {
      sessionId: 'scene-1',
      useStories: (selector: (snapshot: unknown) => unknown) => selector({ items: [{
        storyId: 'story-1', sceneSessionIds: ['scene-1'], actors: [], directorOutline: richOutline,
        plotLedger: { revision: 0, pendingNpcEvents: [], situation: '', establishedFacts: [], openThreads: [] },
      }] }),
      t,
    } as unknown as ComponentProps<typeof Panel>

    render(<Panel {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh['outline.open'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['outline.edit'] }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${zh['outline.section.beats']}`, 'u') }))
    const lockToggles = screen.getAllByRole('checkbox', { name: zh['outline.locked'] })
    fireEvent.click(lockToggles[0] as HTMLElement)
    expect((screen.getAllByRole('textbox', { name: zh['outline.field.resolvedEvents'] })[0] as HTMLTextAreaElement).value).toBe('scene-1:event-3')
    fireEvent.click(screen.getByRole('button', { name: t('outline.moveDown', { id: 'beat-one' }) }))
    fireEvent.click(screen.getByRole('button', { name: zh['outline.save'] }))

    await waitFor(() => { expect(updateDirectorOutline).toHaveBeenCalledOnce() })
    const saved = updateDirectorOutline.mock.calls[0]?.[2] as ReturnType<typeof editableDirectorOutline>
    expect(saved.beats.map(item => item.id)).toEqual(['beat-two', 'beat-one'])
    expect(saved.beats.find(item => item.id === 'beat-one')?.locked).toBe(true)
  })

  it('lets the player explicitly accept a queued Director suggestion', async () => {
    const updateDirectorOutline = vi.fn().mockResolvedValue(undefined)
    const resolveDirectorOutlineSuggestion = vi.fn().mockResolvedValue(undefined)
    const Panel = directorOutlinePanel({ updateDirectorOutline, resolveDirectorOutlineSuggestion })
    const props = {
      sessionId: 'scene-1',
      useStories: (selector: (snapshot: unknown) => unknown) => selector({
        items: [{
          storyId: 'story-1', sceneSessionIds: ['scene-1'], actors: [], directorOutline: outline,
          plotLedger: {
            revision: 0, pendingNpcEvents: [], situation: '', establishedFacts: [], openThreads: [],
          },
        }],
      }),
      t,
    } as unknown as ComponentProps<typeof Panel>

    render(<Panel {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh['outline.open'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['outline.accept'] }))
    await waitFor(() => {
      expect(resolveDirectorOutlineSuggestion).toHaveBeenCalledWith('story-1', 4, 'suggestion-1', true)
    })
  })
})
