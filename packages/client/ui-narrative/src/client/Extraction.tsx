/** Runtime material returns to a new book draft only through an explicit reviewed selection. */
import { useState } from 'react'
import type { AuthorWorkspaceView, AuthorPeopleView, ExtractionPreview } from '@deepseek-ai/dsh-roleplay-core/types'
import type { MaterialSelection } from '@deepseek-ai/dsh-roleplay-core/command-inputs'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'

/** Default selection contains no runtime state, memory, or judgment. */
export function Extraction(props: NarrativeProps & { workspace: AuthorWorkspaceView; people: AuthorPeopleView }) {
  const { t } = props
  const [people, setPeople] = useState<string[]>([])
  const [title, setTitle] = useState(props.workspace.instance.title)
  const [extras, setExtras] = useState(JSON.stringify({ factIds: [], knowledge: [], state: [], memories: [] }, null, 2))
  const [preview, setPreview] = useState<{ view: ExtractionPreview; selection: MaterialSelection; title: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const review = async () => {
    setBusy(true); setError('')
    try {
      const selection: MaterialSelection = { ...JSON.parse(extras) as Omit<MaterialSelection, 'people'>, people }
      setPreview({ view: await props.previewExtraction(props.workspace.instance.id, selection, title), selection, title })
    } catch (error) { setError(String(error)) } finally { setBusy(false) }
  }
  return <section className={css.card}><h3>{t('collect')}</h3><p className={css.metadata}>{t('materialHint')}</p>
    <details><summary>{t('selectMaterial')}</summary>
      <label>{t('title')}<input value={title} onChange={(event) => { setTitle(event.target.value); setPreview(null) }} /></label>
      <fieldset><legend>{t('material')}</legend>{props.people.entries.map(person => <label key={person.definition.actorId}>
        <input type="checkbox" checked={people.includes(person.definition.actorId)} onChange={(event) => {
          setPeople(event.target.checked ? [...people, person.definition.actorId] : people.filter(id => id !== person.definition.actorId))
          setPreview(null)
        }} />{person.definition.displayName}</label>)}</fieldset>
      <details><summary>{t('selection')}</summary><textarea aria-label={t('selection')} value={extras} onChange={(event) => { setExtras(event.target.value); setPreview(null) }} /></details>
      <button disabled={busy} onClick={() => { void review() }}>{t('preview')}</button>
      {preview !== null && <><pre>{JSON.stringify(preview.view.document, null, 2)}</pre><button disabled={busy} onClick={() => {
        setBusy(true); setError('')
        void props.extract(preview.view.instanceId, preview.view.revision, preview.selection, preview.title)
          .then(() => { setPreview(null); props.actions.panel('books') }, (error: unknown) => { setError(String(error)) })
          .finally(() => { setBusy(false) })
      }}>{t('collect')}</button></>}
      {error !== '' && <p role="alert">{error}</p>}
    </details>
  </section>
}
