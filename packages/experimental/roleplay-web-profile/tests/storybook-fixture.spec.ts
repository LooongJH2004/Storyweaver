import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDirectorOutlinePlayerInput } from '@deepseek-ai/dsh-roleplay-core/outline-rules'
import { parseStorybookDocument } from '@deepseek-ai/dsh-roleplay-core/storybook'

interface StorybookFixture {
  readonly id: string
  readonly discussionSettings: { readonly maxRounds: number }
  readonly worldTruth: object
  readonly directorGuidance: { readonly focus: readonly string[] }
  readonly characters: readonly {
    readonly actorId: string
    readonly actingGuidance: { readonly speechStyle: string }
    readonly initialKnowledge: readonly { readonly text: string }[]
    readonly privateContext: {
      readonly perspective: readonly string[]
    }
  }[]
  readonly beats: readonly { readonly id: string }[]
  readonly directorRules: readonly string[]
}

interface SimulationFixture {
  readonly storybookId: string
  readonly cases: readonly {
    readonly id: string
    readonly playerInput: string
    readonly inputIntent?: { readonly kind: string; readonly payload: { readonly mode: string; readonly actorId?: string } }
    readonly must: readonly string[]
    readonly mustNot: readonly string[]
  }[]
}

const fixtureRoot = fileURLToPath(new URL('./fixtures/storybooks/moonshadow-ledger', import.meta.url))

describe('Moonshadow Ledger simulation storybook', () => {
  it('keeps world truth, private actor context, and simulation assertions distinct', () => {
    const storybook = parse('storybook.json') as StorybookFixture
    const simulation = parse('simulation-cases.json') as SimulationFixture
    const outline = parseDirectorOutlinePlayerInput(parse('director-outline.json'))
    const actorIds = storybook.characters.map(actor => actor.actorId)

    expect(storybook.id).toBe('bg3-moonshadow-ledger')
    expect(storybook.discussionSettings.maxRounds).toBe(4)
    expect(simulation.storybookId).toBe(storybook.id)
    expect(new Set(actorIds).size).toBe(actorIds.length)
    expect(storybook.characters).toHaveLength(4)
    expect(storybook.beats).toHaveLength(3)
    expect(storybook.worldTruth).toBeTruthy()
    expect(storybook.directorRules.length).toBeGreaterThanOrEqual(5)
    expect(storybook.directorGuidance.focus).toContain('角色之间不对称的信息')
    expect(outline.premiseLocked).toBe(true)
    expect(outline.hardConstraints.every(item => item.locked)).toBe(true)
    expect(outline.arcs).toHaveLength(3)
    expect(outline.beats).toHaveLength(3)
    expect(outline.foreshadows).toHaveLength(4)
    expect(outline.mysteries).toHaveLength(3)
    expect(outline.clocks).toHaveLength(2)
    for (const actor of storybook.characters) {
      expect(actor.initialKnowledge.length + actor.privateContext.perspective.length).toBeGreaterThan(0)
      expect(actor.actingGuidance.speechStyle.length).toBeGreaterThan(0)
    }
    for (const testCase of simulation.cases) {
      expect(testCase.playerInput.length).toBeGreaterThan(0)
      expect(testCase.must.length).toBeGreaterThan(0)
      expect(testCase.mustNot.length).toBeGreaterThan(0)
    }
    expect(simulation.cases.map(testCase => testCase.id)).toEqual(expect.arrayContaining([
      'observe-one-round',
      'information-isolation',
      'autonomous-memory',
      'player-world-intervention',
      'player-embodies-shadowheart',
      'world-settlement-and-perception',
      'reviewed-memory-supersession',
      'durable-group-discussion',
      'context-recipe-budget',
      'story-package-roundtrip',
      'rewind-rewrite',
    ]))
  })

  it('round-trips the complete storybook without changing its semantic document', () => {
    const imported = parseStorybookDocument(parse('storybook.json'))
    const exported = `${JSON.stringify(imported, undefined, 2)}\n`

    expect(parseStorybookDocument(JSON.parse(exported) as unknown)).toEqual(imported)
  })

  it('keeps all six live performance cases runnable with explicit input intent', () => {
    const simulation = parse('simulation-cases.json') as SimulationFixture
    const storybook = parseStorybookDocument(parse('storybook.json'))
    const performanceCases = simulation.cases.filter(item => item.id.startsWith('performance-'))
    expect(performanceCases.map(item => item.id)).toEqual([
      'performance-opening', 'performance-questioning', 'performance-deception',
      'performance-silence', 'performance-injury', 'performance-discussion',
    ])
    for (const item of performanceCases) {
      expect(item.inputIntent?.kind).toBe('storyweaver')
      expect(['observe', 'direction', 'intervene', 'embody']).toContain(item.inputIntent?.payload.mode)
      if (item.inputIntent?.payload.mode === 'embody') {
        expect(storybook.characters.map(actor => actor.actorId)).toContain(item.inputIntent.payload.actorId)
      }
    }
  })
})

function parse(name: string): unknown {
  return JSON.parse(readFileSync(resolve(fixtureRoot, name), 'utf8')) as unknown
}
