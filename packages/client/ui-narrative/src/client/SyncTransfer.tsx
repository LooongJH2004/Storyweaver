/** Selected shared modules move together into one explicitly chosen story. */
import { useEffect, useState } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { creativeModules, creativeValue, type CreativeModule, type GlobalCreativeSettings } from '@deepseek-ai/dsh-roleplay-core/creative-modules'
import type { CreativeSettingsView } from '@deepseek-ai/dsh-roleplay-core/creative-application'
import type { BookId, CommandId, InstanceId } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import { CreativeSourceLabel, creativeLabels } from './CreativeControls.tsx'
import { CreativePreview } from './CreativePreview.tsx'
import css from './CreativeSync.module.css'

export function SyncTransfer(props: NarrativeProps & {
  bookId: BookId
  instanceId?: InstanceId
  runLabel: string
  saved: GlobalCreativeSettings
  refreshRevision: number
  updated: (value: GlobalCreativeSettings) => void
  reload: () => void
  editShared: () => void
  openRestore: () => void
}) {
  const { t, saved, instanceId } = props
  const runs = props.useLibrary(value => value.instances.filter(run => run.book.id === props.bookId))
  const dirty = props.useStore(value => instanceId !== undefined && value.recipeDrafts?.[instanceId] !== undefined)
  const sharedDirty = props.useStore(value => value.globalCreativeDrafts?.[props.bookId] !== undefined)
  const [selected, setSelected] = useState<CreativeModule[]>([])
  const [reverse, setReverse] = useState(false)
  const [follow, setFollow] = useState(false)
  const [preview, setPreview] = useState<CreativeModule | null>(null)
  const [reading, setReading] = useState<{ id: InstanceId; view: CreativeSettingsView } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const view = reading !== null && reading.id === instanceId ? reading.view : null
  const available = creativeModules.filter(key => reverse ? view !== null : Object.hasOwn(saved.modules, key))
  const chosen = selected.filter(key => available.includes(key))
  useEffect(() => {
    let active = true
    setReading(null); setError(''); setSelected([]); setFollow(false); setPreview(null)
    if (instanceId !== undefined) void props.creativeSettings(instanceId).then((view) => {
      if (active) setReading({ id: instanceId, view })
    }, (error: unknown) => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [instanceId, props.creativeSettings, saved.revision, props.refreshRevision])
  const mismatch = view !== null && view.global.revision !== saved.revision
  const blocked = busy || dirty || reverse && sharedDirty || mismatch || view === null || chosen.length === 0
  return <>
    <div className={css.tabs} role="group" aria-label={t('syncDirectionChoice')}>
      <button disabled={busy} aria-pressed={!reverse} onClick={() => { setReverse(false); setSelected([]); setStatus('') }}>{t('syncForward')}</button>
      <button disabled={busy} aria-pressed={reverse} onClick={() => { setReverse(true); setSelected([]); setStatus('') }}>{t('syncReverse')}</button>
    </div>
    <div className={css.transfer}>
      <section className={css.pane} aria-label={t(reverse ? 'syncTo' : 'syncFrom')}>
        <div className={css.paneHead}><span className={css.eyebrow}>{t(reverse ? 'syncTo' : 'syncFrom')}</span>
          <button disabled={busy} onClick={props.editShared}>{t('syncEditShared')}</button></div>
        <h2>{t('syncSharedSource')}</h2>
        <div className={css.listHeading}><span>{t(reverse ? 'syncCurrentSources' : 'syncSelectModules')}</span>{!reverse && <button disabled={busy || available.length === 0}
          onClick={() => { setSelected(chosen.length === available.length ? [] : available) }}>
          {t(chosen.length === available.length && available.length > 0 ? 'syncSelectNone' : 'syncSelectAll')}</button>}</div>
        <div className={css.compactList}>{creativeModules.map(key => <div className={css.compactRow}
          key={key} data-selected={chosen.includes(key)}>
          <label>{!reverse && <input type="checkbox" disabled={busy || !available.includes(key)} checked={chosen.includes(key)}
            onChange={(event) => { setSelected(event.target.checked ? [...selected, key] : selected.filter(value => value !== key)); setStatus('') }} />}
          <span>{t(creativeLabels[key])}</span></label>
          {Object.hasOwn(saved.modules, key) ? <button aria-label={t('syncPreviewNamed', { module: t(creativeLabels[key]) })}
            onClick={() => { setPreview(key) }}>{t('syncView')}</button> : <small>{t('syncNotSet')}</small>}
        </div>)}</div>
        {!reverse && available.length === 0 && <p className={css.paneHint}>{t('syncEmptySource')}</p>}
        {sharedDirty && <p className={css.paneHint}>{t('syncSharedDraftPending')} <button disabled={busy}
          onClick={props.editShared}>{t('syncContinueEditing')}</button></p>}
      </section>
      <div className={css.transferArrow} aria-label={t(reverse ? 'syncReverse' : 'syncDirection')}><span aria-hidden="true">{reverse ? '←' : '→'}</span></div>
      <section className={css.pane} aria-label={t(reverse ? 'syncFrom' : 'syncTo')}>
        <div className={css.paneHead}><span className={css.eyebrow}>{t(reverse ? 'syncFrom' : 'syncTo')}</span>
          <button disabled={busy} onClick={props.reload}>{t('refresh')}</button></div>
        <label className={css.targetPicker}><span className={css.srOnly}>{t('syncTargetRun')}</span>
          <select value={instanceId ?? ''} disabled={busy || runs.length === 0} onChange={(event) => {
            props.actions.creativeNavigate({ bookId: props.bookId, instanceId: event.target.value, tab: 'stories' })
          }}><option value="" disabled>{t('syncNoRuns')}</option>
            {runs.map((run, index) => <option key={run.id} value={run.id}>{t('instanceNumber', { number: index + 1 })} · {run.id.slice(-6)}</option>)}
          </select></label>
        <div className={css.listHeading}><span>{t(reverse ? 'syncSelectModules' : 'syncCurrentSources')}</span>{reverse && <button disabled={busy || view === null}
          onClick={() => { setSelected(chosen.length === available.length ? [] : available) }}>{t(chosen.length === available.length ? 'syncSelectNone' : 'syncSelectAll')}</button>}</div>
        {view === null ? <p>{t(instanceId === undefined ? 'syncNoRuns' : 'loading')}</p>
          : <div className={css.compactList}>{creativeModules.map(key => <div className={css.compactRow}
            key={key} data-selected={chosen.includes(key)}>
            <label>{reverse && <input type="checkbox" disabled={busy} checked={chosen.includes(key)}
              onChange={(event) => { setSelected(event.target.checked ? [...selected, key] : selected.filter(value => value !== key)); setStatus('') }} />}
            <span>{t(creativeLabels[key])}</span></label>{reverse && <button onClick={() => { setPreview(key) }}>{t('syncView')}</button>}<small><CreativeSourceLabel t={t} view={view} module={key} /></small>
          </div>)}</div>}
        <button className={css.secondaryLink} disabled={busy || view === null} onClick={props.openRestore}>{t('syncRestoreOptions')}</button>
      </section>
    </div>
    <div className={css.transferFooter}>
      {reverse ? <p>{t('syncReverseEffect')}</p> : <div><label className={css.followChoice}><input type="checkbox" checked={follow} disabled={busy}
        onChange={(event) => { setFollow(event.target.checked) }} />{t('syncKeepFollowing')}</label>
      <p>{t(follow ? 'syncFollowShort' : 'syncOnceShort')}</p></div>}
      <button className={css.syncPrimary} disabled={blocked}
        onClick={() => {
          if (view === null || instanceId === undefined) return
          setBusy(true); setError(''); setStatus('')
          if (reverse) {
            void props.publishCreative({ bookId: props.bookId, commandId: randomUUID() as CommandId,
              expectedGlobalRevision: saved.revision, fromInstance: { instanceId, expectedRevision: view.instanceRevision },
              modules: Object.fromEntries(chosen.map(key => [key, creativeValue(view.recipe, key)])) }).then((value) => {
              props.updated(value); setStatus(t('syncPublished'))
            }).catch((error: unknown) => { setError(String(error)) }).finally(() => { setBusy(false) })
            return
          }
          void props.bindCreative(instanceId, view.instanceRevision, { modules: chosen, source: follow ? 'global' : 'copy-global',
            expectedBindingRevision: view.bindings.revision, expectedGlobalRevision: saved.revision }).then(async () => {
            setReading({ id: instanceId, view: await props.creativeSettings(instanceId) })
            setStatus(t('syncTransferDone', { count: chosen.length, story: props.runLabel }))
          }).catch((error: unknown) => { setError(String(error)) }).finally(() => { setBusy(false) })
        }}>{t(busy ? 'syncTransferring' : reverse ? 'syncReverseAction' : sharedDirty ? 'syncTransferSavedAction' : 'syncTransferAction', { count: chosen.length })}
        <span aria-hidden="true"> {reverse ? '←' : '→'}</span></button>
    </div>
    {dirty && <p role="alert">{t('syncDirtyRun')}</p>}
    {mismatch && <p role="alert">{t('syncReloadChanged')}</p>}
    {error && <p role="alert">{error} <button disabled={busy} onClick={props.reload}>{t('syncReloadRun')}</button></p>}
    {status && <p role="status">{status}</p>}
    {preview !== null && <Modal open title={t(creativeLabels[preview])} closeLabel={t('closePanel')}
      className={`${css.editorDialog}`} contentClassName={`${css.dialogScroll}`} onClose={() => { setPreview(null) }}>
      <div className={css.compareColumns}><section><h3>{t('syncSharedSource')}</h3><CreativePreview t={t} value={saved.modules[preview]} /></section>
        <section><h3>{props.runLabel || t('syncTo')}</h3><CreativePreview t={t} value={view === null ? undefined : creativeValue(view.recipe, preview)} /></section></div>
    </Modal>}
  </>
}
