/** Install Story navigation, the sidebar Story library, and Hero Story picker. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IStories, StorySnapshot } from '@deepseek-ai/dsh-api-story-controller/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-story-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { StoryBrowserInjected, StoryPickerInjected } from './contract.ts'
import { StoryBrowser } from './StoryBrowser.tsx'
import { StoryPicker } from './StoryPicker.tsx'
import { UiStoryService } from './navigation.ts'
import { en, zh, type StoryUiKey } from './locales.ts'

export type { StoryBrowserInjected, StoryBrowserProps, StoryPickerInjected, StoryPickerProps } from './contract.ts'
export { UiStoryService } from './navigation.ts'
export type { UiStory } from './navigation.ts'
export type { StoryUiKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface GlobalStandardProps {
    /** Selector over path-free Story metadata. */
    useStories?: SnapshotSelectorHook<StorySnapshot>
  }
  interface LocaleNamespaceMap {
    /** Story library and picker vocabulary. */
    story: StoryUiKey
  }
}

const NS = 'story'

/** Required browser services. */
export const inject = [
  'slots', 'sessions', 'stories', 'locale', 'remote', 'remote.directoryPicker',
]

/** Register the Story product surfaces. */
export function apply(ctx: Context): void {
  const sessions = ctx.get('sessions') as ISessions
  const stories = ctx.get('stories') as IStories
  const navigation = new UiStoryService(ctx, stories, sessions, ctx.remote.directoryPicker)
  ctx.slots.provideRoot({ hooks: { stories: stories.list } })
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-story: dictionaries')

  ctx.slots.inject('sidebar.stories', () => ctx.slots.register({
    name: 'sidebar.stories',
    locale: NS,
    inject: (): StoryBrowserInjected => ({
      startStory: (storyId) => { navigation.startStory(storyId) },
      createCreationTask: () => navigation.createCreationTask(),
      openCreationTask: (sessionId) => { navigation.openCreationTask(sessionId) },
      deleteCreationTask: sessionId => navigation.deleteCreationTask(sessionId),
      importStory: source => navigation.importStory(source),
      newStory: storyId => navigation.newStory(storyId),
      renameStory: (storyId, title) => navigation.renameStory(storyId, title),
      deleteStory: storyId => navigation.deleteStory(storyId),
      deleteTemplate: templateId => navigation.deleteTemplate(templateId),
    }),
  }, StoryBrowser))

  ctx.slots.inject('conversation.hero.story', () => ctx.slots.register({
    name: 'conversation.hero.story',
    locale: NS,
    inject: (): StoryPickerInjected => ({
      createStory: title => navigation.createStory(title),
    }),
  }, StoryPicker))
}
