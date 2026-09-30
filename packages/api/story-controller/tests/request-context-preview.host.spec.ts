import { HarnessRequestHistory } from '@deepseek-ai/dsh-experimental-actor/request-history'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { StoryId, type Story } from '@deepseek-ai/dsh-story'
import { createUserMessage, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { serializeRequest } from '@deepseek-ai/dsh-llm-deepseek/src/serialize.ts'
import type { WireRequest } from '@deepseek-ai/dsh-llm-deepseek'
import StoryController from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

function harness(live: boolean, withMessages = false) {
  const session = Session.create(SessionId('preview-actor'))
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('request/header', {
    reason: 'initial', header: {
      config: { provider: 'mock', model: 'actor-model' },
      system: 'Original actor policy',
      prefixContextMessages: withMessages ? [createUserMessage({
        content: [{ type: 'text', text: 'AUTHORED' }], source: { kind: 'user' },
      })] : [],
      historyMessages: withMessages ? [createUserMessage({
        content: [{ type: 'text', text: 'HISTORY' }], source: { kind: 'user' },
      })] : [],
      contextMessages: withMessages ? [createUserMessage({
        content: [{ type: 'text', text: 'DYNAMIC' }], source: { kind: 'user' },
      })] : [],
      tools: [{ name: 'npc_commit_turn', description: 'Commit behavior', parameters: { type: 'object' } }],
    },
  })
  const request = {
    storyId: StoryId('story-12345678-1234-4123-8123-123456789abc'),
    sessionId: session.id, beforeEventSeq: session.events.length,
  }
  session.append('request/header', {
    reason: 'change', header: { config: { provider: 'mock', model: 'later' }, system: 'Later policy' },
  })
  const story = { id: request.storyId, sessions: [{ sessionId: session.id }] } as unknown as Story
  const inspect = vi.fn().mockResolvedValue({ events: session.events })
  const get = vi.fn().mockReturnValue(live ? session : undefined)
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('storyRegistry', { list: () => [], get: (id: string) => id === story.id ? story : undefined } as never)
  ctx.provide('storyHome', {} as never)
  ctx.provide('sessions', { get } as never)
  ctx.provide('sessionPersistence', { inspect } as never)
  const reconstructRequest = vi.fn((options: GenerateOptions) => JSON.stringify(serializeRequest(options)))
  ctx.provide('llm', { reconstructRequest } as never)
  ctx.provide('typert', {
    lookups: { configure: () => () => undefined },
    contexts: { configureHost: () => () => undefined },
  } as never)
  new HarnessRequestHistory(ctx)
  return { controller: new StoryController(ctx), inspect, get, request, reconstructRequest }
}

describe('producing request context inspection', () => {
  it.each([true, false])('reconstructs the original boundary with live=%s without starting an Actor', async (live) => {
    const { controller, inspect, request } = harness(live)
    const preview = await controller.requestContextPreview(request)
    expect(preview).toMatchObject({
      sessionId: request.sessionId, beforeEventSeq: 3, headerSeq: 2,
      turn: 1, step: 1, model: 'actor-model',
    })
    const sent = JSON.parse(preview.requestJson) as WireRequest
    expect(sent.messages).toEqual([{ role: 'system', content: 'Original actor policy' }])
    expect(sent.tools).toHaveLength(1)
    expect(inspect).toHaveBeenCalledTimes(live ? 0 : 1)
    if (!live) expect(inspect).toHaveBeenCalledWith(request.sessionId)
  })

  it.each([true, false])('preserves dispatch order and independent fields with live=%s', async (live) => {
    const { controller, request, reconstructRequest } = harness(live, true)
    const preview = await controller.requestContextPreview(request)
    const sent = JSON.parse(preview.requestJson) as WireRequest
    expect(Object.keys(sent)).toEqual(['model', 'messages', 'stream', 'stream_options', 'tools'])
    expect(sent.messages).toMatchInlineSnapshot(`
      [
        {
          "content": "Original actor policy",
          "role": "system",
        },
        {
          "content": "AUTHORED",
          "role": "user",
        },
        {
          "content": "HISTORY",
          "role": "user",
        },
        {
          "content": "DYNAMIC",
          "role": "user",
        },
      ]
    `)
    expect(reconstructRequest).toHaveBeenCalledOnce()
    expect(preview.requestJson).toBe(reconstructRequest.mock.results[0]?.value)
    expect(preview.requestJson).not.toContain('Later policy')
  })

  it('does not substitute an independently assembled preview when reconstruction is unavailable', async () => {
    const { controller, reconstructRequest, request } = harness(true)
    reconstructRequest.mockImplementation(() => { throw new Error('Unavailable sender') })
    await expect(controller.requestContextPreview(request))
      .rejects.toMatchObject({ failure: { code: 'story-request-context-unavailable' } })
  })

  it('checks Story ownership before any Session read', async () => {
    const { controller, inspect, get, request } = harness(false)
    await expect(controller.requestContextPreview({ ...request, sessionId: SessionId('other-actor') }))
      .rejects.toMatchObject({ failure: { code: 'story-session-not-owned' } })
    await expect(controller.requestContextPreview({ ...request, storyId: StoryId('story-00000000-0000-4000-8000-000000000000') }))
      .rejects.toMatchObject({ failure: { code: 'story-not-found' } })
    expect(inspect).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })

  it('returns a stable error for unavailable or invalid history, never current context', async () => {
    const { controller, inspect, request } = harness(false)
    await expect(controller.requestContextPreview({ ...request, beforeEventSeq: 999 }))
      .rejects.toMatchObject({ failure: { code: 'story-request-context-unavailable' } })
    inspect.mockRejectedValue(new Error('missing artifact'))
    await expect(controller.requestContextPreview(request))
      .rejects.toMatchObject({ failure: { code: 'story-request-context-unavailable' } })
  })
})
