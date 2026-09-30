/** Scene attendance and transitions edit narrative records without starting actors. */
import { useEffect, useState } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { AuthorWorkspaceView, AuthorPeopleView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'

/** Changing a page of people preserves attendance entries outside that page. */
export function Scene(props: NarrativeProps & { workspace: AuthorWorkspaceView; people: AuthorPeopleView; actorId?: string }) {
  const { t, workspace } = props
  const [location, setLocation] = useState(workspace.scene.location)
  const [present, setPresent] = useState([...workspace.scene.present])
  const [transition, setTransition] = useState(workspace.scene.id === '')
  const [newId, setNewId] = useState(() => randomUUID())
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  useEffect(() => { if (!dirty) {
    setLocation(workspace.scene.location); setPresent([...workspace.scene.present]); setTransition(workspace.scene.id === '')
  } }, [workspace.scene, dirty])
  return <details className={css.card}>
    <summary>{t('sceneAttendance')}</summary>
    <form onSubmit={(event) => { event.preventDefault(); setBusy(true); setStatus('')
      void (async () => {
        try { await props.stageScene(workspace.instance.id, workspace.instance.revision,
          { id: transition ? newId : workspace.scene.id, location, present, appearances: [] })
        await props.author(workspace.instance.id, props.actorId); setDirty(false); setNewId(randomUUID()); setStatus(t('saved'))
        } catch (error) { setStatus(String(error)) } finally { setBusy(false) }
      })()
    }}>
      <label>{t('location')}<input required value={location} onChange={(event) => { setLocation(event.target.value); setDirty(true) }} /></label>
      <label><input type="checkbox" checked={transition} onChange={(event) => { setTransition(event.target.checked); setDirty(true) }} />{t('newScene')}</label>
      <p>{t('sceneHint')}</p>
      {props.people.entries.map(person => <label key={person.definition.actorId}><input type="checkbox" checked={present.includes(person.definition.actorId)}
        onChange={(event) => { const id = person.definition.actorId
          setPresent(event.target.checked ? [...present, id] : present.filter(value => value !== id))
          setDirty(true)
        }} />{person.definition.displayName}</label>)}
      <button disabled={busy}>{t('saveScene')}</button><p role="status">{status}</p>
    </form>
  </details>
}
