/** Fiction and player intent are the primary surface; author and history views are explicit. */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { IconPanelLeftOutline16, IconSendOutline16, IconStopFill16,
  IconEllipsisOutline16, IconPlayOutline16, IconEditOutline16, IconGlobeOutline14, IconUserOutline16, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SurfaceProps } from './contract.ts'
import type { InputMode } from './stores.ts'
import { emptyPerformance } from './player-performance.ts'
import { PlayerPerformanceFields } from './PlayerPerformanceFields.tsx'
import { ActorFacingBeatField } from './ActorFacingBeatField.tsx'
import { DiscussionBudget } from './DiscussionBudget.tsx'
import { NarrativeMark } from './NarrativeMark.tsx'
import { ResizeGrip, useReadingLayout } from './ReadingLayout.tsx'
import { useReadingFollow } from './ReadingFollow.ts'
import { Books } from './Books.tsx'
import { Author } from './Author.tsx'
import { Discussion } from './Discussion.tsx'
import { PersonLabel, personLabelText } from './PersonLabel.tsx'
import { Transcript } from './Transcript.tsx'
import { LiveExecution } from './LiveExecution.tsx'
import { ExecutionDraft } from './ExecutionDraft.tsx'
import { PlayPanel } from './PlayPanel.tsx'
import { StoryUsage } from './StoryUsage.tsx'
import css from './Narrative.module.css'

/** Render accepted fiction and truthful execution phases from the business query. */
export function Surface(props: SurfaceProps) {
  const { t } = props
  const inputHelpId = useId()
  const modelSettings = props.useModelSettings(value => value)
  useEffect(() => { void props.executionModel().catch(() => { /* The selector displays the mirror error. */ }) }, [props.executionModel])
  const play = props.usePlay(value => value)
  const library = props.useLibrary(value => value)
  const panel = props.useStore(value => value.panel)
  const bookTitle = props.useStore(value => value.bookId === null ? null : value.bookEdits[value.bookId]?.title)
  const surface = useRef<HTMLElement>(null)
  const reading = useRef<HTMLDivElement>(null)
  const mode = props.useStore(value => value.mode)
  const layout = useReadingLayout(surface, mode === 'embody')
  const [showLayout, setShowLayout] = useState(false)
  const layoutToggle = useRef<HTMLButtonElement>(null)
  const [showPeople, setShowPeople] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [showDiscussion, setShowDiscussion] = useState(false)
  const [playPanel, setPlayPanel] = useState<'memory' | 'memory-queue' | 'model' | 'person' | null>(null)
  const [inspectedActor, setInspectedActor] = useState<string | undefined>()
  const text = props.useStore(value => value.drafts[play.request?.instanceId ?? ''] ?? '')
  const actorFacingBeat = props.useStore(value => value.actorFacingBeatDrafts?.[play.request?.instanceId ?? ''] ?? '')
  const inspection = props.useInspection(value => value)
  const choices = play.choices
  const actorId = play.request?.audience.kind === 'actor' ? play.request.audience.actorId : ''
  const panelActorId = playPanel === 'person' ? inspectedActor : actorId || undefined
  const [error, setError] = useState('')
  const [pending, setPending] = useState(0)
  const [completionVersion, setCompletionVersion] = useState(0)
  const [submitting, setSubmitting] = useState<ReadonlySet<InputMode>>(new Set())
  const [submission, setSubmission] = useState<{ instanceId: string; text: string; mode: InputMode; status: 'pending' | 'completed' | 'failed' } | null>(null)
  const sending = useRef(false)
  const composingUntil = useRef(0)
  const busy = pending > 0
  const [checkpointName, setCheckpointName] = useState('')
  const [removing, setRemoving] = useState(false)
  const performanceKey = JSON.stringify([play.request?.instanceId ?? '', actorId])
  const performance = props.useStore(value => value.performances?.[performanceKey] ?? emptyPerformance)
  const view = play.view
  const request = play.request
  const instanceId = request?.instanceId
  const restoredControl = useRef('')
  useEffect(() => {
    if (!instanceId || !view || request.revision !== undefined) return
    const key = `${instanceId}:${view.playerActorId ?? ''}`
    if (restoredControl.current === key) return
    restoredControl.current = key
    if (view.playerActorId) {
      props.actions.mode('embody'); props.select(instanceId, { kind: 'actor', actorId: view.playerActorId })
    }
  }, [instanceId, view?.playerActorId, request?.revision, props.actions, props.select])
  const title = view?.title ?? library.instances.find(item => item.id === instanceId)?.title ?? t('brand')
  const latestRevision = Math.max(view?.revision ?? 0, library.instances.find(item => item.id === instanceId)?.revision ?? 0)
  useLayoutEffect(() => { if (surface.current !== null) surface.current.scrollTop = 0 }, [panel, instanceId])
  useEffect(() => { setError(''); setShowPeople(false); setShowDiscussion(false); setShowTools(false) }, [instanceId])
  const { showLatest, latest, onScroll } = useReadingFollow(surface, reading,
    panel === 'play' && view !== null && request?.revision === undefined ? JSON.stringify([instanceId, request?.audience]) : null)
  const perform = async (operation: () => Promise<void>) => {
    setPending(value => value + 1); setError('')
    try { await operation() } catch (value) { setError(value instanceof Error ? value.message : String(value)) }
    finally { setPending(value => value - 1) }
  }
  const historical = request?.revision !== undefined
  const running = view !== null && ['director-preparing', 'character-responding', 'discussion-running'].includes(view.phase)
  const canSubmit = !submitting.has(mode) && (!(busy || running) || mode === 'intervene' || mode === 'embody')
    && (mode === 'advance' || (mode === 'embody' ? performance.speech.trim() !== '' || performance.action.trim() !== '' : text.trim() !== '')) && (mode !== 'embody' || choices?.entries.some(person => person.actorId === actorId))
    && !(mode === 'embody' && performance.speech.trim() !== '' && performance.delivery !== 'spoken' && performance.target === '')
    && (mode !== 'embody' || [[performance.speech, performance.target], [performance.action, performance.actionTarget]].every(([draft, target]) =>
      !draft?.trim() || !target || view?.people.some(person => person.ref === target)))
  const openAuthor = (tab: 'characters' | 'context' | 'settings' | 'state' | 'style', person?: string) => {
    if (instanceId === undefined) return
    props.actions.authorTab(tab); props.actions.panel('author')
    void perform(() => props.author(instanceId, person))
  }
  return <main ref={surface} className={css.surface} data-panel={panel} onScroll={onScroll}>
    <div className={css.navigationDock}>
      <header className={css.navigation}>
        <button className={css.iconButton} onClick={props.toggleSidebar} aria-label={t('toggle')}><IconPanelLeftOutline16 /></button>
        <div className={css.storyHeading}><strong>{panel === 'books' ? bookTitle ?? t('books') : title}</strong>
          <small>{panel === 'books' ? t(bookTitle === null ? 'bookLibrarySubtitle' : 'bookBaselineSubtitle') : view?.scene.location || t('storySubtitle')}</small></div>
        <nav className={css.headerActions}>
          {(['play', 'author', 'books', 'history'] as const).map(value => <button key={value} aria-pressed={panel === value}
            disabled={value !== 'books' && instanceId === undefined} onClick={() => { if (value === 'books') props.actions.bookLibrary(); else props.actions.panel(value) }}>{t(value)}</button>)}
        </nav>
      </header>
      {panel === 'author' && instanceId !== undefined && <div className={css.returnBar}>
        <button onClick={() => { props.actions.panel('play') }}><span aria-hidden="true">←</span> {t('backToStory')}</button>
      </div>}
      {panel === 'play' && instanceId !== undefined && <nav className={css.runTools} aria-label={t('bookRunTools')}>
        {view !== null && view.people.length > 0 && <button aria-haspopup="dialog" aria-expanded={showPeople}
          onClick={() => { setShowPeople(true) }}>{t('people')}</button>}
        <button aria-haspopup="dialog" aria-expanded={showDiscussion} onClick={() => { setShowDiscussion(true) }}>{t('discussion')}</button>
        {(['characters', 'state', 'style', 'context'] as const).map(tab => <button key={tab} onClick={() => { openAuthor(tab) }}>{t(tab)}</button>)}
        <button onClick={() => { setPlayPanel('model') }}>{t('modelShortcut')}</button>
        <button onClick={() => { setPlayPanel('memory') }}>{t('retention')}</button>
        <button onClick={() => { setPlayPanel('memory-queue') }}>{t('memoryQueueTitle')}</button>
      </nav>}
    </div>
    {error !== '' && panel !== 'play' && <div className={css.failure} role="alert"><strong>{t('operationFailed')}</strong>
      <details><summary>{t('failureDetails')}</summary><p>{error}</p></details>
      <button onClick={() => { setPlayPanel('model') }}>{t('executionModelSettings')}</button>
      <button onClick={() => { setError('') }}>{t('dismiss')}</button></div>}
    {panel === 'books' ? <Books {...props} /> : instanceId === undefined ? <section className={css.opening}>
      <div className={css.openingMark}><NarrativeMark size={48} /></div><span className={css.eyebrow}>{t('libraryEyebrow')}</span><h1>{t('libraryHeadline')}</h1><p>{t('libraryDescription')}</p>
      <div className={css.startChoices}>{library.instances.slice(0, 3).map(instance => <button key={instance.id}
        onClick={() => { props.select(instance.id, { kind: 'observer' }); props.actions.panel('play') }}>
        {instance.title}<small>{t('version', { version: instance.book.version })}</small></button>)}</div>
      <button onClick={() => { props.actions.panel('books') }}>{t('books')}</button>
    </section>
      : panel === 'author' ? <Author key={instanceId} {...props} instanceId={instanceId} />
        : <>
          {play.error !== null && <p role="alert">{play.error}</p>}
          {play.loading && <p role="status">{t('loading')}</p>}
          {view !== null && request !== null && <>
            <div className={css.sceneBar}>
              <span className={css.phase} role="status" data-running={running}>{historical ? t('historical') : t(view.phase)}</span>
              {panel === 'history' && <span>{t('revision', { revision: view.revision })}</span>}
              {panel === 'history' && view.people.length > 0 && <button aria-haspopup="dialog" aria-expanded={showPeople}
                onClick={() => { setShowPeople(true) }}>{t('people')}</button>}
              {historical && <button onClick={() => { props.select(instanceId, request.audience) }}>{t('current')}</button>}
            </div>
            {view.phase === 'failed' && error === '' && <div className={css.failure} role="alert">
              <strong>{t('preparationFailed')}</strong><p>{t('retryHint')}</p>
              {view.failure && <details><summary>{t('failureDetails')}</summary><p>{view.failure}</p></details>}
              <button onClick={() => { setPlayPanel('model') }}>{t('executionModelSettings')}</button>
            </div>}
            {panel === 'history' && <section className={css.card}>
              <label>{t('historyRevision')}<input key={`${instanceId}:${view.revision}`} type="number" min={0} max={latestRevision} defaultValue={view.revision}
                onBlur={(event) => { const revision = event.currentTarget.valueAsNumber
                  if (Number.isSafeInteger(revision) && revision >= 0 && revision <= latestRevision && revision !== view.revision)
                    void perform(() => props.history(instanceId, request.audience, revision))
                }} /></label>
              <button onClick={() => { void perform(() => props.author(instanceId)) }}>{t('refresh')}</button>
              <label>{t('checkpointName')}<input value={checkpointName} onChange={(event) => { setCheckpointName(event.target.value) }} /></label>
              <button disabled={busy || historical || checkpointName.trim() === ''} onClick={() => { void perform(() => props.checkpoint(instanceId, view.revision, checkpointName)) }}>{t('checkpoint')}</button>
              {inspection.request?.instanceId === instanceId && inspection.checkpoints.map(item => <div key={item.name}>
                <button onClick={() => { void perform(() => props.history(
                  instanceId, request.audience, item.revision)) }}>{item.name}</button>
                <button disabled={busy || historical} onClick={() => { void perform(() => props.restore(instanceId, view.revision, item.revision)) }}>{t('restore')}</button>
              </div>)}
              <button disabled={busy || historical} onClick={() => { void perform(() => props.restart(instanceId)) }}>{t('restart')}</button>
              <button disabled={busy || historical} onClick={() => { setRemoving(true) }}>{t('removeInstance')}</button>
              {removing && <section><p>{t('removeInstanceHint')}</p><button disabled={busy} onClick={() => { void perform(async () => {
                await props.removeInstance(instanceId, view.revision); setRemoving(false); props.actions.panel('books')
              }) }}>{t('confirmRemove')}</button><button onClick={() => { setRemoving(false) }}>{t('cancel')}</button></section>}

              <button disabled={busy || historical} onClick={() => { void perform(async () => {
                const archive = await props.exportArchive(instanceId, view.revision)
                const url = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' }))
                const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${instanceId}.json`; anchor.click()
                setTimeout(() => { URL.revokeObjectURL(url) }, 0)
              }) }}>{t('export')}</button>
            </section>}
            <div className={css.reading}>
              {(['left', 'right'] as const).map(side => <div key={side} className={css.widthRail} data-side={side}>
                <ResizeGrip axis={side} value={layout.width} min={layout.minWidth} max={layout.maxWidth}
                  label={t(side === 'left' ? 'resizeReplyLeft' : 'resizeReplyRight')} resize={layout.resizeWidth} cancel={layout.cancelWidth} reset={layout.reset} />
              </div>)}
              <div ref={reading} className={css.readingColumn}>
                {view.total === 0 ? <section className={css.opening}>
                  <div className={css.openingMark}><NarrativeMark size={48} /></div>
                  <small>{t('openingLabel')}</small><h1>{title}</h1>
                  {view.premise && <p>{view.premise}</p>}
                  <p className={css.metadata}>{t(running ? 'openingRunning' : 'openingHint')}</p>
                </section> : <Transcript key={`${instanceId}:${request.audience.kind}:${actorId}`} {...props} view={view}
                  completionVersion={completionVersion} />}
                {view.total === 0 && (view.discussionPreparations?.length ?? 0) > 0 && <Transcript {...props} view={view}
                  completionVersion={completionVersion} />}
                {!historical && view.discussion?.preparation === undefined && running && (view.activeActorId !== undefined || view.phase === 'director-preparing') && <div className={css.liveTurn}>
                  <LiveExecution {...props} autoStart reading instanceId={instanceId}
                    narrationDraft={view.narrationDraft}
                    acceptedRevision={Math.max(-1, ...view.rows.filter(row => row.speaker?.actorId === view.activeActorId
                      && row.origin !== 'player').map(row => row.revision))}
                    title={view.activeActorId === undefined ? t('director') : view.people.find(person => person.actorId === view.activeActorId)?.trueName ?? t('actor')}
                    person={view.people.find(person => person.actorId === view.activeActorId)}
                    {...view.activeActorId === undefined ? {} : { actorId: view.activeActorId }} />
                </div>}
                {!running && view.narrationDraft !== undefined && <section className={css.prose}>
                  <ExecutionDraft t={t} draft={view.narrationDraft} />
                </section>}
              </div>
            </div>
            {view.total > request.limit && <div className={`${css.toolbar} ${css.pagination}`}>
              <button disabled={request.offset === 0} onClick={() => { const offset = Math.max(0, request.offset - request.limit)
                if (historical) void perform(() => props.history(instanceId, request.audience, view.revision, offset))
                else props.select(instanceId, request.audience, offset)
              }}>{t('previous')}</button>
              <button disabled={request.offset + request.limit >= view.total} onClick={() => {
                if (historical) void perform(() => props.history(instanceId, request.audience, view.revision,
                  request.offset + request.limit))
                else props.select(instanceId, request.audience, request.offset + request.limit)
              }}>{t('next')}</button>
            </div>}
            {showLatest && <button className={css.latest} aria-label={t('latestStory')} title={t('latestStory')}
              onClick={latest}>↓</button>}
            {!historical && panel === 'play' && <form className={css.composer} aria-label={t('input')} onSubmit={(event) => {
              event.preventDefault()
              if (!canSubmit || sending.current) return
              sending.current = true
              const submitted = { instanceId, text, mode }
              const submittedActorFacingBeat = mode === 'advance' ? actorFacingBeat : ''
              setSubmission({ ...submitted, status: 'pending' })
              setSubmitting(value => new Set([...value, mode]))
              void perform(async () => { try {
                await props.submit(instanceId, view.revision, mode, text, actorId, performance, submittedActorFacingBeat)
                if (mode === 'embody') props.actions.performanceAccepted(performanceKey, performance)
                else props.actions.accepted(instanceId, text)
                if (mode === 'advance') props.actions.actorFacingBeatAccepted(instanceId, submittedActorFacingBeat)
                setSubmission({ ...submitted, status: 'completed' })
              } catch (value) {
                setSubmission({ ...submitted, status: 'failed' }); throw value
              } finally {
                setCompletionVersion(value => value + 1)
                sending.current = false
                setSubmitting((value) => { const next = new Set(value); next.delete(mode); return next })
              }
              })
            }}>
              <ResizeGrip axis="top" value={layout.height} min={layout.minHeight} max={layout.maxHeight}
                label={t('resizeComposer')} resize={layout.resizeHeight} cancel={layout.cancelHeight} reset={layout.reset} />
              {(view.discussionRequests?.length ?? 0) > 0 && <div className={css.discussionStatus}>
                <button type="button" aria-haspopup="dialog" aria-expanded={showDiscussion} onClick={() => { setShowDiscussion(true) }}>
                  {t('discussionRequests', { count: view.discussionRequests?.length ?? 0 })}
                </button>
              </div>}
              {view.discussion !== undefined && <div className={css.discussionStatus}>
                <button type="button" aria-haspopup="dialog" aria-expanded={showDiscussion} onClick={() => { setShowDiscussion(true) }}>
                  <span className={css.readyDot} data-ready={running} /><strong>{t('discussion')}</strong><span>{view.discussion.topic}</span>
                  <small><DiscussionBudget discussion={view.discussion} t={t} /></small>
                </button>
                <button type="button" onClick={() => { setShowDiscussion(true) }}>{t('discussionControls')}</button>
              </div>}
              <div className={css.composerBody}>
                {submission?.instanceId === instanceId && submission.status !== 'completed'
                && <div className={css.submission} role="status" data-status={submission.status}>
                  <div><strong>{t(submission.mode)}</strong><span>{t(`submission-${submission.status}`)}</span></div>
                </div>}
                {error !== '' && <div className={css.inputError} role="alert"><strong>{t('operationFailed')}</strong>
                  <details><summary>{t('failureDetails')}</summary><p>{error}</p></details>
                  <button type="button" onClick={() => { setPlayPanel('model') }}>{t('executionModelSettings')}</button>
                  <button type="button" onClick={() => { setError('') }}>{t('dismiss')}</button>
                </div>}
                <div className={css.composerModes}><select className={css.modeSelect} aria-label={t('inputMode')} value={mode} onChange={(event) => {
                  const value = event.target.value as InputMode; props.actions.mode(value)
                  if (value !== 'embody' && request.audience.kind !== 'observer') props.select(instanceId, { kind: 'observer' })
                }}>{(['advance', 'guide', 'intervene', 'embody'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</select>
                <div className={css.modeBar} role="group" aria-label={t('inputMode')}>{(['advance', 'guide', 'intervene', 'embody'] as const).map((value: InputMode) => <button
                  type="button" key={value} aria-pressed={mode === value} onClick={() => { props.actions.mode(value)
                    if (value !== 'embody' && request.audience.kind !== 'observer') props.select(instanceId, { kind: 'observer' })
                  }}><span aria-hidden="true">{value === 'advance' ? <IconPlayOutline16 /> : value === 'guide' ? <IconEditOutline16 />
                    : value === 'intervene' ? <IconGlobeOutline14 size={16} /> : <IconUserOutline16 />}</span>{t(value)}</button>)}</div>
                <button ref={layoutToggle} className={css.layoutToggle} type="button" aria-expanded={showLayout} onClick={() => { setShowLayout(!showLayout) }}>{t('readingLayout')}</button></div>
                {showLayout && <section className={css.layoutPanel} aria-label={t('readingLayout')}
                  onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setShowLayout(false); layoutToggle.current?.focus() } }}>
                  <label>{t('readingWidth')}<span><input type="range" min={layout.minWidth} max={layout.maxWidth} step={1} value={layout.width}
                    onChange={(event) => { layout.resizeWidth(event.currentTarget.valueAsNumber) }} /><output>{t('sizePixels', { value: layout.width })}</output></span></label>
                  <label>{t('composerHeight')}<span><input type="range" min={layout.minHeight} max={layout.maxHeight} step={1} value={layout.height}
                    onChange={(event) => { layout.resizeHeight(event.currentTarget.valueAsNumber) }} /><output>{t('sizePixels', { value: layout.height })}</output></span></label>
                  <button type="button" onClick={layout.reset}>{t('resetLayout')}</button>
                </section>}
                <p id={inputHelpId} className={css.modeDescription}>{t(`mode-${mode}`)}</p>
                <div className={css.toolbar}>
                  <label>{t('playerCharacter')}<select aria-label={t('playerCharacter')} value={view.playerActorId ?? ''} disabled={busy || choices === null}
                    onChange={(event) => { const selected = event.target.value || null
                      void perform(async () => {
                        await props.controlPlayer(instanceId, view.revision, selected)
                        props.actions.mode(selected === null ? 'advance' : 'embody')
                        props.select(instanceId, selected === null ? { kind: 'observer' } : { kind: 'actor', actorId: selected })
                      })
                    }}><option value="">{t(choices === null ? 'loading' : 'playerObserver')}</option>
                    {view.playerActorId && !choices?.controlEntries.some(person => person.actorId === view.playerActorId)
                      && <option value={view.playerActorId}>{view.playerActorId}</option>}
                    {choices?.controlEntries.map(person => <option key={person.actorId} value={person.actorId}>
                      {personLabelText(person)}{person.inScene ? '' : ` · ${t('playerOffScene')}`}</option>)}
                  </select></label>
                  {view.playerActorId && <button type="button" disabled={busy || submitting.has('embody')} onClick={() => { void perform(async () => {
                    await props.controlPlayer(instanceId, view.revision, null)
                    props.actions.mode('advance'); props.select(instanceId, { kind: 'observer' })
                  }) }}>{t('releaseToAI')}</button>}
                  <small>{t(view.playerActorId ? 'playerControlHint' : 'aiControlHint')}</small>
                </div>
                {choices !== null && choices.controlEntries.length === 0 && <p className={css.metadata}>{t('playerNoCharacters')}</p>}
                {choices !== null && mode === 'embody' && actorId !== '' && !choices.entries.some(person => person.actorId === actorId)
                  && <p className={css.metadata} role="status">{t('playerOffSceneHint')}</p>}
                {view.playerTurn && <div className={css.toolbar} role="status">
                  <strong>{t('playerFloor')}</strong>
                  <button type="button" onClick={() => { if (view.playerActorId) {
                    props.actions.mode('embody'); props.select(instanceId, { kind: 'actor', actorId: view.playerActorId })
                  } }}>{t('playerRespond')}</button>
                  <button type="button" disabled={busy} onClick={() => { void perform(() => props.passPlayer(instanceId, view.revision)) }}>{t('playerPass')}</button>
                </div>}
                {view.discussion?.status === 'active' && !view.playerTurn && !running && <button type="button" disabled={busy}
                  onClick={() => { void perform(() => props.advanceDiscussion(instanceId, view.revision)) }}>{t('advanceDiscussion')}</button>}
                {mode === 'embody' && <label>{t('actor')}<select aria-label={t('actor')} value={actorId} onChange={(event) => {
                  const id = event.target.value
                  props.select(instanceId, id === '' ? { kind: 'observer' } : { kind: 'actor', actorId: id })
                }}><option value="">{t('actor')}</option>
                  {actorId !== '' && !choices?.entries.some(person => person.actorId === actorId)
                    && <option value={actorId}>
                      {personLabelText(choices?.controlEntries.find(person => person.actorId === actorId) ?? { label: actorId })}
                      {` · ${t('playerOffScene')}`}</option>}
                  {choices?.entries.map(person => <option key={person.actorId} value={person.actorId}>{personLabelText(person)}</option>)}
                </select></label>}
                {mode === 'embody' && <PlayerPerformanceFields value={performance} people={view.people} t={t}
                  change={(value) => { props.actions.performance(performanceKey, value) }} />}
                {mode !== 'embody' && <label className={css.composerField}><span>{t(`compose-${mode}`)}</span>
                  <textarea aria-label={t('input')} aria-describedby={inputHelpId} placeholder={t(`placeholder-${mode}`)} value={text}
                    onCompositionStart={() => { composingUntil.current = Infinity }}
                    onCompositionEnd={() => { composingUntil.current = Date.now() + 10 }}
                    onKeyDown={(event) => {
                      // Match the native composer: Safari can report the IME-closing Enter after compositionend.
                      const ime = event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
                      const composing = ime || Date.now() < composingUntil.current
                      if (event.key === 'Enter' && !event.shiftKey && !composing) {
                        event.preventDefault(); if (!event.repeat) event.currentTarget.form?.requestSubmit()
                      }
                    }} onChange={(event) => { props.actions.draft(instanceId, event.target.value) }} /></label>}
                {mode === 'advance' && <ActorFacingBeatField key={instanceId} t={t} value={actorFacingBeat}
                  change={(value) => { props.actions.actorFacingBeat(instanceId, value) }} />}
              </div>
              <div className={css.composerFooter}>
                <button type="button" aria-label={t('advancedActions')} aria-expanded={showTools} onClick={() => { setShowTools(!showTools) }}><IconEllipsisOutline16 />{t('advancedActions')}</button>
                <span className={css.composerSpacer} />
                <div className={css.composerModel}>{props.renderSlot('model.selection.control', {
                  locked: modelSettings.loading || modelSettings.view?.writable === false,
                  current: modelSettings.view?.selection ?? null,
                  error: modelSettings.error,
                  selecting: modelSettings.loading,
                  select: async (selection) => {
                    const revision = modelSettings.view?.revision
                    if (revision === undefined) { await props.executionModel(); return false }
                    try { await props.selectExecutionModel(revision, selection); return true } catch { return false }
                  },
                })}</div>
                <button className={css.send} type="submit" disabled={!canSubmit}>
                  <IconSendOutline16 />
                  {t(submitting.has(mode) ? 'submitting' : view.phase === 'failed' && mode === 'advance' ? 'retry'
                    : mode === 'advance' && text === '' ? 'composerContinue' : 'send')}
                </button>
                {running && <button type="button" onClick={() => { void perform(() => props.pause(instanceId, view.revision)) }}><IconStopFill16 />{t('pause')}</button>}
              </div>
              <small className={css.keyboardHint}>{t(running ? 'runningInputHint' : 'keyboardHint')}</small>
              <StoryUsage {...props} instanceId={instanceId} revision={latestRevision} running={running} />
            </form>}
            {showTools && !historical && panel === 'play' && <Modal open onClose={() => { setShowTools(false) }}
              title={t('advancedActions')} closeLabel={t('closePanel')} className={`${css.nativeDialog} ${css.inspector}`} contentClassName={`${css.dialogScroll}`}>
              <div className={`${css.surface} ${css.dialogContent} ${css.toolMenu}`}>
                <p className={css.metadata}>{t('discussionAdvancedHint')}</p>
                <button onClick={() => { setShowTools(false); setShowDiscussion(true) }}>{t('discussion')}</button>
                <button onClick={() => { setShowTools(false); openAuthor('characters') }}>{t('characters')}</button>
              </div>
            </Modal>}
            {showDiscussion && !historical && panel === 'play' && <Modal open onClose={() => { setShowDiscussion(false) }}
              title={t('discussion')} closeLabel={t('closePanel')} className={`${css.nativeDialog} ${css.inspector}`} contentClassName={`${css.dialogScroll}`}>
              <div className={`${css.surface} ${css.dialogContent}`}><p className={css.metadata}>{t('discussionControlHint')}</p>
                <Discussion {...props} view={view} peopleChoices={choices} running={running} openByDefault />
              </div>
            </Modal>}
          </>}
        </>}
    {showPeople && view !== null && <Modal open onClose={() => { setShowPeople(false) }} title={t('people')}
      closeLabel={t('closePanel')} className={`${css.nativeDialog}`} contentClassName={`${css.dialogScroll}`}>
      <div className={`${css.surface} ${css.dialogContent}`}>
        <small>{t('playerNameHint')}</small>
        {view.people.map(person => <div className={css.personEntry} key={person.ref}>
          <PersonLabel person={person} />
          <button onClick={() => { setShowPeople(false); setInspectedActor(person.actorId); setPlayPanel('person') }}>{t('viewCognition')}</button>
        </div>)}
      </div>
    </Modal>}
    {playPanel !== null && instanceId !== undefined && <PlayPanel key={`${instanceId}:${playPanel}`} {...props}
      kind={playPanel} instanceId={instanceId} {...panelActorId === undefined ? {} : { actorId: panelActorId }}
      close={() => { setPlayPanel(null) }}
      editPerson={(id) => { setPlayPanel(null); openAuthor('characters', id) }} />}
  </main>
}
