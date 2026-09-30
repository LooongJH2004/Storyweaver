import { describe, expect, it } from 'vitest'
import {
  defaultStoryContextRecipe,
  emptyDirectorOutline,
  emptyPlotLedger,
  emptyStoryDiscussions,
  emptyStoryMemory,
  emptyStoryWorld,
} from '@deepseek-ai/dsh-story'
import { prepareStoryPackageImport } from '../src/story-package.ts'

describe('Story Package v4', () => {
  it('validates a complete package and remaps every Session identity', () => {
    const prepared = prepareStoryPackageImport(JSON.stringify({
      format: 'dsh-roleplay-story-package',
      version: 5,
      checkpoints: { version: 3, entries: [] },
      exportedAt: '2026-08-30T00:00:00.000Z',
      story: {
        title: '月影账簿',
        premise: '一本以珍贵记忆为墨的莎尔账簿必须在午夜前得到处置。',
        currentSceneSessionId: 'old-scene',
        plotLedger: emptyPlotLedger(),
        directorOutline: emptyDirectorOutline(),
        world: emptyStoryWorld(),
        memory: emptyStoryMemory(),
        discussions: emptyStoryDiscussions(),
        contextRecipe: defaultStoryContextRecipe(),
        promptOverrides: { revision: 0, actorPrompts: {}, contextRules: {}, styles: { profiles: {} } },
      },
      storybookJson: JSON.stringify({
        schemaVersion: 6,
        id: 'bg3-moonshadow-ledger',
        title: '月影账簿',
        directorPrompt: '',
        reasoningLanguage: '简体中文',
        directorGuidance: {},
        characters: [],
      }),
      files: [],
      sessions: [{
        sessionId: 'old-scene',
        role: 'scene',
        createdAt: '2026-08-30T00:00:00.000Z',
        header: { createdAt: 1 },
        events: [],
      }],
    }))

    expect(prepared.record.currentSceneSessionId).toMatch(/^story-import-/)
    expect(prepared.record.sessions[0]?.sessionId).toBe(prepared.record.currentSceneSessionId)
    expect(prepared.sessions[0]?.sessionId).toBe(prepared.record.currentSceneSessionId)
  })

  it('fails closed on an unsupported package version', () => {
    expect(() => prepareStoryPackageImport(JSON.stringify({
      format: 'dsh-roleplay-story-package',
      version: 1,
    }))).toThrow()
  })
})
