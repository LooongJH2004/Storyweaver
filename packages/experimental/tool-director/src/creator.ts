/** Storybook authoring tools for a creator Agent that also owns a user-authorized local workspace. */

import { lstat, readFile, readdir } from 'node:fs/promises'
import { extname, isAbsolute, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-story-controller'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-permission-presets'
import {
  parseStorybookDocument,
  DEFAULT_STORY_CREATOR_PROMPT,
  storybookDocumentSchema,
  type Story,
  type StoryId,
} from '@deepseek-ai/dsh-story'
import type {} from '@deepseek-ai/dsh-story-home'
import { FIRST_PARTY_SECTION_ORDER } from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { DiffCallView, GenericCallView, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { toJSONSchema } from 'zod'

export const name = 'tool-storybook-creator'
export const inject = ['storyController', 'storyRegistry', 'storyHome', 'tools', 'systemPrompt']

const MAX_TEXT_BYTES = 2 * 1024 * 1024
const READ_LINE_LIMIT = 1_000
const LIST_FILE_LIMIT = 500
const WRITABLE_AREAS = new Set(['world', 'assets'])
const TEXT_EXTENSIONS = new Set(['.json', '.md', '.txt', '.yaml', '.yml'])
const CANONICAL_STORYBOOK_PATH = 'world/storybook.json'
const LOCAL_WORKSPACE_TOOLS = new Set(['read', 'read_image', 'write', 'edit', 'glob', 'grep', 'bash', 'pwsh'])
const CREATOR_TERMINAL_TOOLS = new Set(['storybook_publish', 'creator_complete'])
const CREATOR_ACTION_CORRECTION = `[CREATION ACTION REQUIRED]
This creation turn has not reached a terminal tool. Visible assistant prose does not inspect files, modify artifacts, publish a storybook, or complete the task.
Call the appropriate tools now. Finish a managed Storybook with storybook_publish, or finish an explicitly external-artifact-only request with creator_complete. Do not repeat plans or private reasoning as assistant prose.`

const readOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: { type: 'string', required: true },
    offset: { type: 'integer', required: true },
    lines: {
      type: 'array', required: true, items: {
        type: 'object', additionalProperties: false, properties: {
          number: { type: 'integer', required: true },
          text: { type: 'string', required: true },
        },
      },
    },
    totalLines: { type: 'integer', required: true },
  },
} as const

const writeOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: { type: 'string', required: true },
    operation: { type: 'string', required: true, enum: ['create', 'update'] },
    before: { required: true, oneOf: [{ type: 'string' }, { type: 'null' }] },
    after: { type: 'string', required: true },
  },
} as const

interface CreatorStory {
  readonly storyId: StoryId
  readonly story: Story
}

interface LogicalTarget {
  readonly logicalPath: string
  readonly segments: readonly string[]
  readonly physicalPath: string
}

/** Install a native, isolated tool vocabulary into one creator Agent scope. */
export function apply(ctx: Context): void {
  let correctedTurn: number | undefined
  ctx.tools.presentAs('native')
  ctx.tools.restrict({ allow: [] })
  ctx.tools.guard(execution => execution.agent?.session.header.cwd === undefined
    && LOCAL_WORKSPACE_TOOLS.has(execution.name)
    ? 'This creation task has no authorized local workspace. Create a new task and select a folder before using local file tools.'
    : undefined)
  ctx.systemPrompt.section({
    name: 'creator:prompt',
    order: FIRST_PARTY_SECTION_ORDER.ACTOR_POLICY,
    complete: true,
    text: ({ agent }) => {
      const owner = agent === undefined ? undefined : ctx.storyRegistry.storyForSession(agent.session.id)
      const story = owner === undefined ? undefined : ctx.storyRegistry.get(owner.storyId)
      const prompt = story?.promptOverrides.creatorPrompt ?? DEFAULT_STORY_CREATOR_PROMPT
      const workspace = agent?.session.header.cwd ?? '[NO LOCAL WORKSPACE AUTHORIZED]'
      const permission = agent === undefined
        ? 'host-defined'
        : ctx.get('permissionPresets')?.current(agent.session.events) ?? 'host-defined'
      return `${prompt}\n\n[LOCKED CREATION WORKSPACE BOUNDARY]\nThe player-authorized local workspace for this task is ${workspace}. The current permission mode is ${permission}. This is a Storyweaver creation workspace, not a Story runtime and not a general coding session. Director Outline, World State, Plot Ledger, group discussion, Director reasoning modules, Actor reasoning modules, and all roleplay runtime context are unavailable here. Use the provider's private reasoning channel and never expose hidden analysis or XML-like reasoning markers as visible assistant text. The local read/read_image, write/edit, glob/grep, and platform shell tools are available only to this Creator Agent. Explicit absolute local paths may be read when the task requires them. In read-only mode, do not modify local files. In workspace-write mode, local mutations are confined to the authorized workspace (plus permitted temporary locations); a denied wider mutation may request one-shot approval. In danger-full-access mode, available local tools may modify paths outside the workspace without another approval. Story draft paths are a separate managed namespace: inspect supporting draft files with storybook_list_files and story_file_read/story_file_write/story_file_edit. The canonical ${CANONICAL_STORYBOOK_PATH} must be read and saved through storybook_read/storybook_save so strict schema and revision checks always run. There are no dedicated network or delegation tools, no access to another Story, and no runtime-director or Actor authority. Use the shell only for local authoring and file transformations required by the task. Do not advance a live story, speak as its characters, or dispatch Actors while authoring. A creation turn ends only through storybook_publish or creator_complete; ordinary assistant prose cannot mark it complete.`
    },
  })
  ctx.systemPrompt.suppressRuntimeContext()

  ctx.on('agent/turn-stopping', ({ agent, turn, signal }) => {
    const owner = ctx.storyRegistry.storyForSession(agent.session.id)
    if (owner === undefined || owner.archived || owner.role !== 'control') return
    if (creatorTerminalSucceeded(agent, turn)) return
    if (correctedTurn === turn) {
      throw new Error('CREATOR_DID_NOT_COMPLETE: Creator stopped twice without storybook_publish or creator_complete')
    }
    correctedTurn = turn
    signal.throwIfAborted()
    agent.steer(createUserMessage({
      content: [{ type: 'text', text: CREATOR_ACTION_CORRECTION }],
      source: { kind: 'plugin', plugin: name, form: 'notice', summary: 'Creation action required' },
    }))
  })

  ctx.tools.register(defineTool({
    name: 'storybook_schema',
    description: 'Read the exact strict JSON Schema for the canonical Storyweaver storybook v6 document.',
    parameters: {},
    output: {
      schema: {
        type: 'object', additionalProperties: false, properties: {
          schema_json: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.schema_json }],
    },
    isConcurrencySafe: () => true,
    execute(_args, exec) {
      callingCreatorStory(ctx, exec, 'storybook_schema')
      const schema = toJSONSchema(storybookDocumentSchema, { unrepresentable: 'any' })
      return Promise.resolve({ schema_json: JSON.stringify(schema, undefined, 2) })
    },
    presentCall(): GenericCallView {
      return { card: 'generic', title: 'Inspect Storybook v6 schema', kind: 'read' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'storybook_read',
    description: 'Read the current canonical storybook as normalized v6 JSON together with the exact revision required for saving.',
    parameters: {},
    output: {
      schema: {
        type: 'object', additionalProperties: false, properties: {
          path: { type: 'string', required: true },
          revision: { type: 'string', required: true },
          storybook_json: { type: 'string', required: true },
          exists: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `<path>${value.path}</path>\n<revision>${value.revision}</revision>\n<content>\n${value.storybook_json}\n</content>`,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      const { storyId } = callingCreatorStory(ctx, exec, 'storybook_read')
      const value = await ctx.storyController.storybook({ storyId })
      return {
        path: CANONICAL_STORYBOOK_PATH,
        revision: value.revision,
        storybook_json: value.storybookJson,
        exists: value.exists,
      }
    },
    presentCall(): GenericCallView {
      return {
        card: 'generic', title: `Read ${CANONICAL_STORYBOOK_PATH}`, kind: 'read',
        locations: [{ path: CANONICAL_STORYBOOK_PATH }],
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'storybook_save',
    description: 'Validate and atomically replace the canonical Storyweaver storybook. Requires the exact revision from storybook_read.',
    parameters: {
      expected_revision: { type: 'string', required: true, description: 'Exact revision returned by the latest storybook_read.' },
      storybook_json: { type: 'string', required: true, description: 'Complete strict Storyweaver v6 JSON document.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false, properties: {
          path: { type: 'string', required: true },
          revision: { type: 'string', required: true },
          storybook_json: { type: 'string', required: true },
          actor_count: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `<path>${value.path}</path>\n<revision>${value.revision}</revision>\n<content>\nSaved valid Storyweaver v6 storybook with ${value.actor_count} characters.\n</content>`,
      }],
    },
    async execute(args, exec) {
      const { storyId } = callingCreatorStory(ctx, exec, 'storybook_save')
      const parsed = parseStorybookDocument(JSON.parse(args.storybook_json) as unknown)
      const source = `${JSON.stringify(parsed, undefined, 2)}\n`
      const value = await ctx.storyController.updateStorybook({
        storyId,
        expectedRevision: args.expected_revision,
        storybookJson: source,
      })
      await Promise.all([
        ctx.storyRegistry.setTitle(storyId, parsed.title),
        ctx.storyRegistry.setPremise(storyId, parsed.premise),
        ctx.storyRegistry.setTemplateId(storyId, parsed.id),
      ])
      return {
        path: CANONICAL_STORYBOOK_PATH,
        revision: value.revision,
        storybook_json: value.storybookJson,
        actor_count: parsed.characters.length,
      }
    },
    presentCall(args): DiffCallView {
      return {
        card: 'diff', title: `Save ${CANONICAL_STORYBOOK_PATH}`,
        diffs: [{ path: CANONICAL_STORYBOOK_PATH, oldText: null, newText: args.storybook_json }],
        locations: [{ path: CANONICAL_STORYBOOK_PATH }],
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'storybook_publish',
    description: 'Finish this creation task and publish its valid storybook into the Story library. Call only after storybook_save has completed the requested work.',
    parameters: {},
    output: {
      schema: {
        type: 'object', additionalProperties: false, properties: {
          story_id: { type: 'string', required: true },
          title: { type: 'string', required: true },
          published: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Published “${value.title}” to the Story library. This creation task is complete.`,
      }],
    },
    async execute(_args, exec) {
      const { storyId } = callingCreatorStory(ctx, exec, 'storybook_publish')
      const value = await ctx.storyController.storybook({ storyId })
      if (!value.exists) throw new Error('Save a valid storybook before publishing this creation task')
      const parsed = parseStorybookDocument(JSON.parse(value.storybookJson) as unknown)
      await ctx.storyRegistry.setTitle(storyId, parsed.title)
      await ctx.storyRegistry.setPremise(storyId, parsed.premise)
      await ctx.storyRegistry.setTemplateId(storyId, parsed.id)
      await ctx.storyRegistry.retainAsTemplate(storyId)
      exec.concludeTurn()
      return { story_id: storyId, title: parsed.title, published: true }
    },
    presentCall(): GenericCallView {
      return { card: 'generic', title: 'Publish storybook to Story library', kind: 'edit' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'creator_complete',
    description: 'Finish an explicitly external-artifact-only creation request after all requested local output files have been written. Do not use this instead of storybook_publish when the player requested a Storybook in the Story library.',
    parameters: {
      artifact_paths: { type: 'array', required: true, items: { type: 'string' }, description: 'One or more completed local file paths, absolute or relative to the authorized workspace.' },
      summary: { type: 'string', required: true, description: 'Concise description of the completed external artifacts.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false, properties: {
          artifact_paths: { type: 'array', required: true, items: { type: 'string' } },
          summary: { type: 'string', required: true },
          complete: { type: 'boolean', required: true, const: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${value.summary}\n${value.artifact_paths.join('\n')}`,
      }],
    },
    async execute(args, exec) {
      callingCreatorStory(ctx, exec, 'creator_complete')
      const workspace = exec.agent?.session.header.cwd
      if (workspace === undefined) throw new Error('creator_complete requires an authorized local workspace')
      const requested = [...new Set(args.artifact_paths.map(path => path.trim()))]
      if (requested.length === 0 || requested.some(path => path.length === 0)) {
        throw new Error('creator_complete requires at least one non-empty artifact path')
      }
      const artifacts = await Promise.all(requested.map(async (path) => {
        const physicalPath = resolve(isAbsolute(path) ? path : join(workspace, path))
        const info = await lstatIfPresent(physicalPath)
        if (info === null) throw new Error(`External artifact not found: ${physicalPath}`)
        if (!info.isFile() || info.isSymbolicLink()) throw new Error(`External artifact is not a regular file: ${physicalPath}`)
        return physicalPath
      }))
      const summary = args.summary.trim()
      if (summary.length === 0) throw new Error('creator_complete summary must not be empty')
      exec.concludeTurn()
      return { artifact_paths: artifacts, summary, complete: true as const }
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic', title: 'Complete external creation artifacts', kind: 'edit',
        locations: args.artifact_paths.map(path => ({ path })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'storybook_list_files',
    description: 'List editable UTF-8 files in the current Story workspace. Returns logical paths only.',
    parameters: {},
    output: {
      schema: {
        type: 'object', additionalProperties: false, properties: {
          files: { type: 'array', required: true, items: { type: 'string' } },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.files.length === 0 ? 'No editable Story files.' : value.files.join('\n'),
      }],
    },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      const { storyId } = callingCreatorStory(ctx, exec, 'storybook_list_files')
      await ctx.storyHome.ensureStory(storyId)
      const files: string[] = []
      for (const area of ['world', 'assets'] as const) {
        await collectLogicalFiles(ctx.storyHome.storyPath(storyId, area), area, files)
        if (files.length >= LIST_FILE_LIMIT) break
      }
      if (!files.includes(CANONICAL_STORYBOOK_PATH)) files.unshift(CANONICAL_STORYBOOK_PATH)
      return { files: files.slice(0, LIST_FILE_LIMIT), truncated: files.length > LIST_FILE_LIMIT }
    },
    presentCall(): GenericCallView {
      return { card: 'generic', title: 'List Story workspace files', kind: 'search' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'story_file_read',
    description: `Read a managed Story draft UTF-8 text file under world/ or assets/. Use the local read tool for files in the authorized workspace and storybook_read for ${CANONICAL_STORYBOOK_PATH}.`,
    parameters: {
      file_path: { type: 'string', required: true, description: 'Logical Story path under world/ or assets/.' },
      offset: { type: 'integer', description: '1-based first line. Defaults to 1.' },
      limit: { type: 'integer', description: `Maximum returned lines, up to ${READ_LINE_LIMIT}.` },
    },
    output: {
      schema: readOutputSchema,
      render: (_args, value) => [{
        type: 'text',
        text: `<path>${value.path}</path>\n<type>file</type>\n<content>\n${value.lines.map(line => `${line.number}: ${line.text}`).join('\n')}\n</content>`,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const { storyId } = callingCreatorStory(ctx, exec, 'story_file_read')
      const target = logicalTarget(ctx, storyId, args.file_path)
      const offset = positiveInteger(args.offset ?? 1, 'offset')
      const limit = positiveInteger(args.limit ?? READ_LINE_LIMIT, 'limit')
      if (limit > READ_LINE_LIMIT) throw new Error(`limit must be at most ${READ_LINE_LIMIT}`)
      const source = target.logicalPath === CANONICAL_STORYBOOK_PATH
        ? (await ctx.storyController.storybook({ storyId })).storybookJson
        : await (async () => {
          await assertSafeLogicalTarget(ctx, storyId, target)
          return await readLogicalText(target)
        })()
      const allLines = source.split(/\r?\n/u)
      const lines = allLines.slice(offset - 1, offset - 1 + limit)
        .map((text, index) => ({ number: offset + index, text }))
      return { path: target.logicalPath, offset, lines, totalLines: allLines.length }
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic', title: `Read ${args.file_path}`, kind: 'read',
        locations: [{ path: args.file_path, ...(args.offset === undefined ? {} : { line: args.offset }) }],
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'story_file_write',
    description: `Create or replace a managed Story draft UTF-8 text file under world/ or assets/. Use the local write tool for the authorized workspace. ${CANONICAL_STORYBOOK_PATH} is rejected; use storybook_save.`,
    parameters: {
      file_path: { type: 'string', required: true, description: 'Logical Story path under world/ or assets/.' },
      content: { type: 'string', required: true, description: 'Complete replacement UTF-8 content.' },
    },
    output: {
      schema: writeOutputSchema,
      render: (_args, value) => [{
        type: 'text',
        text: `<path>${value.path}</path>\n<type>file</type>\n<content>\n${value.operation === 'create' ? 'Created' : 'Updated'} file\n</content>`,
      }],
    },
    async execute(args, exec) {
      const { storyId } = callingCreatorStory(ctx, exec, 'story_file_write')
      const target = writableLogicalTarget(ctx, storyId, args.file_path)
      ensureTextSize(args.content)
      await assertSafeLogicalTarget(ctx, storyId, target)
      const before = await readLogicalTextIfPresent(target)
      await writeFileAtomic(target.physicalPath, args.content, { mode: 0o600, dirMode: 0o700 })
      return {
        path: target.logicalPath,
        operation: before === null ? 'create' as const : 'update' as const,
        before,
        after: args.content,
      }
    },
    presentCall(args): DiffCallView {
      return {
        card: 'diff', title: `Write ${args.file_path}`,
        diffs: [{ path: args.file_path, oldText: null, newText: args.content }],
        locations: [{ path: args.file_path }],
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'story_file_edit',
    description: `Replace literal text in an existing managed Story draft file under world/ or assets/. Use the local edit tool for the authorized workspace. ${CANONICAL_STORYBOOK_PATH} is rejected; use storybook_save.`,
    parameters: {
      file_path: { type: 'string', required: true, description: 'Logical Story path under world/ or assets/.' },
      old_string: { type: 'string', required: true, description: 'Exact literal text to replace.' },
      new_string: { type: 'string', required: true, description: 'Replacement text; may be empty.' },
      replace_all: { type: 'boolean', description: 'Replace every occurrence. Defaults to false.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false, properties: {
          path: { type: 'string', required: true },
          before: { type: 'string', required: true },
          after: { type: 'string', required: true },
          replacements: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `The file ${value.path} has been updated successfully (${value.replacements} replacement${value.replacements === 1 ? '' : 's'}).`,
      }],
    },
    async execute(args, exec) {
      const { storyId } = callingCreatorStory(ctx, exec, 'story_file_edit')
      const target = writableLogicalTarget(ctx, storyId, args.file_path)
      if (args.old_string.length === 0) throw new Error('old_string must not be empty')
      if (args.old_string === args.new_string) throw new Error('old_string and new_string must differ')
      await assertSafeLogicalTarget(ctx, storyId, target)
      const before = await readLogicalText(target)
      const matches = before.split(args.old_string).length - 1
      if (matches === 0) throw new Error(`old_string was not found in ${target.logicalPath}`)
      if (args.replace_all !== true && matches !== 1) {
        throw new Error(`old_string appears ${matches} times in ${target.logicalPath}; provide a unique match or set replace_all=true`)
      }
      const after = args.replace_all === true
        ? before.split(args.old_string).join(args.new_string)
        : before.replace(args.old_string, args.new_string)
      ensureTextSize(after)
      await writeFileAtomic(target.physicalPath, after, { mode: 0o600, dirMode: 0o700 })
      return { path: target.logicalPath, before, after, replacements: args.replace_all === true ? matches : 1 }
    },
    presentCall(args): DiffCallView {
      return {
        card: 'diff', title: `Edit ${args.file_path}`,
        diffs: [{ path: args.file_path, oldText: args.old_string, newText: args.new_string }],
        locations: [{ path: args.file_path }],
      }
    },
  }))
}

function creatorTerminalSucceeded(agent: Agent, turn: number): boolean {
  const successfulResults = new Set(agent.session.events.flatMap(event => (
    event.type === 'tool/result' && event.data.turn === turn && event.data.error === undefined
      ? [event.data.message.source.callId]
      : []
  )))
  return agent.session.events.some(event => (
    event.type === 'tool/call'
    && event.data.turn === turn
    && CREATOR_TERMINAL_TOOLS.has(event.data.name)
    && successfulResults.has(event.data.callId)
  ))
}

function callingCreatorStory(ctx: Context, exec: ToolRunContext, toolName: string): CreatorStory {
  const agent = exec.agent
  if (agent === undefined) throw new Error(`${toolName} requires a calling Story creator`)
  const owner = ctx.storyRegistry.storyForSession(agent.session.id)
  if (owner === undefined || owner.role !== 'control' || owner.archived) {
    throw new Error(`${toolName} is available only inside the active creation workspace for one Story`)
  }
  const story = ctx.storyRegistry.get(owner.storyId)
  if (story === undefined || story.archivedAt !== undefined) throw new Error('The owning Story is unavailable')
  return { storyId: owner.storyId, story }
}

function logicalTarget(ctx: Context, storyId: StoryId, input: string): LogicalTarget {
  if (input.trim() !== input || input.includes('\\') || input.startsWith('/')) {
    throw new Error('file_path must be a normalized logical path such as world/opening.md')
  }
  const segments = input.split('/')
  if (segments.length < 2 || segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new Error('file_path must stay under world/ or assets/ and contain no empty, . or .. segments')
  }
  const area = segments[0]
  if (area === undefined || !WRITABLE_AREAS.has(area)) {
    throw new Error('file_path must stay under world/ or assets/')
  }
  const extension = extname(segments.at(-1) ?? '').toLowerCase()
  if (!TEXT_EXTENSIONS.has(extension)) {
    throw new Error(`Only UTF-8 text files are available (${[...TEXT_EXTENSIONS].join(', ')})`)
  }
  return {
    logicalPath: segments.join('/'),
    segments,
    physicalPath: ctx.storyHome.storyPath(storyId, ...segments),
  }
}

function writableLogicalTarget(ctx: Context, storyId: StoryId, input: string): LogicalTarget {
  const target = logicalTarget(ctx, storyId, input)
  if (target.logicalPath === CANONICAL_STORYBOOK_PATH) {
    throw new Error(`${CANONICAL_STORYBOOK_PATH} must be changed with storybook_save so schema and revision checks run`)
  }
  return target
}

async function assertSafeLogicalTarget(ctx: Context, storyId: StoryId, target: LogicalTarget): Promise<void> {
  await ctx.storyHome.ensureStory(storyId)
  for (let index = 1; index <= target.segments.length; index += 1) {
    const path = ctx.storyHome.storyPath(storyId, ...target.segments.slice(0, index))
    const info = await lstatIfPresent(path)
    if (info === null) continue
    if (info.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in the Story workspace: ${target.logicalPath}`)
    const isTarget = index === target.segments.length
    if (isTarget ? !info.isFile() : !info.isDirectory()) {
      throw new Error(`${target.logicalPath} does not resolve to a regular text file`)
    }
  }
}

async function readLogicalText(target: LogicalTarget): Promise<string> {
  const info = await lstatIfPresent(target.physicalPath)
  if (info === null) throw new Error(`File not found: ${target.logicalPath}`)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Not a regular Story text file: ${target.logicalPath}`)
  if (info.size > MAX_TEXT_BYTES) throw new Error(`${target.logicalPath} exceeds the ${MAX_TEXT_BYTES}-byte authoring limit`)
  return await readFile(target.physicalPath, 'utf8')
}

async function readLogicalTextIfPresent(target: LogicalTarget): Promise<string | null> {
  const info = await lstatIfPresent(target.physicalPath)
  if (info === null) return null
  return await readLogicalText(target)
}

async function lstatIfPresent(path: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(path)
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

async function collectLogicalFiles(root: string, prefix: string, output: string[]): Promise<void> {
  if (output.length >= LIST_FILE_LIMIT) return
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (output.length >= LIST_FILE_LIMIT) return
    if (entry.isSymbolicLink()) continue
    const logical = `${prefix}/${entry.name}`
    const physical = join(root, entry.name)
    if (entry.isDirectory()) {
      await collectLogicalFiles(physical, logical, output)
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      output.push(logical)
    }
  }
}

function ensureTextSize(value: string): void {
  const bytes = Buffer.byteLength(value, 'utf8')
  if (bytes > MAX_TEXT_BYTES) throw new Error(`Text file exceeds the ${MAX_TEXT_BYTES}-byte authoring limit`)
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`)
  return value
}
