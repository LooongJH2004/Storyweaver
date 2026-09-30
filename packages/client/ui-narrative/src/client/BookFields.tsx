/** A focused storybook editor keeps authored baselines separate from running-world overrides. */
import { useState } from 'react'
import type { Document, Json } from '@deepseek-ai/dsh-roleplay-core/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { legacyContextRecipe } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import { actingGuidanceSchema, directorGuidanceSchema, STYLE_PRESETS } from '@deepseek-ai/dsh-roleplay-core/style'
import { storybookActorDefinitionSchema } from '@deepseek-ai/dsh-roleplay-core/storybook'
import { BookEntries, BookLines, BookObject, BookValue, objectValue, textValue } from './BookControls.tsx'
import { BookRecipe } from './BookRecipe.tsx'
import { BookState } from './BookState.tsx'
import { DiscussionSettingsFields } from './DiscussionSettingsFields.tsx'
import type { NarrativeKey } from './locales.ts'
import css from './Narrative.module.css'

/** Draft-local style editing copies presets without changing any published version. */
function BookStyle({ t, kind, value, change }: PropsLocale<'narrative'> & { kind: 'actor' | 'director'; value: Json | undefined; change: (value: Document) => void }) {
  const defaults = kind === 'actor' ? actingGuidanceSchema.parse({}) : directorGuidanceSchema.parse({})
  const guidance = { ...defaults, ...objectValue(value) }
  return <section><div className={css.toolbar}>{STYLE_PRESETS.filter(preset => preset.profile.kind === kind).map(preset => <button type="button" key={preset.id}
    onClick={() => { change(structuredClone(preset.profile.guidance)) }}>{t(preset.id as NarrativeKey)}</button>)}</div>
  {Object.entries(guidance).map(([key, value]) => Array.isArray(value) ? <BookLines key={key}
    label={t(key as NarrativeKey)} value={value} change={(value) => { change({ ...guidance, [key]: value }) }} />
    : <label key={key}>{t(key as NarrativeKey)}<textarea value={textValue(value)}
      onChange={(event) => { change({ ...guidance, [key]: event.target.value }) }} /></label>)}
  </section>
}

/** Complete structured authoring with a single selected section and character. */
export function BookFields({ source, change, t, manageSync }: PropsLocale<'narrative'> & { source: string; change: (source: string) => void; manageSync?: () => void }) {
  const [tab, setTab] = useState('bookWorld')
  const [selected, setSelected] = useState('')
  const [personTab, setPersonTab] = useState('bookBasics')
  const [error, setError] = useState('')
  let book: Document
  try { const value: unknown = JSON.parse(source)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return <p role="alert">{t('bookInvalid')}</p>
    book = value as Document
  } catch { return <p role="alert">{t('bookInvalid')}</p> }
  if (!Array.isArray(book.characters) || book.characters.some(item => !textValue(objectValue(item).actorId))) return <p role="alert">{t('bookInvalid')}</p>
  const people = book.characters.map(objectValue)
  const set = (key: string, value: Json) => { change(JSON.stringify({ ...book, [key]: value }, null, 2)) }
  const person = people.find(item => item.actorId === selected) ?? people[0]
  const actorId = textValue(person?.actorId)
  const updatePerson = (patch: Document) => { set('characters', people.map(item => item.actorId === actorId ? { ...item, ...patch } : item)) }
  const privateContext = objectValue(person?.privateContext)
  const privateSet = (key: string, value: Json) => { updatePerson({ privateContext: { ...privateContext, [key]: value } }) }
  const addPerson = (definition?: Document, protagonist = false) => {
    const id = `character-${randomUUID()}`
    const next: Document = definition ?? { displayName: t('bookNewCharacter'), appearance: '', publicPersona: '', rolePrompt: '', capabilities: ['speak', 'act', 'reflect', 'memory', 'goals', 'schedule'], actingGuidance: {}, privateContext: { perspective: [], coreMemories: [], goals: [], intentions: [] }, state: [], initialKnowledge: [] }
    const remap = (value: Json | undefined) => value === next.actorId ? id : value
    change(JSON.stringify({ ...book, protagonistActorId: protagonist ? id : book.protagonistActorId ?? null,
      characters: [...people, { ...next, actorId: id,
        initialKnowledge: Array.isArray(next.initialKnowledge) ? next.initialKnowledge.map((value) => { const item = objectValue(value)
          return { ...item, ...(item.targetActorId === undefined ? {} : { targetActorId: remap(item.targetActorId) }) } }) : [],
        state: Array.isArray(next.state) ? next.state.map((value) => { const item = objectValue(value)
          const field = objectValue(item.definition)
          return { ...item, definition: { ...field, id: `state-${randomUUID()}`, actorId: id,
            ...(field.targetActorId === undefined ? {} : { targetActorId: remap(field.targetActorId) }),
            audience: Array.isArray(field.audience) ? field.audience.map(remap) : [] } } }) : [] }] }, null, 2))
    setSelected(id); setTab('bookPeople'); setPersonTab('bookBasics')
  }
  return <section className={css.bookWorkspace}>
    <nav className={css.bookNav} aria-label={t('bookEdit')}>{(['bookWorld', 'bookPeople', 'bookStyle', 'bookContext'] as const).map(value => <button type="button" key={value}
      aria-pressed={tab === value} onClick={() => { setTab(value) }}>{t(value)}</button>)}</nav>
    <div className={css.bookContent}>
      {(tab === 'bookStyle' || tab === 'bookPeople' && personTab === 'bookActorStyle') && <p>{t('performanceLocationHint')} <button type="button" onClick={() => { setTab('bookContext') }}>{t('editPerformance')}</button></p>}
      {tab === 'bookWorld' && <>
        <h2>{t('bookWorld')}</h2>
        <label>{t('premise')}<textarea value={textValue(book.premise)} onChange={(event) => { set('premise', event.target.value) }} /></label>
        <label>{t('directorPrompt')}<textarea className={css.promptEditor} value={textValue(book.directorPrompt)} onChange={(event) => { set('directorPrompt', event.target.value) }} /></label>
        <div className={css.bookGrid}><label>{t('reasoningLanguage')}<input value={textValue(book.reasoningLanguage)} onChange={(event) => { set('reasoningLanguage', event.target.value) }} /></label>
          <DiscussionSettingsFields t={t} value={{
            maxRounds: typeof objectValue(book.discussionSettings).maxRounds === 'number' ? Number(objectValue(book.discussionSettings).maxRounds) : 4,
            ...(objectValue(book.discussionSettings).floorPolicy === 'balanced' ? { floorPolicy: 'balanced' as const }
              : objectValue(book.discussionSettings).floorPolicy === 'eagerness' ? { floorPolicy: 'eagerness' as const } : {}),
          }} change={(value) => { set('discussionSettings', { ...objectValue(book.discussionSettings), maxRounds: value.maxRounds,
            ...(value.floorPolicy === undefined ? {} : { floorPolicy: value.floorPolicy }) }) }} /></div>
        <BookLines label={t('commonKnowledge')} value={book.commonKnowledge} change={(value) => { set('commonKnowledge', value) }} />
        <BookLines label={t('directorRules')} value={book.directorRules} change={(value) => { set('directorRules', value) }} />
        {(['setting', 'worldTruth'] as const).map(key => <details className={css.bookSection} key={key}><summary>{t(key)}</summary><BookObject t={t} value={objectValue(book[key])} change={(value) => { set(key, value) }} /></details>)}
        <details className={css.bookSection}><summary>{t('beats')}</summary><BookValue t={t} label={t('beats')} value={book.beats ?? []} change={(value) => { set('beats', value) }} /></details>
      </>}
      {tab === 'bookPeople' && <>
        <h2>{t('bookPeople')}</h2>
        <p className={css.metadata}>{t('protagonistHelp')}</p>
        <div className={css.bookGrid}><label>{t('bookCharacterSelect')}<select value={actorId}
          onChange={(event) => { setSelected(event.target.value) }}>
          {people.map(item => <option key={textValue(item.actorId)}
            value={textValue(item.actorId)}>{textValue(item.displayName)}</option>)}</select></label>
        <label>{t('protagonist')}<select value={textValue(book.protagonistActorId)} onChange={(event) => { set('protagonistActorId', event.target.value || null) }}>
          <option value="">{t('none')}</option>{people.map(item => <option key={textValue(item.actorId)}
            value={textValue(item.actorId)}>{textValue(item.displayName)}</option>)}</select></label></div>
        <div className={css.toolbar}><button type="button" onClick={() => { addPerson() }}>{t('bookNewCharacter')}</button>
          <button type="button" onClick={() => { addPerson(undefined, true) }}>{t('bookNewProtagonist')}</button>
          <label className={css.fileAction}>{t('bookImportCharacter')}<input type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.target.files?.[0]; event.target.value = ''
            if (file) void file.text().then((text) => { const imported = storybookActorDefinitionSchema.parse(JSON.parse(text)); addPerson(JSON.parse(JSON.stringify(imported)) as Document); setError('') }, (error: unknown) => { setError(String(error)) }).catch((error: unknown) => { setError(String(error)) })
          }} /></label>
          {person && <button type="button" onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(person, null, 2)], { type: 'application/json' }))
            const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${actorId}.json`; anchor.click(); URL.revokeObjectURL(url)
          }}>{t('bookExportCharacter')}</button>}</div>
        {error && <p role="alert">{t('bookImportError')}{error}</p>}
        {!person ? <p>{t('bookNoCharacter')}</p> : <>
          <div className={css.bookTabs}>{(['bookBasics', 'bookPrivate', 'bookState', 'bookActorStyle'] as const).map(value => <button type="button" key={value} aria-pressed={personTab === value}
            onClick={() => { setPersonTab(value) }}>{t(value)}</button>)}</div>
          {personTab === 'bookBasics' && <>
            {(['displayName', 'appearance', 'publicPersona', 'rolePrompt'] as const).map(key => <label key={key}>{t(key)}{key === 'displayName' ? <input value={textValue(person[key])} onChange={(event) => { updatePerson({ [key]: event.target.value }) }} />
              : <textarea value={textValue(person[key])} onChange={(event) => { updatePerson({ [key]: event.target.value }) }} />}</label>)}
            <fieldset className={css.bookSection}><legend>{t('bookCapabilities')}</legend><div className={css.toolbar}>{(['speak', 'act', 'reflect', 'memory', 'goals', 'schedule'] as const).map(capability => <label key={capability}>
              <input type="checkbox" checked={Array.isArray(person.capabilities) && person.capabilities.includes(capability)} onChange={(event) => { const current = Array.isArray(person.capabilities) ? person.capabilities : []; updatePerson({ capabilities: event.target.checked ? [...current, capability] : current.filter(value => value !== capability) }) }} />{t(`capability-${capability}`)}</label>)}</div></fieldset>
            <details className={css.bookSection}><summary>{t('removeCharacter')}</summary><button type="button" onClick={() => { change(JSON.stringify({ ...book, characters: people.filter(item => item.actorId !== actorId), ...(book.protagonistActorId === actorId ? { protagonistActorId: null } : {}) }, null, 2)) }}>{t('removeCharacter')}</button></details>
          </>}
          {personTab === 'bookPrivate' && <><p>{t('bookPrivateHint')}</p>
            <label><input type="checkbox" checked={person.commonKnowledge == null} onChange={(event) => {
              updatePerson({ commonKnowledge: event.target.checked ? null : [] })
            }} />{t('inheritCommonKnowledge')}</label>
            <p className={css.metadata}>{t('characterCommonKnowledgeHint')}</p>
            {person.commonKnowledge != null && <BookLines label={t('characterCommonKnowledge')} value={person.commonKnowledge}
              change={(value) => { updatePerson({ commonKnowledge: value }) }} />}
            <BookLines label={t('bookPerspective')} value={privateContext.perspective} change={(value) => { privateSet('perspective', value) }} />
            <BookEntries t={t} label={t('bookMemories')} value={privateContext.coreMemories} initial={{ content: '', importance: 3 }} fields={[{ key: 'content', labelKey: 'bookValue' }, { key: 'importance', labelKey: 'bookMemoryImportance', kind: 'number' }, { key: 'meaning', labelKey: 'bookMeaning', optional: true }]} change={(value) => { privateSet('coreMemories', value) }} />
            <BookEntries t={t} label={t('bookGoals')} value={privateContext.goals} initial={{ description: '', priority: 3 }} fields={[{ key: 'description', labelKey: 'description' }, { key: 'priority', labelKey: 'priority', kind: 'number' }, { key: 'reason', labelKey: 'bookGoalReason', optional: true }]} change={(value) => { privateSet('goals', value) }} />
            <BookEntries t={t} label={t('bookIntentions')} value={privateContext.intentions} initial={{ description: '', trigger: '', commitment: 3 }} fields={[{ key: 'description', labelKey: 'description' }, { key: 'trigger', labelKey: 'bookTrigger' }, { key: 'commitment', labelKey: 'bookCommitment', kind: 'number' }]} change={(value) => { privateSet('intentions', value) }} />
            <BookEntries t={t} label={t('bookKnowledge')} value={person.initialKnowledge} initial={{ text: '', kind: 'belief', attitude: 'believed' }} fields={[{ key: 'text', labelKey: 'bookValue' },
              { key: 'kind', labelKey: 'kind', kind: 'select', options: ['belief', 'identity'].map(value => ({ value, label: t(`knowledge-${value}` as NarrativeKey) })) },
              { key: 'attitude', labelKey: 'attitude', kind: 'select', options: ['believed', 'doubted', 'undecided', 'rejected'].map(value => ({ value, label: t(value as NarrativeKey) })) },
              { key: 'targetActorId', labelKey: 'target', optional: true, kind: 'select', options: [{ value: '', label: t('none') }, ...people.map(item => ({ value: textValue(item.actorId), label: textValue(item.displayName) }))] },
              { key: 'label', labelKey: 'displayName', optional: true }]} change={(value) => { updatePerson({ initialKnowledge: value }) }} />
          </>}
          {personTab === 'bookState' && <BookState t={t} actorId={actorId} people={people} value={person.state} change={(value) => { updatePerson({ state: value }) }} />}
          {personTab === 'bookActorStyle' && <BookStyle t={t} kind="actor" value={person.actingGuidance} change={(value) => { updatePerson({ actingGuidance: value }) }} />}
        </>}
      </>}
      {tab === 'bookStyle' && <><h2>{t('bookStyle')}</h2><BookStyle t={t} kind="director" value={book.directorGuidance} change={(value) => { set('directorGuidance', value) }} /></>}
      {tab === 'bookContext' && <><h2>{t('bookContext')}</h2><BookRecipe t={t} {...manageSync === undefined ? {} : { manageSync }} recipe={book.contextRecipe === undefined ? legacyContextRecipe() : book.contextRecipe}
        change={(value) => { set('contextRecipe', JSON.parse(JSON.stringify(value)) as Json) }} />
      {(['director', 'actor'] as const).map(side => <details className={css.bookSection} key={side}><summary>{t(side === 'actor' ? 'bookActor' : side)} · {t('contextRules')}</summary>
        {(['policy', 'tools'] as const).map(field => <label key={field}>{t(`section-${field}`)}<textarea value={textValue(objectValue(objectValue(book.contextRules)[side])[field])}
          onChange={(event) => { const rules = objectValue(book.contextRules); set('contextRules', { ...rules, [side]: { ...objectValue(rules[side]), [field]: event.target.value } }) }} /></label>)}</details>)}
      </>}
    </div>
  </section>
}
