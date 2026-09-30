/** Instance configuration resolution is pure and never consults a newer published storybook. */
import { z } from 'zod'
import { reasoningLanguageSchema, storybookContextRulesSchema, storybookDiscussionSettingsSchema,
  parseStorybookDocument } from './storybook.ts'
import { entity } from './records.ts'
import type { Json, NarrativeSnapshot } from './types.ts'

const jsonValue: z.ZodType<Json> = z.json()

/** Only ongoing author settings are editable here; initial people and state have their own owners. */
export const instanceSettingsSchema = z.strictObject({
  title: z.string().trim().min(1).max(300), premise: z.string(),
  setting: z.record(z.string(), jsonValue), worldTruth: z.record(z.string(), jsonValue),
  directorPrompt: z.string(), directorRules: z.array(z.string().min(1)).max(500),
  contextRules: storybookContextRulesSchema, reasoningLanguage: reasoningLanguageSchema,
  discussionSettings: storybookDiscussionSettingsSchema,
})
/** Missing keys inherit their pinned baseline; explicit empty values remain intentional overrides. */
export const instanceOverridesSchema = instanceSettingsSchema.partial()
/** Resolved ongoing settings contain no character seeds or mutable template reference. */
export type InstanceSettings = z.infer<typeof instanceSettingsSchema>
/** Player-owned per-instance overrides. */
export type InstanceOverrides = z.infer<typeof instanceOverridesSchema>
/** Per-field provenance is resolved by the same function used for model contexts. */
export interface ResolvedSettings {
  readonly base: InstanceSettings
  readonly overrides: InstanceOverrides
  readonly effective: InstanceSettings
  readonly sources: Record<keyof InstanceSettings, 'storybook' | 'instance'>
}
/** Read the pinned baseline and explicit overrides without updating persisted data. */
export function resolveInstanceSettings(snapshot: NarrativeSnapshot): ResolvedSettings {
  const book = parseStorybookDocument(entity(snapshot, { collection: 'setting', id: 'book' }))
  const base = instanceSettingsSchema.parse(Object.fromEntries(Object.keys(instanceSettingsSchema.shape)
    .map(key => [key, Reflect.get(book, key)])))
  const overrides = instanceOverridesSchema.parse(entity(snapshot, { collection: 'setting', id: 'overrides' }))
  const effective = instanceSettingsSchema.parse({ ...base, ...overrides })
  const sources = Object.fromEntries(Object.keys(base).map(key => [key,
    Object.hasOwn(overrides, key) ? 'instance' : 'storybook'])) as ResolvedSettings['sources']
  return { base, overrides, effective, sources }
}
