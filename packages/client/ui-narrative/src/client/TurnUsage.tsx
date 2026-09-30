/** Narrative turns reuse the native dsh disclosure and exact provider accounting. */
import { useEffect, useState } from 'react'
import { TurnUsageDisclosure } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ExecutionRequestSummary, InstanceId } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'

/** Historical lookup is local to this footer and cannot change the active inspection panel. */
export function TurnUsage(props: Pick<NarrativeProps, 't' | 'usageT' | 'turnUsage'> & {
  instanceId: InstanceId
  revision: number
  actorId?: string
  settled: boolean
  refreshRevision: number
}) {
  const key = JSON.stringify([props.instanceId, props.revision, props.actorId])
  const [state, setState] = useState<{ key: string; request: ExecutionRequestSummary | null; error: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const complete = state?.key === key && state.request?.turnUsage !== undefined
  useEffect(() => {
    if (complete) return
    let current = true
    // Refresh in place; clearing every historical footer collapses the whole transcript.
    void props.turnUsage(props.instanceId, props.revision, props.actorId).then((request) => {
      if (current) setState({ key, request, error: '' })
    }, (error: unknown) => {
      if (current) setState(previous => ({ key, request: previous?.key === key ? previous.request : null, error: String(error) }))
    })
    return () => { current = false }
  }, [key, props.settled, props.refreshRevision, props.turnUsage, retry, complete])
  const request = state?.key === key ? state.request : null
  const error = state?.key === key ? state.error : ''
  return <div className={css.turnUsage} aria-busy={request === null && !error}>
    {request && <UsageSummary {...props} request={request} />}
    {error && <p role="alert">{error} <button onClick={() => { setRetry(value => value + 1) }}>{props.t('refresh')}</button></p>}
  </div>
}

/** Count every provider request in this turn; one tool preparation may require several steps. */
export function UsageSummary(props: Pick<NarrativeProps, 't' | 'usageT'> & { request: ExecutionRequestSummary }) {
  return <div data-execution-usage>
    {props.request.turnUsage !== undefined && <TurnUsageDisclosure usage={props.request.turnUsage} t={props.usageT} />}
    <small>{props.t('executionCalls', { count: props.request.turnRequestCount ?? 1 })}
      {props.request.turnUsage === undefined && ` · ${props.t('usageUnavailable')}`}</small>
    <p className={css.executionTiming}>
      <span>{props.t('executionTtft', { value: props.request.turnTiming?.ttftMs === undefined
        ? props.t('metricUnavailable') : props.t('metricSeconds', { value: (props.request.turnTiming.ttftMs / 1000).toFixed(2) }) })}</span>
      <span>{props.t('executionTokenRate', { value: props.request.turnTiming?.tokensPerSecond === undefined
        ? props.t('metricUnavailable') : props.t('metricTokensPerSecond', { value: props.request.turnTiming.tokensPerSecond.toFixed(1) }) })}</span>
    </p>
  </div>
}
