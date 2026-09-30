/** Response reconstruction belongs to Harness and uses the canonical chunk assembler. */
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ExecutionResponseView } from '@deepseek-ai/dsh-roleplay-core/types'

/** Read one request's chunks without consuming a subsequent retry or turn.
 * @param events - retained execution events in sequence order.
 * @param requestId - indexed header sequence or first response-chunk sequence.
 * @returns recorded output and its actual completion state; no fictional acceptance is inferred.
 */
export function executionResponse(events: readonly SessionEvent[], requestId: number): ExecutionResponseView {
  const assembler = new BlockAssembler()
  let count = 0
  let finishReason: string | undefined
  for (const event of events) {
    if (event.seq < requestId) continue
    if (event.seq > requestId && ['request/header', 'roleplay/execution-request', 'step/start'].includes(event.type)) break
    if (event.type !== 'assistant/chunk') continue
    assembler.push(event.data.chunk); count++
    if (event.data.chunk.type === 'finish') { finishReason = event.data.chunk.reason.kind; break }
  }
  const blocks = assembler.blocks()
  return { state: finishReason === undefined ? count === 0 ? 'pending' : 'streaming' : 'finished',
    text: blocks.filter(block => block.type === 'text').map(block => block.text).join('\n'),
    reasoning: blocks.filter(block => block.type === 'reasoning').map(block => block.text).join('\n'),
    toolCalls: blocks.filter(block => block.type === 'tool-call').map(block => ({ id: block.id, name: block.name, arguments: block.arguments })),
    ...(finishReason === undefined ? {} : { finishReason }) }
}
