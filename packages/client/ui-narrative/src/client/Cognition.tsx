/** Human-readable author inspection, with technical records kept in disclosure panels. */
import type { CharacterCognitionView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'

/** Show judgments and their revisions without changing or inferring character knowledge. */
export function Cognition({ view, t }: { view: CharacterCognitionView; t: NarrativeProps['t'] }) {
  return <section className={css.panel}>
    {view.current.dynamicState.entries.some(entry => entry.active) && <section className={css.card}>
      <h3>{t('privateState')}</h3>
      <dl className={css.facts}>{view.current.dynamicState.entries.filter(entry => entry.active).map(entry => <div key={entry.definition.id}
        className={css.stateSummary}>
        <dt>{entry.definition.name}</dt><dd>
          {Array.isArray(entry.value) ? entry.value.join(' · ') : typeof entry.value === 'boolean' ? t(entry.value ? 'yes' : 'no') : entry.value}
          <small>{entry.reason}</small>
        </dd>
      </div>)}</dl>
    </section>}
    <h3>{t('cognition')}</h3>
    {view.current.knowledge.entries.length === 0 && <p className={css.empty}>{t('noKnowledge')}</p>}
    {view.current.knowledge.entries.map(entry => <article className={css.card} key={entry.id}>
      <header className={css.cardHeader}>
        <span className={css.badge}>{t(`knowledge-${entry.kind}`)}</span>
        <span className={css.badge}>{t(`knowledge-${entry.attitude}`)}</span>
        <span className={css.badge}>{t(`knowledge-${entry.status}`)}</span>
      </header>
      <p className={css.recordText}>{entry.text}</p>
      <div className={css.metadata}>{t(`knowledge-${entry.acquisition}`)} · {t('recordRevision', { revision: entry.revision })}</div>
      <details className={css.disclosure}><summary>{t('sourcesHistory')}</summary>
        <p>{entry.reason}</p>
        <dl className={css.facts}><dt>{t('sourceReferences')}</dt><dd>{entry.sourceRefs.join(' · ') || t('none')}</dd></dl>
        {view.current.knowledge.history.filter(item => item.id === entry.id).map(item => <div key={item.revision}
          className={css.historyEntry}>
          <span className={css.badge}>{t('recordRevision', { revision: item.revision })}</span>
          <span className={css.badge}>{t(`knowledge-${item.attitude}`)}</span>
          <span className={css.badge}>{t(`knowledge-${item.status}`)}</span>
          <p>{item.text}</p><small>{item.reason}</small>
        </div>)}
        <details><summary>{t('rawData')}</summary><pre>{JSON.stringify(entry, null, 2)}</pre></details>
      </details>
    </article>)}
    <details className={css.disclosure}><summary>{t('rawData')}</summary><pre>{JSON.stringify(view.current, null, 2)}</pre></details>
  </section>
}
