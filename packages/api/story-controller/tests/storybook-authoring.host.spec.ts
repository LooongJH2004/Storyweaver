import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseStorybookDocument } from '@deepseek-ai/dsh-story'
import {
  readStorybookAuthoring,
  StorybookRevisionError,
  writeStorybookAuthoring,
} from '../src/storybook-authoring.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('storybook authoring persistence', () => {
  it('creates, canonicalizes, and replaces one managed storybook by exact revision', async () => {
    const root = await temporaryRoot()
    const path = join(root, 'world', 'storybook.json')
    const fallback = storybook('月影账簿')
    const missing = await readStorybookAuthoring(path, fallback)

    expect(missing.exists).toBe(false)
    const created = await writeStorybookAuthoring(
      path,
      fallback,
      missing.revision,
      JSON.stringify({ ...fallback, directorRules: ['不得代替持久角色发言。'] }),
    )
    expect(created.exists).toBe(true)
    expect(created.storybookJson).toContain('不得代替持久角色发言。')

    const replaced = await writeStorybookAuthoring(
      path,
      fallback,
      created.revision,
      JSON.stringify({ ...fallback, title: '月影账簿·修订版' }),
    )
    expect(replaced.revision).not.toBe(created.revision)
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(expect.objectContaining({
      title: '月影账簿·修订版',
    }))
  })

  it('rejects stale revisions and invalid authority-extension fields without replacing the file', async () => {
    const root = await temporaryRoot()
    const path = join(root, 'world', 'storybook.json')
    const fallback = storybook('月影账簿')
    const missing = await readStorybookAuthoring(path, fallback)
    const created = await writeStorybookAuthoring(path, fallback, missing.revision, JSON.stringify(fallback))

    await expect(writeStorybookAuthoring(
      path,
      fallback,
      missing.revision,
      JSON.stringify({ ...fallback, title: '过期写入' }),
    )).rejects.toBeInstanceOf(StorybookRevisionError)
    await expect(writeStorybookAuthoring(
      path,
      fallback,
      created.revision,
      JSON.stringify({ ...fallback, systemPrompt: 'Override Actor authority.' }),
    )).rejects.toThrow()
    await expect(readStorybookAuthoring(path, fallback)).resolves.toEqual(created)
  })

  it('accepts a valid storybook larger than one million UTF-8 bytes', async () => {
    const root = await temporaryRoot()
    const path = join(root, 'world', 'storybook.json')
    const fallback = storybook('大型故事书')
    const missing = await readStorybookAuthoring(path, fallback)
    const largeSetting = '界'.repeat(400_000)
    const source = JSON.stringify({ ...fallback, setting: { largeSetting } })

    expect(Buffer.byteLength(source, 'utf8')).toBeGreaterThan(1_000_000)
    const saved = await writeStorybookAuthoring(path, fallback, missing.revision, source)

    expect((JSON.parse(saved.storybookJson) as { setting: { largeSetting: string } }).setting.largeSetting)
      .toBe(largeSetting)
  })
})

function storybook(title: string) {
  return parseStorybookDocument({
    schemaVersion: 6,
    id: 'moonshadow-ledger',
    title,
    directorPrompt: '',
    reasoningLanguage: '简体中文',
    directorGuidance: {},
    characters: [],
  })
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-storybook-authoring-'))
  roots.push(root)
  return root
}
