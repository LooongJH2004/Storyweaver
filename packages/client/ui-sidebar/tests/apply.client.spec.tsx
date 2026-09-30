/** Sidebar shell slot registration and its Story/layout callbacks. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SidebarRootInjected } from '@deepseek-ai/dsh-client-ui-sidebar/client'

async function bench(declare = true, storyMode = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const layout = { toggleSidebar: vi.fn() }
  const uiStory = { startStory: vi.fn() }
  const uiWorkspace = { startSession: vi.fn() }
  ctx.provide('layout', layout)
  if (storyMode) ctx.provide('uiStory', uiStory as never)
  else ctx.provide('uiWorkspace', uiWorkspace as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const slots = ctx.get('slots') as SlotRegistry
  if (declare) {
    slots.register(
      { name: 'root', children: { 'sidebar': { kind: 'single', scope: 'root' } } } as never,
      () => null,
    )
  }
  return { ctx, slots, layout, uiStory, uiWorkspace }
}

describe('ui-sidebar apply', () => {
  it('declares only the services it uses', () => {
    expect(inject).toEqual(['slots', 'layout', 'locale'])
  })

  it('registers the shell and declares its child seats', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries('sidebar')).toHaveLength(1)
    expect(b.slots.spec('sidebar.brand.mark')).toEqual({ kind: 'single', scope: 'root' })
    expect(b.slots.spec('sidebar.brand.name')).toEqual({ kind: 'single', scope: 'root' })
    expect(b.slots.spec('sidebar.stories')).toEqual({ kind: 'single', scope: 'root' })
    expect(b.slots.spec('sidebar.settings')).toEqual({ kind: 'single', scope: 'root' })
    expect(b.slots.spec('sidebar.footer.action')).toEqual({ kind: 'list', scope: 'root' })
    // Copy rides the standard locale seat, not the inject face.
    expect(b.slots.entries('sidebar')[0]!.locale).toBe('sidebar')
    const injected = (b.slots.entries('sidebar')[0]!.inject as () => SidebarRootInjected)()
    expect(Object.keys(injected)).toEqual(['storyMode', 'startStory', 'toggleSidebar'])
    expect(injected.storyMode).toBe(true)
    // Both arms delegate to the Story UI's shared New Story action.
    injected.startStory('story' as never)
    expect(b.uiStory.startStory).toHaveBeenCalledWith('story')
    injected.startStory()
    expect(b.uiStory.startStory).toHaveBeenLastCalledWith(undefined)
    injected.toggleSidebar()
    expect(b.layout.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('keeps standard dsh on Workspace navigation when uiStory is absent', async () => {
    const b = await bench(true, false)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const injected = (b.slots.entries('sidebar')[0]!.inject as () => SidebarRootInjected)()
    expect(injected.storyMode).toBe(false)
    injected.startStory()
    expect(b.uiWorkspace.startSession).toHaveBeenCalledOnce()
  })

  it('opens the independent product through declared navigation without starting a Session', async () => {
    const b = await bench(true, false)
    const open = vi.fn()
    b.ctx.provide('sidebarNavigation', { storyMode: true, open })
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const injected = (b.slots.entries('sidebar')[0]!.inject as () => SidebarRootInjected)()
    expect(injected.storyMode).toBe(true)
    injected.startStory()
    expect(open).toHaveBeenCalledOnce()
    expect(b.uiWorkspace.startSession).not.toHaveBeenCalled()
  })

  it('fails when no live owner declared the sidebar slot', async () => {
    const b = await bench(false)
    await expect(b.ctx.plugin({ inject: [...inject], apply })).rejects.toThrow(/not declared/)
  })

  it('removes the entry and child declaration on teardown', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await fiber.dispose()
    expect(b.slots.entries('sidebar')).toHaveLength(0)
    expect(b.slots.spec('sidebar.brand.mark')).toBeUndefined()
    expect(b.slots.spec('sidebar.brand.name')).toBeUndefined()
    expect(b.slots.spec('sidebar.stories')).toBeUndefined()
    expect(b.slots.spec('sidebar.footer.action')).toBeUndefined()
  })
})
