import { DynamicStateEditor } from './DynamicStateEditor.tsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  StoryActorStateFacet,
  StoryStateUpdateRequest,
  StoryActorStateView,
  StoryActorTurningPointView,
  StoryUpdateActorTurningPointRequest,
} from '@deepseek-ai/dsh-api-story-controller/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { StoryId } from '@deepseek-ai/dsh-story/types'
import { NS } from './locales.ts'
import css from './RoleplayChrome.module.css'
import { WorkspaceCloseButton } from './WorkspaceDialog.tsx'
import { isCreatorSession } from './RoleplayChrome.tsx'

type PanelProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS>
type LoadActors = (storyId: StoryId) => Promise<readonly StoryActorStateView[]>
type UpdateTurningPoint = (request: StoryUpdateActorTurningPointRequest) => Promise<readonly StoryActorStateView[]>
type StateCategory = 'overview' | 'memory' | 'journey'

function ownsSession(story: {
  readonly sceneSessionIds: readonly string[]
  readonly controlSessionId?: string
  readonly actors: readonly { readonly sessionId: string }[]
}, sessionId: string): boolean {
  return story.sceneSessionIds.includes(sessionId)
    || story.controlSessionId === sessionId
    || story.actors.some(actor => actor.sessionId === sessionId)
}

function StateList({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null
  return (
    <section className={css.stateSection}>
      <h4>{title}</h4>
      <ul>{items.map((item, index) => <li key={`${String(index)}:${item}`}>{item}</li>)}</ul>
    </section>
  )
}

function facetTitle(facet: StoryActorStateFacet, t: PanelProps['t']): string {
  if (facet.label !== undefined) return facet.label
  const known = {
    perspective: 'characters.perspective',
  } as const
  return facet.key in known ? t(known[facet.key as keyof typeof known]) : facet.key
}

const CATEGORIES: readonly StateCategory[] = ['overview', 'memory', 'journey']

function categoryHasData(actor: StoryActorStateView, category: StateCategory): boolean {
  switch (category) {
    case 'overview':
      return actor.facets.length > 0 || actor.goals.some(goal => goal.status === 'active')
    case 'memory':
      return actor.memories.length > 0 || actor.intentions.length > 0
    case 'journey':
      return actor.turningPoints.length > 0
    default:
      return false
  }
}

function CategoryState({ actor, category, t, onEditTurningPoint }: {
  actor: StoryActorStateView
  category: StateCategory
  t: PanelProps['t']
  onEditTurningPoint: (point: StoryActorTurningPointView) => void
}) {
  if (!categoryHasData(actor, category)) return <p className={css.categoryEmpty}>{t('characters.category.empty')}</p>
  if (category === 'overview') {
    return (
      <>
        {actor.facets.map(facet => (
          <StateList key={facet.key} title={facetTitle(facet, t)} items={facet.values} />
        ))}
        <StateList title={t('characters.goals')} items={actor.goals.filter(item => item.status === 'active').map(item => `${item.description} · P${item.priority}`)} />
      </>
    )
  }
  if (category === 'journey') {
    return (
      <div className={css.turningPointTimeline}>
        {[...actor.turningPoints].reverse().map(point => (
          <article key={point.id} className={css.turningPointCard} data-status={point.status}>
            <header>
              <span>{t(`characters.journey.status.${point.status}`)}</span>
              <strong>{t('characters.journey.significance')} {point.significance}/5</strong>
            </header>
            <h4>{point.trigger}</h4>
            <p>{point.interpretation}</p>
            <ul>{point.changes.map((change, index) => (
              <li key={`${change.dimension}:${change.subject}:${String(index)}`}>
                <b>{t(`characters.journey.dimension.${change.dimension}`)} · {change.subject}</b>
                {change.before !== undefined && <del>{change.before}</del>}
                <span>{change.after}</span>
              </li>
            ))}</ul>
            <footer>
              <time dateTime={point.updatedAt}>{new Date(point.updatedAt).toLocaleString()}</time>
              <button type="button" onClick={() => { onEditTurningPoint(point) }}>{t('characters.journey.edit')}</button>
            </footer>
          </article>
        ))}
      </div>
    )
  }
  return (
    <>
      <StateList title={t('characters.memories')} items={actor.memories.filter(item => item.status === 'active').slice(-5).map(item => item.content)} />
      <StateList title={t('characters.intentions')} items={actor.intentions.map(item => `${item.description} · ${item.trigger}`)} />
    </>
  )
}

function TurningPointEditor({ point, saving, t, onChange, onCancel, onSave }: {
  point: StoryActorTurningPointView
  saving: boolean
  t: PanelProps['t']
  onChange: (point: StoryActorTurningPointView) => void
  onCancel: () => void
  onSave: () => void
}) {
  const setChange = (index: number, patch: Partial<StoryActorTurningPointView['changes'][number]>): void => {
    onChange({ ...point, changes: point.changes.map((change, itemIndex) => itemIndex === index ? { ...change, ...patch } : change) })
  }
  return (
    <div className={css.turningPointEditorBackdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel()
    }}>
      <section className={css.turningPointEditor} role="dialog" aria-modal="true" aria-label={t('characters.journey.editor')}>
        <header>
          <div><strong>{t('characters.journey.editor')}</strong><small>#{point.revision}</small></div>
          <button type="button" onClick={onCancel} aria-label={t('characters.journey.cancel')}>×</button>
        </header>
        <label>{t('characters.journey.trigger')}<textarea value={point.trigger} onChange={(event) => { onChange({ ...point, trigger: event.target.value }) }} /></label>
        <label>{t('characters.journey.interpretation')}<textarea value={point.interpretation} onChange={(event) => { onChange({ ...point, interpretation: event.target.value }) }} /></label>
        <div className={css.turningPointEditorRow}>
          <label>{t('characters.journey.significance')}
            <select
              value={point.significance}
              onChange={(event) => {
                onChange({ ...point, significance: Number(event.target.value) as 3 | 4 | 5 })
              }}
            >
              <option value={3}>3</option><option value={4}>4</option><option value={5}>5</option>
            </select>
          </label>
          <label>{t('characters.journey.status')}
            <select value={point.status} onChange={(event) => { onChange({ ...point, status: event.target.value as StoryActorTurningPointView['status'] }) }}>
              {(['tentative', 'integrated', 'reversed', 'rejected'] as const).map(status => <option key={status} value={status}>{t(`characters.journey.status.${status}`)}</option>)}
            </select>
          </label>
        </div>
        <fieldset>
          <legend>{t('characters.journey.changes')}</legend>
          {point.changes.map((change, index) => (
            <div key={String(index)} className={css.turningPointChangeEditor}>
              <select
                value={change.dimension}
                onChange={(event) => {
                  setChange(index, { dimension: event.target.value as typeof change.dimension })
                }}
              >
                {(['belief', 'goal', 'relationship', 'conflict', 'identity', 'memory'] as const).map(dimension => <option key={dimension} value={dimension}>{t(`characters.journey.dimension.${dimension}`)}</option>)}
              </select>
              <input aria-label={t('characters.journey.subject')} value={change.subject} onChange={(event) => { setChange(index, { subject: event.target.value }) }} />
              <textarea aria-label={t('characters.journey.before')} value={change.before ?? ''} onChange={(event) => {
                const before = event.target.value
                onChange({
                  ...point,
                  changes: point.changes.map((item, itemIndex) => {
                    if (itemIndex !== index) return item
                    const { before: _before, ...rest } = item
                    return before.length === 0 ? rest : { ...rest, before }
                  }),
                })
              }} />
              <textarea aria-label={t('characters.journey.after')} value={change.after} onChange={(event) => { setChange(index, { after: event.target.value }) }} />
            </div>
          ))}
        </fieldset>
        <label>{t('characters.journey.sources')}<textarea value={point.sourceRefs.join('\n')} onChange={(event) => { onChange({ ...point, sourceRefs: event.target.value.split('\n').map(item => item.trim()).filter(Boolean) }) }} /></label>
        <footer>
          <button type="button" className={css.turningPointReject} disabled={saving} onClick={() => { onChange({ ...point, status: 'rejected' }) }}>{t('characters.journey.reject')}</button>
          <span />
          <button type="button" disabled={saving} onClick={onCancel}>{t('characters.journey.cancel')}</button>
          <button type="button" disabled={saving || point.trigger.trim().length === 0 || point.interpretation.trim().length === 0} onClick={onSave}>{saving ? t('characters.journey.saving') : t('characters.journey.save')}</button>
        </footer>
      </section>
    </div>
  )
}

/** Bind the roleplay status panel to the path-free Story command service. */
export function characterStatePanel(loadActors: LoadActors, updateTurningPoint: UpdateTurningPoint,
  updateState: (request: StoryStateUpdateRequest) => Promise<readonly StoryActorStateView[]>) {
  return function CharacterStatePanel({ sessionId, useStories, useSessions, t }: PanelProps) {
    const story = useStories?.(snapshot => snapshot.items.find(item => ownsSession(item, sessionId)))
    const [open, setOpen] = useState(false)
    const [wide, setWide] = useState(() => window.innerWidth >= 1100)
    useEffect(() => {
      const resize = (): void => { setWide(window.innerWidth >= 1100) }
      window.addEventListener('resize', resize)
      return () => { window.removeEventListener('resize', resize) }
    }, [])
    useEffect(() => { setOpen(false) }, [sessionId])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [actors, setActors] = useState<readonly StoryActorStateView[]>([])
    const [refreshRevision, setRefreshRevision] = useState(0)
    const [selectedActorId, setSelectedActorId] = useState<string | null>(null)
    const [category, setCategory] = useState<StateCategory>('overview')
    const [editingPoint, setEditingPoint] = useState<StoryActorTurningPointView | null>(null)
    const [savingPoint, setSavingPoint] = useState(false)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const panelRef = useRef<HTMLElement>(null)
    const storyId = story?.storyId
    const rosterKey = useMemo(() => story?.actors
      .map(actor => `${actor.sessionId}:${String(actor.stateRevision)}`)
      .join('|') ?? '', [story])

    useEffect(() => {
      let current = true
      if (storyId === undefined) {
        setActors([])
        setLoading(false)
        setError(null)
        return () => { current = false }
      }
      setLoading(true)
      setError(null)
      void loadActors(storyId).then(
        (value) => {
          if (!current) return
          setActors(value)
          setLoading(false)
        },
        (reason: unknown) => {
          if (!current) return
          setError(reason instanceof Error ? reason.message : String(reason))
          setLoading(false)
        },
      )
      return () => { current = false }
    }, [storyId, rosterKey, refreshRevision, story?.world.revision])

    useEffect(() => {
      if (actors.length === 0) {
        setSelectedActorId(null)
        return
      }
      const first = actors[0]
      if (first !== undefined && !actors.some(actor => actor.actorId === selectedActorId)) {
        setSelectedActorId(first.actorId)
      }
    }, [actors, selectedActorId])

    const refresh = (): void => {
      if (!loading) setRefreshRevision(value => value + 1)
    }

    const close = useCallback((): void => {
      setOpen(false)
      triggerRef.current?.focus()
    }, [])

    useEffect(() => {
      if (!open) return
      const previousOverflow = document.body.style.overflow
      if (!wide) document.body.style.overflow = 'hidden'
      const focusFrame = window.requestAnimationFrame(() => { panelRef.current?.focus() })
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
          event.preventDefault()
          close()
          return
        }
        if (wide || event.key !== 'Tab' || panelRef.current === null) return
        const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
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
    }, [close, open, wide])
    const selectedActor = actors.find(actor => actor.actorId === selectedActorId) ?? actors[0]

    const saveTurningPoint = async (point: StoryActorTurningPointView): Promise<void> => {
      if (storyId === undefined || selectedActor === undefined || savingPoint) return
      setSavingPoint(true)
      setError(null)
      try {
        const value = await updateTurningPoint({
          storyId,
          actorId: selectedActor.actorId,
          turningPointId: point.id,
          expectedRevision: point.revision,
          trigger: point.trigger,
          interpretation: point.interpretation,
          significance: point.significance,
          status: point.status,
          changes: point.changes,
          sourceRefs: point.sourceRefs,
        })
        setActors(value)
        setEditingPoint(null)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        setSavingPoint(false)
      }
    }

    if (isCreatorSession({ sessionId, useSessions })) return null

    return (
      <div className={css.characterPanelRoot}>
        <button
          ref={triggerRef}
          type="button"
          className={css.characterPanelTrigger}
          aria-expanded={open}
          aria-label={t('characters.open')}
          onClick={() => { if (open) close(); else setOpen(true) }}
        >
          <span aria-hidden="true">◇</span>
          <span>{t('characters.title')}</span>
          {story !== undefined && <span className={css.characterCount}>{actors.length}</span>}
        </button>
        {open && createPortal(
          <div className={`${css.characterPanelLayer} ${wide ? css.characterSidebar : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
            <aside
              ref={panelRef}
              className={css.characterPanel}
              role="dialog"
              aria-modal={!wide}
              aria-label={t('characters.title')}
              tabIndex={-1}
            >
              <header className={css.characterPanelHeader}>
                <div>
                  <strong>{t('characters.title')}</strong>
                  <p>{t('characters.subtitle')}</p>
                </div>
                <div className={css.characterPanelActions}>
                  <button type="button" onClick={refresh} disabled={loading}>{t('characters.refresh')}</button>
                  <WorkspaceCloseButton label={t('workspace.close')} onClick={close} />
                </div>
              </header>
              {loading && actors.length === 0 && <p className={css.characterEmpty}>{t('characters.loading')}</p>}
              {error !== null && <p className={css.characterError}>{error}</p>}
              {!loading && error === null && actors.length === 0 && (
                <p className={css.characterEmpty}>{t('characters.empty')}</p>
              )}
              {selectedActor !== undefined && (
                <div className={css.characterPanelBody}>
                  <nav className={css.characterRoster} aria-label={t('characters.roster')}>
                    {actors.map(actor => (
                      <button
                        key={actor.actorId}
                        type="button"
                        aria-pressed={actor.actorId === selectedActor.actorId}
                        onClick={() => { setSelectedActorId(actor.actorId) }}
                      >
                        <span className={css.characterAvatar}>{actor.displayName.slice(0, 1)}</span>
                        <span><strong>{actor.displayName}</strong><small>{actor.lifecycle === 'active' ? t('characters.lifecycle.active') : t('characters.lifecycle.defined')}</small></span>
                      </button>
                    ))}
                  </nav>
                  <article className={css.characterCard}>
                    <header>
                      <span className={css.characterAvatar}>{selectedActor.displayName.slice(0, 1)}</span>
                      <div>
                        <span className={css.characterTitleLine}>
                          <strong>{selectedActor.displayName}</strong>
                          <em data-lifecycle={selectedActor.lifecycle}>
                            {selectedActor.lifecycle === 'active'
                              ? t('characters.lifecycle.active')
                              : t('characters.lifecycle.defined')}
                          </em>
                        </span>
                        <small>{selectedActor.persona}</small>
                      </div>
                    </header>
                    <div className={css.characterTabs} role="tablist" aria-label={t('characters.categories')}>
                      {CATEGORIES.map(item => (
                        <button
                          key={item}
                          type="button"
                          role="tab"
                          aria-selected={item === category}
                          onClick={() => { setCategory(item) }}
                        >
                          {t(`characters.category.${item}`)}
                        </button>
                      ))}
                    </div>
                    <div className={css.characterCategory} role="tabpanel">
                      {category === 'overview' && <DynamicStateEditor key={selectedActor.actorId}
                        state={selectedActor.dynamicState} actorId={selectedActor.actorId} actors={actors} t={t}
                        disabled={selectedActor.lifecycle !== 'active'}
                        onSave={async (changes, owner) => {
                          if (storyId === undefined) return
                          setActors(await updateState({ storyId, actorId: selectedActor.actorId, owner, changes,
                            ...(owner === 'world' && story !== undefined ? { expectedWorldRevision: story.world.revision } : {}),
                          }))
                        }} />}
                      <CategoryState actor={selectedActor} category={category} t={t} onEditTurningPoint={setEditingPoint} />
                    </div>
                  </article>
                </div>
              )}
              {editingPoint !== null && (
                <TurningPointEditor
                  point={editingPoint}
                  saving={savingPoint}
                  t={t}
                  onChange={setEditingPoint}
                  onCancel={() => { setEditingPoint(null) }}
                  onSave={() => { void saveTurningPoint(editingPoint) }}
                />
              )}
            </aside>
          </div>,
          document.body,
        )}
      </div>
    )
  }
}
