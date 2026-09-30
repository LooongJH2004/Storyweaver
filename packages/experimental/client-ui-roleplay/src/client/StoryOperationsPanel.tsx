/** Player-facing world settlement, memory, discussion, context, and Story Package workspace. */

import type {
  IStories,
  StoryContextPreviewValue,
  StoryContextRecipeSection,
  StoryContextSection,
  StoryView,
  WorldPatchOperation,
} from '@deepseek-ai/dsh-api-story-controller/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { storyOwnsSession } from './RoleplayChrome.tsx'
import { NS } from './locales.ts'
import css from './RoleplayChrome.module.css'
import { WorkspaceCloseButton, WorkspaceDialog } from './WorkspaceDialog.tsx'

type PanelProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS>
type Tab = 'authority' | 'world' | 'discussion' | 'package'
type AuthorityKind = 'direction' | 'intervene' | 'speak' | 'act'

/** Bind all path-free roleplay operations to one accessible workspace. */
export function storyOperationsPanel(commands: IStories) {
  return function StoryOperationsPanel({ sessionId, useStories, t }: PanelProps) {
    const story = useStories?.(snapshot => snapshot.items.find(item => storyOwnsSession(item, sessionId)))
    const [open, setOpen] = useState(false)
    const [tab, setTab] = useState<Tab>('world')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const importRef = useRef<HTMLInputElement>(null)

    const close = useCallback((): void => {
      setOpen(false)
      triggerRef.current?.focus()
    }, [])

    useEffect(() => {
      setOpen(false)
      setTab('world')
      setError(null)
      setStatus(null)
    }, [story?.storyId])

    const run = async (operation: () => Promise<unknown>): Promise<void> => {
      if (busy) return
      setBusy(true)
      setError(null)
      setStatus(null)
      try {
        await operation()
        setStatus(t('operations.saved'))
      } catch (reason: unknown) {
        setError(t('operations.error', { value: message(reason) }))
      } finally {
        setBusy(false)
      }
    }

    return (
      <div className={css.outlinePanelRoot}>
        <button
          ref={triggerRef}
          type="button"
          className={`${css.characterPanelTrigger} ${css.operationsTrigger}`}
          aria-expanded={open}
          aria-label={t('operations.open')}
          disabled={story === undefined}
          onClick={() => { if (open) close(); else setOpen(true) }}
        >
          <span>{t('operations.title')}</span>
          {story !== undefined && <span className={css.characterCount}>{story.world.revision}</span>}
        </button>
        {open && story !== undefined && (
          <WorkspaceDialog
            className={`${css.outlinePanel} ${css.operationsPanel}`}
            label={t('operations.title')}
            storageKey="story-operations"
            defaultSize={{ width: 980, height: 860 }}
            resizeLabels={{
              top: t('workspace.resizeTop'), right: t('workspace.resizeRight'),
              bottom: t('workspace.resizeBottom'), left: t('workspace.resizeLeft'),
            }}
            returnFocusRef={triggerRef}
            onClose={close}
          >
            <header className={css.characterPanelHeader}>
              <div>
                <strong>{t('operations.title')}</strong>
                <p>{t('operations.subtitle')}</p>
              </div>
              <WorkspaceCloseButton label={t('workspace.close')} onClick={close} />
            </header>
            <WorldRuntimeSummary story={story} t={t} />
            <div className={css.operationsTabs} role="tablist" aria-label={t('operations.title')}>
              {(['authority', 'world', 'discussion', 'package'] as const).map(item => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={tab === item}
                  aria-controls={`roleplay-operations-${item}`}
                  onClick={() => { setTab(item); setError(null); setStatus(null) }}
                >{t(`operations.tab.${item}`)}</button>
              ))}
            </div>
            <div className={`${css.workspaceBody} ${css.operationsBody}`}>
              <section id={`roleplay-operations-${tab}`} role="tabpanel">
                {tab === 'authority' && <AuthorityTab story={story} commands={commands} busy={busy} run={run} t={t} />}
                {tab === 'world' && <WorldTab story={story} commands={commands} busy={busy} run={run} t={t} />}
                {tab === 'discussion' && <DiscussionTab story={story} commands={commands} busy={busy} run={run} t={t} />}
                {tab === 'package' && (
                  <PackageTab
                    story={story}
                    commands={commands}
                    busy={busy}
                    run={run}
                    importRef={importRef}
                    t={t}
                  />
                )}
              </section>
              {busy && <p className={css.operationsStatus} role="status">{t('operations.loading')}</p>}
              {status !== null && <p className={css.operationsStatus} role="status">{status}</p>}
              {error !== null && <p className={css.characterError} role="alert">{error}</p>}
            </div>
          </WorkspaceDialog>
        )}
      </div>
    )
  }
}

type Translate = PanelProps['t']
interface TabProps {
  readonly story: StoryView
  readonly commands: IStories
  readonly busy: boolean
  readonly run: (operation: () => Promise<unknown>) => Promise<void>
  readonly t: Translate
}

function WorldRuntimeSummary({ story, t }: Pick<TabProps, 'story' | 't'>) {
  const run = story.plotLedger.directorRun
  const discussion = story.discussions.discussions.find(item => (
    item.status === 'active' || item.status === 'awaiting-player' || item.status === 'summarizing'
  ))
  const pendingEvents = story.plotLedger.pendingNpcEvents.length
  const pendingMemories = story.memory.entries.filter(entry => entry.status === 'proposed').length
  return (
    <section className={css.worldRuntimeSummary} aria-label={t('operations.runtime.title')}>
      <div><span>{t('operations.runtime.system')}</span><strong>{runtimeLabel(run?.status, discussion?.status, t)}</strong></div>
      <div><span>{t('operations.runtime.discussion')}</span><strong>{discussion === undefined ? t('operations.runtime.none') : discussion.topic}</strong></div>
      <div><span>{t('operations.runtime.pending')}</span><strong>{t('operations.runtime.pendingValue', { events: pendingEvents, memories: pendingMemories })}</strong></div>
      <div><span>{t('operations.runtime.intervention')}</span><strong>{discussion?.playerIntervention === undefined ? t('operations.runtime.available') : t(`operations.discussion.intervention.${discussion.playerIntervention}`)}</strong></div>
    </section>
  )
}

function runtimeLabel(
  run: NonNullable<StoryView['plotLedger']['directorRun']>['status'] | undefined,
  discussion: 'active' | 'awaiting-player' | 'summarizing' | 'completed' | 'cancelled' | undefined,
  t: Translate,
): string {
  if (discussion === 'active') return t('operations.runtime.discussing')
  if (discussion === 'awaiting-player') return t('operations.runtime.waitingPlayer')
  if (discussion === 'summarizing') return t('operations.runtime.summarizing')
  if (run === 'dispatching') return t('operations.runtime.dispatching')
  if (run === 'brief_committed') return t('operations.runtime.planning')
  if (run === 'paused' || run === 'awaiting_retry') return t('operations.runtime.paused')
  return t('operations.runtime.idle')
}

function AuthorityTab({ story, commands, busy, run, t }: TabProps) {
  const [kind, setKind] = useState<AuthorityKind>('direction')
  const [actorId, setActorId] = useState(story.actors[0]?.actorId ?? '')
  const [content, setContent] = useState('')
  const [patchSource, setPatchSource] = useState('[]')

  useEffect(() => {
    if (!story.actors.some(actor => actor.actorId === actorId)) setActorId(story.actors[0]?.actorId ?? '')
  }, [actorId, story.actors])

  const submit = (): void => {
    void run(async () => {
      const text = required(content, t('operations.authority.content'))
      const patch = parsePatch(patchSource)
      switch (kind) {
        case 'direction':
          await commands.chooseDirection(story.storyId, {
            expectedWorldRevision: story.world.revision, direction: text, audience: [],
          })
          break
        case 'intervene':
          await commands.interveneWorld(story.storyId, {
            expectedWorldRevision: story.world.revision, summary: text, patch, audience: [],
          })
          break
        case 'speak':
          await commands.speakAs(story.storyId, {
            expectedWorldRevision: story.world.revision,
            actorId: required(actorId, t('operations.authority.actor')),
            text,
            delivery: 'spoken',
            audience: [],
          })
          break
        case 'act':
          await commands.actAs(story.storyId, {
            expectedWorldRevision: story.world.revision,
            actorId: required(actorId, t('operations.authority.actor')),
            description: text,
            patch,
            audience: [],
          })
          break
      }
      setContent('')
    })
  }

  return (
    <details className={css.operationsAdvanced}>
      <summary>{t('operations.advanced.authority')}</summary>
      <div className={css.operationsForm}>
        <label htmlFor="authority-kind">{t('operations.authority.kind')}</label>
        <select id="authority-kind" value={kind} onChange={(event) => { setKind(event.target.value as AuthorityKind) }}>
          <option value="direction">{t('operations.authority.direction')}</option>
          <option value="intervene">{t('operations.authority.intervene')}</option>
          <option value="speak">{t('operations.authority.speak')}</option>
          <option value="act">{t('operations.authority.act')}</option>
        </select>
        {(kind === 'speak' || kind === 'act') && (
          <>
            <label htmlFor="authority-actor">{t('operations.authority.actor')}</label>
            <select id="authority-actor" value={actorId} onChange={(event) => { setActorId(event.target.value) }}>
              {story.actors.map(actor => <option key={actor.actorId} value={actor.actorId}>{actor.actorId}</option>)}
            </select>
          </>
        )}
        <label htmlFor="authority-content">{t('operations.authority.content')}</label>
        <textarea id="authority-content" value={content} onChange={(event) => { setContent(event.target.value) }} />
        {(kind === 'intervene' || kind === 'act') && (
          <>
            <label htmlFor="authority-patch">{t('operations.authority.patch')}</label>
            <textarea id="authority-patch" className={css.operationsCodeInput} value={patchSource} onChange={(event) => { setPatchSource(event.target.value) }} />
            <p className={css.operationsHint}>{t('operations.authority.patchHint')}</p>
          </>
        )}
        <button type="button" className={css.operationsPrimary} disabled={busy} onClick={submit}>
          {t('operations.authority.submit')}
        </button>
      </div>
    </details>
  )
}

function WorldTab({ story, commands, busy, run, t }: TabProps) {
  const [viewer, setViewer] = useState('')
  const matters = viewer === '' ? story.matters.public : story.matters.actors[viewer] ?? []
  const settled = new Set(story.world.events.flatMap(event => event.sourceEventRef === undefined ? [] : [event.sourceEventRef]))
  const all = [...story.plotLedger.pendingNpcEvents, ...(story.plotLedger.latestBrief?.sourceNpcEvents ?? [])]
  const pending = [...new Map(all.map(event => [`${event.sessionId}:${String(event.actorEventSeq)}`, event])).entries()]
    .filter(([ref]) => !settled.has(ref))
  const settle = (ref: string, accepted: boolean, summary: string, audience: readonly string[]): void => {
    void run(() => commands.settleActorWorldEvent(story.storyId, {
      expectedWorldRevision: story.world.revision,
      sourceEventRef: ref,
      accepted,
      summary,
      audience,
      patch: [],
    }))
  }
  return (
    <div className={css.operationsGrid}>
      <article className={css.operationsCard}>
        <h3>{t('operations.world.facts')}</h3>
        <span>{t('operations.revision', { value: story.world.revision })}</span>
        <pre>{JSON.stringify(story.world.facts, undefined, 2)}</pre>
      </article>
      <article className={`${css.operationsCard} ${css.operationsWide}`}>
        <h3>{t('operations.matters.title')}</h3>
        <select aria-label={t('operations.matters.title')} value={viewer} onChange={(event) => { setViewer(event.target.value) }}>
          <option value="">{t('operations.memory.directorSummary')}</option>
          {story.actors.map(actor => <option key={actor.actorId} value={actor.actorId}>{actor.actorId}</option>)}
        </select>
        {matters.length === 0 && <p>{t('operations.matters.empty')}</p>}
        {matters.map(item => <div key={item.id} className={css.operationsListItem}>
          <strong>{t(`operations.matters.${item.kind}`)} · {item.actorId} · {t(`operations.matters.${item.status}`)}</strong>
          <p>{item.text}</p>
          <details><summary>{t('operations.matters.sources')}</summary>{item.sourceEventIds.map(id => <p key={id}>{story.world.events.find(event => event.id === id)?.summary}</p>)}</details>
        </div>)}
      </article>
      <article className={css.operationsCard}>
        <h3>{t('operations.world.pending')}</h3>
        {pending.length === 0 && <p>{t('operations.empty')}</p>}
        {pending.map(([ref, event]) => {
          const summary = event.kind === 'speech' ? `${event.actorId}: ${event.text}` : `${event.actorId}: ${event.description}`
          const audience = event.kind === 'speech' ? event.audience : []
          return (
            <div key={ref} className={css.operationsListItem}>
              <strong>{summary}</strong>
              <code>{ref}</code>
              <div>
                <button type="button" disabled={busy} onClick={() => { settle(ref, true, summary, audience) }}>{t('operations.world.accept')}</button>
                <button type="button" disabled={busy} onClick={() => { settle(ref, false, summary, []) }}>{t('operations.world.reject')}</button>
              </div>
            </div>
          )
        })}
      </article>
      <article className={`${css.operationsCard} ${css.operationsWide}`}>
        <h3>{t('operations.world.events')}</h3>
        {story.world.events.length === 0 && <p>{t('operations.empty')}</p>}
        {story.world.events.slice(-20).toReversed().map(event => (
          <div key={event.id} className={css.operationsListItem}>
            <strong>{event.summary}</strong>
            <span>{t('operations.world.eventMeta', {
              status: event.status,
              revision: event.revision,
              audience: event.audience.join(', ') || t('operations.runtime.none'),
            })}</span>
          </div>
        ))}
      </article>
    </div>
  )
}

function DiscussionTab({ story, commands, busy, run, t }: TabProps) {
  const [topic, setTopic] = useState('')
  const [rounds, setRounds] = useState(3)
  const [participants, setParticipants] = useState<readonly string[]>(story.actors.map(actor => actor.actorId))
  const active = story.discussions.discussions.find(item => (
    item.status === 'active' || item.status === 'awaiting-player' || item.status === 'summarizing'
  ))
  useEffect(() => {
    setParticipants(current => current.filter(id => story.actors.some(actor => actor.actorId === id)))
  }, [story.actors])
  return (
    <div className={css.operationsGrid}>
      <article className={`${css.operationsCard} ${css.operationsWide}`}>
        {active === undefined ? <p>{t('operations.empty')}</p> : (
          <>
            <h3>{active.topic}</h3>
            <span>{active.initiatedBy === 'player' ? t('operations.discussion.manual') : t('operations.discussion.automatic')}</span>
            <p>{t('operations.discussion.current', { value: active.currentSpeakerId ?? active.status })}</p>
            <p>{t('operations.discussion.progress', { round: active.round, max: active.maxRounds })}</p>
            {active.playerIntervention !== undefined && (
              <p className={css.operationsStatus} role="status">{t(`operations.discussion.intervention.${active.playerIntervention}`)}</p>
            )}
            {active.turns.map(turn => (
              <div key={turn.id} className={css.operationsListItem}>
                <strong>{turn.speakerId}</strong><p>{turn.text}</p>
              </div>
            ))}
            <div className={css.operationsButtonRow}>
              <button type="button" disabled={busy || active.status !== 'active' || active.playerIntervention !== undefined} onClick={() => {
                void run(() => commands.requestDiscussionIntervention(
                  story.storyId, story.discussions.revision, active.id, 'speak',
                ))
              }}>{t('operations.discussion.playerSpeak')}</button>
              <button type="button" disabled={busy || active.status !== 'active' || active.playerIntervention !== undefined} onClick={() => {
                void run(() => commands.requestDiscussionIntervention(
                  story.storyId, story.discussions.revision, active.id, 'conclude',
                ))
              }}>{t('operations.discussion.askConclude')}</button>
              {active.playerIntervention !== undefined && (
                <button type="button" disabled={busy} onClick={() => {
                  void run(() => commands.clearDiscussionIntervention(
                    story.storyId, story.discussions.revision, active.id,
                  ))
                }}>{t('operations.discussion.resume')}</button>
              )}
              <button type="button" disabled={busy} onClick={() => {
                void run(() => commands.closeDiscussion(
                  story.storyId, story.discussions.revision, active.id, 'cancelled',
                ))
              }}>{t('operations.discussion.interrupt')}</button>
            </div>
            <details className={css.operationsAdvanced}>
              <summary>{t('operations.advanced.discussionFloor')}</summary>
              <div className={css.operationsButtonRow}>
                {active.participantIds.filter(id => id !== active.currentSpeakerId).map(actorId => (
                  <button key={actorId} type="button" disabled={busy || active.status !== 'active'} onClick={() => {
                    void run(() => commands.requestDiscussionFloor(
                      story.storyId, story.discussions.revision, active.id, actorId,
                    ))
                  }}>{t('operations.discussion.floor')} · {actorId}</button>
                ))}
                <button type="button" disabled={busy} onClick={() => {
                  void run(() => commands.closeDiscussion(
                    story.storyId, story.discussions.revision, active.id, 'completed',
                  ))
                }}>{t('operations.discussion.complete')}</button>
              </div>
            </details>
          </>
        )}
      </article>
      <details className={`${css.operationsAdvanced} ${css.operationsWide}`}>
        <summary>{t('operations.advanced.manualDiscussion')}</summary>
        <div className={css.operationsForm}>
          <p className={css.operationsHint}>{t('operations.discussion.manualHint')}</p>
          <label htmlFor="discussion-topic">{t('operations.discussion.topic')}</label>
          <textarea id="discussion-topic" value={topic} onChange={(event) => { setTopic(event.target.value) }} disabled={active !== undefined} />
          <label htmlFor="discussion-rounds">{t('operations.discussion.rounds')}</label>
          <input id="discussion-rounds" type="number" min={1} max={20} value={rounds} disabled={active !== undefined} onChange={(event) => { setRounds(Number(event.target.value)) }} />
          <fieldset disabled={active !== undefined}>
            <legend>{t('operations.discussion.participants')}</legend>
            {story.actors.map(actor => (
              <label key={actor.actorId}>
                <input type="checkbox" checked={participants.includes(actor.actorId)} onChange={(event) => {
                  setParticipants(event.target.checked
                    ? [...participants, actor.actorId]
                    : participants.filter(id => id !== actor.actorId))
                }} /> {actor.actorId}
              </label>
            ))}
          </fieldset>
          <button type="button" className={css.operationsPrimary} disabled={busy || active !== undefined} onClick={() => {
            void run(() => commands.startDiscussion(
              story.storyId,
              story.discussions.revision,
              required(topic, t('operations.discussion.topic')),
              participants,
              rounds,
            ))
          }}>{t('operations.discussion.start')}</button>
        </div>
      </details>
    </div>
  )
}

/** @deprecated Context construction now lives in the unified ContextBuilderPanel. */
export function ContextTab({ story, commands, busy, run, t }: TabProps) {
  const [director, setDirector] = useState(() => [...story.contextRecipe.director])
  const [actor, setActor] = useState(() => [...story.contextRecipe.actor])
  const [audience, setAudience] = useState<'director' | 'actor'>('director')
  const [actorId, setActorId] = useState(() => story.actors[0]?.actorId ?? '')
  const [preview, setPreview] = useState<StoryContextPreviewValue | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  useEffect(() => {
    setDirector([...story.contextRecipe.director])
    setActor([...story.contextRecipe.actor])
  }, [story.contextRecipe])
  useEffect(() => {
    setActorId(story.actors[0]?.actorId ?? '')
    setPreview(null)
  }, [story.storyId, story.actors])
  const loadPreview = useCallback(async (): Promise<void> => {
    if (audience === 'actor' && actorId === '') return
    setPreviewBusy(true)
    setPreviewError(null)
    try {
      setPreview(await commands.contextPreview(
        story.storyId,
        audience,
        audience === 'actor' ? actorId : undefined,
      ))
    } catch (reason: unknown) {
      setPreviewError(message(reason))
    } finally {
      setPreviewBusy(false)
    }
  }, [actorId, audience, commands, story.storyId])
  useEffect(() => { void loadPreview() }, [loadPreview, story.contextRecipe.revision])
  const restoreDraft = (): void => {
    setDirector([...story.contextRecipe.director])
    setActor([...story.contextRecipe.actor])
  }
  return (
    <div className={css.contextWorkspace}>
      <header className={css.contextHeader}>
        <div>
          <h3>{t('operations.context.previewTitle')}</h3>
          <p>{t('operations.context.previewHint')}</p>
        </div>
        <button type="button" disabled={previewBusy} onClick={() => { void loadPreview() }}>
          {previewBusy ? t('operations.context.loading') : t('operations.context.refresh')}
        </button>
      </header>
      <div className={css.contextTargetPicker}>
        <label>
          <span>{t('operations.context.target')}</span>
          <select value={audience} onChange={(event) => {
            setAudience(event.target.value as 'director' | 'actor')
            setPreview(null)
          }}>
            <option value="director">{t('operations.context.director')}</option>
            <option value="actor">{t('operations.context.actor')}</option>
          </select>
        </label>
        {audience === 'actor' && (
          <label>
            <span>{t('operations.context.selectActor')}</span>
            <select value={actorId} onChange={(event) => { setActorId(event.target.value); setPreview(null) }}>
              {story.actors.map(item => <option key={item.actorId} value={item.actorId}>{item.actorId}</option>)}
            </select>
          </label>
        )}
        {preview !== null && (
          <div className={css.contextTotals}>
            <span>{t('operations.context.totalChars', { value: preview.totalChars })}</span>
            <span>{t('operations.context.totalTokens', { value: preview.estimatedTokens })}</span>
          </div>
        )}
      </div>
      {preview?.pendingActorInitialization === true && <p role="status">{t('context.pendingActorInitialization')}</p>}
      {audience === 'actor' && actorId === '' && <p className={css.characterEmpty}>{t('operations.context.noActor')}</p>}
      {previewError !== null && <p className={css.characterError} role="alert">{previewError}</p>}
      {preview !== null && (
        <div className={css.contextPreviewList}>
          {preview.sections.map(section => <ContextSectionPreview key={section.id} section={section} t={t} />)}
        </div>
      )}
      <details className={`${css.operationsAdvanced} ${css.contextAdvanced}`}>
        <summary>{t('operations.context.advanced')}</summary>
        <p className={css.contextAdvancedHint}>{t('operations.context.advancedHint')}</p>
        <div className={css.operationsGrid}>
          <RecipeEditor title={t('operations.context.director')} sections={director} setSections={setDirector} t={t} />
          <RecipeEditor title={t('operations.context.actor')} sections={actor} setSections={setActor} t={t} />
        </div>
        <div className={css.operationsButtonRow}>
          <button type="button" className={css.operationsPrimary} disabled={busy} onClick={() => {
            void (async () => {
              await run(() => commands.updateContextRecipe(
                story.storyId, story.contextRecipe.revision, director, actor,
              ))
              await loadPreview()
            })()
          }}>{t('operations.context.save')}</button>
          <button type="button" disabled={busy} onClick={restoreDraft}>{t('operations.context.cancel')}</button>
        </div>
      </details>
    </div>
  )
}

function ContextSectionPreview({ section, t }: { readonly section: StoryContextSection; readonly t: Translate }) {
  return (
    <article className={css.contextPreviewCard}>
      <div className={css.contextPreviewHeading}>
        <div>
          <strong>{section.title}</strong>
          <p>{section.reason || contextSectionReason(section.id, t)}</p>
        </div>
        <div className={css.contextBadges}>
          <span>{contextRoleLabel(section.role, t)}</span>
          <span>{contextPermissionLabel(section.permission, t)}</span>
          <span>{contextVisibilityLabel(section.visibility, t)}</span>
        </div>
      </div>
      <div className={css.contextSectionMeta}>
        <span>{contextSourceLabel(section.source, t)}</span>
        <span>{t('operations.context.sectionChars', { value: section.chars })}</span>
        <span>{t('operations.context.sectionTokens', { value: section.estimatedTokens })}</span>
      </div>
      <details className={css.contextContent}>
        <summary>{t('operations.context.showContent')}</summary>
        <pre>{section.content}</pre>
      </details>
    </article>
  )
}

function RecipeEditor({ title, sections, setSections, t }: {
  readonly title: string
  readonly sections: readonly StoryContextRecipeSection[]
  readonly setSections: (sections: StoryContextRecipeSection[]) => void
  readonly t: Translate
}) {
  const move = (index: number, offset: number): void => {
    const next = [...sections]
    const target = index + offset
    if (target < 0 || target >= next.length) return
    const current = next[index]
    const other = next[target]
    if (current === undefined || other === undefined) return
    next[index] = other; next[target] = current
    setSections(next)
  }
  return (
    <article className={css.operationsCard}>
      <h3>{title}</h3>
      {sections.map((section, index) => (
        <div key={section.id} className={css.operationsRecipeRow}>
          <div className={css.operationsRecipeTitle}>
            <strong>{section.title ?? contextSectionLabel(section.id, t)}</strong>
            <span>{section.content !== undefined ? t('contextBuilder.customModuleReason') : contextSectionReason(section.id, t)}</span>
          </div>
          <label>
            <span>{t('contextBuilder.messageRole')}</span>
            <select value={section.role} onChange={(event) => {
              setSections(sections.map(item => item.id === section.id
                ? { ...item, role: event.target.value as StoryContextRecipeSection['role'] }
                : item))
            }}>
              <option value="system">{t('contextBuilder.role.system')}</option>
              <option value="user">{t('contextBuilder.role.user')}</option>
              <option value="assistant">{t('contextBuilder.role.assistant')}</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={section.enabled}
              onChange={(event) => {
                setSections(sections.map(item => item.id === section.id
                  ? { ...item, enabled: event.target.checked }
                  : item))
              }}
            /> {t('operations.context.enabled')}
          </label>
          <div>
            <button type="button" disabled={index === 0} onClick={() => { move(index, -1) }}>{t('operations.context.up')}</button>
            <button type="button" disabled={index === sections.length - 1} onClick={() => { move(index, 1) }}>{t('operations.context.down')}</button>
          </div>
        </div>
      ))}
    </article>
  )
}

function contextSectionLabel(id: string, t: Translate): string {
  const labels: Record<string, string> = {
    policy: t('operations.context.section.policy'),
    tools: t('operations.context.section.tools'),
    identity: t('operations.context.section.identity'),
    'reasoning-language': t('operations.context.section.reasoningLanguage'),
    'director-prompt': t('operations.context.section.directorPrompt'),
    'actor-prompt': t('operations.context.section.actorPrompt'),
    storybook: t('operations.context.section.storybook'),
    world: t('operations.context.section.world'),
    memory: t('operations.context.section.memory'),
    'plot-ledger': t('operations.context.section.plotLedger'),
    'director-outline': t('operations.context.section.directorOutline'),
    'director-brief': t('operations.context.section.directorBrief'),
    discussion: t('operations.context.section.discussion'),
    'actor-state': t('operations.context.section.actorState'),
  }
  return labels[id] ?? id
}

function contextSectionReason(id: string, t: Translate): string {
  const reasons: Record<string, string> = {
    policy: t('operations.context.reason.policy'),
    tools: t('operations.context.reason.tools'),
    identity: t('operations.context.reason.identity'),
    'reasoning-language': t('operations.context.reason.reasoningLanguage'),
    'director-prompt': t('operations.context.reason.directorPrompt'),
    'actor-prompt': t('operations.context.reason.actorPrompt'),
    storybook: t('operations.context.reason.storybook'),
    world: t('operations.context.reason.world'),
    memory: t('operations.context.reason.memory'),
    'plot-ledger': t('operations.context.reason.plotLedger'),
    'director-outline': t('operations.context.reason.directorOutline'),
    'director-brief': t('operations.context.reason.directorBrief'),
    discussion: t('operations.context.reason.discussion'),
    'actor-state': t('operations.context.reason.actorState'),
  }
  return reasons[id] ?? ''
}

function contextPermissionLabel(value: StoryContextSection['permission'], t: Translate): string {
  if (value === 'player-editable') return t('operations.context.permission.editable')
  return t('operations.context.permission.runtime')
}

function contextRoleLabel(value: StoryContextSection['role'], t: Translate): string {
  if (value === 'system') return t('contextBuilder.roleBadge.system')
  if (value === 'user') return t('contextBuilder.roleBadge.user')
  return t('contextBuilder.roleBadge.assistant')
}

function contextVisibilityLabel(value: StoryContextSection['visibility'], t: Translate): string {
  return value === 'director-only'
    ? t('operations.context.visibility.director')
    : t('operations.context.visibility.actor')
}

function contextSourceLabel(value: StoryContextSection['source'], t: Translate): string {
  const labels: Record<StoryContextSection['source'], string> = {
    'context-rule': t('operations.context.source.contextRule'),
    prompt: t('operations.context.source.prompt'),
    'reasoning-language': t('operations.context.source.reasoningLanguage'),
    custom: t('operations.context.source.custom'),
    storybook: t('operations.context.source.storybook'),
    world: t('operations.context.source.world'),
    memory: t('operations.context.source.memory'),
    discussion: t('operations.context.source.discussion'),
    'plot-ledger': t('operations.context.source.plotLedger'),
    'director-outline': t('operations.context.source.directorOutline'),
    'director-brief': t('operations.context.source.directorBrief'),
    'actor-state': t('operations.context.source.actorState'),
  }
  return labels[value]
}

function PackageTab({ story, commands, busy, run, importRef, t }: TabProps & { readonly importRef: RefObject<HTMLInputElement> }) {
  const exportPackage = (): void => {
    void run(async () => {
      const value = await commands.exportPackage(story.storyId)
      const blob = new Blob([value.packageJson], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${safeFilename(story.title)}.story-package.json`
      document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
    })
  }
  return (
    <div className={css.operationsPackage}>
      <p>{t('operations.package.hint')}</p>
      <input
        ref={importRef}
        type="file"
        className={css.storybookFileInput}
        accept="application/json,.json"
        aria-label={t('operations.package.importLabel')}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file !== undefined) void run(async () => { await commands.importPackage(await file.text()) })
        }}
      />
      <div className={css.operationsButtonRow}>
        <button type="button" className={css.operationsPrimary} disabled={busy} onClick={exportPackage}>{t('operations.package.export')}</button>
        <button type="button" disabled={busy} onClick={() => { importRef.current?.click() }}>{t('operations.package.import')}</button>
      </div>
    </div>
  )
}

function parsePatch(source: string): WorldPatchOperation[] {
  if (source.trim() === '') return []
  const value = JSON.parse(source) as unknown
  if (!Array.isArray(value)) throw new Error('World patch must be a JSON array')
  return value as WorldPatchOperation[]
}

function required(value: string, label: string): string {
  const accepted = value.trim()
  if (accepted === '') throw new Error(`${label} is required`)
  return accepted
}

function message(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

function safeFilename(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '-').trim() || 'story'
}
