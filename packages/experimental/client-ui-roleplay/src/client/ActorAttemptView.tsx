import type { StoryActorStateView, StoryView } from '@deepseek-ai/dsh-api-story-controller/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { StoryId } from '@deepseek-ai/dsh-story/types'
import { ReasoningDisclosure } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useMemo, useState } from 'react'
import { NS } from './locales.ts'
import { actorTone, RoleplayEventCard, type LoadRequestContext } from './RoleplayEventView.tsx'
import css from './RoleplayEventView.module.css'

type AttemptViewProps = PropsRuntime<'conversation.chat.node', 'roleplay-actor-attempt'> & PropsLocale<typeof NS>
type LoadActors = (storyId: StoryId) => Promise<readonly StoryActorStateView[]>

interface CachedRoster {
  readonly revision: string
  readonly promise: Promise<readonly StoryActorStateView[]>
  actors?: readonly StoryActorStateView[]
}

function ownsSession(story: StoryView, sessionId: StoryView['sceneSessionIds'][number]): boolean {
  return story.sceneSessionIds.includes(sessionId)
    || story.controlSessionId === sessionId
    || story.actors.some(actor => actor.sessionId === sessionId)
}

function actorInitial(displayName: string): string {
  return Array.from(displayName.trim())[0]?.toLocaleUpperCase() ?? '·'
}

/** Bind grouped Actor attempts to the same revision-aware character directory as ordinary roleplay events. */
export function actorAttemptView(loadActors: LoadActors, loadRequestContext?: LoadRequestContext) {
  const rosters = new Map<StoryId, CachedRoster>()
  const roster = (storyId: StoryId, revision: string): CachedRoster => {
    const cached = rosters.get(storyId)
    if (cached?.revision === revision) return cached
    const next: CachedRoster = {
      revision,
      promise: loadActors(storyId).then((actors) => {
        next.actors = actors
        return actors
      }),
    }
    rosters.set(storyId, next)
    return next
  }

  return function ActorAttemptView({ node, t, sessionId, useStories }: AttemptViewProps) {
    const story = useStories?.(snapshot => snapshot.items.find(item => ownsSession(item, sessionId)))
    const storyId = story?.storyId
    const revision = story?.updatedAt ?? ''
    const cachedActors = storyId === undefined ? undefined : rosters.get(storyId)?.actors
    const [actors, setActors] = useState<readonly StoryActorStateView[]>(cachedActors ?? [])

    useEffect(() => {
      let current = true
      if (storyId === undefined) {
        setActors([])
        return () => { current = false }
      }
      const entry = roster(storyId, revision)
      if (entry.actors !== undefined) setActors(entry.actors)
      void entry.promise.then(
        (value) => { if (current) setActors(value) },
        () => { if (current) setActors([]) },
      )
      return () => { current = false }
    }, [revision, storyId])

    const names = useMemo(() => new Map(actors.map(actor => [actor.actorId, actor.displayName])), [actors])
    const resolveActor = (actorId: string): string => node.data.perspectiveLabels?.[actorId] ?? (node.data.displayLabel === undefined ? names.get(actorId) ?? actorId : t('people.unidentified'))
    const actorName = node.data.displayLabel ?? resolveActor(node.data.actorId)
    return (
      <article
        className={css.actorAttempt}
        data-status={node.data.status}
        data-actor-id={node.data.actorId}
        data-actor-tone={actorTone(node.data.actorId)}
      >
        <header className={css.actorAttemptSummary}>
          <span className={css.actorAttemptAvatar} aria-hidden="true">{actorInitial(actorName)}</span>
          <span className={css.actorAttemptSummaryCopy}>
            <span className={css.actorAttemptTitleLine}>
              <strong>{actorName}</strong>
              <span>{t(`event.actorAttemptStatus.${node.data.status}`)}</span>
              {node.data.reasoning.length > 0 && <span>{t('event.actorReasoningCount', { value: node.data.reasoning.length })}</span>}
            </span>
          </span>
        </header>
        <div className={css.actorAttemptBody}>
          {node.data.reasoning.length === 1 && (
            <section className={css.actorAttemptReasoning} aria-label={t('event.actorReasoningList')}>
              {node.data.reasoning.map((reasoning, index) => (
                <ReasoningDisclosure
                  key={reasoning.id}
                  text={reasoning.content}
                  running={reasoning.running}
                  title={t('event.actorReasoningItem', { value: index + 1 })}
                  runningLabel={t('event.reasoningRunning')}
                />
              ))}
            </section>
          )}
          {node.data.reasoning.length > 1 && (
            <details className={css.actorAttemptReasoningGroup}>
              <summary>{t('event.actorReasoningCount', { value: node.data.reasoning.length })}</summary>
              <section className={css.actorAttemptReasoning} aria-label={t('event.actorReasoningList')}>
                {node.data.reasoning.map((reasoning, index) => (
                  <ReasoningDisclosure
                    key={reasoning.id}
                    text={reasoning.content}
                    running={reasoning.running}
                    title={t('event.actorReasoningItem', { value: index + 1 })}
                    runningLabel={t('event.reasoningRunning')}
                  />
                ))}
              </section>
            </details>
          )}
          {node.data.drafts.length > 0 && (
            <div className={css.actorAttemptStreamingList} aria-live="polite">
              {node.data.drafts.map(draft => (
                <article key={draft.id} className={css.actorAttemptStreaming} data-kind={draft.kind}>
                  <strong>{t(draft.kind === 'speech' ? 'event.actorStreamingSpeech' : 'event.actorStreamingAction')}</strong>
                  <p>{draft.content}{draft.running && <span aria-hidden="true" />}</p>
                </article>
              ))}
            </div>
          )}
          {node.data.events.length > 0 && (
            <div className={css.actorAttemptEvents}>
              {node.data.events.map((event, index) => {
                const ref = event.requestContext
                const requestContext = storyId === undefined
                  || ref === undefined
                  || loadRequestContext === undefined
                  ? undefined
                  : {
                    load: () => loadRequestContext(
                      storyId,
                      ref.sessionId ?? sessionId,
                      ref.beforeEventSeq,
                    ),
                  }
                return (
                  <RoleplayEventCard
                    key={`${event.kind}:${String(index)}`}
                    data={event}
                    t={t}
                    resolveActor={id => id === node.data.actorId ? actorName : resolveActor(id)}
                    {...requestContext === undefined ? {} : { requestContext }}
                  />
                )
              })}
            </div>
          )}
          {node.data.failure !== undefined && (
            <p className={css.actorAttemptFailure} role="alert">{node.data.failure.code}: {node.data.failure.message}</p>
          )}
        </div>
      </article>
    )
  }
}
