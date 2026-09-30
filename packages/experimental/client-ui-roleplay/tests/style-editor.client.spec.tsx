// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { IStories, StoryPromptSettingsValue, StoryView } from '@deepseek-ai/dsh-api-story-controller/client'
import { styleProfileSchema } from '@deepseek-ai/dsh-story/style'
import { StyleEditor } from '../src/client/StyleEditor.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup(); localStorage.clear() })
const t = (key: string) => zh[key as keyof typeof zh] ?? key
const profile = styleProfileSchema.parse({ kind: 'actor', guidance: { speechStyle: '简短' } })
const settings = { storyPromptRevision: 7, storybookRevision: 'book-rev', styles: {
  baselines: { 'actor:a': profile }, overrides: { profiles: {} }, sceneId: 'room',
} } as unknown as StoryPromptSettingsValue

it('preserves spaces and blank lines while typing, retains rejected drafts, and copies personal presets', async () => {
  const updateStyle = vi.fn().mockRejectedValue(new Error('Stale revision'))
  render(<StyleEditor commands={{ updateStyle } as unknown as IStories} story={{ storyId: 'story' } as StoryView}
    settings={settings} audienceKey="actor:a" scope="story" sceneOnly={false} onSaved={() => {}} t={t} />)
  const speech = screen.getByLabelText(t('style.field.speechStyle')) as HTMLTextAreaElement
  fireEvent.change(speech, { target: { value: 'I would ' } })
  expect(speech.value).toBe('I would ')
  const examples = screen.getByLabelText(t('style.field.examples')) as HTMLTextAreaElement
  fireEvent.change(examples, { target: { value: '你先走。\n\n' } })
  expect(examples.value).toBe('你先走。\n\n')
  fireEvent.click(screen.getByRole('button', { name: t('prompts.save') }))
  await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('Stale revision') })
  expect(examples.value).toBe('你先走。\n\n')
  expect(updateStyle.mock.calls[0]?.[0]).toMatchObject({ expectedStoryPromptRevision: 7,
    profile: { guidance: { examples: ['你先走。'] } } })
  fireEvent.change(screen.getByLabelText(t('style.personalName')), { target: { value: '我的角色' } })
  fireEvent.click(screen.getByRole('button', { name: t('style.savePersonal') }))
  fireEvent.change(speech, { target: { value: '新修改' } })
  fireEvent.change(screen.getByLabelText(t('style.preset')), { target: { value: 'personal:0' } })
  expect(speech.value).toBe('I would')
  expect(profile).toMatchObject({ guidance: { speechStyle: '简短' } })
})

it('sends scene instructions only to the selected audience at the loaded scene and revision', async () => {
  const updateStyle = vi.fn().mockResolvedValue(settings)
  render(<StyleEditor commands={{ updateStyle } as unknown as IStories} story={{ storyId: 'story' } as StoryView}
    settings={settings} audienceKey="actor:a" scope="story" sceneOnly onSaved={() => {}} t={t} />)
  fireEvent.change(screen.getByLabelText(t('style.sceneTitle')), { target: { value: '雨声盖过了轻声交谈。' } })
  fireEvent.click(screen.getByRole('button', { name: t('prompts.save') }))
  await waitFor(() => { expect(updateStyle).toHaveBeenCalledWith({ storyId: 'story', scope: 'scene',
    key: 'actor:a', sceneId: 'room', instruction: '雨声盖过了轻声交谈。', expectedStoryPromptRevision: 7 }) })
})
