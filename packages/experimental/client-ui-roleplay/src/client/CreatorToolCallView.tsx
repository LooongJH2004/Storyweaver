/** Creation-mode-only Tool trace; Director and Actor tool internals remain hidden. */
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import { isCreatorSession } from './RoleplayChrome.tsx'
import css from './RoleplayChrome.module.css'

type CreatorToolCallProps =
  PropsRuntime<'conversation.chat.node', 'tool-call'> & PropsLocale<typeof NS>

const CREATOR_TOOLS = new Set([
  'storybook_schema', 'storybook_read', 'storybook_save', 'storybook_publish', 'storybook_list_files',
  'story_file_read', 'story_file_write', 'story_file_edit',
  'read', 'read_image', 'write', 'edit', 'glob', 'grep',
])

function toolName(block: ToolCallBlock): string {
  return 'kind' in block ? block.call?.name ?? block.callId : block.name
}

function argsRaw(block: ToolCallBlock): string {
  return 'kind' in block ? block.call?.argsRaw ?? '' : block.argsRaw
}

function resultText(block: ToolCallBlock): string {
  if (!('kind' in block)) return ''
  return block.content.flatMap(item => item.type === 'text' ? [item.text] : []).join('\n')
}

function parsedArgs(block: ToolCallBlock): Record<string, unknown> | null {
  try {
    const value = JSON.parse(argsRaw(block)) as unknown
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function toolLabel(name: string, t: CreatorToolCallProps['t']): string {
  switch (name) {
    case 'storybook_schema': return t('creator.tool.schema')
    case 'storybook_read': return t('creator.tool.storybookRead')
    case 'storybook_save': return t('creator.tool.storybookSave')
    case 'storybook_publish': return t('creator.tool.publish')
    case 'storybook_list_files': return t('creator.tool.list')
    case 'story_file_read':
    case 'read':
    case 'read_image': return t('creator.tool.read')
    case 'story_file_write':
    case 'write': return t('creator.tool.write')
    case 'story_file_edit':
    case 'edit': return t('creator.tool.edit')
    case 'glob':
    case 'grep': return t('creator.tool.search')
    default: return name
  }
}

function ToolBranch({ block, t }: { readonly block: ToolCallBlock; readonly t: CreatorToolCallProps['t'] }) {
  const name = toolName(block)
  if (!CREATOR_TOOLS.has(name)) return null
  const args = parsedArgs(block)
  const path = typeof args?.file_path === 'string'
    ? args.file_path
    : name === 'storybook_read' || name === 'storybook_save' ? 'world/storybook.json' : undefined
  const settled = 'kind' in block
  const failed = 'kind' in block && block.isError
  const output = resultText(block)
  const hasDetails = argsRaw(block) !== '' || output !== ''
  const state = !settled ? 'running' : failed ? 'error' : 'done'
  return (
    <div className={css.creatorToolBranch} data-state={state}>
      <details className={css.creatorToolCall}>
        <summary aria-label={toolLabel(name, t)}>
          <span className={css.creatorToolState} aria-hidden="true" />
          <span className={css.creatorToolName}>{toolLabel(name, t)}</span>
          {path !== undefined && <code>{path}</code>}
          <span className={css.creatorToolStatus}>
            {!settled ? t('creator.tool.running') : failed ? t('creator.tool.failed') : t('creator.tool.done')}
          </span>
          {hasDetails && <span className={css.creatorToolChevron} aria-hidden="true" />}
        </summary>
        {hasDetails && (
          <div className={css.creatorToolDetails}>
            {argsRaw(block) !== '' && (
              <section>
                <strong>{t('creator.tool.input')}</strong>
                <pre>{argsRaw(block)}</pre>
              </section>
            )}
            {output !== '' && (
              <section>
                <strong>{failed ? t('creator.tool.error') : t('creator.tool.output')}</strong>
                <pre>{output}</pre>
              </section>
            )}
          </div>
        )}
      </details>
      {block.subCalls.length > 0 && (
        <div className={css.creatorSubTools}>
          {block.subCalls.map(child => <ToolBranch key={child.callId} block={child} t={t} />)}
        </div>
      )}
    </div>
  )
}

/** Show the familiar expandable Agent tool trace only inside a control Session. */
export function CreatorToolCallView({ node, sessionId, useSessions, t }: CreatorToolCallProps) {
  if (!isCreatorSession({ sessionId, useSessions })) return null
  return <ToolBranch block={node.data.root} t={t} />
}
