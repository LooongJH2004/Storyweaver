/** Inline records own their async reads so expanding another turn cannot replace this turn's evidence. */
import { useEffect, useState } from 'react'
import { DisclosureRow, IconThinkOutline14, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ExecutionHistoryScope, ExecutionRequestDetail } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'

type Props = Pick<NarrativeProps, 't' | 'readExecutionPage' | 'readExecutionDetail'> & {
  scope: ExecutionHistoryScope
  director?: boolean
  refreshRevision?: number
  attempt?: string
  title?: string
  preparation?: boolean
  live?: boolean
  embedded?: boolean
}

/** Load the latest technical turn at this narrative boundary, retaining all of its request steps. */
export function TurnRecord(props: Props) {
  const { t, scope, director = false, readExecutionPage, readExecutionDetail } = props
  const [expanded, setOpen] = useState(false)
  const open = props.embedded || expanded
  const [retry, setRetry] = useState(0)
  const [pages, setPages] = useState(1)
  const [state, setState] = useState<{ key: string
    loading: boolean
    error: string
    details: ExecutionRequestDetail[]
    more: boolean } | null>(null)
  const key = JSON.stringify([scope.instanceId, scope.revision, scope.actorId, props.attempt])
  const complete = state?.key === key && state.details.length > 0 && state.details.every(item => item.request.turnUsage !== undefined)
  const labels = { code: { copyLabel: t('copyText'), copiedLabel: t('copiedText') }, footnotes: t('footnotes') }
  useEffect(() => {
    if (!open) return
    if (complete && !state.more) return
    const cancellation = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    setState(previous => previous?.key === key ? previous : { key, loading: true, error: '', details: [], more: false })
    void (async () => {
      let offset = 0
      let latest: ExecutionRequestDetail['request'] | undefined
      const summaries: ExecutionRequestDetail['request'][] = []
      let more = false
      for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
        const page = await readExecutionPage(scope, offset)
        if (cancellation.signal.aborted) return
        latest ??= page.entries.find(entry => props.attempt === undefined || entry.attempt === props.attempt)
        const sameTurn = page.entries.filter(entry => entry.attempt === latest?.attempt
          && entry.turn === latest.turn && entry.evidenceId === latest.evidenceId)
        summaries.push(...sameTurn)
        more = sameTurn.length === page.entries.length && page.nextOffset !== null
        if (!more || page.nextOffset === null) break
        offset = page.nextOffset
      }
      const details = await Promise.all(summaries.reverse().map(entry => readExecutionDetail(scope, entry.requestId, entry.evidenceId)))
      if (!cancellation.signal.aborted) {
        setState({ key, loading: false, error: '', details, more })
        if (props.live && !details.some(item => item.request.turnUsage !== undefined)) {
          timer = setTimeout(() => { setRetry(value => value + 1) }, 1000)
        }
      }
    })().catch((error: unknown) => {
      if (!cancellation.signal.aborted) setState(previous => ({ key, loading: false, error: String(error),
        details: previous?.key === key ? previous.details : [], more: previous?.key === key && previous.more }))
    })
    return () => { cancellation.abort(); clearTimeout(timer) }
  }, [open, key, props.refreshRevision, props.live, pages, retry, readExecutionPage, readExecutionDetail, complete])
  const detail = state?.key === key ? state : null
  const body = <div className={css.recordBody}>
    {props.preparation && <p className={css.recordHint}>{t('preparationRecordHint')}</p>}
    {detail?.error && <p role="alert">{detail.error}
      <button onClick={() => { setRetry(value => value + 1) }}>{t('refresh')}</button></p>}
    {detail === null || detail.loading ? <p role="status">{t('loading')}</p> : <>
      {detail.details.length === 0 && <p>{t('noRequests')}</p>}
      {detail.details.map(item => <section className={css.recordStep} key={`${item.request.evidenceId ?? 'live'}:${item.request.requestId}`}>
        {(director || detail.details.length > 1) && <small>{t('requestStep', { turn: item.request.turn, step: item.request.step })}</small>}
        {item.response?.reasoning ? <MarkdownText text={item.response.reasoning} labels={labels} /> : <p>{t('noReasoning')}</p>}
        {director && item.response?.text && <MarkdownText text={item.response.text} labels={labels} />}
        {props.preparation && item.response?.toolCalls.filter(call => call.name === 'npc_commit_turn').map(call =>
          <PreparationContent key={call.id} argumentsText={call.arguments} t={t} />)}
        {(director || props.preparation) && item.response?.toolCalls.map(call => <details key={call.id} className={css.recordTool}>
          <summary>{call.name}</summary><pre>{call.arguments}</pre>
        </details>)}
      </section>)}
      {detail.more && <button onClick={() => { setPages(value => value + 1) }}>{t('earlierRecordSteps')}</button>}
    </>}
  </div>
  return props.embedded ? body : <div className={director ? css.directorRecord : css.turnReasoning}>
    <DisclosureRow icon={<IconThinkOutline14 size={14} />} title={props.title ?? t(director ? 'directorDispatch' : 'turnReasoning')}
      open={open} expandable expandOnRowClick onToggle={() => { setOpen(value => !value) }}
      rowClassName={css.recordToggle} collapsedContent={director ? <span className={css.recordHint}>{t('directorDispatchHint')}</span> : undefined}>
      {body}
    </DisclosureRow>
  </div>
}

/** Partial streaming JSON is shown once complete; raw proposals remain available below. */
function PreparationContent({ argumentsText, t }: { argumentsText: string; t: NarrativeProps['t'] }) {
  let value: unknown
  try { value = JSON.parse(argumentsText) } catch { return null }
  const record = objectRecord(value)
  if (record === undefined) return null
  const discussion = objectRecord(record.discussion)
  return <div>
    {typeof discussion?.stance === 'string' && <p><strong>{t('preparationStance')}</strong> · {discussion.stance}</p>}
    {typeof discussion?.eagerness === 'string' && <p><strong>{t('preparationEagerness')}</strong> · {discussion.eagerness}</p>}
    {Array.isArray(record.thoughts) && record.thoughts.map((thought: unknown, index) => {
      const content = objectRecord(thought)?.content
      return typeof content === 'string' ? <p key={index}>{content}</p> : null
    })}
  </div>
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
