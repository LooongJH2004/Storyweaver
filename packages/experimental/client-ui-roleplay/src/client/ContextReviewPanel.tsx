/** Player approval of short memories and original-source retirement, without running a model. */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { IStories, StoryView } from '@deepseek-ai/dsh-api-story-controller/client'
import type { ContextProposal } from '@deepseek-ai/dsh-story/types'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import css from './ContextReviewPanel.module.css'

type Translate = TranslateNS<typeof NS>

/** A nonmodal review drawer. Proposals are approved only through explicit player actions. */
export function ContextReviewPanel({ story, commands, t }: { story: StoryView; commands: IStories; t: Translate }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [dirtyIds, setDirtyIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const pending = story.world.context.proposals.filter(proposal => proposal.status === 'proposed')
  const close = (): void => { setOpen(false); trigger.current?.focus() }
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [open])
  useEffect(() => { setOpen(false); setSelected([]); setDirtyIds([]); setError(null) }, [story.storyId])
  const review = async (approve: boolean): Promise<void> => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      await commands.reviewContext({ storyId: story.storyId, reviews: pending
        .filter(proposal => selected.includes(proposal.id) && !dirtyIds.includes(proposal.id))
        .map(proposal => ({ id: proposal.id, revision: proposal.revision, approve })) })
      setSelected([])
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const groups = [...new Set(pending.map(proposal => proposal.turnId))]
  return <>
    <button ref={trigger} type="button" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
      {t('retention.review')} {pending.length > 0 && <span>({pending.length})</span>}
    </button>
    {open && createPortal(<aside className={css.panel} aria-label={t('retention.review')}>
      <header className={css.header}><strong>{t('retention.review')}</strong><button type="button" onClick={close}>{t('workspace.close')}</button></header>
      <div className={css.body}>
        <p>{t('retention.explanation')}</p>
        {error !== null && <p role="alert">{error}</p>}
        <div className={css.actions}>
          <button type="button" disabled={busy || pending.length === 0} onClick={() => { setSelected(pending.filter(proposal => !dirtyIds.includes(proposal.id)).map(proposal => proposal.id)) }}>{t('retention.selectAll')}</button>
          <button type="button" disabled={busy || selected.length === 0} onClick={() => { void review(true) }}>{t('retention.approve')}</button>
          <button type="button" disabled={busy || selected.length === 0} onClick={() => { void review(false) }}>{t('retention.reject')}</button>
        </div>
        {pending.length === 0 && <p>{t('retention.empty')}</p>}
        {groups.map((group, index) => <section key={group}>
          <h3>{t('retention.group', { value: index + 1 })}</h3>
          {pending.filter(proposal => proposal.turnId === group).map(proposal => <ReviewUnit key={`${proposal.id}:${proposal.revision}`}
            onDirty={(dirty) => { setDirtyIds(ids => dirty ? [...new Set([...ids, proposal.id])] : ids.filter(id => id !== proposal.id)) }}
            proposal={proposal} story={story} commands={commands} t={t} selected={selected.includes(proposal.id)} disabled={busy}
            onSelect={(checked) => { setSelected(ids => checked ? [...ids, proposal.id] : ids.filter(id => id !== proposal.id)) }} />)}
        </section>)}
        {story.world.context.pins.length > 0 && <section>
          <h3>{t('retention.pinnedSources')}</h3>
          {story.world.context.pins.map(pin => <Source key={`${pin.scope}:${pin.sourceId}`} id={pin.sourceId} scope={pin.scope} story={story} commands={commands} t={t} />)}
        </section>}
        <h3>{t('retention.approvedNotes')}</h3>
        {story.world.context.notes.filter(note => note.status !== 'archived' && note.status !== 'superseded').map(note => <article className={css.unit} key={note.id}>
          <strong>{note.scope === 'director' ? t('retention.director') : note.scope.slice(6)}</strong>
          <span> · {t(`retention.status.${note.status}`)}</span><p>{note.text}</p>
          {note.sourceIds.map(id => <Source key={id} id={id} scope={note.scope} story={story} commands={commands} t={t} />)}
        </article>)}
      </div>
    </aside>, document.body)}
  </>
}

function ReviewUnit({ proposal, story, commands, t, selected, onSelect, disabled, onDirty }: {
  proposal: ContextProposal
  story: StoryView
  commands: IStories
  t: Translate
  selected: boolean
  onSelect: (value: boolean) => void
  disabled: boolean
  onDirty: (value: boolean) => void
}) {
  const [unit, setUnit] = useState(proposal.unit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(unit) !== JSON.stringify(proposal.unit)
  const changeUnit = (next: ContextProposal['unit']): void => {
    onSelect(false)
    onDirty(JSON.stringify(next) !== JSON.stringify(proposal.unit))
    setUnit(next)
  }
  const save = async (): Promise<void> => {
    setSaving(true); setError(null)
    try { await commands.editContext({ storyId: story.storyId, id: proposal.id, revision: proposal.revision, unit }); onDirty(false) }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setSaving(false) }
  }
  return <article className={css.unit}>
    <label><input type="checkbox" disabled={disabled || dirty || saving} checked={selected} onChange={(event) => { onSelect(event.target.checked) }} />
      {proposal.scope === 'director' ? t('retention.director') : proposal.scope.slice(6)} · {t(`retention.disposition.${unit.disposition}`)}
    </label>
    {unit.changes.map((change, index) => <label className={css.field} key={index}>
      {t(`retention.kind.${change.kind}`)} · {t(`retention.operation.${change.operation}`)}
      <textarea value={change.text} disabled={disabled || saving} onChange={(event) => {
        changeUnit({ ...unit, changes: unit.changes.map((item, i) => i === index ? { ...item, text: event.target.value } : item) })
      }} />
    </label>)}
    <label className={css.field}>{t('retention.reason')}<textarea value={unit.reason} disabled={disabled || saving} onChange={(event) => {
      changeUnit({ ...unit, reason: event.target.value })
    }} /></label>
    {dirty && <button type="button" disabled={saving || disabled} onClick={() => { void save() }}>{t('retention.save')}</button>}
    {error !== null && <p role="alert">{error}</p>}
    {proposal.unit.sourceIds.map(id => <Source key={id} id={id} scope={proposal.scope} story={story} commands={commands} t={t} />)}
  </article>
}

function Source({ id, scope, story, commands, t }: { id: string; scope: string; story: StoryView; commands: IStories; t: Translate }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pinned = story.world.context.pins.some(pin => pin.sourceId === id && pin.scope === scope)
  const source = story.world.context.sources.find(source => source.id === id)
  const act = async (operation: () => Promise<unknown>): Promise<void> => {
    setBusy(true); setError(null)
    try { await operation() } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  return <div className={css.source}>
    <button type="button" disabled={busy} onClick={() => { if (text !== null) setText(null); else void act(async () => {
      setText((await commands.contextSource({ storyId: story.storyId, sourceId: id })).text)
    }) }}>{t(text === null ? 'retention.showSource' : 'retention.hideSource')} {source === undefined ? '' : source.order + 1}</button>
    <button type="button" disabled={busy} aria-pressed={pinned} onClick={() => { void act(() => commands.pinContext({ storyId: story.storyId, sourceId: id, scope, pinned: !pinned })) }}>
      {t(pinned ? 'retention.unpin' : 'retention.pin')}
    </button>
    {error !== null && <p role="alert">{error}</p>}
    {text !== null && <pre>{text}</pre>}
  </div>
}
