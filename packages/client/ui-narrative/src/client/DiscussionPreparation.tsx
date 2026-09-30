/** Preparation evidence stays attached to the discussion, independently of public speaking. */
import type { InstanceId, PlayView } from '@deepseek-ai/dsh-roleplay-core/types'
import { useId, useState } from 'react'
import type { NarrativeProps } from './contract.ts'
import { TurnRecord } from './TurnRecord.tsx'
import css from './Narrative.module.css'

/** Preparing participants share a progress card before the public floor opens. */
export function DiscussionPreparation({ preparation, running, t, instanceId, refreshRevision, ...reads }:
Pick<NarrativeProps, 't' | 'readExecutionPage' | 'readExecutionDetail'> & {
  preparation: NonNullable<PlayView['discussionPreparation']>
  running: boolean
  instanceId: InstanceId
  refreshRevision: number
}) {
  const ready = preparation.completed === preparation.total
  const [open, setOpen] = useState(false)
  const [selected, select] = useState<string | null>(null)
  const panelId = useId()
  const actor = preparation.actors.find(actor => actor.actorId === selected)
  return <section className={css.preparation} aria-label={t('discussionPreparation')} data-discussion-id={preparation.id}>
    <details onToggle={(event) => { setOpen(event.currentTarget.open) }}>
      <summary className={css.preparationHeading}><div><strong>{t('discussionPreparation')}</strong><p>{preparation.topic}</p></div>
        <span role="status">{t(ready ? 'discussionPreparationReady' : running ? 'discussionPreparing' : 'discussionPreparationPending', preparation)}</span></summary>
      {!ready && <progress aria-label={t('discussionPreparation')} max={preparation.total} value={preparation.completed} />}
      <p>{t('discussionPreparationHint')}</p>
      {open && <><div className={css.preparationActors}>
        {preparation.actors.map(person => <button type="button" key={person.actorId} aria-controls={panelId}
          aria-expanded={selected === person.actorId} onClick={() => { select(selected === person.actorId ? null : person.actorId) }}>
          <span className={css.readyDot} data-ready={person.ready} />{person.label}
          <small>{t(person.ready ? 'preparationActorReady' : 'preparationActorPending')}</small>
        </button>)}
      </div><div id={panelId}>
        {actor !== undefined && (actor.revision === undefined ? <p>{t('preparationNotStarted')}</p> :
          <TurnRecord {...reads} key={actor.actorId} t={t} preparation embedded
            scope={{ instanceId, actorId: actor.actorId, revision: actor.revision }}
            {...actor.attempt === undefined ? {} : { attempt: actor.attempt }} live={running} refreshRevision={refreshRevision} />)}
      </div></>}
    </details>
  </section>
}
