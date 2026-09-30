// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { IStories } from '@deepseek-ai/dsh-api-story-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { directorRunConsole } from '../src/client/DirectorRunConsole.tsx'
import { zh, type RoleplayKey } from '../src/client/locales.ts'

afterEach(cleanup)

function t(key: RoleplayKey, values?: Record<string, unknown>): string {
  return Object.entries(values ?? {}).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    zh[key],
  )
}

describe('player-visible Director Run console', () => {
  it('opens an accessible queue-first drawer and progressively discloses Brief and attempt ownership', () => {
    const Console = directorRunConsole(commands())
    render(<Console {...props(Console)} />)
    const trigger = screen.getByRole('button', { name: zh['run.open'] })
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: zh['run.title'] })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.body.style.overflow).toBe('hidden')
    expect(screen.getByText('QUOTA：Insufficient Balance')).toBeTruthy()
    expect(screen.getByText(t('run.attempts', { value: 2 }))).toBeTruthy()
    expect(screen.queryByText('账簿在桌上自行翻开。')).toBeNull()
    expect(screen.queryByText('attempt-shadowheart-2')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: zh['run.tab.brief'] }))
    expect(screen.getByText('账簿在桌上自行翻开。')).toBeTruthy()
    expect(screen.getByText('影心看见第四行仍为空白。')).toBeTruthy()
    expect(screen.getByText('谁会触碰账簿？')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: zh['run.tab.queue'] }))
    fireEvent.click(screen.getByText(zh['run.technicalDetails']))
    expect(screen.getByText(t('run.attemptOwnership', {
      generation: 2, attemptId: 'attempt-shadowheart-2',
    }))).toBeTruthy()
    expect(screen.getByText('actor-gale:22')).toBeTruthy()
    expect(screen.getByText(zh['run.acceptedLocked'])).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: zh['run.title'] })).toBeNull()
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(trigger)
  })

  it('uses the visible exact revision, locks accepted events, and confirms destructive controls', async () => {
    const stories = commands()
    const Console = directorRunConsole(stories)
    render(<Console {...props(Console)} />)
    fireEvent.click(screen.getByRole('button', { name: zh['run.open'] }))

    fireEvent.click(screen.getByRole('button', { name: zh['run.resume'] }))
    await waitFor(() => { expect(stories.resumeDirectorRun).toHaveBeenCalledWith('story-1', 7) })
    fireEvent.click(screen.getByRole('button', { name: zh['run.retryActor'] }))
    await waitFor(() => { expect(stories.retryDirectorRunActor).toHaveBeenCalledWith('story-1', 7, 'shadowheart') })
    fireEvent.click(screen.getAllByRole('button', { name: zh['run.skipActor'] })[0]!)
    expect(stories.skipDirectorRunActor).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: zh['run.confirm'] }))
    await waitFor(() => { expect(stories.skipDirectorRunActor).toHaveBeenCalledWith('story-1', 7, 'shadowheart') })
    fireEvent.click(screen.getByRole('button', { name: zh['run.cancel'] }))
    expect(stories.cancelDirectorRun).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: zh['run.confirm'] }))
    await waitFor(() => { expect(stories.cancelDirectorRun).toHaveBeenCalledWith('story-1', 7) })

    expect(screen.getAllByRole('button', { name: zh['run.retryActor'] })).toHaveLength(1)
  })
})

function commands() {
  const resolved = Promise.resolve(undefined as never)
  return {
    resumeDirectorRun: vi.fn<IStories['resumeDirectorRun']>().mockReturnValue(resolved),
    retryDirectorRunActor: vi.fn<IStories['retryDirectorRunActor']>().mockReturnValue(resolved),
    pauseDirectorRun: vi.fn<IStories['pauseDirectorRun']>().mockReturnValue(resolved),
    cancelDirectorRun: vi.fn<IStories['cancelDirectorRun']>().mockReturnValue(resolved),
    skipDirectorRunActor: vi.fn<IStories['skipDirectorRunActor']>().mockReturnValue(resolved),
    cancelDirectorRunActor: vi.fn<IStories['cancelDirectorRunActor']>().mockReturnValue(resolved),
  }
}

function props(Console: ReturnType<typeof directorRunConsole>): ComponentProps<typeof Console> {
  const scene = SessionId('scene-1')
  return {
    sessionId: scene,
    useStories: (selector: (snapshot: unknown) => unknown) => selector({ items: [{
      storyId: 'story-1',
      sceneSessionIds: [scene],
      actors: [],
      directorOutline: {},
      plotLedger: {
        revision: 3,
        pendingNpcEvents: [],
        situation: '账簿在桌上自行翻开。',
        establishedFacts: ['影心看见第四行仍为空白。'],
        openThreads: ['谁会触碰账簿？'],
        latestBrief: {
          sourceLedgerRevision: 2,
          ledgerRevision: 3,
          directorSessionId: scene,
          sceneSessionId: scene,
          situation: '账簿在桌上自行翻开。',
          establishedFacts: ['影心看见第四行仍为空白。'],
          openThreads: ['谁会触碰账簿？'],
          actorBriefs: [{
            actorId: 'shadowheart',
            perceptions: ['账簿自行翻开。'],
            uncertainties: ['低语来自哪里。'],
          }],
          sourceNpcEvents: [],
          createdAt: '2026-08-30T00:00:00.000Z',
        },
        directorRun: {
          id: 'run:scene-1:3',
          revision: 7,
          briefLedgerRevision: 3,
          directorSessionId: scene,
          sceneSessionId: scene,
          status: 'awaiting_retry',
          actors: [{
            actorId: 'shadowheart',
            status: 'failed',
            attempts: 2,
            generation: 2,
            attempt: {
              attemptId: 'attempt-shadowheart-2',
              generation: 2,
              actorSessionId: SessionId('actor-shadowheart'),
              afterEventSeq: 20,
              startedAt: '2026-08-30T00:00:01.000Z',
            },
            eventRefs: [],
            failure: { code: 'QUOTA', message: 'Insufficient Balance' },
          }, {
            actorId: 'gale',
            status: 'completed',
            attempts: 1,
            generation: 1,
            eventRefs: ['actor-gale:22'],
          }, {
            actorId: 'astarion',
            status: 'failed',
            attempts: 1,
            generation: 1,
            eventRefs: ['actor-astarion:24'],
            failure: { code: 'LATE_ATTEMPT', message: 'Attempt ownership expired' },
          }],
          createdAt: '2026-08-30T00:00:00.000Z',
          updatedAt: '2026-08-30T00:00:02.000Z',
        },
      },
    }] }) as never,
    t,
  } as ComponentProps<typeof Console>
}
