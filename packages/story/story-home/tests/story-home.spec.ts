import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix, win32 } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import StoryHome, {
  defaultStoryweaverHome, resolveStoryweaverHome, validateStoryPathId,
} from '../src/index.ts'

const STORY_ID = 'story-00000000-0000-4000-8000-000000000000'
const SECOND_STORY_ID = 'story-00000000-0000-4000-8000-000000000001'
const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-story-home-'))
  roots.push(root)
  return root
}

describe('Storyweaver Home resolution', () => {
  it('uses platform application-data conventions without consulting cwd', () => {
    expect(defaultStoryweaverHome(
      { LOCALAPPDATA: 'D:\\LocalData' }, 'win32', 'C:\\Users\\writer',
    )).toBe(win32.resolve('D:\\LocalData', 'Storyweaver'))
    expect(defaultStoryweaverHome({}, 'darwin', '/Users/writer')).toBe(
      posix.resolve('/Users/writer', 'Library', 'Application Support', 'Storyweaver'),
    )
    expect(defaultStoryweaverHome(
      { XDG_DATA_HOME: '/srv/writer-data' }, 'linux', '/home/writer',
    )).toBe('/srv/writer-data/Storyweaver')
  })

  it('prefers explicit configuration, then environment, and expands home', () => {
    expect(resolveStoryweaverHome(
      '~/explicit', { STORYWEAVER_HOME: '/environment' }, 'linux', '/home/writer',
    )).toBe('/home/writer/explicit')
    expect(resolveStoryweaverHome(
      undefined, { STORYWEAVER_HOME: '~/environment' }, 'linux', '/home/writer',
    )).toBe('/home/writer/environment')
  })
})

describe('StoryHome managed layout', () => {
  it('creates private product areas and one isolated Story skeleton', async () => {
    const root = await temporaryRoot()
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(StoryHome, { root })

    for (const area of ['attachments', 'sessions', 'storages', 'stories', 'trash']) {
      expect((await stat(join(root, area))).isDirectory()).toBe(true)
    }

    await ctx.storyHome.writeManifest(STORY_ID, { title: '雾港' })
    for (const area of ['assets', 'exports', 'world', '.runtime']) {
      expect((await stat(join(root, 'stories', STORY_ID, area))).isDirectory()).toBe(true)
    }
    expect(JSON.parse(await readFile(
      join(root, 'stories', STORY_ID, 'story.json'), 'utf8',
    ))).toEqual({ title: '雾港' })
  })

  it('rejects malformed identities and every path-escape segment', async () => {
    const root = await temporaryRoot()
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(StoryHome, { root })

    expect(validateStoryPathId(STORY_ID)).toBe(STORY_ID)
    expect(() => validateStoryPathId('../outside')).toThrow(/invalid Story id/)
    for (const segment of ['', '.', '..', '../outside', 'nested/file', 'nested\\file']) {
      expect(() => ctx.storyHome.storyPath(STORY_ID, segment)).toThrow(/invalid managed/)
    }
  })

  it('copies authored baseline only and stages deleted Stories in trash', async () => {
    const root = await temporaryRoot()
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(StoryHome, { root })
    await ctx.storyHome.ensureStory(STORY_ID)
    await writeFile(ctx.storyHome.storyPath(STORY_ID, 'world', 'storybook.json'), '{"title":"月影账簿"}')
    await writeFile(ctx.storyHome.storyPath(STORY_ID, 'assets', 'cover.txt'), 'cover')
    await writeFile(ctx.storyHome.storyPath(STORY_ID, '.runtime', 'turn.txt'), 'runtime')
    await writeFile(ctx.storyHome.storyPath(STORY_ID, 'exports', 'old.txt'), 'export')

    await ctx.storyHome.copyBaseline(STORY_ID, SECOND_STORY_ID)
    expect(await readFile(ctx.storyHome.storyPath(SECOND_STORY_ID, 'world', 'storybook.json'), 'utf8'))
      .toContain('月影账簿')
    expect(await readFile(ctx.storyHome.storyPath(SECOND_STORY_ID, 'assets', 'cover.txt'), 'utf8')).toBe('cover')
    await expect(stat(ctx.storyHome.storyPath(SECOND_STORY_ID, '.runtime', 'turn.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(ctx.storyHome.storyPath(SECOND_STORY_ID, 'exports', 'old.txt'))).rejects.toMatchObject({ code: 'ENOENT' })

    const trashEntry = await ctx.storyHome.trashStory(SECOND_STORY_ID)
    await expect(stat(ctx.storyHome.storyPath(SECOND_STORY_ID))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await stat(ctx.storyHome.path('trash', trashEntry))).isDirectory()).toBe(true)
  })
})
