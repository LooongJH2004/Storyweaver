/** Slot contracts for the Story library and Hero picker. */
import type { StoryId } from '@deepseek-ai/dsh-story/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/** Actions injected into the Story library surface. */
export interface StoryBrowserInjected {
  startStory: (storyId?: StoryId) => void
  createCreationTask: () => Promise<SessionId | undefined>
  openCreationTask: (sessionId: SessionId) => void
  deleteCreationTask: (sessionId: SessionId) => Promise<void>
  importStory: (source: string) => Promise<import('@deepseek-ai/dsh-api-story-controller/client').StoryView>
  newStory: (sourceStoryId: StoryId) => Promise<SessionId>
  renameStory: (storyId: StoryId, title: string) => Promise<void>
  deleteStory: (storyId: StoryId) => Promise<void>
  deleteTemplate: (templateId: string) => Promise<void>
}

/** Complete Story library props. */
export type StoryBrowserProps = PropsRuntime<'sidebar.stories'>
  & StoryBrowserInjected
  & PropsLocale<'story'>

/** Actions injected into the Hero Story picker. */
export interface StoryPickerInjected {
  createStory: (title?: string) => Promise<import('@deepseek-ai/dsh-api-story-controller/client').StoryView>
}

/** Complete Hero Story picker props. */
export type StoryPickerProps = PropsRuntime<'conversation.hero.story'>
  & StoryPickerInjected
  & PropsLocale<'story'>
