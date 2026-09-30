/** Ordered narrative context configuration is independent of model protocols and execution logs. */
import { z } from 'zod'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { entity, RoleplayError } from './records.ts'
import type { NarrativeSnapshot } from './types.ts'
import { ACTOR_REASONING_MODE, DIRECTOR_REASONING_MODE } from './reasoning-mode.ts'
import { ACTOR_PERFORMANCE_GUIDANCE, DIRECTOR_PERFORMANCE_GUIDANCE } from './performance-guidance.ts'
import { legacyContextRecipe } from './legacy-context-recipe.ts'
export { legacyContextRecipe } from './legacy-context-recipe.ts'

const sections = ['identity', 'people', 'subjective-state', 'objective-state', 'author-setting', 'director-prompt', 'planning', 'guidance',
  'style', 'scene-style', 'discussion', 'retention', 'common-knowledge', 'evidence', 'knowledge', 'lifecycle', 'behavior', 'player-guidance', 'policy', 'tools', 'reasoning-language', 'reasoning-mode', 'performance'] as const
/** Author modules may change wording and roles without changing host permissions. */
export const contextSectionSchema = z.strictObject({
  id: z.union([z.enum(sections), z.string().regex(/^custom:[a-z0-9-]{1,80}$/u)]),
  enabled: z.boolean(), role: z.enum(['system', 'user', 'assistant']),
  title: z.string().trim().min(1).max(160).optional(), content: z.string().trim().min(1).optional(),
}).superRefine((item, ctx) => {
  if (item.id.startsWith('custom:') || ['reasoning-mode', 'performance'].includes(item.id) ? item.title === undefined || item.content === undefined
    : item.title !== undefined || item.content !== undefined) ctx.addIssue({ code: 'custom', message: 'Custom, reasoning-mode and performance sections require authored title and content; other sections cannot carry them' })
})
/** One ordered source configuration. */
export type ContextSection = z.infer<typeof contextSectionSchema>
const actorIds = ['identity', 'people', 'subjective-state', 'objective-state', 'guidance', 'style', 'scene-style',
  'discussion', 'retention', 'common-knowledge', 'evidence', 'knowledge', 'lifecycle']
const directorIds = ['author-setting', 'planning', 'people', 'guidance', 'style', 'scene-style', 'discussion',
  'player-guidance', 'retention', 'objective-state', 'evidence', 'behavior']
/** Explicit author-owned length settings; absent settings do not enforce a prose minimum. */
export const narrationLengthSchema = z.strictObject({ enabled: z.boolean(),
  minimum: z.number().int().min(1).max(10000), target: z.number().int().min(1).max(10000),
}).refine(value => value.target >= value.minimum, { message: 'Narration target must be at least its minimum', path: ['target'] })
/** Count visible letters and digits; punctuation, whitespace, Markdown destinations and tags do not contribute.
 * @param text - Narration after observer identity projection.
 * @returns Unicode letter/digit count, with each Latin letter counted individually.
 */
export function narrationCharacterCount(text: string): number {
  const root = fromMarkdown(text.replace(/(?:\\r\\n|\\n){2,}/gu, '\n\n'))
  const visible = (node: typeof root | typeof root.children[number]): string => {
    if (node.type === 'text' || node.type === 'code' || node.type === 'inlineCode') return node.value
    if (node.type === 'image' || node.type === 'imageReference') return node.alt ?? ''
    if ('children' in node) return node.children.map(visible).join('')
    return ''
  }
  return [...visible(root).matchAll(/[\p{L}\p{N}]/gu)].length
}
/** Pure persisted recipe validation never upgrades stored data during reads. */
export const contextRecipeSchema = z.strictObject({ revision: z.number().int().nonnegative(),
  actor: z.array(contextSectionSchema), director: z.array(contextSectionSchema),
  narrationLength: narrationLengthSchema.optional(),
}).superRefine((recipe, ctx) => {
  for (const [side, required] of [['actor', actorIds], ['director', directorIds]] as const) {
    const items = recipe[side]
    if (new Set(items.map(item => item.id)).size !== items.length || required.some(id => !items.some(item => item.id === id))
      || items.some(item => !item.id.startsWith('custom:') && !required.includes(item.id) && !['policy', 'tools', 'reasoning-language', 'reasoning-mode', 'performance', ...(side === 'director' ? ['director-prompt'] : [])].includes(item.id))) {
      ctx.addIssue({ code: 'custom', message: `Invalid ${side} context sources` })
    }
  }
})
/** Instance-owned source ordering and custom modules. */
export type ContextRecipe = z.infer<typeof contextRecipeSchema>

const cacheOrder = ['policy', 'tools', 'reasoning-language', 'performance', 'identity', 'common-knowledge', 'guidance', 'style',
  'knowledge', 'lifecycle', 'retention', 'people', 'subjective-state', 'objective-state', 'scene-style', 'discussion', 'evidence']

/**
 * Place stable actor sources before volatile sources without changing selected content.
 * @param recipe - An editable recipe; custom modules, reasoning and role changes delimit reorderable groups.
 * @returns A copied recipe with the Director side and every module's fields preserved.
 */
export function optimizeActorContextRecipe(recipe: ContextRecipe): ContextRecipe {
  const actor: ContextSection[] = []
  let group: ContextSection[] = []
  const flush = () => {
    actor.push(...group.sort((a, b) => cacheOrder.indexOf(a.id) - cacheOrder.indexOf(b.id)))
    group = []
  }
  for (const section of recipe.actor) {
    if (!cacheOrder.includes(section.id)) { flush(); actor.push(section); continue }
    if (group.length > 0 && group[0]?.role !== section.role) flush()
    group.push(section)
  }
  flush()
  return { ...recipe, actor }
}
/** Copy an editable instruction; restoring it is an explicit author operation. */
export function reasoningSection(side: 'actor' | 'director'): ContextSection {
  return { id: 'reasoning-mode', enabled: true, role: 'user',
    title: side === 'actor' ? '演员沉浸思维链' : '导演简短思维链',
    content: side === 'actor' ? ACTOR_REASONING_MODE : DIRECTOR_REASONING_MODE }
}
/** Copy the editable creative defaults for one audience. */
export function performanceSection(side: 'actor' | 'director'): ContextSection {
  return { id: 'performance', enabled: true, role: 'system', title: '创作与推进规则',
    content: side === 'actor' ? ACTOR_PERFORMANCE_GUIDANCE : DIRECTOR_PERFORMANCE_GUIDANCE }
}
/**
 * Resolve historical implicit creative defaults without replacing explicit edits or disabled modules.
 * @param recipe - Persisted configuration or an editable draft, including temporarily empty text.
 * @returns The same recipe when explicit, otherwise a copy with visible inherited modules.
 */
export function resolveContextRecipe(recipe: ContextRecipe): ContextRecipe {
  if (recipe.actor.some(item => item.id === 'performance') && recipe.director.some(item => item.id === 'performance')) return recipe
  const side = (key: 'actor' | 'director') => recipe[key].some(item => item.id === 'performance')
    ? recipe[key] : [...legacyContextRecipe()[key].filter(section => section.id === 'performance'), ...recipe[key]]
  return { ...recipe, actor: side('actor'), director: side('director') }
}
/** Initial configuration copies the saved Moonshadow Ledger ordering and preferences, with revised performance guidance.
 * @returns A new editable recipe, independent of books and system-saved overrides.
 */
export function initialContextRecipe(): ContextRecipe {
  const side = (ids: string[]): ContextSection[] => ['policy', 'tools', 'reasoning-language', ...ids.filter(id => id !== 'player-guidance'),
    ...ids.filter(id => id === 'player-guidance')].map(id => ({ id, enabled: true, role: id === 'player-guidance' ? 'user' : 'system' }))
  return optimizeActorContextRecipe({ revision: 0, actor: [performanceSection('actor'), ...side(actorIds), reasoningSection('actor')],
    director: [performanceSection('director'), ...side(directorIds.flatMap(id => id === 'author-setting' ? [id, 'director-prompt'] : [id])), reasoningSection('director')] })
}

/** Explicitly repair the shipped all-user defaults, preserving custom modules and intentional mixed roles. */
export function repairContextRecipe(recipe: ContextRecipe): ContextRecipe {
  const defaults = initialContextRecipe()
  const repair = (side: 'actor' | 'director'): ContextSection[] => {
    const sections = recipe[side]
    const allUser = sections.filter(section => !section.id.startsWith('custom:') && section.id !== 'reasoning-mode'
      && section.id !== 'player-guidance').every(section => section.role === 'user')
    const next = sections.map((section) => {
      if (side === 'director' && section.id === 'reasoning-mode'
        && section.content === obsoleteDirectorMode) return { ...section, content: DIRECTOR_REASONING_MODE }
      return allUser && !section.id.startsWith('custom:') && section.id !== 'reasoning-mode' && section.id !== 'player-guidance'
        ? { ...section, role: 'system' as const } : section
    })
    for (const section of defaults[side]) if (!next.some(item => item.id === section.id)) {
      if (section.id === 'reasoning-mode') next.push(section)
      else next.unshift(section)
    }
    if (!allUser) return next
    return [...next.filter(section => section.id !== 'player-guidance' && section.id !== 'reasoning-mode'),
      ...next.filter(section => section.id === 'player-guidance'), ...next.filter(section => section.id === 'reasoning-mode')]
  }
  return { ...recipe, director: repair('director'), actor: repair('actor') }
}

const obsoleteDirectorMode = `〖导演简短思考要求〗在你的思考过程（<think>标签内）中，请遵守以下规则：
1. 每次用一至三个短句，以幕后导演第一人称判断当前戏剧压力、下一拍客观推进和立即执行的动作；不要复述上下文、展开长篇分析或预写旁白正文
2. 持久角色的台词、私密心理和自主选择交给角色本人；需要多方追问、回应或协商时安排群组讨论
3. 确定下一拍后，用 director_observe 提交客观结果与旁白，再用 director_command 调度角色；旁白不续写角色的反应或发言。思考保留在私有推理通道；只有工具实际报错时才纠正参数，不讨论代码或宿主内部实现。`
/** Resolve the persisted recipe for both author views and model requests; reads never write storage. */
export function recipeOf(snapshot: NarrativeSnapshot): ContextRecipe {
  return resolveContextRecipe(contextRecipeSchema.parse(entity(snapshot, { collection: 'context-recipe', id: 'current' })))
}
/** A rendered source retains the exact model role, content and provenance. */
export interface RenderedContextSection { readonly id: string
  readonly role: 'system' | 'user' | 'assistant'
  readonly content: string
  readonly sources: readonly string[] }

/** Collect complete source text and apply the configured section ordering without a character ceiling. */
export class ContextAssembly {
  private readonly sectionsById = new Map<string, ContextSection>()
  private readonly renderedById = new Map<string, RenderedContextSection[]>()
  constructor(private readonly recipe: readonly ContextSection[]) {
    for (const section of recipe) if (!this.sectionsById.has(section.id)) this.sectionsById.set(section.id, section)
    for (const section of recipe) if (section.enabled && section.content !== undefined) {
      this.add(section.id, ['reasoning-mode', 'performance'].includes(section.id) ? section.content
        : `[AUTHOR REFERENCE — not lived history: ${section.title}]\n${section.content}`, `recipe:${section.id}`)
    }
  }
  /** Enabled nonempty sources are retained in full; undeclared sections fail visibly. */
  add(id: string, content: string, source: string): boolean {
    const section = this.sectionsById.get(id)
    if (section === undefined) throw new RoleplayError('invalid', 'Context source has no declared recipe section')
    if (!section.enabled || content === '') return false
    let rendered = this.renderedById.get(id)
    if (rendered === undefined) { rendered = []; this.renderedById.set(id, rendered) }
    rendered.push({ id, role: section.role, content, sources: [source] })
    return true
  }
  /**
   * Render authorized history in chronological order without dropping or shortening entries.
   * @param id - Authored section that owns these entries.
   * @param entries - Already filtered history, ordered oldest to newest.
   */
  addHistory(id: string, entries: readonly { content: string; source: string }[]): void {
    for (const entry of entries) this.add(id, entry.content, entry.source)
  }
  /** Rendering preserves author order and reports exactly the included original sources. */
  finish(): { text: string; sources: string[]; sections: RenderedContextSection[] } {
    const ordered = this.recipe.flatMap(section => this.renderedById.get(section.id) ?? [])
    return { text: ordered.map(item => item.content).join('\n\n'), sources: ordered.flatMap(item => item.sources), sections: ordered }
  }
}
