/** Recorded requests are read as messages; raw provider JSON remains an explicit secondary view. */
import { useState } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NarrativeProps } from './contract.ts'
import type { InspectionSnapshot } from '@deepseek-ai/dsh-api-roleplay-controller/client'
import css from './Narrative.module.css'
import { UsageSummary } from './TurnUsage.tsx'
import { RequestMessage } from './RequestMessage.tsx'

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const json = (value: unknown) => JSON.stringify(value, null, 2)
/** Decode only recorded provider data; never substitute a current preview for missing history. */
function requestOf(text: string | undefined): Record<string, unknown> {
  try { return record(JSON.parse(text ?? '{}')) } catch { return {} }
}
/** Show text without JSON escaping while preserving non-text blocks and tool arguments. */
function messageText(value: unknown): string {
  const message = record(value)
  const content = typeof message.content === 'string' ? message.content : Array.isArray(message.content)
    ? message.content.map((part: unknown) => { const block = record(part); return typeof block.text === 'string' ? block.text : json(part) }).join('\n\n') : ''
  return [typeof message.reasoning_content === 'string' ? message.reasoning_content : '', content,
    ...(Array.isArray(message.tool_calls) ? message.tool_calls.map((call: unknown) => json(call)) : [])].filter(Boolean).join('\n\n')
}

/** An explicit step list and reading tabs keep reasoning one click away from its turn. */
export function Requests(props: NarrativeProps & { detail: InspectionSnapshot; initialTab?: 'reasoning' | 'messages' }) {
  const { t, detail } = props
  const [tab, setTab] = useState<'reasoning' | 'messages' | 'response' | 'parameters' | 'raw'>(props.initialTab ?? 'messages')
  const [query, setQuery] = useState('')
  const next = detail.requests?.nextOffset
  const actual = detail.actualRequest
  const request = requestOf(actual?.requestJson)
  const messages: unknown[] = Array.isArray(request.messages) ? request.messages : []
  const selected = actual?.request
  const response = actual?.response
  return <section className={css.requestReader}>
    <h3>{t('actualRequests')}</h3>
    <p className={css.metadata}>{t('recordedOnlyHint')}</p>
    <div className={css.requestLayout}>
      <nav className={css.requestSteps} aria-label={t('requestSteps')}>
        <button onClick={() => { void props.executionRequests() }}>{t('refresh')}</button>
        {detail.requests?.entries.map(request => <button key={`${request.evidenceId ?? 'live'}:${request.requestId}`}
          aria-label={t('requestStep', { turn: request.turn, step: request.step })}
          aria-current={selected?.requestId === request.requestId && selected.evidenceId === request.evidenceId ? 'step' : undefined}
          onClick={() => { setQuery(''); void props.executionRequest(request.requestId, request.evidenceId) }}>
          <strong>{t('requestStep', { turn: request.turn, step: request.step })}</strong><small>{request.model}</small>
          <small>{t('revision', { revision: request.revision })} · {t(request.status)}</small>
          {request.evidenceId !== undefined && <small>{t('archivedRequest')}</small>}
        </button>)}
        {next !== null && next !== undefined && <button onClick={() => { void props.executionRequests(next) }}>{t('next')}</button>}
      </nav>
      <div className={css.requestReading}>
        {detail.requests?.entries.length === 0 ? <p>{t('noRequests')}</p> : actual === null ? <p role="status">{t('selectRequestStep')}</p> : <>
          <UsageSummary {...props} request={actual.request} />
          <div className={css.requestTabs} role="tablist" aria-label={t('requestViews')}>
            {(['reasoning', 'messages', 'response', 'parameters', 'raw'] as const).map(value => <button key={value} role="tab" aria-selected={tab === value}
              onClick={() => { setTab(value) }}>{t(`requestView-${value}`)}</button>)}
          </div>
          {tab === 'reasoning' && <section><h4>{t('recordedReasoning')}</h4>
            {response?.reasoning ? <div className={css.reasoningText}><MarkdownText text={response.reasoning} labels={{ code: { copyLabel: t('copyText'), copiedLabel: t('copiedText') }, footnotes: t('footnotes') }} /></div>
              : <p>{t(response === undefined || response.state === 'pending' ? 'reasoningNotRecorded' : 'noReasoning')}</p>}
          </section>}
          {tab === 'messages' && <section><h4>{t('recordedInput')}</h4>
            <label>{t('searchRequestMessages')}<input value={query} onChange={(event) => { setQuery(event.target.value) }} /></label>
            <ol className={css.requestMessages}>{messages.map((message, index) => ({ message, index, text: messageText(message) }))
              .filter(item => !query || item.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
              .map(({ message, index }) => <RequestMessage key={`${selected?.requestId}:${index}`} message={message} index={index} t={t} />)}</ol>
          </section>}
          {tab === 'response' && <section><h4>{t('recordedResponse')}</h4>
            {response === undefined ? <p>{t('reasoningNotRecorded')}</p> : <>
              <p>{t(`response-${response.state}`)}</p><pre className={css.messageText}>{response.text}</pre>
              {response.toolCalls.map(call => <details key={call.id}><summary>{call.name}</summary>
                <pre className={css.messageText}>{call.arguments}</pre></details>)}
            </>}
          </section>}
          {tab === 'parameters' && <section><h4>{t('requestView-parameters')}</h4>
            <dl>{Object.entries(request).filter(([key]) => key !== 'messages' && key !== 'tools').map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'string' ? value : json(value)}</dd></div>)}</dl>
            <details><summary>{t('requestTools')}</summary><pre className={css.messageText}>{json(request.tools ?? [])}</pre></details>
          </section>}
          {tab === 'raw' && <section><h4>{t('recordedInput')}</h4><pre className={css.messageText}>{actual.requestJson}</pre></section>}
        </>}
      </div>
    </div>
  </section>
}
