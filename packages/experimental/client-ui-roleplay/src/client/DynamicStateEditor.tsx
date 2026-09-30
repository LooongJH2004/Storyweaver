/** Definition-driven state inspection, editing, and compensating revisions. */
import { useMemo, useState } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { stateDefinitionSchema } from '@deepseek-ai/dsh-story/state'
import type { DynamicState, StateChange, StateDefinition, StateEntry, StateValue } from '@deepseek-ai/dsh-story/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import css from './DynamicStateEditor.module.css'

type Translate = PropsLocale<typeof NS>['t']
type Draft = { definition: StateDefinition; value: StateValue; revision: number; active: boolean; reason: string }

/** Shared state form for storybook initial values and current runtime state. */
export function DynamicStateEditor({ state, actorId, actors, t, onSave, disabled = false }: {
  state: DynamicState
  actorId: string
  actors: readonly { actorId: string; displayName: string }[]
  t: Translate
  onSave: (changes: readonly StateChange[], owner: 'actor' | 'world') => Promise<void>
  disabled?: boolean
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const groups = useMemo(() => {
    const result = new Map<string, StateEntry[]>()
    for (const entry of state.entries) {
      if (!entry.active && !showInactive) continue
      const group = result.get(entry.definition.group) ?? []
      group.push(entry)
      result.set(entry.definition.group, group)
    }
    return [...result]
  }, [state, showInactive])

  const add = (): void => {
    setError(null)
    setDraft({ revision: 0, value: '', active: true, reason: '', definition: {
      audience: [], id: `${actorId}:${randomUUID()}` as StateDefinition['id'], name: '', description: '',
      group: t('state.defaultGroup'), type: 'text', owner: 'actor', actorId, guidance: '',
    } })
  }
  const edit = (entry: StateEntry): void => {
    setError(null)
    setDraft({ definition: structuredClone(entry.definition), value: structuredClone(entry.value),
      revision: entry.revision, active: entry.active, reason: '' })
  }
  const submit = async (changes: readonly StateChange[], owner: 'actor' | 'world'): Promise<void> => {
    if (saving) return
    setSaving(true)
    setError(null)
    try { await onSave(changes, owner); setDraft(null) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setSaving(false) }
  }
  const save = (): void => {
    if (draft === null) return
    try {
      const options = draft.definition.options?.map(item => item.trim()).filter(Boolean)
      const definition = stateDefinitionSchema.parse({ ...draft.definition,
        options: options?.length === 0 && draft.definition.type === 'tags' ? undefined : options })
      void submit([{ fieldId: definition.id, definition, expectedRevision: draft.revision,
        value: Array.isArray(draft.value) ? draft.value.map(item => item.trim()).filter(Boolean) : draft.value,
        active: draft.active, reason: draft.reason, sourceRefs: [] }], definition.owner)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const undo = (entry: StateEntry): void => {
    const previous = state.history.findLast(item => item.definition.id === entry.definition.id && item.revision < entry.revision)
    void submit([{ fieldId: entry.definition.id, expectedRevision: entry.revision,
      definition: previous?.definition ?? entry.definition, value: previous?.value ?? entry.value,
      active: previous?.active ?? false, reason: t('state.undoReason'), sourceRefs: [`state:${entry.definition.id}:r${entry.revision}`],
    }], entry.definition.owner)
  }

  return <section className={css.root} aria-label={t('state.title')}>
    <div className={css.toolbar}>
      <strong>{t('state.title')}</strong>
      <label><input type="checkbox" checked={showInactive} onChange={(event) => { setShowInactive(event.target.checked) }} />{t('state.showInactive')}</label>
      <button type="button" disabled={disabled || saving} onClick={add}>{t('state.add')}</button>
    </div>
    {error !== null && <p role="alert" className={css.error}>{error}</p>}
    {groups.length === 0 && <p>{t('state.empty')}</p>}
    {groups.map(([group, entries]) => <section key={group} className={css.group}>
      <h4>{group}</h4>
      {entries.map(entry => <article key={entry.definition.id} className={css.entry} data-active={entry.active}>
        <header><strong>{entry.definition.name}</strong><small>{t(`state.owner.${entry.definition.owner}`)}</small>
          {entry.definition.targetActorId !== undefined && <span>→ {
            actors.find(actor => actor.actorId === entry.definition.targetActorId)?.displayName ?? entry.definition.targetActorId
          }</span>}
        </header>
        <p>{displayValue(entry.value, t)}</p>
        <small>{entry.reason}</small>
        <footer>
          <button type="button" disabled={disabled || saving} onClick={() => { edit(entry) }}>{t('state.edit')}</button>
          <button type="button" disabled={disabled || saving} onClick={() => { undo(entry) }}>{t('state.undo')}</button>
          <details><summary>{t('state.history')}</summary>
            {state.history.filter(item => item.definition.id === entry.definition.id).slice().reverse().map(item => <p key={item.revision}>
              <b>#{item.revision} · {displayValue(item.value, t)}</b> · {item.reason}
              <small>{t(`state.origin.${item.origin}`)}{item.sourceRefs.length > 0 ? ` · ${item.sourceRefs.join(', ')}` : ''}</small>
            </p>)}
          </details>
        </footer>
      </article>)}
    </section>)}
    {draft !== null && <fieldset className={css.editor} disabled={saving}>
      <legend>{draft.revision === 0 ? t('state.add') : t('state.edit')}</legend>
      <label>{t('state.name')}<input value={draft.definition.name} onChange={(event) => { setDraft({ ...draft, definition: { ...draft.definition, name: event.target.value } }) }} /></label>
      <label>{t('state.group')}<input value={draft.definition.group} onChange={(event) => { setDraft({ ...draft, definition: { ...draft.definition, group: event.target.value } }) }} /></label>
      <label>{t('state.description')}<textarea value={draft.definition.description} onChange={(event) => { setDraft({ ...draft, definition: { ...draft.definition, description: event.target.value } }) }} /></label>
      <label>{t('state.type')}<select value={draft.definition.type} onChange={(event) => {
        const type = event.target.value as StateDefinition['type']
        const { minimum: _min, maximum: _max, options: _options, ...definition } = draft.definition
        setDraft({ ...draft, ...(draft.revision === 0 ? { value: type === 'boolean' ? false : type === 'number' ? 0 : type === 'tags' ? [] : '' } : {}), definition: { ...definition, type, ...(type === 'choice' ? { options: [] } : {}) } })
      }}>
        {(['text', 'number', 'boolean', 'choice', 'tags'] as const).map(type => <option key={type} value={type}>{t(`state.type.${type}`)}</option>)}
      </select></label>
      {draft.definition.owner === 'world' && <fieldset><legend>{t('state.audience')}</legend>{actors.map(actor => <label key={actor.actorId}>
        <input type="checkbox" checked={draft.definition.audience.includes(actor.actorId)} onChange={(event) => {
          const audience = event.target.checked ? [...draft.definition.audience,
            actor.actorId] : draft.definition.audience.filter(id => id !== actor.actorId)
          setDraft({ ...draft, definition: { ...draft.definition, audience } })
        }} />{actor.displayName}</label>)}</fieldset>}
      <label>{t('state.owner')}<select disabled={draft.revision > 0} value={draft.definition.owner} onChange={(event) => { setDraft({ ...draft, definition: { ...draft.definition, owner: event.target.value as 'actor' | 'world', audience: [] } }) }}>
        <option value="actor">{t('state.owner.actor')}</option><option value="world">{t('state.owner.world')}</option>
      </select></label>
      <label>{t('state.target')}<select value={draft.definition.targetActorId ?? ''} onChange={(event) => {
        setDraft({ ...draft, definition: { ...draft.definition, targetActorId: event.target.value || undefined } })
      }}><option value="">{t('state.noTarget')}</option>{actors.map(actor => <option key={actor.actorId} value={actor.actorId}>{actor.displayName}</option>)}</select></label>
      {draft.definition.type === 'number' && <div className={css.bounds}>
        {(['minimum', 'maximum'] as const).map(bound => <label key={bound}>{t(`state.${bound}`)}<input type="number" step="any" value={draft.definition[bound] ?? ''} onChange={(event) => {
          setDraft({ ...draft, definition: { ...draft.definition, [bound]: event.target.value === '' ? undefined : Number(event.target.value) } })
        }} /></label>)}
      </div>}
      {(draft.definition.type === 'choice' || draft.definition.type === 'tags') && <label>{t('state.options')}<textarea value={draft.definition.options?.join('\n') ?? ''} onChange={(event) => {
        const options = event.target.value.split('\n')
        setDraft({ ...draft, definition: { ...draft.definition, options: options.length === 0 && draft.definition.type === 'tags' ? undefined : options } })
      }} /></label>}
      <label>{t('state.guidance')}<textarea value={draft.definition.guidance} onChange={(event) => { setDraft({ ...draft, definition: { ...draft.definition, guidance: event.target.value } }) }} /></label>
      <StateValueInput definition={draft.definition} value={draft.value} t={t} onChange={(value) => { setDraft({ ...draft, value }) }} />
      <label>{t('state.reason')}<textarea value={draft.reason} onChange={(event) => { setDraft({ ...draft, reason: event.target.value }) }} /></label>
      <label><input type="checkbox" checked={draft.active} onChange={(event) => { setDraft({ ...draft, active: event.target.checked }) }} />{t('state.active')}</label>
      <div className={css.toolbar}>
        <button type="button" onClick={() => { setDraft(null); setError(null) }}>{t('state.cancel')}</button>
        <button type="button" disabled={draft.reason.trim().length === 0} onClick={save}>{saving ? t('state.saving') : t('state.save')}</button>
      </div>
    </fieldset>}
  </section>
}

function displayValue(value: StateValue, t: Translate): string {
  return typeof value === 'boolean' ? t(value ? 'state.yes' : 'state.no') : Array.isArray(value) ? value.join('、') : String(value)
}

function StateValueInput({ definition, value, t, onChange }: {
  definition: StateDefinition
  value: StateValue
  t: Translate
  onChange: (value: StateValue) => void
}) {
  if (definition.type === 'boolean') return <label><input type="checkbox" checked={value === true} onChange={(event) => { onChange(event.target.checked) }} />{t('state.value')}</label>
  if (definition.type === 'choice') return <label>{t('state.value')}<select value={typeof value === 'string' ? value : ''} onChange={(event) => { onChange(event.target.value) }}>
    <option value="">{t('state.select')}</option>{definition.options?.map(option => <option key={option} value={option}>{option}</option>)}
  </select></label>
  if (definition.type === 'number') return <label>{t('state.value')}<input type="number" step="any" min={definition.minimum} max={definition.maximum}
    value={typeof value === 'number' ? value : ''} onChange={(event) => { onChange(event.target.value === '' ? '' : Number(event.target.value)) }} /></label>
  return <label>{t('state.value')}<textarea value={Array.isArray(value) ? value.join('\n') : String(value)} onChange={(event) => {
    onChange(definition.type === 'tags' ? event.target.value.split('\n') : event.target.value)
  }} /></label>
}
