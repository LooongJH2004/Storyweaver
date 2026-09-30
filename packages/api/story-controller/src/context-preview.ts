/** Presentation metadata over runtime-rendered, visibility-filtered context sections. */
import type { StoryContextSnapshot, StoryContextSectionId } from '@deepseek-ai/dsh-story'
import type { StoryContextPreviewValue, StoryContextSection } from './types.ts'

interface SectionMeta {
  readonly title: string
  readonly source: StoryContextSection['source']
  readonly permission: StoryContextSection['permission']
  readonly visibility: StoryContextSection['visibility']
  readonly reason: string
}

/**
 * Add player-facing metadata without rebuilding or modifying runtime section text.
 * @param snapshot - Sections produced by the request renderer with its effective config.
 * @param audience - Director or private Actor recipient.
 * @param actorId - Actor recipient identity, when applicable.
 * @returns ordered sections with exact content and character accounting.
 */
export function presentStoryContextPreview(
  snapshot: StoryContextSnapshot,
  audience: 'director' | 'actor',
  actorId?: string,
): StoryContextPreviewValue {
  const metadata = audience === 'director' ? directorMeta() : actorMeta()
  const sections = snapshot.sections.map((rendered): StoryContextSection => {
    const meta = metadata[rendered.id] ?? (rendered.title === undefined ? undefined
      : editable(rendered.title, 'custom', audience === 'director' ? 'director-only' : 'actor-private', 'Player-authored context module.'))
    if (meta === undefined) throw new Error(`Context section '${rendered.id}' has no presentation metadata`)
    return { id: rendered.id, ...meta, role: rendered.role, content: rendered.content,
      chars: rendered.content.length, estimatedTokens: Math.ceil(rendered.content.length / 4) }
  })
  const totalChars = sections.reduce((sum, section) => sum + section.chars, 0)
  return { audience, ...(actorId === undefined ? {} : { actorId }), sections, totalChars,
    estimatedTokens: Math.ceil(totalChars / 4), pendingActorInitialization: snapshot.pendingActorInitialization }
}

function actorMeta(): Readonly<Partial<Record<StoryContextSectionId, SectionMeta>>> {
  return {
    style: editable('Performance style', 'prompt', 'actor-private', 'Style examples are not character memories.'),
    'scene-style': editable('Current scene direction', 'prompt', 'actor-private', 'Only the selected character receives its current-scene guidance.'),
    policy: editable('Actor authority and safety rules', 'context-rule', 'actor-private', 'Player-authored model guidance; Host authority and isolation remain code-enforced.'),
    tools: editable('Actor capability and call rules', 'context-rule', 'actor-private', 'Player-authored tool-use guidance plus the Host-granted capability list.'),
    identity: editable('Public identity', 'storybook', 'actor-private', 'The selected Actor needs its own public identity.'),
    'reasoning-language': editable('Reasoning language', 'reasoning-language', 'actor-private', 'Mandatory private-reasoning language instruction.'),
    'actor-prompt': editable('Actor custom setting', 'prompt', 'actor-private', 'Only the selected Actor receives this private role instruction.'),
    storybook: editable('Private acting context', 'storybook', 'actor-private', 'Private knowledge and acting guidance belong only to this Actor.'),
    world: runtime('Perceived world', 'world', 'actor-private', 'Only perceptions delivered to this Actor cross the audience boundary.'),
    memory: editable('Approved long-story memory', 'memory', 'actor-private', 'Only approved summaries and this Actor’s notes are established memory.'),
    'actor-state': runtime('Current private Actor state and character journey', 'actor-state', 'actor-private', 'The selected Actor receives only its own folded state and relevant turning points.'),
    'director-brief': runtime('Current brief', 'director-brief', 'actor-private', 'The latest Brief supplies current perceptions and uncertainties.'),
    discussion: runtime('Active discussion', 'discussion', 'actor-private', 'A participant receives durable floor ownership and prior turns.'),
  }
}

function directorMeta(): Readonly<Partial<Record<StoryContextSectionId, SectionMeta>>> {
  return {
    style: editable('Narrative style', 'prompt', 'director-only', 'Director expression guidance.'),
    'scene-style': editable('Current scene direction', 'prompt', 'director-only', 'Direction expires when the scene changes.'),
    policy: editable('Director authority and safety rules', 'context-rule', 'director-only', 'Player-authored model guidance; Host permissions and provenance checks remain code-enforced.'),
    tools: editable('Director capability and call rules', 'context-rule', 'director-only', 'Player-authored guidance for the Director tools that the Host actually grants.'),
    'reasoning-language': editable('Reasoning language', 'reasoning-language', 'director-only', 'Mandatory private-reasoning language instruction.'),
    'director-prompt': editable('Director custom setting', 'prompt', 'director-only', 'Player-authored narrative role and creative priorities for the Director.'),
    storybook: editable('Story bible', 'storybook', 'director-only', 'Player-authored setting, cast, world truth, and guidance.'),
    world: runtime('Authoritative world', 'world', 'director-only', 'Settled facts, event outcomes, and perception delivery are authoritative.'),
    memory: editable('Approved long-story memory', 'memory', 'director-only', 'Only reviewed summaries become established long-range context.'),
    'plot-ledger': runtime('Plot Ledger', 'plot-ledger', 'director-only', 'Actor tool events preserve behavior provenance.'),
    'director-outline': runtime('Director Outline', 'director-outline', 'director-only', 'The private plan is not Actor knowledge or world truth.'),
    discussion: runtime('Active discussion', 'discussion', 'director-only', 'The Director sees durable floor ownership and transcript state.'),
  }
}

function editable(
  title: string,
  source: StoryContextSection['source'],
  visibility: StoryContextSection['visibility'],
  reason: string,
): SectionMeta {
  return { title, source, permission: 'player-editable', visibility, reason }
}

function runtime(
  title: string,
  source: StoryContextSection['source'],
  visibility: StoryContextSection['visibility'],
  reason: string,
): SectionMeta {
  return { title, source, permission: 'runtime-derived', visibility, reason }
}
