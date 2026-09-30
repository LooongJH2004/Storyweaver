/** Execution settings edit only technical routing for subsequent director and actor executions. */
import { useEffect, useState } from 'react'
import type { NarrativeProps } from './contract.ts'
import type { ExecutionModelSelection } from '@deepseek-ai/dsh-roleplay-core/types'

/** Keep an unsaved route when a write fails or a newer host settings revision is read.
 * @param props - Execution-settings mirror and named read/write operations.
 * @returns A technical model selector independent of fictional settings.
 */
export function ModelSettings(props: NarrativeProps) {
  const { t } = props
  const model = props.useModelSettings(value => value)
  const [draft, setDraft] = useState<ExecutionModelSelection>({ provider: '', model: '' })
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { void props.executionModel().catch((value: unknown) => { setError(String(value)) }) }, [props.executionModel])
  useEffect(() => { if (!dirty && model.view !== null) setDraft(model.view.selection) }, [model.view, dirty])
  return <details><summary>{t('executionModel')}</summary><p>{t('executionModelHint')}</p>
    {(['provider', 'model', 'reasoningEffort'] as const).map(key => <label key={key}>{t(key)}<input aria-label={t(key)}
      value={draft[key] ?? ''} onChange={(event) => { setDraft({ ...draft, [key]: event.target.value }); setDirty(true); setSaved(false) }} /></label>)}
    <button disabled={model.loading || !dirty || !model.view?.writable || draft.provider.trim() === '' || draft.model.trim() === ''}
      onClick={() => { const revision = model.view?.revision
        if (revision === undefined) return
        setError(''); setSaved(false)
        void props.selectExecutionModel(revision, { provider: draft.provider, model: draft.model,
          ...(draft.reasoningEffort?.trim() ? { reasoningEffort: draft.reasoningEffort } : {}) })
          .then(() => { setDirty(false); setSaved(true) }, (value: unknown) => { setError(String(value)) })
      }}>{t('saveExecutionModel')}</button>
    <button disabled={model.loading} onClick={() => { setError('')
      void props.executionModel().catch((value: unknown) => { setError(String(value)) }) }}>{t('refreshExecutionModel')}</button>
    {model.view !== null && <p>{t('revision', { revision: model.view.revision })}</p>}
    {model.view?.writable === false && <p>{t('executionModelReadonly')}</p>}
    {saved && <p role="status">{t('saved')}</p>}{(error || model.error) && <p role="alert">{error || model.error}</p>}
  </details>
}
