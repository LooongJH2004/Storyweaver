/** Built-artifact regression for Session prompt RPCs; run after the repository build. */

import { describe, expect, it } from 'vitest'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

const artifact = new URL('../lib/typert.remote-client.js', import.meta.url)
const { TYPERT_REMOTE } = await import(artifact.href) as { TYPERT_REMOTE: TypertRemoteContribution }

describe('generated session prompt transport schema', () => {
  it('preserves the same-session rewrite anchor at the RPC boundary', () => {
    const descriptor = TYPERT_REMOTE.descriptors.find(
      candidate => candidate.id === '@deepseek-ai/dsh-api-session-controller#session/prompt',
    )
    const parameter = descriptor?.parameters[0]

    expect(parameter?.codec.mode).toBe('strict')
    if (parameter?.codec.mode !== 'strict') throw new Error('session/prompt must use a strict request codec')

    const request = {
      requestId: 'rewrite-transport-1',
      sessionId: 'session-transport-1',
      mode: 'queue' as const,
      content: [{ type: 'text' as const, text: 'rewrite this turn' }],
      clientTimeZone: 'Asia/Shanghai',
      rewriteBeforeSeq: 42,
    }

    expect(parameter.codec.schema.parse(request)).toEqual(request)
  })
})
