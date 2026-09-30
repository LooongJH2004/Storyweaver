/** Accepted fiction is grouped by published character turn; diagnostics stay explicitly player-owned. */
import { Fragment, useState } from 'react'
import { TurnRecord } from './TurnRecord.tsx'
import { DiscussionPreparation } from './DiscussionPreparation.tsx'
import { Modal, IconCopyOutline16, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import { StoryMarkdown } from './StoryMarkdown.tsx'
import { storyMarkdown } from './story-markdown.ts'
import type { PlayView, PlayRow } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import { PersonLabel } from './PersonLabel.tsx'
import { Requests } from './Requests.tsx'
import { TurnUsage } from './TurnUsage.tsx'
import css from './Narrative.module.css'

/** Keep adjacent speech and actions in the same committed turn, without merging different revisions. */
export function Transcript(props: NarrativeProps & { view: PlayView; completionVersion?: number }) {
  const { view, t } = props
  const inspection = props.useInspection(value => value)
  const page = props.usePlay(value => value.request)
  const [opened, setOpened] = useState<{ row: PlayRow; tab: 'reasoning' | 'messages' } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<{ id: string; text: string } | null>(null)
  const groups: [PlayRow, ...PlayRow[]][] = []
  for (const row of view.rows) {
    const previous = groups.at(-1)
    if (previous?.[0]?.revision === row.revision && previous[0].speaker?.ref === row.speaker?.ref
      && previous[0].kind !== 'narration' && row.kind !== 'narration'
      && previous[0].kind !== 'direction' && row.kind !== 'direction') previous.push(row)
    else groups.push([row])
  }
  const selected = opened !== null && inspection.request?.instanceId === view.instanceId
    && inspection.request.revision === opened.row.revision
    && inspection.request.actorId === opened.row.speaker?.actorId
  const inspect = (row: PlayRow, tab: 'reasoning' | 'messages') => {
    setOpened({ row, tab }); void props.inspectTurn(view.instanceId, row.revision, row.speaker?.actorId)
  }
  const preparations = view.discussionPreparations ?? (view.discussionPreparation === undefined ? [] : [view.discussionPreparation])
  const preparationAt = (index: number) => preparations.filter((item) => {
    const boundary = item.beforeRevision ?? view.revision + 1
    if ((page?.offset ?? 0) > 0 && boundary < (view.rows[0]?.revision ?? 0)) return false
    if (page !== null && page.offset + page.limit < view.total && boundary > (view.rows.at(-1)?.revision ?? 0)) return false
    const target = groups.findIndex(group => group[0].revision >= boundary)
    return (target === -1 ? groups.length : target) === index
  }).map(item => <DiscussionPreparation {...props} key={item.id} preparation={item}
    instanceId={view.instanceId} refreshRevision={props.completionVersion ?? view.revision}
    running={view.discussion?.id === item.id && ['director-preparing', 'character-responding', 'discussion-running'].includes(view.phase)} />)
  return <><article className={css.prose}>{groups.map((rows, groupIndex) => {
    const first = rows[0]
    const nextBoundary = groups.slice(groupIndex + 1).find(group => group[0].kind === 'direction' || group[0].speaker?.actorId !== undefined)?.[0]
    const dispatchRevision = nextBoundary === undefined ? view.revision : nextBoundary.revision - (nextBoundary.kind === 'direction' ? 1 : 0)
    if (first.kind === 'direction') return <Fragment key={first.id}>
      {preparationAt(groupIndex)}
      <PlayerDirection {...props} row={first} />
      <TurnRecord {...props} director scope={{ instanceId: view.instanceId, revision: dispatchRevision }}
        refreshRevision={nextBoundary === undefined ? props.completionVersion ?? 0 : 0} />
    </Fragment>
    const speaker = first.speaker
    const identity = speaker?.actorId ?? speaker?.ref ?? 'director'
    let tone = 5381
    for (const character of identity) tone = (Math.imul(tone, 131) ^ (character.codePointAt(0) ?? 0)) >>> 0
    tone %= 8
    return <Fragment key={first.id}>{preparationAt(groupIndex)}{groupIndex === 0 && <TurnRecord {...props} director
      scope={{ instanceId: view.instanceId, revision: first.revision }} />}
    <section className={css.turn} data-tone={tone} data-narrator={speaker === undefined}>
      <div className={css.turnBody}>
        <header className={css.turnHeader}>
          {speaker === undefined ? <strong>{t(first.kind === 'perception' ? 'perception' : 'director')}</strong>
            : <PersonLabel person={speaker} nameFirst />}
          {first.origin === 'player' && <span className={css.badge}>{t('playerPerformance')}</span>}
        </header>
        {first.origin !== 'player' && first.kind !== 'perception' && <TurnRecord {...props}
          scope={{ instanceId: view.instanceId, revision: first.revision,
            ...(speaker?.actorId === undefined ? {} : { actorId: speaker.actorId }) }}
          refreshRevision={props.completionVersion ?? 0} />}
        {rows.map(row => <div key={row.id} className={css.turnRow} data-kind={row.kind}>
          <small>{t(row.perception ?? row.kind)}</small>
          <StoryMarkdown text={row.text} t={t} />
          {row.recognizedAs !== undefined && <small>{t('recognized', { name: row.recognizedAs })}</small>}
        </div>)}
        <div className={css.turnActions}><button aria-label={t(copied === first.id ? 'copiedText' : 'copyText')}
          title={t(copied === first.id ? 'copiedText' : 'copyText')} onClick={() => {
            setCopyError(null); void writeClipboard(rows.map(row => storyMarkdown(row.text)).join('\n\n')).then((success) => {
              if (success) setCopied(first.id)
              else setCopyError({ id: first.id, text: t('copyFailed') })
            })
              .catch((error: unknown) => { setCopyError({ id: first.id, text: String(error) }) })
          }}><IconCopyOutline16 />{t('copyText')}</button>
        {first.origin !== 'player' && first.kind !== 'perception' && <>
          <button onClick={() => { inspect(first, 'messages') }}>{t('openOriginalContext')}</button>
        </>}
        {copied === first.id && <span role="status">{t('copiedText')}</span>}</div>
        {copyError?.id === first.id && <p role="alert">{copyError.text}</p>}
        {first.origin !== 'player' && first.kind !== 'perception' && <TurnUsage {...props} instanceId={view.instanceId}
          revision={first.revision} {...speaker?.actorId === undefined ? {} : { actorId: speaker.actorId }}
          refreshRevision={props.completionVersion ?? 0}
          settled={!['director-preparing', 'character-responding', 'discussion-running'].includes(view.phase)} />}
      </div>
    </section></Fragment>
  })}{preparationAt(groups.length)}</article>
  {opened && <Modal open onClose={() => { setOpened(null) }} className={`${css.requestDialog} ${css.inspector}`} contentClassName={`${css.dialogScroll}`}
    title={`${opened.row.speaker?.trueName ?? opened.row.speaker?.label ?? t('director')} · ${t('revision', { revision: opened.row.revision })}`} closeLabel={t('closePanel')}>
    <div className={`${css.surface} ${css.requestDialogContent}`}>
      {inspection.loading ? <p role="status">{t('loading')}</p> : inspection.error !== null ? <p role="alert">{inspection.error}
        <button onClick={() => { inspect(opened.row, opened.tab) }}>{t('refresh')}</button></p>
        : selected ? <Requests {...props} detail={inspection} initialTab={opened.tab} /> : <p>{t('noRequests')}</p>}
    </div>
  </Modal>}</>
}

/** Rewriting appends a restoration and a new turn; the original remains reviewable. */
function PlayerDirection(props: NarrativeProps & { view: PlayView; row: PlayRow }) {
  const { t, view, row } = props
  const request = props.usePlay(value => value.request)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(row.text)
  const [revision, setRevision] = useState(view.revision)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <section className={css.playerDirection}>
    <small>{t('direction')}</small><p>{row.text || t('continue')}</p>
    <div className={css.toolbar}>
      <button disabled={busy || request?.revision !== undefined} onClick={() => { setEditing(true); setRevision(view.revision) }}>{t('editDirection')}</button>
      <button disabled={busy} onClick={() => { void props.history(view.instanceId, request?.audience ?? { kind: 'observer' }, row.revision)
        .then(() => { props.actions.panel('history') },
          (error: unknown) => { setError(String(error)) }) }}>{t('viewMessageVersion')}</button>
    </div>
    {editing && <form onSubmit={(event) => { event.preventDefault(); setBusy(true); setError('')
      void props.rewriteDirection(view.instanceId, revision, row.revision, text).then(() => { setEditing(false) },
        (error: unknown) => { setError(String(error)) })
        .finally(() => { setBusy(false) })
    }}><p>{t('rewriteHint')}</p><textarea aria-label={t('editDirection')} value={text} disabled={busy} onChange={(event) => { setText(event.target.value) }} />
      <button disabled={busy}>{t('rewriteDirection')}</button><button type="button" disabled={busy} onClick={() => { setEditing(false) }}>{t('cancel')}</button>
    </form>}
    {error !== '' && <p role="alert">{error}</p>}
  </section>
}
