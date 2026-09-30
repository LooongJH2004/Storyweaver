import { useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { StoryView } from '@deepseek-ai/dsh-api-story-controller/client'
import { NS } from './locales.ts'
import css from './RoleplayChrome.module.css'

type RoleplayMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

/** Render the roleplaying profile's portal-and-star mark. */
export function RoleplayMark({ size, className }: RoleplayMarkProps) {
  return (
    <svg
      className={className === undefined ? css.mark : `${css.mark} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path d="M6.5 24.5C8.2 18.1 11.3 11.2 16 5.5C20.7 11.2 23.8 18.1 25.5 24.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 23.5C13.6 21.8 18.4 21.8 23 23.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 10.2L17.2 13.4L20.4 14.6L17.2 15.8L16 19L14.8 15.8L11.6 14.6L14.8 13.4L16 10.2Z" fill="currentColor" />
    </svg>
  )
}

type RoleplayBrandNameProps = PropsRuntime<'sidebar.brand.name'> & PropsLocale<typeof NS>

/** Render the compact roleplaying product wordmark. */
export function RoleplayBrandName({ t }: RoleplayBrandNameProps) {
  return (
    <span className={css.brandName} aria-label={t('brand.name')}>
      <span>{t('brand.story')}</span><span className={css.brandAccent}>{t('brand.weaver')}</span>
    </span>
  )
}

type HeroHeadlineProps = PropsRuntime<'conversation.hero.headline'> & PropsLocale<typeof NS>
type HeroBadgeProps = PropsRuntime<'conversation.hero.badge'> & PropsLocale<typeof NS>
type HeroGuidanceProps = PropsRuntime<'conversation.hero.guidance'> & PropsLocale<typeof NS>

/** Replace the generic dsh hero copy without changing the stable default UI. */
export function RoleplayHeroHeadline({ t }: HeroHeadlineProps) {
  return <>{t('hero.headline')}</>
}

/** Label the cast as autonomous rather than presenting a generic preview badge. */
export function RoleplayHeroBadge({ t }: HeroBadgeProps) {
  return <>{t('hero.badge')}</>
}

/** Explain information isolation and the player's god-view authority at first glance. */
export function RoleplayHeroGuidance({ t }: HeroGuidanceProps) {
  return <p className={css.heroGuidance}>{t('hero.guidance')}</p>
}

type AuthorityBadgeProps =
  PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS>

export const CREATOR_PRESET = 'storyweaver-creator'

/** Creation tasks are identified by their durable Agent preset, not by Story ownership. */
export function isCreatorSession({ sessionId, useSessions }: Pick<AuthorityBadgeProps, 'sessionId' | 'useSessions'>): boolean {
  return useSessions(snapshot => snapshot.byId[sessionId]?.projectionValues?.agentPreset === CREATOR_PRESET)
}

/** Remind the player that they are not permanently bound to one character. */
export function AuthorityBadge({ sessionId, useSessions, t }: AuthorityBadgeProps) {
  const creator = isCreatorSession({ sessionId, useSessions })
  if (creator) {
    return (
      <div className={`${css.authority} ${css.creatorAuthority}`} title={t('creator.authorityTitle')}>
        <svg className={css.authorityGlyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
          <path d="m13.8 8.2 3 3M12 4h-1m7 11v1m-8-5H9" />
        </svg>
        <span>{t('creator.badge')}</span>
      </div>
    )
  }
  return (
    <div className={css.authority} title={t('authority.title')}>
      <span className={css.authorityStar} aria-hidden="true">✦</span>
      <span>{t('authority.badge')}</span>
    </div>
  )
}

export type RoleplayIntent = 'observe' | 'direction' | 'intervene' | 'embody'

const INTENTS = [
  { id: 'observe', label: 'intent.observe', draft: 'draft.observe' },
  { id: 'direction', label: 'intent.direction', draft: 'draft.direction' },
  { id: 'intervene', label: 'intent.intervene', draft: 'draft.intervene' },
  { id: 'embody', label: 'intent.embody', draft: 'draft.embody' },
] as const satisfies readonly {
  id: RoleplayIntent
  label: 'intent.observe' | 'intent.direction' | 'intent.intervene' | 'intent.embody'
  draft: 'draft.observe' | 'draft.direction' | 'draft.intervene' | 'draft.embody'
}[]

function IntentIcon({ intent }: { readonly intent: RoleplayIntent | 'resume' }) {
  const path = intent === 'observe'
    ? <><circle cx="12" cy="12" r="6" /><path d="M4 12h2m12 0h2" /></>
    : intent === 'direction'
      ? <><path d="M5 19 19 5" /><path d="M10 5h9v9" /></>
      : intent === 'intervene'
        ? <><path d="M12 3v18M3 12h18" /><path d="m6 6 12 12M18 6 6 18" /></>
        : intent === 'embody'
          ? <path d="m12 3 8 9-8 9-8-9 8-9Z" />
          : <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></>
  return (
    <svg className={css.intentGlyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  )
}

/** Seed one recovery protocol without destroying an existing draft. */
export function seedIntentDraft(current: string, seed: string): string {
  if (current.trim() === '') return seed
  if (current.startsWith(seed)) return current
  return `${seed}\n${current}`
}

/** Locate the Story that owns any one of its public or private Sessions. */
export function storyOwnsSession(
  story: StoryView,
  sessionId: StoryView['sceneSessionIds'][number],
): boolean {
  return story.sceneSessionIds.includes(sessionId)
    || story.controlSessionId === sessionId
    || story.actors.some(actor => actor.sessionId === sessionId)
}

type RoleplayIntentDockProps =
  PropsRuntime<'conversation.input.dock'> & PropsLocale<typeof NS> & { readonly loadActors?: (storyId: StoryView['storyId']) => Promise<readonly { actorId: string; displayName: string }[]> }

/** Select input intent and seed empty or untouched suggested drafts; preserve player edits. */
export function RoleplayIntentDock({ input, inputActions, sessionId, useStories, loadActors, t }: RoleplayIntentDockProps) {
  const story = useStories?.(snapshot => snapshot.items.find(item => storyOwnsSession(item, sessionId)))
  const [cast, setCast] = useState<readonly { actorId: string; displayName: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const suggestion = useRef<{ sessionId: typeof sessionId; text: string } | undefined>(undefined)
  useEffect(() => {
    if (story === undefined || loadActors === undefined) return
    let active = true
    void loadActors(story.storyId).then((values) => { if (active) setCast(values) }, (reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { active = false }
  }, [story?.storyId, loadActors])
  const payload = input.intent?.kind === 'storyweaver' ? input.intent.payload : undefined
  const selected = payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? payload : undefined
  const mode = selected?.mode ?? 'observe'
  const actorId = typeof selected?.actorId === 'string' ? selected.actorId : ''
  const choose = (next: RoleplayIntent, actor = actorId || cast[0]?.actorId || ''): void => {
    inputActions.setIntent({ kind: 'storyweaver', payload: next === 'embody' ? { mode: next, actorId: actor } : { mode: next } })
    const previous = suggestion.current
    if (input.draft.trim() === '' || previous?.sessionId === sessionId && input.draft === previous.text) {
      const item = INTENTS.find(intent => intent.id === next)
      if (item === undefined) return
      const text = t(item.draft)
      suggestion.current = { sessionId, text }
      inputActions.setDraft(text)
    } else {
      suggestion.current = undefined
    }
  }
  useEffect(() => {
    if (story !== undefined && input.intent === undefined) inputActions.setIntent({ kind: 'storyweaver', payload: { mode: 'observe' } })
  }, [story?.storyId, input.intent, inputActions])
  return <section className={css.intentDock} aria-label={t('intent.legend')}>
    <div className={css.intentCore}>
      <div className={css.intentIntro}><span className={css.intentLegend}>{t('intent.currentMode')}</span><span className={css.intentHint}>{t('intent.modeHint')}</span></div>
      <div className={css.intentButtons} role="group" aria-label={t('intent.legend')}>
        {INTENTS.map(intent => <button key={intent.id} type="button" className={css.intentButton}
          data-intent={intent.id} aria-pressed={mode === intent.id}
          disabled={intent.id === 'embody' && cast.length === 0}
          onClick={() => { choose(intent.id) }}><IntentIcon intent={intent.id} /><span>{t(intent.label)}</span></button>)}
      </div>
    </div>
    {mode === 'embody' && <label><span>{t('prompts.selectActor')}</span><select value={actorId} onChange={(event) => { choose('embody', event.target.value) }}>
      {cast.map(actor => <option key={actor.actorId} value={actor.actorId}>{actor.displayName}</option>)}
    </select></label>}
    {error !== null && <p role="alert">{error}</p>}
  </section>
}
