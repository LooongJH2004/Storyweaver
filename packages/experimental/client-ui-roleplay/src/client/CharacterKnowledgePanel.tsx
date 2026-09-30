import { useEffect, useRef, useState } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { IStories, StoryCharacterWorkspaceValue } from '@deepseek-ai/dsh-api-story-controller/client'
import type { KnowledgeChange, KnowledgeEntry, StoryCharacter } from '@deepseek-ai/dsh-story/types'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import { WorkspaceCloseButton, WorkspaceDialog } from './WorkspaceDialog.tsx'
import css from './RoleplayChrome.module.css'

type Props = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS>

/** Bind the instance cast, subjective knowledge history and explicit template collection to existing Story commands. */
export function characterKnowledgePanel(stories: IStories) {
  return function CharacterKnowledgePanel({ sessionId, useStories, t }: Props) {
    const story = useStories?.(snapshot => snapshot.items.find(item => item.sceneSessionIds.includes(sessionId)))
    const template = useStories?.(snapshot => snapshot.items.find(item => item.templateOnly && item.templateId === story?.templateId))
    const [open, setOpen] = useState(false)
    const [authorView, setAuthorView] = useState(false)
    const [mode, setMode] = useState<'scene' | 'related' | 'all'>('scene')
    const [observerId, setObserver] = useState('observer')
    const [query, setQuery] = useState('')
    const [value, setValue] = useState<StoryCharacterWorkspaceValue>()
    const [person, setPerson] = useState<StoryCharacter>()
    const [definition, setDefinition] = useState('')
    const [initialKnowledge, setInitialKnowledge] = useState('[]')
    const [metadata, setMetadata] = useState({ importance: 'supporting' as 'main' | 'supporting', purpose: '', location: '', archived: false })
    const [judgment, setJudgment] = useState<KnowledgeChange>()
    const [busy, setBusy] = useState(false)
    const [status, setStatus] = useState('')
    const [error, setError] = useState('')
    const [collect, setCollect] = useState({ includeKnowledge: false, includeState: false, includeMemories: false })
    const [preview, setPreview] = useState<{ revision: string; content: string }>()
    const trigger = useRef<HTMLButtonElement>(null)
    const dirty = definition !== '' || judgment !== undefined

    useEffect(() => {
      if (!open || story === undefined) return
      let current = true
      void stories.characterWorkspace({ storyId: story.storyId, authorView, mode, observerId, query }).then(
        (result) => { if (current) setValue(result) },
        (reason: unknown) => { if (current) setError(String(reason)) },
      )
      return () => { current = false }
    }, [open, story?.storyId, story?.updatedAt, authorView, mode, observerId, query])

    const run = async (operation: () => Promise<void>) => {
      setBusy(true); setError(''); setStatus('')
      try { await operation(); setStatus(t('people.saved')) }
      catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
      finally { setBusy(false) }
    }
    const editPerson = (selected?: StoryCharacter) => {
      setPerson(selected); setPreview(undefined)
      setInitialKnowledge(JSON.stringify(selected?.definition.initialKnowledge ?? [], undefined, 2))
      setMetadata({ importance: selected?.importance ?? 'supporting', purpose: selected?.purpose ?? t('people.playerCreated'), location: selected?.location ?? '', archived: selected?.archived ?? false })
      setDefinition(JSON.stringify(selected?.definition ?? {
        actorId: '', displayName: '', appearance: '', publicPersona: '', rolePrompt: '',
        initialKnowledge: [], state: [], capabilities: ['speak', 'act', 'reflect', 'memory', 'goals'],
        privateContext: { perspective: [], coreMemories: [], goals: [], intentions: [] }, actingGuidance: {},
      }, undefined, 2))
    }
    const editKnowledge = (entry?: KnowledgeEntry) => {
      setJudgment(entry === undefined ? { id: `judgment-${randomUUID()}` as KnowledgeChange['id'], expectedRevision: 0,
        text: '', kind: 'belief', attitude: 'undecided', acquisition: 'remembered', entityRefs: [], sourceRefs: [],
        status: 'active', reason: '', replaces: [] } : { ...entry, expectedRevision: entry.revision })
    }
    if (story === undefined) return null
    const fields = definition === '' ? undefined : JSON.parse(definition) as Record<string, unknown>
    const updateField = (key: string, content: unknown) => {
      setDefinition(JSON.stringify({ ...fields, [key]: content }, undefined, 2))
      setPreview(undefined)
    }
    return <>
      <button ref={trigger} type="button" onClick={() => { setOpen(true) }}>{t('people.title')}</button>
      {open && <WorkspaceDialog label={t('people.title')} className={`${css.outlinePanel}`} storageKey="character-knowledge"
        defaultSize={{ width: 900, height: 800 }} returnFocusRef={trigger} onClose={() => { setOpen(false) }}
        resizeLabels={{ top: t('workspace.resizeTop'), right: t('workspace.resizeRight'), bottom: t('workspace.resizeBottom'), left: t('workspace.resizeLeft') }}>
        <header className={css.characterPanelHeader}><div><strong>{t('people.title')}</strong><p>{t('people.hint')}</p></div>
          <WorkspaceCloseButton label={t('workspace.close')} onClick={() => { setOpen(false) }} /></header>
        <div className={css.operationsForm}>
          <label><input type="checkbox" checked={authorView} disabled={dirty} onChange={(event) => { setAuthorView(event.target.checked); setMode(event.target.checked ? 'all' : 'scene') }} />{t('people.author')}</label>
          <label>{t('people.perspective')}<select aria-label={t('people.perspective')} value={observerId} disabled={dirty} onChange={(event) => { setObserver(event.target.value) }}>
            <option value="observer">{t('people.spectator')}</option>
            {value?.people.map(item => <option key={item.actorId} value={item.actorId}>{item.label}</option>)}
          </select></label>
          <div className={css.operationsButtonRow}>{(['scene', 'related', 'all'] as const).map(item => <button type="button" key={item} disabled={dirty} aria-pressed={mode === item} onClick={() => { setMode(item) }}>{t(`people.${item}`)}</button>)}</div>
          <label>{t('people.search')}<input value={query} disabled={dirty} onChange={(event) => { setQuery(event.target.value) }} /></label>
          <ul>{value?.people.map(item => <li key={item.actorId}>{item.label}
            {authorView && <button type="button" disabled={dirty} onClick={() => { editPerson(value.records.find(record => record.definition.actorId === item.actorId)) }}>{t('people.edit')}</button>}
          </li>)}</ul>
          {value?.next !== null && value?.next !== undefined && <button type="button" onClick={() => { void run(async () => {
            const next = await stories.characterWorkspace({
              storyId: story.storyId, observerId, authorView, mode, query, offset: value.next ?? 0,
            })
            setValue({ ...next, people: [...value.people, ...next.people], records: [...value.records, ...next.records] })
          }) }}>{t('people.more')}</button>}
          {authorView && <button type="button" disabled={dirty} onClick={() => { editPerson() }}>{t('people.create')}</button>}
          {fields !== undefined && <section>
            <p>{t('people.instance')}</p>
            <label>{t('people.importance')}<select value={metadata.importance} onChange={(event) => { setMetadata({ ...metadata, importance: event.target.value as 'main' | 'supporting' }) }}>{(['main', 'supporting'] as const).map(item => <option key={item} value={item}>{t(`people.${item}`)}</option>)}</select></label>
            {(['purpose', 'location'] as const).map(key => <label key={key}>{t(`people.${key}`)}<input value={metadata[key]} onChange={(event) => { setMetadata({ ...metadata, [key]: event.target.value }) }} /></label>)}
            <label><input type="checkbox" checked={metadata.archived} onChange={(event) => { setMetadata({ ...metadata, archived: event.target.checked }) }} />{t('people.archived')}</label>
            {(['displayName', 'appearance', 'publicPersona', 'rolePrompt'] as const).map(key => <label key={key} className={css.promptSettingsField}>{t(`people.${key}`)}<textarea aria-label={t(`people.${key}`)} value={typeof fields[key] === 'string' ? fields[key] : ''} onChange={(event) => { updateField(key, event.target.value) }} /></label>)}
            <label className={css.promptSettingsField}>{t('people.initialKnowledge')}<textarea aria-label={t('people.initialKnowledge')} value={initialKnowledge} onChange={(event) => { setInitialKnowledge(event.target.value); setPreview(undefined) }} /></label>
            <div className={css.operationsButtonRow}><button type="button" disabled={busy} onClick={() => { void run(async () => {
              if (value === undefined) return
              const next = await stories.saveCharacter({ storyId: story.storyId, expectedRevision: value.revision,
                ...(person === undefined ? {} : { actorId: person.definition.actorId }),
                definitionJson: JSON.stringify({ ...fields, initialKnowledge: JSON.parse(initialKnowledge) as unknown }), ...metadata })
              setValue(next); setDefinition(''); setPerson(undefined)
            }) }}>{t('prompts.save')}</button><button type="button" onClick={() => { setDefinition(''); setPerson(undefined); setPreview(undefined) }}>{t('prompts.cancel')}</button></div>
            {person !== undefined && template !== undefined && <details><summary>{t('people.collect')}</summary>
              <p>{t('people.collectHint')}</p>
              {(['includeKnowledge', 'includeState', 'includeMemories'] as const).map(key => <label key={key}><input type="checkbox" checked={collect[key]} onChange={(event) => { setCollect({ ...collect, [key]: event.target.checked }); setPreview(undefined) }} />{t(`people.${key}`)}</label>)}
              <button type="button" disabled={busy} onClick={() => { void run(async () => {
                if (definition !== JSON.stringify(person.definition, undefined, 2)
                  || initialKnowledge !== JSON.stringify(person.definition.initialKnowledge, undefined, 2)) {
                  throw new Error(t('people.saveBeforeCollect'))
                }
                const book = await stories.storybook(template.storyId)
                const result = await stories.collectCharacter({ storyId: story.storyId, actorId: person.definition.actorId,
                  targetStoryId: template.storyId,
                  expectedRevision: book.revision, expectedCharacterRevision: person.revision, ...collect, preview: true })
                setPreview({ revision: book.revision, content: result.storybookJson })
              }) }}>{t('people.preview')}</button>
              {preview !== undefined && <><pre>{preview.content}</pre><button type="button" disabled={busy} onClick={() => { void run(async () => {
                await stories.collectCharacter({ storyId: story.storyId, actorId: person.definition.actorId,
                  targetStoryId: template.storyId,
                  expectedRevision: preview.revision, expectedCharacterRevision: person.revision, ...collect, preview: false,
                  expectedPreviewJson: preview.content })
                setPreview(undefined)
              }) }}>{t('people.confirmCollect')}</button></>}
            </details>}
          </section>}
          {observerId !== 'observer' && <section><h3>{t('people.knowledge')}</h3>
            {value?.knowledge.entries.map(entry => <article key={entry.id}><p>{entry.label === undefined ? '' : `${entry.label} · `}{entry.text}</p><small>{t(`people.${entry.attitude}`)} · {t(`people.${entry.status}`)}</small>
              <button type="button" disabled={dirty} onClick={() => { editKnowledge(entry) }}>{t('people.correct')}</button>
              <details><summary>{t('people.history')}</summary>{value.knowledge.history.filter(item => item.id === entry.id).map(item => <p key={item.revision}>{item.revision}. {item.text} — {item.reason}<br />{item.sourceRefs.join(', ')} <button type="button" disabled={dirty} onClick={() => { editKnowledge({ ...item, revision: entry.revision, reason: t('people.compensation') }) }}>{t('people.restore')}</button></p>)}</details>
            </article>)}
            <button type="button" disabled={dirty} onClick={() => { editKnowledge() }}>{t('people.addKnowledge')}</button>
            {judgment !== undefined && <div>
              <label className={css.promptSettingsField}>{t('people.judgment')}<textarea aria-label={t('people.judgment')} value={judgment.text} onChange={(event) => { setJudgment({ ...judgment, text: event.target.value }) }} /></label>
              <label>{t('people.attitude')}<select aria-label={t('people.attitude')} value={judgment.attitude} onChange={(event) => { setJudgment({ ...judgment, attitude: event.target.value as KnowledgeChange['attitude'] }) }}>{(['believed', 'doubted', 'undecided', 'rejected'] as const).map(item => <option key={item} value={item}>{t(`people.${item}`)}</option>)}</select></label>
              <label>{t('people.recognition')}<select aria-label={t('people.recognition')} value={judgment.entityRefs[0] ?? ''} onChange={(event) => { setJudgment({ ...judgment, entityRefs: event.target.value === '' ? [] : [event.target.value as KnowledgeChange['entityRefs'][number]] }) }}><option value="">{t('people.none')}</option>{value?.encounters.map(item => <option key={item.ref} value={item.ref}>{item.label}</option>)}</select></label>
              <label>{t('people.label')}<input aria-label={t('people.label')} value={judgment.label ?? ''} onChange={(event) => { const label = event.target.value; setJudgment({ ...judgment, label, kind: label.trim() === '' ? 'belief' : 'identity' }) }} /></label>
              <label>{t('people.status')}<select aria-label={t('people.status')} value={judgment.status} onChange={(event) => { setJudgment({ ...judgment, status: event.target.value as KnowledgeChange['status'] }) }}>{(['active', 'forgotten', 'withdrawn'] as const).map(item => <option key={item} value={item}>{t(`people.${item}`)}</option>)}</select></label>
              <label>{t('people.reason')}<input aria-label={t('people.reason')} value={judgment.reason} onChange={(event) => { setJudgment({ ...judgment, reason: event.target.value }) }} /></label>
              <button type="button" disabled={busy} onClick={() => { void run(async () => { const { id, expectedRevision, text, kind, attitude, acquisition,
                entityRefs, sourceRefs, status: entryStatus, reason, label, replaces } = judgment
              setValue(await stories.updateKnowledge({ storyId: story.storyId, actorId: observerId,
                changes: [{ id, expectedRevision, text, kind, attitude, acquisition, entityRefs, sourceRefs,
                  status: entryStatus, reason, replaces, ...(label?.trim() ? { label } : {}) }] }))
              setJudgment(undefined)
              }) }}>{t('prompts.save')}</button><button type="button" onClick={() => { setJudgment(undefined) }}>{t('prompts.cancel')}</button>
            </div>}
          </section>}
          {dirty && <p role="status">{t('people.unsaved')}</p>}{status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
        </div>
      </WorkspaceDialog>}
    </>
  }
}
