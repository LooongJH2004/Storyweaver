import { describe, expect, it } from 'vitest'
import { parseStorybookDocument } from '../src/storybook.ts'

describe('Storyweaver storybook schema', () => {
  it('materializes optional discussion settings for v5 storybooks', () => {
    const document = parseStorybookDocument({
      schemaVersion: 6,
      id: 'legacy',
      title: '旧故事书',
      directorPrompt: '',
      contextRules: {
        director: { policy: '', tools: '' },
        actor: { policy: '', tools: '' },
      },
      characters: [],
      directorGuidance: {},
    })

    expect(document.discussionSettings).toEqual({ maxRounds: 4 })
    expect(document.protagonistActorId).toBeNull()
  })

  it('normalizes optional authoring sections while preserving character-private JSON', () => {
    const document = parseStorybookDocument({
      schemaVersion: 6,
      id: 'moonshadow-ledger',
      title: '月影账簿',
      directorPrompt: '',
      reasoningLanguage: '简体中文',
      directorGuidance: {},
      characters: [{
        actorId: 'shadowheart',
        displayName: '影心',
        publicPersona: '克制而警惕。',
        rolePrompt: '',
        capabilities: ['speak', 'act'],
        privateContext: { perspective: ['不愿公开的记忆。'] },
        actingGuidance: {},
      }],
    })
    expect(document).toMatchObject({
      protagonistActorId: 'shadowheart',
      setting: {},
      premise: '',
      worldTruth: {},
      beats: [],
      directorRules: [],
      directorGuidance: {
        narrativeStyle: '', atmosphereAndPacing: '', focus: [], avoid: [], additionalInstructions: '',
      },
    })
    expect(document.characters[0]).toMatchObject({
      actorId: 'shadowheart',
      state: [],
      actingGuidance: {
        speechStyle: '', habitualActions: [], decisionPrinciples: [], emotionalTendencies: [],
        taboos: [], additionalInstructions: '',
      },
    })
    expect(document.characters[0]?.privateContext).toMatchObject({ perspective: ['不愿公开的记忆。'] })
  })

  it('keeps structured guidance scoped and rejects locked-policy keys inside it', () => {
    const document = parseStorybookDocument({
      schemaVersion: 6,
      id: 'guidance',
      title: '指导测试',
      directorPrompt: '',
      reasoningLanguage: '简体中文',
      directorGuidance: { narrativeStyle: '环境细节优先', focus: ['信息隔离'] },
      characters: [{
        actorId: 'shadowheart', displayName: '影心', publicPersona: '克制。', capabilities: ['speak'],
        rolePrompt: '',
        actingGuidance: { speechStyle: '短句' },
      }],
    })
    expect(document.directorGuidance.focus).toEqual(['信息隔离'])
    expect(document.characters[0]?.actingGuidance.speechStyle).toBe('短句')
    expect(() => parseStorybookDocument({
      ...document,
      directorGuidance: { ...document.directorGuidance, systemPrompt: 'override' },
    })).toThrow()
  })

  it('rejects duplicate Actor identities and system-policy extension fields', () => {
    const actor = {
      actorId: 'same',
      displayName: '同名角色',
      publicPersona: '测试角色。',
      rolePrompt: '',
      capabilities: ['speak'],
      privateContext: {},
      actingGuidance: {},
    }
    expect(() => parseStorybookDocument({
      schemaVersion: 6,
      id: 'duplicate-cast',
      title: '重复角色',
      directorPrompt: '',
      reasoningLanguage: '简体中文',
      directorGuidance: {},
      characters: [actor, actor],
    })).toThrow('duplicate storybook actorId')
    expect(() => parseStorybookDocument({
      schemaVersion: 6,
      id: 'policy-override',
      title: '越权字段',
      directorPrompt: '',
      reasoningLanguage: '简体中文',
      directorGuidance: {},
      characters: [],
      systemPrompt: 'Director may speak for every Actor.',
    })).toThrow()
  })

  it('requires the selected protagonist to identify one cast member', () => {
    const actor = {
      actorId: 'shadowheart',
      displayName: '影心',
      publicPersona: '克制而警惕。',
      rolePrompt: '',
      capabilities: ['speak'],
      privateContext: {},
      actingGuidance: {},
    }
    expect(() => parseStorybookDocument({
      schemaVersion: 6,
      id: 'unknown-protagonist',
      title: '未知主角',
      directorPrompt: '',
      reasoningLanguage: '简体中文',
      directorGuidance: {},
      protagonistActorId: 'astarion',
      characters: [actor],
    })).toThrow('unknown protagonist actorId')
  })
})
