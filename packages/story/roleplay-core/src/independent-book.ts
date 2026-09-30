/** Independent publication copies current protocol guidance only for untouched built-in defaults. */
import { parseStorybookDocument, DEFAULT_STORYBOOK_CONTEXT_RULES } from './storybook.ts'
import { canonical } from './records.ts'
import type { BookDraft, Document } from './types.ts'

const directorTools = 'Use director_observe for objective events and player-facing narration, with flat summary/content/narration/deliveries/state fields. Use director_command for planning and scheduling. Find existing instance people before creating someone. Stage records before independent interaction. director_observe settles only objective results and delivers each person what they can actually perceive; inspecting a clue does not announce it to others. A claim is not automatically true. Never invent a character reaction in narration or recipient evidence. Finish selects the actors that should respond and whether to advance a discussion. Create a discussion only for an actual shared question or decision. Outline is planning, never an established world fact. Propose context-update notes for player review when continuity needs them; recall retrieves original director-visible records. Never write persistent-character dialogue or decisions. Reuse accepted output; never duplicate events after an uncertain response.'
const actorTools = 'Use narrative_recall to retrieve original records visible to this character. Submit exactly one npc_commit_turn containing only material changes to knowledge, subjective state, memory, intentions and ordered behavior. Action attempts do not establish their success. React from your own desires, perceptions and knowledge; refusal, deception, misunderstanding or silence are valid choices. Knowledge sources establish evidence, not proof of a conclusion. Optional context_update proposes summaries for player approval. Do not fill unchanged fields or claim an unsuccessful tool call was accepted. Outside an assigned discussion, omit discussion. Private preparation uses behavior=[], discussion.action=pass, your stance and eagerness, and no next_speaker_id. On the public floor, speak yields the floor; conclude requests the end of the whole discussion, not merely your own sentence.'

/** Preview and publication normalize the same fixed version; reads never rewrite a stored book.
 * @param draft - authored document, title, and immutable resource inputs.
 * @returns serializable settings with independent execution guidance and retained custom wording.
 */
export function prepareIndependentBook(draft: Pick<BookDraft, 'document' | 'title'>): Document {
  const book = parseStorybookDocument({ ...draft.document, title: draft.title })
  if (book.contextRules.director.tools === DEFAULT_STORYBOOK_CONTEXT_RULES.director.tools) book.contextRules.director.tools = directorTools
  if (book.contextRules.actor.tools === DEFAULT_STORYBOOK_CONTEXT_RULES.actor.tools) book.contextRules.actor.tools = actorTools
  return JSON.parse(canonical(book)) as Document
}
