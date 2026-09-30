/** Hero Story picker with no filesystem concepts. */
import { useCallback, useState } from 'react'
import { IconFolderOpen16, IconPlusOutline16, Menu, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StoryId } from '@deepseek-ai/dsh-story/types'
import type { StoryPickerProps } from './contract.ts'

const NEW_STORY = '::new-story'

/** Render the menu anchored to the Conversation-owned Story chip. */
export function StoryPicker({ open, anchorRef, selectedId, onPick, onClose, createStory, useStories, t }: StoryPickerProps) {
  if (useStories === undefined) throw new Error('ui-story: Story root hook unavailable')
  const stories = useStories(value => value)
  const [busy, setBusy] = useState(false)
  const getAnchorRect = useCallback(() => anchorRef?.current?.getBoundingClientRect() ?? null, [anchorRef])
  const items: MenuEntry[] = stories.items.map(story => ({
    id: story.storyId,
    label: story.title,
    icon: <IconFolderOpen16 size={16} />,
  }))
  if (stories.phase === 'loading' && items.length === 0) {
    items.push({ id: '::loading', label: t('picker.loading'), disabled: true })
  }
  const footer: MenuEntry[] = [{
    id: NEW_STORY,
    label: t('story.new'),
    icon: <IconPlusOutline16 size={16} />,
    disabled: busy,
  }]
  return (
    <Menu
      open={open}
      anchor={<span />}
      items={items}
      footer={footer}
      selectedId={selectedId}
      portal
      getAnchorRect={getAnchorRect}
      onClose={onClose}
      onSelect={(id) => {
        if (id !== NEW_STORY) {
          onPick(id as StoryId)
          return
        }
        setBusy(true)
        void createStory(t('story.untitled')).then(
          (story) => { onPick(story.storyId) },
          () => {},
        ).finally(() => { setBusy(false) })
      }}
    />
  )
}
