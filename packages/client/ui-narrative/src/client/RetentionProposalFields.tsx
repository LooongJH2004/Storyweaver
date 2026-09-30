/** Labeled proposal fields preserve source coverage and revision targets while editing prose. */
import type { ContextUpdateUnit } from '@deepseek-ai/dsh-roleplay-core/context-retention'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'

/** Edit summary prose and optional episode details without rewriting source identifiers. */
export function RetentionProposalFields({ value, change, t }: Pick<NarrativeProps, 't'> & {
  value: ContextUpdateUnit
  change: (value: ContextUpdateUnit) => void
}) {
  return <>{value.changes.map((note, index) => {
    const update = (next: typeof note) => {
      change({ ...value, changes: value.changes.map((item, position) => position === index ? next : item) })
    }
    const episode = note.episode
    return <fieldset key={index} className={css.card}>
      <legend>{t('memorySummary')}</legend>
      <label>{t('memoryBrief')}<textarea required value={note.text} onChange={(event) => { update({ ...note, text: event.target.value }) }} /></label>
      {episode !== undefined && <>
        <p>{t('episode-optionalHelp')}</p>
        {(['topic', 'experience', 'interpretation', 'impact'] as const).map(field => <label key={field}>
          {t(`episode-${field}`)}<textarea required={field === 'topic' || field === 'experience'} value={episode[field] ?? ''} onChange={(event) => {
            const next = { ...episode }
            if (field === 'interpretation' && event.target.value.trim() === '') delete next.interpretation
            else if (field === 'impact' && event.target.value.trim() === '') delete next.impact
            else next[field] = event.target.value
            update({ ...note, episode: next })
          }} /></label>)}
        <label>{t('episode-unresolved')}<textarea value={episode.unresolved.join('\n')} onChange={(event) => {
          update({ ...note, episode: { ...episode, unresolved: event.target.value.split('\n') } })
        }} /></label>
      </>}
    </fieldset>
  })}</>
}
