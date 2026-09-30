/** Person editing changes instance records without provisioning an Actor session. */
import { useState } from 'react'
import { actingGuidanceSchema } from '@deepseek-ai/dsh-roleplay-core/style'
import type { StoryCharacter } from '@deepseek-ai/dsh-roleplay-core/characters'
import type { CreatePersonInput, CognitionRevisionInput } from '@deepseek-ai/dsh-roleplay-core/command-inputs'
import type { InstanceId } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'

/** Preserve the draft on revision conflicts and save only the chosen person's definition. */
export function Person(props: NarrativeProps & { instanceId: InstanceId; revision: number; person?: StoryCharacter; done(): void }) {
  const { t, person } = props
  const selected = props.useAuthor(value => value.request)
  const [definition, setDefinition] = useState<CreatePersonInput['definition']>(person?.definition ?? {
    displayName: '', appearance: '', publicPersona: '', rolePrompt: '', initialKnowledge: [], state: [],
    capabilities: ['speak', 'act', 'reflect', 'memory'],
    privateContext: { perspective: [], coreMemories: [], goals: [], intentions: [] }, actingGuidance: actingGuidanceSchema.parse({}),
  })
  const [location, setLocation] = useState(person?.location ?? '')
  const [importance, setImportance] = useState<'main' | 'supporting'>(person?.importance ?? 'supporting')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [knowledge, setKnowledge] = useState('[]')
  const [lifecycle, setLifecycle] = useState('[]')
  const submit = async (cognition: boolean) => {
    setBusy(true); setError('')
    try {
      if (cognition && person !== undefined) await props.cognition(props.instanceId, props.revision, person.definition.actorId,
        { knowledge: JSON.parse(knowledge) as CognitionRevisionInput['knowledge'], state: [],
          lifecycle: JSON.parse(lifecycle) as CognitionRevisionInput['lifecycle'] })
      else if (person === undefined) await props.createPerson(props.instanceId, props.revision,
        { definition, location, importance, purpose: reason, sourceRefs: [] })
      else await props.revisePerson(props.instanceId, props.revision, {
        actorId: person.definition.actorId, expectedPersonRevision: person.revision,
        definition: { ...definition, actorId: person.definition.actorId }, archived: person.archived, location, importance, reason,
      })
      await props.author(props.instanceId, selected?.instanceId === props.instanceId ? selected.actorId : undefined)
      props.done()
    } catch (error) { setError(String(error)) } finally { setBusy(false) }
  }
  return <section className={css.card}>
    <h3>{t(person === undefined ? 'newPerson' : 'editPerson')}</h3>
    <form onSubmit={(event) => { event.preventDefault(); void submit(false) }}>
      {(['displayName', 'appearance', 'publicPersona', 'rolePrompt'] as const).map(key => <label key={key}>{t(key)}
        <textarea aria-label={t(key)} value={definition[key]} onChange={(event) => {
          setDefinition({ ...definition, [key]: event.target.value })
        }} /></label>)}
      <label>{t('location')}<input value={location} onChange={(event) => { setLocation(event.target.value) }} /></label>
      <label>{t('importance')}<select value={importance} onChange={(event) => { setImportance(event.target.value === 'main' ? 'main' : 'supporting') }}>
        <option value="main">{t('main')}</option><option value="supporting">{t('supporting')}</option>
      </select></label>
      <label>{t(person === undefined ? 'purpose' : 'reason')}<textarea aria-label={t(person === undefined ? 'purpose' : 'reason')} required value={reason} onChange={(event) => { setReason(event.target.value) }} /></label>
      <button disabled={busy}>{t('save')}</button><button type="button" onClick={() => { props.done() }}>{t('cancel')}</button>
    </form>
    {person !== undefined && <details><summary>{t('knowledgeEdit')}</summary><form onSubmit={(event) => { event.preventDefault(); void submit(true) }}>
      <textarea aria-label={t('knowledgeEdit')} value={knowledge} onChange={(event) => { setKnowledge(event.target.value) }} />
      <label>{t('lifecycleEdit')}<textarea aria-label={t('lifecycleEdit')} value={lifecycle} onChange={(event) => { setLifecycle(event.target.value) }} /></label>
      <p>{t('lifecycleHint')}</p>
      <button disabled={busy}>{t('save')}</button>
    </form></details>}
    {error !== '' && <p role="alert">{error}</p>}
  </section>
}
