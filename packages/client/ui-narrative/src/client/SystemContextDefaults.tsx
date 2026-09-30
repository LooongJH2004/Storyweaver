/** System initialization values are edited separately from book-scoped subscriptions. */
import { useEffect, useState } from 'react'
import type { ContextRecipe } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import type { NarrativeProps } from './contract.ts'
import { BookRecipe } from './BookRecipe.tsx'
import css from './Narrative.module.css'

/** Preserve unsaved defaults when navigating; a stale revision requires explicit reload. */
export function SystemContextDefaults(props: NarrativeProps) {
  const { t } = props
  const draft = props.useStore(state => state.recipeDrafts?.['system-context-defaults'])
  const [saved, setSaved] = useState<ContextRecipe | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void props.contextDefaults().then((value) => { if (active) setSaved(value) })
      .catch((value: unknown) => { if (active) setError(String(value)) })
    return () => { active = false }
  }, [props.contextDefaults])
  const edit = (value: ContextRecipe | null) => { props.actions.recipeDraft('system-context-defaults', value) }
  return <details className={css.recipeRow}>
    <summary>{t('systemContextDefaults')}</summary>
    {saved !== null && <form aria-busy={busy} onSubmit={(event) => {
      event.preventDefault(); if (draft === undefined) return
      setBusy(true); setError(''); setStatus('')
      void props.saveContextDefaults(draft).then((value) => { setSaved(value); edit(null); setStatus(t('systemContextSaved')) })
        .catch((value: unknown) => { setError(String(value)) }).finally(() => { setBusy(false) })
    }}>
      <fieldset className={css.creativeFieldset} disabled={busy}>
        <BookRecipe t={t} recipe={draft ?? saved} hint={t('systemContextHint')}
          change={(value) => { edit({ ...value, revision: draft?.revision ?? saved.revision }); setStatus('') }} />
        <div className={css.recipeSaveBar}>
          <button disabled={draft === undefined}>{t('systemContextSave')}</button>
          <button type="button" onClick={() => {
            setBusy(true); setError('')
            void props.contextDefaults().then((value) => { setSaved(value); edit(null); setStatus('') })
              .catch((value: unknown) => { setError(String(value)) }).finally(() => { setBusy(false) })
          }}>{t('systemContextReload')}</button>
        </div>
      </fieldset>
    </form>}
    <p role="status">{busy || saved === null && error === '' ? t('loading') : status}</p>
    {error !== '' && <p role="alert">{error}</p>}
  </details>
}
