/** Structured controls edit portable authored data without submitting a running-world command. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Document, Json } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeKey } from './locales.ts'
import css from './Narrative.module.css'

type Locale = PropsLocale<'narrative'>
/** Read an object field while leaving all unrelated document properties untouched. */
export const objectValue = (value: Json | undefined): Document => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
/** Text fields also accept unfinished author drafts. */
export const textValue = (value: Json | undefined): string => typeof value === 'string' ? value : ''

/** Multiline lists retain unfinished lines while typing, trimming only on blur. */
export function BookLines({ label, value, change }: { label: string; value: Json | undefined; change: (value: string[]) => void }) {
  return <label>{label}<textarea value={Array.isArray(value) ? value.map(String).join('\n') : ''}
    onChange={(event) => { change(event.target.value.split('\n')) }}
    onBlur={(event) => { change(event.target.value.split('\n').map(value => value.trim()).filter(Boolean)) }} /></label>
}

/** Fields in a repeatable memory, goal, intention, or knowledge entry. */
export interface BookEntryField { key: string; labelKey: NarrativeKey; kind?: 'number' | 'select'; options?: readonly { value: string; label: string }[]; optional?: boolean }
/** Repeatable records expose each authored property and preserve unedited properties. */
export function BookEntries({ t, label, value, fields, initial, change }: Locale & {
  label: string
  value: Json | undefined
  fields: readonly BookEntryField[]
  initial: Document
  change: (value: Document[]) => void
}) {
  const entries = Array.isArray(value) ? value.map(objectValue) : []
  const edit = (index: number, key: string, value: Json | undefined) => {
    const next = { ...entries[index] }
    if (value === undefined) Reflect.deleteProperty(next, key); else next[key] = value
    change(entries.map((entry, i) => i === index ? next : entry))
  }
  return <section className={css.bookSection} aria-label={label}><h3>{label}</h3>
    {entries.map((entry, index) => <fieldset key={index} className={css.bookEntry}>
      <legend>{label} {index + 1}</legend>
      {fields.map(field => <label key={field.key}>{t(field.labelKey)}
        {field.kind === 'number' ? <input type="number" min={1} max={5} value={typeof entry[field.key] === 'number' ? Number(entry[field.key]) : 3}
          onChange={(event) => { if (Number.isFinite(event.target.valueAsNumber)) edit(index, field.key, event.target.valueAsNumber) }} />
          : field.kind === 'select' ? <select value={textValue(entry[field.key])} onChange={(event) => { edit(index, field.key, field.optional && event.target.value === '' ? undefined : event.target.value) }}>
            {field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            : <textarea value={textValue(entry[field.key])} onChange={(event) => { edit(index, field.key, field.optional && event.target.value === '' ? undefined : event.target.value) }} />}
      </label>)}
      <button type="button" onClick={() => { change(entries.filter((_, i) => i !== index)) }}>{t('bookDeleteEntry')}</button>
    </fieldset>)}
    <button type="button" onClick={() => { change([...entries, structuredClone(initial)]) }}>{t('bookAddEntry')}</button>
  </section>
}

/** Arbitrary world properties remain editable as typed fields, including nested groups and lists. */
export function BookValue({ t, value, change, label }: Locale & { value: Json; label: string; change: (value: Json) => void }) {
  const kind = value === null ? 'text' : Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : typeof value
  const kinds = [{ id: 'string', labelKey: 'bookTypeText', value: '' }, { id: 'number', labelKey: 'bookTypeNumber', value: 0 },
    { id: 'boolean', labelKey: 'bookTypeBoolean', value: false }, { id: 'object', labelKey: 'bookTypeObject', value: {} },
    { id: 'array', labelKey: 'bookTypeArray', value: [] }] as const
  return <div className={css.bookValue}>
    <label>{t('bookValueType')}<select aria-label={`${label} · ${t('bookValueType')}`} value={kind === 'text' ? 'string' : kind}
      onChange={(event) => { const type = kinds.find(type => type.id === event.target.value)
        if (type !== undefined) change(JSON.parse(JSON.stringify(type.value)) as Json) }}>
      {kinds.map(type => <option key={type.id} value={type.id}>{t(type.labelKey)}</option>)}
    </select></label>
    {Array.isArray(value) ? <div>{value.map((item, index) => <div key={index} className={css.bookEntry}>
      <BookValue t={t} label={`${label} ${index + 1}`} value={item} change={(next) => { change(value.map((current, i) => i === index ? next : current)) }} />
      <button type="button" onClick={() => { change(value.filter((_, i) => i !== index)) }}>{t('bookDeleteEntry')}</button>
    </div>)}<button type="button" onClick={() => { change([...value, '']) }}>{t('bookAddEntry')}</button></div>
      : typeof value === 'object' && value !== null ? <BookObject t={t} value={value} change={change} />
        : typeof value === 'boolean' ? <label><input type="checkbox" checked={value} onChange={(event) => { change(event.target.checked) }} />{label}</label>
          : typeof value === 'number' ? <label>{label}<input type="number" step="any" value={value} onChange={(event) => { if (Number.isFinite(event.target.valueAsNumber)) change(event.target.valueAsNumber) }} /></label>
            : <label>{label}<textarea value={value ?? ''} onChange={(event) => { change(event.target.value) }} /></label>}
  </div>
}

/** World settings can carry author-defined properties without a raw-JSON prerequisite. */
export function BookObject({ t, value, change }: Locale & { value: Document; change: (value: Document) => void }) {
  return <div>{Object.entries(value).map(([key, entry]) => <fieldset key={key} className={css.bookEntry}>
    <label>{t('bookKey')}<input defaultValue={key} onBlur={(event) => {
      const name = event.target.value.trim()
      if (!name || name === key || name in value) { event.target.value = key; return }
      change(Object.fromEntries(Object.entries(value).map(([current, item]) => [current === key ? name : current, item])))
    }} /></label>
    <BookValue t={t} label={key} value={entry} change={(next) => { change({ ...value, [key]: next }) }} />
    <button type="button" onClick={() => { const next = { ...value }; Reflect.deleteProperty(next, key); change(next) }}>{t('bookDeleteEntry')}</button>
  </fieldset>)}<button type="button" onClick={() => {
    let number = Object.keys(value).length + 1
    while (`field-${number}` in value) number++
    change({ ...value, [`field-${number}`]: '' })
  }}>{t('bookAddEntry')}</button></div>
}
