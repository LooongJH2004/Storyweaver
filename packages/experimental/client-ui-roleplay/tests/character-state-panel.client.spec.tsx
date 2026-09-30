import { emptyDynamicState, initializeDynamicState, stateInitialValueSchema } from '@deepseek-ai/dsh-story/state'
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { characterStatePanel } from '../src/client/CharacterStatePanel.tsx'
import { zh, type RoleplayKey } from '../src/client/locales.ts'

function t(key: RoleplayKey): string { return zh[key] }

afterEach(cleanup)

describe('roleplaying character state panel', () => {
  it('loads storybook-defined characters before an autonomous Actor Session exists', async () => {
    const loadActors = vi.fn().mockResolvedValue([
      {
        dynamicState: emptyDynamicState(), actorId: 'shadowheart',
        displayName: '影心',
        persona: '保持戒备的牧师。',
        lifecycle: 'defined',
        facets: [
          { key: 'state:位置', label: '位置', values: ['精灵之歌二楼'] },
          { key: 'perspective', values: ['红线来自莎尔旧仪式。'] },
        ],
        emotions: [{ emotion: '戒备', intensity: 4, toward: ['账簿'] }],
        beliefs: [],
        relationships: [],
        memories: [],
        goals: [{ description: '阻止弥菈签名。', priority: 5, status: 'active' }],
        intentions: [],
        turningPoints: [],
      },
      {
        dynamicState: emptyDynamicState(), actorId: 'gale',
        displayName: '盖尔',
        persona: '好奇的法师。',
        lifecycle: 'active',
        facets: [{ key: 'state:位置', label: '位置', values: ['桌边'] }],
        emotions: [],
        beliefs: [],
        relationships: [],
        memories: [],
        goals: [],
        intentions: [],
        turningPoints: [],
      },
    ])
    const Panel = characterStatePanel(loadActors, vi.fn(), vi.fn())
    const props = {
      sessionId: 'scene-1',
      useStories: (selector: (snapshot: unknown) => unknown) => selector({
        items: [{
          world: { revision: 0 }, storyId: 'story-1',
          sceneSessionIds: ['scene-1'],
          actors: [],
        }],
      }),
      useSessions: (selector: (snapshot: unknown) => unknown) => selector({ byId: {} }),
      t,
    } as unknown as ComponentProps<typeof Panel>

    render(<Panel {...props} />)

    await waitFor(() => { expect(screen.getByText('2')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: zh['characters.open'] }))
    expect(screen.getAllByText('影心')).toHaveLength(2)
    expect(screen.getAllByText(zh['characters.lifecycle.defined'])).toHaveLength(2)
    expect(screen.getByText('精灵之歌二楼')).toBeTruthy()
    expect(screen.getByText('红线来自莎尔旧仪式。')).toBeTruthy()
    expect(screen.queryByText('不知道歌手的身份。')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /盖尔/ }))
    expect(screen.getByText('好奇的法师。')).toBeTruthy()
    expect(screen.getByText(zh['state.empty'])).toBeTruthy()
    expect(loadActors).toHaveBeenCalledWith('story-1')
  })

  it('refetches private projections when an Actor state revision advances', async () => {
    const state = (emotion: string) => [{
      dynamicState: initializeDynamicState([stateInitialValueSchema.parse({ definition: { id: 'mood', name: '心情', description: '当前感受', type: 'text', owner: 'actor', actorId: 'shadowheart', group: '心理', guidance: '' }, value: emotion })], ['shadowheart']), actorId: 'shadowheart', displayName: '影心', persona: '保持戒备的牧师。', lifecycle: 'active',
      facets: [], emotions: [{ emotion, intensity: 4, toward: ['账簿'] }], beliefs: [],
      relationships: [], memories: [], goals: [], intentions: [], turningPoints: [],
    }]
    const loadActors = vi.fn()
      .mockResolvedValueOnce(state('戒备'))
      .mockResolvedValueOnce(state('疑惑'))
    const Panel = characterStatePanel(loadActors, vi.fn(), vi.fn())
    const panelProps = (stateRevision: number) => ({
      sessionId: 'scene-1',
      useStories: (selector: (snapshot: unknown) => unknown) => selector({
        items: [{
          world: { revision: 0 }, storyId: 'story-1', sceneSessionIds: ['scene-1'],
          actors: [{ actorId: 'shadowheart', sessionId: 'actor-shadowheart', stateRevision }],
        }],
      }),
      useSessions: (selector: (snapshot: unknown) => unknown) => selector({ byId: {} }),
      t,
    }) as unknown as ComponentProps<typeof Panel>

    const view = render(<Panel {...panelProps(3)} />)
    fireEvent.click(screen.getByRole('button', { name: zh['characters.open'] }))
    expect(await screen.findByText('戒备')).toBeTruthy()

    view.rerender(<Panel {...panelProps(4)} />)
    expect(await screen.findByText('疑惑')).toBeTruthy()
    expect(loadActors).toHaveBeenCalledTimes(2)
  })
})
