/** Portable request bodies are adapter evidence and never become active execution sessions. */
import { z } from 'zod'
import type { ExecutionHistoryScope, ExecutionRequestSummary, Json } from '@deepseek-ai/dsh-roleplay-core/types'

/** The exporter records original ownership and coordinates beside the sender's serialized input. */
export const portableRequestSchema = z.strictObject({
  format: z.literal('harness-request-evidence-v1'),
  instanceId: z.string().min(1), actorId: z.string().min(1).optional(),
  request: z.strictObject({ requestId: z.number().int().nonnegative(), attempt: z.string(),
    revision: z.number().int().nonnegative(), configurationRevision: z.number().int().nonnegative(),
    turn: z.number().int().nonnegative(), step: z.number().int().nonnegative(), provider: z.string(), model: z.string(),
    status: z.enum(['prepared', 'response-recorded']), turnRequestCount: z.number().int().nonnegative().optional(),
    turnTiming: z.strictObject({ ttftMs: z.number().nonnegative().optional(),
      tokensPerSecond: z.number().nonnegative().optional() }).optional(),
    turnUsage: z.strictObject({ uncachedInputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(), cacheReadTokens: z.number().int().nonnegative().optional(),
      cacheWriteTokens: z.number().int().nonnegative().optional(), reasoningTokens: z.number().int().nonnegative().optional(),
      routes: z.array(z.strictObject({ provider: z.string(), model: z.string() })).optional() }).optional() }),
  body: z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('recorded'), json: z.string() }),
    z.strictObject({ kind: z.literal('unavailable'), reason: z.string() })]),
  response: z.strictObject({ state: z.enum(['pending', 'streaming', 'finished']), text: z.string(), reasoning: z.string(),
    toolCalls: z.array(z.strictObject({ id: z.string(), name: z.string(), arguments: z.string() })),
    finishReason: z.string().optional() }).optional(),
})

/** Select archived bodies only after the application supplies one instance's evidence.
 * @param scope - requested character or director and narrative revision.
 * @param evidence - records already isolated by their destination instance.
 * @returns recognized request evidence; full Session logs remain opaque to this index.
 */
export function portableRequests(scope: ExecutionHistoryScope, evidence: readonly { id: string; content: Json }[]): {
  summary: ExecutionRequestSummary
  body: z.infer<typeof portableRequestSchema>['body']
  response: z.infer<typeof portableRequestSchema>['response']
}[] {
  return evidence.flatMap((item) => {
    if (item.content === null || Array.isArray(item.content) || typeof item.content !== 'object'
      || item.content.format !== 'harness-request-evidence-v1') return []
    const value = portableRequestSchema.parse(item.content)
    if (value.actorId !== scope.actorId || value.request.revision > scope.revision) return []
    const { turnUsage, turnRequestCount, turnTiming, ...request } = value.request
    const timing = turnTiming === undefined ? undefined : {
      ...(turnTiming.ttftMs === undefined ? {} : { ttftMs: turnTiming.ttftMs }),
      ...(turnTiming.tokensPerSecond === undefined ? {} : { tokensPerSecond: turnTiming.tokensPerSecond }),
    }
    const usage = turnUsage === undefined ? undefined
      : Object.fromEntries(Object.entries(turnUsage).filter(([, value]) => value !== undefined)) as unknown as ExecutionRequestSummary['turnUsage']
    return [{ summary: { ...request, evidenceId: item.id,
      ...(usage === undefined ? {} : { turnUsage: usage }), ...(turnRequestCount === undefined ? {} : { turnRequestCount }),
      ...(timing === undefined ? {} : { turnTiming: timing }) },
    body: value.body, response: value.response }]
  })
}
