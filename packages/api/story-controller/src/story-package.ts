/** Versioned, path-free complete Story Package import/export. */

import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { relative, sep } from 'node:path'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  DEFAULT_STORYBOOK_CONTEXT_RULES,
  DEFAULT_STORYBOOK_REASONING_LANGUAGE,
  directorOutlineSchema,
  parseStorybookDocument,
  plotLedgerSchema,
  storyContextRecipeSchema,
  storyDiscussionStateSchema,
  storyMemoryStateSchema,
  storyPromptOverridesSchema,
  storyRecord,
  storyWorldStateSchema,
  storyTurnCheckpointFileSchema,
} from '@deepseek-ai/dsh-story'
import type { Story, StoryRecord, StorybookDocument } from '@deepseek-ai/dsh-story'
import type {
  StoryPackageExportValue,
  StoryPackageFileV5,
  StoryPackageSessionV5,
  StoryPackageV5,
} from './types.ts'
import { readStorybookAuthoring } from './storybook-authoring.ts'

const MAX_PACKAGE_BYTES = 32 * 1024 * 1024
const MAX_SESSIONS = 128
const MAX_EVENTS_PER_SESSION = 200_000
const MAX_FILES = 256

const packageSessionSchema = z.object({
  sessionId: z.string().min(1).max(240),
  role: z.enum(['control', 'scene', 'actor']),
  actorId: z.string().min(1).max(160).optional(),
  actorStateRevision: z.number().int().nonnegative().optional(),
  createdAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().optional(),
  header: z.object({
    createdAt: z.number().int().nonnegative(),
    agentPreset: z.string().min(1).max(240).optional(),
  }),
  events: z.array(z.unknown()).max(MAX_EVENTS_PER_SESSION),
})

const packageSchema = z.object({
  format: z.literal('dsh-roleplay-story-package'),
  version: z.literal(5),
  exportedAt: z.iso.datetime(),
  story: z.object({
    title: z.string().min(1).max(160),
    premise: z.string(),
    currentSceneSessionId: z.string().optional(),
    plotLedger: plotLedgerSchema,
    directorOutline: directorOutlineSchema,
    world: storyWorldStateSchema,
    memory: storyMemoryStateSchema,
    discussions: storyDiscussionStateSchema,
    contextRecipe: storyContextRecipeSchema,
    promptOverrides: storyPromptOverridesSchema,
  }),
  storybookJson: z.string(),
  files: z.array(z.object({
    path: z.string().regex(/^world\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/u),
    dataBase64: z.string(),
  })).max(MAX_FILES),
  sessions: z.array(packageSessionSchema).max(MAX_SESSIONS),
  checkpoints: storyTurnCheckpointFileSchema,
})

/** Fully validated import material with fresh Session identities. */
export interface PreparedStoryPackageImport {
  readonly checkpoints: z.infer<typeof storyTurnCheckpointFileSchema>
  readonly record: StoryRecord
  readonly storybook: StorybookDocument
  readonly files: readonly StoryPackageFileV5[]
  readonly sessions: readonly {
    readonly sessionId: SessionId
    readonly events: readonly SessionEvent[]
    readonly header: StoryPackageSessionV5['header']
  }[]
}

/**
 * Export one Story aggregate and every registered live or persisted Session log.
 * @param ctx - story, session, and persistence services.
 * @param story - current aggregate with portable turn checkpoints.
 * @returns a validated JSON package and its download metadata.
 */
export async function exportStoryPackage(ctx: Context, story: Story): Promise<StoryPackageExportValue> {
  const authoring = await readStorybookAuthoring(
    ctx.storyHome.storyPath(story.id, 'world', 'storybook.json'),
    parseStorybookDocument({
      schemaVersion: 6,
      id: String(story.id),
      title: story.title,
      premise: story.premise,
      directorPrompt: '',
      reasoningLanguage: DEFAULT_STORYBOOK_REASONING_LANGUAGE,
      contextRules: DEFAULT_STORYBOOK_CONTEXT_RULES,
      directorGuidance: {
        narrativeStyle: '', atmosphereAndPacing: '', focus: [], avoid: [], additionalInstructions: '',
      },
      characters: [],
    }),
  )
  const sessions: StoryPackageSessionV5[] = await Promise.all(story.sessions.map(async (registration) => {
    const live = ctx.sessions.get(registration.sessionId)
    const session = live === undefined ? await ctx.sessionPersistence.inspect(registration.sessionId)
      : { meta: live.header, events: live.events }
    return {
      sessionId: String(registration.sessionId),
      role: registration.role,
      ...(registration.actorId === undefined ? {} : { actorId: registration.actorId }),
      ...(registration.actorStateRevision === undefined ? {} : { actorStateRevision: registration.actorStateRevision }),
      createdAt: registration.createdAt,
      ...(registration.archivedAt === undefined ? {} : { archivedAt: registration.archivedAt }),
      header: {
        createdAt: session.meta.createdAt,
        ...(session.meta.agentPreset === undefined ? {} : { agentPreset: session.meta.agentPreset }),
      },
      events: structuredClone(session.events),
    }
  }))
  const files = await readPortableStoryFiles(ctx.storyHome.storyPath(story.id, 'world'))
  let checkpoints: z.infer<typeof storyTurnCheckpointFileSchema> = { version: 3, entries: [] }
  try {
    checkpoints = storyTurnCheckpointFileSchema.parse(JSON.parse(await readFile(ctx.storyHome.storyPath(story.id, '.runtime', 'turn-checkpoints.json'), 'utf8')))
  } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const value: StoryPackageV5 = {
    format: 'dsh-roleplay-story-package',
    version: 5,
    exportedAt: new Date().toISOString(),
    story: {
      title: story.title,
      premise: story.premise,
      ...(story.currentSceneSessionId === undefined ? {} : { currentSceneSessionId: String(story.currentSceneSessionId) }),
      plotLedger: story.plotLedger,
      directorOutline: story.directorOutline,
      world: story.world,
      memory: story.memory,
      discussions: story.discussions,
      contextRecipe: story.contextRecipe,
      promptOverrides: story.promptOverrides,
    },
    storybookJson: authoring.storybookJson,
    files,
    sessions,
    checkpoints,
  }
  const packageJson = JSON.stringify(value, undefined, 2)
  const byteLength = new TextEncoder().encode(packageJson).byteLength
  if (byteLength > MAX_PACKAGE_BYTES) {
    throw new Error(`Story Package exceeds ${String(MAX_PACKAGE_BYTES)} bytes`)
  }
  return { packageJson, byteLength, sessionCount: sessions.length }
}

/**
 * Parse, validate, re-identify, and cross-check one complete Story Package.
 * @param packageJson - current-version exported aggregate, logs, and checkpoints.
 * @returns detached validated data with fresh identities; invalid imports throw before writes.
 */
export function prepareStoryPackageImport(packageJson: string): PreparedStoryPackageImport {
  const byteLength = new TextEncoder().encode(packageJson).byteLength
  if (byteLength > MAX_PACKAGE_BYTES) throw new Error(`Story Package exceeds ${String(MAX_PACKAGE_BYTES)} bytes`)
  let decoded: unknown
  try {
    decoded = JSON.parse(packageJson) as unknown
  } catch (error: unknown) {
    throw new Error(`Story Package is not valid JSON: ${String(error)}`)
  }
  const value = packageSchema.parse(decoded)
  const storybook = parseStorybookDocument(JSON.parse(value.storybookJson) as unknown)
  const filePaths = value.files.map(item => item.path)
  if (new Set(filePaths).size !== filePaths.length) throw new Error('Story Package repeats a managed file path')
  const files = value.files.map((file) => {
    const data = Buffer.from(file.dataBase64, 'base64')
    if (data.toString('base64') !== file.dataBase64) throw new Error(`Story Package file '${file.path}' has invalid base64`)
    return file
  })
  const oldIds = value.sessions.map(item => item.sessionId)
  if (new Set(oldIds).size !== oldIds.length) throw new Error('Story Package repeats a Session identity')
  const remap = new Map(oldIds.map(id => [id, SessionId(`story-import-${randomUUID()}`)]))
  const sessions = value.sessions.map((item) => {
    if (item.role === 'actor' && item.actorId === undefined) throw new Error(`Actor Session '${item.sessionId}' requires actorId`)
    if (item.role !== 'actor' && item.actorId !== undefined) throw new Error(`${item.role} Session '${item.sessionId}' cannot carry actorId`)
    const sessionId = remap.get(item.sessionId)
    if (sessionId === undefined) throw new Error(`Story Package Session '${item.sessionId}' was not remapped`)
    const events = remapJson(item.events, remap) as SessionEvent[]
    Session.create(sessionId, events)
    return { sessionId, events, header: item.header }
  })
  const registrations = value.sessions.map(item => ({
    sessionId: remap.get(item.sessionId) as SessionId,
    role: item.role,
    ...(item.actorId === undefined ? {} : { actorId: item.actorId }),
    ...(item.actorStateRevision === undefined ? {} : { actorStateRevision: item.actorStateRevision }),
    createdAt: item.createdAt,
    ...(item.archivedAt === undefined ? {} : { archivedAt: item.archivedAt }),
  }))
  const currentSceneSessionId = value.story.currentSceneSessionId === undefined
    ? undefined
    : remap.get(value.story.currentSceneSessionId)
  if (value.story.currentSceneSessionId !== undefined && currentSceneSessionId === undefined) {
    throw new Error('Story Package current scene is absent from its Session logs')
  }
  const now = new Date().toISOString()
  const record = storyRecord.parse({
    title: value.story.title,
    premise: value.story.premise,
    sessions: registrations,
    ...(currentSceneSessionId === undefined ? {} : { currentSceneSessionId }),
    createdAt: now,
    updatedAt: now,
    plotLedger: remapJson(value.story.plotLedger, remap),
    directorOutline: remapJson(value.story.directorOutline, remap),
    world: remapJson(value.story.world, remap),
    memory: remapJson(value.story.memory, remap),
    discussions: remapJson(value.story.discussions, remap),
    contextRecipe: value.story.contextRecipe,
    promptOverrides: value.story.promptOverrides,
  })
  const checkpoints = storyTurnCheckpointFileSchema.parse(remapJson(value.checkpoints, remap))
  for (const entry of checkpoints.entries) {
    const scene = sessions.find(session => session.sessionId === entry.sceneSessionId)
    if (scene === undefined || scene.events[entry.userMessageSeq]?.type !== 'user/message') throw new Error('Checkpoint references an absent player message')
    for (const [id, end] of Object.entries(entry.actorEventEnds)) {
      const actor = sessions.find(session => session.sessionId === id)
      if (actor === undefined || end !== null && end > actor.events.length) throw new Error('Checkpoint references an absent Actor log boundary')
    }
  }
  return { record, storybook, files, sessions, checkpoints }
}

/**
 * Restore validated portable world files under one fresh managed Story path.
 * @param ctx - managed story-home and file services.
 * @param storyId - new aggregate receiving the imported files.
 * @param files - validated relative world paths and text contents.
 */
export async function writeStoryPackageFiles(
  ctx: Context,
  storyId: Story['id'],
  files: readonly StoryPackageFileV5[],
): Promise<void> {
  for (const file of files) {
    const segments = file.path.split('/')
    if (segments[0] !== 'world' || segments.some(segment => segment === '..' || segment === '')) {
      throw new Error(`Story Package file path '${file.path}' is unsafe`)
    }
    const target = ctx.storyHome.storyPath(storyId, ...segments)
    await mkdir(ctx.storyHome.storyPath(storyId, ...segments.slice(0, -1)), { recursive: true })
    await writeFile(target, Buffer.from(file.dataBase64, 'base64'), { mode: 0o600 })
  }
}

async function readPortableStoryFiles(worldRoot: string): Promise<StoryPackageFileV5[]> {
  const files: StoryPackageFileV5[] = []
  const walk = async (directory: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return
      throw error
    }
    for (const entry of entries) {
      const absolute = `${directory}${sep}${entry.name}`
      const stat = await lstat(absolute)
      if (stat.isSymbolicLink()) continue
      if (stat.isDirectory()) {
        await walk(absolute)
        continue
      }
      if (!stat.isFile()) continue
      const local = relative(worldRoot, absolute).split(sep).join('/')
      if (local === 'storybook.json') continue
      if (files.length >= MAX_FILES) throw new Error(`Story Package has more than ${String(MAX_FILES)} managed files`)
      files.push({ path: `world/${local}`, dataBase64: (await readFile(absolute)).toString('base64') })
    }
  }
  await walk(worldRoot)
  return files.toSorted((left, right) => left.path.localeCompare(right.path))
}

function remapJson<T>(input: T, remap: ReadonlyMap<string, SessionId>): T {
  const visit = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const exact = remap.get(value)
      if (exact !== undefined) return exact
      for (const [oldId, newId] of remap) {
        if (value.startsWith(`${oldId}:`)) return `${newId}${value.slice(oldId.length)}`
      }
      return value
    }
    if (Array.isArray(value)) return value.map(visit)
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [remap.get(key) ?? key, visit(child)]))
    }
    return value
  }
  return visit(input) as T
}
