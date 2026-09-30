/** Preserve recorded message roles while reading reasoning, content and tools separately. */
import { useState } from 'react'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

function Block({ label, text, t }: Pick<NarrativeProps, 't'> & { label: string; text: string }) {
  const [expanded, setExpanded] = useState(false)
  const long = text.length > 360 || text.split('\n').length > 6
  return <section className={css.requestBlock}><small>{label}</small>
    <pre className={css.messageText} data-collapsed={long && !expanded}>{text}</pre>
    {long && <button aria-expanded={expanded} onClick={() => { setExpanded(value => !value) }}>{t(expanded ? 'collapseBlock' : 'expandBlock')}</button>}
  </section>
}

/** Unknown provider blocks remain readable JSON and are also retained in the raw request tab. */
export function RequestMessage({ message, index, t }: Pick<NarrativeProps, 't'> & { message: unknown; index: number }) {
  const value = record(message)
  const content = typeof value.content === 'string' ? [value.content] : Array.isArray(value.content) ? value.content : []
  return <li><header><strong>{t('requestMessage', { number: index + 1 })}</strong>
    <code>{typeof value.role === 'string' ? value.role : t('unknown')}{typeof value.tool_call_id === 'string' ? ` · ${value.tool_call_id}` : ''}</code></header>
  {typeof value.reasoning_content === 'string' && value.reasoning_content !== '' && <Block t={t} label={t('requestView-reasoning')} text={value.reasoning_content} />}
  {content.map((part: unknown, number: number) => <Block key={number} t={t} label={t('messageContent')}
    text={typeof part === 'string' ? part : typeof record(part).text === 'string' ? String(record(part).text) : JSON.stringify(part, null, 2)} />)}
  {Array.isArray(value.tool_calls) && value.tool_calls.map((call: unknown, number: number) => {
    const fn = record(record(call).function)
    const name = fn.name ?? record(call).id
    return <Block key={number} t={t} label={`${t('messageTool')} · ${typeof name === 'string' ? name : ''}`}
      text={typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(call, null, 2)} />
  })}
  </li>
}
