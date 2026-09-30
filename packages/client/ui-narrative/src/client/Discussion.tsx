/** Player discussion controls operate on durable floor state without reading Actor sessions. */
import { useEffect, useState } from 'react'
import type { PlayView, EmbodimentChoicesView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'
import { PersonLabel, personLabelText } from './PersonLabel.tsx'
import { DiscussionBudget } from './DiscussionBudget.tsx'

/** Scene selection uses revealed labels; automatic floor advancement remains application-owned. */
export function Discussion(props: Pick<NarrativeProps, 't' | 'startDiscussion' | 'advanceDiscussion' | 'controlDiscussion'> & {
  view: PlayView
  peopleChoices: EmbodimentChoicesView | null
  running: boolean
  openByDefault?: boolean
}) {
  const { t, view } = props
  const [topic, setTopic] = useState('')
  const [participants, setParticipants] = useState<string[]>([])
  const [rounds, setRounds] = useState(view.discussionMaxRounds ?? 4)
  const [floor, setFloor] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const discussion = view.discussion
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { setExpanded(discussion !== undefined || (view.discussionRequests?.length ?? 0) > 0 || props.openByDefault === true) },
    [discussion?.id, view.discussionRequests?.length, props.openByDefault])
  const perform = async (operation: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await operation() } catch (value) { setError(String(value)) } finally { setBusy(false) }
  }
  return <details className={css.card} open={expanded} onToggle={(event) => { setExpanded(event.currentTarget.open) }}>
    <summary>{t('discussion')}</summary>
    {error !== '' && <p role="alert">{error}</p>}
    {(view.discussionRequests ?? []).map(request => <section key={request.id}>
      <p><PersonLabel person={request.requester} /></p>
      <strong>{request.topic}</strong>
      <small>{t(request.status === 'deferred' ? 'discussionRequestDeferred' : 'discussionRequestPending')}</small>
      <details><summary>{t('discussionRequestDetails')}</summary><p>{request.opening}</p>
        {request.reason !== undefined && <p>{request.reason}</p>}</details>
      <div className={css.toolbar}>{(['accept', 'defer', 'decline'] as const).map(decision => <button type="button" key={decision}
        disabled={busy || props.running || decision === 'accept' && discussion !== undefined}
        onClick={() => { void perform(() => props.controlDiscussion(view.instanceId, view.revision, {
          operation: 'request', requestId: request.id, expectedRequestRevision: request.revision, decision,
          reason: t(`discussionRequest-${decision}`),
        })) }}>{t(`discussionRequest-${decision}`)}</button>)}</div>
    </section>)}
    {discussion === undefined ? <form onSubmit={(event) => { event.preventDefault()
      void perform(() => props.startDiscussion(view.instanceId, view.revision, { topic, participantIds: participants, maxRounds: rounds }))
    }}>
      <label>{t('topic')}<input required value={topic} onChange={(event) => { setTopic(event.target.value) }} /></label>
      {props.peopleChoices?.entries.map(person => <label key={person.actorId}><input type="checkbox" checked={participants.includes(person.actorId)}
        onChange={(event) => {
          setParticipants(event.target.checked ? [...participants, person.actorId] : participants.filter(id => id !== person.actorId))
        }} /><PersonLabel person={person} /></label>)}
      <label>{t('discussionRounds')}<input type="number" min={1} max={20} value={rounds} onChange={(event) => { setRounds(event.target.valueAsNumber) }} /></label>
      <button disabled={busy || props.running || participants.length < 2}>{t('startDiscussion')}</button>
    </form> : <>
      <p>{discussion.topic}</p><p><DiscussionBudget discussion={discussion} t={t} /></p>
      <small>{t('discussionBudgetHint')}</small>
      <div className={css.toolbar}>
        <button disabled={busy || props.running || discussion.status !== 'active'} onClick={() => {
          void perform(() => props.advanceDiscussion(view.instanceId, view.revision))
        }}>{t('advanceDiscussion')}</button>
        <button disabled={discussion.status !== 'active'} onClick={() => { void perform(() => props.controlDiscussion(view.instanceId, view.revision,
          { discussionId: discussion.id, operation: 'intervene', intervention: 'speak' })) }}>{t('interruptDiscussion')}</button>
        <button disabled={discussion.status !== 'awaiting-player' || busy} onClick={() => {
          void perform(() => props.controlDiscussion(view.instanceId, view.revision, { discussionId: discussion.id, operation: 'resume' }))
        }}>{t('resumeDiscussion')}</button>
        <button onClick={() => { void perform(() => props.controlDiscussion(view.instanceId, view.revision,
          { discussionId: discussion.id, operation: 'close', status: 'completed' })) }}>{t('closeDiscussion')}</button>
      </div>
      <label>{t('floor')}<select value={floor} onChange={(event) => { setFloor(event.target.value) }}>
        <option value="">{t('actor')}</option>{props.peopleChoices?.entries.map(person => <option key={person.actorId} value={person.actorId}>{personLabelText(person)}</option>)}
      </select></label>
      <button disabled={busy || floor === '' || discussion.status !== 'active'} onClick={() => {
        void perform(() => props.controlDiscussion(view.instanceId, view.revision, { discussionId: discussion.id, operation: 'floor', actorId: floor }))
      }}>{t('requestFloor')}</button>
    </>}
  </details>
}
