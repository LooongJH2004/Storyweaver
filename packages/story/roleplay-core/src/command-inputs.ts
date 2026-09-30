import { retentionOwnerSchema } from './retention-records.ts'
import { directorOutlinePlayerInputSchema } from './outline-rules.ts'
import { instanceOverridesSchema } from './settings.ts'
/** Framework-independent command payloads shared by application owners and protocol adapters. */
import { z } from 'zod'
import { storybookActorDefinitionSchema } from './storybook.ts'
import { contextUpdateSchema, contextUpdateUnitSchema, contextNoteCorrectionSchema } from './context-retention.ts'
import { characterLifecycleChangeSchema } from './actor-state.ts'
import { knowledgeChangeSchema } from './knowledge.ts'
import { stateChangeSchema } from './dynamic-state.ts'
import { styleProfileSchema } from './style.ts'
import { behaviorSchema } from './world.ts'
import type { InstanceId, CommandId } from './types.ts'

const text = z.string().trim().min(1)
/** Dynamic people start with authored settings; the host allocates their stable identity. */
export const createPersonSchema = z.strictObject({
  definition: storybookActorDefinitionSchema.omit({ actorId: true }), purpose: text, sourceRefs: z.array(text),
  location: z.string(), importance: z.enum(['main', 'supporting']),
})
/** Only definition fields change here; current state and knowledge have separate revisioned commands. */
export const revisePersonSchema = z.strictObject({
  actorId: text, expectedPersonRevision: z.number().int().positive(),
  definition: storybookActorDefinitionSchema, location: z.string(), archived: z.boolean(),
  importance: z.enum(['main', 'supporting']), reason: text,
})
/** Explicit scene attendance and appearances never provision model sessions. */
export const stageSceneSchema = z.strictObject({
  id: text, location: z.string(), present: z.array(text),
  appearances: z.array(z.strictObject({ actorId: text, key: text, label: text })),
})


/** One Actor delta, including its complete ordered accepted behavior. */
export const narrativeTurnSchema = z.strictObject({
  knowledge: z.array(knowledgeChangeSchema), state: z.array(stateChangeSchema), lifecycle: z.array(characterLifecycleChangeSchema),
  contextUpdate: contextUpdateSchema.optional(), nextImpulse: text.optional(),
  discussion: z.strictObject({ stance: text.optional(), eagerness: z.enum(['low', 'medium', 'high']), action: z.enum(['speak', 'pass', 'conclude']), nextSpeakerId: text.optional() }).optional(),
  discussionRequest: z.strictObject({ topic: text, opening: text, participantIds: z.array(text).min(1).max(23) }).optional(),
  behavior: z.array(behaviorSchema), posture: z.enum(['finished', 'silent', 'watching', 'waiting', 'hesitating', 'withdrawing']),
})
/** Explicit audience and source semantics for world perception delivery. */
export const observationSchema = z.strictObject({ summary: text, content: text,
  settles: z.array(text).optional(),
  narration: text.optional(),
  shared: z.strictObject({ actorIds: z.array(text).min(1), content: text,
    kind: z.enum(['observation', 'claim', 'report']), sourceRefs: z.array(text) }).optional(),
  deliveries: z.array(z.strictObject({ actorId: text, content: text, kind: z.enum(['observation', 'claim', 'report']),
    mode: z.enum(['supplement', 'replace']).optional(),
    sourceRefs: z.array(text) })),
  state: z.array(stateChangeSchema),
})


/** Story overrides and scene guidance retain separate recipients and lifetimes. */
export const styleUpdateSchema = z.discriminatedUnion('scope', [
  z.strictObject({ scope: z.literal('story'), key: z.string().min(1), profile: styleProfileSchema.optional() }),
  z.strictObject({ scope: z.literal('scene'), key: z.string().min(1), sceneId: z.string().min(1), instruction: z.string() }),
])

/** The host resolves participant identities before entering the command boundary. */
export const startDiscussionSchema = z.strictObject({ topic: text, participantIds: z.array(text).min(2).max(24),
  maxRounds: z.number().int().min(1).max(20) })
/** Player intervention and explicit lifecycle decisions are distinct commands. */
export const discussionControlSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('request'), requestId: text, expectedRequestRevision: z.number().int().positive(),
    decision: z.enum(['accept', 'decline', 'defer']), reason: text }),
  z.strictObject({ operation: z.literal('intervene'), discussionId: text, intervention: z.enum(['speak', 'conclude']) }),
  z.strictObject({ operation: z.literal('resume'), discussionId: text }),
  z.strictObject({ operation: z.literal('floor'), discussionId: text, actorId: text }),
  z.strictObject({ operation: z.literal('close'), discussionId: text, status: z.enum(['completed', 'cancelled']) }),
])


/** Targets use the selected character's visible references, never another person's private IDs. */
export const embodimentSchema = z.strictObject({ actorId: z.string().min(1),
  behavior: z.array(behaviorSchema).min(1), reason: z.string().min(1) })


/** Every runtime-derived state or judgment requires an explicit selection. */
export const materialSelectionSchema = z.strictObject({
  people: z.array(z.string().min(1)), factIds: z.array(z.string().min(1)),
  knowledge: z.array(z.strictObject({ actorId: z.string().min(1), id: z.string().min(1) })),
  state: z.array(z.strictObject({ owner: z.string().min(1), fieldId: z.string().min(1) })),
  memories: z.array(z.strictObject({ actorId: z.string().min(1), id: z.string().min(1) })),
})

/** Validated CreatePersonInput command payload, independent from its application owner. */
export type CreatePersonInput = z.infer<typeof createPersonSchema>
/** Validated RevisePersonInput command payload, independent from its application owner. */
export type RevisePersonInput = z.infer<typeof revisePersonSchema>
/** Validated StageSceneInput command payload, independent from its application owner. */
export type StageSceneInput = z.infer<typeof stageSceneSchema>
/** Validated NarrativeTurnInput command payload, independent from its application owner. */
export type NarrativeTurnInput = z.infer<typeof narrativeTurnSchema>
/** Validated ObservationInput command payload, independent from its application owner. */
export type ObservationInput = z.infer<typeof observationSchema>
/** Validated StyleUpdateInput command payload, independent from its application owner. */
export type StyleUpdateInput = z.infer<typeof styleUpdateSchema>
/** Validated StartDiscussionInput command payload, independent from its application owner. */
export type StartDiscussionInput = z.infer<typeof startDiscussionSchema>
/** Validated DiscussionControlInput command payload, independent from its application owner. */
export type DiscussionControlInput = z.infer<typeof discussionControlSchema>
/** Validated EmbodimentInput command payload, independent from its application owner. */
export type EmbodimentInput = z.infer<typeof embodimentSchema>
/** Validated MaterialSelection command payload, independent from its application owner. */
export type MaterialSelection = z.infer<typeof materialSelectionSchema>
/** Player corrections share the same typed state, knowledge, and lifecycle deltas as accepted turns. */
export type CognitionRevisionInput = Pick<NarrativeTurnInput, 'knowledge' | 'state' | 'lifecycle'>
/** Explicit material selections are saved against the reviewed instance revision. */
export interface ExtractDraftInput {
  readonly instanceId: InstanceId
  readonly expectedRevision: number
  readonly commandId: CommandId
  readonly selection: MaterialSelection
  readonly title: string
}

/** Replacing the override map also explicitly resets omitted keys to the pinned baseline. */
export const settingsUpdateSchema = z.strictObject({ overrides: instanceOverridesSchema, reason: text })
/** Player revision of instance settings, with an auditable reason. */
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>

/** Complete player edits and explicit suggestion reviews share the exact planning revision. */
export const outlinePlayerUpdateSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('replace'), expectedOutlineRevision: z.number().int().nonnegative(),
    outline: directorOutlinePlayerInputSchema, reason: text }),
  z.strictObject({ operation: z.literal('review'), expectedOutlineRevision: z.number().int().nonnegative(),
    suggestionId: text, accept: z.boolean() }),
])
/** Independent player planning command data. */
export type OutlinePlayerUpdateInput = z.infer<typeof outlinePlayerUpdateSchema>

/** Player review edits retain exact proposal revisions and the owning perspective. */
export const retentionReviewSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('correct'), owner: retentionOwnerSchema, id: text, revision: z.number().int().positive(), content: contextNoteCorrectionSchema }),
  z.strictObject({ operation: z.literal('review'), owner: retentionOwnerSchema, reviews: z.array(z.strictObject({
    id: text, revision: z.number().int().positive(), approve: z.boolean(),
  })).min(1) }),
  z.strictObject({ operation: z.literal('edit'), owner: retentionOwnerSchema, id: text, revision: z.number().int().positive(), unit: contextUpdateUnitSchema }),
  z.strictObject({ operation: z.literal('pin'), owner: retentionOwnerSchema, sourceId: text, pinned: z.boolean() }),
  z.strictObject({ operation: z.literal('revoke'), owner: retentionOwnerSchema, id: text, revision: z.number().int().positive() }),
  z.strictObject({ operation: z.literal('policy'), owner: retentionOwnerSchema, activation: z.enum(['automatic', 'review']) }),
])
/** Revision-checked player review payload, with no execution dependency. */
export type RetentionReviewInput = z.infer<typeof retentionReviewSchema>
/** Model-facing guidance shared by actor and director recall tools. */
export const narrativeRecallDescriptions = {
  query: 'Search text, or one exact record reference to read that record. All space-separated terms must match the same record. Put a known memory or source ID here, not in sourceId.',
  offset: 'Start at 0 for a new query; copy the returned offset when continuing.',
  characterOffset: 'Omit for a new query. Copy from the returned continuation to read the remaining text.',
  sourceId: 'Continuation check only, not a record selector. Omit for a new query. Copy only from a returned continuation with its original query, offset and characterOffset.',
}
/** Recall pages request originals from one host-selected perspective. */
export const narrativeRecallSchema = z.strictObject({
  query: z.string().describe(narrativeRecallDescriptions.query),
  offset: z.number().int().nonnegative().describe(narrativeRecallDescriptions.offset),
  limit: z.number().int().positive(),
  characterOffset: z.number().int().nonnegative().optional()
    .describe(narrativeRecallDescriptions.characterOffset),
  sourceId: z.string().min(1).optional()
    .describe(narrativeRecallDescriptions.sourceId),
})
/** Model-authored retrieval contains neither instance identity nor authority. */
export type NarrativeRecallInput = z.infer<typeof narrativeRecallSchema>
