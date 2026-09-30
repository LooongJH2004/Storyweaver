/** Native creator tools write revision-checked drafts, never live narrative instances. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { BookId, Document } from '@deepseek-ai/dsh-roleplay-core/types'
import { parseStorybookDocument, storybookDocumentSchema } from '@deepseek-ai/dsh-roleplay-core/storybook'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { FIRST_PARTY_SECTION_ORDER } from '@deepseek-ai/dsh-system-prompt'
import { toJSONSchema } from 'zod'
import { createMessage } from '@deepseek-ai/dsh-llm'
import type {} from './index.ts'

/** Isolated author preset plugin. */
export const name = 'roleplay-creator'
/** Only draft services are reachable from this preset. */
export const inject = ['roleplayBooks', 'roleplayCreation', 'tools', 'systemPrompt']

/** Install author tools in the native preset scope. */
export function apply(ctx: Context): void {
  const bookFor = (agent: Agent | undefined) => {
    if (agent?.session.header.agentPreset !== 'storyweaver-author' || !agent.session.id.startsWith('creator-'))
      throw new Error('A book-bound authoring session is required')
    const book = ctx.roleplayBooks.draft(agent.session.id.slice('creator-'.length) as BookId)
    if (book === undefined || book.deleted) throw new Error('The storybook draft is unavailable')
    return book
  }
  ctx.tools.presentAs('native')
  ctx.tools.restrict({ allow: [] })
  const localTools = new Set(['read', 'read_image', 'write', 'edit', 'glob', 'grep', 'bash', 'pwsh'])
  ctx.tools.guard((execution) => {
    if (!localTools.has(execution.name)) return undefined
    const book = bookFor(execution.agent)
    const preferences = ctx.roleplayCreation.read(book.id)
    return preferences.cwd === null || preferences.cwd !== execution.agent?.session.header.cwd
      ? 'This task has no authorized local workspace. Start a creation task with an explicitly selected directory to use local file tools.' : undefined
  })
  ctx.on('agent/request-prefix-context', async ({ agent }, next) => {
    const inherited = await next()
    const preferences = ctx.roleplayCreation.read(bookFor(agent).id)
    return !preferences.enabled || preferences.prompt === '' ? inherited : [...inherited, createMessage({ role: preferences.role,
      content: [{ type: 'text', text: preferences.prompt }], source: { kind: 'plugin', plugin: name, form: 'snapshot',
        sections: [{ name: 'creator-guidance', text: preferences.prompt }] } })]
  })
  ctx.systemPrompt.suppressRuntimeContext()
  ctx.systemPrompt.section({ name: 'creator:book', order: FIRST_PARTY_SECTION_ORDER.ACTOR_POLICY, complete: true,
    text: ({ agent }) => {
      const book = bookFor(agent)
      const preferences = ctx.roleplayCreation.read(book.id)
      return `You are the Storyweaver storybook author. This is an authoring conversation, not a running story. Read the current draft and exact schema before editing. protagonistActorId is optional: leave it null or omitted unless a narrative lead is intended. When set, reference an existing characters entry; a name in prose creates no character. Player control is selected separately during play, never by this field. Use storybook_save to persist requested changes. A saved draft is not published. Publish only when the player explicitly requests publication; otherwise explain the saved changes and continue the conversation. Never claim that prose alone changed the draft. Keep private reasoning in the provider reasoning channel. No live instance, director execution, or actor authority is available. Local file tools follow the native session permission policy and may be used only for the player’s authoring task. Files written outside the managed draft do not publish a book.\nAuthorized local workspace: ${preferences.cwd ?? '[NONE — local file tools are unavailable]'}\nBook: ${book.id}\nTitle: ${book.title}\nCurrent draft revision: ${book.revision}`
    } })
  const result = (value: unknown) => Promise.resolve({ result: JSON.stringify(value) })
  const output = { schema: { type: 'object', additionalProperties: false,
    properties: { result: { type: 'string', required: true } } } as const,
  render: (_args: unknown, value: { result: string }) => [{ type: 'text' as const, text: value.result }] }
  ctx.tools.register(defineTool({ name: 'storybook_schema', description: 'Read the complete storybook JSON schema before authoring.',
    parameters: {}, output, isConcurrencySafe: () => true,
    execute: (_args, exec) => { bookFor(exec.agent); return result(toJSONSchema(storybookDocumentSchema, { unrepresentable: 'any' })) },
  }))
  ctx.tools.register(defineTool({ name: 'storybook_read', description: 'Read this session’s storybook draft, resources, and exact save revision.',
    parameters: {}, output, isConcurrencySafe: () => true,
    execute: (_args, exec) => result(bookFor(exec.agent)),
  }))
  ctx.tools.register(defineTool({ name: 'storybook_save', description: 'Validate and save this book’s draft. Does not change published versions or existing story instances.',
    parameters: { expected_revision: { type: 'integer', required: true }, storybook_json: { type: 'string', required: true } }, output,
    execute: (args, exec) => {
      const book = bookFor(exec.agent)
      const document = parseStorybookDocument(JSON.parse(args.storybook_json) as unknown)
      const saved = ctx.roleplayBooks.saveDraft({ id: book.id, expectedRevision: args.expected_revision, title: document.title,
        document: JSON.parse(JSON.stringify(document)) as Document, resources: book.resources })
      return result(saved)
    },
  }))
  ctx.tools.register(defineTool({ name: 'storybook_preview', description: 'Review the exact normalized publication content at the current draft revision.',
    parameters: {}, output, isConcurrencySafe: () => true,
    execute: (_args, exec) => { const book = bookFor(exec.agent)
      return result(ctx.roleplayBooks.previewPublication(book.id, book.revision)) },
  }))
  ctx.tools.register(defineTool({ name: 'storybook_publish', description: 'Publish an immutable version when the player has explicitly requested publication. Existing instances retain their pinned versions.',
    parameters: { expected_revision: { type: 'integer', required: true } }, output,
    execute: (args, exec) => { const book = bookFor(exec.agent)
      return result(ctx.roleplayBooks.publish(book.id, args.expected_revision)) },
  }))
}
