/** File imports are reviewed before the host validates and saves a new draft or run. */
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { BookDraft, BookId, Document, Json } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'

/** Decode the transport envelope only; the host owns document and resource validation. */
export function readBookImport(source: string): { document: Document; resources: BookDraft['resources'] } {
  const input: unknown = JSON.parse(source)
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error('importObjectError')
  if ('formatVersion' in input && 'initial' in input) throw new Error('importWrongArchive')
  let document: unknown = input
  let resources: unknown = []
  if ('format' in input) {
    if (input.format !== 'storyweaver-book' || !('version' in input) || input.version !== 1) throw new Error('importVersionError')
    document = 'document' in input ? input.document : undefined
    resources = 'resources' in input ? input.resources : undefined
  }
  if (document === null || typeof document !== 'object' || Array.isArray(document)
    || !('characters' in document) || !Array.isArray(document.characters) || !Array.isArray(resources)) throw new Error('importDocumentError')
  return { document: document as Document, resources: resources as BookDraft['resources'] }
}

/** Retain the selected file and validation error so a failed import can be corrected or retried. */
export function BookImport(props: NarrativeProps & { done: (draft: BookDraft) => void }) {
  const { t } = props
  const [kind, setKind] = useState<'book' | 'archive'>('book')
  const [source, setSource] = useState('')
  const [filename, setFilename] = useState('')
  const [selection, setSelection] = useState<{ id: BookId; document: Document; resources: BookDraft['resources'] } | null>(null)
  const [archive, setArchive] = useState<Json | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const generation = useRef(0)
  useEffect(() => () => { generation.current++ }, [])
  const explain = (value: unknown) => value instanceof SyntaxError ? t('importJsonError')
    : value instanceof Error && ['importObjectError', 'importWrongArchive', 'importVersionError', 'importDocumentError'].includes(value.message)
      ? t(value.message as 'importObjectError' | 'importWrongArchive' | 'importVersionError' | 'importDocumentError') : String(value)
  const preview = (text: string) => {
    setError(''); setSelection(null); setArchive(null)
    try {
      if (kind === 'book') setSelection({ id: randomUUID() as BookId, ...readBookImport(text) })
      else {
        const input: unknown = JSON.parse(text)
        if (input === null || typeof input !== 'object' || !('formatVersion' in input) || !('initial' in input)) throw new Error(t('importArchiveError'))
        setArchive(input as Json)
      }
    } catch (value) { setError(explain(value)) }
  }
  const ready = selection !== null || archive !== null
  return <Modal open title={t('libraryImport')} closeLabel={t('cancel')} className={`${css.nativeDialog} ${css.inspector}`}
    onClose={() => { if (!busy) props.actions.importBooks(false) }}>
    <div className={`${css.surface} ${css.importPanel}`}>
      <div className={css.toolbar}>{(['book', 'archive'] as const).map(value => <button key={value} disabled={busy || reading}
        aria-pressed={kind === value} onClick={() => { setKind(value); setSource(''); setFilename(''); setSelection(null); setArchive(null); setError('') }}>
        {t(value === 'book' ? 'books' : 'importArchive')}</button>)}</div>
      <p>{t(kind === 'book' ? 'importBookHint' : 'importArchiveHint')}</p>
      <label className={css.importFile}>{t(kind === 'book' ? 'importBook' : 'importArchive')}
        <input type="file" accept="application/json,.json" disabled={busy || reading} onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = ''
          if (file === undefined) return
          const current = ++generation.current
          setReading(true); setError(''); setSelection(null); setArchive(null); setFilename(file.name)
          void file.text().then((text) => { if (current === generation.current) { setSource(text); preview(text) } },
            (value: unknown) => { if (current === generation.current) setError(String(value)) })
            .finally(() => { if (current === generation.current) setReading(false) })
        }} />
      </label>
      {filename !== '' && <p className={css.metadata}>{filename}</p>}
      <details><summary>{t('importPaste')}</summary><label>{t('document')}<textarea className={css.document} value={source} disabled={busy || reading}
        onChange={(event) => { setSource(event.target.value); setFilename(''); setSelection(null); setArchive(null); setError('') }} /></label>
      <button disabled={busy || reading || source.trim() === ''} onClick={() => { preview(source) }}>{t('importInspect')}</button></details>
      {reading && <p role="status">{t('loading')}</p>}
      {selection !== null && <section className={css.card} aria-label={t('importInspect')}>
        <h3>{typeof selection.document.title === 'string' ? selection.document.title : t('newBook')}</h3>
        <p>{t('importSummary', { count: Array.isArray(selection.document.characters) ? selection.document.characters.length : 0, resources: selection.resources.length })}</p>
        {!selection.document.protagonistActorId && Array.isArray(selection.document.characters) && selection.document.characters.length > 0
          && <p role="status">{t('importProtagonistHint')}</p>}
        <details><summary>{t('advancedBook')}</summary><pre>{JSON.stringify(selection.document, null, 2)}</pre></details>
      </section>}
      {archive !== null && <p role="status">{t('importArchiveReady')}</p>}
      {error !== '' && <p role="alert">{error}</p>}
      <div className={css.toolbar}><button className={css.primaryButton} disabled={busy || reading || !ready} onClick={() => {
        setBusy(true); setError('')
        void (async () => {
          if (selection !== null) {
            const saved = await props.saveBook({ id: selection.id, expectedRevision: 0,
              title: typeof selection.document.title === 'string' ? selection.document.title : t('newBook'),
              document: selection.document, resources: selection.resources })
            props.done(saved)
          } else if (archive !== null) { await props.importArchive(archive); props.actions.panel('play') }
          props.actions.importBooks(false)
        })().catch((value: unknown) => { setError(`${t('importFailed')} ${String(value)}`) }).finally(() => { setBusy(false) })
      }}>{t(busy ? 'submitting' : kind === 'book' ? 'importConfirm' : 'importArchive')}</button>
      <button disabled={busy} onClick={() => { props.actions.importBooks(false) }}>{t('cancel')}</button></div>
    </div>
  </Modal>
}
