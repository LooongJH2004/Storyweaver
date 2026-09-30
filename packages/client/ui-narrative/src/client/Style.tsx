/** Performance settings copy presets and keep temporary scene guidance separate. */
import { useEffect, useState } from 'react'
import { STYLE_PRESETS, styleProfileSchema, type StyleProfile } from '@deepseek-ai/dsh-roleplay-core/style'
import type { AuthorWorkspaceView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import type { NarrativeKey } from './locales.ts'
import css from './Narrative.module.css'

function savedProfile(profile: StyleProfile): StyleProfile {
  return styleProfileSchema.parse({ ...profile, guidance: Object.fromEntries(Object.entries(profile.guidance)
    .map(([key, value]) => [key, Array.isArray(value) ? value.filter(line => line.trim() !== '') : value])) })
}

/** Edit the actor selected in author mode or the director when none is selected. */
export function Style(props: NarrativeProps & { workspace: AuthorWorkspaceView }) {
  const { workspace, t } = props
  const target = workspace.actor ?? workspace.director
  const [profile, setProfile] = useState(target.profile)
  const [scene, setScene] = useState(target.sceneInstruction)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [sceneDirty, setSceneDirty] = useState(false)
  const [personalName, setPersonalName] = useState('')
  const personal = props.usePersonalStyles(value => value)
  useEffect(() => { if (!dirty) setProfile(target.profile) }, [target.profile, dirty])
  useEffect(() => { if (!sceneDirty) setScene(target.sceneInstruction) }, [target.sceneInstruction, sceneDirty])
  const save = async (sceneOnly: boolean) => {
    setBusy(true); setStatus('')
    try {
      await props.style(workspace.instance.id, workspace.instance.revision, sceneOnly
        ? { scope: 'scene', key: target.key, sceneId: workspace.scene.id, instruction: scene }
        : { scope: 'story', key: target.key, profile: savedProfile(profile) })
      await props.author(workspace.instance.id, workspace.actor?.actorId)
      if (sceneOnly) setSceneDirty(false); else setDirty(false)
      setStatus(t('saved'))
    } catch (error) { setStatus(String(error)) } finally { setBusy(false) }
  }
  return <section>
    <p>{t('source', { source: t(target.source) })}</p>
    <p>{t('performanceLocationHint')} <button type="button" onClick={() => { props.actions.authorTab('context') }}>{t('editPerformance')}</button></p>
    <div className={css.toolbar}>{STYLE_PRESETS.filter(preset => preset.profile.kind === target.profile.kind).map(preset => <button
      key={preset.id} onClick={() => { setProfile(structuredClone(preset.profile)); setDirty(true); setStatus(t('dirty')) }}>{t(preset.id as NarrativeKey)}</button>)}</div>
    <details><summary>{t('personalStyles')}</summary>
      {personal.error !== null && <p role="alert">{personal.error}</p>}
      <button onClick={props.refreshPersonalStyles}>{t('refresh')}</button>
      {personal.entries.filter(preset => preset.profile.kind === profile.kind).map(preset => <div key={preset.name}>
        <button onClick={() => { setProfile(structuredClone(preset.profile)); setDirty(true); setStatus(t('dirty')) }}>{preset.name}</button>
        <button onClick={() => { try { props.removePersonalStyle(preset.name, preset.profile.kind) }
        catch (error) { setStatus(String(error)) }
        }}>{t('removePreset')}</button>
      </div>)}
      <form onSubmit={(event) => { event.preventDefault()
        try { props.savePersonalStyle(personalName, savedProfile(profile)); setStatus(t('personalSaved')) }
        catch (error) { setStatus(String(error)) }
      }}><label>{t('presetName')}<input value={personalName} onChange={(event) => { setPersonalName(event.target.value) }} /></label>
        <button disabled={personalName.trim() === ''}>{t('savePreset')}</button>
      </form>
    </details>
    <form onSubmit={(event) => { event.preventDefault(); void save(false) }}>
      {Object.entries(profile.guidance).map(([key, value]) => <label key={key}>{t(key as NarrativeKey)}
        <textarea aria-label={t(key as NarrativeKey)} value={Array.isArray(value) ? value.join('\n') : value} onChange={(event) => {
          const next = Array.isArray(value) ? event.target.value.split('\n') : event.target.value
          setProfile(profile.kind === 'actor' ? { kind: 'actor', guidance: { ...profile.guidance, [key]: next } }
            : { kind: 'director', guidance: { ...profile.guidance, [key]: next } })
          setDirty(true)
          setStatus(t('dirty'))
        }} />
      </label>)}
      <button disabled={busy}>{t('save')}</button>
    </form>
    <form onSubmit={(event) => { event.preventDefault(); void save(true) }}>
      <label>{t('sceneGuidance')}<textarea aria-label={t('sceneGuidance')} value={scene} onChange={(event) => { setScene(event.target.value); setSceneDirty(true); setStatus(t('dirty')) }} /></label>
      <button disabled={busy}>{t('save')}</button>
    </form>
    <p>{t('nextRequest')}</p><p role="status">{status}</p>
  </section>
}
