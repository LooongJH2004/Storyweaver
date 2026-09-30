/** Lightweight queue preview does not load author workspaces or recreate model contexts. */
import { useEffect, useState } from 'react'
import type { InstanceId, MemoryJob } from '@deepseek-ai/dsh-roleplay-core/types'
import css from './MemoryQueuePanel.module.css'
import type { NarrativeProps } from './contract.ts'

const labels = { queued: 'memoryJobQueued', running: 'memoryJobRunning', ready: 'memoryJobReady', applied: 'memoryJobApplied',
  failed: 'memoryJobFailed', cancelled: 'memoryJobCancelled', superseded: 'memoryJobSuperseded' } as const
export function MemoryQueuePanel(props: NarrativeProps & { instanceId: InstanceId }) {
  const { t, instanceId } = props
  const [jobs, setJobs] = useState<readonly MemoryJob[] | null>(null)
  const [error, setError] = useState('')
  const [retrying, setRetrying] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [details, setDetails] = useState<Record<string, MemoryJob>>({})
  const [reading, setReading] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async (): Promise<void> => {
      try { const next = await props.memoryJobs(instanceId); if (active) { setJobs(next); setError('') } }
      catch (error) { if (active) setError(String(error)) }
      finally { if (active) timer = setTimeout(() => { void refresh() }, 2000) }
    }
    setJobs(null); void refresh()
    return () => { active = false; clearTimeout(timer) }
  }, [instanceId, props.memoryJobs, revision])
  return <section aria-label={t('memoryQueueTitle')}>
    <p>{t('memoryQueueHint')}</p>
    {error && <p role="alert">{error}</p>}
    {jobs === null ? <p role="status">{t('loading')}</p> : jobs.length === 0 ? <p>{t('memoryQueueEmpty')}</p>
      : jobs.map(job => <article key={job.id} className={css.job}>
        <h3>{job.ownerLabel ?? (job.owner === 'director' ? t('director') : job.owner)}</h3>
        <p>{t(labels[job.status])} · {t('memoryJobSources', { count: job.sourceIds.length, revision: job.revision })}</p>
        {job.error && <p>{job.error}</p>}
        {['failed', 'superseded'].includes(job.status) && <button disabled={retrying !== null} onClick={() => {
          setRetrying(job.id)
          void props.retryMemoryJob(instanceId, job.id).then(() => { setRevision(value => value + 1) })
            .catch((error: unknown) => { setError(String(error)) }).finally(() => { setRetrying(null) })
        }}>{t('memoryJobRetry')}</button>}
        {['ready', 'applied', 'superseded'].includes(job.status) && details[job.id] === undefined && <button disabled={reading !== null} onClick={() => {
          setReading(job.id)
          void props.memoryJob(instanceId, job.id).then((value) => { setDetails(previous => ({ ...previous, [job.id]: value })) })
            .catch((error: unknown) => { setError(String(error)) }).finally(() => { setReading(null) })
        }}>{t(reading === job.id ? 'loading' : 'memoryJobPreview')}</button>}
        {details[job.id]?.units !== undefined && <details open><summary>{t('memoryJobPreview')}</summary>
          {details[job.id]?.units?.map((unit, index) => <div key={index}><p>{unit.reason}</p>
            {unit.changes.map((change, index) => <div key={index}>
              <p>{change.text}</p>{change.episode && <details><summary>{change.episode.topic}</summary>
                <p>{change.episode.experience}</p><p>{change.episode.interpretation}</p><p>{change.episode.impact}</p>
                <ul>{change.episode.unresolved.map(question => <li key={question}>{question}</li>)}</ul>
              </details>}</div>)}</div>)}
        </details>}
      </article>)}
  </section>
}
