import { ExecutionStatus } from './ExecutionStatus.tsx'
import { characterKnowledgePanel } from './CharacterKnowledgePanel.tsx'
/** Player-intent dock, creation workspace, and title-bar tools for Story sessions. */
import type { IStories, StoryDiscussion, StoryView } from '@deepseek-ai/dsh-api-story-controller/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import { RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PermissionSelect } from '@deepseek-ai/dsh-permission-presets/client'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ComponentProps } from 'react'
import { ContextReviewPanel } from './ContextReviewPanel.tsx'
import { contextBuilderPanel } from './ContextBuilderPanel.tsx'
import { directorRunConsole } from './DirectorRunConsole.tsx'
import { directorOutlinePanel } from './DirectorOutlinePanel.tsx'
import { isCreatorSession, RoleplayIntentDock, storyOwnsSession } from './RoleplayChrome.tsx'
import { storybookStudioPanel } from './StorybookStudioPanel.tsx'
import { storyOperationsPanel } from './StoryOperationsPanel.tsx'
import css from './RoleplayChrome.module.css'
import { WorkspaceCloseButton, WorkspaceDialog } from './WorkspaceDialog.tsx'

type StorybookPanelProps = ComponentProps<ReturnType<typeof storybookStudioPanel>>
type CreatorWorkspaceDockProps = ComponentProps<typeof RoleplayIntentDock> & { sessions?: ISessions | undefined }
type StoryDockProps = ComponentProps<typeof RoleplayIntentDock>

const EMPTY_PERMISSION_FACE = {
  getSnapshot: (): undefined => undefined,
  subscribe: (_listener: () => void): (() => void) => () => {},
}

function CreatorGlyph() {
  return (
    <svg className={css.sessionToolGlyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m13.8 8.2 3 3M5 6h2m10 10v2m-7-7H8" />
    </svg>
  )
}

function DiscussionGlyph() {
  return (
    <svg className={css.discussionModeGlyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5h10a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H9l-4 3v-3.5a3 3 0 0 1-1-2.2Z" />
      <path d="M14.5 9.5H18a2 2 0 0 1 2 2v5l-3-2h-2" />
    </svg>
  )
}

function discussionPhase(discussion: StoryDiscussion): 'preparing' | 'developing' | 'summarizing' | 'paused' {
  if (discussion.status === 'summarizing') return 'summarizing'
  if (discussion.status === 'awaiting-player') return 'paused'
  if ((discussion.preparationPendingIds?.length ?? 0) > 0) return 'preparing'
  return 'developing'
}

function activeDiscussion(story: StoryView): StoryDiscussion | undefined {
  return story.discussions.discussions.find(item => (
    item.status === 'active' || item.status === 'awaiting-player' || item.status === 'summarizing'
  ))
}

function DiscussionModeDock({
  story, discussion, stories, props,
}: {
  readonly story: StoryView
  readonly discussion: StoryDiscussion
  readonly stories: IStories
  readonly props: StoryDockProps
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const phase = discussionPhase(discussion)
  const turnBudget = discussion.maxRounds * discussion.participantIds.length
  const latest = discussion.turns.at(-1)
  const statusText = phase === 'summarizing'
    ? props.t('discussion.dock.status.summarizing')
    : phase === 'preparing'
      ? props.t('discussion.dock.preparationProgress', { current: discussion.participantIds.length - (discussion.preparationPendingIds?.length ?? 0), total: discussion.participantIds.length })
      : phase === 'paused'
        ? props.t(`discussion.dock.status.${discussion.playerIntervention ?? 'paused'}`)
        : props.t('discussion.dock.status.speaking', {
          speaker: discussion.currentSpeakerId ?? props.t('discussion.dock.pendingSpeaker'),
        })
  const intervene = async (kind: 'speak' | 'conclude'): Promise<void> => {
    if (busy || discussion.status !== 'active') return
    setBusy(true)
    setError(null)
    try {
      await stories.requestDiscussionIntervention(
        story.storyId, story.discussions.revision, discussion.id, kind,
      )
    } catch (reason: unknown) {
      setError(props.t('discussion.dock.error', {
        value: reason instanceof Error ? reason.message : String(reason),
      }))
    } finally {
      setBusy(false)
    }
  }
  const cancelIntervention = async (): Promise<void> => {
    if (busy || discussion.status !== 'awaiting-player') return
    setBusy(true)
    setError(null)
    try {
      await stories.clearDiscussionIntervention(
        story.storyId, story.discussions.revision, discussion.id,
      )
    } catch (reason: unknown) {
      setError(props.t('discussion.dock.error', {
        value: reason instanceof Error ? reason.message : String(reason),
      }))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className={css.discussionModeDock} aria-label={props.t('discussion.dock.title')}>
      <header className={css.discussionModeHeader}>
        <span className={css.discussionModeIcon}><DiscussionGlyph /></span>
        <div className={css.discussionModeHeading}>
          <span>{props.t('discussion.dock.eyebrow')}</span>
          <strong>{discussion.topic}</strong>
        </div>
        <span className={css.discussionPhase} data-phase={phase}>{props.t(`discussion.dock.phase.${phase}`)}</span>
      </header>
      <div className={css.discussionLiveStatus} role="status" aria-live="polite" aria-atomic="true">
        <span className={css.discussionPulse} data-phase={phase} aria-hidden="true" />
        <strong>{statusText}</strong>
        <span>{props.t('discussion.dock.progress', {
          current: discussion.turns.length,
          total: turnBudget,
          round: discussion.round,
          max: discussion.maxRounds,
        })}</span>
      </div>
      <div className={css.discussionParticipants} aria-label={props.t('discussion.dock.participants')}>
        {discussion.participantIds.map((actorId) => {
          const intent = discussion.participantIntents?.[actorId]
          const speaking = discussion.currentSpeakerId === actorId && discussion.status === 'active'
          const runActor = story.plotLedger.directorRun?.actors.find(item => item.actorId === actorId)
          const preparation = phase !== 'preparing' ? undefined
            : !discussion.preparationPendingIds?.includes(actorId) ? 'ready'
              : runActor?.status === 'failed' || runActor?.status === 'cancelled' ? 'failed'
                : runActor?.status === 'running' ? 'running' : 'pending'
          return (
            <div key={actorId} className={css.discussionParticipant} data-speaking={speaking || undefined}>
              <span className={css.discussionAvatar} aria-hidden="true">{actorId.slice(0, 1).toUpperCase()}</span>
              <span><strong>{actorId}</strong><small>{preparation === undefined ? intent?.stance ?? props.t('discussion.dock.considering') : props.t(`discussion.dock.preparation.${preparation}`)}</small></span>
              <i data-eagerness={intent?.eagerness ?? 'medium'} aria-label={props.t(`discussion.dock.eagerness.${intent?.eagerness ?? 'medium'}`)} />
            </div>
          )
        })}
      </div>
      {latest !== undefined && (
        <blockquote className={css.discussionLatest}>
          <strong>{latest.speakerId}</strong>
          <span>{latest.text || props.t('discussion.dock.passed')}</span>
        </blockquote>
      )}
      <footer className={css.discussionModeActions}>
        <span>{phase === 'summarizing' ? props.t('discussion.dock.summaryHint') : props.t('discussion.dock.autonomyHint')}</span>
        {discussion.status === 'active' && (
          <div>
            <button type="button" disabled={busy} onClick={() => { void intervene('speak') }}>{props.t('operations.discussion.playerSpeak')}</button>
            <button type="button" disabled={busy} onClick={() => { void intervene('conclude') }}>{props.t('operations.discussion.askConclude')}</button>
          </div>
        )}
        {discussion.status === 'awaiting-player' && discussion.playerIntervention !== undefined && (
          <div>
            <button type="button" disabled={busy} onClick={() => { void cancelIntervention() }}>
              {busy ? props.t('discussion.dock.cancelling') : props.t('discussion.dock.cancelIntervention')}
            </button>
          </div>
        )}
      </footer>
      {error !== null && <p className={css.discussionModeError} role="alert">{error}</p>}
    </section>
  )
}


function CreatorWorkspaceDock(props: CreatorWorkspaceDockProps) {
  const creator = isCreatorSession(props)
  const cwd = props.useSessions(snapshot => snapshot.byId[props.sessionId]?.cwd)
  const liveSession = props.sessions?.binding(props.sessionId)?.session
  const permissionFace = liveSession?.projections.faceOf('permissions') ?? EMPTY_PERMISSION_FACE
  const permission = useSyncExternalStore(
    listener => permissionFace.subscribe(listener),
    () => permissionFace.getSnapshot(),
    () => permissionFace.getSnapshot(),
  ) as PermissionSelect | undefined
  const permissionId = useId()
  const permissionSelectRef = useRef<HTMLSelectElement>(null)
  const [savingPermission, setSavingPermission] = useState(false)
  const [confirmingFullAccess, setConfirmingFullAccess] = useState(false)
  const [acknowledgedFullAccess, setAcknowledgedFullAccess] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null)
  const [permissionError, setPermissionError] = useState<string | null>(null)

  useEffect(() => {
    setSavingPermission(false)
    setConfirmingFullAccess(false)
    setAcknowledgedFullAccess(false)
    setPermissionStatus(null)
    setPermissionError(null)
  }, [props.sessionId])

  if (!creator) return null

  const permissionLabel = (value: string): string => {
    switch (value) {
      case 'read-only': return props.t('creator.permission.readOnly')
      case 'workspace-write': return props.t('creator.permission.workspaceWrite')
      case 'danger-full-access': return props.t('creator.permission.fullAccess')
      case 'custom': return props.t('creator.permission.custom')
      default: return value
    }
  }
  const switchPermission = async (value: string): Promise<void> => {
    setSavingPermission(true)
    setPermissionStatus(null)
    setPermissionError(null)
    try {
      if (liveSession === undefined) throw new Error(props.t('creator.permissionSessionUnavailable'))
      const result = await liveSession.command(`/permission ${value}`)
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      if (!result.value.matched) throw new Error(props.t('creator.permissionUnavailable'))
      setPermissionStatus(props.t('creator.permissionChanged', { value: permissionLabel(value) }))
    } catch (reason: unknown) {
      setPermissionError(props.t('creator.permissionError', {
        value: reason instanceof Error ? reason.message : String(reason),
      }))
    } finally {
      setSavingPermission(false)
    }
  }
  const closeFullAccessConfirmation = (): void => {
    setAcknowledgedFullAccess(false)
    setConfirmingFullAccess(false)
    permissionSelectRef.current?.focus()
  }
  return (
    <>
      <section className={css.creatorDock} aria-label={props.t('creator.workspaceTitle')}>
        <div className={css.creatorDockIcon}><CreatorGlyph /></div>
        <div className={css.creatorDockCopy}>
          <strong>{props.t('creator.workspaceTitle')}</strong>
          <span>{props.t('creator.workspaceHint')}</span>
          {permissionStatus !== null && <span className={css.creatorPermissionStatus} role="status">{permissionStatus}</span>}
          {permissionError !== null && <span className={css.creatorPermissionError} role="alert">{permissionError}</span>}
        </div>
        <div className={css.creatorDockFacts}>
          <span><i aria-hidden="true" />{cwd === undefined ? props.t('creator.workspaceMissing') : props.t('creator.agentReady')}</span>
          <code title={cwd}>{cwd ?? props.t('creator.workspaceMissingPath')}</code>
          <label className={css.creatorPermission} htmlFor={permissionId}>
            <span>{props.t('creator.permissionTitle')}</span>
            <select
              ref={permissionSelectRef}
              id={permissionId}
              value={permission?.currentValue ?? ''}
              disabled={savingPermission || permission === undefined}
              aria-describedby={`${permissionId}-hint`}
              onChange={(event) => {
                const value = event.currentTarget.value
                if (value === permission?.currentValue || value === 'custom') return
                if (value === 'danger-full-access') {
                  setAcknowledgedFullAccess(false)
                  setConfirmingFullAccess(true)
                  return
                }
                void switchPermission(value)
              }}
            >
              {permission === undefined && <option value="">{props.t('creator.permissionLoading')}</option>}
              {permission?.options.map(option => (
                <option key={option.value} value={option.value} disabled={option.value === 'custom'}>
                  {permissionLabel(option.value)}
                </option>
              ))}
            </select>
            <small id={`${permissionId}-hint`} title={props.t('creator.permissionHint')}>
              {props.t('creator.permissionHint')}
            </small>
          </label>
        </div>
      </section>
      <RiskConfirmation
        open={confirmingFullAccess}
        title={props.t('creator.permissionConfirmTitle')}
        description={props.t('creator.permissionConfirmDescription')}
        acknowledgeLabel={props.t('creator.permissionConfirmAcknowledge')}
        cancelLabel={props.t('creator.permissionConfirmCancel')}
        closeLabel={props.t('creator.permissionConfirmClose')}
        confirmLabel={props.t('creator.permissionConfirmEnable')}
        acknowledged={acknowledgedFullAccess}
        disabled={savingPermission}
        onAcknowledgedChange={setAcknowledgedFullAccess}
        onCancel={closeFullAccessConfirmation}
        onConfirm={() => {
          closeFullAccessConfirmation()
          void switchPermission('danger-full-access')
        }}
      />
    </>
  )
}

function creatorPromptPanel(stories: IStories) {
  return function CreatorPromptPanel(props: StorybookPanelProps) {
    const story = props.useStories?.(snapshot => snapshot.items.find(item => storyOwnsSession(item, props.sessionId)))
    const [open, setOpen] = useState(false)
    const [prompt, setPrompt] = useState('')
    const [baseline, setBaseline] = useState('')
    const [revision, setRevision] = useState(0)
    const [restoreDefault, setRestoreDefault] = useState(false)
    const [saving, setSaving] = useState(false)
    const [status, setStatus] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
      setOpen(false)
      setPrompt('')
      setStatus(null)
      setError(null)
    }, [story?.storyId])

    const load = async (): Promise<void> => {
      if (story === undefined) return
      setError(null)
      try {
        const settings = await stories.prompts(story.storyId)
        setBaseline(settings.creator.storybookPrompt)
        setPrompt(settings.creator.storyOverride ?? settings.creator.storybookPrompt)
        setRevision(settings.storyPromptRevision)
        setRestoreDefault(false)
      } catch (reason: unknown) {
        setError(props.t('creator.promptError', { value: reason instanceof Error ? reason.message : String(reason) }))
      }
    }

    const close = (): void => {
      setOpen(false)
      triggerRef.current?.focus()
    }

    const save = async (): Promise<void> => {
      if (story === undefined || saving) return
      setSaving(true)
      setStatus(null)
      setError(null)
      try {
        const settings = await stories.updatePrompt({
          storyId: story.storyId,
          scope: 'story',
          expectedStoryPromptRevision: revision,
          target: 'creator',
          ...(restoreDefault ? {} : { prompt }),
        })
        setRevision(settings.storyPromptRevision)
        setBaseline(settings.creator.storybookPrompt)
        setPrompt(settings.creator.storyOverride ?? settings.creator.storybookPrompt)
        setRestoreDefault(false)
        setStatus(props.t('creator.promptSaved'))
      } catch (reason: unknown) {
        setError(props.t('creator.promptError', { value: reason instanceof Error ? reason.message : String(reason) }))
      } finally {
        setSaving(false)
      }
    }

    return <div className={css.outlinePanelRoot}>
      <button ref={triggerRef} type="button"
        className={`${css.characterPanelTrigger} ${css.contextBuilderTrigger}`}
        aria-expanded={open} disabled={story === undefined}
        onClick={() => { if (open) close(); else { setOpen(true); void load() } }}
      >{props.t('creator.promptTitle')}</button>
      {open && story !== undefined && <WorkspaceDialog
        className={`${css.outlinePanel} ${css.contextBuilderPanel}`}
        label={props.t('creator.promptTitle')} storageKey="story-creator-prompt"
        defaultSize={{ width: 760, height: 620 }}
        resizeLabels={{ top: props.t('workspace.resizeTop'), right: props.t('workspace.resizeRight'), bottom: props.t('workspace.resizeBottom'), left: props.t('workspace.resizeLeft') }}
        returnFocusRef={triggerRef} onClose={close}
      >
        <header className={css.characterPanelHeader}>
          <div><strong>{props.t('creator.promptTitle')}</strong><p>{props.t('creator.promptHint')}</p></div>
          <WorkspaceCloseButton label={props.t('workspace.close')} onClick={close} />
        </header>
        <div className={css.operationsForm}>
          <label className={css.promptSettingsField}><span>{props.t('creator.promptField')}</span><textarea value={prompt} onChange={(event) => { setPrompt(event.target.value); setRestoreDefault(false); setStatus(null) }} /></label>
          <p className={css.operationsHint}>{props.t('creator.promptBoundary')}</p>
          <div className={css.operationsButtonRow}>
            <button type="button" className={css.operationsPrimary} disabled={saving} onClick={() => { void save() }}>{props.t('prompts.save')}</button>
            <button type="button" disabled={saving} onClick={() => { setPrompt(baseline); setRestoreDefault(false); setStatus(null); setError(null) }}>{props.t('prompts.cancel')}</button>
            <button type="button" disabled={saving || restoreDefault} onClick={() => { setPrompt(baseline); setRestoreDefault(true); setStatus(props.t('creator.promptRestorePending')) }}>{props.t('creator.promptRestore')}</button>
          </div>
          {status !== null && <p className={css.operationsStatus} role="status">{status}</p>}
          {error !== null && <p className={css.characterError} role="alert">{error}</p>}
        </div>
      </WorkspaceDialog>}
    </div>
  }
}

/** Keep authoring reachable while the generic Session header is hidden for a blank scene. */
export function roleplayStoryDock(stories: IStories, sessions?: ISessions) {
  const loadActors = async (storyId: StoryView['storyId']) => (await stories.characterWorkspace({ storyId, mode: 'scene' })).people.map(item => ({ actorId: item.actorId, displayName: item.label }))
  const RoleplaySessionTools = roleplaySessionTools(stories, sessions)
  return function RoleplayStoryDock(props: ComponentProps<typeof RoleplayIntentDock>) {
    const creator = isCreatorSession(props)
    const story = props.useStories?.(snapshot => snapshot.items.find(item => storyOwnsSession(item, props.sessionId)))
    const discussion = story === undefined ? undefined : activeDiscussion(story)
    return (
      <div className={css.storyDock}>
        {props.session.blank && (
          <div className={css.storyDockToolbar}>
            <RoleplaySessionTools {...props} />
          </div>
        )}
        {!creator && story !== undefined && <ExecutionStatus story={story} stories={stories} sessions={sessions}
          sessionId={props.sessionId} running={props.session.running} failure={props.session.lastAgentError ?? null} t={props.t} />}
        {creator
          ? <CreatorWorkspaceDock {...props} sessions={sessions} />
          : story !== undefined && discussion !== undefined
            ? <>
              <DiscussionModeDock story={story} discussion={discussion} stories={stories} props={props} />
              <RoleplayIntentDock {...props} loadActors={loadActors} />
            </>
            : <RoleplayIntentDock {...props} loadActors={loadActors} />}
      </div>
    )
  }
}

/** Expose the mode-appropriate authoring workspace directly in the Session title bar. */
export function roleplaySessionTools(stories: IStories, _sessions?: ISessions) {
  const StorybookStudioPanel = storybookStudioPanel(stories, { section: 'basics', label: 'workspace.story' })
  const CharacterKnowledge = characterKnowledgePanel(stories)
  const CharacterSettings = storybookStudioPanel(stories, { section: 'characters', label: 'workspace.characters' })
  const StateSettings = storybookStudioPanel(stories, { section: 'state', label: 'workspace.state' })
  const StyleSettings = contextBuilderPanel(stories, { section: 'style', label: 'style.title' })
  const DirectorOutlinePanel = directorOutlinePanel(stories)
  const DirectorRunConsole = directorRunConsole(stories)
  const StoryOperationsPanel = storyOperationsPanel(stories)
  const ContextBuilderPanel = contextBuilderPanel(stories)
  const CreatorPromptPanel = creatorPromptPanel(stories)
  return function RoleplaySessionTools(props: StorybookPanelProps) {
    const creator = isCreatorSession(props)
    const story = props.useStories?.(snapshot => snapshot.items.find(item => storyOwnsSession(item, props.sessionId)))
    if (creator) {
      return <div className={css.sessionTools}><div className={css.sessionPromptActions}><CreatorPromptPanel {...props} /></div></div>
    }
    return (
      <div className={css.sessionTools}>
        <DirectorRunConsole {...props} />
        {story !== undefined && <ContextReviewPanel story={story} commands={stories} t={props.t} />}
        <div className={css.sessionWorkspaceActions} role="group" aria-label={props.t('workspace.tools')}>
          <div className={css.sessionPromptActions}>
            <StorybookStudioPanel {...props} />
            <CharacterSettings {...props} />
            <CharacterKnowledge {...props} />
            <StyleSettings {...props} />
            <StateSettings {...props} />
            <ContextBuilderPanel {...props} />
          </div>
          <DirectorOutlinePanel {...props} />
          <StoryOperationsPanel {...props} />
        </div>
      </div>
    )
  }
}
