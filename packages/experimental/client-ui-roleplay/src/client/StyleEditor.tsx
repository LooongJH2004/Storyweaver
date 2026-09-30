/** Editable copies of audience-scoped expression guidance and personal browser presets. */
import type { IStories, StoryPromptSettingsValue, StoryStyleUpdateRequest, StoryView } from '@deepseek-ai/dsh-api-story-controller/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { STYLE_PRESETS, styleProfileSchema, personalStylePresetsSchema as personalSchema, type PersonalStylePreset as PersonalPreset, type StyleProfile } from '@deepseek-ai/dsh-story/style'
import { useState } from 'react'
import { NS } from './locales.ts'
import css from './RoleplayChrome.module.css'

const storageKey = 'storyweaver.personal-styles.v1'
type Field = keyof Extract<StyleProfile, { kind: 'actor' }>['guidance'] | keyof Extract<StyleProfile, { kind: 'director' }>['guidance']

function savedProfile(draft: StyleProfile): StyleProfile {
  return styleProfileSchema.parse({ ...draft, guidance: Object.fromEntries(Object.entries(draft.guidance)
    .map(([key, value]) => [key, Array.isArray(value) ? value.filter(line => line.trim() !== '') : value])) })
}

/**
 * Edit one baseline, run override, or current-scene instruction at its loaded revision.
 * @param props - effective settings and existing save commands; remount when audience or scope changes.
 * @returns style fields and copy/save controls; failures retain the editable draft.
 */
export function StyleEditor({ commands, story, settings, audienceKey, scope, sceneOnly, onSaved, t }: {
  readonly commands: IStories
  readonly story: StoryView
  readonly settings: StoryPromptSettingsValue
  readonly audienceKey: string
  readonly scope: 'storybook' | 'story'
  readonly sceneOnly: boolean
  readonly onSaved: (settings: StoryPromptSettingsValue) => void
} & PropsLocale<typeof NS>) {
  const [loaded, setLoaded] = useState(settings)
  const baseline = loaded.styles.baselines[audienceKey]
  const effective = scope === 'storybook' ? baseline : loaded.styles.overrides.profiles[audienceKey] ?? baseline
  const [draft, setDraft] = useState<StyleProfile | undefined>(() => structuredClone(effective))
  const initialInstruction = loaded.styles.overrides.scene?.sceneId === loaded.styles.sceneId
    ? loaded.styles.overrides.scene?.instructions[audienceKey] ?? '' : ''
  const [instruction, setInstruction] = useState(initialInstruction)
  const [restore, setRestore] = useState(false)
  const [name, setName] = useState('')
  const [personal, setPersonal] = useState<PersonalPreset[]>(() => {
    const parsed = personalSchema.safeParse(readPersonal())
    return parsed.success ? parsed.data : []
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  if (draft === undefined || baseline === undefined) return null
  const dirty = sceneOnly ? instruction !== initialInstruction : restore || JSON.stringify(draft) !== JSON.stringify(effective)
  const save = async (): Promise<void> => {
    setSaving(true); setError(null); setStatus(null)
    try {
      const common = { storyId: story.storyId, key: audienceKey }
      let request: StoryStyleUpdateRequest
      if (sceneOnly) {
        if (loaded.styles.sceneId === undefined) throw new Error(t('style.noScene'))
        request = { ...common, scope: 'scene', sceneId: loaded.styles.sceneId,
          instruction, expectedStoryPromptRevision: loaded.storyPromptRevision }
      } else if (scope === 'storybook') {
        request = { ...common, scope, profile: savedProfile(draft), expectedStorybookRevision: loaded.storybookRevision }
      } else {
        request = { ...common, scope, profile: restore ? undefined : savedProfile(draft),
          expectedStoryPromptRevision: loaded.storyPromptRevision }
      }
      const next = await commands.updateStyle(request)
      setLoaded(next); setRestore(false)
      if (!sceneOnly) setDraft(structuredClone(scope === 'storybook' ? next.styles.baselines[audienceKey]
        : next.styles.overrides.profiles[audienceKey] ?? next.styles.baselines[audienceKey]))
      onSaved(next); setStatus(t('style.saved'))
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setSaving(false) }
  }
  const savePersonal = (): void => {
    try {
      const next = personalSchema.parse([...personal.filter(item => item.name !== name.trim()),
        { name: name.trim(),
          profile: savedProfile(draft) }])
      localStorage.setItem(storageKey, JSON.stringify(next))
      setPersonal(next); setStatus(t('style.personalSaved')); setError(null)
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  return <article className={`${css.contextDefinitionCard} ${css.performanceStyle}`}>
    <header><strong>{t(sceneOnly ? 'style.sceneTitle' : 'style.title')}</strong>
      <span>{t(scope === 'storybook' || loaded.styles.overrides.profiles[audienceKey] === undefined ? 'prompts.effective.storybook' : 'prompts.effective.story')}</span></header>
    <p>{t(sceneOnly ? 'style.sceneHint' : 'style.hint')}</p>
    {sceneOnly ? <label className={css.promptSettingsField}><span>{t('style.sceneTitle')}</span>
      <textarea value={instruction} disabled={loaded.styles.sceneId === undefined} onChange={(event) => {
        setInstruction(event.target.value); setStatus(null)
      }} />
      {loaded.styles.sceneId === undefined && <small>{t('style.noScene')}</small>}
    </label> : <>
      <label className={css.promptSettingsField}><span>{t('style.preset')}</span><select aria-label={t('style.preset')} value="" onChange={(event) => {
        const selected = event.target.value.startsWith('personal:')
          ? personal[Number(event.target.value.slice(9))]?.profile
          : STYLE_PRESETS.find(item => item.id === event.target.value)?.profile
        if (selected !== undefined) { setDraft(structuredClone(selected)); setRestore(false); setStatus(null) }
      }}><option value="">{t('style.choosePreset')}</option>
        {STYLE_PRESETS.filter(item => item.profile.kind === draft.kind).map(item => <option key={item.id} value={item.id}>{t(`style.preset.${item.id}` as Parameters<typeof t>[0])}</option>)}
        {personal.map((item, index) => item.profile.kind === draft.kind && <option key={index} value={`personal:${index}`}>{item.name}</option>)}
      </select></label>
      {(Object.keys(draft.guidance) as Field[]).map((field) => {
        const value = (draft.guidance as unknown as Record<Field, string | string[]>)[field]
        return <label key={field} className={css.promptSettingsField}><span>{t(`style.field.${field}`)}</span>
          <textarea aria-label={t(`style.field.${field}`)} value={Array.isArray(value) ? value.join('\n') : value} onChange={(event) => {
            const next = structuredClone(draft)
            const guidance = next.guidance as unknown as Record<Field, string | string[]>
            guidance[field] = Array.isArray(value) ? event.target.value.split('\n') : event.target.value
            setDraft(next)
            setRestore(false); setStatus(null)
          }} /></label>
      })}
      <div className={css.operationsButtonRow}><label><span>{t('style.personalName')}</span><input value={name} onChange={(event) => { setName(event.target.value) }} /></label>
        <button type="button" disabled={!name.trim()} onClick={savePersonal}>{t('style.savePersonal')}</button></div>
    </>}
    {dirty && <p role="status">{t('style.dirty')}</p>}
    <div className={css.operationsButtonRow}>
      <button type="button" disabled={saving || (sceneOnly && loaded.styles.sceneId === undefined)} onClick={() => { void save() }}>{t('prompts.save')}</button>
      <button type="button" disabled={saving} onClick={() => { setDraft(structuredClone(effective)); setInstruction(initialInstruction); setRestore(false); setStatus(null) }}>{t('prompts.cancel')}</button>
      {!sceneOnly && scope === 'story' && <button type="button" disabled={saving} onClick={() => { setDraft(structuredClone(baseline)); setRestore(true) }}>{t('prompts.restore')}</button>}
    </div>
    {status !== null && <p role="status">{status}</p>}
    {error !== null && <p role="alert">{error}</p>}
  </article>
}

function readPersonal(): unknown {
  try { return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown }
  catch { return [] } // Corrupt or unavailable browser storage does not prevent editing a story's durable styles.
}
