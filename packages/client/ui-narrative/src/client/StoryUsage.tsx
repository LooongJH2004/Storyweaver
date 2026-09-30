/** The composer keeps native historical accounting separate from individual turn disclosures. */
import { useEffect, useState } from 'react'
import { StatsSummary } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ExecutionUsageTotals, InstanceId } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'

export function StoryUsage(props: Pick<NarrativeProps, 'executionUsage' | 'usageT' | 't'> & {
  instanceId: InstanceId
  revision: number
  running: boolean
}) {
  const [state, setState] = useState<{ id: InstanceId; value: ExecutionUsageTotals } | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setError('')
    void props.executionUsage(props.instanceId).then((value) => {
      if (active) setState({ id: props.instanceId, value })
    }, (error: unknown) => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [props.instanceId, props.revision, props.running, props.executionUsage, retry])
  const value = state?.id === props.instanceId ? state.value : null
  return <div className={css.storyUsage} aria-label={props.t('storyUsage')}>
    {value !== null && <StatsSummary stats={value.stats} usage={value.usage} t={props.usageT} />}
    {error && <small role="alert">{props.t('storyUsageFailed')} <button type="button" title={error}
      onClick={() => { setRetry(value => value + 1) }}>{props.t('refresh')}</button></small>}
  </div>
}
