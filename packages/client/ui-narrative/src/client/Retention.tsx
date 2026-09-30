/** Approved summaries and original retrieval remain separate, revision-bound operations. */
import { useRef, useState } from 'react'
import type { InspectionSnapshot } from '@deepseek-ai/dsh-api-roleplay-controller/client'
import type { ContextUpdateUnit } from '@deepseek-ai/dsh-roleplay-core/context-retention'
import { RecallOriginal } from './RecallOriginal.tsx'
import { RetentionProposalFields } from './RetentionProposalFields.tsx'
import type { NarrativeRecallInput, RetentionReviewInput } from '@deepseek-ai/dsh-roleplay-core/command-inputs'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'

/** Review proposals without treating their text as an approved replacement before acceptance. */
export function Retention(props: Pick<NarrativeProps, 't' | 'retention' | 'author' | 'recall'> & {
  detail: Pick<InspectionSnapshot, 'retention' | 'request' | 'recalled' | 'error'>
  showHeading?: boolean
}) {
  const { t, detail } = props
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<{ operation?: 'correct'; id: string; revision: number; unit: ContextUpdateUnit } | null>(null)
  const [rawDraft, setRawDraft] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const results = useRef<HTMLElement>(null)
  const nextOffset = detail.recalled?.nextOffset
  const view = detail.retention
  if (view === null) return null
  const apply = async (input: RetentionReviewInput) => {
    setBusy(true); setError('')
    try {
      await props.retention(view.instanceId, view.revision, input)
      setDraft(null); await props.author(view.instanceId, detail.request?.actorId)
    } catch (error) { setError(String(error)) } finally { setBusy(false) }
  }
  const read = async (input: NarrativeRecallInput) => {
    setQuery(input.query); setReading(true); setError('')
    try { await props.recall(input) }
    catch (error) { setError(String(error)) }
    finally {
      setReading(false)
      results.current?.focus()
      results.current?.scrollIntoView({ block: 'nearest' })
    }
  }
  const sources = (ids: readonly string[]) => <div className={css.toolbar}>
    {[...new Set(ids)].map((id, index) => <button key={id} type="button" title={id} disabled={busy || reading}
      onClick={() => { void read({ query: id, offset: 0, limit: 20 }) }}>{t('viewSource')} {index + 1}</button>)}
  </div>
  return <section className={css.panel}>
    {props.showHeading !== false && <h3>{t('retention')}</h3>}
    <label>{t('memoryActivation')}<select disabled={busy} value={view.retention.activation ?? 'review'} onChange={(event) => {
      const activation = event.target.value === 'automatic' ? 'automatic' : 'review'
      void apply({ operation: 'policy', owner: view.owner, activation })
    }}><option value="review">{t('memoryReview')}</option><option value="automatic">{t('memoryAutomatic')}</option></select></label>
    <p className={css.metadata}>{t(view.retention.activation === 'automatic' ? 'memoryAutomaticHint' : 'retentionHint')}</p>
    {view.retention.notes.filter(note => note.status !== 'archived' && note.status !== 'superseded').map(note => <article key={note.id} className={css.card}>
      <strong>{t('effectiveMemory')}</strong><p className={css.recordText}>{note.text}</p>
      <EpisodeDetails t={t} episode={note.episode} />
      <details className={css.disclosure}><summary>{t('sourceReferences')}</summary>{sources(note.sourceIds)}</details>
      <button disabled={busy} onClick={() => { setRawDraft(null); setDraft({ operation: 'correct', id: note.id, revision: note.revision,
        unit: { sourceIds: note.sourceIds, disposition: 'represented', reason: '', changes: [{ operation: 'revise',
          noteId: note.id, expectedRevision: note.revision, kind: note.kind, text: note.text, sourceIds: note.sourceIds,
          ...(note.episode === undefined ? {} : { episode: note.episode }),
        }] } }) }}>{t('correctMemory')}</button>
      <button disabled={busy} onClick={() => { void apply({ operation: 'revoke', owner: view.owner,
        id: note.id, revision: note.revision }) }}>{t('revokeMemory')}</button>
    </article>)}
    {view.retention.proposals.length === 0 && <p className={css.empty}>{t('noProposals')}</p>}
    {view.retention.proposals.map(proposal => <article key={proposal.id} className={css.card}>
      <header className={css.cardHeader}>
        <strong>{t(`retention-${proposal.unit.disposition}`)}</strong>
        <span className={css.badge}>{t(`review-${proposal.status}`)}</span>
        {proposal.activation === 'automatic' && <span className={css.badge}>{t('memoryAutomatic')}</span>}
        <span className={css.metadata}>{t('recordRevision', { revision: proposal.revision })}</span>
      </header>
      <p className={css.recordText}>{proposal.unit.reason}</p>
      {proposal.unit.changes.map((change, index) => <div key={index} className={css.historyEntry}>
        <div className={css.cardHeader}><span className={css.badge}>{t(`note-${change.operation}`)}</span>
          <span className={css.badge}>{t(`note-${change.kind}`)}</span></div>
        <p className={css.recordText}>{change.text}</p>
        <EpisodeDetails t={t} episode={change.episode} />
      </div>)}
      <details className={css.disclosure}><summary>{t('sourceReferences')}</summary>
        {sources([...proposal.unit.sourceIds, ...proposal.unit.changes.flatMap(change => change.sourceIds)])}
        <details><summary>{t('rawData')}</summary><pre>{JSON.stringify(proposal.unit, null, 2)}</pre></details>
      </details>
      {proposal.status === 'proposed' && <div className={css.toolbar}>
        {([true, false] as const).map(approve => <button key={String(approve)} disabled={busy} onClick={() => {
          void apply({ operation: 'review', owner: view.owner,
            reviews: [{ id: proposal.id, revision: proposal.revision, approve }] })
        }}>{t(approve ? 'approve' : 'reject')}</button>)}
        <button disabled={busy} onClick={() => { setRawDraft(null); setDraft({ id: proposal.id, revision: proposal.revision, unit: proposal.unit }) }}>{t('editProposal')}</button>
      </div>}
    </article>)}
    {draft !== null && <form onSubmit={(event) => { event.preventDefault()
      if (rawDraft !== null) {
        try { const unit = JSON.parse(rawDraft) as ContextUpdateUnit
          void apply({ operation: 'edit', owner: view.owner, id: draft.id, revision: draft.revision, unit })
        } catch (error) { setError(String(error)) }
        return
      }
      const unit = { ...draft.unit, changes: draft.unit.changes.map(change => ({ ...change,
        ...(change.episode === undefined ? {} : { episode: { ...change.episode,
          unresolved: change.episode.unresolved.map(item => item.trim()).filter(Boolean) } }),
      })) }
      if (draft.operation === 'correct') {
        const note = unit.changes[0]
        if (note !== undefined) void apply({ operation: 'correct', owner: view.owner, id: draft.id, revision: draft.revision,
          content: { text: note.text, ...(note.episode === undefined ? {} : { episode: note.episode }) } })
      } else void apply({ operation: 'edit', owner: view.owner, id: draft.id, revision: draft.revision, unit })
    }}>{rawDraft === null ? <>
        <RetentionProposalFields t={t} value={draft.unit} change={(unit) => { setDraft({ ...draft, unit }) }} />
        {draft.operation !== 'correct' && <button type="button" disabled={busy} onClick={() => { setRawDraft(JSON.stringify(draft.unit, null, 2)) }}>{t('rawData')}</button>}
      </> : <textarea aria-label={t('rawData')} value={rawDraft} onChange={(event) => { setRawDraft(event.target.value) }} />}
      <button disabled={busy}>{t('save')}</button>
      <button type="button" disabled={busy} onClick={() => { setDraft(null) }}>{t('cancel')}</button></form>}
    <form onSubmit={(event) => { event.preventDefault()
      void read({ query, offset: 0, limit: 20 }) }}>
      <label>{t('recall')}<input disabled={reading} value={query} onChange={(event) => { setQuery(event.target.value) }} /></label><button disabled={reading}>{t('search')}</button>
    </form>
    <section ref={results} tabIndex={-1} aria-label={t('recallResults')} aria-busy={reading}>
      {reading && <p role="status">{t('loading')}</p>}
      {!reading && error === '' && detail.recalled?.entries.map((item) => {
        const pinned = view.retention.pins.some(pin => pin.sourceId === item.id)
        return <article key={item.id} className={css.card}><RecallOriginal item={item} t={t} />
          {item.kind !== 'episode-summary' && item.kind !== 'context-summary' && <button disabled={busy} onClick={() => {
            void apply({ operation: 'pin', owner: view.owner, sourceId: item.id, pinned: !pinned })
          }}>{t(pinned ? 'unpin' : 'pin')}</button>}
        </article>
      })}
      {error === '' && nextOffset !== null && nextOffset !== undefined && <button disabled={reading} onClick={() => {
        void read({ query, offset: nextOffset, limit: 20, ...detail.recalled?.continuation })
      }}>{t('next')}</button>}
    </section>
    {(error !== '' || detail.error !== null) && <p role="alert">{error || detail.error}</p>}
  </section>
}

/** Read episode details without opening a correction form. */
function EpisodeDetails({ t, episode }: Pick<NarrativeProps, 't'> & {
  episode: ContextUpdateUnit['changes'][number]['episode']
}) {
  if (episode === undefined) return null
  return <details className={css.disclosure}>
    <summary>{episode.topic}</summary>
    <dl>{(['experience', 'interpretation', 'impact'] as const).filter(field => episode[field] !== undefined).map(field => <div key={field}>
      <dt>{t(`episode-${field}`)}</dt><dd className={css.recordText}>{episode[field]}</dd>
    </div>)}<dt>{t('episode-unresolved')}</dt><dd className={css.recordText}>{episode.unresolved.join('\n')}</dd></dl>
  </details>
}
