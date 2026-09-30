/** Sidebar Story library: Story aggregates with nested scene Sessions. */
import { useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconEditOutline16, IconFolderOpen16, IconPlusOutline16, IconTrashOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { StoryView } from '@deepseek-ai/dsh-api-story-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { StoryBrowserProps } from './contract.ts'
import css from './StoryBrowser.module.css'

/** Render the Story library and its scene navigation. */
export function StoryBrowser({
  wide, expandSidebar, useStories, useSessions, startStory, newStory,
  createCreationTask, openCreationTask, deleteCreationTask, importStory,
  renameStory, deleteStory, deleteTemplate, t,
}: StoryBrowserProps) {
  if (useStories === undefined) throw new Error('ui-story: Story root hook unavailable')
  const stories = useStories(value => value)
  const sessions = useSessions(value => value)
  const managedCreatorIds = new Set(stories.items.flatMap(story => (
    story.controlSessionId === undefined ? [] : [story.controlSessionId]
  )))
  const groups = groupStories(stories.items.filter(story => !isCreationDraft(story)))
  const currentSessionId = sessions.current
  const creatorSessions = sessions.ids
    .map(id => sessions.byId[id])
    .filter(session => session?.projectionValues?.agentPreset === 'storyweaver-creator'
      && managedCreatorIds.has(session.id))
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [importing, setImporting] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)
  const run = (action: () => Promise<unknown>): void => {
    setError(undefined)
    setStatus(undefined)
    void action().catch((reason: unknown) => {
      const detail = reason instanceof Error ? reason.message : String(reason)
      setError(detail === '' ? t('error.action') : t('error.actionDetail', { detail }))
    })
  }
  const runImport = (file: File): void => {
    setError(undefined)
    setStatus(undefined)
    setImporting(true)
    void file.text().then(importStory).then(
      (story) => { setStatus(t('story.imported', { title: story.title })) },
      (reason: unknown) => {
        const detail = reason instanceof Error ? reason.message : String(reason)
        setError(detail === '' ? t('error.action') : t('error.actionDetail', { detail }))
      },
    ).finally(() => { setImporting(false) })
  }
  const importControl = (
    <input
      ref={importInput}
      className={css.fileInput}
      type="file"
      accept="application/json,.json"
      aria-label={t('story.importLabel')}
      onChange={(event) => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file !== undefined) runImport(file)
      }}
    />
  )

  if (!wide) {
    return (
      <div className={css.rail}>
        {importControl}
        <Tooltip label={t('creator.new')} side="right">
          <button type="button" className={css.railButton} onClick={() => { run(createCreationTask) }} aria-label={t('creator.new')}>
            <IconEditOutline16 size={18} />
          </button>
        </Tooltip>
        <Tooltip label={t('section.title')} side="right">
          <button type="button" className={css.railButton} onClick={expandSidebar} aria-label={t('section.title')}>
            <IconFolderOpen16 size={18} />
          </button>
        </Tooltip>
        <Tooltip label={t('story.new')} side="right">
          <button type="button" className={css.railButton} onClick={() => { startStory() }} aria-label={t('story.new')}>
            <IconPlusOutline16 size={18} />
          </button>
        </Tooltip>
        <Tooltip label={t('story.import')} side="right">
          <button type="button" className={css.railButton} disabled={importing} onClick={() => {
            expandSidebar()
            importInput.current?.click()
          }} aria-label={importing ? t('story.importing') : t('story.import')} aria-busy={importing}>
            <ImportGlyph />
          </button>
        </Tooltip>
      </div>
    )
  }

  return (
    <section className={css.root} aria-label={t('section.title')}>
      {importControl}
      <section className={clsx(css.creatorWorkspace, creatorSessions.some(session => session?.id === currentSessionId) && css.activeCreator)} aria-label={t('creator.title')}>
        <header className={css.creatorHeader}>
          <button type="button" className={css.creatorMain} onClick={() => {
            const first = creatorSessions[0]
            if (first === undefined) run(createCreationTask)
            else openCreationTask(first.id)
          }}>
            <svg className={css.creatorGlyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
              <path d="m13.8 8.2 3 3M12 4h-1m7 11v1m-8-5H9" />
            </svg>
            <span>{t('creator.title')}</span>
          </button>
          <button type="button" className={css.iconButton} onClick={() => { run(createCreationTask) }} aria-label={t('creator.new')} title={t('creator.new')}>
            <IconPlusOutline16 size={14} />
          </button>
        </header>
        <div className={css.creatorTasks}>
          {creatorSessions.length === 0 && <span className={css.creatorEmpty}>{t('creator.empty')}</span>}
          {creatorSessions.map((session, index) => session === undefined ? null : (
            <div key={session.id} className={clsx(css.creatorTaskRow, session.id === currentSessionId && css.activeTask)}>
              <button type="button" className={css.creatorTask} onClick={() => { openCreationTask(session.id) }}>
                <span className={css.sceneDot} aria-hidden="true" />
                <span>{session.blank ? t('creator.task', { index: creatorSessions.length - index }) : sceneTitle(session.displayTitle, t('creator.task', { index: creatorSessions.length - index }))}</span>
              </button>
              <button type="button" className={css.deleteCreatorTask} title={t('creator.delete')} aria-label={t('creator.delete')} onClick={() => {
                if (window.confirm(t('creator.deleteConfirm'))) run(() => deleteCreationTask(session.id))
              }}>
                <IconTrashOutline16 size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>
      <header className={css.header}>
        <span>{t('section.title')}</span>
        <span className={css.headerActions}>
          <button type="button" className={css.importButton} disabled={importing} aria-busy={importing} onClick={() => { importInput.current?.click() }} title={t('story.importHint')}>
            <ImportGlyph />
            <span>{importing ? t('story.importing') : t('story.import')}</span>
          </button>
          <button type="button" className={css.iconButton} onClick={() => { startStory() }} aria-label={t('story.new')} title={t('story.new')}>
            <IconPlusOutline16 />
          </button>
        </span>
      </header>
      {error !== undefined && <div className={css.error} role="alert">{error}</div>}
      {status !== undefined && <div className={css.status} role="status">{status}</div>}
      <div className={css.list}>
        {stories.phase === 'ready' && stories.items.length === 0 && (
          <button type="button" className={css.empty} onClick={() => { startStory() }}>
            <strong>{t('story.empty')}</strong>
            <span>{t('story.emptyHint')}</span>
          </button>
        )}
        {groups.map((group) => {
          const story = group.representative
          const active = currentSessionId !== undefined && group.runs.some(runStory => owns(runStory, currentSessionId))
          return (
            <article key={group.templateId} className={clsx(css.story, active && css.activeStory)}>
              <div className={css.storyRow}>
                <button type="button" className={css.storyMain} onClick={() => {
                  const firstRun = group.runs[0]
                  if (firstRun === undefined) run(() => newStory(story.storyId))
                  else startStory(firstRun.storyId)
                }}>
                  <IconFolderOpen16 size={16} />
                  <span className={css.storyText}>
                    <strong>{story.title}</strong>
                    {story.premise !== '' && <small>{story.premise}</small>}
                  </span>
                </button>
                <span className={css.actions}>
                  <button type="button" className={css.iconButton} title={t('run.new')} aria-label={t('run.new')} onClick={() => { run(() => newStory(story.storyId)) }}>
                    <IconPlusOutline16 size={14} />
                  </button>
                  <button type="button" className={css.iconButton} title={t('story.rename')} aria-label={t('story.rename')} onClick={() => {
                    const title = window.prompt(t('story.renamePrompt'), story.title)?.trim()
                    if (title !== undefined && title !== '') run(() => renameStory(story.storyId, title))
                  }}>
                    <IconEditOutline16 size={14} />
                  </button>
                  <button type="button" className={css.iconButton} title={t('template.delete')} aria-label={t('template.delete')} onClick={() => {
                    if (window.confirm(t('template.deleteConfirm'))) run(() => deleteTemplate(group.templateId))
                  }}>
                    <IconTrashOutline16 size={14} />
                  </button>
                </span>
              </div>
              <div className={css.scenes}>
                {group.runs.length === 0 && (
                  <button type="button" className={css.emptyRun} onClick={() => { run(() => newStory(story.storyId)) }}>
                    <IconPlusOutline16 size={13} />
                    <span>{t('run.empty')}</span>
                  </button>
                )}
                {group.runs.map((runStory, index) => {
                  const sessionId = runStory.currentSceneSessionId ?? runStory.sceneSessionIds[0]
                  const summary = sessionId === undefined ? undefined : sessions.byId[sessionId]
                  const selected = currentSessionId !== undefined && owns(runStory, currentSessionId)
                  return (
                    <div key={runStory.storyId} className={clsx(css.scene, selected && css.activeScene)}>
                      <button type="button" className={css.sceneMain} onClick={() => { startStory(runStory.storyId) }}>
                        <span className={css.sceneDot} aria-hidden="true" />
                        <span>{sceneTitle(summary?.displayTitle, t('run.fallback', { index: group.runs.length - index }))}</span>
                      </button>
                      <button type="button" className={css.archiveScene} title={t('run.delete')} aria-label={t('run.delete')} onClick={() => {
                        if (window.confirm(t('run.deleteConfirm'))) run(() => deleteStory(runStory.storyId))
                      }}>
                        <IconTrashOutline16 size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function ImportGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v11" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 15v4h14v-4" />
    </svg>
  )
}

function isCreationDraft(story: StoryView): boolean {
  return !story.templateOnly && story.sceneSessionIds.length === 0 && story.controlSessionId !== undefined
}

/** One authored setting and its independent runtime Stories. */
export interface StoryGroup {
  readonly templateId: string
  readonly representative: StoryView
  readonly runs: readonly StoryView[]
}

/** Group independent Story aggregates by their shared authored-setting identity. */
export function groupStories(stories: readonly StoryView[]): StoryGroup[] {
  const grouped = new Map<string, StoryView[]>()
  for (const story of stories) {
    const runs = grouped.get(story.templateId)
    if (runs === undefined) grouped.set(story.templateId, [story])
    else runs.push(story)
  }
  return [...grouped].map(([templateId, records]) => {
    const ordered = [...records].sort(compareCreatedAt)
    const template = ordered.find(story => story.templateOnly)
    return {
      templateId,
      representative: template
        ?? ordered.reduce((oldest, candidate) => candidate.createdAt < oldest.createdAt ? candidate : oldest),
      runs: ordered.filter(story => !story.templateOnly),
    }
  }).sort((left, right) => compareCreatedAt(left.representative, right.representative))
}

/** Keep navigation order independent from mutable activity timestamps and selection. */
function compareCreatedAt(left: StoryView, right: StoryView): number {
  return Date.parse(right.createdAt) - Date.parse(left.createdAt)
    || String(left.storyId).localeCompare(String(right.storyId))
}

function owns(story: StoryView, sessionId: SessionId): boolean {
  return story.sceneSessionIds.includes(sessionId)
    || story.controlSessionId === sessionId
    || story.actors.some(actor => actor.sessionId === sessionId)
}

/** Keep Host-only managed runtime directory names out of player-facing scene navigation. */
export function sceneTitle(displayTitle: string | undefined, fallback: string): string {
  const title = displayTitle?.trim()
  return title === undefined || title === '' || title === '.runtime' ? fallback : title
}
