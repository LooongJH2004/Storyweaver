/** Book sharing edits remain drafts until the selected modules are published together. */
import { useState } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { initialContextRecipe } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import { creativeModules, creativeValue, type CreativeModule, type GlobalCreativeSettings } from '@deepseek-ai/dsh-roleplay-core/creative-modules'
import type { BookId, CommandId, InstanceId } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import { CreativeValueEditor, creativeLabels } from './CreativeControls.tsx'
import { CreativePreview } from './CreativePreview.tsx'
import css from './CreativeSync.module.css'

export function SharedCreativeEditor(props: NarrativeProps & { bookId: BookId
  instanceId?: InstanceId
  saved: GlobalCreativeSettings
  updated: (value: GlobalCreativeSettings) => void }) {
  const { t, saved, bookId } = props
  const draft = props.useStore(value => value.globalCreativeDrafts?.[bookId])
  const localDraft = props.useStore(value => props.instanceId === undefined ? undefined : value.recipeDrafts?.[props.instanceId])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const selected = draft?.selected ?? []
  const values = draft?.modules ?? saved.modules
  const conflict = draft !== undefined && draft.revision !== saved.revision
  const edit = (key: CreativeModule, value: GlobalCreativeSettings['modules'][CreativeModule]) => {
    props.actions.globalCreativeDraft(bookId, { revision: draft?.revision ?? saved.revision,
      modules: { ...values, [key]: value }, selected: [...new Set([...selected, key])] })
    setStatus('')
  }
  return <section>
    <h2>{t('syncSharedTab')}</h2><p>{t('syncPublishEffect')}</p>
    <div className={css.actions}><button
      disabled={busy || props.instanceId === undefined || localDraft !== undefined || draft !== undefined}
      onClick={() => {
        if (props.instanceId === undefined) return
        setBusy(true); setError('')
        void props.creativeSettings(props.instanceId).then((view) => {
          if (view.bookId !== bookId) throw new Error(t('syncWrongBook'))
          props.actions.globalCreativeDraft(bookId, { revision: saved.revision,
            modules: Object.fromEntries(creativeModules.map(key => [key, creativeValue(view.recipe, key)])),
            selected: [...creativeModules] })
          setStatus(t('syncLoadedRun'))
        }).catch((error: unknown) => { setError(String(error)) }).finally(() => { setBusy(false) })
      }}>{t('syncLoadRun')}</button><small>{t('syncVersion', { revision: saved.revision })}</small></div>
    {localDraft !== undefined && <p>{t('syncUnsentSource')}</p>}
    {draft !== undefined && <p>{t('syncDraftHint', { count: selected.length })}</p>}
    {conflict && <p role="alert">{t('syncConflict')}</p>}
    <form onSubmit={(event) => {
      event.preventDefault(); setBusy(true); setError(''); setStatus('')
      void props.publishCreative({ bookId, commandId: randomUUID() as CommandId, expectedGlobalRevision: draft?.revision ?? saved.revision,
        modules: Object.fromEntries(selected.map(key => [key, values[key]])) }).then((value) => {
        props.updated(value); props.actions.globalCreativeDraft(bookId, null); setStatus(t('syncPublished'))
      }).catch((error: unknown) => { setError(String(error)) }).finally(() => { setBusy(false) })
    }}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
        {creativeModules.map(key => <details className={css.row} key={key}>
          <summary><strong>{t(creativeLabels[key])}</strong><small>{t(selected.includes(key) ? 'syncEdited'
            : Object.hasOwn(saved.modules, key) ? 'syncConfigured' : 'syncUnset')}</small></summary>
          <CreativeValueEditor t={t} module={key}
            value={values[key] === undefined ? creativeValue(initialContextRecipe(), key) : values[key]}
            change={(value) => { edit(key, value) }} />
          {values[key] === null && key !== 'narrationLength' && <button type="button" onClick={() => {
            edit(key, creativeValue(initialContextRecipe(), key))
          }}>{t('syncRestoreContent')}</button>}
          {selected.includes(key) && <button type="button" onClick={() => {
            const remaining = selected.filter(value => value !== key)
            const modules = { ...values }; Reflect.deleteProperty(modules, key)
            if (saved.modules[key] !== undefined) modules[key] = saved.modules[key]
            props.actions.globalCreativeDraft(bookId, remaining.length === 0 ? null : {
              revision: draft?.revision ?? saved.revision, modules, selected: remaining })
          }}>{t('syncUndoModule')}</button>}
          <details><summary>{t('syncSavedValue')}</summary><CreativePreview t={t} value={saved.modules[key]} /></details>
        </details>)}
        <div className={css.actions}><button disabled={selected.length === 0 || conflict}>{t('syncPublish', { count: selected.length })}</button>
          <button type="button" disabled={draft === undefined} onClick={() => {
            props.actions.globalCreativeDraft(bookId, null); setStatus(''); setError('')
          }}>{t('creativeDiscard')}</button></div>
      </fieldset>
    </form>
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
  </section>
}
