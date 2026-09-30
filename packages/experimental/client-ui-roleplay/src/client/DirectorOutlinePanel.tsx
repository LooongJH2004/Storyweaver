import type { DragEvent as ReactDragEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IStories, StoryView } from '@deepseek-ai/dsh-api-story-controller/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  DirectorOutline, DirectorOutlineAuthor, DirectorOutlinePlayerInput, DirectorRunStatus,
} from '@deepseek-ai/dsh-story/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { NS } from './locales.ts'
import css from './RoleplayChrome.module.css'
import { WorkspaceCloseButton, WorkspaceDialog } from './WorkspaceDialog.tsx'

type PanelProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS>
type Translate = PanelProps['t']
type EditorMode = 'structured' | 'json'
type OutlineSection = 'overview' | 'arcs' | 'beats' | 'foreshadows' | 'mysteries' | 'clocks'
type OutlineTextItem = DirectorOutlinePlayerInput['themes'][number]
type OutlineArc = DirectorOutlinePlayerInput['arcs'][number]
type OutlineBeat = DirectorOutlinePlayerInput['beats'][number]
type OutlineForeshadow = DirectorOutlinePlayerInput['foreshadows'][number]
type OutlineMystery = DirectorOutlinePlayerInput['mysteries'][number]
type OutlineClock = DirectorOutlinePlayerInput['clocks'][number]
type IdentifiedItem = { readonly id: string; readonly locked: boolean }

const sections: readonly OutlineSection[] = ['overview', 'arcs', 'beats', 'foreshadows', 'mysteries', 'clocks']

function ownsSession(story: StoryView, sessionId: SessionId): boolean {
  return story.sceneSessionIds.includes(sessionId)
    || story.controlSessionId === sessionId
    || story.actors.some(actor => actor.sessionId === sessionId)
}

/** Remove Director-only provenance so the editor contains exactly player-writable fields. */
export function editableDirectorOutline(outline: DirectorOutline): DirectorOutlinePlayerInput {
  const editable = <T extends { readonly source: unknown }>(items: readonly T[]): Omit<T, 'source'>[] =>
    items.map(({ source: _source, ...item }) => item)
  return {
    updateMode: outline.updateMode,
    premise: outline.premise,
    premiseLocked: outline.premiseLocked,
    themes: editable(outline.themes),
    hardConstraints: editable(outline.hardConstraints),
    arcs: editable(outline.arcs),
    beats: editable(outline.beats),
    foreshadows: editable(outline.foreshadows),
    mysteries: editable(outline.mysteries),
    clocks: editable(outline.clocks),
  }
}

function runStatusLabel(status: DirectorRunStatus, t: Translate): string {
  switch (status) {
    case 'brief_committed': return t('outline.run.committed')
    case 'dispatching': return t('outline.run.dispatching')
    case 'paused': return t('outline.run.paused')
    case 'awaiting_retry': return t('outline.run.retry')
    case 'completed': return t('outline.run.completed')
    case 'cancelled': return t('outline.run.cancelled')
  }
}

/** Bind a structured player-visible Outline studio to path-free Story commands. */
export function directorOutlinePanel(stories: Pick<IStories, 'updateDirectorOutline' | 'resolveDirectorOutlineSuggestion'>) {
  return function DirectorOutlinePanel({ sessionId, useStories, t }: PanelProps) {
    const story = useStories?.(snapshot => snapshot.items.find(item => ownsSession(item, sessionId)))
    const outline = story?.directorOutline
    const brief = story?.plotLedger.latestBrief
    const run = story?.plotLedger.directorRun
    const [open, setOpen] = useState(false)
    const [editing, setEditing] = useState(false)
    const [mode, setMode] = useState<EditorMode>('structured')
    const [section, setSection] = useState<OutlineSection>('overview')
    const [draft, setDraft] = useState<DirectorOutlinePlayerInput | null>(null)
    const [undoDraft, setUndoDraft] = useState<DirectorOutlinePlayerInput | null>(null)
    const [jsonDraft, setJsonDraft] = useState('')
    const [baseRevision, setBaseRevision] = useState<number | null>(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const outlineKey = outline === undefined ? '' : `${outline.revision}:${outline.updatedAt}`
    const dirty = useMemo(() => {
      if (!editing || outline === undefined || draft === null) return false
      try {
        const candidate = mode === 'json' ? JSON.parse(jsonDraft) as DirectorOutlinePlayerInput : draft
        return JSON.stringify(candidate) !== JSON.stringify(editableDirectorOutline(outline))
      } catch {
        return true
      }
    }, [draft, editing, jsonDraft, mode, outline])
    const stale = editing && outline !== undefined && baseRevision !== null && outline.revision !== baseRevision
    const close = useCallback((): void => {
      setOpen(false)
      triggerRef.current?.focus()
    }, [])

    useEffect(() => {
      if (outline === undefined || editing) return
      const editable = editableDirectorOutline(outline)
      setDraft(editable)
      setJsonDraft(JSON.stringify(editable, undefined, 2))
    }, [outlineKey, outline, editing])

    useEffect(() => {
      setOpen(false)
      setEditing(false)
      setMode('structured')
      setSection('overview')
      setDraft(null)
      setUndoDraft(null)
      setJsonDraft('')
      setBaseRevision(null)
      setError(null)
    }, [story?.storyId])

    const beginEdit = (): void => {
      if (outline === undefined) return
      const editable = editableDirectorOutline(outline)
      setDraft(editable)
      setUndoDraft(null)
      setJsonDraft(JSON.stringify(editable, undefined, 2))
      setBaseRevision(outline.revision)
      setMode('structured')
      setSection('overview')
      setError(null)
      setEditing(true)
    }

    const updateDraft = (next: DirectorOutlinePlayerInput): void => {
      setUndoDraft(draft)
      setDraft(next)
    }

    const changeMode = (next: EditorMode): void => {
      if (draft === null || next === mode) return
      try {
        if (next === 'json') setJsonDraft(JSON.stringify(draft, undefined, 2))
        else setDraft(JSON.parse(jsonDraft) as DirectorOutlinePlayerInput)
        setMode(next)
        setError(null)
      } catch (reason: unknown) {
        setError(message(reason))
      }
    }

    const restoreCurrent = (): void => {
      if (outline === undefined) return
      const editable = editableDirectorOutline(outline)
      setDraft(editable)
      setUndoDraft(null)
      setJsonDraft(JSON.stringify(editable, undefined, 2))
      setBaseRevision(outline.revision)
      setMode('structured')
      setError(null)
    }

    const save = async (): Promise<void> => {
      if (story === undefined || outline === undefined || draft === null || baseRevision === null || saving) return
      if (outline.revision !== baseRevision) {
        setError(t('outline.staleError', { expected: baseRevision, actual: outline.revision }))
        return
      }
      setSaving(true)
      setError(null)
      try {
        const parsed = mode === 'json' ? JSON.parse(jsonDraft) as DirectorOutlinePlayerInput : draft
        await stories.updateDirectorOutline(story.storyId, baseRevision, parsed, t('outline.playerEditReason'))
        setEditing(false)
        setUndoDraft(null)
      } catch (reason: unknown) {
        setError(message(reason))
      } finally {
        setSaving(false)
      }
    }

    const resolveSuggestion = async (suggestionId: string, accept: boolean): Promise<void> => {
      if (story === undefined || outline === undefined || saving) return
      setSaving(true)
      setError(null)
      try {
        await stories.resolveDirectorOutlineSuggestion(story.storyId, outline.revision, suggestionId, accept)
      } catch (reason: unknown) {
        setError(message(reason))
      } finally {
        setSaving(false)
      }
    }

    return (
      <div className={css.outlinePanelRoot}>
        <button ref={triggerRef} type="button" className={css.characterPanelTrigger} aria-expanded={open} aria-label={t('outline.open')} onClick={() => { if (open) close(); else setOpen(true) }}>
          <span aria-hidden="true">✧</span>
          <span>{t('outline.title')}</span>
          {outline !== undefined && <span className={css.characterCount}>{outlineRevisionShort(outline.revision, t)}</span>}
          {brief !== undefined && <span className={css.characterCount}>{t('outline.briefShort', { value: brief.ledgerRevision })}</span>}
        </button>
        {open && (
          <WorkspaceDialog
            className={`${css.outlinePanel} ${css.outlineStudioPanel}`}
            label={t('outline.title')}
            storageKey="director-outline"
            defaultSize={{ width: 1040, height: 900 }}
            resizeLabels={{
              top: t('workspace.resizeTop'), right: t('workspace.resizeRight'),
              bottom: t('workspace.resizeBottom'), left: t('workspace.resizeLeft'),
            }}
            returnFocusRef={triggerRef}
            onClose={close}
          >
            <header className={css.characterPanelHeader}>
              <div><strong>{t('outline.title')}</strong><p>{t('outline.subtitle')}</p></div>
              <div className={css.workspaceHeaderActions}>
                {!editing && <button type="button" onClick={beginEdit} disabled={outline === undefined}>{t('outline.edit')}</button>}
                <WorkspaceCloseButton label={t('workspace.close')} onClick={close} />
              </div>
            </header>
            <div className={css.workspaceBody}>
              {outline === undefined && <p className={css.characterEmpty}>{t('outline.empty')}</p>}
              {outline !== undefined && !editing && (
                <OutlineDashboard
                  outline={outline}
                  briefSummary={brief === undefined ? t('outline.briefNone') : t('outline.briefRevision', { value: brief.ledgerRevision, actors: brief.actorBriefs.length })}
                  runSummary={run === undefined ? null : runStatusLabel(run.status, t)}
                  saving={saving}
                  resolveSuggestion={resolveSuggestion}
                  t={t}
                />
              )}
              {outline !== undefined && draft !== null && editing && (
                <div className={css.outlineStudioEditor}>
                  <div className={css.outlineModeSwitch} role="tablist" aria-label={t('outline.modeLabel')}>
                    <button type="button" role="tab" aria-selected={mode === 'structured'} onClick={() => { changeMode('structured') }}>{t('outline.mode.structured')}</button>
                    <button type="button" role="tab" aria-selected={mode === 'json'} onClick={() => { changeMode('json') }}>{t('outline.mode.json')}</button>
                  </div>
                  <div className={css.workspaceCommandBar} role="toolbar" aria-label={t('workspace.commands')}>
                    <div className={css.workspaceCommandPrimary}>
                      <button className={css.workspacePrimaryAction} type="button" disabled={saving || stale || !dirty} onClick={() => { void save() }}>{saving ? t('outline.saving') : t('outline.save')}</button>
                      <button type="button" disabled={saving} onClick={() => { setEditing(false); setError(null) }}>{t('outline.cancel')}</button>
                    </div>
                    <div className={css.workspaceCommandSecondary}>
                      <button type="button" disabled={saving || undoDraft === null || mode === 'json'} onClick={() => {
                        if (undoDraft === null) return
                        const current = draft
                        setDraft(undoDraft)
                        setUndoDraft(current)
                      }}>{t('outline.undo')}</button>
                      <button type="button" disabled={saving} onClick={restoreCurrent}>{t('outline.restore')}</button>
                    </div>
                  </div>
                  {stale && (
                    <div className={css.outlineStaleNotice}>
                      <span>{t('outline.staleError', { expected: baseRevision, actual: outline.revision })}</span>
                      <button type="button" onClick={restoreCurrent}>{t('outline.loadLatest')}</button>
                    </div>
                  )}
                  {mode === 'structured' && (
                    <StructuredOutlineEditor
                      outline={outline}
                      draft={draft}
                      section={section}
                      setSection={setSection}
                      setDraft={updateDraft}
                      t={t}
                    />
                  )}
                  {mode === 'json' && (
                    <div className={css.outlineEditor}>
                      <p>{t('outline.editorHint')}</p>
                      <textarea value={jsonDraft} spellCheck={false} aria-label={t('outline.editorLabel')} onChange={(event) => { setJsonDraft(event.target.value) }} />
                    </div>
                  )}
                  <footer className={css.outlineEditorFooter}>
                    <span>{dirty ? t('outline.unsaved') : t('outline.noChanges')}</span>
                  </footer>
                </div>
              )}
              {error !== null && <p className={css.characterError}>{error}</p>}
            </div>
          </WorkspaceDialog>
        )}
      </div>
    )
  }
}

function OutlineDashboard({ outline, briefSummary, runSummary, saving, resolveSuggestion, t }: {
  readonly outline: DirectorOutline
  readonly briefSummary: string
  readonly runSummary: string | null
  readonly saving: boolean
  readonly resolveSuggestion: (suggestionId: string, accept: boolean) => Promise<void>
  readonly t: Translate
}) {
  const collections = [
    { label: t('outline.section.arcs'), items: outline.arcs.map(item => ({ id: item.id, title: item.title, source: item.source, locked: item.locked })) },
    { label: t('outline.section.beats'), items: outline.beats.map(item => ({ id: item.id, title: item.title, source: item.source, locked: item.locked })) },
    { label: t('outline.section.foreshadows'), items: outline.foreshadows.map(item => ({ id: item.id, title: item.title, source: item.source, locked: item.locked })) },
    { label: t('outline.section.mysteries'), items: outline.mysteries.map(item => ({ id: item.id, title: item.question, source: item.source, locked: item.locked })) },
    { label: t('outline.section.clocks'), items: outline.clocks.map(item => ({ id: item.id, title: item.title, source: item.source, locked: item.locked })) },
  ]
  return (
    <div className={css.outlineBody}>
      <section className={css.outlinePremise}><h4>{t('outline.recordBoundary')}</h4><p>{t('outline.recordBoundaryHint')}</p><div className={css.outlineMeta}><span>{briefSummary}</span>{runSummary !== null && <span>{runSummary}</span>}</div></section>
      <div className={css.outlineMeta}>
        <span>{outlineRevisionLong(outline.revision, t)}</span>
        <span>{outline.updateMode === 'review_all' ? t('outline.mode.review') : t('outline.mode.auto')}</span>
        <span>{t('outline.pending', { value: outline.pendingSuggestions.length })}</span>
        <span>{t('outline.updatedBy', { author: authorLabel(outline.updatedBy, t) })}</span>
      </div>
      <section className={css.outlinePremise}><h4>{t('outline.premise')}</h4><p>{outline.premise || t('outline.notSet')}</p>{outline.premiseLocked && <em>{t('outline.locked')}</em>}</section>
      <div className={css.outlineDashboardGrid}>
        {collections.map(collection => (
          <section key={collection.label} className={css.outlineSummaryCard}>
            <strong>{collection.label}</strong><span>{collection.items.length}</span>
            {collection.items.slice(0, 4).map(item => <p key={item.id}>{item.title}<small>{authorLabel(item.source, t)}{item.locked ? ` · ${t('outline.locked')}` : ''}</small></p>)}
          </section>
        ))}
      </div>
      <OutlineSuggestions outline={outline} saving={saving} resolveSuggestion={resolveSuggestion} t={t} />
      <OutlineHistory outline={outline} t={t} />
    </div>
  )
}

function OutlineSuggestions({ outline, saving, resolveSuggestion, t }: {
  readonly outline: DirectorOutline
  readonly saving: boolean
  readonly resolveSuggestion: (suggestionId: string, accept: boolean) => Promise<void>
  readonly t: Translate
}) {
  return (
    <section className={css.outlineAuditSection}>
      <div className={css.outlineSectionHeader}><strong>{t('outline.reviewQueue')}</strong><span>{outline.pendingSuggestions.length}</span></div>
      {outline.pendingSuggestions.length === 0 && <p className={css.characterEmpty}>{t('outline.reviewEmpty')}</p>}
      {outline.pendingSuggestions.map(suggestion => (
        <article key={suggestion.id} className={css.outlineSuggestion}>
          <strong>{t('outline.suggestion')}</strong><p>{suggestion.reason}</p>
          <small>{suggestion.baseRevision === 0
            ? t('outline.suggestionMetaInitial', { sections: suggestionSections(suggestion.patch).join(', ') })
            : t('outline.suggestionMeta', { revision: suggestion.baseRevision, sections: suggestionSections(suggestion.patch).join(', ') })}</small>
          <div><button type="button" disabled={saving} onClick={() => { void resolveSuggestion(suggestion.id, true) }}>{t('outline.accept')}</button><button type="button" disabled={saving} onClick={() => { void resolveSuggestion(suggestion.id, false) }}>{t('outline.reject')}</button></div>
        </article>
      ))}
    </section>
  )
}

function OutlineHistory({ outline, t }: { readonly outline: DirectorOutline; readonly t: Translate }) {
  return (
    <section className={css.outlineAuditSection}>
      <div className={css.outlineSectionHeader}><strong>{t('outline.history')}</strong><span>{outline.history.length}</span></div>
      {outline.history.length === 0 && <p className={css.characterEmpty}>{t('outline.historyEmpty')}</p>}
      <ol className={css.outlineHistory}>
        {[...outline.history].reverse().map(entry => (
          <li key={`${entry.revision}:${entry.createdAt}`}><strong>{outlineRevisionShort(entry.revision, t)}</strong><div><span>{authorLabel(entry.author, t)}</span><time>{formatTimestamp(entry.createdAt)}</time></div><p>{entry.reason}</p><small>{entry.changedSections.join(', ')}</small></li>
        ))}
      </ol>
    </section>
  )
}

function outlineRevisionShort(revision: number, t: Translate): string {
  return revision === 0 ? t('outline.notCreatedShort') : t('outline.revisionShort', { value: revision })
}

function outlineRevisionLong(revision: number, t: Translate): string {
  return revision === 0 ? t('outline.notCreated') : t('outline.revision', { value: revision })
}

function StructuredOutlineEditor({ outline, draft, section, setSection, setDraft, t }: {
  readonly outline: DirectorOutline
  readonly draft: DirectorOutlinePlayerInput
  readonly section: OutlineSection
  readonly setSection: (section: OutlineSection) => void
  readonly setDraft: (draft: DirectorOutlinePlayerInput) => void
  readonly t: Translate
}) {
  const sourceById = useMemo(() => new Map<string, DirectorOutlineAuthor>([
    ...outline.themes, ...outline.hardConstraints, ...outline.arcs, ...outline.beats,
    ...outline.foreshadows, ...outline.mysteries, ...outline.clocks,
  ].map(item => [item.id, item.source])), [outline])
  const usedIds = allIds(draft)
  return (
    <div className={css.outlineStructuredLayout}>
      <nav className={css.outlineSectionNav} aria-label={t('outline.sections')}>
        {sections.map(name => <button type="button" key={name} aria-pressed={section === name} onClick={() => { setSection(name) }}><span aria-hidden="true">{sectionGlyph(name)}</span><span>{t(`outline.section.${name}`)}</span><small>{sectionCount(name, draft)}</small></button>)}
      </nav>
      <div className={css.outlineSectionBody}>
        {section === 'overview' && <OverviewEditor draft={draft} setDraft={setDraft} usedIds={usedIds} sourceById={sourceById} t={t} />}
        {section === 'arcs' && <CollectionEditor items={draft.arcs} setItems={(arcs) => { setDraft({ ...draft, arcs }) }} create={() => newArc(uniqueId('arc', usedIds))} sourceById={sourceById} title={t('outline.section.arcs')} addLabel={t('outline.addArc')} emptyLabel={t('outline.emptyArcs')} t={t} render={(item, update) => <ArcFields item={item} update={update} t={t} />} />}
        {section === 'beats' && <CollectionEditor items={draft.beats} setItems={(beats) => { setDraft({ ...draft, beats }) }} create={() => newBeat(uniqueId('beat', usedIds))} sourceById={sourceById} title={t('outline.section.beats')} addLabel={t('outline.addBeat')} emptyLabel={t('outline.emptyBeats')} t={t} render={(item, update) => <BeatFields item={item} update={update} arcs={draft.arcs} beats={draft.beats} t={t} />} />}
        {section === 'foreshadows' && <CollectionEditor items={draft.foreshadows} setItems={(foreshadows) => { setDraft({ ...draft, foreshadows }) }} create={() => newForeshadow(uniqueId('foreshadow', usedIds))} sourceById={sourceById} title={t('outline.section.foreshadows')} addLabel={t('outline.addForeshadow')} emptyLabel={t('outline.emptyForeshadows')} t={t} render={(item, update) => <ForeshadowFields item={item} update={update} beats={draft.beats} t={t} />} />}
        {section === 'mysteries' && <CollectionEditor items={draft.mysteries} setItems={(mysteries) => { setDraft({ ...draft, mysteries }) }} create={() => newMystery(uniqueId('mystery', usedIds))} sourceById={sourceById} title={t('outline.section.mysteries')} addLabel={t('outline.addMystery')} emptyLabel={t('outline.emptyMysteries')} t={t} render={(item, update) => <MysteryFields item={item} update={update} t={t} />} />}
        {section === 'clocks' && <CollectionEditor items={draft.clocks} setItems={(clocks) => { setDraft({ ...draft, clocks }) }} create={() => newClock(uniqueId('clock', usedIds))} sourceById={sourceById} title={t('outline.section.clocks')} addLabel={t('outline.addClock')} emptyLabel={t('outline.emptyClocks')} t={t} render={(item, update) => <ClockFields item={item} update={update} t={t} />} />}
      </div>
    </div>
  )
}

function OverviewEditor({ draft, setDraft, usedIds, sourceById, t }: {
  readonly draft: DirectorOutlinePlayerInput
  readonly setDraft: (draft: DirectorOutlinePlayerInput) => void
  readonly usedIds: ReadonlySet<string>
  readonly sourceById: ReadonlyMap<string, DirectorOutlineAuthor>
  readonly t: Translate
}) {
  return (
    <div className={css.outlineCollection}>
      <div className={css.outlineFormGrid}>
        <label className={css.outlineFieldWide}><span>{t('outline.updatePolicy')}</span><select value={draft.updateMode} onChange={(event) => { setDraft({ ...draft, updateMode: event.target.value as DirectorOutlinePlayerInput['updateMode'] }) }}><option value="auto_unlocked">{t('outline.mode.auto')}</option><option value="review_all">{t('outline.mode.review')}</option></select></label>
        <label className={css.outlineFieldWide}><span>{t('outline.premise')}</span><textarea value={draft.premise} onChange={(event) => { setDraft({ ...draft, premise: event.target.value }) }} /></label>
        <label className={css.outlineLockToggle}><input type="checkbox" checked={draft.premiseLocked} onChange={(event) => { setDraft({ ...draft, premiseLocked: event.target.checked }) }} /><span>{t('outline.lockPremise')}</span></label>
      </div>
      <TextItemsEditor title={t('outline.themesTitle')} items={draft.themes} setItems={(themes) => { setDraft({ ...draft, themes }) }} create={() => ({ id: uniqueId('theme', usedIds), text: '', locked: false })} sourceById={sourceById} addLabel={t('outline.addTheme')} emptyLabel={t('outline.emptyThemes')} t={t} />
      <TextItemsEditor title={t('outline.constraintsTitle')} items={draft.hardConstraints} setItems={(hardConstraints) => { setDraft({ ...draft, hardConstraints }) }} create={() => ({ id: uniqueId('constraint', usedIds), text: '', locked: true })} sourceById={sourceById} addLabel={t('outline.addConstraint')} emptyLabel={t('outline.emptyConstraints')} t={t} />
    </div>
  )
}

function TextItemsEditor({ title, items, setItems, create, sourceById, addLabel, emptyLabel, t }: {
  readonly title: string
  readonly items: readonly OutlineTextItem[]
  readonly setItems: (items: readonly OutlineTextItem[]) => void
  readonly create: () => OutlineTextItem
  readonly sourceById: ReadonlyMap<string, DirectorOutlineAuthor>
  readonly addLabel: string
  readonly emptyLabel: string
  readonly t: Translate
}) {
  return (
    <CollectionEditor
      items={items}
      setItems={setItems}
      create={create}
      sourceById={sourceById}
      title={title}
      addLabel={addLabel}
      emptyLabel={emptyLabel}
      compact
      t={t}
      render={(item, update) => (
        <TextField label={title} value={item.text} onChange={(text) => { update({ ...item, text }) }} />
      )}
    />
  )
}

function CollectionEditor<T extends IdentifiedItem>({
  items,
  setItems,
  create,
  sourceById,
  title,
  addLabel,
  emptyLabel,
  compact = false,
  t,
  render,
}: {
  readonly items: readonly T[]
  readonly setItems: (items: readonly T[]) => void
  readonly create: () => T
  readonly sourceById: ReadonlyMap<string, DirectorOutlineAuthor>
  readonly title: string
  readonly addLabel: string
  readonly emptyLabel: string
  readonly compact?: boolean
  readonly t: Translate
  readonly render: (item: T, update: (item: T) => void) => ReactNode
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const updateAt = (index: number, item: T): void => { setItems(items.map((current, itemIndex) => itemIndex === index ? item : current)) }
  const move = (from: number, to: number): void => {
    if (to < 0 || to >= items.length || from === to) return
    const next = [...items]
    const [item] = next.splice(from, 1)
    if (item === undefined) return
    next.splice(to, 0, item)
    setItems(next)
  }
  const drop = (event: ReactDragEvent<HTMLElement>, index: number): void => {
    event.preventDefault()
    if (dragIndex !== null) move(dragIndex, index)
    setDragIndex(null)
  }
  return (
    <section className={css.outlineCollection}>
      <div className={css.outlineSectionHeader}>
        <strong>{title}</strong>
        <button type="button" onClick={() => { setItems([...items, create()]) }}>{addLabel}</button>
      </div>
      {items.length === 0 && <p className={css.characterEmpty}>{emptyLabel}</p>}
      <div className={compact ? css.outlineCompactCards : css.outlineCards}>
        {items.map((item, index) => (
          <article
            key={item.id}
            className={css.outlineCard}
            draggable
            onDragStart={() => { setDragIndex(index) }}
            onDragOver={(event) => { event.preventDefault() }}
            onDrop={(event) => { drop(event, index) }}
            onDragEnd={() => { setDragIndex(null) }}
          >
            <header className={css.outlineCardHeader}>
              <span className={css.outlineDragHandle} aria-hidden="true">⠿</span>
              <code>{item.id}</code>
              <span>{authorLabel(sourceById.get(item.id) ?? 'player', t)}</span>
              <label>
                <input
                  type="checkbox"
                  checked={item.locked}
                  onChange={(event) => { updateAt(index, { ...item, locked: event.target.checked }) }}
                />
                {t('outline.locked')}
              </label>
              <div>
                <button
                  type="button"
                  aria-label={t('outline.moveUp', { id: item.id })}
                  disabled={index === 0}
                  onClick={() => { move(index, index - 1) }}
                >↑</button>
                <button
                  type="button"
                  aria-label={t('outline.moveDown', { id: item.id })}
                  disabled={index === items.length - 1}
                  onClick={() => { move(index, index + 1) }}
                >↓</button>
                <button
                  type="button"
                  aria-label={t('outline.removeItem', { id: item.id })}
                  onClick={() => { setItems(items.filter((_, itemIndex) => itemIndex !== index)) }}
                >×</button>
              </div>
            </header>
            <div className={css.outlineCardBody}>{render(item, (next) => { updateAt(index, next) })}</div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ArcFields({ item, update, t }: {
  readonly item: OutlineArc
  readonly update: (item: OutlineArc) => void
  readonly t: Translate
}) {
  return (
    <div className={css.outlineFormGrid}>
      <TextField
        label={t('outline.field.title')}
        value={item.title}
        onChange={(title) => { update({ ...item, title }) }}
      />
      <SelectField
        label={t('outline.field.status')}
        value={item.status}
        options={['planned', 'active', 'resolved', 'abandoned']}
        t={t}
        onChange={(status) => { update({ ...item, status: status as OutlineArc['status'] }) }}
      />
      <TextField
        wide
        multiline
        label={t('outline.field.intent')}
        value={item.intent}
        onChange={(intent) => { update({ ...item, intent }) }}
      />
      <ListField
        label={t('outline.field.tensions')}
        value={item.tensions}
        onChange={(tensions) => { update({ ...item, tensions }) }}
      />
      <ListField
        label={t('outline.field.questions')}
        value={item.desiredQuestions}
        onChange={(desiredQuestions) => { update({ ...item, desiredQuestions }) }}
      />
      <ListField
        label={t('outline.field.completion')}
        value={item.completionSignals}
        onChange={(completionSignals) => { update({ ...item, completionSignals }) }}
      />
    </div>
  )
}

function BeatFields({ item, update, arcs, beats, t }: {
  readonly item: OutlineBeat
  readonly update: (item: OutlineBeat) => void
  readonly arcs: readonly OutlineArc[]
  readonly beats: readonly OutlineBeat[]
  readonly t: Translate
}) {
  return (
    <div className={css.outlineFormGrid}>
      <TextField label={t('outline.field.title')} value={item.title} onChange={(title) => { update({ ...item, title }) }} />
      <SelectField
        label={t('outline.field.status')}
        value={item.status}
        options={['candidate', 'armed', 'active', 'resolved', 'skipped', 'retired']}
        t={t}
        onChange={(status) => { update({ ...item, status: status as OutlineBeat['status'] }) }}
      />
      <label>
        <span>{t('outline.field.arc')}</span>
        <select
          value={item.arcId ?? ''}
          onChange={(event) => { update({ ...item, arcId: event.target.value || undefined }) }}
        >
          <option value="">{t('outline.none')}</option>
          {arcs.map(arc => <option key={arc.id} value={arc.id}>{arc.title || arc.id}</option>)}
        </select>
      </label>
      <NumberField label={t('outline.field.priority')} value={item.priority} min={1} max={5} onChange={(priority) => { update({ ...item, priority }) }} />
      <TextField wide multiline label={t('outline.field.intent')} value={item.intent} onChange={(intent) => { update({ ...item, intent }) }} />
      <DependencyField item={item} beats={beats} update={update} t={t} />
      <ListField
        label={t('outline.field.ledgerFacts')}
        value={item.prerequisiteLedgerFacts}
        onChange={(prerequisiteLedgerFacts) => { update({ ...item, prerequisiteLedgerFacts }) }}
      />
      <ListField label={t('outline.field.triggers')} value={item.triggerConditions} onChange={(triggerConditions) => { update({ ...item, triggerConditions }) }} />
      <ListField label={t('outline.field.pressure')} value={item.externalPressure} onChange={(externalPressure) => { update({ ...item, externalPressure }) }} />
      <ListField label={t('outline.field.reveals')} value={item.revealCandidates} onChange={(revealCandidates) => { update({ ...item, revealCandidates }) }} />
      <ListField label={t('outline.field.exit')} value={item.exitConditions} onChange={(exitConditions) => { update({ ...item, exitConditions }) }} />
      <ListField label={t('outline.field.fallbacks')} value={item.fallbackOptions} onChange={(fallbackOptions) => { update({ ...item, fallbackOptions }) }} />
      <ListField
        wide
        label={t('outline.field.resolvedEvents')}
        value={item.resolvedByEventRefs}
        onChange={(resolvedByEventRefs) => { update({ ...item, resolvedByEventRefs }) }}
      />
    </div>
  )
}

function DependencyField({ item, beats, update, t }: {
  readonly item: OutlineBeat
  readonly beats: readonly OutlineBeat[]
  readonly update: (item: OutlineBeat) => void
  readonly t: Translate
}) {
  const candidates = beats.filter(beat => beat.id !== item.id)
  return <fieldset className={`${css.outlineDependencyField} ${css.outlineFieldWide}`}><legend>{t('outline.field.dependencies')}</legend>{candidates.length === 0 && <span>{t('outline.dependenciesEmpty')}</span>}{candidates.map(beat => <label key={beat.id}><input type="checkbox" checked={item.prerequisiteBeatIds.includes(beat.id)} onChange={(event) => { update({ ...item, prerequisiteBeatIds: toggleValue(item.prerequisiteBeatIds, beat.id, event.target.checked) }) }} />{beat.title || beat.id}</label>)}</fieldset>
}

function ForeshadowFields({ item, update, beats, t }: {
  readonly item: OutlineForeshadow
  readonly update: (item: OutlineForeshadow) => void
  readonly beats: readonly OutlineBeat[]
  readonly t: Translate
}) {
  return (
    <div className={css.outlineFormGrid}>
      <TextField label={t('outline.field.title')} value={item.title} onChange={(title) => { update({ ...item, title }) }} /><SelectField label={t('outline.field.status')} value={item.status} options={['planned', 'available', 'planted', 'reinforced', 'paid_off', 'abandoned']} t={t} onChange={(status) => { update({ ...item, status: status as OutlineForeshadow['status'] }) }} />
      <TextField wide multiline label={t('outline.field.purpose')} value={item.narrativePurpose} onChange={(narrativePurpose) => { update({ ...item, narrativePurpose }) }} /><ListField label={t('outline.field.seeds')} value={item.seedCandidates} onChange={(seedCandidates) => { update({ ...item, seedCandidates }) }} /><TextField multiline label={t('outline.field.payoff')} value={item.intendedPayoff} onChange={(intendedPayoff) => { update({ ...item, intendedPayoff }) }} /><ListField label={t('outline.field.revealConditions')} value={item.revealConditions} onChange={(revealConditions) => { update({ ...item, revealConditions }) }} /><ListField label={t('outline.field.ambiguity')} value={item.ambiguityNotes} onChange={(ambiguityNotes) => { update({ ...item, ambiguityNotes }) }} />
      <BeatSelect label={t('outline.field.earliestBeat')} value={item.earliestBeatId} beats={beats} t={t} onChange={(earliestBeatId) => { update({ ...item, earliestBeatId }) }} /><BeatSelect label={t('outline.field.latestBeat')} value={item.latestBeatId} beats={beats} t={t} onChange={(latestBeatId) => { update({ ...item, latestBeatId }) }} />
      <ListField label={t('outline.field.dependencies')} value={item.dependencyIds} onChange={(dependencyIds) => { update({ ...item, dependencyIds }) }} /><ListField label={t('outline.field.plantedEvents')} value={item.plantedEventRefs} onChange={(plantedEventRefs) => { update({ ...item, plantedEventRefs }) }} /><ListField label={t('outline.field.payoffEvents')} value={item.payoffEventRefs} onChange={(payoffEventRefs) => { update({ ...item, payoffEventRefs }) }} />
    </div>
  )
}

function MysteryFields({ item, update, t }: {
  readonly item: OutlineMystery
  readonly update: (item: OutlineMystery) => void
  readonly t: Translate
}) {
  return <div className={css.outlineFormGrid}><TextField wide multiline label={t('outline.field.question')} value={item.question} onChange={(question) => { update({ ...item, question }) }} /><SelectField label={t('outline.field.status')} value={item.status} options={['open', 'answered', 'retired']} t={t} onChange={(status) => { update({ ...item, status: status as OutlineMystery['status'] }) }} /><TextField wide multiline label={t('outline.field.answerIntent')} value={item.answerIntent} onChange={(answerIntent) => { update({ ...item, answerIntent }) }} /><ListField wide label={t('outline.field.evidenceEvents')} value={item.evidenceEventRefs} onChange={(evidenceEventRefs) => { update({ ...item, evidenceEventRefs }) }} /></div>
}

function ClockFields({ item, update, t }: {
  readonly item: OutlineClock
  readonly update: (item: OutlineClock) => void
  readonly t: Translate
}) {
  const ratio = item.limit <= 0 ? 0 : Math.min(100, Math.round((item.progress / item.limit) * 100))
  return <div className={css.outlineFormGrid}><TextField label={t('outline.field.title')} value={item.title} onChange={(title) => { update({ ...item, title }) }} /><SelectField label={t('outline.field.status')} value={item.status} options={['active', 'paused', 'resolved']} t={t} onChange={(status) => { update({ ...item, status: status as OutlineClock['status'] }) }} /><NumberField label={t('outline.field.progress')} value={item.progress} min={0} onChange={(progress) => { update({ ...item, progress }) }} /><NumberField label={t('outline.field.limit')} value={item.limit} min={1} onChange={(limit) => { update({ ...item, limit }) }} /><div className={`${css.outlineClockProgress} ${css.outlineFieldWide}`}><span style={{ width: `${ratio}%` }} /></div><TextField multiline label={t('outline.field.trigger')} value={item.trigger} onChange={(trigger) => { update({ ...item, trigger }) }} /><TextField multiline label={t('outline.field.consequence')} value={item.consequence} onChange={(consequence) => { update({ ...item, consequence }) }} /></div>
}

function TextField({ label, value, onChange, multiline = false, wide = false }: {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly multiline?: boolean
  readonly wide?: boolean
}) {
  return (
    <label className={wide ? css.outlineFieldWide : undefined}>
      <span>{label}</span>
      {multiline
        ? <textarea value={value} onChange={(event) => { onChange(event.target.value) }} />
        : <input value={value} onChange={(event) => { onChange(event.target.value) }} />}
    </label>
  )
}

function ListField({ label, value, onChange, wide = false }: {
  readonly label: string
  readonly value: readonly string[]
  readonly onChange: (value: string[]) => void
  readonly wide?: boolean
}) {
  return <label className={wide ? css.outlineFieldWide : undefined}><span>{label}</span><textarea value={value.join('\n')} onChange={(event) => { onChange(lines(event.target.value)) }} /></label>
}

function SelectField({ label, value, options, t, onChange }: {
  readonly label: string
  readonly value: string
  readonly options: readonly string[]
  readonly t: Translate
  readonly onChange: (value: string) => void
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => { onChange(event.target.value) }}>
        {options.map(option => <option key={option} value={option}>{statusLabel(option, t)}</option>)}
      </select>
    </label>
  )
}

function NumberField({ label, value, min, max, onChange }: {
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max?: number
  readonly onChange: (value: number) => void
}) {
  return <label><span>{label}</span><input type="number" value={value} min={min} max={max} onChange={(event) => { onChange(Number(event.target.value)) }} /></label>
}

function BeatSelect({ label, value, beats, t, onChange }: {
  readonly label: string
  readonly value?: string | undefined
  readonly beats: readonly OutlineBeat[]
  readonly t: Translate
  readonly onChange: (value: string | undefined) => void
}) {
  return <label><span>{label}</span><select value={value ?? ''} onChange={(event) => { onChange(event.target.value || undefined) }}><option value="">{t('outline.none')}</option>{beats.map(beat => <option key={beat.id} value={beat.id}>{beat.title || beat.id}</option>)}</select></label>
}

function newArc(id: string): OutlineArc { return { id, locked: false, title: '', intent: '', status: 'planned', tensions: [], desiredQuestions: [], completionSignals: [] } }
function newBeat(id: string): OutlineBeat { return { id, locked: false, title: '', intent: '', status: 'candidate', priority: 3, prerequisiteLedgerFacts: [], prerequisiteBeatIds: [], triggerConditions: [], externalPressure: [], revealCandidates: [], exitConditions: [], fallbackOptions: [], resolvedByEventRefs: [] } }
function newForeshadow(id: string): OutlineForeshadow { return { id, locked: false, title: '', narrativePurpose: '', status: 'planned', seedCandidates: [], intendedPayoff: '', revealConditions: [], ambiguityNotes: [], dependencyIds: [], plantedEventRefs: [], payoffEventRefs: [] } }
function newMystery(id: string): OutlineMystery { return { id, locked: false, question: '', status: 'open', answerIntent: '', evidenceEventRefs: [] } }
function newClock(id: string): OutlineClock { return { id, locked: false, title: '', progress: 0, limit: 4, trigger: '', consequence: '', status: 'active' } }

function allIds(outline: DirectorOutlinePlayerInput): ReadonlySet<string> {
  return new Set([
    ...outline.themes,
    ...outline.hardConstraints,
    ...outline.arcs,
    ...outline.beats,
    ...outline.foreshadows,
    ...outline.mysteries,
    ...outline.clocks,
  ].map(item => item.id))
}
function uniqueId(prefix: string, used: ReadonlySet<string>): string { let sequence = 1; while (used.has(`${prefix}-${sequence}`)) sequence += 1; return `${prefix}-${sequence}` }
function lines(source: string): string[] { return source.split(/\r?\n/u).map(item => item.trim()).filter(Boolean) }
function toggleValue(values: readonly string[], value: string, selected: boolean): string[] {
  return selected ? [...values.filter(item => item !== value), value] : values.filter(item => item !== value)
}
function sectionCount(section: OutlineSection, outline: DirectorOutlinePlayerInput): number { return section === 'overview' ? outline.themes.length + outline.hardConstraints.length : outline[section].length }
function sectionGlyph(section: OutlineSection): string { if (section === 'overview') return '◇'; if (section === 'arcs') return '⌒'; if (section === 'beats') return '⋮'; if (section === 'foreshadows') return '✦'; if (section === 'mysteries') return '?'; return '◴' }

function statusLabel(status: string, t: Translate): string {
  const keys = { planned: 'outline.status.planned', active: 'outline.status.active', resolved: 'outline.status.resolved', abandoned: 'outline.status.abandoned', candidate: 'outline.status.candidate', armed: 'outline.status.armed', skipped: 'outline.status.skipped', retired: 'outline.status.retired', available: 'outline.status.available', planted: 'outline.status.planted', reinforced: 'outline.status.reinforced', paid_off: 'outline.status.paidOff', open: 'outline.status.open', answered: 'outline.status.answered', paused: 'outline.status.paused' } as const
  return status in keys ? t(keys[status as keyof typeof keys]) : status
}
function authorLabel(author: DirectorOutlineAuthor, t: Translate): string { if (author === 'player') return t('outline.author.player'); if (author === 'director') return t('outline.author.director'); return t('outline.author.system') }
function suggestionSections(patch: DirectorOutline['pendingSuggestions'][number]['patch']): string[] { return Object.keys(patch).filter(key => key !== 'expectedRevision' && key !== 'reason') }
function formatTimestamp(value: string): string {
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.valueOf()) ? value : timestamp.toLocaleString()
}
function message(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }
