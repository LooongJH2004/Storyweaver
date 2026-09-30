import { StorybookStateFields } from './StorybookStateFields.tsx'
import type {
  IStories,
  StorybookAuthoringValue,
  StoryContextPreviewValue,
} from '@deepseek-ai/dsh-api-story-controller/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { storyOwnsSession } from './RoleplayChrome.tsx'
import { NS } from './locales.ts'
import css from './RoleplayChrome.module.css'
import { WorkspaceCloseButton, WorkspaceDialog } from './WorkspaceDialog.tsx'

type PanelProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS>
type Translate = PanelProps['t']
type StorybookCommands = Pick<IStories, 'storybook' | 'updateStorybook' | 'contextPreview'>
  & Partial<Pick<IStories, 'rename' | 'setPremise' | 'actorStates'>>
type EditorMode = 'visual' | 'quick' | 'json'
type VisualSection = 'basics' | 'world' | 'guidance' | 'rules' | 'characters' | 'state'
type ActorCapability = 'speak' | 'act' | 'reflect' | 'memory' | 'goals' | 'schedule'

const CAPABILITIES: readonly ActorCapability[] = ['speak', 'act', 'reflect', 'memory', 'goals', 'schedule']

interface DirectorGuidanceShape {
  narrativeStyle: string
  atmosphereAndPacing: string
  focus: string[]
  avoid: string[]
  additionalInstructions: string
}

interface ActingGuidanceShape {
  speechStyle: string
  habitualActions: string[]
  decisionPrinciples: string[]
  emotionalTendencies: string[]
  taboos: string[]
  additionalInstructions: string
}

interface ContextRulesShape {
  director: { policy: string; tools: string }
  actor: { policy: string; tools: string }
}

interface StorybookActorDraft {
  actorId: string
  displayName: string
  appearance?: string
  initialKnowledgeJson?: string
  publicPersona: string
  rolePrompt: string
  stateJson: string
  capabilities: ActorCapability[]
  privateContextJson: string
  actingGuidance: ActingGuidanceShape
}

interface StorybookDraft {
  schemaVersion: 6
  commonKnowledge?: string[]
  id: string
  title: string
  premise: string
  settingJson: string
  worldTruthJson: string
  discussionSettings: { maxRounds: number }
  beatsJson: string
  directorRules: string[]
  directorPrompt: string
  reasoningLanguage: string
  contextRules: ContextRulesShape
  protagonistActorId: string | null
  directorGuidance: DirectorGuidanceShape
  characters: StorybookActorDraft[]
}

interface StorybookDocumentShape {
  schemaVersion: 6
  commonKnowledge?: string[]
  id: string
  title: string
  setting: Record<string, unknown>
  premise: string
  worldTruth: Record<string, unknown>
  discussionSettings: { maxRounds: number }
  directorPrompt: string
  reasoningLanguage: string
  contextRules: ContextRulesShape
  protagonistActorId: string | null
  characters: Array<{
    actorId: string
    displayName: string
    appearance?: string
    initialKnowledge?: unknown[]
    publicPersona: string
    rolePrompt: string
    state: unknown[]
    capabilities: ActorCapability[]
    privateContext: Record<string, unknown>
    actingGuidance: ActingGuidanceShape
  }>
  beats: Array<Record<string, unknown>>
  directorRules: string[]
  directorGuidance: DirectorGuidanceShape
}

interface StorybookSummary {
  readonly title: string
  readonly premise: string
  readonly actors: readonly { readonly actorId: string; readonly displayName: string; readonly protagonist: boolean }[]
  readonly directorRules: readonly string[]
  readonly beats: number
}

interface StorybookDiffEntry {
  readonly section: string
  readonly before: string
  readonly after: string
}

/** Bind the visual storybook authoring studio to path-free Client Story commands. */
export function storybookStudioPanel(commands: StorybookCommands, entry: { section: VisualSection; label: keyof typeof import('./locales.ts').zh } = { section: 'basics', label: 'storybook.workspace' }) {
  return function StorybookStudioPanel({ sessionId, useStories, t }: PanelProps) {
    const story = useStories?.(snapshot => snapshot.items.find(item => storyOwnsSession(item, sessionId)))
    const [open, setOpen] = useState(false)
    const [editing, setEditing] = useState(false)
    const [mode, setMode] = useState<EditorMode>('visual')
    const [section, setSection] = useState<VisualSection>(entry.section)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [value, setValue] = useState<StorybookAuthoringValue | null>(null)
    const [draft, setDraft] = useState<StorybookDraft | null>(null)
    const latestDraft = useRef(draft)
    latestDraft.current = draft
    const [undoDraft, setUndoDraft] = useState<StorybookDraft | null>(null)
    const [advancedSource, setAdvancedSource] = useState('')
    const [quickSource, setQuickSource] = useState('')
    const [quickTarget, setQuickTarget] = useState('director')
    const [importName, setImportName] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [revisionConflict, setRevisionConflict] = useState(false)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const importInput = useRef<HTMLInputElement>(null)
    const summary = useMemo(() => value === null ? null : summarize(value.storybookJson), [value])
    const dirty = useMemo(() => {
      if (!editing || value === null || draft === null) return false
      try {
        const source = mode === 'json' ? renderDocument(parseDocument(advancedSource, value.contextDefaults)) : renderDocument(fromDraft(draft))
        return source !== value.storybookJson
      } catch {
        return true
      }
    }, [advancedSource, draft, editing, mode, value])
    const diff = useMemo(() => {
      if (!dirty || value === null || draft === null) return []
      try {
        const current = parseDocument(value.storybookJson)
        const next = mode === 'json' ? parseDocument(advancedSource, value.contextDefaults) : fromDraft(draft)
        return changedTopLevelSections(current, next)
      } catch {
        return []
      }
    }, [advancedSource, dirty, draft, mode, value])
    const diffEntries = useMemo(() => {
      if (!dirty || value === null || draft === null) return []
      try {
        const current = parseDocument(value.storybookJson)
        const next = mode === 'json' ? parseDocument(advancedSource, value.contextDefaults) : fromDraft(draft)
        return changedTopLevelSections(current, next).map(sectionName => ({
          section: sectionName,
          before: diffValue(current[sectionName]),
          after: diffValue(next[sectionName]),
        }))
      } catch {
        return []
      }
    }, [advancedSource, dirty, draft, mode, value])
    const updateDraft = (next: StorybookDraft): void => {
      setUndoDraft(draft)
      setDraft(next)
    }
    const copyCurrentState = async (): Promise<void> => {
      if (story === undefined || draft === null || commands.actorStates === undefined) return
      const sourceDraft = draft
      try {
        const actors = await commands.actorStates(story.storyId)
        if (latestDraft.current !== sourceDraft) throw new Error(t('state.copyConflict'))
        updateDraft({ ...sourceDraft, characters: sourceDraft.characters.map((character) => {
          const actor = actors.find(item => item.actorId === character.actorId)
          return actor === undefined ? character : { ...character,
            stateJson: JSON.stringify(actor.dynamicState.entries.filter(item => item.active)
              .map(({ definition, value: stateValue }) => ({ definition, value: stateValue })), null, 2) }
        }) })
      } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : String(reason)) }
    }
    const close = useCallback((): void => {
      setOpen(false)
      triggerRef.current?.focus()
    }, [])

    useEffect(() => {
      setOpen(false)
      setEditing(false)
      setValue(null)
      setDraft(null)
      setUndoDraft(null)
      setAdvancedSource('')
      setQuickSource('')
      setQuickTarget('director')
      setImportName(null)
      setError(null)
      setRevisionConflict(false)
    }, [story?.storyId])

    const load = async (): Promise<void> => {
      if (story === undefined || loading) return
      setLoading(true)
      setError(null)
      setRevisionConflict(false)
      try {
        const loaded = await commands.storybook(story.storyId)
        setValue(loaded)
        setDraft(toDraft(parseDocument(loaded.storybookJson)))
        setUndoDraft(null)
        setAdvancedSource(loaded.storybookJson)
        setImportName(null)
        setRevisionConflict(false)
      } catch (reason: unknown) {
        setError(message(reason))
      } finally {
        setLoading(false)
      }
    }

    const toggle = (): void => {
      if (open) {
        close()
        return
      }
      setOpen(true)
      if (value === null) void load()
    }

    const beginEdit = (): void => {
      if (value === null) return
      try {
        setDraft(toDraft(parseDocument(value.storybookJson)))
        setUndoDraft(null)
        setAdvancedSource(value.storybookJson)
        setQuickSource('')
        setQuickTarget('director')
        setMode('visual')
        setSection(entry.section)
        setImportName(null)
        setError(null)
        setRevisionConflict(false)
        setEditing(true)
      } catch (reason: unknown) {
        setError(message(reason))
      }
    }

    const changeMode = (next: EditorMode): void => {
      if (next === mode || draft === null || value === null) return
      try {
        if (next === 'json') setAdvancedSource(renderDocument(fromDraft(draft)))
        else if (mode === 'json') setDraft(toDraft(parseDocument(advancedSource, value.contextDefaults)))
        setMode(next)
        setError(null)
      } catch (reason: unknown) {
        setError(message(reason))
      }
    }

    const applyQuickPaste = (): void => {
      if (draft === null) return
      const parsed = parseQuickPaste(quickSource)
      if (quickTarget === 'director') {
        updateDraft({ ...draft, directorGuidance: { ...draft.directorGuidance, ...parsed.director } })
      } else {
        const characters = draft.characters.map(actor => actor.actorId === quickTarget
          ? { ...actor, actingGuidance: { ...actor.actingGuidance, ...parsed.actor } }
          : actor)
        updateDraft({ ...draft, characters })
      }
      setMode('visual')
      setSection(quickTarget === 'director' ? 'guidance' : 'characters')
      setError(null)
      setRevisionConflict(false)
    }

    const save = async (): Promise<void> => {
      if (story === undefined || value === null || draft === null || saving) return
      setSaving(true)
      setError(null)
      try {
        const source = mode === 'json' ? renderDocument(parseDocument(advancedSource, value.contextDefaults)) : renderDocument(fromDraft(draft))
        const saved = await commands.updateStorybook(story.storyId, value.revision, source)
        const savedDocument = parseDocument(saved.storybookJson)
        await Promise.all([
          story.title === savedDocument.title || commands.rename === undefined
            ? Promise.resolve()
            : commands.rename(story.storyId, savedDocument.title),
          story.premise === savedDocument.premise || commands.setPremise === undefined
            ? Promise.resolve()
            : commands.setPremise(story.storyId, savedDocument.premise),
        ])
        setValue(saved)
        setDraft(toDraft(savedDocument))
        setUndoDraft(null)
        setAdvancedSource(saved.storybookJson)
        setImportName(null)
        setEditing(false)
      } catch (reason: unknown) {
        const detail = message(reason)
        setError(detail)
        setRevisionConflict(detail.includes('revision changed'))
      } finally {
        setSaving(false)
      }
    }

    const importStorybook = async (file: File): Promise<void> => {
      setError(null)
      try {
        const source = await file.text()
        if (value === null) throw new Error('Storybook defaults are not loaded')
        const imported = parseDocument(source, value.contextDefaults)
        setDraft(toDraft(imported))
        setUndoDraft(draft)
        setAdvancedSource(renderDocument(imported))
        setImportName(file.name)
        setMode('visual')
        setSection(entry.section)
        setEditing(true)
      } catch (reason: unknown) {
        setError(t('storybook.importError', { value: message(reason) }))
      }
    }

    const exportStorybook = (includeDraft = false): void => {
      if (value === null) return
      try {
        const source = includeDraft && draft !== null
          ? mode === 'json' ? renderDocument(parseDocument(advancedSource, value.contextDefaults)) : renderDocument(fromDraft(draft))
          : value.storybookJson
        const summaryValue = summarize(source)
        const anchor = document.createElement('a')
        anchor.href = `data:application/json;charset=utf-8,${encodeURIComponent(source)}`
        anchor.download = `${safeFilename(summaryValue?.title ?? 'storybook')}.storybook.json`
        document.body.append(anchor)
        anchor.click()
        anchor.remove()
        setError(null)
      } catch (reason: unknown) {
        setError(message(reason))
      }
    }

    const restoreSaved = (): void => {
      if (value === null) return
      setDraft(toDraft(parseDocument(value.storybookJson)))
      setUndoDraft(null)
      setAdvancedSource(value.storybookJson)
      setImportName(null)
      setMode('visual')
      setSection(entry.section)
      setError(null)
      setRevisionConflict(false)
    }

    return (
      <div className={css.outlinePanelRoot}>
        <button
          ref={triggerRef}
          type="button"
          className={`${css.characterPanelTrigger} ${css.storybookTrigger}`}
          aria-expanded={open}
          aria-label={t(entry.label === 'storybook.workspace' ? 'storybook.open' : entry.label)}
          disabled={story === undefined}
          onClick={toggle}
        >
          <span className={css.storybookTriggerGlyph} aria-hidden="true">▤</span>
          <span>{t(entry.label)}</span>
          {summary !== null && <span className={css.characterCount}>{summary.actors.length}</span>}
        </button>
        {open && (
          <WorkspaceDialog
            className={`${css.outlinePanel} ${css.storybookPanel}`}
            label={t('storybook.workspace')}
            storageKey="storybook"
            defaultSize={{ width: 920, height: 900 }}
            resizeLabels={{
              top: t('workspace.resizeTop'), right: t('workspace.resizeRight'),
              bottom: t('workspace.resizeBottom'), left: t('workspace.resizeLeft'),
            }}
            returnFocusRef={triggerRef}
            onClose={close}
          >
            <header className={css.characterPanelHeader}>
              <div>
                <strong>{t('storybook.workspace')}</strong>
                <p>{t('storybook.subtitle')}</p>
              </div>
              <div className={css.workspaceHeaderActions}>
                {!editing && (
                  <button type="button" onClick={beginEdit} disabled={value === null || loading}>
                    {t('storybook.edit')}
                  </button>
                )}
                <WorkspaceCloseButton label={t('workspace.close')} onClick={close} />
              </div>
            </header>
            <div className={css.workspaceBody}>
              {loading && <p className={css.characterEmpty}>{t('storybook.loading')}</p>}
              <input
                ref={importInput}
                className={css.storybookFileInput}
                type="file"
                accept="application/json,.json"
                aria-label={t('storybook.importLabel')}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file !== undefined) void importStorybook(file)
                }}
              />
              {value !== null && summary !== null && !editing && (
                <StorybookOverview
                  value={value}
                  summary={summary}
                  t={t}
                  reload={() => { void load() }}
                  importFile={() => { importInput.current?.click() }}
                  exportFile={exportStorybook}
                />
              )}
              {value !== null && draft !== null && editing && (
                <div className={css.storybookEditorShell}>
                  <BoundaryNotice t={t} />
                  <div className={css.storybookModeSwitch} role="tablist" aria-label={t('storybook.modeLabel')}>
                    <button type="button" role="tab" aria-selected={mode === 'visual'} onClick={() => { changeMode('visual') }}>
                      {t('storybook.mode.visual')}
                    </button>
                    <button type="button" role="tab" aria-selected={mode === 'quick'} onClick={() => { changeMode('quick') }}>
                      {t('storybook.mode.quick')}
                    </button>
                    <button type="button" role="tab" aria-selected={mode === 'json'} onClick={() => { changeMode('json') }}>
                      {t('storybook.mode.json')}
                    </button>
                  </div>
                  <div className={css.workspaceCommandBar} role="toolbar" aria-label={t('workspace.commands')}>
                    <div className={css.workspaceCommandPrimary}>
                      <button className={css.workspacePrimaryAction} type="button" disabled={saving} onClick={() => { void save() }}>
                        {saving ? t('storybook.saving') : t('storybook.save')}
                      </button>
                      <button type="button" disabled={saving} onClick={() => { setEditing(false); setError(null) }}>
                        {t('storybook.cancel')}
                      </button>
                    </div>
                    <div className={css.workspaceCommandSecondary}>
                      <button type="button" disabled={saving || undoDraft === null} onClick={() => {
                        if (undoDraft === null) return
                        const current = draft
                        setDraft(undoDraft)
                        setUndoDraft(current)
                      }}>{t('storybook.undo')}</button>
                      <button type="button" disabled={saving} onClick={restoreSaved}>{t('storybook.restore')}</button>
                      <button type="button" disabled={saving} onClick={() => { importInput.current?.click() }}>{t('storybook.import')}</button>
                      <button type="button" disabled={saving} onClick={() => { exportStorybook(true) }}>{t('storybook.exportDraft')}</button>
                    </div>
                  </div>
                  {mode === 'visual' && (
                    <>
                      {section === 'state' && commands.actorStates !== undefined && <button type="button" disabled={saving}
                        onClick={() => { void copyCurrentState() }}>{t('state.copyCurrent')}</button>}
                      {section === 'state' && <p>{t('state.copyCurrentHint')}</p>}
                      <VisualStorybookEditor draft={draft} setDraft={updateDraft} section={section} setSection={setSection} t={t} />
                    </>
                  )}
                  {mode === 'quick' && (
                    <div className={css.outlineEditor}>
                      <p>{t('storybook.quickHint')}</p>
                      <select aria-label={t('storybook.quickTarget')} value={quickTarget} onChange={(event) => { setQuickTarget(event.target.value) }}>
                        <option value="director">{t('storybook.quickDirector')}</option>
                        {draft.characters.map(actor => <option key={actor.actorId} value={actor.actorId}>{actor.displayName}</option>)}
                      </select>
                      <textarea value={quickSource} aria-label={t('storybook.quickLabel')} onChange={(event) => { setQuickSource(event.target.value) }} />
                      <button type="button" onClick={applyQuickPaste}>{t('storybook.quickApply')}</button>
                    </div>
                  )}
                  {mode === 'json' && (
                    <div className={css.outlineEditor}>
                      <p>{t('storybook.editorHint')}</p>
                      <textarea
                        value={advancedSource}
                        spellCheck={false}
                        aria-label={t('storybook.editorLabel')}
                        onChange={(event) => { setAdvancedSource(event.target.value) }}
                      />
                    </div>
                  )}
                  <footer className={css.storybookEditorActions}>
                    <div className={css.storybookEditorStatus}>
                      <span>{importName !== null
                        ? t('storybook.importReady', { value: importName })
                        : dirty
                          ? t('storybook.diff', { value: diff.join(', ') || t('storybook.diffInvalid') })
                          : t('storybook.saveHint')}</span>
                      {diffEntries.length > 0 && <StorybookDiff entries={diffEntries} t={t} />}
                    </div>
                  </footer>
                </div>
              )}
              {value !== null && summary !== null && !editing && story !== undefined && (
                <ContextPreviewPanel commands={commands} storyId={story.storyId} actors={summary.actors} t={t} />
              )}
              {error !== null && <p className={css.characterError}>{error}</p>}
              {revisionConflict && <button type="button" className={css.storybookConflictReload} onClick={() => { void load() }}>{t('storybook.loadLatest')}</button>}
            </div>
          </WorkspaceDialog>
        )}
      </div>
    )
  }
}

function StorybookDiff({ entries, t }: { readonly entries: readonly StorybookDiffEntry[]; readonly t: Translate }) {
  return (
    <details className={css.storybookDiff}>
      <summary>{t('storybook.diffPreview')}</summary>
      <div>
        {entries.map(entry => (
          <article key={entry.section}>
            <strong>{entry.section}</strong>
            <div><span>{t('storybook.diffBefore')}</span><pre>{entry.before}</pre></div>
            <div><span>{t('storybook.diffAfter')}</span><pre>{entry.after}</pre></div>
          </article>
        ))}
      </div>
    </details>
  )
}

function StorybookOverview({ value, summary, t, reload, importFile, exportFile }: {
  readonly value: StorybookAuthoringValue
  readonly summary: StorybookSummary
  readonly t: Translate
  readonly reload: () => void
  readonly importFile: () => void
  readonly exportFile: () => void
}) {
  return (
    <div className={css.outlineBody}>
      <div className={css.storybookHero}>
        <div>
          <span>{value.exists ? t('storybook.persisted') : t('storybook.new')}</span>
          <h4>{summary.title}</h4>
          <p>{summary.premise || t('storybook.noPremise')}</p>
        </div>
        <div className={css.storybookStats}>
          <span><strong>{summary.actors.length}</strong>{t('storybook.stat.characters')}</span>
          <span><strong>{summary.beats}</strong>{t('storybook.stat.beats')}</span>
          <span><strong>{summary.directorRules.length}</strong>{t('storybook.stat.rules')}</span>
        </div>
      </div>
      {summary.actors.length > 0 && (
        <section>
          <h4 className={css.storybookSectionTitle}>{t('storybook.cast')}</h4>
          <div className={css.storybookCastGrid}>
            {summary.actors.map(actor => (
              <span key={actor.actorId}>
                <i aria-hidden="true">{actor.displayName.slice(0, 1)}</i>
                {actor.displayName}
                {actor.protagonist && <em>{t('storybook.protagonistBadge')}</em>}
              </span>
            ))}
          </div>
        </section>
      )}
      <BoundaryNotice t={t} />
      <div className={css.storybookOverviewFooter}>
        <span>{t('storybook.revision', { value: value.revision.slice(0, 8) })}</span>
        <div className={css.storybookOverviewActions}>
          <button type="button" onClick={importFile}>{t('storybook.import')}</button>
          <button type="button" onClick={exportFile}>{t('storybook.export')}</button>
          <button type="button" onClick={reload}>{t('storybook.reload')}</button>
        </div>
      </div>
    </div>
  )
}

function BoundaryNotice({ t }: { readonly t: Translate }) {
  return (
    <section className={css.storybookBoundary}>
      <span aria-hidden="true">◆</span>
      <div>
        <strong>{t('storybook.protectedTitle')}</strong>
        <p>{t('storybook.protectedHint')}</p>
      </div>
    </section>
  )
}

function VisualStorybookEditor({ draft, setDraft, section, setSection, t }: {
  readonly draft: StorybookDraft
  readonly setDraft: (value: StorybookDraft) => void
  readonly section: VisualSection
  readonly setSection: (value: VisualSection) => void
  readonly t: Translate
}) {
  const [actorIndex, setActorIndex] = useState(0)
  const update = (patch: Partial<StorybookDraft>): void => { setDraft({ ...draft, ...patch }) }
  return (
    <div className={css.storybookVisualEditor}>
      <nav className={css.storybookSectionNav} aria-label={t('storybook.sections')}>
        {(['basics', 'world', 'guidance', 'rules', 'characters', 'state'] as const).map(name => (
          <button type="button" key={name} aria-pressed={section === name} onClick={() => { setSection(name) }}>
            <span aria-hidden="true">{sectionGlyph(name)}</span>
            {t(`storybook.section.${name}`)}
            {name === 'rules' && <small>{draft.directorRules.length}</small>}
            {name === 'characters' && <small>{draft.characters.length}</small>}
          </button>
        ))}
      </nav>
      <div className={css.storybookSectionBody}>
        {section === 'basics' && (
          <div className={css.storybookFormGrid}>
            <Field wide multiline label={t('people.commonKnowledge')} value={(draft.commonKnowledge ?? []).join('\n')} onChange={(value) => { update({ commonKnowledge: value.split('\n').filter(Boolean) }) }} />
            <Field label={t('storybook.field.title')} value={draft.title} onChange={(title) => { update({ title }) }} />
            <Field label={t('storybook.field.id')} value={draft.id} onChange={(id) => { update({ id }) }} />
            <Field
              wide
              multiline
              label={t('storybook.field.premise')}
              value={draft.premise}
              onChange={(premise) => { update({ premise }) }}
            />
            <NumberField
              label={t('storybook.field.discussionMaxRounds')}
              hint={t('storybook.hint.discussionMaxRounds')}
              value={draft.discussionSettings.maxRounds}
              min={1}
              max={20}
              onChange={(maxRounds) => { update({ discussionSettings: { maxRounds } }) }}
            />
          </div>
        )}
        {section === 'world' && (
          <div className={css.storybookJsonCards}>
            <JsonField
              label={t('storybook.field.setting')}
              hint={t('storybook.hint.setting')}
              value={draft.settingJson}
              onChange={(settingJson) => { update({ settingJson }) }}
            />
            <JsonField
              label={t('storybook.field.worldTruth')}
              hint={t('storybook.hint.worldTruth')}
              value={draft.worldTruthJson}
              onChange={(worldTruthJson) => { update({ worldTruthJson }) }}
            />
            <JsonField
              label={t('storybook.field.beats')}
              hint={t('storybook.hint.beats')}
              value={draft.beatsJson}
              onChange={(beatsJson) => { update({ beatsJson }) }}
            />
          </div>
        )}
        {section === 'guidance' && <DirectorGuidanceEditor draft={draft} setDraft={setDraft} t={t} />}
        {section === 'rules' && <RuleEditor draft={draft} setDraft={setDraft} t={t} />}
        {section === 'state' && <div>{draft.characters.map(actor => <section key={actor.actorId}>
          <h3>{actor.displayName}</h3><StorybookStateFields actorId={actor.actorId} actors={draft.characters} source={actor.stateJson}
            onChange={(stateJson) => { update({ characters: draft.characters.map(item => item.actorId === actor.actorId ? { ...item,
              stateJson } : item) }) }} t={t} />
        </section>)}</div>}
        {section === 'characters' && (
          <CharacterEditor
            draft={draft}
            setDraft={setDraft}
            actorIndex={actorIndex}
            setActorIndex={setActorIndex}
            t={t}
          />
        )}
      </div>
    </div>
  )
}

function DirectorGuidanceEditor({ draft, setDraft, t }: {
  readonly draft: StorybookDraft
  readonly setDraft: (value: StorybookDraft) => void
  readonly t: Translate
}) {
  const guidance = draft.directorGuidance
  const update = (patch: Partial<DirectorGuidanceShape>): void => {
    setDraft({ ...draft, directorGuidance: { ...guidance, ...patch } })
  }
  return (
    <div className={css.storybookActorForm}>
      <div className={css.storybookSectionHeading}>
        <div><strong>{t('storybook.directorGuidance')}</strong><p>{t('storybook.directorGuidanceHint')}</p></div>
        <button type="button" onClick={() => { setDraft({ ...draft, directorGuidance: emptyDirectorGuidance() }) }}>
          {t('storybook.restoreDefaults')}
        </button>
      </div>
      <div className={css.storybookFormGrid}>
        <Field wide label={t('storybook.field.reasoningLanguage')} value={draft.reasoningLanguage} onChange={(reasoningLanguage) => { setDraft({ ...draft, reasoningLanguage }) }} />
        <Field wide multiline label={t('storybook.field.directorPrompt')} value={draft.directorPrompt} onChange={(directorPrompt) => { setDraft({ ...draft, directorPrompt }) }} />
        <Field wide multiline label={t('storybook.guidance.narrativeStyle')} value={guidance.narrativeStyle} onChange={(narrativeStyle) => { update({ narrativeStyle }) }} />
        <Field wide multiline label={t('storybook.guidance.atmosphere')} value={guidance.atmosphereAndPacing} onChange={(atmosphereAndPacing) => { update({ atmosphereAndPacing }) }} />
        <ListField label={t('storybook.guidance.focus')} value={guidance.focus} onChange={(focus) => { update({ focus }) }} />
        <ListField label={t('storybook.guidance.avoid')} value={guidance.avoid} onChange={(avoid) => { update({ avoid }) }} />
        <Field wide multiline label={t('storybook.guidance.additional')} value={guidance.additionalInstructions} onChange={(additionalInstructions) => { update({ additionalInstructions }) }} />
      </div>
    </div>
  )
}

function RuleEditor({ draft, setDraft, t }: {
  readonly draft: StorybookDraft
  readonly setDraft: (value: StorybookDraft) => void
  readonly t: Translate
}) {
  return (
    <div className={css.storybookRuleList}>
      <div className={css.storybookSectionHeading}>
        <div>
          <strong>{t('storybook.section.rules')}</strong>
          <p>{t('storybook.hint.rules')}</p>
        </div>
        <button type="button" onClick={() => {
          setDraft({ ...draft, directorRules: [...draft.directorRules, ''] })
        }}>{t('storybook.addRule')}</button>
      </div>
      {draft.directorRules.map((rule, index) => (
        <div key={`rule-${index}`} className={css.storybookRuleRow}>
          <span>{index + 1}</span>
          <textarea
            value={rule}
            aria-label={t('storybook.ruleLabel', { value: index + 1 })}
            onChange={(event) => {
              const directorRules = [...draft.directorRules]
              directorRules[index] = event.target.value
              setDraft({ ...draft, directorRules })
            }}
          />
          <button
            type="button"
            aria-label={t('storybook.removeRule', { value: index + 1 })}
            onClick={() => {
              setDraft({
                ...draft,
                directorRules: draft.directorRules.filter((_item, itemIndex) => itemIndex !== index),
              })
            }}
          >×</button>
        </div>
      ))}
    </div>
  )
}

function CharacterEditor({ draft, setDraft, actorIndex, setActorIndex, t }: {
  readonly draft: StorybookDraft
  readonly setDraft: (value: StorybookDraft) => void
  readonly actorIndex: number
  readonly setActorIndex: (value: number) => void
  readonly t: Translate
}) {
  const actor = draft.characters[actorIndex]
  const actorImport = useRef<HTMLInputElement>(null)
  const [actorError, setActorError] = useState<string | null>(null)
  const updateActor = (patch: Partial<StorybookActorDraft>): void => {
    if (actor === undefined) return
    const characters = [...draft.characters]
    characters[actorIndex] = { ...actor, ...patch }
    setDraft({
      ...draft,
      characters,
      protagonistActorId: patch.actorId !== undefined && draft.protagonistActorId === actor.actorId
        ? patch.actorId
        : draft.protagonistActorId,
    })
  }
  const addActor = (): void => {
    const characters = [...draft.characters, {
      actorId: `actor-${draft.characters.length + 1}`,
      displayName: t('storybook.newCharacter'),
      publicPersona: '',
      rolePrompt: '',
      stateJson: '[]',
      capabilities: ['speak', 'act'],
      privateContextJson: compactJson({
        perspective: [], coreMemories: [], goals: [], intentions: [],
      }),
      actingGuidance: emptyActingGuidance(),
    } satisfies StorybookActorDraft]
    setDraft({ ...draft, characters, protagonistActorId: draft.protagonistActorId ?? characters.at(-1)?.actorId ?? null })
    setActorIndex(characters.length - 1)
  }
  const exportActor = (): void => {
    if (actor === undefined) return
    const value = fromDraft(draft).characters[actorIndex]
    if (value === undefined) return
    const anchor = document.createElement('a')
    anchor.href = `data:application/json;charset=utf-8,${encodeURIComponent(`${JSON.stringify(value, undefined, 2)}\n`)}`
    anchor.download = `${safeFilename(actor.displayName || actor.actorId)}.actor.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
  }
  const importActor = async (file: File): Promise<void> => {
    try {
      const value = JSON.parse(await file.text()) as Omit<
        StorybookDocumentShape['characters'][number], 'actingGuidance' | 'rolePrompt'
      > & { readonly actingGuidance?: ActingGuidanceShape; readonly rolePrompt?: string }
      const normalized = toDraft({
        ...fromDraft(draft),
        characters: [{
          ...value,
          rolePrompt: value.rolePrompt ?? '',
          actingGuidance: value.actingGuidance ?? emptyActingGuidance(),
        }],
      }).characters[0]
      if (normalized === undefined) throw new Error('Actor JSON is empty')
      const characters = [...draft.characters]
      characters[actorIndex] = normalized
      setDraft({
        ...draft,
        characters,
        protagonistActorId: draft.protagonistActorId === actor?.actorId
          ? normalized.actorId
          : draft.protagonistActorId,
      })
      setActorError(null)
    } catch (reason: unknown) {
      setActorError(message(reason))
    }
  }
  return (
    <div className={css.storybookCharacterEditor}>
      <div className={css.storybookCharacterRoster}>
        <div className={css.storybookSectionHeading}>
          <strong>{t('storybook.cast')}</strong>
          <button type="button" onClick={addActor}>{t('storybook.addCharacter')}</button>
        </div>
        {draft.characters.map((item, index) => (
          <button
            type="button"
            key={`${item.actorId}-${index}`}
            aria-pressed={actorIndex === index}
            onClick={() => { setActorIndex(index) }}
          >
            <i aria-hidden="true">{item.displayName.slice(0, 1) || '?'}</i>
            <span>{item.displayName || item.actorId}</span>
            {draft.protagonistActorId === item.actorId && <em>{t('storybook.protagonistBadge')}</em>}
          </button>
        ))}
      </div>
      {actor === undefined ? <p className={css.characterEmpty}>{t('storybook.noCharacters')}</p> : (
        <div className={css.storybookActorForm}>
          <div className={css.storybookSectionHeading}>
            <div><strong>{actor.displayName}</strong><p>{actor.actorId}</p></div>
            <div>
              <button
                type="button"
                aria-pressed={draft.protagonistActorId === actor.actorId}
                onClick={() => { setDraft({ ...draft, protagonistActorId: actor.actorId }) }}
              >{draft.protagonistActorId === actor.actorId
                  ? t('storybook.protagonistSelected')
                  : t('storybook.setProtagonist')}</button>
              <input ref={actorImport} className={css.storybookFileInput} type="file" accept="application/json,.json" aria-label={t('storybook.actorImportLabel')} onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file !== undefined) void importActor(file)
              }} />
              <button type="button" onClick={() => { actorImport.current?.click() }}>{t('storybook.actorImport')}</button>
              <button type="button" onClick={exportActor}>{t('storybook.actorExport')}</button>
              <button type="button" onClick={() => {
                const characters = draft.characters.filter((_item, index) => index !== actorIndex)
                setDraft({
                  ...draft,
                  characters,
                  protagonistActorId: draft.protagonistActorId === actor.actorId
                    ? characters[0]?.actorId ?? null
                    : draft.protagonistActorId,
                })
                setActorIndex(Math.max(0, actorIndex - 1))
              }}>{t('storybook.removeCharacter')}</button>
            </div>
          </div>
          {actorError !== null && <p className={css.characterError}>{actorError}</p>}
          <div className={css.storybookFormGrid}>
            <Field
              label={t('storybook.field.displayName')}
              value={actor.displayName}
              onChange={(displayName) => { updateActor({ displayName }) }}
            />
            <Field
              label={t('storybook.field.actorId')}
              value={actor.actorId}
              onChange={(actorId) => { updateActor({ actorId }) }}
            />
            <Field multiline label={t('people.appearance')} value={actor.appearance ?? ''} onChange={(appearance) => { updateActor({ appearance }) }} />
            <Field multiline label={t('people.initialKnowledge')} value={actor.initialKnowledgeJson ?? '[]'} onChange={(value) => { updateActor({ initialKnowledgeJson: value }) }} />
            <Field
              wide
              multiline
              label={t('storybook.field.persona')}
              value={actor.publicPersona}
              onChange={(publicPersona) => { updateActor({ publicPersona }) }}
            />
            <Field
              wide
              multiline
              label={t('storybook.field.rolePrompt')}
              value={actor.rolePrompt}
              onChange={(rolePrompt) => { updateActor({ rolePrompt }) }}
            />
          </div>
          <fieldset className={css.storybookCapabilities}>
            <legend>{t('storybook.field.capabilities')}</legend>
            {CAPABILITIES.map(capability => (
              <label key={capability}>
                <input
                  type="checkbox"
                  checked={actor.capabilities.includes(capability)}
                  onChange={(event) => {
                    const capabilities = event.target.checked
                      ? [...actor.capabilities, capability]
                      : actor.capabilities.filter(item => item !== capability)
                    updateActor({ capabilities })
                  }}
                />
                {t(`storybook.capability.${capability}`)}
              </label>
            ))}
          </fieldset>
          <StorybookStateFields key={actor.actorId} source={actor.stateJson} actorId={actor.actorId}
            actors={draft.characters} t={t} onChange={(stateJson) => { updateActor({ stateJson }) }} />
          <div className={css.storybookJsonCards}>
            <JsonField
              label={t('storybook.field.state')}
              hint={t('storybook.hint.state')}
              value={actor.stateJson}
              onChange={(stateJson) => { updateActor({ stateJson }) }}
            />
            <JsonField
              label={t('storybook.field.privateContext')}
              hint={t('storybook.hint.privateContext')}
              value={actor.privateContextJson}
              onChange={(privateContextJson) => { updateActor({ privateContextJson }) }}
            />
          </div>
          <div className={css.storybookActorForm}>
            <div className={css.storybookSectionHeading}>
              <div><strong>{t('storybook.actingGuidance')}</strong><p>{t('storybook.actingGuidanceHint')}</p></div>
              <button type="button" onClick={() => { updateActor({ actingGuidance: emptyActingGuidance() }) }}>
                {t('storybook.restoreDefaults')}
              </button>
            </div>
            <div className={css.storybookFormGrid}>
              <Field wide multiline label={t('storybook.guidance.speechStyle')} value={actor.actingGuidance.speechStyle} onChange={(speechStyle) => { updateActor({ actingGuidance: { ...actor.actingGuidance, speechStyle } }) }} />
              <ListField label={t('storybook.guidance.habits')} value={actor.actingGuidance.habitualActions} onChange={(habitualActions) => { updateActor({ actingGuidance: { ...actor.actingGuidance, habitualActions } }) }} />
              <ListField label={t('storybook.guidance.decisions')} value={actor.actingGuidance.decisionPrinciples} onChange={(decisionPrinciples) => { updateActor({ actingGuidance: { ...actor.actingGuidance, decisionPrinciples } }) }} />
              <ListField label={t('storybook.guidance.emotions')} value={actor.actingGuidance.emotionalTendencies} onChange={(emotionalTendencies) => { updateActor({ actingGuidance: { ...actor.actingGuidance, emotionalTendencies } }) }} />
              <ListField label={t('storybook.guidance.taboos')} value={actor.actingGuidance.taboos} onChange={(taboos) => { updateActor({ actingGuidance: { ...actor.actingGuidance, taboos } }) }} />
              <Field wide multiline label={t('storybook.guidance.additional')} value={actor.actingGuidance.additionalInstructions} onChange={(additionalInstructions) => { updateActor({ actingGuidance: { ...actor.actingGuidance, additionalInstructions } }) }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, multiline = false, wide = false }: {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly multiline?: boolean
  readonly wide?: boolean
}) {
  return (
    <label className={wide ? css.storybookFieldWide : undefined}>
      <span>{label}</span>
      {multiline
        ? <textarea value={value} onChange={(event) => { onChange(event.target.value) }} />
        : <input value={value} onChange={(event) => { onChange(event.target.value) }} />}
    </label>
  )
}

function NumberField({ label, hint, value, min, max, onChange }: {
  readonly label: string
  readonly hint: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly onChange: (value: number) => void
}) {
  const hintId = 'discussion-max-rounds-hint'
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        aria-describedby={hintId}
        onChange={(event) => { onChange(Number(event.target.value)) }}
      />
      <small id={hintId}>{hint}</small>
    </label>
  )
}

function JsonField({ label, hint, value, onChange }: {
  readonly label: string
  readonly hint: string
  readonly value: string
  readonly onChange: (value: string) => void
}) {
  return (
    <label className={css.storybookJsonField}>
      <strong>{label}</strong>
      <span>{hint}</span>
      <textarea
        value={value}
        spellCheck={false}
        aria-label={label}
        onChange={(event) => { onChange(event.target.value) }}
      />
    </label>
  )
}

function ListField({ label, value, onChange }: {
  readonly label: string
  readonly value: readonly string[]
  readonly onChange: (value: string[]) => void
}) {
  return (
    <label>
      <span>{label}</span>
      <textarea value={value.join('\n')} onChange={(event) => { onChange(lines(event.target.value)) }} />
    </label>
  )
}

function ContextPreviewPanel({ commands, storyId, actors, t }: {
  readonly commands: StorybookCommands
  readonly storyId: Parameters<IStories['storybook']>[0]
  readonly actors: readonly { readonly actorId: string; readonly displayName: string }[]
  readonly t: Translate
}) {
  const [target, setTarget] = useState('director')
  const [preview, setPreview] = useState<StoryContextPreviewValue | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = async (): Promise<void> => {
    try {
      setError(null)
      setPreview(await commands.contextPreview(
        storyId,
        target === 'director' ? 'director' : 'actor',
        target === 'director' ? undefined : target,
      ))
    } catch (reason: unknown) {
      setError(message(reason))
    }
  }
  return (
    <section className={css.storybookBoundary}>
      <div>
        <strong>{t('storybook.contextPreview')}</strong>
        <p>{t('storybook.contextPreviewHint')}</p>
        <select aria-label={t('storybook.contextTarget')} value={target} onChange={(event) => { setTarget(event.target.value); setPreview(null) }}>
          <option value="director">{t('storybook.quickDirector')}</option>
          {actors.map(actor => <option key={actor.actorId} value={actor.actorId}>{actor.displayName} ({actor.actorId})</option>)}
        </select>
        <button type="button" onClick={() => { void load() }}>{t('storybook.contextLoad')}</button>
        {error !== null && <p className={css.characterError}>{error}</p>}
        {preview?.pendingActorInitialization === true && <p role="status">{t('context.pendingActorInitialization')}</p>}
        {preview?.sections.map(item => (
          <details key={item.id}>
            <summary>{item.title} · {item.role} · {item.source} · {item.permission} · {item.visibility}</summary>
            <p>{item.reason}</p>
            <pre>{item.content}</pre>
          </details>
        ))}
      </div>
    </section>
  )
}

function parseDocument(
  source: string,
  defaults?: StorybookAuthoringValue['contextDefaults'],
): StorybookDocumentShape {
  const decoded: unknown = JSON.parse(source)
  const contextValue = defaults === undefined ? decoded : materializeContextDefaults(decoded, defaults)
  const value = materializeProtagonistDefault(contextValue)
  if (typeof value !== 'object' || value === null || !('schemaVersion' in value) || value.schemaVersion !== 6
    || !('directorPrompt' in value) || typeof value.directorPrompt !== 'string'
    || !('discussionSettings' in value) || !isDiscussionSettings(value.discussionSettings)
    || !('reasoningLanguage' in value) || typeof value.reasoningLanguage !== 'string' || value.reasoningLanguage.trim() === ''
    || !('contextRules' in value) || !isContextRules(value.contextRules)
    || !('protagonistActorId' in value)
    || (value.protagonistActorId !== null && typeof value.protagonistActorId !== 'string')
    || !('directorGuidance' in value) || typeof value.directorGuidance !== 'object' || value.directorGuidance === null
    || !('characters' in value) || !Array.isArray(value.characters)
    || value.characters.some((actor: unknown) => {
      if (typeof actor !== 'object' || actor === null) return true
      const candidate = actor as Record<string, unknown>
      return typeof candidate.rolePrompt !== 'string'
        || typeof candidate.actingGuidance !== 'object' || candidate.actingGuidance === null
    })) {
    throw new Error('故事书不是当前完整格式：必须使用 schemaVersion 6，并包含导演设定、导演指导，以及每个角色的角色设定、主观经历和表演指导。思考语言与四项上下文规则可以留空并自动采用默认值。')
  }
  return value as StorybookDocumentShape
}

function materializeProtagonistDefault(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input
  const source = input as Record<string, unknown>
  if (!emptyDefaultValue(source.protagonistActorId)) return input
  const characters: unknown = source.characters
  const first: unknown = Array.isArray(characters) ? characters[0] : undefined
  return {
    ...source,
    protagonistActorId: typeof first === 'object' && first !== null
      && typeof (first as Record<string, unknown>).actorId === 'string'
      ? (first as Record<string, unknown>).actorId
      : null,
  }
}

function materializeContextDefaults(
  input: unknown,
  defaults: StorybookAuthoringValue['contextDefaults'],
): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)
    || !('schemaVersion' in input) || input.schemaVersion !== 6) return input
  const source = input as Record<string, unknown>
  const rules = source.contextRules
  const normalizedRules = emptyDefaultValue(rules)
    ? structuredClone(defaults.contextRules)
    : typeof rules === 'object' && rules !== null && !Array.isArray(rules)
      ? {
        ...rules,
        director: materializeContextRuleSide((rules as Record<string, unknown>).director, defaults.contextRules.director),
        actor: materializeContextRuleSide((rules as Record<string, unknown>).actor, defaults.contextRules.actor),
      }
      : rules
  return {
    ...source,
    protagonistActorId: emptyDefaultValue(source.protagonistActorId)
      ? Array.isArray(source.characters)
        && typeof source.characters[0] === 'object' && source.characters[0] !== null
        && typeof (source.characters[0] as Record<string, unknown>).actorId === 'string'
        ? (source.characters[0] as Record<string, unknown>).actorId
        : null
      : source.protagonistActorId,
    discussionSettings: emptyDefaultValue(source.discussionSettings)
      ? structuredClone(defaults.discussionSettings)
      : source.discussionSettings,
    reasoningLanguage: emptyDefaultValue(source.reasoningLanguage)
      ? defaults.reasoningLanguage
      : source.reasoningLanguage,
    contextRules: normalizedRules,
  }
}

function materializeContextRuleSide(
  input: unknown,
  defaults: { readonly policy: string; readonly tools: string },
): unknown {
  if (emptyDefaultValue(input)) return { ...defaults }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input
  const source = input as Record<string, unknown>
  return {
    ...source,
    policy: emptyDefaultValue(source.policy) ? defaults.policy : source.policy,
    tools: emptyDefaultValue(source.tools) ? defaults.tools : source.tools,
  }
}

function emptyDefaultValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}

function isDiscussionSettings(value: unknown): value is { maxRounds: number } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const maxRounds = (value as Record<string, unknown>).maxRounds
  return typeof maxRounds === 'number' && Number.isInteger(maxRounds) && maxRounds >= 1 && maxRounds <= 20
}

function toDraft(document: StorybookDocumentShape): StorybookDraft {
  return {
    schemaVersion: 6,
    id: document.id,
    title: document.title,
    commonKnowledge: document.commonKnowledge ?? [],
    premise: document.premise,
    settingJson: compactJson(document.setting),
    worldTruthJson: compactJson(document.worldTruth),
    discussionSettings: { ...document.discussionSettings },
    beatsJson: compactJson(document.beats),
    directorRules: [...document.directorRules],
    directorPrompt: document.directorPrompt,
    reasoningLanguage: document.reasoningLanguage,
    contextRules: structuredClone(document.contextRules),
    protagonistActorId: document.protagonistActorId,
    directorGuidance: {
      ...document.directorGuidance,
      focus: [...document.directorGuidance.focus],
      avoid: [...document.directorGuidance.avoid],
    },
    characters: document.characters.map(actor => ({
      actorId: actor.actorId,
      displayName: actor.displayName,
      appearance: actor.appearance ?? '未具名的人物',
      initialKnowledgeJson: compactJson(actor.initialKnowledge ?? []),
      publicPersona: actor.publicPersona,
      rolePrompt: actor.rolePrompt,
      stateJson: compactJson(actor.state),
      capabilities: [...actor.capabilities],
      privateContextJson: compactJson(actor.privateContext),
      actingGuidance: copyActingGuidance(actor.actingGuidance),
    })),
  }
}

function fromDraft(draft: StorybookDraft): StorybookDocumentShape {
  return {
    schemaVersion: 6,
    id: draft.id,
    title: draft.title,
    commonKnowledge: draft.commonKnowledge ?? [],
    setting: parseObject(draft.settingJson, 'setting'),
    premise: draft.premise,
    worldTruth: parseObject(draft.worldTruthJson, 'worldTruth'),
    discussionSettings: { maxRounds: draft.discussionSettings.maxRounds },
    directorPrompt: draft.directorPrompt,
    reasoningLanguage: requiredText(draft.reasoningLanguage, 'reasoningLanguage'),
    contextRules: structuredClone(draft.contextRules),
    protagonistActorId: draft.protagonistActorId,
    characters: draft.characters.map(actor => ({
      actorId: actor.actorId,
      displayName: actor.displayName,
      appearance: actor.appearance ?? '未具名的人物',
      initialKnowledge: parseArray(actor.initialKnowledgeJson ?? '[]', `${actor.displayName || actor.actorId}.initialKnowledge`),
      publicPersona: actor.publicPersona,
      rolePrompt: actor.rolePrompt,
      state: parseArray(actor.stateJson, `${actor.displayName || actor.actorId}.state`),
      capabilities: actor.capabilities,
      privateContext: parseObject(actor.privateContextJson, `${actor.displayName || actor.actorId}.privateContext`),
      actingGuidance: actor.actingGuidance,
    })),
    beats: parseArray(draft.beatsJson, 'beats'),
    directorRules: draft.directorRules,
    directorGuidance: draft.directorGuidance,
  }
}

function summarize(source: string): StorybookSummary | null {
  try {
    const value = parseDocument(source)
    return {
      title: value.title,
      premise: value.premise,
      directorRules: value.directorRules,
      actors: value.characters.map(actor => ({
        actorId: actor.actorId,
        displayName: actor.displayName,
        protagonist: actor.actorId === value.protagonistActorId,
      })),
      beats: value.beats.length,
    }
  } catch {
    return null
  }
}

function isContextRules(value: unknown): value is ContextRulesShape {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const rules = value as Record<string, unknown>
  return isContextRuleSide(rules.director) && isContextRuleSide(rules.actor)
}

function isContextRuleSide(value: unknown): value is ContextRulesShape['director'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const side = value as Record<string, unknown>
  return typeof side.policy === 'string' && typeof side.tools === 'string'
}

function parseObject(source: string, field: string): Record<string, unknown> {
  const value = JSON.parse(source) as unknown
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${field} must be a JSON object`)
  return value as Record<string, unknown>
}

function parseArray(source: string, field: string): Array<Record<string, unknown>> {
  const value = JSON.parse(source) as unknown
  if (!Array.isArray(value)) throw new Error(`${field} must be a JSON array`)
  return value as Array<Record<string, unknown>>
}

function compactJson(value: unknown): string {
  return JSON.stringify(value, undefined, 2)
}

function renderDocument(value: StorybookDocumentShape): string {
  return `${JSON.stringify(value, undefined, 2)}\n`
}

function changedTopLevelSections(current: StorybookDocumentShape, next: StorybookDocumentShape): Array<keyof StorybookDocumentShape> {
  return (['title', 'premise', 'setting', 'worldTruth', 'discussionSettings', 'reasoningLanguage', 'contextRules', 'directorPrompt', 'directorGuidance', 'directorRules', 'characters', 'beats'] as const)
    .filter(key => JSON.stringify(current[key]) !== JSON.stringify(next[key]))
}

function diffValue(value: unknown): string {
  const rendered = typeof value === 'string' ? value : JSON.stringify(value, undefined, 2)
  return rendered.length <= 800 ? rendered : `${rendered.slice(0, 797)}…`
}

function requiredText(value: string, field: string): string {
  const accepted = value.trim()
  if (accepted === '') throw new Error(`${field} must not be empty`)
  return accepted
}

function sectionGlyph(section: VisualSection): string {
  if (section === 'basics') return '◇'
  if (section === 'world') return '◎'
  if (section === 'guidance') return '◐'
  if (section === 'rules') return '✧'
  return '◈'
}

function emptyDirectorGuidance(): DirectorGuidanceShape {
  return { narrativeStyle: '', atmosphereAndPacing: '', focus: [], avoid: [], additionalInstructions: '' }
}

function emptyActingGuidance(): ActingGuidanceShape {
  return {
    speechStyle: '', habitualActions: [], decisionPrinciples: [], emotionalTendencies: [],
    taboos: [], additionalInstructions: '',
  }
}

function copyActingGuidance(value: ActingGuidanceShape): ActingGuidanceShape {
  return {
    ...value,
    habitualActions: [...value.habitualActions],
    decisionPrinciples: [...value.decisionPrinciples],
    emotionalTendencies: [...value.emotionalTendencies],
    taboos: [...value.taboos],
  }
}

function lines(value: string): string[] {
  return value.split(/\r?\n/u).map(item => item.trim()).filter(Boolean)
}

function parseQuickPaste(source: string): {
  readonly director: Partial<DirectorGuidanceShape>
  readonly actor: Partial<ActingGuidanceShape>
} {
  const fields = new Map<string, string>()
  let current = 'additional'
  for (const line of source.split(/\r?\n/u)) {
    const match = /^(style|pace|focus|avoid|speech|habits|decisions|emotions|taboos|additional)\s*[:：]\s*(.*)$/iu.exec(line)
    if (match !== null) {
      current = match[1]?.toLowerCase() ?? 'additional'
      fields.set(current, match[2] ?? '')
    } else {
      fields.set(current, [fields.get(current), line].filter(Boolean).join('\n'))
    }
  }
  const list = (key: string): string[] | undefined => {
    const value = fields.get(key)
    return value === undefined ? undefined : value.split(/[;；\n]/u).map(item => item.trim()).filter(Boolean)
  }
  const additional = fields.get('additional') ?? (fields.size === 0 ? source.trim() : '')
  return {
    director: {
      ...(fields.get('style') === undefined ? {} : { narrativeStyle: fields.get('style') as string }),
      ...(fields.get('pace') === undefined ? {} : { atmosphereAndPacing: fields.get('pace') as string }),
      ...(list('focus') === undefined ? {} : { focus: list('focus') as string[] }),
      ...(list('avoid') === undefined ? {} : { avoid: list('avoid') as string[] }),
      ...(additional.length === 0 ? {} : { additionalInstructions: additional }),
    },
    actor: {
      ...(fields.get('speech') === undefined ? {} : { speechStyle: fields.get('speech') as string }),
      ...(list('habits') === undefined ? {} : { habitualActions: list('habits') as string[] }),
      ...(list('decisions') === undefined ? {} : { decisionPrinciples: list('decisions') as string[] }),
      ...(list('emotions') === undefined ? {} : { emotionalTendencies: list('emotions') as string[] }),
      ...(list('taboos') === undefined ? {} : { taboos: list('taboos') as string[] }),
      ...(additional.length === 0 ? {} : { additionalInstructions: additional }),
    },
  }
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

function safeFilename(value: string): string {
  const normalized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '-').replace(/[. ]+$/u, '')
  return normalized || 'storybook'
}
