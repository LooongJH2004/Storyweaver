/** Strict managed-storybook reads shared by Director context and Actor dispatch. */

import { readFile } from 'node:fs/promises'
import type { ActorCapability, ActorDescriptor } from '@deepseek-ai/dsh-experimental-actor'
import { ActorId } from '@deepseek-ai/dsh-experimental-actor'
import {
  parseStorybookDocument,
  type StorybookActorDefinition,
  type StorybookDocument,
} from '@deepseek-ai/dsh-story'

/** One character definition with only that character's private storybook context. */
/** Parsed complete storybook retained for Director-only world context. */
export interface ManagedStorybook {
  readonly value: StorybookDocument
  readonly actors: readonly StorybookActorDefinition[]
}

/**
 * Read and validate one managed storybook; a missing file is represented explicitly.
 * @param path - Absolute managed storybook path.
 * @returns the parsed Director book, or undefined when no file exists.
 */
export async function loadManagedStorybook(path: string): Promise<ManagedStorybook | undefined> {
  let source: string
  try {
    source = await readFile(path, 'utf8')
  } catch (error: unknown) {
    if (isMissing(error)) return undefined
    throw new Error(`Storyweaver could not read storybook '${path}'`, { cause: error })
  }
  let decoded: unknown
  try {
    decoded = JSON.parse(source) as unknown
  } catch (error: unknown) {
    throw new Error(`Storyweaver storybook '${path}' is not valid JSON`, { cause: error })
  }
  try {
    const value = parseStorybookDocument(decoded)
    return { value, actors: value.characters }
  } catch (error: unknown) {
    throw new Error(`Storyweaver storybook '${path}' is invalid`, { cause: error })
  }
}

/**
 * Read optional UTF-8 story prose; missing content remains explicit to the Director.
 * @param path - Absolute managed prose path.
 * @returns the source text, or undefined when no file exists.
 */
export async function loadOptionalStoryText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error: unknown) {
    if (isMissing(error)) return undefined
    throw new Error(`Storyweaver could not read story text '${path}'`, { cause: error })
  }
}

/**
 * Convert a storybook character into the Actor kernel's author configuration.
 * @param definition - One validated character definition.
 * @returns the Actor configuration used for provisioning.
 */
export function actorDescriptor(definition: StorybookActorDefinition): ActorDescriptor {
  return {
    id: ActorId(definition.actorId),
    displayName: definition.displayName,
    persona: definition.publicPersona,
    capabilities: [...definition.capabilities] as ActorCapability[],
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
