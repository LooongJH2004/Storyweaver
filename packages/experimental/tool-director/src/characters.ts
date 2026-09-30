/** Role-authorized creation and bounded recall for an expanding story cast. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { storybookActorDefinitionSchema, queryKnowledge, emptyKnowledge, currentStorySceneCast } from '@deepseek-ai/dsh-story'

const output = {
  schema: { type: 'object' as const, additionalProperties: false, properties: { result: { type: 'string' as const, required: true as const } } },
  render: (_args: unknown, value: { result: string }) => [{ type: 'text' as const, text: value.result }],
}

/**
 * Build Director-only roster tools; definitions stay story-local until explicitly collected by the player.
 * @param ctx - Authenticated Story and tool services.
 * @param limit - Configured maximum people returned per page.
 * @returns tools with authorization enforced inside their executors.
 */
export function characterTools(ctx: Context, limit: number): ToolDefinition[] {
  return [defineTool({
    name: 'director_find_characters',
    description: 'Search existing story people before creating anyone. Same name or occupation does not prove identity. Use exact returned actor_id when reusing a person. Off-scene people do not receive current events. Pagination avoids loading the whole cast.',
    parameters: { query: { type: 'string' }, location: { type: 'string' }, actor_id: { type: 'string' }, offset: { type: 'integer' } }, output,
    execute(args, exec) {
      const owner = exec.agent === undefined ? undefined : ctx.storyRegistry.storyForSession(exec.agent.session.id)
      if (owner?.role !== 'scene' || owner.archived) throw new Error('Only the Director can search the world character registry')
      const story = ctx.storyRegistry.get(owner.storyId)
      if (story === undefined) throw new Error('Story unavailable')
      const offset = args.offset ?? 0
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Character offset must be nonnegative')
      const scene = currentStorySceneCast(story.world)
      const found = story.world.characters.entries.filter(item => !item.archived
        && (args.actor_id === undefined || item.definition.actorId === args.actor_id)
        && (args.location === undefined || item.location.includes(args.location))
        && (args.query === undefined || `${item.definition.displayName} ${item.definition.publicPersona} ${item.purpose}`.toLocaleLowerCase().includes(args.query.toLocaleLowerCase())))
      return Promise.resolve({ result: JSON.stringify({ registry_revision: story.world.characters.revision,
        people: found.slice(offset, offset + limit).map(item => ({ actor_id: item.definition.actorId,
          name: item.definition.displayName, appearance: item.definition.appearance, persona: item.definition.publicPersona,
          purpose: item.purpose, location: item.location, present: scene?.presentActorIds.includes(item.definition.actorId) ?? false })),
        next: offset + limit < found.length ? offset + limit : null }) })
    },
  }), defineTool({
    name: 'director_create_character',
    description: 'Create one story-local supporting person before staging them. Search existing people first. Invent ordinary background freely. Plot-critical past involvement or secret knowledge requires cited existing world events or explicit authored facts; never invent a witness to solve a mystery. Create background crowds through narration instead. Creation alone does not stage or wake this Actor.',
    parameters: {
      expected_registry_revision: { type: 'integer', required: true }, name: { type: 'string', required: true },
      appearance: { type: 'string', required: true, description: 'Observable appearance without an unrevealed name or secret identity.' },
      persona: { type: 'string', required: true }, role_prompt: { type: 'string', required: true },
      purpose: { type: 'string', required: true }, location: { type: 'string', required: true },
      backstory: { type: 'string', enum: ['ordinary', 'plot-critical'], required: true },
      source_refs: { type: 'array', items: { type: 'string' }, required: true },
      initial_knowledge: { type: 'array', items: { type: 'string' } },
    }, output,
    async execute(args, exec) {
      const owner = exec.agent === undefined ? undefined : ctx.storyRegistry.storyForSession(exec.agent.session.id)
      if (owner?.role !== 'scene' || owner.archived) throw new Error('Only the Director can create runtime characters')
      const story = ctx.storyRegistry.get(owner.storyId)
      if (story === undefined) throw new Error('Story unavailable')
      const validSources = new Set([...story.world.events.filter(event => event.status === 'established').map(event => event.id),
        ...Object.keys(story.world.facts).map(key => `fact:${key}`)])
      if (args.source_refs.some(ref => !validSources.has(ref)) || (args.backstory === 'plot-critical' && args.source_refs.length === 0)) {
        throw new Error('Plot history requires existing world-event or authored fact references')
      }
      const actorId = `character-${randomUUID()}`
      const definition = storybookActorDefinitionSchema.parse({ actorId, displayName: args.name,
        appearance: args.appearance, publicPersona: args.persona, rolePrompt: args.role_prompt,
        capabilities: ['speak', 'act', 'reflect', 'memory', 'goals'], actingGuidance: {},
        initialKnowledge: (args.initial_knowledge ?? []).map(text => ({ text })),
      })
      const changed = await ctx.storyRegistry.saveCharacter(owner.storyId, args.expected_registry_revision, {
        definition, revision: 1, importance: 'supporting', purpose: args.purpose, sourceRefs: args.source_refs,
        location: args.location, origin: 'director', archived: false, createdAt: new Date().toISOString(),
      })
      return { result: JSON.stringify({ actor_id: actorId, registry_revision: changed.world.characters.revision,
        same_name_candidates: story.world.characters.entries.filter(item => item.definition.actorId !== actorId
          && item.definition.displayName === args.name).map(item => item.definition.actorId) }) }
    },
  })]
}

/**
 * Recall the authenticated Actor's own judgments; callers cannot choose another observer.
 * @param ctx - Host owner registry.
 * @param limit - Configured maximum knowledge entries per page.
 * @param characterLimit - Configured response-content budget.
 * @returns read-only private recall tool.
 */
export function knowledgeRecallTool(ctx: Context, limit: number, characterLimit: number): ToolDefinition {
  return defineTool({ name: 'npc_recall_knowledge',
    description: 'Recall your own retained judgments and identity clues. Missing from a prompt does not mean forgotten. A remembered claim is not proof of world truth. No access to other people\'s beliefs or private sources.',
    parameters: { query: { type: 'string' }, person_refs: { type: 'array', items: { type: 'string' } }, offset: { type: 'integer' },
      entry_id: { type: 'string', description: 'Read a deferred owned entry as serialized text chunks; offset is then a character offset.' } }, output,
    execute(args, exec) {
      const owner = exec.agent === undefined ? undefined : ctx.storyRegistry.storyForSession(exec.agent.session.id)
      if (owner?.role !== 'actor' || owner.archived || owner.actorId === undefined) throw new Error('Knowledge recall requires your own Actor perspective')
      const story = ctx.storyRegistry.get(owner.storyId)
      if (story === undefined) throw new Error('Story unavailable')
      const offset = args.offset ?? 0
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Knowledge offset must be nonnegative')
      const encounters = story.world.characters.encounters.filter(item => item.observerId === owner.actorId)
      if (args.person_refs?.some(ref => !encounters.some(item => item.ref === ref)) === true) throw new Error('Person reference is unavailable in your perspective')
      const state = story.world.characters.knowledge[owner.actorId] ?? emptyKnowledge()
      if (args.entry_id !== undefined) {
        const entry = state.entries.find(item => item.id === args.entry_id && item.status === 'active')
        if (entry === undefined) throw new Error('Knowledge entry is unavailable in your perspective')
        const serialized = JSON.stringify(entry)
        return Promise.resolve({ result: JSON.stringify({ content: serialized.slice(offset, offset + characterLimit),
          next: offset + characterLimit < serialized.length ? offset + characterLimit : null }) })
      }
      const clues = encounters.filter(item => item.actorId === undefined && (args.query === undefined || item.label.includes(args.query)))
      return Promise.resolve({ result: JSON.stringify({ ...queryKnowledge(state, args.query ?? '', args.person_refs ?? [], offset, limit, characterLimit),
        clues: clues.slice(offset, offset + limit).map(item => ({ ref: item.ref, label: item.label, sourceRefs: item.sourceRefs })),
        cluesNext: offset + limit < clues.length ? offset + limit : null }) })
    },
  })
}
