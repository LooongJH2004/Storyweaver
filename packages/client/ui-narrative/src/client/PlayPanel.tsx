/** Contextual player tools keep the story and its scroll position underneath the dialog. */
import { useEffect, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InstanceId } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import { MemoryQueuePanel } from './MemoryQueuePanel.tsx'
import { Retention } from './Retention.tsx'
import { ModelSettings } from './ModelSettings.tsx'
import { Cognition } from './Cognition.tsx'
import css from './Narrative.module.css'

/** Native modal focus containment and Escape handling preserve keyboard navigation. */
export function PlayPanel(props: NarrativeProps & {
  instanceId: InstanceId
  kind: 'memory' | 'memory-queue' | 'model' | 'person'
  actorId?: string
  close: () => void
  editPerson: (actorId: string) => void
}) {
  const { t, instanceId, kind } = props
  const [actorId, setActorId] = useState(props.actorId ?? '')
  const [error, setError] = useState('')
  const author = props.useAuthor(value => value)
  const detail = props.useInspection(value => value)
  useEffect(() => {
    if (kind !== 'model' && kind !== 'memory-queue') void props.author(instanceId, actorId || undefined).catch((error: unknown) => { setError(String(error)) })
  }, [instanceId, actorId, kind, props.author])
  const selected = detail.request?.instanceId === instanceId && detail.request.actorId === (actorId || undefined)
  return <Modal open onClose={props.close} className={`${css.nativeDialog} ${css.inspector}`} contentClassName={`${css.dialogScroll}`}
    title={t(kind === 'memory-queue' ? 'memoryQueueTitle' : kind === 'memory' ? 'retention' : kind === 'person' ? 'characters' : 'executionModelSettings')} closeLabel={t('closePanel')}>
    <div className={`${css.surface} ${css.dialogContent}`}>
      {kind === 'memory-queue' ? <MemoryQueuePanel {...props} /> : kind === 'model' ? <ModelSettings {...props} /> : <>
        <label>{t(kind === 'person' ? 'inspectPerson' : 'reviewPerspective')}
          <select aria-label={t(kind === 'person' ? 'inspectPerson' : 'reviewPerspective')} value={actorId}
            onChange={(event) => { setActorId(event.target.value) }}>
            <option value="">{t(kind === 'person' ? 'inspectPerson' : 'director')}</option>
            {author.request?.instanceId === instanceId && author.people?.entries.map(person => <option key={person.definition.actorId}
              value={person.definition.actorId}>{person.definition.displayName}</option>)}
          </select></label>
        {!selected || detail.loading ? <p role="status">{t('loading')}</p>
          : kind === 'person' ? <>
            {detail.cognition && <Cognition t={t} view={detail.cognition} />}
            <button onClick={() => { props.editPerson(actorId) }}>{t('editPerson')}</button>
          </> : <Retention key={actorId} {...props} detail={detail} showHeading={false} />}
      </>}
      {error && <p role="alert">{error}</p>}
    </div>
  </Modal>
}
