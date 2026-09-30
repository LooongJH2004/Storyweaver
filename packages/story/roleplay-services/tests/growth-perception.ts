/** Learning evidence comes from the frozen request, not every record the actor could retrieve. */
import { z } from 'zod'
import type { ActorContextView } from '@deepseek-ai/dsh-roleplay-core'

const evidenceSchema = z.object({ id: z.string(), revision: z.number().int().nonnegative(),
  kind: z.string(), content: z.string(), behavior: z.unknown().optional() }).loose()

/**
 * Read newly perceived world changes actually included in an ordinary actor request.
 * @param context - The recorded model-facing context, or no request.
 * @param afterRevision - The boundary before the learning event began.
 * @returns Fresh observations with their exact rendered content and attribution.
 */
export function growthPerceptions(context: Pick<ActorContextView, 'revision' | 'sections'> | undefined, afterRevision: number) {
  if (context === undefined) return []
  return context.sections.flatMap((section) => {
    if (section.id !== 'evidence' || !section.content.startsWith('[RECEIVED EVIDENCE ')) return []
    const item = evidenceSchema.parse(JSON.parse(section.content.slice(section.content.indexOf('\n') + 1)))
    if (!section.sources.includes(item.id)) throw new Error('Rendered perception does not match its recorded source')
    return item.kind === 'observation' && item.behavior === undefined
      && item.revision > afterRevision && item.revision <= context.revision ? [item] : []
  })
}
