/** Unified context definition, effective preview, memory editing, and drag orchestration workspace. */

import type {
  IStories,
  StoryContextPreviewValue,
  StoryContextRecipeSection,
  StoryContextRuleUpdateRequest,
  StoryContextSection,
  StorybookAuthoringValue,
  StoryMemoryEntry,
  StoryPromptSettingsValue,
  StoryPromptUpdateRequest,
  StoryReasoningLanguageUpdateRequest,
  StoryView,
} from '@deepseek-ai/dsh-api-story-controller/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, ReactNode } from 'react'
import { storyOwnsSession } from './RoleplayChrome.tsx'
import { NS } from './locales.ts'
import css from './RoleplayChrome.module.css'
import { StyleEditor } from './StyleEditor.tsx'
import { WorkspaceCloseButton, WorkspaceDialog } from './WorkspaceDialog.tsx'

type PanelProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS>
type Translate = PanelProps['t']
type ContextTarget = 'director' | 'actor'
type PromptScope = 'storybook' | 'story'

interface MemoryDraft {
  readonly id: string
  readonly kind: 'scene' | 'arc'
  readonly title: string
  readonly directorSummary: string
  readonly publicSummary: string
  readonly actorMemories: Readonly<Record<string, string>>
  readonly eventRefs: readonly string[]
  readonly replaces: readonly string[]
}

/** Bind all player-owned context construction to one product workspace. */
export function contextBuilderPanel(commands: IStories, entry: { section: string; label: keyof typeof import('./locales.ts').zh } = { section: 'policy', label: 'contextBuilder.title' }) {
  return function ContextBuilderPanel({ sessionId, useStories, t }: PanelProps) {
    const story = useStories?.(snapshot => snapshot.items.find(item => storyOwnsSession(item, sessionId)))
    const [open, setOpen] = useState(false)
    const [settings, setSettings] = useState<StoryPromptSettingsValue | null>(null)
    const [storybookValue, setStorybookValue] = useState<StorybookAuthoringValue | null>(null)
    const [storybookDraft, setStorybookDraft] = useState('')
    const [target, setTarget] = useState<ContextTarget>('director')
    const [actorId, setActorId] = useState('')
    const [scope, setScope] = useState<PromptScope>('story')
    const [promptDraft, setPromptDraft] = useState('')
    const [restoreDefault, setRestoreDefault] = useState(false)
    const [policyDraft, setPolicyDraft] = useState('')
    const [toolsDraft, setToolsDraft] = useState('')
    const [restorePolicyDefault, setRestorePolicyDefault] = useState(false)
    const [restoreToolsDefault, setRestoreToolsDefault] = useState(false)
    const [reasoningLanguageDraft, setReasoningLanguageDraft] = useState('')
    const [restoreReasoningLanguageDefault, setRestoreReasoningLanguageDefault] = useState(false)
    const [directorRecipe, setDirectorRecipe] = useState<readonly StoryContextRecipeSection[]>([])
    const [actorRecipe, setActorRecipe] = useState<readonly StoryContextRecipeSection[]>([])
    const [selectedSectionId, setSelectedSectionId] = useState(entry.section)
    const [editorOpen, setEditorOpen] = useState(false)
    const [preview, setPreview] = useState<StoryContextPreviewValue | null>(null)
    const [memoryDraft, setMemoryDraft] = useState<MemoryDraft | null>(null)
    const [newMemoryKind, setNewMemoryKind] = useState<'scene' | 'arc'>('scene')
    const [newMemoryTitle, setNewMemoryTitle] = useState('')
    const [newMemoryDirectorSummary, setNewMemoryDirectorSummary] = useState('')
    const [newMemoryPublicSummary, setNewMemoryPublicSummary] = useState('')
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [status, setStatus] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)

    const selectedPrompt = useMemo(() => target === 'director'
      ? settings?.director
      : settings?.actors.find(actor => actor.actorId === actorId), [actorId, settings, target])
    const selectedReasoningLanguage = settings?.reasoningLanguage
    const selectedContextRules = settings?.contextRules[target]
    const selectedRecipe = target === 'director' ? directorRecipe : actorRecipe
    const setSelectedRecipe = target === 'director' ? setDirectorRecipe : setActorRecipe
    const selectedRecipeSection = selectedRecipe.find(section => section.id === selectedSectionId)
    const selectedPreviewSection = preview?.sections.find(section => section.id === selectedSectionId)
    const recipeDirty = story !== undefined && (
      JSON.stringify(directorRecipe) !== JSON.stringify(story.contextRecipe.director)
      || JSON.stringify(actorRecipe) !== JSON.stringify(story.contextRecipe.actor)
    )
    const recipeInvalid = [...directorRecipe, ...actorRecipe].some(section => section.content !== undefined
      && ((section.title?.trim() ?? '') === '' || section.content.trim() === ''))
    const storybookSource = useMemo(() => {
      if (storybookValue === null) return ''
      try {
        return editableStorybookSource(storybookValue.storybookJson, target, actorId)
      } catch {
        return storybookValue.storybookJson
      }
    }, [actorId, storybookValue, target])
    const storybookDirty = storybookValue !== null && storybookDraft !== storybookSource

    const resetPrompt = useCallback((value: typeof selectedPrompt, selectedScope: PromptScope): void => {
      if (value === undefined) return
      setPromptDraft(selectedScope === 'storybook' ? value.storybookPrompt : value.storyOverride ?? value.storybookPrompt)
      setRestoreDefault(false)
    }, [])

    const resetReasoningLanguage = useCallback((
      value: StoryPromptSettingsValue['reasoningLanguage'] | undefined,
      selectedScope: PromptScope,
    ): void => {
      if (value === undefined) return
      setReasoningLanguageDraft(selectedScope === 'storybook'
        ? value.storybookLanguage
        : value.storyOverride ?? value.storybookLanguage)
      setRestoreReasoningLanguageDefault(false)
    }, [])

    const resetContextRules = useCallback((
      value: typeof selectedContextRules,
      selectedScope: PromptScope,
    ): void => {
      if (value === undefined) return
      setPolicyDraft(selectedScope === 'storybook'
        ? value.policy.storybookPrompt
        : value.policy.storyOverride ?? value.policy.storybookPrompt)
      setToolsDraft(selectedScope === 'storybook'
        ? value.tools.storybookPrompt
        : value.tools.storyOverride ?? value.tools.storybookPrompt)
      setRestorePolicyDefault(false)
      setRestoreToolsDefault(false)
    }, [])

    const loadPreview = useCallback(async (): Promise<void> => {
      if (story === undefined || (target === 'actor' && actorId === '')) return
      try {
        setPreview(await commands.contextPreview(
          story.storyId,
          target,
          target === 'actor' ? actorId : undefined,
        ))
      } catch (reason: unknown) {
        setError(t('contextBuilder.error', { value: message(reason) }))
      }
    }, [actorId, commands, story, t, target])

    const load = useCallback(async (): Promise<void> => {
      if (story === undefined) return
      setLoading(true)
      setError(null)
      try {
        const [value, storybook] = await Promise.all([
          commands.prompts(story.storyId),
          commands.storybook(story.storyId),
        ])
        setSettings(value)
        setStorybookValue(storybook)
        const firstActor = value.actors[0]?.actorId ?? ''
        setActorId(current => value.actors.some(actor => actor.actorId === current) ? current : firstActor)
        setDirectorRecipe([...story.contextRecipe.director])
        setActorRecipe([...story.contextRecipe.actor])
      } catch (reason: unknown) {
        setError(t('contextBuilder.error', { value: message(reason) }))
      } finally {
        setLoading(false)
      }
    }, [commands, story, t])

    useEffect(() => {
      setOpen(false)
      setSettings(null)
      setStorybookValue(null)
      setStorybookDraft('')
      setTarget('director')
      setSelectedSectionId(entry.section)
      setEditorOpen(false)
      setScope(story?.templateOnly === true ? 'storybook' : 'story')
      setReasoningLanguageDraft('')
      setRestoreReasoningLanguageDefault(false)
      setPolicyDraft('')
      setToolsDraft('')
      setRestorePolicyDefault(false)
      setRestoreToolsDefault(false)
      setPreview(null)
      setMemoryDraft(null)
      setStatus(null)
      setError(null)
    }, [story?.storyId, story?.templateOnly])

    useEffect(() => {
      if (story === undefined) return
      setDirectorRecipe([...story.contextRecipe.director])
      setActorRecipe([...story.contextRecipe.actor])
    }, [story?.contextRecipe])
    useEffect(() => {
      if (settings === null) return
      setActorId(current => settings.actors.some(actor => actor.actorId === current)
        ? current
        : settings.actors[0]?.actorId ?? '')
    }, [settings])
    useEffect(() => {
      if (selectedRecipe.some(section => section.id === selectedSectionId)) return
      setSelectedSectionId(selectedRecipe[0]?.id ?? 'policy')
    }, [selectedRecipe, selectedSectionId])
    useEffect(() => { resetPrompt(selectedPrompt, scope) }, [resetPrompt, scope, selectedPrompt])
    useEffect(() => {
      resetReasoningLanguage(selectedReasoningLanguage, scope)
    }, [resetReasoningLanguage, scope, selectedReasoningLanguage])
    useEffect(() => {
      resetContextRules(selectedContextRules, scope)
    }, [resetContextRules, scope, selectedContextRules])
    useEffect(() => { setStorybookDraft(storybookSource) }, [storybookSource])
    useEffect(() => {
      if (open) void loadPreview()
    }, [loadPreview, open, story?.contextRecipe.revision, story?.memory.revision])

    const close = useCallback((): void => {
      setEditorOpen(false)
      setOpen(false)
      triggerRef.current?.focus()
    }, [])

    const run = async (operation: () => Promise<void>, success: string): Promise<void> => {
      if (saving) return
      setSaving(true)
      setStatus(null)
      setError(null)
      try {
        await operation()
        setStatus(success)
        await loadPreview()
      } catch (reason: unknown) {
        setError(t('contextBuilder.error', { value: message(reason) }))
      } finally {
        setSaving(false)
      }
    }

    const savePrompt = async (): Promise<void> => {
      if (story === undefined || settings === null || selectedPrompt === undefined) return
      const common = {
        storyId: story.storyId,
        target,
        ...(target === 'actor' ? { actorId } : {}),
      } as const
      const request: StoryPromptUpdateRequest = scope === 'storybook'
        ? { ...common, scope: 'storybook', expectedStorybookRevision: settings.storybookRevision, prompt: promptDraft }
        : {
          ...common,
          scope: 'story',
          expectedStoryPromptRevision: settings.storyPromptRevision,
          ...(restoreDefault ? {} : { prompt: promptDraft }),
        }
      await run(async () => {
        const value = await commands.updatePrompt(request)
        setSettings(value)
        if (scope === 'storybook') setStorybookValue(await commands.storybook(story.storyId))
        setRestoreDefault(false)
      }, t('prompts.saved'))
    }

    const saveReasoningLanguage = async (): Promise<void> => {
      if (story === undefined || settings === null) return
      const request: StoryReasoningLanguageUpdateRequest = scope === 'storybook'
        ? {
          storyId: story.storyId,
          scope: 'storybook',
          expectedStorybookRevision: settings.storybookRevision,
          language: reasoningLanguageDraft,
        }
        : {
          storyId: story.storyId,
          scope: 'story',
          expectedStoryPromptRevision: settings.storyPromptRevision,
          ...(restoreReasoningLanguageDefault ? {} : { language: reasoningLanguageDraft }),
        }
      await run(async () => {
        const value = await commands.updateReasoningLanguage(request)
        setSettings(value)
        if (scope === 'storybook') setStorybookValue(await commands.storybook(story.storyId))
        setRestoreReasoningLanguageDefault(false)
      }, t('contextBuilder.reasoningLanguageSaved'))
    }

    const saveContextRule = async (section: 'policy' | 'tools'): Promise<void> => {
      if (story === undefined || settings === null || selectedContextRules === undefined) return
      const draft = section === 'policy' ? policyDraft : toolsDraft
      const restore = section === 'policy' ? restorePolicyDefault : restoreToolsDefault
      const request: StoryContextRuleUpdateRequest = scope === 'storybook'
        ? {
          storyId: story.storyId,
          scope: 'storybook',
          expectedStorybookRevision: settings.storybookRevision,
          target,
          section,
          text: draft,
        }
        : {
          storyId: story.storyId,
          scope: 'story',
          expectedStoryPromptRevision: settings.storyPromptRevision,
          target,
          section,
          ...(restore ? {} : { text: draft }),
        }
      await run(async () => {
        const value = await commands.updateContextRule(request)
        setSettings(value)
        if (scope === 'storybook') setStorybookValue(await commands.storybook(story.storyId))
        if (section === 'policy') setRestorePolicyDefault(false)
        else setRestoreToolsDefault(false)
      }, t('contextBuilder.contextRuleSaved'))
    }

    const saveStorybookSource = async (): Promise<void> => {
      if (story === undefined || storybookValue === null) return
      await run(async () => {
        const source = mergeEditableStorybookSource(
          storybookValue.storybookJson,
          storybookDraft,
          target,
          actorId,
        )
        const document = parseJsonObject(source, t('contextBuilder.storybookSource'))
        const saved = await commands.updateStorybook(story.storyId, storybookValue.revision, source)
        await Promise.all([
          typeof document.title === 'string' && document.title.trim() !== '' && document.title !== story.title
            ? commands.rename(story.storyId, document.title)
            : Promise.resolve(),
          typeof document.premise === 'string' && document.premise !== story.premise
            ? commands.setPremise(story.storyId, document.premise)
            : Promise.resolve(),
        ])
        setStorybookValue(saved)
        setSettings(await commands.prompts(story.storyId))
      }, t('contextBuilder.storybookSaved'))
    }

    const focusEditableSource = (section: StoryContextSection): void => {
      setSelectedSectionId(section.id)
      if (['storybook', 'identity', 'actor-state'].includes(section.id)) setScope('storybook')
      setEditorOpen(true)
    }

    const updateSelectedRecipeSection = (update: (section: StoryContextRecipeSection) => StoryContextRecipeSection): void => {
      setSelectedRecipe(selectedRecipe.map(section => section.id === selectedSectionId ? update(section) : section))
      setStatus(null)
      setError(null)
    }

    const addCustomModule = (): void => {
      const id: StoryContextRecipeSection['id'] = `custom:${randomUUID()}`
      setSelectedRecipe([...selectedRecipe, {
        id,
        enabled: true,
        role: 'user',
        title: t('contextBuilder.customModuleDefaultTitle'),
        content: '',
      }])
      setSelectedSectionId(id)
      setEditorOpen(true)
      setStatus(null)
      setError(null)
    }

    const deleteCustomModule = (): void => {
      if (!selectedSectionId.startsWith('custom:')) return
      const next = selectedRecipe.filter(section => section.id !== selectedSectionId)
      setSelectedRecipe(next)
      setSelectedSectionId(next[0]?.id ?? 'policy')
      setEditorOpen(false)
      setStatus(null)
    }

    const saveRecipe = async (): Promise<void> => {
      if (story === undefined) return
      await run(async () => {
        await commands.updateContextRecipe(
          story.storyId,
          story.contextRecipe.revision,
          directorRecipe,
          actorRecipe,
        )
      }, t('contextBuilder.recipeSaved'))
    }

    const saveMemory = async (): Promise<void> => {
      if (story === undefined || memoryDraft === null) return
      await run(async () => {
        await commands.updateMemory(story.storyId, {
          expectedRevision: story.memory.revision,
          memoryId: memoryDraft.id,
          kind: memoryDraft.kind,
          title: required(memoryDraft.title, t('operations.memory.title')),
          directorSummary: required(memoryDraft.directorSummary, t('operations.memory.directorSummary')),
          publicSummary: memoryDraft.publicSummary,
          actorMemories: memoryDraft.actorMemories,
          eventRefs: memoryDraft.eventRefs,
          replaces: memoryDraft.replaces,
        })
        setMemoryDraft(null)
      }, t('contextBuilder.memorySaved'))
    }

    const createMemory = async (): Promise<void> => {
      if (story === undefined) return
      await run(async () => {
        await commands.proposeMemory(story.storyId, {
          expectedRevision: story.memory.revision,
          kind: newMemoryKind,
          title: required(newMemoryTitle, t('operations.memory.title')),
          directorSummary: required(newMemoryDirectorSummary, t('operations.memory.directorSummary')),
          publicSummary: newMemoryPublicSummary,
          actorMemories: {},
          eventRefs: [],
          proposedBy: 'player',
        })
        setNewMemoryTitle('')
        setNewMemoryDirectorSummary('')
        setNewMemoryPublicSummary('')
      }, t('contextBuilder.memoryProposed'))
    }

    return (
      <div className={css.outlinePanelRoot}>
        <button
          ref={triggerRef}
          type="button"
          className={`${css.characterPanelTrigger} ${css.contextBuilderTrigger}`}
          aria-expanded={open}
          aria-label={t(entry.section === 'style' ? 'style.title' : 'contextBuilder.open')}
          disabled={story === undefined}
          onClick={() => {
            if (open) close()
            else { setSelectedSectionId(entry.section); setEditorOpen(entry.section === 'style'); setOpen(true); void load() }
          }}
        >{t(entry.label)}</button>
        {open && story !== undefined && (
          <WorkspaceDialog
            className={`${css.outlinePanel} ${css.contextBuilderPanel}`}
            label={t('contextBuilder.title')}
            storageKey="story-context-builder"
            defaultSize={{ width: 1180, height: 900 }}
            resizeLabels={{
              top: t('workspace.resizeTop'), right: t('workspace.resizeRight'),
              bottom: t('workspace.resizeBottom'), left: t('workspace.resizeLeft'),
            }}
            returnFocusRef={triggerRef}
            onClose={close}
          >
            <header className={css.characterPanelHeader}>
              <div><strong>{t('contextBuilder.title')}</strong><p>{t('contextBuilder.subtitle')}</p></div>
              <WorkspaceCloseButton label={t('workspace.close')} onClick={close} />
            </header>
            <div className={css.contextBuilderTargetBar}>
              <div className={css.operationsTabs} role="tablist" aria-label={t('contextBuilder.target')}>
                <button type="button" role="tab" aria-selected={target === 'director'} onClick={() => { setEditorOpen(false); setTarget('director'); setStatus(null); setError(null) }}>{t('prompts.director')}</button>
                <button type="button" role="tab" aria-selected={target === 'actor'} disabled={settings?.actors.length === 0} onClick={() => { setEditorOpen(false); setTarget('actor'); setStatus(null); setError(null) }}>{t('prompts.actor')}</button>
              </div>
              {target === 'actor' && settings !== null && (
                <label>
                  <span>{t('prompts.selectActor')}</span>
                  <select value={actorId} onChange={(event) => {
                    setEditorOpen(false)
                    setActorId(event.target.value)
                    setStatus(null)
                    setError(null)
                  }}>
                    {settings.actors.map(actor => <option key={actor.actorId} value={actor.actorId}>{actor.displayName}</option>)}
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
            <div className={`${css.workspaceBody} ${css.contextBuilderBody}`}>
              {preview?.pendingActorInitialization === true && <p role="status">{t('context.pendingActorInitialization')}</p>}
              {loading && <p role="status">{t('contextBuilder.loading')}</p>}
              {settings !== null && selectedPrompt !== undefined && (
                <>
                  <section className={css.contextBuilderSection}>
                    <SectionHeading
                      eyebrow={t('contextBuilder.workbenchEyebrow')}
                      title={t('contextBuilder.workbenchTitle')}
                      hint={t('contextBuilder.workbenchHint')}
                    />
                    <div className={css.contextWorkbench}>
                      <div className={css.contextComposerColumn}>
                        <div className={css.contextRecipeToolbar}>
                          <button type="button" onClick={addCustomModule}>{t('contextBuilder.addCustomModule')}</button>
                        </div>
                        <ContextRecipeSorter
                          sections={selectedRecipe}
                          selectedId={editorOpen ? selectedSectionId : ''}
                          setSections={setSelectedRecipe}
                          onSelect={(id) => {
                            setSelectedSectionId(id)
                            if (['storybook', 'identity', 'actor-state'].includes(id)) setScope('storybook')
                            setEditorOpen(true)
                          }}
                          t={t}
                        />
                        <div className={css.contextBuilderStickyActions}>
                          <span>{recipeDirty ? t('contextBuilder.unsaved') : t('contextBuilder.savedState')}</span>
                          <button type="button" className={css.operationsPrimary} disabled={saving || !recipeDirty || recipeInvalid} onClick={() => { void saveRecipe() }}>{t('operations.context.save')}</button>
                          <button type="button" disabled={saving || !recipeDirty} onClick={() => {
                            setDirectorRecipe([...story.contextRecipe.director])
                            setActorRecipe([...story.contextRecipe.actor])
                          }}>{t('operations.context.cancel')}</button>
                        </div>
                      </div>
                    </div>
                    <Modal
                      open={editorOpen}
                      onClose={() => { setEditorOpen(false) }}
                      title={contextRecipeSectionLabel(selectedRecipeSection, selectedSectionId, t)}
                      description={contextRecipeSectionReason(selectedRecipeSection, selectedSectionId, t)}
                      closeLabel={t('workspace.close')}
                      className={css.contextModuleEditorDialog ?? ''}
                      contentClassName={css.contextModuleEditorContent ?? ''}
                    >
                      <div id="context-module-inspector" className={css.contextModuleInspector}>
                        {selectedRecipeSection !== undefined && <header className={css.contextModuleInspectorHeader}><div className={css.contextBadges}><span>{contextRoleLabel(selectedRecipeSection.role, t)}</span><span>{selectedRecipeSection.enabled ? t('operations.context.enabled') : t('contextBuilder.disabled')}</span></div></header>}
                        {['style', 'policy', 'tools', 'director-prompt', 'actor-prompt', 'reasoning-language', 'storybook', 'identity', 'actor-state'].includes(selectedSectionId) && <fieldset className={css.promptScopePicker}>
                          <legend>{t('prompts.scope')}</legend>
                          <label><input type="radio" checked={scope === 'storybook'} onChange={() => { setScope('storybook'); setStatus(null) }} /> {t('prompts.scope.storybook')}</label>
                          <label><input type="radio" checked={scope === 'story'} disabled={story.templateOnly || ['storybook', 'identity', 'actor-state'].includes(selectedSectionId)} onChange={() => { setScope('story'); setStatus(null) }} /> {t('prompts.scope.story')}</label>
                        </fieldset>}
                        <div className={css.contextDefinitionGrid}>
                          {selectedRecipeSection?.content !== undefined && (
                            <article className={css.contextDefinitionCard}>
                              <header>
                                <strong>{t('contextBuilder.customModuleEditor')}</strong>
                                <span>{target === 'director' ? t('prompts.director') : t('prompts.actor')}</span>
                              </header>
                              <label className={css.promptSettingsField}>
                                <span>{t('contextBuilder.customModuleTitle')}</span>
                                <input
                                  value={selectedRecipeSection.title ?? ''}
                                  onChange={(event) => {
                                    updateSelectedRecipeSection(section => ({ ...section, title: event.target.value }))
                                  }}
                                  onBlur={() => {
                                    if ((selectedRecipeSection.title?.trim() ?? '') === '') {
                                      setError(t('contextBuilder.customModuleTitleRequired'))
                                    }
                                  }}
                                />
                              </label>
                              <label className={css.promptSettingsField}>
                                <span>{t('contextBuilder.customModuleContent')}</span>
                                <textarea
                                  value={selectedRecipeSection.content}
                                  onChange={(event) => {
                                    updateSelectedRecipeSection(section => ({ ...section, content: event.target.value }))
                                  }}
                                  onBlur={() => {
                                    if (selectedRecipeSection.content?.trim() === '') {
                                      setError(t('contextBuilder.customModuleContentRequired'))
                                    }
                                  }}
                                />
                              </label>
                              {((selectedRecipeSection.title?.trim() ?? '') === '' || selectedRecipeSection.content.trim() === '') && (
                                <p className={css.characterError} role="alert">{t('contextBuilder.customModuleRequired')}</p>
                              )}
                              <p className={css.operationsHint}>{t('contextBuilder.customModuleHint')}</p>
                              {selectedSectionId.startsWith('custom:') && (
                                <div className={css.operationsButtonRow}>
                                  <button type="button" disabled={saving} onClick={deleteCustomModule}>{t('contextBuilder.deleteCustomModule')}</button>
                                </div>
                              )}
                            </article>
                          )}
                          {(selectedSectionId === 'style' || selectedSectionId === 'scene-style') && <StyleEditor
                            key={`${scope}:${target}:${actorId}:${selectedSectionId}`} commands={commands} story={story} settings={settings}
                            audienceKey={target === 'director' ? 'director' : `actor:${actorId}`} scope={scope}
                            sceneOnly={selectedSectionId === 'scene-style'} t={t} onSaved={(next) => { setSettings(next); void loadPreview() }}
                          />}
                          {selectedContextRules !== undefined && (['policy', 'tools'] as const).map((section) => {
                            const value = selectedContextRules[section]
                            const draft = section === 'policy' ? policyDraft : toolsDraft
                            const setDraft = section === 'policy' ? setPolicyDraft : setToolsDraft
                            const setRestore = section === 'policy' ? setRestorePolicyDefault : setRestoreToolsDefault
                            return <article key={section} hidden={selectedSectionId !== section} className={css.contextDefinitionCard}>
                              <header>
                                <strong>{contextSectionLabel(section, t)}</strong>
                                <span>{value.source === 'story' ? t('prompts.effective.story') : t('prompts.effective.storybook')}</span>
                              </header>
                              <label className={css.promptSettingsField}>
                                <span>{scope === 'storybook' ? t('prompts.editing.storybook') : t('prompts.editing.story')}</span>
                                <textarea value={draft} onChange={(event) => {
                                  setDraft(event.target.value)
                                  setRestore(false)
                                  setStatus(null)
                                }} />
                              </label>
                              <p className={css.operationsHint}>
                                {section === 'policy' ? t('contextBuilder.policyHint') : t('contextBuilder.toolsHint')}
                              </p>
                              <div className={css.operationsButtonRow}>
                                <button type="button" className={css.operationsPrimary} disabled={saving} onClick={() => { void saveContextRule(section) }}>{t('prompts.save')}</button>
                                <button type="button" disabled={saving} onClick={() => {
                                  setDraft(scope === 'storybook' ? value.storybookPrompt : value.storyOverride ?? value.storybookPrompt)
                                  setRestore(false)
                                  setStatus(null)
                                }}>{t('prompts.cancel')}</button>
                                {scope === 'story' && <button type="button" disabled={saving || value.storyOverride === undefined} onClick={() => {
                                  setDraft(value.storybookPrompt)
                                  setRestore(true)
                                  setStatus(t('prompts.restorePending'))
                                }}>{t('prompts.restore')}</button>}
                              </div>
                            </article>
                          })}
                          <article hidden={selectedSectionId !== 'director-prompt' && selectedSectionId !== 'actor-prompt'} className={css.contextDefinitionCard}>
                            <header><strong>{target === 'director' ? t('prompts.directorPrompt') : t('prompts.actorPrompt')}</strong><span>{selectedPrompt.source === 'story' ? t('prompts.effective.story') : t('prompts.effective.storybook')}</span></header>
                            <label className={css.promptSettingsField}>
                              <span>{scope === 'storybook' ? t('prompts.editing.storybook') : t('prompts.editing.story')}</span>
                              <textarea value={promptDraft} onChange={(event) => {
                                setPromptDraft(event.target.value)
                                setRestoreDefault(false)
                                setStatus(null)
                              }} />
                            </label>
                            <p className={css.operationsHint}>{t('prompts.boundary')}</p>
                            <div className={css.operationsButtonRow}>
                              <button type="button" className={css.operationsPrimary} disabled={saving} onClick={() => { void savePrompt() }}>{t('prompts.save')}</button>
                              <button type="button" disabled={saving} onClick={() => { resetPrompt(selectedPrompt, scope); setStatus(null) }}>{t('prompts.cancel')}</button>
                              {scope === 'story' && <button type="button" disabled={saving || selectedPrompt.storyOverride === undefined} onClick={() => { setPromptDraft(selectedPrompt.storybookPrompt); setRestoreDefault(true); setStatus(t('prompts.restorePending')) }}>{t('prompts.restore')}</button>}
                            </div>
                          </article>
                          <article hidden={selectedSectionId !== 'reasoning-language'} className={css.contextDefinitionCard}>
                            <header>
                              <strong>{t('contextBuilder.reasoningLanguageTitle')}</strong>
                              <span>{selectedReasoningLanguage?.source === 'story' ? t('prompts.effective.story') : t('prompts.effective.storybook')}</span>
                            </header>
                            <label className={css.promptSettingsField}>
                              <span>{scope === 'storybook' ? t('prompts.editing.storybook') : t('prompts.editing.story')}</span>
                              <input
                                list="context-reasoning-language-options"
                                value={reasoningLanguageDraft}
                                onChange={(event) => {
                                  setReasoningLanguageDraft(event.target.value)
                                  setRestoreReasoningLanguageDefault(false)
                                  setStatus(null)
                                }}
                              />
                              <datalist id="context-reasoning-language-options">
                                <option value="简体中文" />
                                <option value="English" />
                                <option value="日本語" />
                                <option value="Español" />
                              </datalist>
                            </label>
                            <p className={css.operationsHint}>{t('contextBuilder.reasoningLanguageHint')}</p>
                            <div className={css.operationsButtonRow}>
                              <button type="button" className={css.operationsPrimary} disabled={saving || reasoningLanguageDraft.trim() === ''} onClick={() => { void saveReasoningLanguage() }}>{t('prompts.save')}</button>
                              <button type="button" disabled={saving} onClick={() => { resetReasoningLanguage(selectedReasoningLanguage, scope); setStatus(null) }}>{t('prompts.cancel')}</button>
                              {scope === 'story' && <button type="button" disabled={saving || selectedReasoningLanguage?.storyOverride === undefined} onClick={() => { if (selectedReasoningLanguage !== undefined) { setReasoningLanguageDraft(selectedReasoningLanguage.storybookLanguage); setRestoreReasoningLanguageDefault(true); setStatus(t('contextBuilder.reasoningLanguageRestorePending')) } }}>{t('prompts.restore')}</button>}
                            </div>
                          </article>
                          <article hidden={selectedSectionId !== 'memory'} className={css.contextDefinitionCard}>
                            <header><strong>{t('contextBuilder.memoryTitle')}</strong><span>{t('contextBuilder.memoryCount', { value: story.memory.entries.length })}</span></header>
                            <p>{t('contextBuilder.memoryHint')}</p>
                            <MemoryList
                              story={story}
                              settings={settings}
                              draft={memoryDraft}
                              setDraft={setMemoryDraft}
                              saving={saving}
                              commands={commands}
                              run={run}
                              save={saveMemory}
                              t={t}
                            />
                            <details className={css.contextMemoryCreate}>
                              <summary>{t('contextBuilder.memoryCreate')}</summary>
                              <div className={css.operationsForm}>
                                <label>{t('operations.memory.kind')}<select value={newMemoryKind} onChange={(event) => { setNewMemoryKind(event.target.value as 'scene' | 'arc') }}><option value="scene">{t('operations.memory.scene')}</option><option value="arc">{t('operations.memory.arc')}</option></select></label>
                                <label>{t('operations.memory.title')}<input value={newMemoryTitle} onChange={(event) => { setNewMemoryTitle(event.target.value) }} /></label>
                                <label>{t('operations.memory.directorSummary')}<textarea value={newMemoryDirectorSummary} onChange={(event) => { setNewMemoryDirectorSummary(event.target.value) }} /></label>
                                <label>{t('operations.memory.publicSummary')}<textarea value={newMemoryPublicSummary} onChange={(event) => { setNewMemoryPublicSummary(event.target.value) }} /></label>
                                <button type="button" className={css.operationsPrimary} disabled={saving} onClick={() => { void createMemory() }}>{t('operations.memory.propose')}</button>
                              </div>
                            </details>
                          </article>
                          {storybookValue !== null && (
                            <article hidden={!['storybook', 'identity', 'actor-state'].includes(selectedSectionId)} className={`${css.contextDefinitionCard} ${css.contextDefinitionWideCard}`}>
                              <header>
                                <strong>{t('contextBuilder.storybookSource')}</strong>
                                <span>{target === 'director' ? t('contextBuilder.storybookSourceDirector') : settings.actors.find(actor => actor.actorId === actorId)?.displayName}</span>
                              </header>
                              <p>{target === 'director' ? t('contextBuilder.storybookSourceHintDirector') : t('contextBuilder.storybookSourceHintActor')}</p>
                              <label className={css.contextSourceEditor}>
                                <span>{target === 'director' ? t('contextBuilder.storybookDocument') : t('contextBuilder.actorDefinition')}</span>
                                <textarea
                                  value={storybookDraft}
                                  spellCheck={false}
                                  onChange={(event) => { setStorybookDraft(event.target.value); setStatus(null) }}
                                />
                              </label>
                              <div className={css.operationsButtonRow}>
                                <button type="button" className={css.operationsPrimary} disabled={saving || !storybookDirty} onClick={() => { void saveStorybookSource() }}>{t('prompts.save')}</button>
                                <button type="button" disabled={saving || !storybookDirty} onClick={() => { setStorybookDraft(storybookSource); setStatus(null) }}>{t('prompts.cancel')}</button>
                              </div>
                            </article>
                          )}
                        </div>
                        {selectedRecipeSection?.content === undefined && !['style', 'scene-style', 'policy', 'tools', 'director-prompt', 'actor-prompt', 'reasoning-language', 'memory', 'storybook', 'identity', 'actor-state'].includes(selectedSectionId) && <div className={css.contextRuntimeNotice}><strong>{t('contextBuilder.runtimeReadOnly')}</strong><p>{t('contextBuilder.runtimeReadOnlyHint')}</p></div>}
                        <div className={css.contextSelectedPreview}>
                          <h5>{t('contextBuilder.savedModulePreview')}</h5>
                          {selectedPreviewSection === undefined
                            ? <p className={css.characterEmpty}>{t('contextBuilder.previewUnavailable')}</p>
                            : <ContextPreviewCard section={selectedPreviewSection} t={t} />}
                        </div>
                      </div>
                    </Modal>
                  </section>

                  <section className={css.contextBuilderSection}>
                    <SectionHeading
                      eyebrow={t('contextBuilder.finalPreviewEyebrow')}
                      title={t('contextBuilder.finalPreviewTitle')}
                      hint={t('contextBuilder.finalPreviewHint')}
                      action={<button type="button" disabled={saving} onClick={() => { void loadPreview() }}>{t('operations.context.refresh')}</button>}
                    />
                    {preview !== null && <div className={css.contextPreviewList}>{preview.sections.map((section, index) => <div key={section.id} className={css.contextFinalPreviewItem}><span>{String(index + 1).padStart(2, '0')}</span><ContextPreviewCard section={section} t={t} onEditSource={focusEditableSource} /></div>)}</div>}
                  </section>
                </>
              )}
              {status !== null && <p className={css.operationsStatus} role="status">{status}</p>}
              {error !== null && <p className={css.characterError} role="alert">{error}</p>}
            </div>
          </WorkspaceDialog>
        )}
      </div>
    )
  }
}

function SectionHeading({ eyebrow, title, hint, action }: {
  readonly eyebrow: string
  readonly title: string
  readonly hint: string
  readonly action?: ReactNode
}) {
  return (
    <header className={css.contextBuilderSectionHeading}>
      <div><span>{eyebrow}</span><h3>{title}</h3><p>{hint}</p></div>
      {action}
    </header>
  )
}

function MemoryList({ story, settings, draft, setDraft, saving, commands, run, save, t }: {
  readonly story: StoryView
  readonly settings: StoryPromptSettingsValue
  readonly draft: MemoryDraft | null
  readonly setDraft: (draft: MemoryDraft | null) => void
  readonly saving: boolean
  readonly commands: IStories
  readonly run: (operation: () => Promise<void>, success: string) => Promise<void>
  readonly save: () => Promise<void>
  readonly t: Translate
}) {
  if (story.memory.entries.length === 0) return <p className={css.characterEmpty}>{t('contextBuilder.memoryEmpty')}</p>
  return <div className={css.contextMemoryList}>{story.memory.entries.toReversed().map(entry => (
    <article key={entry.id} className={css.contextMemoryItem}>
      <header><div><strong>{entry.title}</strong><span>{memoryStatus(entry, t)}</span></div><button type="button" onClick={() => { setDraft(toMemoryDraft(entry)) }}>{t('contextBuilder.edit')}</button></header>
      <p>{entry.directorSummary}</p>
      {entry.publicSummary.length > 0 && <p>{entry.publicSummary}</p>}
      {entry.status === 'proposed' && <div className={css.operationsButtonRow}>
        <button type="button" disabled={saving} onClick={() => { void run(async () => { await commands.reviewMemory(story.storyId, story.memory.revision, entry.id, true) }, t('contextBuilder.memoryApproved')) }}>{t('operations.memory.approve')}</button>
        <button type="button" disabled={saving} onClick={() => { void run(async () => { await commands.reviewMemory(story.storyId, story.memory.revision, entry.id, false) }, t('contextBuilder.memoryRejected')) }}>{t('operations.memory.reject')}</button>
      </div>}
      {entry.replaces.length > 0 && <p>{t('contextBuilder.replaces')}: {entry.replaces.map(id => story.memory.entries.find(item => item.id === id)?.title ?? id).join('、')}</p>}
      {draft?.id === entry.id && <div className={css.contextMemoryEditor}>
        <label>{t('operations.memory.kind')}<select value={draft.kind} onChange={(event) => { setDraft({ ...draft, kind: event.target.value as 'scene' | 'arc' }) }}><option value="scene">{t('operations.memory.scene')}</option><option value="arc">{t('operations.memory.arc')}</option></select></label>
        <label>{t('operations.memory.title')}<input value={draft.title} onChange={(event) => { setDraft({ ...draft, title: event.target.value }) }} /></label>
        <label>{t('operations.memory.directorSummary')}<textarea value={draft.directorSummary} onChange={(event) => { setDraft({ ...draft, directorSummary: event.target.value }) }} /></label>
        <label>{t('operations.memory.publicSummary')}<textarea value={draft.publicSummary} onChange={(event) => { setDraft({ ...draft, publicSummary: event.target.value }) }} /></label>
        {entry.status === 'proposed' && <fieldset><legend>{t('contextBuilder.replaces')}</legend><p>{t('contextBuilder.replacesHint')}</p>{story.memory.entries.filter(item => item.status === 'approved').map(item => <label key={item.id}><input type="checkbox" checked={draft.replaces.includes(item.id)} onChange={(event) => { setDraft({ ...draft, replaces: event.target.checked ? [...draft.replaces, item.id] : draft.replaces.filter(id => id !== item.id), eventRefs: event.target.checked ? [...new Set([...draft.eventRefs, ...item.eventRefs])] : draft.eventRefs }) }} />{item.title}</label>)}</fieldset>}
        <fieldset><legend>{t('contextBuilder.actorMemories')}</legend>{settings.actors.map(actor => <label key={actor.actorId}><span>{actor.displayName}</span><textarea value={draft.actorMemories[actor.actorId] ?? ''} onChange={(event) => { setDraft({ ...draft, actorMemories: { ...draft.actorMemories, [actor.actorId]: event.target.value } }) }} /></label>)}</fieldset>
        <div className={css.operationsButtonRow}><button type="button" className={css.operationsPrimary} disabled={saving} onClick={() => { void save() }}>{t('prompts.save')}</button><button type="button" disabled={saving} onClick={() => { setDraft(null) }}>{t('prompts.cancel')}</button></div>
      </div>}
    </article>
  ))}</div>
}

function ContextPreviewCard({ section, t, onEditSource }: {
  readonly section: StoryContextSection
  readonly t: Translate
  readonly onEditSource?: (section: StoryContextSection) => void
}) {
  return <article className={css.contextPreviewCard}>
    <div className={css.contextPreviewHeading}>
      <div><strong>{section.title}</strong><p>{section.reason}</p></div>
      <div className={css.contextPreviewActions}>
        <div className={css.contextBadges}>
          <span>{contextRoleLabel(section.role, t)}</span>
          <span>{contextPermissionLabel(section.permission, t)}</span>
          <span>{contextVisibilityLabel(section.visibility, t)}</span>
        </div>
        {section.permission === 'player-editable' && onEditSource !== undefined && (
          <button type="button" onClick={() => { onEditSource(section) }}>
            {t('contextBuilder.editSource')}
          </button>
        )}
      </div>
    </div>
    <div className={css.contextSectionMeta}><span>{contextSourceLabel(section.source, t)}</span><span>{t('operations.context.sectionChars', { value: section.chars })}</span><span>{t('operations.context.sectionTokens', { value: section.estimatedTokens })}</span></div>
    <details className={css.contextContent}><summary>{t('operations.context.showContent')}</summary><pre>{section.content}</pre></details>
  </article>
}

function ContextRecipeSorter({ sections, selectedId, setSections, onSelect, t }: {
  readonly sections: readonly StoryContextRecipeSection[]
  readonly selectedId: string
  readonly setSections: (sections: readonly StoryContextRecipeSection[]) => void
  readonly onSelect: (id: string) => void
  readonly t: Translate
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const move = (from: number, to: number): void => {
    if (from < 0 || to < 0 || to >= sections.length || from === to) return
    const next = [...sections]
    const [item] = next.splice(from, 1)
    if (item === undefined) return
    next.splice(to, 0, item)
    setSections(next)
  }
  const drop = (event: ReactDragEvent<HTMLElement>, targetId: string): void => {
    event.preventDefault()
    const from = sections.findIndex(section => section.id === dragId)
    const to = sections.findIndex(section => section.id === targetId)
    move(from, to)
    setDragId(null)
    setOverId(null)
  }
  return <ol className={css.contextRecipeSorter} aria-label={t('contextBuilder.recipeTitle')}>
    {sections.map((section, index) => <li
      key={section.id}
      className={`${css.contextRecipeCard} ${dragId === section.id ? css.contextRecipeDragging : ''} ${overId === section.id ? css.contextRecipeOver : ''}`}
      data-selected={selectedId === section.id || undefined}
      onDragOver={(event) => { event.preventDefault(); setOverId(section.id) }}
      onDragLeave={() => { if (overId === section.id) setOverId(null) }}
      onDrop={(event) => { drop(event, section.id) }}
    >
      <button
        type="button"
        className={css.contextDragHandle}
        draggable
        aria-label={t('contextBuilder.dragLabel', { value: contextRecipeSectionLabel(section, section.id, t) })}
        onDragStart={(event) => { setDragId(section.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', section.id) }}
        onDragEnd={() => { setDragId(null); setOverId(null) }}
      ><span aria-hidden="true">⋮⋮</span><span>{t('contextBuilder.drag')}</span></button>
      <button
        type="button"
        className={css.contextRecipeCopy}
        aria-haspopup="dialog"
        aria-expanded={selectedId === section.id}
        aria-label={t(editableContextRecipeSection(section) ? 'contextBuilder.editModuleLabel' : 'contextBuilder.viewModuleLabel', { value: contextRecipeSectionLabel(section, section.id, t) })}
        onClick={() => { onSelect(section.id) }}
      >
        <strong>{contextRecipeSectionLabel(section, section.id, t)}</strong>
        <span>{contextRecipeSectionReason(section, section.id, t)}</span>
        <em>{t(editableContextRecipeSection(section) ? 'contextBuilder.editModule' : 'contextBuilder.viewModule')}</em>
      </button>
      <label className={css.contextRecipeRole}>
        <span>{t('contextBuilder.messageRole')}</span>
        <select value={section.role} onChange={(event) => { setSections(sections.map(item => item.id === section.id ? { ...item, role: event.target.value as StoryContextRecipeSection['role'] } : item)) }}>
          <option value="system">{t('contextBuilder.role.system')}</option>
          <option value="user">{t('contextBuilder.role.user')}</option>
          <option value="assistant">{t('contextBuilder.role.assistant')}</option>
        </select>
        <small>{contextRoleHint(section.role, t)}</small>
      </label>
      <label className={css.contextRecipeToggle}><input type="checkbox" checked={section.enabled} onChange={(event) => { setSections(sections.map(item => item.id === section.id ? { ...item, enabled: event.target.checked } : item)) }} />{t('operations.context.enabled')}</label>
      <div className={css.contextRecipeMoves}><button type="button" aria-label={t('contextBuilder.moveUp', { value: contextRecipeSectionLabel(section, section.id, t) })} disabled={index === 0} onClick={() => { move(index, index - 1) }}>↑</button><button type="button" aria-label={t('contextBuilder.moveDown', { value: contextRecipeSectionLabel(section, section.id, t) })} disabled={index === sections.length - 1} onClick={() => { move(index, index + 1) }}>↓</button></div>
    </li>)}
  </ol>
}

function toMemoryDraft(entry: StoryMemoryEntry): MemoryDraft {
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    directorSummary: entry.directorSummary,
    publicSummary: entry.publicSummary,
    actorMemories: { ...entry.actorMemories },
    eventRefs: [...entry.eventRefs],
    replaces: [...entry.replaces],
  }
}

function memoryStatus(entry: StoryMemoryEntry, t: Translate): string {
  if (entry.status === 'approved') return t('contextBuilder.memoryStatus.approved')
  if (entry.status === 'proposed') return t('contextBuilder.memoryStatus.proposed')
  if (entry.status === 'rejected') return t('contextBuilder.memoryStatus.rejected')
  return t('contextBuilder.memoryStatus.superseded')
}

function contextSectionLabel(id: string, t: Translate): string {
  const labels: Record<string, string> = { style: t('style.title'), 'scene-style': t('style.sceneTitle'), policy: t('operations.context.section.policy'), tools: t('operations.context.section.tools'), identity: t('operations.context.section.identity'), 'reasoning-language': t('operations.context.section.reasoningLanguage'), 'director-prompt': t('operations.context.section.directorPrompt'), 'actor-prompt': t('operations.context.section.actorPrompt'), storybook: t('operations.context.section.storybook'), world: t('operations.context.section.world'), memory: t('operations.context.section.memory'), 'plot-ledger': t('operations.context.section.plotLedger'), 'director-outline': t('operations.context.section.directorOutline'), 'director-brief': t('operations.context.section.directorBrief'), discussion: t('operations.context.section.discussion'), 'actor-state': t('operations.context.section.actorState') }
  return labels[id] ?? id
}

function contextSectionReason(id: string, t: Translate): string {
  const reasons: Record<string, string> = { style: t('style.hint'), 'scene-style': t('style.sceneHint'), policy: t('operations.context.reason.policy'), tools: t('operations.context.reason.tools'), identity: t('operations.context.reason.identity'), 'reasoning-language': t('operations.context.reason.reasoningLanguage'), 'director-prompt': t('operations.context.reason.directorPrompt'), 'actor-prompt': t('operations.context.reason.actorPrompt'), storybook: t('operations.context.reason.storybook'), world: t('operations.context.reason.world'), memory: t('operations.context.reason.memory'), 'plot-ledger': t('operations.context.reason.plotLedger'), 'director-outline': t('operations.context.reason.directorOutline'), 'director-brief': t('operations.context.reason.directorBrief'), discussion: t('operations.context.reason.discussion'), 'actor-state': t('operations.context.reason.actorState') }
  return reasons[id] ?? ''
}

function editableContextSection(id: string): boolean {
  return ['style', 'scene-style', 'policy', 'tools', 'director-prompt', 'actor-prompt', 'reasoning-language', 'memory', 'storybook', 'identity', 'actor-state'].includes(id)
}

function editableContextRecipeSection(section: StoryContextRecipeSection): boolean {
  return section.content !== undefined || editableContextSection(section.id)
}

function contextRecipeSectionLabel(
  section: StoryContextRecipeSection | undefined,
  id: string,
  t: Translate,
): string {
  return section?.title ?? contextSectionLabel(id, t)
}

function contextRecipeSectionReason(
  section: StoryContextRecipeSection | undefined,
  id: string,
  t: Translate,
): string {
  return section?.content === undefined ? contextSectionReason(id, t) : t('contextBuilder.customModuleReason')
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

function contextRoleHint(value: StoryContextRecipeSection['role'], t: Translate): string {
  if (value === 'system') return t('contextBuilder.roleHint.system')
  if (value === 'user') return t('contextBuilder.roleHint.user')
  return t('contextBuilder.roleHint.assistant')
}

function contextVisibilityLabel(value: StoryContextSection['visibility'], t: Translate): string {
  return value === 'director-only' ? t('operations.context.visibility.director') : t('operations.context.visibility.actor')
}

function contextSourceLabel(value: StoryContextSection['source'], t: Translate): string {
  const labels: Record<StoryContextSection['source'], string> = { 'context-rule': t('operations.context.source.contextRule'), prompt: t('operations.context.source.prompt'), 'reasoning-language': t('operations.context.source.reasoningLanguage'), custom: t('operations.context.source.custom'), storybook: t('operations.context.source.storybook'), world: t('operations.context.source.world'), memory: t('operations.context.source.memory'), discussion: t('operations.context.source.discussion'), 'plot-ledger': t('operations.context.source.plotLedger'), 'director-outline': t('operations.context.source.directorOutline'), 'director-brief': t('operations.context.source.directorBrief'), 'actor-state': t('operations.context.source.actorState') }
  return labels[value]
}

function editableStorybookSource(source: string, target: ContextTarget, actorId: string): string {
  const document = parseJsonObject(source, 'storybook')
  if (target === 'director') {
    const contextSource = { ...document }
    delete contextSource.directorPrompt
    delete contextSource.reasoningLanguage
    delete contextSource.contextRules
    const characters: unknown = contextSource.characters
    if (Array.isArray(characters)) {
      contextSource.characters = characters.map((item: unknown) => {
        if (!isJsonObject(item)) return item
        const visible = { ...item }
        delete visible.rolePrompt
        delete visible.privateContext
        delete visible.actingGuidance
        delete visible.state
        return visible
      })
    }
    return JSON.stringify(contextSource, undefined, 2)
  }
  const characters = document.characters
  if (!Array.isArray(characters)) throw new Error('Storybook characters must be an array')
  const actor = characters.find((item): item is Record<string, unknown> => isJsonObject(item) && item.actorId === actorId)
  if (actor === undefined) throw new Error(`Storybook does not define Actor '${actorId}'`)
  const contextSource = { ...actor }
  delete contextSource.rolePrompt
  return JSON.stringify(contextSource, undefined, 2)
}

function mergeEditableStorybookSource(
  currentSource: string,
  editedSource: string,
  target: ContextTarget,
  actorId: string,
): string {
  if (target === 'director') {
    const current = parseJsonObject(currentSource, 'storybook')
    const edited = parseJsonObject(editedSource, 'storybook')
    edited.directorPrompt = current.directorPrompt
    edited.reasoningLanguage = current.reasoningLanguage
    edited.contextRules = current.contextRules
    if (!Array.isArray(current.characters) || !Array.isArray(edited.characters)) {
      throw new Error('Storybook characters must be an array')
    }
    const privateActors = new Map(current.characters.flatMap(item => isJsonObject(item)
      && typeof item.actorId === 'string' && typeof item.rolePrompt === 'string'
      ? [[item.actorId, item] as const]
      : []))
    edited.characters = edited.characters.map((item) => {
      if (!isJsonObject(item) || typeof item.actorId !== 'string') throw new Error('Every Actor requires actorId')
      const privateActor = privateActors.get(item.actorId)
      if (privateActor === undefined) {
        throw new Error(`Add Actor '${item.actorId}' in Storybook Studio before editing its context here`)
      }
      return {
        ...item,
        rolePrompt: privateActor.rolePrompt,
        privateContext: privateActor.privateContext,
        actingGuidance: privateActor.actingGuidance,
        state: privateActor.state,
      }
    })
    return JSON.stringify(edited, undefined, 2)
  }
  const document = parseJsonObject(currentSource, 'storybook')
  const actor = parseJsonObject(editedSource, 'Actor definition')
  if (actor.actorId !== actorId) throw new Error('Actor id cannot be changed from the context builder')
  const characters: unknown = document.characters
  if (!Array.isArray(characters)) throw new Error('Storybook characters must be an array')
  const index = characters.findIndex((item: unknown) => isJsonObject(item) && item.actorId === actorId)
  if (index < 0) throw new Error(`Storybook does not define Actor '${actorId}'`)
  const currentActor: unknown = characters[index]
  if (!isJsonObject(currentActor)) throw new Error(`Storybook Actor '${actorId}' is invalid`)
  actor.rolePrompt = currentActor.rolePrompt
  document.characters = characters.map((item: unknown, itemIndex: number) => itemIndex === index ? actor : item)
  return JSON.stringify(document, undefined, 2)
}

function parseJsonObject(source: string, label: string): Record<string, unknown> {
  const value: unknown = JSON.parse(source)
  if (!isJsonObject(value)) throw new Error(`${label} must be a JSON object`)
  return value
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function required(value: string, label: string): string {
  const accepted = value.trim()
  if (accepted === '') throw new Error(`${label} is required`)
  return accepted
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
