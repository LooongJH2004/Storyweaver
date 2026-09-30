/** Current execution facts and recovery actions next to the player's input. */
import type { IStories, StoryView } from '@deepseek-ai/dsh-api-story-controller/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { useState } from 'react'
import { NS } from './locales.ts'
import css from './RoleplayChrome.module.css'

/** Execution phases derived from durable runs and live Session activity. */
export function executionPhase(story: StoryView, running: boolean, failure: string | null): 'preparing' | 'responding' | 'discussion' | 'waiting' | 'paused' | 'failed' {
  const run = story.plotLedger.directorRun
  if (run?.status === 'awaiting_retry' || failure !== null) return 'failed'
  if (run?.status === 'paused' || run?.status === 'cancelled' && !running) return 'paused'
  const discussion = story.discussions.discussions.find(item => ['active', 'awaiting-player', 'summarizing'].includes(item.status))
  if (discussion?.status === 'awaiting-player') return 'waiting'
  if (run?.actors.some(actor => actor.status === 'running')) return 'responding'
  if (discussion !== undefined) return 'discussion'
  return running ? 'preparing' : 'waiting'
}

/**
 * Provide phase-specific continuation and interruption at the current revision.
 * @param props - authoritative Story and Session state with their command owners.
 * @returns status and applicable actions, without an estimated progress bar.
 */
export function ExecutionStatus({ story, running, failure, stories, sessions, sessionId, t }: {
  readonly story: StoryView
  readonly running: boolean
  readonly failure: string | null
  readonly stories: IStories
  readonly sessions: ISessions | undefined
  readonly sessionId: StoryView['sceneSessionIds'][number]
} & PropsLocale<typeof NS>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const phase = executionPhase(story, running, failure)
  const run = story.plotLedger.directorRun
  const perform = async (operation: () => Promise<unknown>): Promise<void> => {
    setBusy(true); setError(null)
    try { await operation() }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const resume = async (): Promise<void> => {
    if (run !== undefined && run.status !== 'completed' && run.status !== 'cancelled') {
      await stories.resumeDirectorRun(story.storyId, run.revision)
      return
    }
    const session = sessions?.binding(sessionId)?.session
    if (session === undefined) throw new Error(t('stage.unavailable'))
    const result = await session.prompt([{ type: 'text', text: t('stage.advanceText') }], 'queue', undefined, undefined,
      { kind: 'storyweaver', payload: { mode: 'observe' } })
    if (!result.ok) throw new Error(result.error.message)
  }
  const stop = async (): Promise<void> => {
    if (run?.status === 'dispatching') { await stories.pauseDirectorRun(story.storyId, run.revision); return }
    const session = sessions?.binding(sessionId)?.session
    if (session === undefined) throw new Error(t('stage.unavailable'))
    const result = await session.cancel()
    if (!result.ok) throw new Error(result.error.message)
  }
  return <section className={css.executionStatus} aria-label={t('stage.title')}>
    <strong role="status" aria-live="polite">{t(`stage.${phase}`)}</strong>
    {run?.actors.filter(actor => actor.status === 'running').map(actor => <span key={actor.actorId}>{actor.actorId}</span>)}
    {running || phase === 'responding'
      ? <button type="button" disabled={busy} onClick={() => { void perform(stop) }}>{t('stage.interrupt')}</button>
      : <button type="button" disabled={busy || phase === 'discussion'} onClick={() => { void perform(resume) }}>{t(phase === 'failed' ? 'stage.retry' : 'stage.continue')}</button>}
    {failure !== null && <details><summary>{t('stage.failureDetail')}</summary><p>{failure}</p></details>}
    {error !== null && <p role="alert">{error}</p>}
  </section>
}
