/** Ongoing instance settings share schema validation with the application and preserve editing drafts. */
import { useEffect, useState } from 'react'
import { instanceOverridesSchema, type InstanceSettings } from '@deepseek-ai/dsh-roleplay-core/settings'
import type { AuthorWorkspaceView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'
import { DiscussionSettingsFields } from './DiscussionSettingsFields.tsx'

const fields = ['title', 'premise', 'directorPrompt', 'directorRules', 'reasoningLanguage', 'setting', 'worldTruth', 'contextRules', 'discussionSettings'] as const
const jsonFields = new Set<keyof InstanceSettings>(['setting', 'worldTruth', 'contextRules', 'discussionSettings'])
function textOf(value: InstanceSettings): Record<keyof InstanceSettings, string> {
  return Object.fromEntries(fields.map(key => [key, jsonFields.has(key) ? JSON.stringify(value[key], null, 2)
    : key === 'directorRules' ? value.directorRules.join('\n') : value[key]])) as Record<keyof InstanceSettings, string>
}

/** Review all ongoing settings independently from immutable character and world initialization. */
export function Settings(props: NarrativeProps & { workspace: AuthorWorkspaceView; fields?: readonly (keyof InstanceSettings)[]; rule?: { side: 'actor' | 'director'; field: 'policy' | 'tools' } }) {
  const { t, workspace } = props
  const selected = props.useAuthor(value => value.request)
  const loading = props.useAuthor(value => value.loading)
  const stored = props.useStore(value => value.settingsDrafts?.[workspace.instance.id])
  const [values, setValues] = useState(() => stored?.values ?? textOf(workspace.settings.effective))
  const [overridden, setOverridden] = useState(() => new Set(stored?.overridden ?? Object.keys(workspace.settings.overrides)))
  const [edited, setEdited] = useState<ReadonlySet<keyof InstanceSettings>>(new Set(stored?.edited ?? []))
  const dirty = edited.size > 0
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const current = textOf(workspace.settings.effective)
    setValues(previous => Object.fromEntries(fields.map(key => [key, edited.has(key) ? previous[key] : current[key]])) as typeof previous)
    setOverridden(previous => new Set(fields.filter(key => edited.has(key) ? previous.has(key)
      : Object.hasOwn(workspace.settings.overrides, key))))
  }, [workspace.settings, edited])
  useEffect(() => {
    props.actions.settingsDraft(workspace.instance.id, dirty ? { values, overridden: [...overridden], edited: [...edited] } : null)
  }, [values, overridden, edited])
  const refresh = () => props.author(workspace.instance.id, selected?.actorId)
  return <form onSubmit={(event) => { event.preventDefault(); setBusy(true); setStatus(''); void (async () => {
    try {
      const candidate = new Map<string, unknown>(Object.entries(workspace.settings.overrides))
      for (const key of edited) {
        if (!overridden.has(key)) candidate.delete(key)
        else candidate.set(key, jsonFields.has(key) ? JSON.parse(values[key]) as unknown : key === 'directorRules'
          ? values[key].split('\n').filter(line => line.trim() !== '') : values[key])
      }
      const overrides = instanceOverridesSchema.parse(Object.fromEntries(candidate))
      await props.settings(workspace.instance.id, workspace.instance.revision, { overrides, reason: 'author settings edit' })
      await refresh(); setEdited(new Set()); setStatus(t('saved'))
    } catch (error) { setStatus(String(error)) } finally { setBusy(false) }
  })() }}>
    <p>{t('settingsDraftHint')}</p>
    <button type="button" disabled={loading || busy} onClick={() => { void refresh().catch((error: unknown) => { setStatus(String(error)) }) }}>{t('refresh')}</button>
    {(props.fields ?? fields).map(key => <section className={css.card} key={key}>
      <label>{t(key)}<small>{t('source', { source: t(workspace.settings.sources[key]) })}</small>
        {key !== 'contextRules' && key !== 'discussionSettings' && <textarea aria-label={t(key)} value={values[key]} onChange={(event) => {
          setValues({ ...values, [key]: event.target.value }); setOverridden(new Set([...overridden, key])); setEdited(new Set([...edited, key])); setStatus(t('dirty'))
        }} />}</label>
      {key === 'contextRules' && (['director', 'actor'] as const).filter(side => props.rule === undefined || props.rule.side === side).map(side => <section key={side}><h4>{t(side === 'actor' ? 'characters' : 'director')}</h4>
        {(['policy', 'tools'] as const).filter(field => props.rule === undefined || props.rule.field === field).map(field => <label key={field}>{t(field === 'policy' ? 'behaviorRules' : 'toolGuidance')}<textarea
          value={(JSON.parse(values.contextRules) as InstanceSettings['contextRules'])[side][field]} onChange={(event) => {
            const rules = JSON.parse(values.contextRules) as InstanceSettings['contextRules']; rules[side][field] = event.target.value
            setValues({ ...values, contextRules: JSON.stringify(rules, null, 2) }); setOverridden(new Set([...overridden, key])); setEdited(new Set([...edited, key])); setStatus(t('dirty'))
          }} /></label>)}
      </section>)}
      {key === 'discussionSettings' && <DiscussionSettingsFields t={t}
        value={JSON.parse(values.discussionSettings) as InstanceSettings['discussionSettings']} change={(discussionSettings) => {
          setValues({ ...values, discussionSettings: JSON.stringify(discussionSettings) }); setOverridden(new Set([...overridden, key])); setEdited(new Set([...edited, key])); setStatus(t('dirty'))
        }} />}
      <label><input type="checkbox" checked={overridden.has(key)} onChange={(event) => {
        const next = new Set(overridden)
        if (event.target.checked) next.add(key)
        else { next.delete(key); setValues({ ...values, [key]: textOf(workspace.settings.base)[key] }) }
        setOverridden(next); setEdited(new Set([...edited, key])); setStatus(t('dirty'))
      }} />{t('overrideField', { field: t(key) })}</label>
    </section>)}
    <p>{t('nextRequest')}</p><button disabled={busy || loading || !dirty}>{t('save')}</button><p role="status">{status}</p>
  </form>
}
