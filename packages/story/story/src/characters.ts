/** Bind pure identity rules to host-generated references and timestamps. */
import { randomUUID, createHash } from 'node:crypto'
import * as characters from '@deepseek-ai/dsh-roleplay-core/characters'
import type { StoryCharacters, StoryCharacter } from '@deepseek-ai/dsh-roleplay-core/characters'
import type { StorybookDocument } from '@deepseek-ai/dsh-roleplay-core/storybook'
export * from '@deepseek-ai/dsh-roleplay-core/characters'
const values = { id: randomUUID, now: () => new Date().toISOString() }
/** Instantiate authored characters with host-generated identities. */
export function initializeStoryCharacters(state: StoryCharacters, book: StorybookDocument): StoryCharacters {
  return characters.initializeStoryCharacters(state, book, values)
}
/** Seed only the new character's explicitly authored knowledge. */
export function seedCharacterKnowledge(state: StoryCharacters, person: StoryCharacter): StoryCharacters {
  return characters.seedCharacterKnowledge(state, person, values)
}
/** Assign references for current perceptible appearances. */
export function frameStoryCharacters(state: StoryCharacters, sceneId: string, presentIds: readonly string[],
  appearances: readonly { actorId: string; key: string; label: string }[] = []): StoryCharacters {
  return characters.frameStoryCharacters(state, sceneId, presentIds, appearances, values)
}
/** Project only structural identifiers; spoken prose stays unchanged. */
export function projectIdentityReferences(value: unknown, state: StoryCharacters, observerId: string): unknown {
  return characters.projectIdentityReferences(value, state, observerId, stateFieldReference)
}
/** Hide author-supplied field identifiers in model-facing contexts. */
export function stateFieldReference(id: string): string {
  return `field-${createHash('sha256').update(id).digest('hex').slice(0, 32)}`
}
