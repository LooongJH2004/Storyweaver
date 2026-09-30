import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

describe('roleplay Web profile bundle', () => {
  it('disables coding chrome and inserts the roleplaying Client plugin', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      private?: boolean
      publishConfig?: unknown
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.private).toBe(true)
    expect(manifest.publishConfig).toBeUndefined()
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dependencies).toEqual(expect.objectContaining({
      '@deepseek-ai/dsh-roleplay-services': 'workspace:^',
      '@deepseek-ai/dsh-api-roleplay-controller': 'workspace:^',
      '@deepseek-ai/dsh-client-ui-narrative': 'workspace:^',
      '@deepseek-ai/dsh-story-home': 'workspace:^',
    }))
    expect(manifest.dependencies).not.toHaveProperty('@deepseek-ai/dsh-api-story-controller')
    expect(manifest.dependencies).not.toHaveProperty('@deepseek-ai/dsh-experimental-tool-director')
    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as {
      id?: string
      disabled?: boolean
      config?: { persona?: string }
      insert?: { id?: string; name?: string; config?: { provider?: string; model?: string } }[]
    }[]
    const disabled = parsed.filter(row => row.disabled === true).map(row => row.id)
    expect(parsed.find(row => row.id === 'ui-sidebar')?.disabled).toBe(false)
    expect(parsed.find(row => row.id === 'ui-tool')?.disabled).toBe(false)
    expect(disabled).toContain('ui-plan')
    expect(parsed.find(row => row.id === 'ui-trajectory')?.disabled).toBe(false)
    expect(disabled).toContain('workspace')
    expect(disabled).toContain('workspace-controller')
    expect(disabled).toContain('directory-picker')
    expect(disabled).toContain('plugin-package-inventory-deepseek')
    expect(disabled).toContain('ui-workspace')
    expect(parsed.find(row => row.id === 'ui-permission')?.disabled).toBe(false)
    expect(parsed.find(row => row.id === 'ui-commands')?.disabled).toBe(false)
    expect(parsed.find(row => row.id === 'ui-input-trigger')?.disabled).toBe(false)
    const systemPrompt = parsed.find(row => row.id === 'system-prompt')?.config?.persona
    expect(systemPrompt).toContain('Never write words, thoughts, decisions, or autonomous actions')
    expect(systemPrompt).toContain('accepted NPC Actor tools append durable events')
    expect(systemPrompt).toMatchInlineSnapshot('"You are the Storyweaver world director, not a persistent character Actor. Your authority covers scene framing, non-character environment, continuity facts, open plot threads, and structured Director Briefs containing only Actor perceptions and uncertainties. Never write words, thoughts, decisions, or autonomous actions for a persistent character. Persistent-character dialogue and behavior exist only when accepted NPC Actor tools append durable events; ordinary Director prose has no character-behavior authority. If no NPC event exists, leave that character silent and unresolved. The player may observe, choose direction, intervene, or temporarily embody a character, but embodiment remains explicitly player-origin. Preserve information asymmetry, never expose implementation paths, and leave character responses to their autonomous Actor Agents."')
    expect(parsed.flatMap(row => row.insert ?? []).map(row => row.id)).toEqual([
      'creation-directory-picker', 'story-home', 'roleplay-services', 'roleplay-controller',
    ])
    const defaults = yaml.load(readFileSync(resolve(root, '../../bundle/base/cordis.patch.yml'), 'utf8'),
      { schema: entryListSchema }) as typeof parsed
    expect(parsed.flatMap(row => row.insert ?? []).find(row => row.id === 'roleplay-services')?.config)
      .toMatchObject(defaults.flatMap(row => row.insert ?? []).find(row => row.id === 'agent-default-model')!.config!)
  })
})
