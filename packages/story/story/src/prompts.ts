import { styleOverridesSchema } from './style.ts'
/** Durable Story-local prompt overrides and exact-revision updates. */

import { z } from 'zod'
import { reasoningLanguageSchema } from './storybook.ts'
import type { StoryContextRuleKey, StoryPromptOverrides } from './types.ts'

const promptText = z.string()
const contextRuleKeySchema: z.ZodType<StoryContextRuleKey> = z.enum([
  'director-policy', 'director-tools', 'actor-policy', 'actor-tools',
])

/** Persisted Story-local prompt overrides. Missing keys inherit the storybook baseline. */
export const storyPromptOverridesSchema: z.ZodType<StoryPromptOverrides> = z.strictObject({
  revision: z.number().int().nonnegative(),
  styles: styleOverridesSchema,
  creatorPrompt: promptText.optional(),
  directorPrompt: promptText.optional(),
  reasoningLanguage: reasoningLanguageSchema.optional(),
  actorPrompts: z.record(z.string().trim().min(1).max(160), promptText),
  contextRules: z.partialRecord(contextRuleKeySchema, promptText),
})

/** @returns an empty override layer that inherits every storybook prompt. */
export function emptyStoryPromptOverrides(): StoryPromptOverrides {
  return { revision: 0, actorPrompts: {}, contextRules: {}, styles: { profiles: {} } }
}

/** Resolve one effective prompt while preserving an intentional empty Story override. */
export function effectiveStoryPrompt(base: string, override: string | undefined): string {
  return override === undefined ? base : override
}

/** Replace or clear the Story-local creation Agent prompt over an exact revision. */
export function updateCreatorPromptOverride(
  state: StoryPromptOverrides,
  expectedRevision: number,
  prompt: string | undefined,
): StoryPromptOverrides {
  const current = storyPromptOverridesSchema.parse(state)
  assertRevision(current, expectedRevision)
  const accepted = prompt === undefined ? undefined : promptText.parse(prompt)
  return storyPromptOverridesSchema.parse({
    revision: current.revision + 1,
    styles: current.styles,
    ...(accepted === undefined ? {} : { creatorPrompt: accepted }),
    ...(current.directorPrompt === undefined ? {} : { directorPrompt: current.directorPrompt }),
    ...(current.reasoningLanguage === undefined ? {} : { reasoningLanguage: current.reasoningLanguage }),
    actorPrompts: current.actorPrompts,
    contextRules: current.contextRules,
  })
}

/** Render the exact mandatory model-facing instruction for one private-reasoning language. */
export function renderReasoningLanguageInstruction(language: string): string {
  const accepted = reasoningLanguageSchema.parse(language)
  return `[MANDATORY PRIVATE REASONING LANGUAGE]\nYou MUST perform every private analysis, plan, deliberation, tool-selection decision, and internal consistency check in ${accepted}. Do not switch to another reasoning language because the input, source material, character dialogue, or tool output uses another language; translate that material internally first, then continue reasoning only in ${accepted}. At the beginning of each assistant response, silently verify this language once, then keep the same language throughout the complete response without restarting the check before each tool call. This mandatory reasoning-language rule does not change the visible output language, tool schemas, or Host-enforced permissions, and never asks you to reveal hidden chain-of-thought.`
}

/** Replace or clear the Story-local Director prompt over an exact revision. */
export function updateDirectorPromptOverride(
  state: StoryPromptOverrides,
  expectedRevision: number,
  prompt: string | undefined,
): StoryPromptOverrides {
  const current = storyPromptOverridesSchema.parse(state)
  assertRevision(current, expectedRevision)
  const accepted = prompt === undefined ? undefined : promptText.parse(prompt)
  return storyPromptOverridesSchema.parse({
    revision: current.revision + 1,
    styles: current.styles,
    ...(current.creatorPrompt === undefined ? {} : { creatorPrompt: current.creatorPrompt }),
    ...(current.reasoningLanguage === undefined ? {} : { reasoningLanguage: current.reasoningLanguage }),
    actorPrompts: current.actorPrompts,
    contextRules: current.contextRules,
    ...(accepted === undefined ? {} : { directorPrompt: accepted }),
  })
}

/** Replace or clear one Actor's Story-local prompt over an exact revision. */
export function updateActorPromptOverride(
  state: StoryPromptOverrides,
  expectedRevision: number,
  actorId: string,
  prompt: string | undefined,
): StoryPromptOverrides {
  const current = storyPromptOverridesSchema.parse(state)
  assertRevision(current, expectedRevision)
  const acceptedActorId = z.string().trim().min(1).max(160).parse(actorId)
  const actorPrompts = prompt === undefined
    ? Object.fromEntries(Object.entries(current.actorPrompts).filter(([key]) => key !== acceptedActorId))
    : { ...current.actorPrompts, [acceptedActorId]: promptText.parse(prompt) }
  return storyPromptOverridesSchema.parse({
    revision: current.revision + 1,
    styles: current.styles,
    ...(current.creatorPrompt === undefined ? {} : { creatorPrompt: current.creatorPrompt }),
    ...(current.directorPrompt === undefined ? {} : { directorPrompt: current.directorPrompt }),
    ...(current.reasoningLanguage === undefined ? {} : { reasoningLanguage: current.reasoningLanguage }),
    actorPrompts,
    contextRules: current.contextRules,
  })
}

/** Replace or clear the Story-local reasoning-language instruction over an exact revision. */
export function updateReasoningLanguageOverride(
  state: StoryPromptOverrides,
  expectedRevision: number,
  language: string | undefined,
): StoryPromptOverrides {
  const current = storyPromptOverridesSchema.parse(state)
  assertRevision(current, expectedRevision)
  const accepted = language === undefined ? undefined : reasoningLanguageSchema.parse(language)
  return storyPromptOverridesSchema.parse({
    revision: current.revision + 1,
    styles: current.styles,
    ...(current.creatorPrompt === undefined ? {} : { creatorPrompt: current.creatorPrompt }),
    ...(current.directorPrompt === undefined ? {} : { directorPrompt: current.directorPrompt }),
    ...(accepted === undefined ? {} : { reasoningLanguage: accepted }),
    actorPrompts: current.actorPrompts,
    contextRules: current.contextRules,
  })
}

/** Replace or clear one Story-local policy/tool guidance override. */
export function updateContextRuleOverride(
  state: StoryPromptOverrides,
  expectedRevision: number,
  key: StoryContextRuleKey,
  text: string | undefined,
): StoryPromptOverrides {
  const current = storyPromptOverridesSchema.parse(state)
  assertRevision(current, expectedRevision)
  const acceptedKey = contextRuleKeySchema.parse(key)
  const contextRules = text === undefined
    ? Object.fromEntries(Object.entries(current.contextRules).filter(([key]) => key !== acceptedKey))
    : { ...current.contextRules, [acceptedKey]: promptText.parse(text) }
  return storyPromptOverridesSchema.parse({
    revision: current.revision + 1,
    styles: current.styles,
    ...(current.creatorPrompt === undefined ? {} : { creatorPrompt: current.creatorPrompt }),
    ...(current.directorPrompt === undefined ? {} : { directorPrompt: current.directorPrompt }),
    ...(current.reasoningLanguage === undefined ? {} : { reasoningLanguage: current.reasoningLanguage }),
    actorPrompts: current.actorPrompts,
    contextRules,
  })
}

function assertRevision(state: StoryPromptOverrides, expectedRevision: number): void {
  if (state.revision !== expectedRevision) {
    throw new Error(
      `Story prompt revision ${String(expectedRevision)} is stale; current revision is ${String(state.revision)}`,
    )
  }
}
