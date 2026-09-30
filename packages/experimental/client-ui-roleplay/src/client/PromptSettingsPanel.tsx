/** Director and Actor prompt editor with storybook defaults and Story-local overrides. */

import type {
  IStories,
  StoryPromptSettingsValue,
  StoryPromptUpdateRequest,
} from '@deepseek-ai/dsh-api-story-controller/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { storyOwnsSession } from './RoleplayChrome.tsx'
import { NS } from './locales.ts'
import css from './RoleplayChrome.module.css'
import { WorkspaceCloseButton, WorkspaceDialog } from './WorkspaceDialog.tsx'

type PanelProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS>
type PromptTarget = 'director' | 'actor'
type PromptScope = 'storybook' | 'story'

/** Bind prompt editing to the path-free Story commands. */
export function promptSettingsPanel(commands: Pick<IStories, 'prompts' | 'updatePrompt'>) {
  return function PromptSettingsPanel({ sessionId, useStories, t }: PanelProps) {
    const story = useStories?.(snapshot => snapshot.items.find(item => storyOwnsSession(item, sessionId)))
    const [open, setOpen] = useState(false)
    const [settings, setSettings] = useState<StoryPromptSettingsValue | null>(null)
    const [target, setTarget] = useState<PromptTarget>('director')
    const [actorId, setActorId] = useState('')
    const [scope, setScope] = useState<PromptScope>('story')
    const [draft, setDraft] = useState('')
    const [restoreDefault, setRestoreDefault] = useState(false)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [status, setStatus] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)

    const selected = useMemo(() => target === 'director'
      ? settings?.director
      : settings?.actors.find(actor => actor.actorId === actorId), [actorId, settings, target])

    const resetDraft = useCallback((value: typeof selected, selectedScope: PromptScope): void => {
      if (value === undefined) return
      setDraft(selectedScope === 'storybook' ? value.storybookPrompt : value.storyOverride ?? value.storybookPrompt)
      setRestoreDefault(false)
    }, [])

    const load = useCallback(async (): Promise<void> => {
      if (story === undefined) return
      setLoading(true)
      setError(null)
      try {
        const value = await commands.prompts(story.storyId)
        setSettings(value)
        const firstActor = value.actors[0]?.actorId ?? ''
        setActorId(current => value.actors.some(actor => actor.actorId === current) ? current : firstActor)
      } catch (reason: unknown) {
        setError(t('prompts.error', { value: message(reason) }))
      } finally {
        setLoading(false)
      }
    }, [commands, story, t])

    useEffect(() => {
      setOpen(false)
      setSettings(null)
      setTarget('director')
      setScope(story?.templateOnly === true ? 'storybook' : 'story')
      setStatus(null)
      setError(null)
    }, [story?.storyId, story?.templateOnly])

    useEffect(() => { resetDraft(selected, scope) }, [resetDraft, scope, selected])

    const close = useCallback((): void => {
      setOpen(false)
      triggerRef.current?.focus()
    }, [])

    const save = async (): Promise<void> => {
      if (story === undefined || settings === null || selected === undefined || saving) return
      setSaving(true)
      setError(null)
      setStatus(null)
      try {
        const common = {
          storyId: story.storyId,
          target,
          ...(target === 'actor' ? { actorId } : {}),
        } as const
        const request: StoryPromptUpdateRequest = scope === 'storybook'
          ? {
            ...common,
            scope: 'storybook',
            expectedStorybookRevision: settings.storybookRevision,
            prompt: draft,
          }
          : {
            ...common,
            scope: 'story',
            expectedStoryPromptRevision: settings.storyPromptRevision,
            ...(restoreDefault ? {} : { prompt: draft }),
          }
        const value = await commands.updatePrompt(request)
        setSettings(value)
        setRestoreDefault(false)
        setStatus(t('prompts.saved'))
      } catch (reason: unknown) {
        setError(t('prompts.error', { value: message(reason) }))
      } finally {
        setSaving(false)
      }
    }

    return (
      <div className={css.outlinePanelRoot}>
        <button
          ref={triggerRef}
          type="button"
          className={`${css.characterPanelTrigger} ${css.promptSettingsTrigger}`}
          aria-expanded={open}
          aria-label={t('prompts.open')}
          disabled={story === undefined}
          onClick={() => {
            if (open) close()
            else { setOpen(true); void load() }
          }}
        >{t('prompts.title')}</button>
        {open && story !== undefined && (
          <WorkspaceDialog
            className={`${css.outlinePanel} ${css.promptSettingsPanel}`}
            label={t('prompts.title')}
            storageKey="story-prompts"
            defaultSize={{ width: 760, height: 720 }}
            resizeLabels={{
              top: t('workspace.resizeTop'), right: t('workspace.resizeRight'),
              bottom: t('workspace.resizeBottom'), left: t('workspace.resizeLeft'),
            }}
            returnFocusRef={triggerRef}
            onClose={close}
          >
            <header className={css.characterPanelHeader}>
              <div><strong>{t('prompts.title')}</strong><p>{t('prompts.subtitle')}</p></div>
              <WorkspaceCloseButton label={t('workspace.close')} onClick={close} />
            </header>
            <div className={`${css.workspaceBody} ${css.promptSettingsBody}`}>
              {loading && <p role="status">{t('prompts.loading')}</p>}
              {settings !== null && selected !== undefined && (
                <>
                  <div className={css.operationsTabs} role="tablist" aria-label={t('prompts.target')}>
                    <button type="button" role="tab" aria-selected={target === 'director'} onClick={() => { setTarget('director'); setStatus(null); setError(null) }}>{t('prompts.director')}</button>
                    <button type="button" role="tab" aria-selected={target === 'actor'} disabled={settings.actors.length === 0} onClick={() => { setTarget('actor'); setStatus(null); setError(null) }}>{t('prompts.actor')}</button>
                  </div>
                  {target === 'actor' && (
                    <label className={css.promptSettingsField}>
                      <span>{t('prompts.selectActor')}</span>
                      <select value={actorId} onChange={(event) => { setActorId(event.target.value); setStatus(null); setError(null) }}>
                        {settings.actors.map(actor => <option key={actor.actorId} value={actor.actorId}>{actor.displayName}</option>)}
                      </select>
                    </label>
                  )}
                  <fieldset className={css.promptScopePicker}>
                    <legend>{t('prompts.scope')}</legend>
                    <label><input type="radio" checked={scope === 'storybook'} onChange={() => { setScope('storybook'); setStatus(null); setError(null) }} /> {t('prompts.scope.storybook')}</label>
                    <label><input type="radio" checked={scope === 'story'} disabled={story.templateOnly} onChange={() => { setScope('story'); setStatus(null); setError(null) }} /> {t('prompts.scope.story')}</label>
                  </fieldset>
                  <div className={css.promptSourceBanner}>
                    <strong>{scope === 'storybook' ? t('prompts.editing.storybook') : t('prompts.editing.story')}</strong>
                    <span>{selected.source === 'story' ? t('prompts.effective.story') : t('prompts.effective.storybook')}</span>
                  </div>
                  <label className={css.promptSettingsField}>
                    <span>{target === 'director' ? t('prompts.directorPrompt') : t('prompts.actorPrompt')}</span>
                    <textarea value={draft} onChange={(event) => {
                      setDraft(event.target.value)
                      setRestoreDefault(false)
                      setStatus(null)
                    }} />
                  </label>
                  <p className={css.operationsHint}>{t('prompts.boundary')}</p>
                  <div className={css.operationsButtonRow}>
                    <button type="button" className={css.operationsPrimary} disabled={saving} onClick={() => { void save() }}>{saving ? t('prompts.saving') : t('prompts.save')}</button>
                    <button type="button" disabled={saving} onClick={() => { resetDraft(selected, scope); setStatus(null); setError(null) }}>{t('prompts.cancel')}</button>
                    {scope === 'story' && (
                      <button type="button" disabled={saving || selected.storyOverride === undefined} onClick={() => {
                        setDraft(selected.storybookPrompt)
                        setRestoreDefault(true)
                        setStatus(t('prompts.restorePending'))
                      }}>{t('prompts.restore')}</button>
                    )}
                  </div>
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

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
