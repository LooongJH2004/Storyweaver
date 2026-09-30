// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { storybookStudioPanel } from '../src/client/StorybookStudioPanel.tsx'
import { zh, type RoleplayKey } from '../src/client/locales.ts'

function t(key: RoleplayKey, values?: Record<string, unknown>): string {
  return Object.entries(values ?? {}).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    zh[key],
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const document = {
  schemaVersion: 6,
  id: 'bg3-moonshadow-ledger',
  title: '月影账簿',
  setting: {},
  premise: '一本以记忆为墨的账簿出现在精灵之歌。',
  worldTruth: {},
  discussionSettings: { maxRounds: 3 },
  directorPrompt: '以都市奇幻张力推进。',
  reasoningLanguage: '简体中文',
  contextRules: {
    director: { policy: '导演策略', tools: '导演工具规则' },
    actor: { policy: '角色策略', tools: '角色工具规则' },
  },
  protagonistActorId: 'shadowheart',
  characters: [{
    actorId: 'shadowheart',
    displayName: '影心',
    publicPersona: '克制而警惕。',
    rolePrompt: '仅依据角色自己所知行动。',
    state: [],
    capabilities: ['speak', 'act'],
    privateContext: { perspective: ['秘密'] },
    actingGuidance: {
      speechStyle: '', habitualActions: [], decisionPrinciples: [], emotionalTendencies: [],
      taboos: [], additionalInstructions: '',
    },
  }],
  beats: [],
  directorRules: ['不得代替持久角色发言。'],
  directorGuidance: {
    narrativeStyle: '', atmosphereAndPacing: '', focus: [], avoid: [], additionalInstructions: '',
  },
}

describe('Storybook Studio panel', () => {
  it('opens as a closable modal workspace and preserves an unsaved draft across close', async () => {
    const storybook = vi.fn().mockResolvedValue({
      revision: '1234567890abcdef', storybookJson: JSON.stringify(document), exists: true,
    })
    const Panel = storybookStudioPanel({ storybook, updateStorybook: vi.fn(), contextPreview: vi.fn() })

    render(<Panel {...props(Panel)} />)
    const trigger = screen.getByRole('button', { name: zh['storybook.open'] })
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: zh['storybook.workspace'] })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.hasAttribute('data-size')).toBe(false)
    expect(dialog.querySelectorAll('[data-resize-edge]')).toHaveLength(8)
    expect(screen.queryByRole('button', { name: /全屏工作区|恢复标准窗口/u })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.edit'] }))
    const commands = screen.getByRole('toolbar', { name: '编辑命令' })
    expect(within(commands).getByRole('button', { name: zh['storybook.save'] })).toBeTruthy()
    expect(within(commands).getByRole('button', { name: zh['storybook.cancel'] })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: zh['storybook.field.title'] }), {
      target: { value: '仍在编辑的月影账簿' },
    })
    fireEvent.click(screen.getByRole('button', { name: zh['workspace.close'] }))
    expect(screen.queryByRole('dialog', { name: zh['storybook.workspace'] })).toBeNull()
    expect(window.document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: zh['storybook.field.title'] }).value)
      .toBe('仍在编辑的月影账簿')
    fireEvent.keyDown(window.document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: zh['storybook.workspace'] })).toBeNull()
  })

  it('loads the managed storybook and saves a visual exact-revision edit', async () => {
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const storybook = vi.fn().mockResolvedValue({
      revision: '1234567890abcdef',
      storybookJson: `${JSON.stringify(document, undefined, 2)}\n`,
      exists: true,
    })
    const updateStorybook = vi.fn().mockResolvedValue({
      revision: 'fedcba0987654321',
      storybookJson: `${JSON.stringify({ ...document, title: '月影账簿·修订版' }, undefined, 2)}\n`,
      exists: true,
    })
    const rename = vi.fn().mockResolvedValue(undefined)
    const setPremise = vi.fn().mockResolvedValue(undefined)
    const Panel = storybookStudioPanel({
      storybook, updateStorybook, contextPreview: vi.fn(), rename, setPremise,
    })

    render(<Panel {...props(Panel)} />)
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.open'] }))
    await screen.findByText(document.premise)
    expect(screen.getByText('影心')).toBeTruthy()
    expect(screen.getByText(zh['storybook.protectedTitle'])).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh['storybook.edit'] }))
    expect(screen.getByRole('tab', { name: zh['storybook.mode.visual'] }).getAttribute('aria-selected')).toBe('true')
    fireEvent.change(screen.getByRole('textbox', { name: zh['storybook.field.title'] }), {
      target: { value: '月影账簿·修订版' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: zh['storybook.field.discussionMaxRounds'] }), {
      target: { value: '5' },
    })
    fireEvent.click(screen.getByText(zh['storybook.diffPreview']))
    expect(screen.getByText('月影账簿')).toBeTruthy()
    expect(screen.getByText('月影账簿·修订版')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.exportDraft'] }))
    const exported = download.mock.instances[0] as HTMLAnchorElement
    expect(decodeURIComponent(exported.href.split(',')[1] ?? '')).toContain('月影账簿·修订版')
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.save'] }))

    await waitFor(() => {
      expect(updateStorybook).toHaveBeenCalledWith('story-1', '1234567890abcdef', expect.any(String))
    })
    const source = updateStorybook.mock.calls[0]?.[2] as string
    expect(JSON.parse(source)).toMatchObject({
      ...document,
      title: '月影账簿·修订版',
      discussionSettings: { maxRounds: 5 },
    })
    expect(rename).toHaveBeenCalledWith('story-1', '月影账簿·修订版')
    expect(setPremise).not.toHaveBeenCalled()
    expect(await screen.findByText('月影账簿·修订版')).toBeTruthy()
  })

  it('keeps an invalid JSON draft visible and does not issue a save', async () => {
    const storybook = vi.fn().mockResolvedValue({
      revision: '1234567890abcdef',
      storybookJson: JSON.stringify(document),
      exists: true,
    })
    const updateStorybook = vi.fn()
    const Panel = storybookStudioPanel({ storybook, updateStorybook, contextPreview: vi.fn() })

    render(<Panel {...props(Panel)} />)
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.open'] }))
    await screen.findByText(document.premise)
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.edit'] }))
    fireEvent.click(screen.getByRole('tab', { name: zh['storybook.mode.json'] }))
    fireEvent.change(screen.getByRole('textbox', { name: zh['storybook.editorLabel'] }), {
      target: { value: '{ invalid' },
    })
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.save'] }))

    await waitFor(() => { expect(screen.getByText(/Expected property/u)).toBeTruthy() })
    expect(updateStorybook).not.toHaveBeenCalled()
  })

  it('offers an explicit latest-version reload after an exact-revision conflict', async () => {
    const storybook = vi.fn().mockResolvedValue({
      revision: '1234567890abcdef', storybookJson: JSON.stringify(document), exists: true,
    })
    const updateStorybook = vi.fn().mockRejectedValue(new Error(
      "Storybook revision changed from '1234567890abcdef' to 'fedcba0987654321'",
    ))
    const Panel = storybookStudioPanel({ storybook, updateStorybook, contextPreview: vi.fn() })

    render(<Panel {...props(Panel)} />)
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.open'] }))
    await screen.findByText(document.premise)
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.edit'] }))
    fireEvent.change(screen.getByRole('textbox', { name: zh['storybook.field.title'] }), {
      target: { value: '冲突草稿' },
    })
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.save'] }))

    const reload = await screen.findByRole('button', { name: zh['storybook.loadLatest'] })
    fireEvent.click(reload)
    await waitFor(() => { expect(storybook).toHaveBeenCalledTimes(2) })
  })

  it('imports into a visual preview before an exact-revision save', async () => {
    const storybook = vi.fn().mockResolvedValue({
      revision: '1234567890abcdef',
      storybookJson: JSON.stringify(document),
      exists: true,
    })
    const imported = { ...document, title: '月影账簿·导入预览' }
    const updateStorybook = vi.fn().mockResolvedValue({
      revision: 'fedcba0987654321',
      storybookJson: `${JSON.stringify(imported, undefined, 2)}\n`,
      exists: true,
    })
    const Panel = storybookStudioPanel({ storybook, updateStorybook, contextPreview: vi.fn() })

    render(<Panel {...props(Panel)} />)
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.open'] }))
    await screen.findByText(document.premise)
    const file = new File([JSON.stringify(imported)], 'moonshadow-import.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(imported) })
    fireEvent.change(screen.getByLabelText(zh['storybook.importLabel']), { target: { files: [file] } })

    const title = await screen.findByRole('textbox', { name: zh['storybook.field.title'] }) as HTMLInputElement
    expect(title.value).toBe('月影账簿·导入预览')
    expect(screen.getByText(zh['storybook.importReady'].replace('{value}', 'moonshadow-import.json'))).toBeTruthy()
    expect(updateStorybook).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: zh['storybook.save'] }))
    await waitFor(() => {
      expect(updateStorybook).toHaveBeenCalledWith('story-1', '1234567890abcdef', expect.any(String))
    })
  })

  it('exports the persisted canonical storybook as a named JSON download', async () => {
    const storybook = vi.fn().mockResolvedValue({
      revision: '1234567890abcdef',
      storybookJson: `${JSON.stringify(document, undefined, 2)}\n`,
      exists: true,
    })
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const Panel = storybookStudioPanel({ storybook, updateStorybook: vi.fn(), contextPreview: vi.fn() })

    render(<Panel {...props(Panel)} />)
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.open'] }))
    await screen.findByText(document.premise)
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.export'] }))

    expect(download).toHaveBeenCalledOnce()
    const anchor = download.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('月影账簿.storybook.json')
    expect(anchor.href).toMatch(/^data:application\/json;charset=utf-8,/u)
    expect(decodeURIComponent(anchor.href.split(',')[1] ?? '')).toContain('"id": "bg3-moonshadow-ledger"')
  })

  it('quick-pastes scoped guidance and previews Actor-visible sections', async () => {
    const storybook = vi.fn().mockResolvedValue({
      revision: '1234567890abcdef', storybookJson: JSON.stringify(document), exists: true,
    })
    const updateStorybook = vi.fn().mockImplementation(async (_storyId, _revision, source: string) => ({
      revision: 'fedcba0987654321', storybookJson: source, exists: true,
    }))
    const contextPreview = vi.fn().mockResolvedValue({
      audience: 'actor', actorId: 'shadowheart', pendingActorInitialization: true, sections: [{
        id: 'acting-guidance', title: 'Acting guidance', source: 'storybook',
        permission: 'player-editable', visibility: 'actor-private',
        reason: 'Creative performance guidance is scoped to this Actor.', content: '{"speechStyle":"短句"}',
      }],
    })
    const Panel = storybookStudioPanel({ storybook, updateStorybook, contextPreview })

    render(<Panel {...props(Panel)} />)
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.open'] }))
    await screen.findByText(document.premise)
    fireEvent.change(screen.getByLabelText(zh['storybook.contextTarget']), { target: { value: 'shadowheart' } })
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.contextLoad'] }))
    await screen.findByText(/Acting guidance/u)
    expect(screen.getByText(zh['context.pendingActorInitialization'])).toBeDefined()
    expect(contextPreview).toHaveBeenCalledWith('story-1', 'actor', 'shadowheart')

    fireEvent.click(screen.getByRole('button', { name: zh['storybook.edit'] }))
    fireEvent.click(screen.getByRole('tab', { name: zh['storybook.mode.quick'] }))
    fireEvent.change(screen.getByLabelText(zh['storybook.quickTarget']), { target: { value: 'shadowheart' } })
    fireEvent.change(screen.getByLabelText(zh['storybook.quickLabel']), {
      target: { value: 'speech: 短句、冷峻反问\ntaboos: 不读取世界真相；不替别人决定' },
    })
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.quickApply'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.save'] }))

    await waitFor(() => { expect(updateStorybook).toHaveBeenCalledOnce() })
    const saved = JSON.parse(updateStorybook.mock.calls[0]?.[2] as string) as typeof document & {
      characters: Array<{ actingGuidance: { speechStyle: string; taboos: string[] } }>
    }
    expect(saved.characters[0]?.actingGuidance).toMatchObject({
      speechStyle: '短句、冷峻反问', taboos: ['不读取世界真相', '不替别人决定'],
    })
  })

  it('imports and exports one Actor without replacing the whole storybook', async () => {
    const storybook = vi.fn().mockResolvedValue({
      revision: '1234567890abcdef', storybookJson: JSON.stringify(document), exists: true,
    })
    const updateStorybook = vi.fn().mockImplementation(async (_storyId, _revision, source: string) => ({
      revision: 'fedcba0987654321', storybookJson: source, exists: true,
    }))
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const Panel = storybookStudioPanel({ storybook, updateStorybook, contextPreview: vi.fn() })

    render(<Panel {...props(Panel)} />)
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.open'] }))
    await screen.findByText(document.premise)
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.edit'] }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${zh['storybook.section.characters']}`, 'u') }))
    const imported = {
      ...document.characters[0],
      displayName: '影心·导入',
      actingGuidance: {
        speechStyle: '只影响影心', habitualActions: [], decisionPrinciples: [],
        emotionalTendencies: [], taboos: [], additionalInstructions: '',
      },
    }
    const file = new File([JSON.stringify(imported)], 'shadowheart.actor.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(imported) })
    fireEvent.change(screen.getByLabelText(zh['storybook.actorImportLabel']), { target: { files: [file] } })

    await screen.findByDisplayValue('影心·导入')
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.actorExport'] }))
    expect(download).toHaveBeenCalledOnce()
    expect((download.mock.instances[0] as HTMLAnchorElement).download).toBe('影心·导入.actor.json')
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.save'] }))
    await waitFor(() => { expect(updateStorybook).toHaveBeenCalledOnce() })
    expect(JSON.parse(updateStorybook.mock.calls[0]?.[2] as string)).toMatchObject({
      title: document.title,
      characters: [{ displayName: '影心·导入', actingGuidance: { speechStyle: '只影响影心' } }],
    })
  })

  it('selects exactly one protagonist without restricting player embodiment', async () => {
    const secondActor = {
      ...document.characters[0],
      actorId: 'astarion',
      displayName: '阿斯代伦',
    }
    const source = { ...document, characters: [...document.characters, secondActor] }
    const storybook = vi.fn().mockResolvedValue({
      revision: '1234567890abcdef', storybookJson: JSON.stringify(source), exists: true,
    })
    const updateStorybook = vi.fn().mockImplementation(async (_storyId, _revision, storybookJson: string) => ({
      revision: 'fedcba0987654321', storybookJson, exists: true,
    }))
    const Panel = storybookStudioPanel({ storybook, updateStorybook, contextPreview: vi.fn() })

    render(<Panel {...props(Panel)} />)
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.open'] }))
    await screen.findByText(document.premise)
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.edit'] }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${zh['storybook.section.characters']}`, 'u') }))
    fireEvent.click(screen.getByRole('button', { name: /阿斯代伦/u }))
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.setProtagonist'] }))
    expect(screen.getByRole('button', { name: zh['storybook.protagonistSelected'] }).getAttribute('aria-pressed'))
      .toBe('true')
    fireEvent.click(screen.getByRole('button', { name: zh['storybook.save'] }))

    await waitFor(() => { expect(updateStorybook).toHaveBeenCalledOnce() })
    expect(JSON.parse(updateStorybook.mock.calls[0]?.[2] as string)).toMatchObject({
      protagonistActorId: 'astarion',
    })
  })
})

function props(Panel: ReturnType<typeof storybookStudioPanel>): ComponentProps<typeof Panel> {
  return {
    sessionId: 'scene-1',
    useStories: (selector: (snapshot: unknown) => unknown) => selector({
      items: [{
        storyId: 'story-1', title: document.title, premise: document.premise,
        sceneSessionIds: ['scene-1'], actors: [],
      }],
    }),
    t,
  } as unknown as ComponentProps<typeof Panel>
}
