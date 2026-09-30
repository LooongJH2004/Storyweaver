/** Durable Story domain schemas. */

import { z } from 'zod'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { plotLedgerSchema } from './director.ts'
import { directorOutlineSchema } from './outline.ts'
import { storyPromptOverridesSchema } from './prompts.ts'
import {
  storyContextRecipeSchema,
  storyDiscussionStateSchema,
  storyMemoryStateSchema,
  storyWorldStateSchema,
} from './roleplay.ts'
import type { StoryId, StorySessionRole } from './types.ts'

/** Runtime StoryId schema at the persistence boundary. */
export const storyIdSchema = z.string()
  .regex(/^story-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu)
  .transform(value => value as StoryId)

/** Runtime Story Session role schema. */
export const storySessionRoleSchema: z.ZodType<StorySessionRole> = z.enum(['control', 'scene', 'actor'])

/** Durable registration of one Session in a Story. */
export const storySessionRecord = z.object({
  sessionId: z.string().transform(SessionId),
  role: storySessionRoleSchema,
  actorId: z.string().min(1).optional(),
  actorStateRevision: z.number().int().nonnegative().optional(),
  createdAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().optional(),
})

/** Restorable Story-domain state captured before one player-authored scene turn. */
export const storyRuntimeSnapshotSchema = z.object({
  plotLedger: plotLedgerSchema,
  directorOutline: directorOutlineSchema,
  world: storyWorldStateSchema,
  memory: storyMemoryStateSchema,
  discussions: storyDiscussionStateSchema,
}).strict()

/** Exact scene-turn and Actor-log boundaries retained for same-Session rewrites. */
export const storyTurnCheckpointFileSchema = z.strictObject({
  version: z.literal(3),
  entries: z.array(z.strictObject({
    sceneSessionId: z.string().min(1), userMessageSeq: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(), snapshot: storyRuntimeSnapshotSchema,
    actorSurfaceEnds: z.record(z.string().min(1), z.number().int().nonnegative().nullable()),
    actorEventEnds: z.record(z.string().min(1), z.number().int().nonnegative().nullable()),
  })),
})

/** One canonical Story record; no physical path crosses this boundary. */
export const storyRecord = z.object({
  templateId: z.string().min(1).max(200).optional(),
  templateOnly: z.boolean().optional(),
  title: z.string().min(1).max(160),
  premise: z.string(),
  sessions: z.array(storySessionRecord),
  currentSceneSessionId: z.string().transform(SessionId).optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().optional(),
  plotLedger: plotLedgerSchema,
  directorOutline: directorOutlineSchema,
  world: storyWorldStateSchema,
  memory: storyMemoryStateSchema,
  discussions: storyDiscussionStateSchema,
  contextRecipe: storyContextRecipeSchema,
  promptOverrides: storyPromptOverridesSchema,
})

/** Durable Story record inferred from the canonical schema. */
export type StoryRecord = z.infer<typeof storyRecord>

/** Durable Story Session registration inferred from the canonical schema. */
export type StorySessionRecord = z.infer<typeof storySessionRecord>

/** Story registry domain: one independent record per opaque StoryId. */
export const storyDomainSpec = defineDomain({
  name: 'story',
  version: 12,
  layout: 'per-record',
  tables: { stories: domainTable<StoryId, StoryRecord>(storyRecord) },
})
