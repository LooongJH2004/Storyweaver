/** Current values and their constraints come from the same domain definition as model updates. */
import { useState } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { stateDefinitionSchema, type DynamicState, type StateChange, type StateDefinition, type StateEntry, type StateValue } from '@deepseek-ai/dsh-roleplay-core/dynamic-state'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'

/** State editing preserves rejected drafts and sends explicit compensating revisions. */
export function StateFields(props: { t: NarrativeProps['t']
  state: DynamicState
  actorId: string
  owner: 'actor' | 'world'
  people: readonly { id: string; label: string }[]
  save(changes: StateChange[]): Promise<void> }) {
  const { t } = props
  const [edit, setEdit] = useState<{ definition: StateDefinition; value: StateValue; revision: number; active: boolean } | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const open = (entry: StateEntry) => { setEdit(structuredClone(entry)); setReason(''); setError('') }
  const update = (patch: Partial<StateDefinition>) => {
    if (edit !== null) setEdit({ ...edit, definition: { ...edit.definition, ...patch } }) }
  return <section>
    <h3>{t(props.owner === 'world' ? 'worldState' : 'privateState')}</h3>
    <button disabled={props.actorId === ''} onClick={() => {
      setEdit({ definition: { id: randomUUID() as StateDefinition['id'], actorId: props.actorId, owner: props.owner,
        name: '', description: '', group: '', type: 'text', audience: [], guidance: '' }, value: '', revision: 0, active: true })
      setReason(''); setError('')
    }}>{t('addField')}</button>
    {props.state.entries.map(entry => <div key={entry.definition.id} className={css.card}>
      <strong>{entry.definition.group} · {entry.definition.name}</strong>
      <p>{Array.isArray(entry.value) ? entry.value.join(', ') : typeof entry.value === 'boolean' ? t(entry.value ? 'yes' : 'no') : entry.value}</p>
      <p>{entry.reason}</p><button onClick={() => { open(entry) }}>{t('editField')}</button>
      <details><summary>{t('fieldHistory')}</summary><pre>{JSON.stringify(props.state.history.filter(item => item.definition.id === entry.definition.id), null, 2)}</pre></details>
    </div>)}
    {edit !== null && <form onSubmit={(event) => { event.preventDefault(); setBusy(true); setError('')
      void (async () => { try {
        const definition = stateDefinitionSchema.parse(edit.definition)
        await props.save([{ fieldId: definition.id, definition, expectedRevision: edit.revision, value: edit.value,
          active: edit.active, reason, sourceRefs: [] }]); setEdit(null)
      } catch (error) { setError(String(error)) } finally { setBusy(false) } })()
    }}>
      {(['name', 'description', 'group', 'guidance'] as const).map(key => <label key={key}>{t(key === 'name' ? 'fieldName' : key)}
        <textarea value={edit.definition[key]} onChange={(event) => { update({ [key]: event.target.value }) }} /></label>)}
      <label>{t('type')}<select value={edit.definition.type} onChange={(event) => {
        const type = event.target.value as StateDefinition['type']
        const { minimum: _minimum, maximum: _maximum, options: _options, ...definition } = edit.definition
        setEdit({ ...edit, definition: { ...definition, type }, value: type === 'boolean' ? false : type === 'number' ? 0 : type === 'tags' ? [] : '' })
      }}>{(['text', 'number', 'boolean', 'choice', 'tags'] as const).map(type => <option key={type} value={type}>{t(type)}</option>)}</select></label>
      {edit.definition.type === 'number' && (['minimum', 'maximum'] as const).map(key => <label key={key}>{t(key)}
        <input type="number" step="any" value={edit.definition[key] ?? ''} onChange={(event) => { update({ [key]: event.target.value === '' ? undefined : event.target.valueAsNumber }) }} /></label>)}
      {['choice', 'tags'].includes(edit.definition.type) && <label>{t('options')}<textarea value={edit.definition.options?.join('\n') ?? ''}
        onChange={(event) => { update({ options: event.target.value.split('\n').filter(value => value.trim() !== '') }) }} /></label>}
      <label>{t('target')}<select value={edit.definition.targetActorId ?? ''} onChange={(event) => { update({ targetActorId: event.target.value || undefined }) }}>
        <option value="">{t('none')}</option>{props.people.map(person => <option key={person.id} value={person.id}>{person.label}</option>)}
      </select></label>
      {props.owner === 'world' && <fieldset><legend>{t('audience')}</legend>{props.people.map(person => <label key={person.id}>
        <input type="checkbox" checked={edit.definition.audience.includes(person.id)} onChange={(event) => {
          update({ audience: event.target.checked ? [...edit.definition.audience, person.id]
            : edit.definition.audience.filter(id => id !== person.id) })
        }} />{person.label}</label>)}</fieldset>}
      <label>{t('value')}{edit.definition.type === 'boolean'
        ? <input type="checkbox" checked={edit.value === true} onChange={(event) => { setEdit({ ...edit, value: event.target.checked }) }} />
        : edit.definition.type === 'number' ? <input type="number" step="any" min={edit.definition.minimum} max={edit.definition.maximum}
          value={typeof edit.value === 'number' ? edit.value : ''} onChange={(event) => { setEdit({ ...edit, value: event.target.valueAsNumber }) }} />
          : edit.definition.type === 'choice' ? <select value={typeof edit.value === 'string' ? edit.value : ''}
            onChange={(event) => { setEdit({ ...edit, value: event.target.value }) }}><option value="">{t('none')}</option>
            {edit.definition.options?.map(value => <option key={value} value={value}>{value}</option>)}</select>
            : <textarea value={Array.isArray(edit.value) ? edit.value.join('\n') : String(edit.value)} onChange={(event) => {
              setEdit({ ...edit, value: edit.definition.type === 'tags' ? event.target.value.split('\n') : event.target.value })
            }} />}</label>
      <label><input type="checkbox" checked={!edit.active} onChange={(event) => { setEdit({ ...edit, active: !event.target.checked }) }} />{t('inactive')}</label>
      <label>{t('reason')}<textarea required value={reason} onChange={(event) => { setReason(event.target.value) }} /></label>
      <button disabled={busy}>{t('save')}</button><button type="button" onClick={() => { setEdit(null) }}>{t('cancel')}</button>
      {error !== '' && <p role="alert">{error}</p>}
    </form>}
  </section>
}
