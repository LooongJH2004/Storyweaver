// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { initialContextRecipe } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import { creativeModules, creativeValue, type CreativeBindings } from '@deepseek-ai/dsh-roleplay-core/creative-modules'
import type { CreativeSettingsView } from '@deepseek-ai/dsh-roleplay-core/creative-application'
import type { BookId } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from '../src/client/contract.ts'
import { createNarrativeStore } from '../src/client/stores.ts'
import { SyncTransfer } from '../src/client/SyncTransfer.tsx'
import { CreativePreview } from '../src/client/CreativePreview.tsx'
import { CreativeSourceLabel } from '../src/client/CreativeControls.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
const messages: Record<string, string> = en
const t: NarrativeProps['t'] = (key, params) => Object.entries(params ?? {})
  .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), messages[key] ?? key)

it('retains book-specific sharing drafts and returns to the editor that opened synchronization', () => {
  const handle = createNarrativeStore()
  const editor = handle.create('creative-sync-test'); editor.clearPersisted()
  editor.actions.panel('author')
  editor.actions.recipeDraft('run-a', initialContextRecipe())
  editor.actions.openCreative({ bookId: 'book-a', instanceId: 'run-a', tab: 'stories' })
  editor.actions.globalCreativeDraft('book-a', { revision: 2, modules: { narrationLength: null }, selected: ['narrationLength'] })
  editor.actions.creativeNavigate({ bookId: 'book-b', tab: 'shared' })
  editor.actions.globalCreativeDraft('book-b', { revision: 0, modules: {}, selected: [] })
  const restored = handle.create('creative-sync-test')
  expect(restored.store.getSnapshot().creativeNavigation).toEqual({ bookId: 'book-b', tab: 'shared' })
  expect(restored.store.getSnapshot().globalCreativeDrafts?.['book-a']).toMatchObject({ revision: 2, modules: { narrationLength: null } })
  restored.actions.closeCreative()
  expect(restored.store.getSnapshot().panel).toBe('author')
  expect(restored.store.getSnapshot().recipeDrafts?.['run-a']).toEqual(initialContextRecipe())
  restored.clearPersisted()
})

it('distinguishes unset sharing, explicitly disabled content, and readable authored text', () => {
  const view = render(<CreativePreview t={t} value={undefined} />)
  expect(screen.getByText('Shared content not set')).toBeTruthy()
  view.rerender(<CreativePreview t={t} value={null} />)
  expect(screen.getByText('Disabled')).toBeTruthy()
  view.rerender(<CreativePreview t={t} value={{ id: 'performance', role: 'system', enabled: true, content: 'Speak with purpose.\nAsk when unsure.' }} />)
  expect(view.container.textContent).toContain('Speak with purpose.\nAsk when unsure.')
  expect(view.container.textContent).not.toContain('"content":')
})

it('separates paused following from a pending shared update', () => {
  const recipe = initialContextRecipe()
  const view: CreativeSettingsView = { bookId: 'book' as BookId, instanceRevision: 10, recipe, storybook: recipe,
    global: { schemaVersion: 1, revision: 4, modules: {}, updatedAt: '' },
    bindings: { schemaVersion: 1, revision: 3, modules: Object.fromEntries(creativeModules.map(key => [key,
      { source: 'local', localValue: creativeValue(recipe, key) }])) as CreativeBindings['modules'] } }
  view.bindings.modules.narrationLength = { source: 'global', localValue: null, appliedGlobalRevision: 3 }
  const rendered = render(<CreativeSourceLabel t={t} view={view} module="narrationLength" />)
  expect(rendered.container.textContent).toContain('Updates on the next player action')
  rendered.rerender(<CreativeSourceLabel t={t} view={{ ...view, bindings: { ...view.bindings, modules: {
    ...view.bindings.modules, narrationLength: { ...view.bindings.modules.narrationLength, followPaused: true },
  } } }} module="narrationLength" />)
  expect(rendered.container.textContent).toContain('Following paused; resume explicitly')
  expect(rendered.container.textContent).not.toContain('Updates on the next player action')
})


it('publishes only selected story values into empty sharing with both revision guards', async () => {
  const recipe = initialContextRecipe()
  const saved = { schemaVersion: 1, revision: 0, modules: {}, updatedAt: '' }
  const view = { bookId: 'book', instanceRevision: 7, recipe, storybook: recipe, global: saved,
    bindings: { schemaVersion: 1, revision: 0, modules: Object.fromEntries(creativeModules.map(key => [key,
      { source: 'local', localValue: creativeValue(recipe, key) }])) } }
  const publishCreative = vi.fn<NarrativeProps['publishCreative']>().mockResolvedValue({ ...saved, schemaVersion: 1, revision: 1 })
  const bindCreative = vi.fn()
  const props = { t, bookId: 'book', instanceId: 'run', runLabel: 'Story 1', saved, refreshRevision: 0,
    useLibrary: (select: (value: unknown) => unknown) => select({ instances: [{ id: 'run', book: { id: 'book' } }] }),
    useStore: (select: (value: unknown) => unknown) => select({}),
    actions: {}, creativeSettings: vi.fn().mockResolvedValue(view), publishCreative, bindCreative,
    updated: vi.fn(), reload: vi.fn(), editShared: vi.fn(), openRestore: vi.fn() } as unknown as Parameters<typeof SyncTransfer>[0]
  render(<SyncTransfer {...props} />)
  await waitFor(() => { expect(screen.queryByText('Loading…')).toBeNull() })
  fireEvent.click(screen.getByRole('button', { name: 'Shared settings ← Story' }))
  await waitFor(() => { expect(screen.getAllByRole('checkbox')).toHaveLength(5) })
  fireEvent.click(screen.getAllByRole('checkbox')[0]!)
  fireEvent.click(screen.getByRole('button', { name: /Save as shared settings/ }))
  await waitFor(() => { expect(publishCreative).toHaveBeenCalledOnce() })
  expect(publishCreative.mock.calls[0]?.[0]).toMatchObject({ bookId: 'book', expectedGlobalRevision: 0,
    fromInstance: { instanceId: 'run', expectedRevision: 7 }, modules: { narrationLength: creativeValue(recipe, 'narrationLength') } })
  expect(Object.keys(publishCreative.mock.calls[0]![0].modules)).toEqual(['narrationLength'])
  expect(bindCreative).not.toHaveBeenCalled()
})
