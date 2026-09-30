/** Shared story typography for streamed drafts and accepted prose. */
import { memo, useMemo } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NarrativeProps } from './contract.ts'
import { storyMarkdown } from './story-markdown.ts'
import css from './Narrative.module.css'

/** Render story formatting without changing stored fiction or technical request records. */
export const StoryMarkdown = memo(function StoryMarkdown({ text, streaming = false, t }:
  Pick<NarrativeProps, 't'> & { text: string; streaming?: boolean }) {
  const labels = useMemo(() => ({ code: { copyLabel: t('copyText'), copiedLabel: t('copiedText') },
    footnotes: t('footnotes') }), [t])
  const formatted = useMemo(() => storyMarkdown(text), [text])
  return <div className={css.storyMarkdown} data-story-markdown>
    <MarkdownText text={formatted} streaming={streaming} labels={labels} />
  </div>
})
