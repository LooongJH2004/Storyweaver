/** Author editors consume exact-revision settings, cognition, and context query views. */
import { useEffect, useState } from 'react'
import { Requests } from './Requests.tsx'
import { Scene } from './Scene.tsx'
import type { InstanceId } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import { Style } from './Style.tsx'
import { Settings } from './Settings.tsx'
import { Planning } from './Planning.tsx'
import { ModelSettings } from './ModelSettings.tsx'
import { LiveExecution } from './LiveExecution.tsx'
import { Recipe } from './Recipe.tsx'
import { StateFields } from './StateFields.tsx'
import { Person } from './Person.tsx'
import { Cognition } from './Cognition.tsx'
import { Retention } from './Retention.tsx'
import { Extraction } from './Extraction.tsx'
import type { StoryCharacter } from '@deepseek-ai/dsh-roleplay-core/characters'
import css from './Narrative.module.css'

/** Full information is deliberately separated from the selected play audience. */
export function Author(props: NarrativeProps & { instanceId: InstanceId }) {
  const { t, instanceId } = props
  const author = props.useAuthor(value => value)
  const inspection = props.useInspection(value => value)
  const tab = props.useStore(value => value.authorTab)
  const pendingDirection = props.useStore(value => value.drafts[instanceId] ?? '')
  const setTab = props.actions.authorTab
  const savedActor = props.useStore(value => value.authorActors?.[instanceId] ?? '')
  const actorId = author.request?.instanceId === instanceId ? author.request.actorId ?? '' : savedActor
  useEffect(() => { if (author.request?.instanceId === instanceId) props.actions.authorActor(instanceId, actorId) }, [instanceId, actorId])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<StoryCharacter | 'new' | null>(null)
  useEffect(() => { void props.author(instanceId, actorId || undefined)
    .catch((value: unknown) => { setError(String(value)) }) }, [instanceId, props.author])
  const workspace = author.request?.instanceId === instanceId ? author.workspace : null
  const detail = workspace !== null && inspection.request?.instanceId === instanceId
    && inspection.request.revision === workspace.instance.revision
    && inspection.request.actorId === (actorId || undefined) ? inspection : null
  return <section className={css.editor}>
    <header className={css.workspaceHeader}><h2>{t('author')}</h2><p>{t('authorHint')}</p></header>
    <div className={css.workspaceLayout}>
      <nav className={css.workspaceNav}>{(['settings', 'characters', 'style', 'state', 'context'] as const).map(value => <button
        key={value} aria-pressed={tab === value} onClick={() => { setTab(value) }}>{t(value)}</button>)}</nav>
      <div className={css.workspaceContent}>
        <form className={css.toolbar} onSubmit={(event) => { event.preventDefault()
          void props.author(instanceId, actorId || undefined, query).catch((value: unknown) => { setError(String(value)) }) }}>
          <input aria-label={t('search')} value={query} onChange={(event) => { setQuery(event.target.value) }} /><button>{t('search')}</button>
          <select aria-label={t('characters')} disabled={author.loading} value={actorId} onChange={(event) => { const id = event.target.value
            void props.author(instanceId, id || undefined, query).catch((value: unknown) => { setError(String(value)) })
          }}><option value="">{t('director')}</option>
            {workspace?.actor !== undefined
              && !author.people?.entries.some(person => person.definition.actorId === workspace.actor?.actorId)
          && <option value={workspace.actor.actorId}>{workspace.actor.label}</option>}
            {author.people?.entries.map(person => <option key={person.definition.actorId} value={person.definition.actorId}>
              {person.definition.displayName}</option>)}</select>
        </form>
        {author.request?.instanceId === instanceId && author.people !== null
          && author.people.total > author.request.query.limit && <div className={css.toolbar}>
          <button disabled={author.loading || author.request.query.offset === 0} onClick={() => {
            const request = author.request
            if (request !== null) void props.author(instanceId, request.actorId, request.query.query,
              Math.max(0, request.query.offset - request.query.limit)).catch((value: unknown) => { setError(String(value)) })
          }}>{t('previous')}</button>
          <button disabled={author.loading || author.request.query.offset + author.request.query.limit >= author.people.total}
            onClick={() => {
              const request = author.request
              if (request !== null) void props.author(instanceId, request.actorId, request.query.query,
                request.query.offset + request.query.limit).catch((value: unknown) => { setError(String(value)) })
            }}>{t('next')}</button>
        </div>}
        {(error !== '' || author.error !== null || detail?.error) && <p role="alert">{error || author.error || detail?.error}</p>}
        {(author.loading || detail?.loading) && <p role="status">{t('loading')}</p>}
        {workspace !== null && <>
          <p>{t('revision', { revision: workspace.instance.revision })} · {t('version', { version: workspace.instance.book.version })}</p>
          {tab === 'settings' && <><Settings {...props} workspace={workspace} /><Planning {...props} workspace={workspace} />
            <ModelSettings {...props} /></>}
          {tab === 'characters' && <>
            {author.people !== null && <Scene {...props} workspace={workspace} people={author.people}
              {...actorId === '' ? {} : { actorId }} />}
            <button onClick={() => { setEditing('new') }}>{t('newPerson')}</button>
            {author.people !== null && <Extraction {...props} workspace={workspace} people={author.people} />}
            {editing !== null && <Person key={editing === 'new' ? 'new' : editing.definition.actorId} {...props} instanceId={instanceId}
              revision={workspace.instance.revision} {...editing === 'new' ? {} : { person: editing }} done={() => { setEditing(null) }} />}
            {author.people?.entries.filter(person => actorId === '' || person.definition.actorId === actorId).map(person => <article className={css.card} key={person.definition.actorId}>
              <header className={css.cardHeader}><strong>{person.definition.displayName}</strong>
                <span className={css.badge}>{t(person.importance)}</span>
                {person.archived && <span className={css.badge}>{t('record-archived')}</span>}
              </header>
              <p className={css.recordText}>{person.definition.appearance}</p>
              <p className={css.metadata}>{person.definition.publicPersona}</p>
              {person.location !== '' && <p className={css.metadata}>{t('location')} · {person.location}</p>}
              <div className={css.toolbar}>
                <button onClick={() => { setEditing(person) }}>{t('editPerson')}</button>
                <button onClick={() => { void props.author(instanceId, person.definition.actorId, query)
                  .catch((value: unknown) => { setError(String(value)) }) }}>{t('viewCognition')}</button>
              </div>
              <details className={css.disclosure}><summary>{t('rawData')}</summary><pre>{JSON.stringify(person, null, 2)}</pre></details>
            </article>)}
            {detail?.cognition && <Cognition t={t} view={detail.cognition} />}
          </>}
          {tab === 'style' && <Style key={actorId} {...props} workspace={workspace} />}
          {tab === 'state' && <>
            <StateFields key={`world:${actorId}`} t={t} owner="world" actorId={actorId} state={workspace.worldState}
              people={author.people?.entries.map(person => ({ id: person.definition.actorId, label: person.definition.displayName })) ?? []}
              save={async (changes) => { await props.world(instanceId, workspace.instance.revision,
                { summary: changes.map(change => change.reason).join('\n'), content: changes.map(change => change.reason).join('\n'),
                  state: changes, deliveries: [] })
              await props.author(instanceId, actorId || undefined)
              }} />
            {detail?.cognition && <StateFields key={`actor:${actorId}`} t={t} owner="actor" actorId={actorId} state={detail.cognition.current.dynamicState}
              people={author.people?.entries.map(person => ({ id: person.definition.actorId, label: person.definition.displayName })) ?? []}
              save={async (changes) => { await props.cognition(instanceId, workspace.instance.revision, actorId,
                { knowledge: [], lifecycle: [], state: changes })
              await props.author(instanceId, actorId)
              }} />}
          </>}
          {tab === 'context' && <><section className={css.card}>
            {actorId === '' && <label>{t('pendingPreviewDirection')}<textarea value={pendingDirection} onChange={(event) => { props.actions.draft(instanceId, event.target.value) }} /></label>}
            <button onClick={() => {
              void props.previewContext(instanceId, workspace.instance.revision, actorId || undefined, pendingDirection)
                .catch((error: unknown) => { setError(String(error)) }) }}>{t('previewPendingContext')}</button><p>{t('narrativePreviewHint')}</p>
          </section><Recipe {...props} workspace={workspace} />
          <LiveExecution {...props} instanceId={instanceId} {...actorId === '' ? {} : { actorId }} />
          {detail?.context && <section className={css.card}><h3>{t('savedPreview')}</h3>
            <p>{t('previewStats', { count: detail.context.sections.length, characters: detail.context.text.length,
              tokens: Math.ceil(detail.context.text.length / 3) })}</p>
            {detail.context.sections.map((section, index) => <details key={`${section.id}:${index}`} open>
              <summary>{index + 1}. {section.role} · {section.id} · {section.content.length}</summary>
              <small>{section.sources.join(' · ')}</small><pre>{section.content}</pre>
            </details>)}
          </section>}
          {detail?.retention && <Retention key={detail.retention.owner} {...props} detail={detail} />}
          {detail && <Requests {...props} detail={detail} />}
          </>}
        </>}
      </div></div>
  </section>
}
