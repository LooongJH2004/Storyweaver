/** Live execution stays behind an explicit author-diagnostic control. */
import { useEffect } from 'react'
import type { InstanceId, PlayerPersonLabel, PlayView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import { ExecutionResponse } from './ExecutionResponse.tsx'
import css from './Narrative.module.css'
import { ExecutionDraft } from './ExecutionDraft.tsx'
import { PersonLabel } from './PersonLabel.tsx'
import { ReasoningDisclosure } from '@deepseek-ai/dsh-client-ui-primitives'

/** Dispose the selected perspective subscription when its panel or owner changes. */
export function LiveExecution(props: Pick<NarrativeProps, 't' | 'useExecution' | 'followExecution' | 'stopExecution'> & {
  instanceId: InstanceId
  actorId?: string
  autoStart?: boolean
  title?: string
  person?: PlayerPersonLabel | undefined
  reading?: boolean
  acceptedRevision?: number
  narrationDraft?: PlayView['narrationDraft']
}) {
  const { t, instanceId, actorId, stopExecution } = props
  const state = props.useExecution(value => value)
  useEffect(() => {
    if (props.autoStart) props.followExecution(instanceId, actorId)
    else stopExecution()
    return stopExecution
  }, [instanceId, actorId, stopExecution, props.autoStart, props.followExecution])
  const selected = state.request?.instanceId === instanceId && state.request.actorId === actorId
  const detail = selected ? state.view?.request : undefined
  // Play and execution streams arrive independently; accepted prose wins the handover.
  if (props.reading && actorId !== undefined && detail !== undefined && detail !== null
    && detail.request.revision <= (props.acceptedRevision ?? -1)) return null
  if (props.reading) return <section className={`${css.prose} ${css.liveDraft}`} aria-label={t('liveExecution')}>
    <header className={css.turnHeader}>{props.person === undefined ? <strong>{props.title ?? t('director')}</strong>
      : <PersonLabel person={props.person} nameFirst />}<small>{t('submitting')}</small></header>
    {selected && state.view?.previousResponses?.map(previous => <details key={previous.requestId}>
      <summary>{t('earlierExecutionStep', { step: previous.step })}</summary>
      <ExecutionResponse t={t} response={previous.response} />
    </details>)}
    {detail?.response && <>
      {detail.response.reasoning !== '' && <ReasoningDisclosure text={detail.response.reasoning} running={detail.response.state === 'streaming'}
        title={t('turnReasoning')} runningLabel={t('submitting')} />}
      <details><summary>{t('actualRequests')}</summary><ExecutionResponse t={t} response={detail.response} /></details>
    </>}
    <ExecutionDraft t={t} response={detail?.response} draft={props.narrationDraft} />
    {selected && state.error !== null && <p role="alert">{state.error}</p>}
  </section>
  return <section className={css.card}>
    {!props.autoStart && <h3>{t('liveExecution')}</h3>}<p>{t('actualRequestsHint')}</p>
    {!props.autoStart && <label><input type="checkbox" checked={selected} onChange={(event) => {
      if (event.target.checked) props.followExecution(instanceId, actorId); else stopExecution()
    }} />{t('watchExecution')}</label>}
    {selected && state.loading && <p role="status">{t('loading')}</p>}
    {selected && state.error !== null && <p role="alert">{state.error}</p>}
    {selected && state.view?.request === null && <p>{t('noRequests')}</p>}
    {detail !== undefined && detail !== null && <>
      <p>{detail.request.provider} / {detail.request.model} · {t('revision', { revision: detail.request.revision })}</p>
      {detail.response !== undefined && <ExecutionResponse t={t} response={detail.response} />}
    </>}
  </section>
}
