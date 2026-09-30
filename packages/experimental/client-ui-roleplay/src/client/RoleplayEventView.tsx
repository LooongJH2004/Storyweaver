import type {
  PropsLocale, PropsRuntime, TranslateNS,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  StoryActorStateView, StoryRequestContextPreviewValue, StoryView,
} from '@deepseek-ai/dsh-api-story-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { StoryId } from '@deepseek-ai/dsh-story/types'
import {
  MarkdownText, ReasoningDisclosure, type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useMemo, useState } from 'react'
import { NS } from './locales.ts'
import type { RoleplayEventData } from './roleplay-event-definition.ts'
import { RequestContextPreview, type RequestContextPreviewBinding } from './RequestContextPreview.tsx'
import css from './RoleplayEventView.module.css'

type RoleplayEventViewProps =
  PropsRuntime<'conversation.chat.node', 'roleplay-event'> & PropsLocale<typeof NS>

interface Presentation {
  readonly label: string
  readonly owner: string
  readonly actorId?: string
  readonly glyph: string
  readonly content: string
  readonly metadata: readonly string[]
  readonly scope: 'world' | 'private' | 'player'
}

type LoadActors = (storyId: StoryId) => Promise<readonly StoryActorStateView[]>
export type LoadRequestContext = (
  storyId: StoryId,
  sessionId: SessionId,
  beforeEventSeq: number,
) => Promise<StoryRequestContextPreviewValue>
type ResolveActor = (actorId: string) => string

interface CachedRoster {
  readonly revision: string
  readonly promise: Promise<readonly StoryActorStateView[]>
  actors?: readonly StoryActorStateView[]
}

function deliveryLabel(
  delivery: Extract<RoleplayEventData, { kind: 'speech' }>['delivery'],
  t: TranslateNS<typeof NS>,
): string {
  switch (delivery) {
    case 'spoken': return t('meta.delivery.spoken')
    case 'whispered': return t('meta.delivery.whispered')
    case 'written': return t('meta.delivery.written')
  }
}

function ownsSession(
  story: StoryView,
  sessionId: StoryView['sceneSessionIds'][number],
): boolean {
  return story.sceneSessionIds.includes(sessionId)
    || story.controlSessionId === sessionId
    || story.actors.some(actor => actor.sessionId === sessionId)
}

function actorIdOf(data: RoleplayEventData): string | undefined {
  return 'actorId' in data ? data.actorId : undefined
}

/** Stable visual tone derived from actor identity rather than transcript order. */
export function actorTone(actorId: string): number {
  let hash = 5381
  for (const character of actorId) {
    hash = (Math.imul(hash, 131) ^ (character.codePointAt(0) ?? 0)) >>> 0
  }
  return hash % 8
}

function actorInitial(displayName: string): string {
  return Array.from(displayName.trim())[0]?.toLocaleUpperCase() ?? '·'
}

/** Derive localized card chrome from one typed roleplaying event. */
export function eventPresentation(
  data: RoleplayEventData,
  t: TranslateNS<typeof NS>,
  resolveActor: ResolveActor = actorId => actorId,
): Presentation {
  switch (data.kind) {
    case 'narration':
      return {
        label: t('event.narration'), owner: t('event.narrator'), glyph: '✦', content: data.content,
        metadata: [t('meta.worldRevision', { value: data.worldRevision })], scope: 'world',
      }
    case 'actor-entered':
      return { label: t('event.actorEntered'), owner: resolveActor(data.actorId), actorId: data.actorId, glyph: '✦', content: data.content, metadata: [], scope: 'world' }
    case 'speech':
      return {
        label: t(data.origin === 'player' ? 'event.playerSpeech' : 'event.speech'),
        owner: resolveActor(data.actorId),
        actorId: data.actorId,
        glyph: '“',
        content: data.content,
        metadata: [
          deliveryLabel(data.delivery, t),
          ...(data.audience.length === 0
            ? []
            : [t('meta.audience', { names: data.audience.map(resolveActor).join('、') })]),
        ],
        scope: data.origin === 'player' ? 'player' : 'world',
      }
    case 'action':
      return {
        label: t(data.origin === 'player' ? 'event.playerAction' : 'event.action'),
        owner: resolveActor(data.actorId),
        actorId: data.actorId,
        glyph: '→',
        content: data.content,
        metadata: data.target === undefined
          ? []
          : [t('meta.target', { target: resolveActor(data.target) })],
        scope: data.origin === 'player' ? 'player' : 'world',
      }
    case 'thought':
      return { label: t('event.thought'), owner: resolveActor(data.actorId), actorId: data.actorId, glyph: '◌', content: data.content, metadata: [], scope: 'private' }
    case 'actor-reasoning':
      return { label: t('event.actorReasoning'), owner: resolveActor(data.actorId), actorId: data.actorId, glyph: '⋯', content: data.content, metadata: [], scope: 'private' }
    case 'memory':
      return {
        label: t('event.memory'),
        owner: resolveActor(data.actorId),
        actorId: data.actorId,
        glyph: '◆',
        content: data.content,
        metadata: [
          t('meta.importance', { value: data.importance }),
          ...(data.tags.length === 0 ? [] : [t('meta.tags', { tags: data.tags.join(' · ') })]),
        ],
        scope: 'private',
      }
    case 'forgotten':
      return {
        label: t('event.forgotten'),
        owner: resolveActor(data.actorId),
        actorId: data.actorId,
        glyph: '◐',
        content: data.reason ?? t('event.noReason'),
        metadata: [t('meta.memory', { id: data.memoryId })],
        scope: 'private',
      }
    case 'goal':
      return {
        label: t(data.status === 'abandoned' ? 'event.goalAbandoned' : 'event.goal'),
        owner: resolveActor(data.actorId),
        actorId: data.actorId,
        glyph: '△',
        content: data.reason === undefined ? data.content : `${data.content} — ${data.reason}`,
        metadata: [
          t('meta.priority', { value: data.priority }),
          t('meta.revision', { value: data.revision }),
        ],
        scope: 'private',
      }
    case 'intention':
      return {
        label: t('event.intention'),
        owner: resolveActor(data.actorId),
        actorId: data.actorId,
        glyph: '⌁',
        content: data.content,
        metadata: [t('meta.at', { value: data.at })],
        scope: 'private',
      }
    case 'story-direction':
      return { label: t('event.direction'), owner: t('event.player'), glyph: '↗', content: data.content, metadata: [], scope: 'player' }
    case 'world-intervention':
      return { label: t('event.worldIntervention'), owner: t('event.player'), glyph: '✦', content: data.content, metadata: [], scope: 'player' }
  }
}

function Metadata({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null
  return (
    <div className={css.metadata}>
      {items.map((item, index) => <span key={`${String(index)}:${item}`}>{item}</span>)}
    </div>
  )
}

function narrationMarkdown(content: string): string {
  return content
    .replace(/<\/p>\s*<p>/giu, '\n\n')
    .replace(/<\/?p>/giu, '')
    .replace(/<br\s*\/?>/giu, '\n')
}

function EventMarker({ owner, glyph, actorId }: {
  owner: string
  glyph: string
  actorId: string | undefined
}) {
  return (
    <span className={css.marker} aria-hidden="true" title={actorId}>
      <span className={css.avatarInitial}>{actorInitial(owner)}</span>
      <span className={css.eventGlyph}>{glyph}</span>
    </span>
  )
}

function EventHeading({ view }: { view: Presentation }) {
  return (
    <div className={css.heading}>
      <strong className={css.owner}>{view.owner}</strong>
      <span className={css.label}>{view.label}</span>
    </div>
  )
}

function NarrationContent({ content, t }: {
  content: string
  t: TranslateNS<typeof NS>
}) {
  const labels = useMemo<MarkdownLabels>(() => ({
    code: {
      copyLabel: t('markdown.codeCopy'),
      copiedLabel: t('markdown.codeCopied'),
    },
    footnotes: t('markdown.footnotes'),
  }), [t])
  return (
    <div className={css.narrationContent}>
      <MarkdownText text={narrationMarkdown(content)} labels={labels} />
    </div>
  )
}

export function RoleplayEventCard({ data, t, resolveActor, requestContext }: {
  data: RoleplayEventData
  t: TranslateNS<typeof NS>
  resolveActor?: ResolveActor
  requestContext?: RequestContextPreviewBinding
}) {
  const view = eventPresentation(data, t, resolveActor)
  const visualId = view.actorId ?? 'player'
  if (data.kind === 'actor-reasoning') {
    return (
      <div
        className={css.reasoningRow}
        data-roleplay-event={data.kind}
        data-actor-id={view.actorId}
        data-actor-tone={actorTone(visualId)}
      >
        <ReasoningDisclosure
          text={view.content}
          running={false}
          title={`${view.owner} · ${view.label}`}
          runningLabel={t('event.reasoningRunning')}
        />
        <span className={css.reasoningVisibility}>{t('event.godView')}</span>
      </div>
    )
  }
  if (view.scope === 'private') {
    return (
      <details
        className={css.privateRow}
        data-roleplay-event={data.kind}
        data-actor-id={view.actorId}
        data-actor-tone={actorTone(visualId)}
      >
        <summary className={css.privateSummary}>
          <EventMarker owner={view.owner} glyph={view.glyph} actorId={view.actorId} />
          <EventHeading view={view} />
          <span className={css.godView}>{t('event.godView')}</span>
        </summary>
        <div className={css.privateBody}>
          <p className={css.content}>{view.content}</p>
          <Metadata items={view.metadata} />
        </div>
      </details>
    )
  }
  return (
    <article
      className={css.row}
      data-scope={view.scope}
      data-roleplay-event={data.kind}
      data-presentation={data.kind === 'speech' || data.kind === 'narration'
        ? 'reading'
        : data.kind === 'action' ? 'stage-direction' : 'event'}
      data-actor-id={view.actorId}
      data-actor-tone={actorTone(visualId)}
    >
      <div className={css.markerRail}>
        <EventMarker owner={view.owner} glyph={view.glyph} actorId={view.actorId} />
        {requestContext !== undefined && <RequestContextPreview binding={requestContext} t={t} />}
      </div>
      <div className={css.card}>
        <EventHeading view={view} />
        {data.kind === 'narration'
          ? <NarrationContent content={view.content} t={t} />
          : <p className={css.content}>{view.content}</p>}
        <Metadata items={view.metadata} />
      </div>
    </article>
  )
}

/** Render one card without resolving storybook metadata. */
export function RoleplayEventView({ node, t }: RoleplayEventViewProps) {
  return <RoleplayEventCard data={node.data} t={t} />
}

/** Bind event cards to a deduplicated, revision-aware storybook character directory. */
export function roleplayEventView(loadActors: LoadActors, loadRequestContext?: LoadRequestContext) {
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

  return function StoryRoleplayEventView({ node, t, sessionId, useStories }: RoleplayEventViewProps) {
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
    }, [storyId, revision])

    const names = useMemo(
      () => new Map(actors.map(actor => [actor.actorId, actor.displayName])),
      [actors],
    )
    const resolveActor = (actorId: string): string => names.get(actorId) ?? actorId
    const eventActorId = actorIdOf(node.data)
    const actorName = eventActorId === undefined ? undefined : resolveActor(eventActorId)
    const ref = node.data.requestContext
    const requestContext = storyId === undefined || ref === undefined || loadRequestContext === undefined
      ? undefined
      : {
        load: () => loadRequestContext(
          storyId,
          ref.sessionId ?? sessionId,
          ref.beforeEventSeq,
        ),
      }

    return (
      <div className={css.resolvedEvent} data-actor-name={actorName}>
        <RoleplayEventCard
          data={node.data}
          t={t}
          resolveActor={resolveActor}
          {...requestContext === undefined ? {} : { requestContext }}
        />
      </div>
    )
  }
}
