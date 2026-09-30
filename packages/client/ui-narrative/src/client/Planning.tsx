/** Author planning keeps candidate outcomes separate from settled events and actor knowledge. */
import { useEffect, useState } from 'react'
import type { AuthorWorkspaceView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { DirectorOutline, DirectorOutlinePlayerInput } from '@deepseek-ai/dsh-roleplay-core/outline-model'
import type { OutlinePlayerUpdateInput } from '@deepseek-ai/dsh-roleplay-core/command-inputs'
import type { NarrativeProps } from './contract.ts'

const categories = ['themes', 'hardConstraints', 'arcs', 'beats', 'foreshadows', 'mysteries', 'clocks'] as const
function editable(outline: DirectorOutline): string {
  return JSON.stringify(Object.fromEntries(categories.map(key => [key, outline[key].map(({ source: _source, ...item }) => item)])), null, 2)
}

/** Preserve unsubmitted changes; require a fresh review when the planning revision changes.
 * @param props - Author view and named planning operations.
 * @returns Candidate-plan editor and explicit proposal review controls.
 */
export function Planning(props: NarrativeProps & { workspace: AuthorWorkspaceView }) {
  const { t, workspace } = props
  const current = workspace.outline
  const [base, setBase] = useState(current.revision)
  const [premise, setPremise] = useState(current.premise)
  const [locked, setLocked] = useState(current.premiseLocked)
  const [mode, setMode] = useState(current.updateMode)
  const [content, setContent] = useState(() => editable(current))
  const [reason, setReason] = useState('')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const reset = () => { setBase(current.revision); setPremise(current.premise); setLocked(current.premiseLocked)
    setMode(current.updateMode); setContent(editable(current)); setDirty(false); setReason(''); setError('') }
  useEffect(() => { if (!dirty) { setBase(current.revision); setPremise(current.premise); setLocked(current.premiseLocked)
    setMode(current.updateMode); setContent(editable(current)) } }, [current, dirty])
  const changed = () => { setDirty(true); setSaved(false) }
  const submit = async (input: OutlinePlayerUpdateInput) => {
    setBusy(true); setError(''); setSaved(false)
    try { await props.planning(workspace.instance.id, workspace.instance.revision, input)
      await props.author(workspace.instance.id, workspace.actor?.actorId)
      setDirty(false); setReason(''); setSaved(true)
    } catch (value) { setError(String(value)) } finally { setBusy(false) }
  }
  return <details><summary>{t('planning')}</summary><p>{t('planningHint')}</p>
    <p>{t('revision', { revision: current.revision })}</p>
    <label>{t('planningMode')}<select aria-label={t('planningMode')} value={mode} onChange={(event) => {
      setMode(event.target.value as DirectorOutlinePlayerInput['updateMode']); changed()
    }}><option value="auto_unlocked">{t('planningAuto')}</option><option value="review_all">{t('planningReview')}</option></select></label>
    <label>{t('planningPremise')}<textarea aria-label={t('planningPremise')} value={premise} onChange={(event) => {
      setPremise(event.target.value); changed()
    }} /></label>
    <label><input type="checkbox" checked={locked} onChange={(event) => { setLocked(event.target.checked); changed() }} />{t('planningLock')}</label>
    <label>{t('planningSections')}<textarea aria-label={t('planningSections')} value={content} onChange={(event) => {
      setContent(event.target.value); changed()
    }} /></label>
    <p>{t('planningSectionsHint')}</p>
    <label>{t('reason')}<input value={reason} onChange={(event) => { setReason(event.target.value) }} /></label>
    {dirty && base !== current.revision && <p role="alert">{t('planningConflict')}</p>}
    <button disabled={busy || !dirty || reason.trim() === '' || base !== current.revision} onClick={() => {
      try { const sections = JSON.parse(content) as Omit<DirectorOutlinePlayerInput, 'premise' | 'premiseLocked' | 'updateMode'>
        void submit({ operation: 'replace', expectedOutlineRevision: base, reason,
          outline: { ...sections, premise, premiseLocked: locked, updateMode: mode } })
      } catch (value) { setError(String(value)) }
    }}>{t('savePlanning')}</button>
    <button disabled={busy} onClick={() => { void props.author(workspace.instance.id, workspace.actor?.actorId)
      .catch((value: unknown) => { setError(String(value)) }) }}>{t('refreshPlanning')}</button>
    <button disabled={busy || !dirty} onClick={reset}>{t('discardPlanning')}</button>
    {current.pendingSuggestions.map(suggestion => <section key={suggestion.id}>
      <h3>{t('planningProposal')}</h3><p>{suggestion.reason}</p><pre>{JSON.stringify(suggestion.patch, null, 2)}</pre>
      <button disabled={busy || dirty} onClick={() => { void submit({ operation: 'review', expectedOutlineRevision: current.revision,
        suggestionId: suggestion.id, accept: true }) }}>{t('approve')}</button>
      <button disabled={busy || dirty} onClick={() => { void submit({ operation: 'review', expectedOutlineRevision: current.revision,
        suggestionId: suggestion.id, accept: false }) }}>{t('reject')}</button>
    </section>)}
    <details><summary>{t('planningHistory')}</summary><pre>{JSON.stringify(current.history, null, 2)}</pre></details>
    {saved && <p role="status">{t('saved')}</p>}{error !== '' && <p role="alert">{error}</p>}
  </details>
}
