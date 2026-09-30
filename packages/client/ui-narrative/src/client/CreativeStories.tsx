/** Source selection previews one reviewed module before changing a single story. */
import { useEffect, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { creativeModules, creativeValue, type CreativeModule } from '@deepseek-ai/dsh-roleplay-core/creative-modules'
import type { CreativeSettingsView, CreativeSourceInput } from '@deepseek-ai/dsh-roleplay-core/creative-application'
import type { InstanceId } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import { CreativeSourceLabel, creativeLabels } from './CreativeControls.tsx'
import { CreativePreview } from './CreativePreview.tsx'
import css from './CreativeSync.module.css'

const sourceLabels = { global: 'syncFollowAction', 'copy-global': 'syncCopyAction', local: 'syncRestoreLocal', storybook: 'syncRestoreBook' } as const
const sourceHints = { global: 'syncFollowEffect', 'copy-global': 'syncCopyEffect', local: 'syncLocalEffect', storybook: 'syncPinnedEffect' } as const

export function CreativeStories(props: NarrativeProps & {
  instanceId: InstanceId
  runLabel: string
  sharedRevision: number
  refreshRevision: number
}) {
  const { t, instanceId } = props
  const [view, setView] = useState<CreativeSettingsView | null>(null)
  const [module, setModule] = useState<CreativeModule | null>(null)
  const [source, setSource] = useState<CreativeSourceInput['source']>('global')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const dirty = props.useStore(value => value.recipeDrafts?.[instanceId] !== undefined)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setView(null); setModule(null); setError('')
    void props.creativeSettings(instanceId).then((value) => { if (active) setView(value) },
      (error: unknown) => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [instanceId, props.creativeSettings, props.sharedRevision, props.refreshRevision, revision])
  const available = view !== null && module !== null && Object.hasOwn(view.global.modules, module)
  const value = view === null || module === null ? undefined : source === 'local' ? view.bindings.modules[module].localValue
    : source === 'storybook' ? creativeValue(view.storybook, module) : view.global.modules[module]
  return <section>
    <h2>{t('syncStoriesTab')}</h2><p>{t('syncStoriesHint')}</p>
    {dirty && <p role="alert">{t('syncDirtyRun')}</p>}
    {view === null && !error && <p role="status">{t('loading')}</p>}
    {view !== null && creativeModules.map(key => <article className={css.row} key={key}>
      <div className={css.rowHeader}><div><strong>{t(creativeLabels[key])}</strong>
        <p><CreativeSourceLabel t={t} view={view} module={key} /></p></div>
      <button disabled={dirty} aria-label={t('syncChangeNamed', { module: t(creativeLabels[key]) })} onClick={() => {
        setModule(key); setSource(view.bindings.modules[key].source); setError(''); setStatus('')
      }}>{t('syncChange')}</button></div>
    </article>)}
    {status && <p role="status">{status}</p>}{error && module === null && <p role="alert">{error}</p>}
    {module !== null && view !== null && <Modal open title={t('syncChangeNamed', { module: t(creativeLabels[module]) })}
      closeLabel={t('cancel')} className={`${css.dialog}`} contentClassName={`${css.dialogScroll}`}
      onClose={() => { if (!busy) setModule(null) }}>
      <strong>{props.runLabel}</strong><p>{t('syncOnlyRun')}</p>
      <fieldset disabled={busy} style={{ border: 0, padding: 0 }}><legend>{t('syncChooseBehavior')}</legend>
        {(['global', 'copy-global', 'local', 'storybook'] as const).map(key => <label className={css.option} key={key}>
          <input type="radio" name="creative-source" value={key} checked={source === key}
            disabled={(key === 'global' || key === 'copy-global') && !available} onChange={() => { setSource(key) }} />
          {t(sourceLabels[key])}<small>{t(sourceHints[key])}</small>
        </label>)}
      </fieldset>
      {!available && <p>{t('syncSetSharedFirst')}</p>}
      <details open><summary>{t('syncPreviewNext')}</summary><CreativePreview t={t} value={value} /></details>
      <details><summary>{t('syncPreviewCurrent')}</summary><CreativePreview t={t} value={creativeValue(view.recipe, module)} /></details>
      <div className={css.actions}><button disabled={busy || dirty || (source === 'global' || source === 'copy-global') && !available} onClick={() => {
        setBusy(true); setError('')
        void props.bindCreative(instanceId, view.instanceRevision, { module, source,
          expectedBindingRevision: view.bindings.revision, expectedGlobalRevision: view.global.revision }).then(async () => {
          const next = await props.creativeSettings(instanceId)
          setView(next); setModule(null); setStatus(t('syncApplied'))
        }).catch((error: unknown) => { setError(String(error)) }).finally(() => { setBusy(false) })
      }}>{t(sourceLabels[source])}</button>
      <button disabled={busy} onClick={() => { setModule(null) }}>{t('cancel')}</button>
      </div>
      {error && <div role="alert"><p>{error}</p><button disabled={busy} onClick={() => { setRevision(value => value + 1) }}>{t('syncReloadRun')}</button></div>}
    </Modal>}
  </section>
}
