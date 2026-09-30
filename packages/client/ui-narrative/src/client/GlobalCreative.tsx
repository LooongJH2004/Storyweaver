/** The synchronization page presents source, direction, and destination in one view. */
import { useEffect, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BookId } from '@deepseek-ai/dsh-roleplay-core/types'
import type { GlobalCreativeSettings } from '@deepseek-ai/dsh-roleplay-core/creative-modules'
import type { NarrativeProps } from './contract.ts'
import { SharedCreativeEditor } from './SharedCreativeEditor.tsx'
import { CreativeStories } from './CreativeStories.tsx'
import { CreativeBookCopy } from './CreativeBookCopy.tsx'
import { SystemContextDefaults } from './SystemContextDefaults.tsx'
import { SyncTransfer } from './SyncTransfer.tsx'
import css from './CreativeSync.module.css'

export function GlobalCreative(props: NarrativeProps) {
  const { t } = props
  const library = props.useLibrary(value => value)
  const navigation = props.useStore(value => value.creativeNavigation)
  const book = navigation?.bookId === undefined ? library.books[0] : library.books.find(book => book.id === navigation.bookId)
  const [extra, setExtra] = useState(false)
  return <section className={css.page} aria-label={t('creativeSettingsTitle')}>
    <header className={css.topbar}>
      <button type="button" onClick={props.actions.closeCreative}>{t('syncBack')}</button>
      <h1>{t('creativeSettingsTitle')}</h1>
      <label className={css.headerBook}><span className={css.srOnly}>{t('syncBook')}</span>
        <select value={book?.id ?? ''} onChange={(event) => {
          props.actions.creativeNavigate({ bookId: event.target.value, tab: 'stories' })
        }}><option value="" disabled>{t('syncChooseBook')}</option>
          {library.books.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}</select></label>
      <button type="button" aria-expanded={extra} onClick={() => { setExtra(value => !value) }}>{t('syncMore')}</button>
    </header>
    {extra && <nav className={css.extraActions} aria-label={t('syncMore')}>
      <button onClick={() => { props.actions.creativeNavigate({ ...navigation, tab: 'book' }); setExtra(false) }}>{t('syncDraftTab')}</button>
      <button onClick={() => { props.actions.creativeNavigate({ ...navigation, tab: 'defaults' }); setExtra(false) }}>{t('syncNewBooks')}</button>
    </nav>}
    {book === undefined ? <p role="status">{t(library.loading ? 'loading' : 'syncChooseBook')}</p>
      : <BookSynchronization key={book.id} {...props} bookId={book.id} />}
    {navigation?.tab === 'defaults' && <Modal open title={t('syncNewBooks')} closeLabel={t('closePanel')}
      className={`${css.editorDialog}`} contentClassName={`${css.dialogScroll}`} onClose={() => {
        props.actions.creativeNavigate({ ...navigation, tab: 'stories' })
      }}><SystemContextDefaults {...props} /></Modal>}
  </section>
}

function BookSynchronization(props: NarrativeProps & { bookId: BookId }) {
  const { t, bookId } = props
  const runs = props.useLibrary(value => value.instances.filter(run => run.book.id === bookId))
  const navigation = props.useStore(value => value.creativeNavigation)
  const run = runs.find(run => run.id === navigation?.instanceId) ?? runs[0]
  const [saved, setSaved] = useState<GlobalCreativeSettings | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [dialog, setDialog] = useState<'edit' | 'restore' | null>(null)
  useEffect(() => {
    let active = true
    void props.globalCreative(bookId).then((value) => { if (active) { setSaved(value); setError('') } },
      (error: unknown) => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [bookId, props.globalCreative, refresh])
  const runLabel = run === undefined ? '' : `${t('instanceNumber', { number: runs.findIndex(item => item.id === run.id) + 1 })} · ${run.id.slice(-6)}`
  const close = () => { setDialog(null); setRefresh(value => value + 1) }
  return <>
    {error && <p role="alert">{error}</p>}
    {saved === null ? <p role="status">{t('loading')}</p> : <SyncTransfer {...props} saved={saved} updated={setSaved}
      {...run === undefined ? {} : { instanceId: run.id }} runLabel={runLabel} refreshRevision={refresh}
      reload={() => { setRefresh(value => value + 1) }} editShared={() => { setDialog('edit') }}
      openRestore={() => { setDialog('restore') }} />}
    {dialog !== null && saved !== null && <Modal open
      title={t(dialog === 'edit' ? 'syncEditShared' : 'syncRestoreOptions')} closeLabel={t('closePanel')}
      className={`${css.editorDialog}`} contentClassName={`${css.dialogScroll}`} onClose={close}>
      {dialog === 'edit' ? <><label className={css.bookPicker}>{t('syncCopySource')}
        <select value={run?.id ?? ''} onChange={(event) => { props.actions.creativeNavigate({ bookId, instanceId: event.target.value, tab: 'stories' }) }}>
          {runs.map((run, index) => <option key={run.id} value={run.id}>{t('instanceNumber', { number: index + 1 })} · {run.id.slice(-6)}</option>)}
        </select></label><SharedCreativeEditor {...props} saved={saved} updated={setSaved}
        {...run === undefined ? {} : { instanceId: run.id }} /></>
        : run !== undefined && <CreativeStories key={run.id} {...props} instanceId={run.id} runLabel={runLabel}
          sharedRevision={saved.revision} refreshRevision={refresh} />}
    </Modal>}
    {navigation?.tab === 'book' && saved !== null && <Modal open title={t('syncDraftTab')} closeLabel={t('closePanel')}
      className={`${css.editorDialog}`} contentClassName={`${css.dialogScroll}`} onClose={() => {
        props.actions.creativeNavigate({ ...navigation, tab: 'stories' })
      }}><CreativeBookCopy {...props} saved={saved} /></Modal>}
  </>
}
