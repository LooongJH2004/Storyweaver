import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'

export const name = 'request-history-projection-fixture'

/** Snapshot-only policy: retain the complete current turn while preserving the full Session surface. */
export function apply(ctx: Context): void {
  ctx.on('agent/request-history', ({ agent, messages, turn }) => {
    const turnStart = agent.session.events.findLast(event =>
      event.type === 'turn/start' && event.data.turn === turn)
    if (turnStart === undefined) throw new Error(`turn ${turn} has no durable start`)
    const currentIds = new Set(agent.session.events.slice(turnStart.seq + 1).flatMap((event) => {
      if (event.type === 'user/message') return [event.data.id]
      if (event.type === 'assistant/message') return [event.data.message.id]
      if (event.type === 'tool/result') return [event.data.message.id]
      return []
    }))
    return Promise.resolve(messages.filter(message => currentIds.has(message.id)))
  })
}
