import type { Context } from '@deepseek-ai/cordis'
import storyRemote from '@deepseek-ai/dsh-api-story-controller/remote'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('application Remote selection', () => {
  it('mounts the Story namespace for Story browser consumers', async () => {
    const mounted: unknown[] = []
    const disposed: unknown[] = []
    const ctx = {
      remote: {
        $mount: vi.fn((contribution: unknown) => {
          mounted.push(contribution)
          return Promise.resolve(async () => { disposed.push(contribution) })
        }),
      },
    } as unknown as Context

    const dispose = await apply(ctx)
    expect(mounted).toContain(storyRemote)

    await dispose()
    expect(disposed).toContain(storyRemote)
  })

  it('ships the same-session rewrite anchor in the browser Remote bundle', async () => {
    let bundled: { apply(ctx: Context): Promise<() => Promise<void>> } | undefined
    vi.stubGlobal('window', {
      __ModuleLoader__: {
        load(module: { factory(require: (id: string) => unknown): unknown }) {
          bundled = module.factory(() => { throw new Error('api-remotes client bundle must be self-contained') }) as typeof bundled
        },
      },
    })
    const clientBundlePath: string = '../lib/client.js'
    await import(clientBundlePath)
    if (bundled === undefined) throw new Error('api-remotes browser bundle did not register itself')

    const mounted: Array<{
      readonly package?: string
      readonly descriptors?: readonly {
        readonly id?: string
        readonly parameters?: readonly {
          readonly codec?: {
            readonly mode?: string
            readonly schema?: { parse(value: unknown): unknown }
          }
        }[]
      }[]
    }> = []
    const ctx = {
      remote: {
        $mount: vi.fn((contribution: (typeof mounted)[number]) => {
          mounted.push(contribution)
          return Promise.resolve(async () => {})
        }),
      },
    } as unknown as Context

    const dispose = await bundled.apply(ctx)
    const session = mounted.find(contribution => contribution.package === '@deepseek-ai/dsh-api-session-controller')
    const prompt = session?.descriptors?.find(
      descriptor => descriptor.id === '@deepseek-ai/dsh-api-session-controller#session/prompt',
    )
    const codec = prompt?.parameters?.[0]?.codec
    expect(codec?.mode).toBe('strict')
    if (codec?.mode !== 'strict' || codec.schema === undefined) {
      throw new Error('browser Session prompt must carry a strict request codec')
    }
    const request = {
      requestId: 'rewrite-browser-bundle-1',
      sessionId: 'session-browser-bundle-1',
      mode: 'queue',
      content: [{ type: 'text', text: 'rewrite this turn' }],
      clientTimeZone: 'Asia/Shanghai',
      rewriteBeforeSeq: 42,
    }
    expect(codec.schema.parse(request)).toEqual(request)

    await dispose()
  })
})
