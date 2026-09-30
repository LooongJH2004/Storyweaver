/** Roleplaying-first browser presentation over generic dsh Client seams. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { IStories } from '@deepseek-ai/dsh-api-story-controller/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import {
  AuthorityBadge, RoleplayBrandName, RoleplayHeroBadge, RoleplayHeroGuidance,
  RoleplayHeroHeadline, RoleplayMark,
} from './RoleplayChrome.tsx'
import { roleplayEventView } from './RoleplayEventView.tsx'
import { actorAttemptView } from './ActorAttemptView.tsx'
import { roleplaySessionTools, roleplayStoryDock } from './RoleplayStoryDock.tsx'
import { CreatorToolCallView } from './CreatorToolCallView.tsx'
import { RoleplayTurnErrorView } from './RoleplayTurnErrorView.tsx'
import { characterStatePanel } from './CharacterStatePanel.tsx'
import { en, NS, zh, type RoleplayKey } from './locales.ts'
import { roleplayEventDefinition } from './roleplay-event-definition.ts'
import { actorAttemptDefinition } from './actor-attempt-definition.ts'

export { seedIntentDraft, type RoleplayIntent } from './RoleplayChrome.tsx'
export { directorOutlinePanel, editableDirectorOutline } from './DirectorOutlinePanel.tsx'
export {
  actorTone, eventPresentation, roleplayEventView, RoleplayEventView,
} from './RoleplayEventView.tsx'
export { RoleplayTurnErrorView } from './RoleplayTurnErrorView.tsx'
export {
  roleplayEventData, roleplayEventDefinition, type RoleplayEventData,
} from './roleplay-event-definition.ts'
export {
  actorAttemptDefinition, type ActorAttemptViewData,
} from './actor-attempt-definition.ts'
export { actorAttemptView } from './ActorAttemptView.tsx'
export type { RoleplayKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Player authority and autonomous Actor presentation copy. */
    roleplay: RoleplayKey
  }
}

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-client-ui-roleplay'

/** Required services for definitions, slots, localized copy, and palette overrides. */
export const inject = ['slots', 'locale', 'uiConversation', 'theme', 'stories', 'sessions']

const ROLEPLAY_THEME: ThemeTokenOverrides = {
  '--dsw-alias-bg-base': { light: 'rgb(252, 250, 247)', dark: 'rgb(22, 19, 28)' },
  '--dsw-specific-sidebar-fill': { light: 'rgb(246, 242, 236)', dark: 'rgb(30, 26, 37)' },
  '--dsw-specific-input-major': { light: 'rgb(255, 253, 250)', dark: 'rgb(37, 32, 45)' },
  '--dsw-specific-bubble': { light: 'rgb(241, 236, 252)', dark: 'rgb(48, 39, 64)' },
  '--dsw-alias-state-business-primary': { light: 'rgb(116, 82, 190)', dark: 'rgb(183, 148, 246)' },
  '--dsw-alias-state-business-tertiary': { light: 'rgb(239, 233, 251)', dark: 'rgb(55, 43, 75)' },
  '--dsw-alias-button-info-fill': { light: 'rgb(116, 82, 190)', dark: 'rgb(158, 121, 224)' },
  '--dsw-alias-button-info-hover': { light: 'rgb(135, 96, 207)', dark: 'rgb(178, 143, 238)' },
  '--dsw-specific-sidebar-nav-item-active-accent': { light: 'rgb(232, 223, 248)', dark: 'rgb(57, 44, 77)' },
  '--dsw-roleplay-font-story': {
    light: "Georgia, 'Noto Serif SC', 'Songti SC', serif",
    dark: "Georgia, 'Noto Serif SC', 'Songti SC', serif",
  },
  '--dsw-roleplay-accent': { light: 'rgb(116, 82, 190)', dark: 'rgb(183, 148, 246)' },
  '--dsw-roleplay-accent-ink': { light: 'rgb(79, 52, 137)', dark: 'rgb(224, 207, 252)' },
  '--dsw-roleplay-accent-soft': { light: 'rgb(240, 234, 252)', dark: 'rgb(55, 43, 75)' },
  '--dsw-roleplay-accent-border': { light: 'rgba(116, 82, 190, 0.28)', dark: 'rgba(183, 148, 246, 0.34)' },
  '--dsw-roleplay-mark-shadow': { light: 'rgba(116, 82, 190, 0.22)', dark: 'rgba(183, 148, 246, 0.2)' },
  '--dsw-roleplay-card': { light: 'rgba(255, 253, 250, 0.96)', dark: 'rgba(38, 33, 46, 0.96)' },
  '--dsw-roleplay-card-warm': { light: 'rgba(249, 242, 232, 0.96)', dark: 'rgba(43, 35, 45, 0.96)' },
  '--dsw-roleplay-card-border': { light: 'rgba(83, 63, 101, 0.14)', dark: 'rgba(226, 210, 246, 0.14)' },
  '--dsw-roleplay-card-shadow': { light: 'rgba(64, 42, 78, 0.07)', dark: 'rgba(0, 0, 0, 0.18)' },
  '--dsw-roleplay-button': { light: 'rgba(255, 255, 255, 0.62)', dark: 'rgba(255, 255, 255, 0.04)' },
  '--dsw-roleplay-player-surface': { light: 'rgb(241, 236, 252)', dark: 'rgb(48, 39, 64)' },
  '--dsw-roleplay-player-border': { light: 'rgba(116, 82, 190, 0.22)', dark: 'rgba(183, 148, 246, 0.26)' },
  '--dsw-roleplay-private-surface': { light: 'rgba(245, 239, 249, 0.72)', dark: 'rgba(45, 37, 52, 0.72)' },
  '--dsw-roleplay-private-hover': { light: 'rgba(116, 82, 190, 0.06)', dark: 'rgba(183, 148, 246, 0.08)' },
  '--dsw-roleplay-private-marker': { light: 'rgb(246, 239, 250)', dark: 'rgb(49, 40, 58)' },
  '--dsw-roleplay-private-border': { light: 'rgba(116, 82, 190, 0.2)', dark: 'rgba(183, 148, 246, 0.22)' },
  '--dsw-roleplay-meta-surface': { light: 'rgba(80, 60, 94, 0.06)', dark: 'rgba(255, 255, 255, 0.07)' },
}

/** Mount the roleplaying presentation as disposable Client contributions. */
export function apply(ctx: ClientContext): void {
  const stories = ctx.get('stories') as IStories
  const sessions = ctx.get('sessions') as ISessions
  const CharacterStatePanel = characterStatePanel(
    storyId => stories.actorStates(storyId),
    request => stories.updateActorTurningPoint(request),
    request => stories.updateState(request),
  )
  const RoleplayStoryDock = roleplayStoryDock(stories, sessions)
  const RoleplaySessionTools = roleplaySessionTools(stories, sessions)
  const requestContextCache = new Map<string, ReturnType<IStories['requestContextPreview']>>()
  const loadRequestContext = (storyId: Parameters<IStories['requestContextPreview']>[0],
    sessionId: Parameters<IStories['requestContextPreview']>[1], beforeEventSeq: number) => {
    const key = `${storyId}:${sessionId}:${String(beforeEventSeq)}`
    const cached = requestContextCache.get(key)
    if (cached !== undefined) return cached
    const request = stories.requestContextPreview(storyId, sessionId, beforeEventSeq)
    requestContextCache.set(key, request)
    void request.catch(() => {
      if (requestContextCache.get(key) === request) requestContextCache.delete(key)
    })
    return request
  }
  const StoryRoleplayEventView = roleplayEventView(
    storyId => stories.actorStates(storyId),
    loadRequestContext,
  )
  const ActorAttemptView = actorAttemptView(
    storyId => stories.actorStates(storyId),
    loadRequestContext,
  )
  ctx.uiConversation.events.register(actorAttemptDefinition)
  ctx.uiConversation.events.register(roleplayEventDefinition)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'client-ui-roleplay: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.uiConversation.overrideComposerPlaceholders(PACKAGE_NAME, {
    story: () => t('placeholder.story'),
    hero: () => t('placeholder.hero'),
    default: () => t('placeholder.default'),
  }), 'client-ui-roleplay: composer copy')
  ctx.effect(
    () => ctx.theme.overrideTokens(PACKAGE_NAME, ROLEPLAY_THEME),
    'client-ui-roleplay: palette',
  )

  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.register({ name: 'sidebar.brand.mark' }, RoleplayMark))
  ctx.slots.inject('sidebar.brand.name', () =>
    ctx.slots.register({ name: 'sidebar.brand.name', locale: NS }, RoleplayBrandName))
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark' }, RoleplayMark))
  ctx.slots.inject('conversation.hero.headline', () => ctx.slots.register({
    name: 'conversation.hero.headline',
    locale: NS,
  }, RoleplayHeroHeadline))
  ctx.slots.inject('conversation.hero.badge', () => ctx.slots.register({
    name: 'conversation.hero.badge',
    locale: NS,
  }, RoleplayHeroBadge))
  ctx.slots.inject('conversation.hero.guidance', () => ctx.slots.register({
    name: 'conversation.hero.guidance',
    locale: NS,
  }, RoleplayHeroGuidance))
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'roleplay-authority',
    order: 5,
    locale: NS,
  }, AuthorityBadge))
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'roleplay-character-state',
    order: 10,
    locale: NS,
  }, CharacterStatePanel))
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'roleplay-story-tools',
    order: 15,
    locale: NS,
  }, RoleplaySessionTools))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'roleplay-intents',
    order: -20,
    locale: NS,
  }, RoleplayStoryDock))
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'tool-call',
    locale: NS,
  }, CreatorToolCallView))
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'roleplay-event',
    locale: NS,
  }, StoryRoleplayEventView))
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'roleplay-actor-attempt',
    locale: NS,
  }, ActorAttemptView))
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'turn-error',
    priority: -10,
    locale: NS,
  }, RoleplayTurnErrorView))
}
