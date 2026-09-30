/**
 * Pure fold for the heuristic context-composition projection: system prompt
 * and tool schemas from the newest request envelope, with model-visible
 * messages taken from an exact logged history projection when one exists and
 * otherwise from the live surface. Prices with the same shared estimator as
 * the meter service, so the figures share one heuristic vocabulary.
 */

import { z } from 'zod'
import { canonicalHeader } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { estimateMessage, estimateSystemTokens, estimateToolsTokens } from './estimate.ts'
import { foldSurfaceProjection } from './surface-projection.ts'
// Import for the `contextBreakdown` SessionProjectionStateMap key merge.
import type {} from './projection.ts'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    contextBreakdown: ContextBreakdownState
  }
}

/** Non-negative integer token count (the shared figure shape). */
const tokenCount = z.number().int().nonnegative()

/** The context-breakdown state schema and source of its inferred type. */
const contextBreakdownStateSchema = z.object({
  systemTokens: tokenCount,
  toolsTokens: tokenCount,
  messageTokens: tokenCount,
  surfaceTokens: tokenCount,
  headerMessageTokens: tokenCount,
  projectsHistory: z.boolean(),
  claim: z.object({
    start: tokenCount,
    end: tokenCount,
    tokens: tokenCount,
  }).optional(),
}).strict()
type ContextBreakdownState = z.infer<typeof contextBreakdownStateSchema>

const breakdownSchema = z.object({
  systemTokens: tokenCount,
  toolsTokens: tokenCount,
  messageTokens: tokenCount,
}).strict()

/**
 * Token-meter's context-composition projection unit.
 *
 * Envelope figures are last-wins per `request/header`. The physical surface
 * rides {@link foldSurfaceProjection}; request-owned prefix/suffix messages
 * are added once, and an exact `historyMessages` projection replaces rather
 * than supplements the physical surface. A replacement without a claim
 * preserves the previous surface total. The state remains O(1) over the
 * session's life.
 */
export const contextBreakdownProjectionDefinition = {
  key: 'contextBreakdown',
  stateVersion: 3,
  stateSchema: contextBreakdownStateSchema,
  init: (): ContextBreakdownState => ({
    systemTokens: 0,
    toolsTokens: 0,
    messageTokens: 0,
    surfaceTokens: 0,
    headerMessageTokens: 0,
    projectsHistory: false,
  }),
  apply: (state, event) => {
    const fold = foldSurfaceProjection(state.claim, event)
    let systemTokens = state.systemTokens
    let toolsTokens = state.toolsTokens
    let headerMessageTokens = state.headerMessageTokens
    let projectsHistory = state.projectsHistory
    if (event.type === 'request/header') {
      const header = canonicalHeader(event.data.header)
      systemTokens = estimateSystemTokens(header)
      toolsTokens = estimateToolsTokens(header)
      headerMessageTokens = [
        ...(header.prefixContextMessages ?? []),
        ...(header.historyMessages ?? []),
        ...(header.contextMessages ?? []),
      ].reduce((tokens, message) => tokens + estimateMessage(message), 0)
      projectsHistory = header.historyMessages !== undefined
    }
    const surfaceTokens = state.surfaceTokens + fold.deltaTokens
    const messageTokens = headerMessageTokens + (projectsHistory ? 0 : surfaceTokens)
    if (systemTokens === state.systemTokens
      && toolsTokens === state.toolsTokens
      && messageTokens === state.messageTokens
      && surfaceTokens === state.surfaceTokens
      && headerMessageTokens === state.headerMessageTokens
      && projectsHistory === state.projectsHistory
      && fold.claim === undefined
      && state.claim === undefined) return state
    return {
      systemTokens,
      toolsTokens,
      messageTokens,
      surfaceTokens,
      headerMessageTokens,
      projectsHistory,
      ...fold.claim === undefined ? {} : { claim: fold.claim },
    }
  },
  wire: {
    viewSchema: breakdownSchema,
    view: ({ systemTokens, toolsTokens, messageTokens }) => ({ systemTokens, toolsTokens, messageTokens }),
  },
} satisfies ProjectionDefinition<'contextBreakdown', ContextBreakdownState>
