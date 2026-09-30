/** Story browsing occupies the native sidebar region; the shell owns its rail and settings. */
import { useEffect, useState } from 'react'
import { IconBrowseOutline16, IconEditOutline16, IconSearchOutline16, IconRefreshOutline16, Tooltip, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { LibraryProps } from './contract.ts'
import css from './Library.module.css'

/** The product name uses the native sidebar brand seat. */
export function LibraryBrand({ t }: PropsLocale<'narrative'>) { return <span className={css.brand}>{t('brand')}<small>{t('brandEnglish')}</small></span> }

/** Select an independent instance without creating a technical execution Session. */
export function Library(props: LibraryProps) {
  const { t, wide } = props
  const library = props.useLibrary(value => value)
  const selected = props.usePlay(value => value.request?.instanceId)
  const selectedBook = library.instances.find(run => run.id === selected)?.book.id
  const creator = props.useSessions(value => value.current?.startsWith('creator-') ? value.byId[value.current] : undefined)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<{ kind: 'book' | 'instance'; id: string; title: string } | null>(null)
  const perform = async (operation: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await operation() } catch (value) { setError(String(value)) } finally { setBusy(false) }
  }
  const refresh = () => { setError(''); void props.refresh().catch((value: unknown) => { setError(String(value)) }) }
  useEffect(() => { refresh() }, [props.refresh])
  useEffect(() => { if (creator !== undefined && !creator.running) refresh() }, [creator?.running])
  return <aside className={css.browser} aria-label={t('library')} data-wide={wide}>
    <Tooltip label={t('creator')} disabled={wide}><button className={css.shortcut} disabled={busy} aria-label={t('creator')}
      onClick={() => { props.actions.panel('creator-home') }}>
      <IconEditOutline16 size={wide ? 16 : 18} />{wide && <span>{t('creator')}</span>}
    </button></Tooltip>
    <Tooltip label={t('newBook')} disabled={wide}><button className={css.shortcut} aria-label={t('newBook')}
      onClick={() => { props.actions.book(null) }}><span className={css.plus} aria-hidden="true">+</span>{wide && <span>{t('newBook')}</span>}</button></Tooltip>
    <Tooltip label={t('books')} disabled={wide}>
      <button className={css.shortcut} aria-label={t('books')} onClick={props.actions.bookLibrary}>
        <IconBrowseOutline16 size={wide ? 16 : 18} />{wide && <span>{t('books')}</span>}
      </button>
    </Tooltip>
    <Tooltip label={t('libraryImport')} disabled={wide}><button className={css.shortcut} aria-label={t('libraryImport')}
      onClick={() => { props.actions.importBooks(true) }}><IconBrowseOutline16 size={wide ? 16 : 18} />{wide && <span>{t('libraryImport')}</span>}</button></Tooltip>
    <Tooltip label={t('creativeSettingsTitle')}><button className={css.shortcut} aria-label={t('creativeSettingsTitle')}
      onClick={() => { props.actions.openCreative({ tab: 'shared', ...(selected === undefined ? {} : { instanceId: selected }), ...(selectedBook === undefined ? {} : { bookId: selectedBook }) }) }}><IconBrowseOutline16 size={wide ? 16 : 18} />{wide && <span>{t('creativeSettingsTitle')}</span>}</button></Tooltip>
    {!wide ? <Tooltip label={t('searchStories')}><button className={css.shortcut} aria-label={t('searchStories')}
      onClick={props.expandSidebar}><IconSearchOutline16 size={18} /></button></Tooltip> : <>
      <label className={css.search}><IconSearchOutline16 /><input aria-label={t('searchStories')} placeholder={t('searchStories')}
        value={query} onChange={(event) => { setQuery(event.target.value) }} /></label>
      <div className={css.sectionTitle}><span>{t('library')}</span>
        <button aria-label={t('refresh')} title={t('refresh')} onClick={refresh}><IconRefreshOutline16 /></button></div>
      {library.loading && <p role="status">{t('loading')}</p>}
      {(library.error !== null || error !== '') && <p role="alert">{library.error ?? error}</p>}
      <nav className={css.instances}>{library.books.filter(book => book.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())
        || library.instances.some(instance => instance.book.id === book.id
          && instance.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())))
        .map(book => <section key={book.id} className={css.book} aria-label={book.title}>
          <div className={css.bookHeading}><button onClick={() => { props.actions.book(book.id) }}><strong>{book.title}</strong></button>
            <button disabled={busy || book.latestVersionId === undefined} title={t(book.latestVersionId === undefined ? 'publishFirst' : 'newInstance')}
              aria-label={t('newInstanceFor', { title: book.title })} onClick={() => { const version = book.latestVersionId
                if (version !== undefined) void perform(async () => {
                  await props.start(version); props.actions.panel('play')
                })
              }}>+</button><button className={css.deleteButton} disabled={busy} aria-label={t('deleteBookNamed', { title: book.title })}
              onClick={() => { setRemoving({ kind: 'book', id: book.id, title: book.title }) }}>{t('deleteShort')}</button></div>
          {library.instances.filter(instance => instance.book.id === book.id).map((instance, index) =>
            <div className={css.instanceRow} key={instance.id}><button title={t('instanceIdentity', { id: instance.id.slice(-8) })}
              aria-current={selected === instance.id ? 'page' : undefined} onClick={() => {
                props.select(instance.id, { kind: 'observer' }); props.actions.panel('play')
              }}><span>{t('instanceNumber', { number: index + 1 })}</span><small>{t('version', { version: instance.book.version })} · {instance.id.slice(-6)}</small></button>
            <button className={css.deleteButton} disabled={busy} aria-label={t('deleteInstanceNamed', { title: `${book.title} · ${t('instanceNumber', { number: index + 1 })}` })}
              onClick={() => { setRemoving({ kind: 'instance', id: instance.id, title: `${book.title} · ${t('instanceNumber', { number: index + 1 })}` }) }}>{t('deleteShort')}</button></div>)}
          {!library.instances.some(instance => instance.book.id === book.id) && <small>{t(book.latestVersionId === undefined ? 'publishFirst' : 'noInstances')}</small>}
          <button disabled={busy} onClick={() => { void perform(async () => { await props.createCreator(book); props.actions.panel('creator') }) }}>{t('continueCreation')}</button>
        </section>)}
      {library.instances.filter((instance, index, all) => !library.books.some(book => book.id === instance.book.id)
          && all.findIndex(item => item.book.id === instance.book.id) === index).map(anchor => <section
        key={anchor.book.id} className={css.book} aria-label={anchor.title}>
        <div className={css.bookHeading}><strong>{anchor.title}</strong><button disabled={busy} aria-label={t('newInstanceFor', { title: anchor.title })}
          onClick={() => { void perform(async () => { await props.start(anchor.templateVersionId); props.actions.panel('play') }) }}>+</button></div>
        {library.instances.filter(instance => instance.book.id === anchor.book.id).map((instance, index) =>
          <div className={css.instanceRow} key={instance.id}><button aria-current={selected === instance.id ? 'page' : undefined}
            onClick={() => { props.select(instance.id, { kind: 'observer' }); props.actions.panel('play') }}>
            <span>{t('instanceNumber', { number: index + 1 })}</span><small>{t('version', { version: instance.book.version })} · {instance.id.slice(-6)}</small></button>
          <button className={css.deleteButton} disabled={busy} aria-label={t('deleteInstanceNamed', { title: `${anchor.title} · ${t('instanceNumber', { number: index + 1 })}` })}
            onClick={() => { setRemoving({ kind: 'instance', id: instance.id, title: `${anchor.title} · ${t('instanceNumber', { number: index + 1 })}` }) }}>{t('deleteShort')}</button></div>)}
      </section>)}
      </nav>
    </>}
    {removing && <Modal open onClose={() => { if (!busy) setRemoving(null) }} title={t(removing.kind === 'book' ? 'removeBook' : 'removeInstance')} closeLabel={t('cancel')}>
      <div className={css.confirmDelete}><strong>{removing.title}</strong><p>{t(removing.kind === 'book' ? 'removeBookHint' : 'removeInstanceHint', { title: removing.title })}</p>
        {error && <p role="alert">{error}</p>}
        <button disabled={busy} onClick={() => { void perform(async () => {
          if (removing.kind === 'book') {
            const book = library.books.find(book => book.id === removing.id)
            if (book) { await props.removeBook(book); props.actions.closeBook() }
          } else {
            const instance = library.instances.find(instance => instance.id === removing.id)
            if (instance) await props.removeInstance(instance.id, instance.revision)
          }
          setRemoving(null)
        }) }}>{t('confirmRemove')}</button><button disabled={busy} onClick={() => { setRemoving(null) }}>{t('cancel')}</button>
      </div></Modal>}
  </aside>
}
