/** Creation tasks use native chat while keeping setup outside the running story. */
import { useEffect, useRef, useState } from 'react'
import type { BookDraft } from '@deepseek-ai/dsh-roleplay-core/types'
import type { CreatorDirectory, CreatorPreferences, NarrativeProps } from './contract.ts'
import { NarrativeMark } from './NarrativeMark.tsx'
import css from './Narrative.module.css'

/** Defaults apply to future tasks; each existing book owns a saved copy. */
export function Creation(props: NarrativeProps & { book?: BookDraft; promptFocusRequest?: number }) {
  const { t, book } = props
  const [preferences, setPreferences] = useState<CreatorPreferences | null>(null)
  const [listing, setListing] = useState<CreatorDirectory['listing']>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const promptInput = useRef<HTMLTextAreaElement>(null)
  const loaded = preferences !== null
  const books = props.useLibrary(value => value.books)
  useEffect(() => {
    let active = true
    setPreferences(null)
    setError(''); setSaved(false)
    void props.creationPreferences(book).then((value) => { if (active) setPreferences(value) },
      (error: unknown) => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [book?.id])
  useEffect(() => {
    if (loaded && props.promptFocusRequest) promptInput.current?.focus()
  }, [loaded, props.promptFocusRequest])
  const perform = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setSaved(false)
    try { await operation() } catch (error) { setError(String(error)) } finally { setBusy(false) }
  }
  const change = (patch: Partial<CreatorPreferences>) => {
    setPreferences(value => value === null ? null : { ...value, ...patch }); setSaved(false)
  }
  const browse = (path?: string) => perform(async () => {
    const value = await props.creationDirectory(path)
    setListing(value.listing)
    if (value.path !== null) change({ cwd: value.path })
  })
  return <section className={`${css.editor} ${css.creatorControls}`}>
    {book === undefined ? <header className={css.creationHero}><div className={css.heroEmblem}><NarrativeMark size={40} /></div><span className={css.eyebrow}>{t('creatorEyebrow')}</span><h1>{t('creatorHeadline')}</h1><p>{t('creatorHomeHint')}</p>
      {preferences !== null && <button className={css.primaryButton} type="button" disabled={busy} onClick={() => { void perform(async () => { await props.createCreator(undefined, preferences); props.actions.panel('creator') }) }}>{t('newCreationTask')}</button>}</header>
      : <><h2>{t('creatorTaskSettings')}</h2><p>{t('creatorTaskHint')}</p></>}
    {error !== '' && <p role="alert">{error}</p>}
    {saved && <p role="status">{t(book === undefined ? 'saved' : 'creatorPromptSaved')}</p>}
    {preferences !== null && <form onSubmit={(event) => { event.preventDefault(); void perform(async () => {
      const value = await props.saveCreationPreferences({ ...preferences, ...(book === undefined ? { cwd: null } : {}) }, book)
      setPreferences({ ...value, cwd: preferences.cwd }); setSaved(true)
    }) }}>
      <fieldset disabled={busy}>
        {book === undefined && <>
          <label>{t('creatorDirectory')}<input value={preferences.cwd ?? ''} onChange={(event) => { change({ cwd: event.target.value || null }) }} /></label>
          <div className={css.toolbar}><button type="button" onClick={() => { void browse(preferences.cwd ?? undefined) }}>{t('browseDirectory')}</button>
            <button type="button" onClick={() => { change({ cwd: null }); setListing(null) }}>{t('noLocalDirectory')}</button></div>
          <p>{t('creatorDirectoryHint')}</p>
          {listing !== null && <div className={css.card}>
            <nav className={css.toolbar}>{listing.crumbs.map(crumb => <button type="button" key={crumb.path} onClick={() => { void browse(crumb.path) }}>{crumb.name}</button>)}</nav>
            <p>{listing.path}</p>
            <button type="button" onClick={() => { change({ cwd: listing.path }); setListing(null) }}>{t('selectDirectory')}</button>
            <div className={css.toolbar}>{listing.entries.filter(entry => !entry.hidden).map(entry => <button type="button" key={entry.path} onClick={() => { void browse(entry.path) }}>{entry.name}</button>)}</div>
            {listing.truncated && <p>{t('directoryTruncated')}</p>}
          </div>}
        </>}
        {book !== undefined && <p>{t('creatorDirectory')}: {preferences.cwd ?? t('noLocalDirectory')}</p>}
        <label><input type="checkbox" checked={preferences.enabled} onChange={(event) => { change({ enabled: event.target.checked }) }} />{t('enabled')}</label>
        <label>{t('role')}<select value={preferences.role} onChange={(event) => { change({ role: event.target.value as CreatorPreferences['role'] }) }}>
          {(['system', 'user', 'assistant'] as const).map(role => <option key={role} value={role}>{role}</option>)}
        </select></label>
        <label>{t('creatorPrompt')}<textarea ref={promptInput} value={preferences.prompt} onChange={(event) => { change({ prompt: event.target.value }) }} /></label>
        <details><summary>{t('contextPreview')}</summary><p>{preferences.role} · {t(preferences.enabled ? 'enabled' : 'disabled')}</p><pre>{preferences.enabled ? preferences.prompt : ''}</pre></details>
        <div className={css.toolbar}><button type="submit">{t(book === undefined ? 'saveCreatorDefaults' : 'saveCreatorTask')}</button>
        </div>
      </fieldset>
    </form>}
    {book === undefined && <><h3>{t('creationTasks')}</h3>{books.map(book => <article className={css.card} key={book.id}>
      <strong>{book.title}</strong><button disabled={busy} onClick={() => { void perform(async () => { await props.createCreator(book); props.actions.panel('creator') }) }}>{t('continueCreation')}</button>
    </article>)}</>}
  </section>
}
