import { GlobalCreative } from './GlobalCreative.tsx'
import { Creation } from './Creation.tsx'
import { useState } from 'react'
import { IconPanelLeftOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
/** An independent story surface has root scope even when the shell owns an optional Session seat. */
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'

/** The adapter declares its own root child instead of inventing a technical Session identity. */
export function NarrativeRoot(props: PropsRuntime<'conversation'> & PropsRenderSlots<'narrative.workspace'>) {
  return props.renderSlot('narrative.workspace', {})
}
/** Root-owned navigation persists while native creator Sessions change. */
export function NarrativeWorkspace(props: PropsRuntime<'narrative.workspace'> & PropsRenderSlots<'narrative.surface' | 'conversation.embedded'> & NarrativeProps) {
  const panel = props.useStore(value => value.panel)
  const current = props.useSessions(value => value.current)
  const books = props.useLibrary(value => value.books)
  const hasRun = props.usePlay(value => value.request !== null)
  const book = books.find(book => current === `creator-${book.id}`)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [promptFocusRequest, setPromptFocusRequest] = useState(0)
  if (panel === 'global-creative') return <GlobalCreative {...props} />
  if (panel === 'creator-home') return <section className={css.creatorWorkspace}><header className={`${css.navigation} ${css.creatorControls}`}><button className={css.iconButton} aria-label={props.t('toggle')} onClick={props.toggleSidebar}><IconPanelLeftOutline16 /></button><button onClick={props.actions.bookLibrary}>{props.t('books')}</button></header><Creation {...props} /></section>
  return panel === 'creator' ? <section className={css.creatorWorkspace}>
    <header className={`${css.navigation} ${css.creatorControls}`}><button className={css.iconButton} aria-label={props.t('toggle')} onClick={props.toggleSidebar}><IconPanelLeftOutline16 /></button>
      <div className={css.storyHeading}><strong>{props.t('creator')}</strong><small>{book?.title}</small></div>
      <button disabled={book === undefined} onClick={() => { setSettingsOpen(true); setPromptFocusRequest(value => value + 1) }}>{props.t('editCreatorPrompt')}</button>
      <button onClick={() => { if (book !== undefined) props.actions.book(book.id); else props.actions.bookLibrary() }}>{props.t('bookEdit')}</button>
      <button disabled={starting || !book?.latestVersionId} title={!book?.latestVersionId ? props.t('publishFirst') : undefined} onClick={() => { const version = book?.latestVersionId
        if (version) { setStarting(true); setError(''); void props.start(version).then(() => { props.actions.panel('play') },
          (error: unknown) => { setError(String(error)) }).finally(() => { setStarting(false) }) }
      }}>{props.t('bookStart')}</button>
      {!book?.latestVersionId && <small>{props.t('publishFirst')}</small>}
      <button disabled={!hasRun} onClick={() => { props.actions.panel('play') }}>{props.t('play')}</button>
    </header>
    {error && <p role="alert">{error}</p>}
    {book !== undefined && <details className={css.creatorSettings} open={settingsOpen} onToggle={(event) => { setSettingsOpen(event.currentTarget.open) }}><summary>{props.t('creatorTaskSettings')}</summary><Creation {...props} book={book} promptFocusRequest={promptFocusRequest} /></details>}
    {props.renderSlot('conversation.embedded', {})}
  </section> : props.renderSlot('narrative.surface', {})
}
