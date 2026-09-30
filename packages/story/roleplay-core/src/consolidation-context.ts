/** Private source batches replace live events and retellings without requesting another performance. */
import type { RenderedContextSection } from './context-recipe.ts'

/**
 * Keep interpretation background without extending the assigned original-event batch.
 * @param sections Ordinary request sections, including authored recipe references.
 * @returns Background excluding performance direction, live events and personal-memory retellings outside the assigned batch.
 */
export function consolidationBackground(sections: readonly RenderedContextSection[]): RenderedContextSection[] {
  return sections.filter(section => !['performance', 'style', 'scene-style', 'narration-length'].includes(section.id)
    && (section.sources.includes(`recipe:${section.id}`)
      || !['evidence', 'behavior'].includes(section.id)
        && !(section.id === 'lifecycle' && section.sources.some(source => source.startsWith('memory:')))))
}
