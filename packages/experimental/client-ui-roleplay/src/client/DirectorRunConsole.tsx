import type { IStories, StoryView } from '@deepseek-ai/dsh-api-story-controller/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DirectorRunActor, DirectorRunStatus } from '@deepseek-ai/dsh-story/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NS } from './locales.ts'
import css from './RoleplayChrome.module.css'

type ConsoleProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS>
type Translate = ConsoleProps['t']
type ConsoleView = 'queue' | 'brief'
type RunCommands = Pick<IStories,
  | 'resumeDirectorRun'
  | 'retryDirectorRunActor'
  | 'pauseDirectorRun'
  | 'cancelDirectorRun'
  | 'skipDirectorRunActor'
  | 'cancelDirectorRunActor'>

interface Confirmation {
  readonly key: string
  readonly message: string
  readonly operation: () => Promise<StoryView>
}

function ownsSession(story: StoryView, sessionId: SessionId): boolean {
  return story.sceneSessionIds.includes(sessionId)
    || story.controlSessionId === sessionId
    || story.actors.some(actor => actor.sessionId === sessionId)
}

function settledActors(actors: readonly DirectorRunActor[]): number {
  return actors.filter(actor => actor.status === 'completed' || actor.status === 'skipped').length
}

/** Bind the player-visible durable Director Run console to exact-revision commands. */
export function directorRunConsole(stories: RunCommands) {
  return function DirectorRunConsole({ sessionId, useStories, t }: ConsoleProps) {
    const story = useStories?.(snapshot => snapshot.items.find(item => ownsSession(item, sessionId)))
    const run = story?.plotLedger.directorRun
    const brief = story?.plotLedger.latestBrief
    const [open, setOpen] = useState(false)
    const [view, setView] = useState<ConsoleView>('queue')
    const [busy, setBusy] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const dialogRef = useRef<HTMLElement>(null)
    const titleId = useId()
    const subtitleId = useId()
    const queueTabId = useId()
    const briefTabId = useId()

    const close = useCallback((): void => {
      setOpen(false)
      setConfirmation(null)
      triggerRef.current?.focus()
    }, [])

    useEffect(() => {
      setOpen(false)
      setView('queue')
      setBusy(null)
      setError(null)
      setConfirmation(null)
    }, [story?.storyId])

    useEffect(() => {
      if (!open) return
      const previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      const focusFrame = window.requestAnimationFrame(() => { dialogRef.current?.focus() })
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
          event.preventDefault()
          close()
          return
        }
        if (event.key !== 'Tab' || dialogRef.current === null) return
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ))
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
      document.addEventListener('keydown', onKeyDown)
      return () => {
        window.cancelAnimationFrame(focusFrame)
        document.removeEventListener('keydown', onKeyDown)
        document.body.style.overflow = previousOverflow
      }
    }, [close, open])

    const command = async (key: string, operation: () => Promise<StoryView>): Promise<void> => {
      if (busy !== null) return
      setBusy(key)
      setError(null)
      try {
        await operation()
      } catch (reason: unknown) {
        setError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        setBusy(null)
      }
    }
    const runCommand = (key: string, operation: (storyId: StoryView['storyId'], revision: number) => Promise<StoryView>): void => {
      if (story === undefined || run === undefined) return
      void command(key, () => operation(story.storyId, run.revision))
    }
    const actorCommand = (
      key: string,
      actorId: string,
      operation: (storyId: StoryView['storyId'], revision: number, actorId: string) => Promise<StoryView>,
    ): void => {
      if (story === undefined || run === undefined) return
      void command(key, () => operation(story.storyId, run.revision, actorId))
    }
    const confirmRunCommand = (
      key: string,
      message: string,
      operation: (storyId: StoryView['storyId'], revision: number) => Promise<StoryView>,
    ): void => {
      if (story === undefined || run === undefined || busy !== null) return
      setConfirmation({ key, message, operation: () => operation(story.storyId, run.revision) })
    }
    const confirmActorCommand = (
      key: string,
      message: string,
      actorId: string,
      operation: (storyId: StoryView['storyId'], revision: number, actorId: string) => Promise<StoryView>,
    ): void => {
      if (story === undefined || run === undefined || busy !== null) return
      setConfirmation({ key, message, operation: () => operation(story.storyId, run.revision, actorId) })
    }
    const confirm = (): void => {
      if (confirmation === null) return
      const pending = confirmation
      setConfirmation(null)
      void command(pending.key, pending.operation)
    }

    const completed = run === undefined ? 0 : settledActors(run.actors)
    const total = run?.actors.length ?? 0

    return (
      <div className={css.directorRunRoot}>
        <button
          ref={triggerRef}
          type="button"
          className={`${css.characterPanelTrigger} ${css.directorRunTrigger}`}
          aria-expanded={open}
          aria-label={t('run.open')}
          onClick={() => { if (open) close(); else { setView('queue'); setOpen(true) } }}
        >
          <span className={css.runStatusDot} data-status={run?.status ?? 'empty'} aria-hidden="true" />
          <span className={css.sessionToolLabel}>{t('run.title')}</span>
          {run !== undefined && (
            <span className={css.runTriggerMeta}>
              {t('run.revisionShort', { value: run.revision })}
              <span aria-hidden="true">·</span>
              {t('run.progressCompact', { completed, total })}
              <span aria-hidden="true">·</span>
              {runStatusLabel(run.status, t)}
            </span>
          )}
        </button>
        {open && createPortal(
          <div className={css.directorRunLayer} onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
            <section
              ref={dialogRef}
              className={css.directorRunConsole}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={subtitleId}
              aria-busy={busy !== null}
              tabIndex={-1}
            >
              <header className={css.directorRunHeader}>
                <div>
                  <strong id={titleId}>{t('run.title')}</strong>
                  <p id={subtitleId}>{t('run.subtitle')}</p>
                </div>
                <button type="button" className={css.directorRunClose} onClick={close}>{t('run.close')}</button>
              </header>
              {run !== undefined && (
                <section className={css.directorRunOverview} aria-label={t('run.overview')}>
                  <span className={css.runStatusDot} data-status={run.status} aria-hidden="true" />
                  <div>
                    <strong>{runStatusLabel(run.status, t)}</strong>
                    <span>{t('run.checkpoint', { revision: run.revision, ledger: run.briefLedgerRevision })}</span>
                  </div>
                  <strong>{t('run.progressCompact', { completed, total })}</strong>
                </section>
              )}
              {run === undefined || brief === undefined
                ? <p className={css.characterEmpty}>{t('run.empty')}</p>
                : (
                  <>
                    <div className={css.directorRunTabs} role="tablist" aria-label={t('run.views')}>
                      <button id={queueTabId} type="button" role="tab" aria-label={t('run.tab.queue')} aria-selected={view === 'queue'} aria-controls={`${queueTabId}-panel`} onClick={() => { setView('queue') }}>
                        {t('run.tab.queue')}<span>{completed}/{total}</span>
                      </button>
                      <button id={briefTabId} type="button" role="tab" aria-label={t('run.tab.brief')} aria-selected={view === 'brief'} aria-controls={`${briefTabId}-panel`} onClick={() => { setView('brief') }}>
                        {t('run.tab.brief')}<span>{t('run.briefCompact', { value: brief.ledgerRevision })}</span>
                      </button>
                    </div>
                    <div className={css.directorRunBody}>
                      {view === 'brief' && (
                        <section id={`${briefTabId}-panel`} role="tabpanel" aria-labelledby={briefTabId} className={css.directorBriefCard}>
                          <header><strong>{t('run.brief')}</strong><span>{t('run.briefRevision', { value: brief.ledgerRevision })}</span></header>
                          <p>{brief.situation}</p>
                          <BriefList title={t('run.facts')} values={brief.establishedFacts} empty={t('run.none')} />
                          <BriefList title={t('run.threads')} values={brief.openThreads} empty={t('run.none')} />
                          <details><summary>{t('run.actorBriefs', { value: brief.actorBriefs.length })}</summary>{brief.actorBriefs.map(actor => (
                            <article key={actor.actorId} className={css.directorActorBrief}>
                              <strong>{actor.actorId}</strong>
                              <BriefList title={t('run.perceptions')} values={actor.perceptions} empty={t('run.none')} />
                              <BriefList title={t('run.uncertainties')} values={actor.uncertainties} empty={t('run.none')} />
                            </article>
                          ))}</details>
                        </section>
                      )}
                      {view === 'queue' && (
                        <section id={`${queueTabId}-panel`} role="tabpanel" aria-labelledby={queueTabId} className={css.directorQueue}>
                          <header><strong>{t('run.queue')}</strong><span>{t('run.progress', { completed, total })}</span></header>
                          {run.actors.map((actor, index) => (
                            <ActorCheckpoint
                              key={actor.actorId}
                              actor={actor}
                              index={index}
                              runStatus={run.status}
                              busy={busy}
                              actorCommand={actorCommand}
                              confirmActorCommand={confirmActorCommand}
                              stories={stories}
                              t={t}
                            />
                          ))}
                        </section>
                      )}
                    </div>
                  </>
                )}
              {confirmation !== null && (
                <div className={css.directorRunConfirmation} role="alert">
                  <strong>{confirmation.message}</strong>
                  <div>
                    <button type="button" onClick={() => { setConfirmation(null) }}>{t('run.keepRunning')}</button>
                    <button type="button" className={css.destructiveButton} onClick={confirm}>{t('run.confirm')}</button>
                  </div>
                </div>
              )}
              {run !== undefined && (
                <footer className={css.directorRunFooter}>
                  <RunActions
                    runStatus={run.status}
                    busy={busy}
                    runCommand={runCommand}
                    confirmRunCommand={confirmRunCommand}
                    stories={stories}
                    t={t}
                  />
                </footer>
              )}
              {error !== null && <p className={css.directorRunError} role="alert">{error}</p>}
            </section>
          </div>,
          document.body,
        )}
      </div>
    )
  }
}

function RunActions({ runStatus, busy, runCommand, confirmRunCommand, stories, t }: {
  readonly runStatus: DirectorRunStatus
  readonly busy: string | null
  readonly runCommand: (key: string, operation: (storyId: StoryView['storyId'], revision: number) => Promise<StoryView>) => void
  readonly confirmRunCommand: (key: string, message: string, operation: (storyId: StoryView['storyId'], revision: number) => Promise<StoryView>) => void
  readonly stories: RunCommands
  readonly t: Translate
}) {
  if (runStatus === 'completed' || runStatus === 'cancelled') return null
  return <div className={css.directorRunActions}>{runStatus === 'dispatching'
    ? <button type="button" disabled={busy !== null} onClick={() => { runCommand('pause', stories.pauseDirectorRun.bind(stories)) }}>{t('run.pause')}</button>
    : <button type="button" disabled={busy !== null} onClick={() => { runCommand('resume', stories.resumeDirectorRun.bind(stories)) }}>{t('run.resume')}</button>}
  <button type="button" className={css.destructiveButton} disabled={busy !== null} onClick={() => {
    confirmRunCommand('cancel', t('run.confirmCancel'), stories.cancelDirectorRun.bind(stories))
  }}>{t('run.cancel')}</button></div>
}

function ActorCheckpoint({ actor, index, runStatus, busy, actorCommand, confirmActorCommand, stories, t }: {
  readonly actor: DirectorRunActor
  readonly index: number
  readonly runStatus: DirectorRunStatus
  readonly busy: string | null
  readonly actorCommand: (key: string, actorId: string, operation: (storyId: StoryView['storyId'], revision: number, actorId: string) => Promise<StoryView>) => void
  readonly confirmActorCommand: (key: string, message: string, actorId: string, operation: (storyId: StoryView['storyId'], revision: number, actorId: string) => Promise<StoryView>) => void
  readonly stories: RunCommands
  readonly t: Translate
}) {
  const retryState = actor.status === 'failed' || actor.status === 'cancelled'
  const retryable = retryState && actor.eventRefs.length === 0
  const skippable = actor.status === 'pending' || retryState || actor.status === 'running'
  return (
    <article className={css.directorActorCheckpoint} data-status={actor.status}>
      <header>
        <span className={css.runStatusDot} data-status={actor.status} aria-hidden="true" />
        <div><strong>{actor.actorId}</strong><span>{t('run.queuePosition', { value: index + 1 })}</span></div>
        <span className={css.directorActorStatus}>{actorStatusLabel(actor.status, t)}</span>
        <span>{t('run.attempts', { value: actor.attempts })}</span>
      </header>
      {actor.failure !== undefined && <p className={css.directorRunFailure}>{t('run.failure', { code: actor.failure.code, message: actor.failure.message })}</p>}
      {actor.attempt !== undefined && (
        <details className={css.directorTechnicalDetails}>
          <summary>{t('run.technicalDetails')}</summary>
          <p>{t('run.attemptOwnership', { generation: actor.attempt.generation, attemptId: actor.attempt.attemptId })}</p>
        </details>
      )}
      <details className={css.directorEventRefs}><summary>{t('run.events', { value: actor.eventRefs.length })}</summary>{actor.eventRefs.length === 0
        ? <p>{t('run.eventsEmpty')}</p>
        : <ul>{actor.eventRefs.map(ref => <li key={ref}><code>{ref}</code></li>)}</ul>}</details>
      {retryState && actor.eventRefs.length > 0 && <p className={css.directorAcceptedLock}>{t('run.acceptedLocked')}</p>}
      {runStatus !== 'completed' && runStatus !== 'cancelled' && skippable && (
        <footer>
          {retryable && runStatus !== 'dispatching' && <button type="button" disabled={busy !== null} onClick={() => { actorCommand(`retry:${actor.actorId}`, actor.actorId, stories.retryDirectorRunActor.bind(stories)) }}>{t('run.retryActor')}</button>}
          {actor.status === 'running' && <button type="button" disabled={busy !== null} onClick={() => {
            confirmActorCommand(`abort:${actor.actorId}`, t('run.confirmAbort', { actor: actor.actorId }), actor.actorId, stories.cancelDirectorRunActor.bind(stories))
          }}>{t('run.abortActor')}</button>}
          <button type="button" disabled={busy !== null} onClick={() => {
            confirmActorCommand(`skip:${actor.actorId}`, t('run.confirmSkip', { actor: actor.actorId }), actor.actorId, stories.skipDirectorRunActor.bind(stories))
          }}>{t('run.skipActor')}</button>
        </footer>
      )}
    </article>
  )
}

function BriefList({ title, values, empty }: { readonly title: string; readonly values: readonly string[]; readonly empty: string }) {
  return <div className={css.directorBriefList}><strong>{title}</strong>{values.length === 0
    ? <span>{empty}</span>
    : <ul>{values.map(value => <li key={value}>{value}</li>)}</ul>}</div>
}

function runStatusLabel(status: DirectorRunStatus, t: Translate): string {
  const keys = {
    brief_committed: 'run.status.committed', dispatching: 'run.status.dispatching', paused: 'run.status.paused',
    awaiting_retry: 'run.status.retry', completed: 'run.status.completed', cancelled: 'run.status.cancelled',
  } as const
  return t(keys[status])
}

function actorStatusLabel(status: DirectorRunActor['status'], t: Translate): string {
  const keys = {
    pending: 'run.actor.pending', running: 'run.actor.running', completed: 'run.actor.completed',
    failed: 'run.actor.failed', skipped: 'run.actor.skipped', cancelled: 'run.actor.cancelled',
  } as const
  return t(keys[status])
}
