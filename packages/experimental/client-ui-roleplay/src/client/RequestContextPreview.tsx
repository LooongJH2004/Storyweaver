/** Readable inspection of the sender-serialized request that produced one event. */
import type { StoryRequestContextPreviewValue } from '@deepseek-ai/dsh-api-story-controller/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { IconApiOutline14, IconChevronDownOutline14, IconCloseOutline16, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { NS } from './locales.ts'
import eventCss from './RoleplayEventView.module.css'
import css from './RequestContextPreview.module.css'

type Translate = TranslateNS<typeof NS>
type Request = Record<string, unknown>
type PreviewView = 'messages' | 'settings' | 'raw'

/** Loads the historical request for the owning event without starting generation. */
export interface RequestContextPreviewBinding {
  readonly load: () => Promise<StoryRequestContextPreviewValue>
}

type PreviewState =
  | { readonly status: 'idle' | 'loading' }
  | { readonly status: 'ready'; readonly value: StoryRequestContextPreviewValue; readonly request: Request }
  | { readonly status: 'error'; readonly error: string }

/**
 * Lazily load and cache one event's context in a dismissible reading dialog.
 * @param props - Historical request loader and localized text.
 * @returns The event control and its modal; closing does not discard a successful load.
 */
export function RequestContextPreview({ binding, t }: {
  readonly binding: RequestContextPreviewBinding
  readonly t: Translate
}) {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<PreviewView>('messages')
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' })

  useEffect(() => {
    if (!open) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [open])

  const load = (): void => {
    setPreview({ status: 'loading' })
    void binding.load().then((value) => {
      const request: unknown = JSON.parse(value.requestJson)
      if (!isRecord(request)) throw new Error(t('event.requestContext.invalidRequest'))
      setPreview({ status: 'ready', value, request })
    }).catch((error: unknown) => {
      setPreview({ status: 'error', error: error instanceof Error ? error.message : String(error) })
    })
  }

  const show = (): void => {
    setView('messages')
    setOpen(true)
    if (preview.status === 'idle' || preview.status === 'error') load()
  }

  return (
    <>
      <button
        type="button"
        className={eventCss.requestContextButton}
        aria-label={t('event.requestContext.open')}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        title={t('event.requestContext.open')}
        onClick={show}
      >
        <IconApiOutline14 aria-hidden="true" />
        <span>{t('event.requestContext.label')}</span>
      </button>
      <Modal open={open} onClose={() => { setOpen(false) }} title={t('event.requestContext.title')} headless className={css.dialog ?? ''}>
        <header className={css.heading}>
          <div>
            <h2>{t('event.requestContext.title')}</h2>
            {preview.status === 'ready' && <p>{t('event.requestContext.coordinate', { turn: preview.value.turn, step: preview.value.step })}</p>}
          </div>
          <button type="button" className={css.close} aria-label={t('event.requestContext.close')} onClick={() => { setOpen(false) }}>
            <IconCloseOutline16 aria-hidden="true" />
          </button>
        </header>
        {preview.status === 'ready' && preview.value.retention !== undefined && <dl className={css.retention}>
          {(['recent', 'pending', 'notes', 'archived'] as const).map(key => <div key={key}><dt>{t(`retention.${key}`)}</dt><dd>{preview.value.retention?.[key]}</dd></div>)}
        </dl>}
        <nav className={css.views} aria-label={t('event.requestContext.views')}>
          {(['messages', 'settings', 'raw'] as const).map(name => (
            <button key={name} type="button" aria-pressed={view === name} aria-controls={panelId} onClick={() => { setView(name) }}>
              {t(viewKey(name))}
            </button>
          ))}
        </nav>
        <section key={view} id={panelId} className={css.body} aria-label={t(viewKey(view))} aria-busy={preview.status === 'loading'}>
          {preview.status === 'loading' && <p role="status">{t('event.requestContext.loading')}</p>}
          {preview.status === 'error' && <>
            <p role="alert">{t('event.requestContext.error', { value: preview.error })}</p>
            <button type="button" className={css.action} onClick={load}>{t('event.requestContext.retry')}</button>
          </>}
          {preview.status === 'ready' && <RequestContextBody request={preview.request} requestJson={preview.value.requestJson} view={view} t={t} />}
        </section>
      </Modal>
    </>
  )
}

function viewKey(view: PreviewView) {
  return ({
    messages: 'event.requestContext.view.messages',
    settings: 'event.requestContext.view.settings',
    raw: 'event.requestContext.view.raw',
  } as const)[view]
}

function isRecord(value: unknown): value is Request {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function json(value: unknown): string {
  return JSON.stringify(value, undefined, 2)
}

function RequestContextBody({ request, requestJson, view, t }: {
  readonly request: Request
  readonly requestJson: string
  readonly view: PreviewView
  readonly t: Translate
}) {
  if (view === 'raw') return <pre className={css.raw}>{requestJson}</pre>
  if (view === 'settings') return <RequestSettings request={request} t={t} />
  const messages: readonly unknown[] = Array.isArray(request.messages) ? request.messages : []
  return <>
    <p className={css.summary}>{t('event.requestContext.summary', {
      messages: messages.length, tools: Array.isArray(request.tools) ? request.tools.length : 0,
    })}</p>
    {messages.length === 0 ? <p>{t('event.requestContext.emptyMessages')}</p> : (
      <ol className={css.messages} aria-label={t('event.requestContext.messages')}>
        {messages.map((message, index) => (
          <li key={index} className={css.message}>
            <header className={css.messageHeading}>
              <h3>{t('event.requestContext.message', { index: index + 1, role: requestMessageRole(message, t) })}</h3>
              <small>{t('event.requestContext.chars', { value: json(message).length.toLocaleString() })}</small>
            </header>
            <MessageContent message={message} t={t} />
            <ContextSection title={t('event.requestContext.messageRaw')} text={json(message)} />
          </li>
        ))}
      </ol>
    )}
  </>
}

function MessageContent({ message, t }: { readonly message: unknown; readonly t: Translate }) {
  if (!isRecord(message)) return <ReadableText text={json(message)} t={t} />
  const content = message.content
  return <>
    {typeof message.reasoning_content === 'string' && <MessageBlock title={t('event.requestContext.reasoning')} text={message.reasoning_content} t={t} />}
    {typeof content === 'string' && <MessageBlock title={t(message.role === 'tool' ? 'event.requestContext.role.tool' : 'event.requestContext.text')} text={content} t={t} />}
    {Array.isArray(content) && content.map((block: unknown, index: number) => (
      isRecord(block) && ['text', 'input_text', 'output_text'].includes(String(block.type)) && typeof block.text === 'string'
        ? <MessageBlock key={index} title={t('event.requestContext.text')} text={block.text} t={t} />
        : <ContextSection key={index} title={t('event.requestContext.otherContent')} text={json(block)} />
    ))}
    {content !== undefined && content !== null && typeof content !== 'string' && !Array.isArray(content)
      && <ContextSection title={t('event.requestContext.otherContent')} text={json(content)} />}
    {Array.isArray(message.tool_calls) && message.tool_calls.map((call: unknown, index: number) => (
      <MessageBlock key={index} title={t('event.requestContext.toolCall')} text={json(call)} t={t} />
    ))}
    {typeof message.tool_call_id === 'string' && <p className={css.metadata}>{t('event.requestContext.callId', { value: message.tool_call_id })}</p>}
  </>
}

function MessageBlock({ title, text, t }: { readonly title: string; readonly text: string; readonly t: Translate }) {
  return <div className={css.block}><h4>{title}</h4><ReadableText text={text} t={t} /></div>
}

function ReadableText({ text, t }: { readonly text: string; readonly t: Translate }) {
  const id = useId()
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [long, setLong] = useState(text.split('\n').length > 6)
  useLayoutEffect(() => {
    const node = ref.current
    if (node === null) return
    const measure = (): void => {
      const lineHeight = Number.parseFloat(window.getComputedStyle(node).lineHeight)
      if (lineHeight > 0) setLong(node.scrollHeight > lineHeight * 6 + 1)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => { observer.disconnect() }
  }, [text])
  return <>
    <p id={id} ref={ref} className={css.text} data-collapsed={!expanded}>{text === '' ? '∅' : text}</p>
    {long && <button type="button" className={css.action} aria-expanded={expanded} aria-controls={id} onClick={() => { setExpanded(!expanded) }}>
      {t(expanded ? 'event.requestContext.collapse' : 'event.requestContext.expand')}
    </button>}
  </>
}

function RequestSettings({ request, t }: { readonly request: Request; readonly t: Translate }) {
  return <>
    <h3>{t('event.requestContext.parameters')}</h3>
    <dl className={css.parameters}>
      {Object.entries(request).filter(([name]) => name !== 'messages' && name !== 'tools').map(([name, value]) => (
        <div key={name}><dt>{requestFieldTitle(name, t)}</dt><dd>{typeof value === 'string' ? value : json(value)}</dd></div>
      ))}
    </dl>
    <h3>{t('event.requestContext.tools')}</h3>
    {Array.isArray(request.tools) && request.tools.length > 0
      ? request.tools.map((tool: unknown, index: number) => {
        const definition = isRecord(tool) && isRecord(tool.function) ? tool.function : tool
        const name = isRecord(definition) && typeof definition.name === 'string' ? definition.name : t('event.requestContext.toolNumber', { value: index + 1 })
        return <ContextSection key={index} title={name} text={json(tool)} />
      })
      : <p>{t('event.requestContext.emptyTools')}</p>}
  </>
}

function requestMessageRole(message: unknown, t: Translate): string {
  const role = isRecord(message) ? message.role : undefined
  switch (role) {
    case 'system': return t('event.requestContext.role.system')
    case 'user': return t('event.requestContext.role.user')
    case 'assistant': return t('event.requestContext.role.assistant')
    case 'tool': return t('event.requestContext.role.tool')
    default: return typeof role === 'string' ? role : t('event.requestContext.role.other')
  }
}

function requestFieldTitle(name: string, t: Translate): string {
  switch (name) {
    case 'model': return t('event.requestContext.field.model')
    case 'stream': return t('event.requestContext.field.stream')
    case 'stream_options': return t('event.requestContext.field.streamOptions')
    case 'thinking': return t('event.requestContext.field.thinking')
    case 'reasoning_effort': return t('event.requestContext.field.reasoningEffort')
    case 'temperature': return t('event.requestContext.field.temperature')
    case 'max_tokens': return t('event.requestContext.field.maxTokens')
    case 'stop': return t('event.requestContext.field.stop')
    default: return name
  }
}

function ContextSection({ title, text }: { readonly title: string; readonly text: string }) {
  return <details className={css.section}>
    <summary tabIndex={0}><IconChevronDownOutline14 aria-hidden="true" /><span>{title}</span></summary>
    <pre className={css.raw}>{text}</pre>
  </details>
}
