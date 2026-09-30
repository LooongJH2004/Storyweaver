import { directorGuidanceSchema, actingGuidanceSchema } from './style.ts'
export { directorGuidanceSchema, actingGuidanceSchema } from './style.ts'
import { z } from 'zod'
import { initialKnowledgeSchema } from './knowledge.ts'
import { stateInitialValueSchema, initializeDynamicState } from './dynamic-state.ts'
import { materializeStorybookContextDefaults } from './storybook-defaults.ts'
import { contextRecipeSchema } from './context-recipe.ts'

export {
  DEFAULT_STORY_CREATOR_PROMPT,
  DEFAULT_STORYBOOK_DISCUSSION_SETTINGS,
  DEFAULT_STORYBOOK_CONTEXT_RULES,
  DEFAULT_STORYBOOK_REASONING_LANGUAGE,
  materializeStorybookContextDefaults,
} from './storybook-defaults.ts'

/** Capabilities that a storybook may grant to one persistent Actor. */
export const storybookActorCapabilitySchema = z.enum([
  'speak', 'act', 'reflect', 'memory', 'goals', 'schedule',
])

const guidanceText = z.string().trim()
const guidanceList = z.array(z.string().trim().min(1)).max(200)

/** Player-selected language preference for private model reasoning. */
export const reasoningLanguageSchema = z.string().trim().min(1)

/** Player-editable model guidance; actual Host permissions and tool grants remain code-enforced. */
export const storybookContextRulesSchema = z.strictObject({
  director: z.strictObject({
    policy: guidanceText,
    tools: guidanceText,
  }),
  actor: z.strictObject({
    policy: guidanceText,
    tools: guidanceText,
  }),
})

/** Player-owned budget used when the Director starts an automatic discussion. */
export const storybookDiscussionSettingsSchema = z.strictObject({
  maxRounds: z.number().int().min(1).max(20),
  /** Missing policy preserves the eagerness-weighted behavior of saved books. */
  floorPolicy: z.enum(['balanced', 'eagerness']).optional(),
})

/** Actor-private starting state. Perspective statements never carry truth-status metadata. */
export const storybookPrivateContextSchema = z.strictObject({
  perspective: guidanceList.default([]),
  coreMemories: z.array(z.strictObject({
    content: z.string().trim().min(1),
    importance: z.number().int().min(1).max(5).default(3),
    meaning: z.string().trim().min(1).optional(),
  })).max(200).default([]),
  goals: z.array(z.strictObject({
    description: z.string().trim().min(1),
    priority: z.number().int().min(1).max(5).default(3),
    reason: z.string().trim().min(1).optional(),
  })).max(200).default([]),
  intentions: z.array(z.strictObject({
    description: z.string().trim().min(1),
    trigger: z.string().trim().min(1),
    commitment: z.number().int().min(1).max(5).default(3),
  })).max(200).default([]),
})

/** Player-authored definition of one persistent character. */
export const storybookActorDefinitionSchema = z.strictObject({
  actorId: z.string().trim().min(1).max(160),
  displayName: z.string().trim().min(1).max(160),
  publicPersona: z.string().trim().min(1),
  appearance: z.string().trim().min(1).default('未具名的人物'),
  initialKnowledge: z.array(initialKnowledgeSchema).default([]),
  commonKnowledge: z.array(z.string().trim().min(1))
    .describe('Character-specific ordinary knowledge. Omit or use null to inherit authored shared knowledge; [] inherits none. Supply only knowledge justified by this character\'s background. Learning later belongs in personal judgments, not automatic age-based lore unlocks.').nullable().optional(),
  rolePrompt: guidanceText,
  state: z.array(stateInitialValueSchema).default([]),
  capabilities: z.array(storybookActorCapabilitySchema).min(1),
  privateContext: storybookPrivateContextSchema.default({
    perspective: [],
    coreMemories: [],
    goals: [],
    intentions: [],
  }),
  actingGuidance: actingGuidanceSchema,
})

/** Complete editable Storyweaver storybook document. */
const strictStorybookDocumentSchema = z.strictObject({
  schemaVersion: z.literal(6),
  commonKnowledge: z.array(z.string().trim().min(1)).default([]),
  id: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(300),
  setting: z.record(z.string(), z.json()).default({}),
  premise: z.string().trim().default(''),
  worldTruth: z.record(z.string(), z.json()).default({}),
  discussionSettings: storybookDiscussionSettingsSchema,
  directorPrompt: guidanceText,
  reasoningLanguage: reasoningLanguageSchema,
  contextRules: storybookContextRulesSchema,
  contextRecipe: contextRecipeSchema.optional(),
  /** Optional narrative focus; null leaves the cast unranked and does not select player ownership. */
  protagonistActorId: z.string().trim().min(1).max(160).nullable(),
  characters: z.array(storybookActorDefinitionSchema).max(100),
  beats: z.array(z.record(z.string(), z.json())).max(1_000).default([]),
  directorRules: z.array(z.string().trim().min(1)).max(500).default([]),
  directorGuidance: directorGuidanceSchema,
}).superRefine((value, context) => {
  const ids = new Set<string>()
  for (const character of value.characters) {
    if (ids.has(character.actorId)) {
      context.addIssue({
        code: 'custom',
        path: ['characters'],
        message: `duplicate storybook actorId: ${character.actorId}`,
      })
    }
    ids.add(character.actorId)
  }
  for (const character of value.characters) {
    try {
      for (const item of character.initialKnowledge) {
        if (item.targetActorId !== undefined && !ids.has(item.targetActorId)) throw new Error('Initial knowledge references an unknown character')
        if (item.kind === 'identity' && item.label === undefined) throw new Error('Initial identity knowledge requires a label')
      }
      initializeDynamicState(character.state, [...ids])
      if (character.state.some(item => item.definition.actorId !== character.actorId)) {
        throw new Error('Character fields must name their owning character')
      }
    } catch (error) {
      context.addIssue({ code: 'custom', path: ['characters', character.actorId, 'state'],
        message: error instanceof Error ? error.message : String(error) })
    }
  }
  if (value.protagonistActorId !== null && !ids.has(value.protagonistActorId)) {
    context.addIssue({
      code: 'custom', path: ['protagonistActorId'],
      message: `unknown protagonist actorId: ${value.protagonistActorId}`,
    })
  }
})

export const storybookDocumentSchema = z.preprocess(
  materializeStorybookContextDefaults,
  strictStorybookDocumentSchema,
)

/** Capability name stored in a storybook character definition. */
export type StorybookActorCapability = z.infer<typeof storybookActorCapabilitySchema>
/** Structured Director creative guidance. */
export type DirectorGuidance = z.infer<typeof directorGuidanceSchema>
/** Structured creative guidance owned by one Actor. */
export type ActingGuidance = z.infer<typeof actingGuidanceSchema>
/** Actor-private perspective and initial dynamic state. */
export type StorybookPrivateContext = z.infer<typeof storybookPrivateContextSchema>
/** One validated storybook character definition. */
export type StorybookActorDefinition = z.infer<typeof storybookActorDefinitionSchema>
/** Editable Director and Actor policy/tool guidance stored in one storybook. */
export type StorybookContextRules = z.infer<typeof storybookContextRulesSchema>
/** Player-owned automatic group-discussion settings. */
export type StorybookDiscussionSettings = z.infer<typeof storybookDiscussionSettingsSchema>
/** One validated editable storybook document. */
export type StorybookDocument = z.infer<typeof storybookDocumentSchema>

/** Render one Actor's private authoring data without exposing truth-status or knowledge-class labels. */
export function renderStorybookActorPrivateContext(actor: StorybookActorDefinition): string {
  const { perspective } = actor.privateContext
  const perspectiveText = perspective.length === 0
    ? '- 没有额外的初始主观经历。'
    : perspective.map(item => `- ${item}`).join('\n')
  return `[PRESENT SUBJECTIVE EXPERIENCE]\n${perspectiveText}\n\n`
}

/**
 * Validate one decoded storybook at its durable or wire boundary.
 * @param input - Decoded player-authored JSON.
 * @returns the normalized storybook with defaults materialized.
 */
export function parseStorybookDocument(input: unknown): StorybookDocument {
  return storybookDocumentSchema.parse(input)
}
