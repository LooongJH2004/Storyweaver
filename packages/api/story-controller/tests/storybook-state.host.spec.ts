import { emptyDynamicState } from '@deepseek-ai/dsh-story'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadStorybookActorStates, mergeStoryActorState } from '../src/storybook-state.ts'
import type { StoryActorStateView } from '../src/types.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('storybook character state projection', () => {
  it('normalizes flexible state fields and private roleplaying state', async () => {
    const path = await fixture({
      schemaVersion: 6,
      id: 'gatehouse',
      title: '北门',
      directorPrompt: '',
      reasoningLanguage: '简体中文',
      directorGuidance: {},
      characters: [{
        actorId: 'keeper',
        displayName: '守门人',
        publicPersona: '谨慎的档案守卫。',
        rolePrompt: '',
        capabilities: ['speak', 'act'],
        state: [{ definition: { id: 'keeper:wary', name: '戒备', description: '害怕访客', group: '情绪',
          type: 'number', owner: 'actor', actorId: 'keeper', minimum: 0, maximum: 10, guidance: '随遭遇变化' }, value: 7 }],
        privateContext: {
          perspective: ['钟声是警报。', '害怕独处。', '昨夜有人换过岗。'],
          coreMemories: [{ content: '曾因擅离职守失去同伴。', importance: 5 }],
          goals: [{ description: '守住北门。', priority: 5 }],
        },
        actingGuidance: {},
      }],
    })

    await expect(loadStorybookActorStates(path)).resolves.toMatchObject([{
      actorId: 'keeper',
      lifecycle: 'defined',
      facets: [
        { key: 'perspective', values: ['钟声是警报。', '害怕独处。', '昨夜有人换过岗。'] },
      ],
      dynamicState: { entries: [{ value: 7 }] },
      goals: [{ description: '守住北门。', priority: 5 }],
    }])
  })

  it('treats a missing storybook as an empty configured cast', async () => {
    const root = await temporaryRoot()
    await expect(loadStorybookActorStates(join(root, 'missing.json'))).resolves.toEqual([])
  })

  it('rejects duplicate stable Actor identities', async () => {
    const character = {
      actorId: 'same',
      displayName: '同名角色',
      publicPersona: '重复的角色。',
      rolePrompt: '',
      capabilities: ['speak'],
      privateContext: {},
      actingGuidance: {},
    }
    const path = await fixture({
      schemaVersion: 6,
      id: 'duplicates',
      title: '重复角色',
      directorPrompt: '',
      reasoningLanguage: '简体中文',
      directorGuidance: {},
      characters: [character, character],
    })
    await expect(loadStorybookActorStates(path)).rejects.toThrow('duplicate storybook actorId')
  })

  it('keeps current empty runtime values instead of resurrecting authored initial goals', () => {
    const configured = state({
      lifecycle: 'defined',
      facets: [{ key: 'state:位置', label: '位置', values: ['北门'] }],
      emotions: [{ emotion: '平静', intensity: 2, toward: [] }],
      goals: [{ description: '守门', priority: 5, status: 'active' }],
    })
    const running = state({
      lifecycle: 'active',
      facets: [],
      emotions: [{ emotion: '恐惧', intensity: 4, toward: ['钟楼'] }],
      goals: [],
    })

    expect(mergeStoryActorState(configured, running)).toEqual(expect.objectContaining({
      lifecycle: 'active',
      facets: configured.facets,
      emotions: running.emotions,
      goals: [],
    }))
  })
})

async function fixture(value: object): Promise<string> {
  const root = await temporaryRoot()
  const path = join(root, 'storybook.json')
  await writeFile(path, JSON.stringify(value), 'utf8')
  return path
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-storybook-state-'))
  roots.push(root)
  return root
}

function state(overrides: Partial<StoryActorStateView>): StoryActorStateView {
  return {
    dynamicState: emptyDynamicState(),
    actorId: 'keeper',
    displayName: '守门人',
    persona: '守卫',
    lifecycle: 'defined',
    facets: [],
    emotions: [],
    beliefs: [],
    relationships: [],
    memories: [],
    goals: [],
    intentions: [],
    turningPoints: [],
    ...overrides,
  }
}
