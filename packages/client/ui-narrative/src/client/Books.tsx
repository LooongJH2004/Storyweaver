/** Publication is an explicit review step; opening an instance never reads a mutable draft. */
import { useEffect, useState } from 'react'
import { IconEditOutline16, IconBrowseOutline16, IconPlayOutline16, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { BookDraft, BookId, Document } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'
import { NarrativeMark } from './NarrativeMark.tsx'
import { BookFields } from './BookFields.tsx'
import { BookImport } from './BookImport.tsx'

/** Edit and review book documents while preserving their resource references. */
export function Books(props: NarrativeProps) {
  const { t } = props
  const library = props.useLibrary(value => value)
  const selection = props.useStore(value => ({ id: value.bookId, serial: value.newBook }))
  const edits = props.useStore(value => value.bookEdits)
  const editor = selection.id === null ? undefined : edits[selection.id]
  const draft = editor?.draft ?? null
  const title = editor?.title ?? ''
  const document = editor?.document ?? ''
  const setTitle = (title: string) => { props.actions.bookText({ title }) }
  const setDocument = (document: string) => { props.actions.bookText({ document }) }
  const importing = props.useStore(value => value.importingBooks === true)
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState<BookDraft | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<BookDraft | null>(null)
  const edit = (book: BookDraft, restore = true) => {
    const previous = edits[book.id]
    props.actions.editBook(restore && previous !== undefined ? previous : {
      draft: book, title: book.title, document: JSON.stringify(book.document, null, 2) })
    setPreview(null)
  }
  const newDraft = () => { props.actions.book(null) }
  useEffect(() => {
    if (selection.id !== null || selection.serial === 0) return
    let active = true
    setBusy(true); setError('')
    void props.contextDefaults().then((recipe) => {
      if (!active) return
      const id = randomUUID() as BookId
      edit({ id, revision: 0, title: t('newBook'), document: { schemaVersion: 6, id, title: t('newBook'),
        directorPrompt: '', directorGuidance: {}, characters: [], contextRecipe: JSON.parse(JSON.stringify({ ...recipe, revision: 0 })) as Document }, resources: [], deleted: false })
    }).catch((value: unknown) => { if (active) setError(String(value)) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false; setBusy(false) }
  }, [selection.id, selection.serial, props.contextDefaults])
  useEffect(() => {
    if (selection.id !== null) { const book = library.books.find(book => book.id === selection.id)
      if (book !== undefined && editor === undefined) edit(book) }
  }, [selection.id, selection.serial, library.books])
  const perform = async (operation: () => Promise<void> | void) => {
    setBusy(true); setError('')
    try { await operation() } catch (value) { setError(String(value)) } finally { setBusy(false) }
  }
  const dirty = draft !== null && (draft.title !== title || document !== JSON.stringify(draft.document, null, 2))
  const exportBook = () => { void perform(() => {
    if (draft === null) return
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'storyweaver-book', version: 1,
      document: draft.document, resources: draft.resources }, null, 2)], { type: 'application/json' }))
    const anchor = window.document.createElement('a'); anchor.href = url
    anchor.download = `${draft.title.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_').trim() || draft.id}.storybook.json`
    window.document.body.append(anchor); anchor.click(); anchor.remove()
    window.setTimeout(() => { URL.revokeObjectURL(url) }, 0)
    setNotice(t('exportStarted'))
  }) }
  return <section className={`${css.editor} ${css.bookPage}`} aria-label={t('books')}>
    {draft === null && <>
      <header className={css.libraryHero}>
        <div className={css.heroEmblem}><NarrativeMark size={52} /></div>
        <span className={css.eyebrow}>{t('libraryEyebrow')}</span>
        <h1>{t('libraryHeadline')}</h1><p>{t('libraryDescription')}</p>
      </header>
      <div className={css.libraryActions}>
        <button className={css.createChoice} disabled={busy} onClick={() => { props.actions.panel('creator-home') }}>
          <IconEditOutline16 size={22} /><span><strong>{t('creator')}</strong><small>{t('libraryCreateHint')}</small></span><span aria-hidden="true">↗</span>
        </button>
        <button className={css.createChoice} disabled={busy} onClick={newDraft}>
          <IconBrowseOutline16 size={22} /><span><strong>{t('newBook')}</strong><small>{t('libraryWriteHint')}</small></span><span aria-hidden="true">↗</span>
        </button>
      </div>
      <div className={css.libraryImport}><button className={css.primaryButton} onClick={() => { props.actions.importBooks(true) }}>{t('libraryImport')}</button><p className={css.metadata}>{t('importBookHint')}</p></div>
      <div className={css.collectionHeader}><h2>{t('libraryCollection')}</h2><span>{t('libraryCount', { count: library.books.length })}</span></div>
      {library.books.length === 0 && <div className={css.libraryEmpty}><NarrativeMark size={40} /><h3>{t('libraryEmpty')}</h3><p>{t('libraryEmptyHint')}</p></div>}
    </>}
    {importing && <BookImport {...props} done={(book) => { edit(book, false); setNotice(t('importSuccess')) }} />}
    {notice !== '' && <p role="status">{notice}</p>}
    {error !== '' && <p role="alert">{error}</p>}
    {removing !== null && <Modal open title={t('removeBook')} closeLabel={t('cancel')} onClose={() => { if (!busy) setRemoving(null) }}>
      <p>{t('removeBookHint', { title: removing.title })}</p>
      {error !== '' && <p role="alert">{error}</p>}
      <div className={css.toolbar}><button disabled={busy} onClick={() => {
        void perform(async () => { await props.removeBook(removing); props.actions.closeBook(); setRemoving(null) })
      }}>{t('confirmRemove')}</button><button disabled={busy} onClick={() => { setRemoving(null) }}>{t('cancel')}</button></div>
    </Modal>}
    {draft === null && <div className={css.bookShelf}>{library.books.map((book, index) => <article className={css.bookTile} key={book.id}>
      <button className={css.bookCover} data-tone={index % 3} aria-label={t('openBook', { title: book.title })} onClick={() => { props.actions.book(book.id); edit(book) }}>
        <span className={css.coverEdition}>{t('brandEnglish')}<span>{String(index + 1).padStart(2, '0')}</span></span>
        <NarrativeMark size={54} /><strong>{book.title}</strong><span className={css.coverRule} />
      </button>
      <div className={css.bookInfo}><span className={css.bookStatus} data-published={book.latestVersionId !== undefined}>{t(book.latestVersionId === undefined ? 'libraryDraft' : 'libraryPublished')}</span>
        <div className={css.toolbar}><button className={css.bookTitle}
          onClick={() => { props.actions.book(book.id); edit(book) }}>{book.title}</button>
        <button disabled={busy} onClick={() => { void perform(async () => { await props.createCreator(book); props.actions.panel('creator') }) }}>{t('continueCreation')}</button>
        <button className={css.dangerButton} disabled={busy} onClick={() => { setRemoving(book) }}>{t('removeBook')}</button>
        {book.latestVersionId !== undefined && <button disabled={busy} onClick={() => { const version = book.latestVersionId
          if (version !== undefined) void perform(async () => { await props.start(version); props.actions.panel('play') })
        }}><IconPlayOutline16 />{t('newInstance')}</button>}</div>
        <p className={css.bookPremise}>{typeof book.document.premise === 'string' && book.document.premise.trim() !== '' ? book.document.premise : t('libraryNoPremise')}</p>
        <div className={css.bookRuns}>
          {library.instances.filter(instance => instance.book.id === book.id).map((instance, index) => <button key={instance.id}
            onClick={() => { props.select(instance.id, { kind: 'observer' }); props.actions.panel('play') }}>
            {t('instanceNumber', { number: index + 1 })} · {t('version', { version: instance.book.version })} · {instance.id.slice(-6)}
          </button>)}
        </div></div>
    </article>)}</div>}
    {draft !== null && <form onSubmit={(event) => { event.preventDefault(); void perform(async () => {
      const saved = await props.saveBook({ id: draft.id, expectedRevision: draft.revision, title,
        document: JSON.parse(document) as Document, resources: draft.resources })
      edit(saved, false)
    }) }}>
      {library.books.some(book => book.id === draft.id && book.revision !== draft.revision) && <section className={css.card}><p>{t('newerBook')}</p>
        <button type="button" disabled={busy} onClick={() => { const latest = library.books.find(book => book.id === draft.id); if (latest !== undefined) edit(latest, false) }}>{t('loadSavedBook')}</button></section>}
      <div className={css.bookSaveBar}>
        <button type="button" onClick={props.actions.bookLibrary}>{t('bookLibrary')}</button>
        <strong>{title}</strong><span role="status">{t(dirty || draft.revision === 0 ? 'dirty' : 'saved')}</span>
        <button className={css.primaryButton} disabled={busy} type="submit">{t('save')}</button>
        <button type="button" disabled={busy || dirty || draft.revision === 0} onClick={() => { void perform(async () => { setPreview(await props.previewBook(draft)) }) }}>{t('preview')}</button>
        <button type="button" disabled={busy || dirty || draft.revision === 0} title={t('exportSavedHint')} onClick={exportBook}>{t('exportBook')}</button>
        <button type="button" onClick={() => { props.actions.importBooks(true) }}>{t('libraryImport')}</button>
        <button type="button" className={css.dangerButton} disabled={busy || draft.revision === 0} onClick={() => { setRemoving(draft) }}>{t('removeBook')}</button>
      </div>
      <p className={css.metadata}>{t('bookEditingHint')}</p>
      <label>{t('title')}<input value={title} onChange={(event) => { setTitle(event.target.value); setPreview(null) }} /></label>
      <BookFields key={draft.id} t={t} manageSync={() => { props.actions.openCreative({ bookId: draft.id, tab: 'book' }) }} source={document}
        change={(source) => { setDocument(source); setPreview(null) }} />
      <details><summary>{t('advancedBook')}</summary><label>{t('document')}<textarea className={css.document} value={document} onChange={(event) => { setDocument(event.target.value); setPreview(null) }} /></label></details>


      {preview !== null && <section className={css.bookSection}><h3>{t('preview')}</h3><strong>{preview.title}</strong><p>{typeof preview.document.premise === 'string' ? preview.document.premise : ''}</p><p>{t('characters')}: {Array.isArray(preview.document.characters) ? preview.document.characters.length : 0}</p><details><summary>{t('advancedBook')}</summary><pre>{JSON.stringify(preview.document, null, 2)}</pre></details>
        <button type="button" disabled={busy || dirty} onClick={() => { void perform(async () => { await props.publish(preview); props.actions.closeBook(); setPreview(null) }) }}>{t('publish')}</button>
      </section>}
    </form>}
  </section>
}
