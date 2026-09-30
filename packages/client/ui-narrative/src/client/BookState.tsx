/** Author-defined starting state shares the runtime's field vocabulary and value constraints. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Document, Json } from '@deepseek-ai/dsh-roleplay-core/types'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { BookLines, objectValue, textValue } from './BookControls.tsx'
import css from './Narrative.module.css'

/** Edit a character's initial fields before publication. */
export function BookState({ t, actorId, people, value, change }: PropsLocale<'narrative'> & { actorId: string; people: Document[]; value: Json | undefined; change: (value: Json[]) => void }) {
  const entries = Array.isArray(value) ? value.map(objectValue) : []
  const update = (index: number, entry: Document) => { change(entries.map((item, i) => i === index ? entry : item)) }
  return <section>{entries.map((entry, index) => {
    const definition = objectValue(entry.definition)
    const set = (key: string, value: Json) => { update(index, { ...entry, definition: { ...definition, [key]: value } }) }
    return <fieldset key={textValue(definition.id)} className={css.bookEntry}>
      <legend>{textValue(definition.name) || t('bookState')}</legend>
      {(['name', 'description', 'group', 'guidance'] as const).map(key => <label key={key}>{t(key)}<input value={textValue(definition[key])} onChange={(event) => { set(key, event.target.value) }} /></label>)}
      <div className={css.bookGrid}><label>{t('bookStateOwner')}<select value={textValue(definition.owner)} onChange={(event) => {
        update(index, { ...entry, definition: { ...definition, owner: event.target.value, audience: [] } })
      }}><option value="actor">{t('bookSubjective')}</option><option value="world">{t('worldState')}</option></select></label>
      <label>{t('target')}<select value={textValue(definition.targetActorId)} onChange={(event) => {
        const next = { ...definition }; if (event.target.value) next.targetActorId = event.target.value; else Reflect.deleteProperty(next, 'targetActorId')
        update(index, { ...entry, definition: next })
      }}><option value="">{t('none')}</option>{people.map(person => <option key={textValue(person.actorId)} value={textValue(person.actorId)}>{textValue(person.displayName)}</option>)}</select></label></div>
      {definition.owner === 'world' && <fieldset><legend>{t('audience')}</legend>{people.map((person) => {
        const id = textValue(person.actorId); const audience = Array.isArray(definition.audience) ? definition.audience : []
        return <label key={id}><input type="checkbox" checked={audience.includes(id)} onChange={(event) => { set('audience', event.target.checked ? [...audience, id] : audience.filter(value => value !== id)) }} />{textValue(person.displayName)}</label>
      })}</fieldset>}
      <label>{t('fieldType')}<select value={textValue(definition.type)} onChange={(event) => {
        const type = event.target.value
        const next: Document = { ...definition, type }; Reflect.deleteProperty(next, 'minimum'); Reflect.deleteProperty(next, 'maximum'); Reflect.deleteProperty(next, 'options')
        if (type === 'choice' || type === 'tags') next.options = []
        update(index, { definition: next, value: type === 'number' ? 0 : type === 'boolean' ? false : type === 'tags' ? [] : '' })
      }}>{(['text', 'number', 'boolean', 'choice', 'tags'] as const).map(type => <option key={type} value={type}>{t(`type-${type}`)}</option>)}</select></label>
      {definition.type === 'number' && <div className={css.bookGrid}>{(['minimum', 'maximum'] as const).map(key => <label key={key}>{t(key)}<input type="number" step="any" value={typeof definition[key] === 'number' ? definition[key] : ''} onChange={(event) => {
        const next = { ...definition }; if (event.target.value === '') Reflect.deleteProperty(next, key); else next[key] = event.target.valueAsNumber
        update(index, { ...entry, definition: next })
      }} /></label>)}</div>}
      {(definition.type === 'choice' || definition.type === 'tags') && <BookLines label={t('options')} value={definition.options} change={(value) => { set('options', value) }} />}
      {definition.type === 'tags' ? <BookLines label={t('bookValue')} value={entry.value} change={(value) => { update(index, { ...entry, value }) }} /> : <label>{t('bookValue')}{definition.type === 'boolean' ? <input type="checkbox" checked={entry.value === true} onChange={(event) => { update(index, { ...entry, value: event.target.checked }) }} />
        : definition.type === 'number' ? <input type="number" step="any" value={typeof entry.value === 'number' ? entry.value : 0} onChange={(event) => { if (Number.isFinite(event.target.valueAsNumber)) update(index, { ...entry, value: event.target.valueAsNumber }) }} />
          : definition.type === 'choice' ? <select value={textValue(entry.value)} onChange={(event) => { update(index, { ...entry, value: event.target.value }) }}><option value="">{t('none')}</option>{(Array.isArray(definition.options) ? definition.options : []).map(option => <option key={textValue(option)} value={textValue(option)}>{textValue(option)}</option>)}</select>
            : <textarea value={textValue(entry.value)}
              onChange={(event) => { update(index, { ...entry, value: event.target.value }) }} />}</label>}
      <button type="button" onClick={() => { change(entries.filter((_, i) => i !== index)) }}>{t('bookDeleteEntry')}</button>
    </fieldset>
  })}<button type="button" onClick={() => { change([...entries, { definition: { id: `state-${randomUUID()}`, actorId,
    name: '', description: '', group: '', type: 'text', owner: 'actor', audience: [], guidance: '' }, value: '' }]) }}>{t('addField')}</button></section>
}
