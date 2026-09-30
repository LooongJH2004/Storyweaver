import { readFile } from 'node:fs/promises'
import { parseStorybookDocument, initializeDynamicState } from '@deepseek-ai/dsh-story'
import type { StorybookPrivateContext } from '@deepseek-ai/dsh-story'
import type { StoryActorStateFacet, StoryActorStateView } from './types.ts'

/**
 * Read and normalize one managed Story's optional storybook cast.
 * @param path - Absolute managed storybook path.
 * @param definitions - Current instance cast, when explicitly initialized.
 * @returns normalized player-visible definitions, or an empty list when the file is absent.
 */
export async function loadStorybookActorStates(path: string, definitions?: readonly import('@deepseek-ai/dsh-story').StorybookActorDefinition[]): Promise<readonly StoryActorStateView[]> {
  let source: string
  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return []
    throw error
  }
  const decoded: unknown = JSON.parse(source)
  const parsed = parseStorybookDocument(decoded)
  const characters = definitions ?? parsed.characters
  return characters.map((character) => {
    const context = character.privateContext
    return {
      actorId: character.actorId,
      displayName: character.displayName,
      persona: character.publicPersona,
      lifecycle: 'defined',
      facets: storybookFacets(context),
      dynamicState: initializeDynamicState(character.state.filter(item => item.definition.owner === 'actor'), characters.map(item => item.actorId)),
      emotions: [], beliefs: [], relationships: [],
      memories: context.coreMemories.map(memory => ({
        content: memory.content,
        importance: memory.importance,
        status: 'active' as const,
        ...(memory.meaning === undefined ? {} : { meaning: memory.meaning }),
      })),
      goals: context.goals.map(goal => ({
        description: goal.description,
        priority: goal.priority,
        status: 'active' as const,
        ...(goal.reason === undefined ? {} : { reason: goal.reason }),
      })),
      intentions: context.intentions.map(intention => ({
        description: intention.description,
        trigger: intention.trigger,
        commitment: intention.commitment,
      })),
      turningPoints: [],
    }
  })
}

/**
 * Overlay one running Actor projection on its optional storybook definition.
 * @param configured - Optional storybook definition and initial private state.
 * @param running - Current durable Actor projection.
 * @returns one player-visible view preferring live state while retaining configured context.
 */
export function mergeStoryActorState(
  configured: StoryActorStateView | undefined,
  running: StoryActorStateView,
): StoryActorStateView {
  if (configured === undefined) return running
  return {
    ...running,
    persona: running.persona.length > 0 ? running.persona : configured.persona,
    facets: configured.facets,
    turningPoints: running.turningPoints,
  }
}

function storybookFacets(
  context: StorybookPrivateContext,
): StoryActorStateFacet[] {
  const facets: StoryActorStateFacet[] = []
  addFacet(facets, 'perspective', context.perspective)
  return facets
}

function addFacet(facets: StoryActorStateFacet[], key: string, values: readonly string[] | undefined): void {
  if (values !== undefined && values.length > 0) facets.push({ key, values })
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
