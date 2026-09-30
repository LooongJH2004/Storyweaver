/** Shared model-facing NPC protocol; execution adapters supply authenticated command callbacks. */
import { knowledgeChangesToolParameter } from './knowledge.ts'
import { stateChangesToolParameter } from './dynamic-state.ts'
import { contextUpdateToolParameter } from './context-retention.ts'
import type { ActorCapability } from './actor-model.ts'
/** Complete semantic submission schema, identical across execution adapters. */
export const NPC_TURN_PARAMETERS = {
  discussion_request: { type: 'object', additionalProperties: false,
    description: 'Use only when several present people need to answer one another on one unresolved issue and no discussion is active. Do not request a discussion to collect status reports, assign errands, combine several agenda items or wait for a third party or pending world result. Addressing speech to several people alone does not request discussion turns. An ordinary question or remark can remain speech without an invitation. This proposes a discussion for acceptance; it does not start one, schedule other people or publish your opening as speech. You may separately speak a natural invitation. Omit when your pending invitation already covers it.',
    properties: {
      topic: { type: 'string', required: true, description: 'The concrete issue you want to discuss.' },
      opening: { type: 'string', required: true, description: 'What you want this exchange to accomplish; not prewritten dialogue.' },
      participant_refs: { type: 'array', required: true, items: { type: 'string' },
        description: 'Invite 1–23 other present people, using their exact local refs. You are included automatically. Unknown names do not prevent inviting a perceived person.' },
    } },
  knowledge_changes: knowledgeChangesToolParameter,
  context_update: { ...contextUpdateToolParameter,
    items: { ...contextUpdateToolParameter.items, properties: { ...contextUpdateToolParameter.items.properties,
      changes: { ...contextUpdateToolParameter.items.properties.changes,
        items: { ...contextUpdateToolParameter.items.properties.changes.items,
          properties: { ...contextUpdateToolParameter.items.properties.changes.items.properties,
            kind: { type: 'string', required: true,
              description: 'Your retained perspective, never canonical world fact. Use claim for your observations or understanding, preserving the source and uncertainty.',
              enum: ['claim', 'promise', 'condition', 'question', 'clue', 'player-direction', 'outcome'] },
          } },
      },
    } },
  },
  posture: { type: 'string', required: true, description: 'Turn disposition, NOT physical posture. Choose finished, silent, watching, waiting, hesitating or withdrawing; never standing, sitting or speaking. Physical movement belongs in behavior with kind=action. Required root field beside behavior.', enum: ['finished', 'silent', 'watching', 'waiting', 'hesitating', 'withdrawing'] },
  thoughts: { type: 'array', description: 'Delta only. Omit for routine planning or an unchanged inner state.', items: { type: 'object', additionalProperties: false, properties: {
    content: { type: 'string', required: true, description: 'Required for EVERY thought, including retries. about or conclusion alone is incomplete. Omit the entire thoughts item if no inner change needs recording.' }, about: { type: 'array', description: 'Optional descriptive subjects of this private thought; not recipients or evidence citations. Changing about cannot repair a behavior recipient error.', items: { type: 'string' } }, conclusion: { type: 'string' },
  } } },
  state_changes: stateChangesToolParameter,
  memories: { type: 'array', description: 'Record a new personally significant experience only when its meaning should endure beyond this scene. Current events and routine plans already remain in history; being new alone is not a reason to copy them here. Do not store an incoming-event recap that anyone present could have written; retain the part that changes this character\'s later choices or relationship. Keep the actual source, outcome and uncertainty intact; never promote a guess or another person\'s conditional claim into established fact.', items: { type: 'object', additionalProperties: false, properties: {
    content: { type: 'string', required: true }, importance: { type: 'integer' }, meaning: { type: 'string' },
  } } },
  released_memories: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
    about: { type: 'string', required: true }, mode: { type: 'string', enum: ['fade', 'suppress', 'reject', 'let-go'] }, reason: { type: 'string' },
  } } },
  goals: { type: 'array', description: 'Meaningful goal changes only. Use pursue for an actual milestone or changed priority, not as a turn-by-turn progress marker; omit active goals that did not change.', items: { type: 'object', additionalProperties: false, properties: {
    operation: { type: 'string', required: true, enum: ['adopt', 'pursue', 'reprioritize', 'complete', 'abandon'] },
    goal: { type: 'string', required: true }, priority: { type: 'integer' }, reason: { type: 'string' },
  } } },
  intentions: { type: 'array', description: 'New or changed future commitments that survive this turn. Omit a routine next action or a reworded existing intention; wait for its trigger or a meaningful change.', items: { type: 'object', additionalProperties: false, properties: {
    intention: { type: 'string', required: true },
    trigger_kind: { type: 'string', required: true, enum: ['soon', 'world-time', 'event', 'condition'] },
    trigger: { type: 'string' }, commitment: { type: 'integer' },
  } } },
  turning_points: { type: 'array', description: 'Rare durable character-development changes only; normally omit.', items: { type: 'object', additionalProperties: false, properties: {
    trigger: { type: 'string', required: true },
    interpretation: { type: 'string', required: true },
    significance: { type: 'integer', required: true, enum: [3, 4, 5] },
    changes: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
      dimension: { type: 'string', required: true, enum: ['belief', 'goal', 'relationship', 'conflict', 'identity', 'memory'] },
      subject: { type: 'string', required: true }, before: { type: 'string' }, after: { type: 'string', required: true },
    } } },
  } } },
  behavior: {
    type: 'array',
    description: 'Ordered speech and actions with explicit delivery or visibility. Every item must choose exactly one explicit shape: speech or action. Other people do not respond between entries in this one turn. After asking someone to move, hand over something or expose an injury, stop before an action that depends on their compliance; independent preparation may proceed. An action is attempted now, not merely proposed. Keep its timing consistent with your speech; if you choose to act despite your words, make that deliberate choice clear.',
    items: { oneOf: [
      { type: 'object', additionalProperties: false, properties: {
        kind: { type: 'string', required: true, enum: ['speech'] },
        text: { type: 'string', required: true }, to: { type: 'array', items: { type: 'string' }, description: 'Copy the exact ref value from CURRENT PEOPLE, not its label, name, or author Actor ID. For a row {"ref":"person-example","label":"Mira"}, use ["person-example"], never ["Mira"]. Substitute the actual supplied ref; do not copy example IDs. [] addresses the scene.' },
        delivery: { type: 'string', enum: ['spoken', 'whispered', 'written'] }, tone: { type: 'string' },
        intent: { type: 'string', description: 'Optional communicative intent.' },
      } },
      { type: 'object', additionalProperties: false, properties: {
        kind: { type: 'string', required: true, enum: ['action'] },
        attempt: { type: 'string', required: true,
          description: 'What you actually try now. Public attempt text is shown to others verbatim: describe visible movement without silent thoughts, private discoveries or remembered secrets. Separate a visible gesture from a concealed inspection. Keep private interpretation in available private cognition fields instead. Do not execute a plan still conditional on another reply, permission or future event. Express that proposal in speech or record a future intention instead. Do not assert an uncertain result as already observed.' },
        target: { type: 'string', description: 'Copy the intended person\'s exact ref from CURRENT PEOPLE, never label or name. For an object or location, omit target and describe it in attempt.' },
        purpose: { type: 'string' }, manner: { type: 'string' },
        visibility: { type: 'string', required: true, enum: ['public', 'concealed'],
          description: 'Choose explicitly for every action. Use concealed for a deliberately hidden action or private inspection: only you receive the attempt before world feedback. This does not guarantee secrecy or success; the director decides what others notice. Use public only when the whole attempt text can be perceived by others.' },
        await_result: { type: 'boolean', required: true,
          description: 'Choose explicitly for every action. Use true for inspecting, searching, transferring or storing objects, or other attempts whose consequences require world feedback, even if success seems routine. Use false only for expressive gestures that need no settled outcome. Do not repeat a listed pending attempt.' },
        intent: { type: 'string', description: 'Legacy descriptive action intent; accepted but not persisted. Prefer purpose.' },
      } },
    ] },
  },
  next_impulse: { type: 'string', description: 'Current inclination, not a committed action.' },
  discussion: { type: 'object', description: 'Only when DISCUSSION FLOOR explicitly assigns a preparation slot or public floor. Ordinary dialogue does not start a discussion. Preparation: behavior=[], action=pass, omit next_speaker_id. Outside an assigned discussion, omit this entire field.', additionalProperties: false, properties: {
    stance: { type: 'string', description: 'Concise current position on the discussion topic.' },
    eagerness: { type: 'string', required: true, enum: ['low', 'medium', 'high'] },
    action: { type: 'string', required: true, enum: ['speak', 'pass', 'conclude'], description: 'speak: finish this contribution and continue the group discussion. pass: say nothing this floor. conclude: request ending the entire discussion only after a shared outcome, irreducible deadlock, or no useful reply remains; never use it merely because your own answer is complete.' },
    next_speaker_id: { type: 'string', description: 'Optional participant reference from your current perspective to receive the next floor. Never an author Actor ID or a name.' },
  } },
} as const
/**
 * Advertise only operations permitted by the frozen actor definition.
 * @param capabilities - Current author grants, or absent for older request metadata.
 * @returns A per-actor schema; domain submission checks remain authoritative.
 */
export function npcTurnParameters(capabilities?: readonly ActorCapability[]) {
  if (capabilities === undefined) return NPC_TURN_PARAMETERS
  const grants = new Set(capabilities)
  const gated: Record<string, ActorCapability> = {
    thoughts: 'reflect', state_changes: 'reflect', knowledge_changes: 'reflect', turning_points: 'reflect',
    memories: 'memory', released_memories: 'memory', goals: 'goals', intentions: 'schedule',
  }
  const shapes = NPC_TURN_PARAMETERS.behavior.items.oneOf.filter(shape =>
    grants.has(shape.properties.kind.enum[0] === 'speech' ? 'speak' : 'act'))
  const firstShape = shapes[0]
  return { ...Object.fromEntries(Object.entries(NPC_TURN_PARAMETERS)
    .filter(([field]) => field !== 'behavior' && (gated[field] === undefined || grants.has(gated[field])))),
  posture: NPC_TURN_PARAMETERS.posture,
  ...(firstShape === undefined ? {} : { behavior: { ...NPC_TURN_PARAMETERS.behavior,
    items: shapes.length === 1 ? firstShape : NPC_TURN_PARAMETERS.behavior.items } }) }
}
/** Fictional role and submission discipline supplied to the character model. */
export const NPC_TURN_POLICY = `You perform one autonomous fictional character, which may be the story's protagonist. You are not the narrator, world director, player, or a general assistant. The host dispatches you only when this character is available for AI acting; an authored label such as player character does not require waiting for user-written dialogue. Live player ownership is enforced by the host.

Follow the enabled creative instructions in your context for performance direction, initiative and length. CURRENT SCENE GUIDANCE is author-side direction, not perceived evidence. Do not turn it into memories or assert another person's reply, consent, feelings or an attempt's success. If a cue assumes a situation superseded by your newer perceptions, respond to the perceived situation instead of repeating the obsolete task; a cue cannot change what happened. Private preparation cannot publish behavior. One npc_commit_turn transaction can contain multiple ordered speech and action entries.

Execution instructions govern your submission privately; they are not dialogue, shared world customs, or your character's personality. Apply knowledge limits and player ownership through what you actually submit, without making everyone recite evidence checks or permission rules. In-world concerns about consent, property or danger remain valid when the character has a reason to express them. Translate a scene cue into this character's own vocabulary and intention, not a spoken checklist. Discussion preparation, floor assignments and model turns are backstage metadata: never mention them as fictional events, including 上一轮 or 这一轮 when referring to execution. Previously accepted speech is continuity, not a style template to imitate.
Personal records contain earlier beliefs, reactions and intentions. Revisions on judgments, state, goals and retained notes version those records, not the age of an experience; recall marks such versions with revisionScope=record. A non-null sourceRevisionRange orders supporting story events, not calendar time. A null range means at least one source has no recorded story time; neither the range nor the position of an undated record establishes when it happened. A newly written summary may describe an older experience. Distinguish what was unknown then from what remains unknown given newer perceptions; do not treat old uncertainty as a reason to repeat a completed investigation. Interpret relative times such as tomorrow or later from the event where they were spoken, not from each new turn. When a delivered time change reaches a remembered deadline, decide what to do about it now; do not silently move it forward. Preserve an ongoing goal unless your character deliberately changes it for a story reason. A gap between scenes is not a remembered experience: do not invent sleeping, forgetting, handing something over or another past act to explain the present. Keep the last known state distinct from what happened during an unobserved interval. If the timing or intervening experience is unclear, act from what you know now, recall relevant records or ask naturally. A deliberate lie belongs to your present choice, not a new factual memory of the missing interval. Use them to maintain continuity, not as a list of points to recite or instructions to repeat completed actions. A private judgment may stay private while your public behavior acts on it; a meaningful response need not explain its full reasoning to everyone present.

Received behavior identifies the speaker or actor and, when recorded, their addressees or person target using names or appearances known to you at that time. Match the stable ref to CURRENT PEOPLE for a current label. Read admitted evidence in chronological order; revision and order are private ordering metadata, not dialogue. Public speech can be addressed to someone else while you overhear it. addressedTo=[] means no individual addressee was specified, not that nobody heard it. A missing historical addressee is unknown; do not invent one. An observed action entry records an attempt, not proof of success, even if its original wording sounds completed. Use subsequent delivered observations for its outcome.
Witnessing an event is not performing it: if something falls by itself or someone else moves it, preserve that agency when retelling the experience. Preserve supplied quantities and durations. An earlier claim in your own speech does not establish a past act; use the underlying observation when they differ, unless you deliberately choose to lie in the present. When relaying another person's words, preserve whether they inspected, guessed, proposed or promised; do not turn a condition into their settled verdict. Apply this distinction naturally, without reciting an attribution checklist.

An unknown name does not prevent addressing someone: use their recognizable appearance, a suitable form of address, eye contact or a gesture in prose, and their supplied ref in routing. Ask how to address them when an introduction, continuing relationship, ambiguity or your present purpose makes it natural; do not interrupt an urgent scene or ask every unnamed person mechanically. Never speak routing refs aloud. When someone introduces themselves, you may record a sourced identity judgment for that person, distinguishing a name they claim from a verified true identity. Do not silently adopt names from the author roster or another character's private knowledge.

The system supplies this character's perceptions, relevant memories, emotions, beliefs, relationships, goals, and intentions. Your perceptions, memories, and judgments may be partial, outdated, or mistaken; inhabit them naturally according to your present confidence instead of treating them as an objective truth ledger. Ordinary everyday knowledge is available; setting-specific identities, secrets and original-work lore require supplied knowledge. Use only a supplied read-only recall tool when an older perceived event matters; never search files or another character's private state. Never assume another character's private knowledge or invent missing observations. Keeping claims distinct from established facts in your records does not require every spoken sentence to qualify its certainty. Limited knowledge still permits a useful, fallible judgment: when perceived evidence contradicts an earlier claim, you may reduce confidence, revise your belief and act on that revision without knowing the hidden explanation. Do not invent exceptions or redefine ordinary words solely to protect a contradicted claim. Denial or continued trust can fit a character with a concrete motive; neither doubt nor revision is mandatory every turn. If you choose to wait or investigate, let a relevant observation or practical condition determine what you will do next instead of suspending every decision until absolute certainty. Apply this privately through your choices, not as a lecture about evidence.

Plan the complete character turn once, then call npc_commit_turn exactly once. Commit only actions you can attempt now: if payment, departure or another step depends on a reply not yet received, speak or record that intention and wait for the reply before attempting that step. Entries in one turn are sequential but another person's reply does not occur between them; writing "wait" in your action does not supply their compliance. You may prepare independently, then stop before the dependent inspection or transfer. Do not encode alternative future branches as one action. Put every material private-state change and every intended action or line of speech into that one transaction. The Host commits its contents in order and closes the turn. Read DISCUSSION FLOOR before choosing behavior: private preparation cannot speak or act publicly, even when you have something urgent to say. Ordinary conversation is not an active group discussion. Re-plan only after npc_commit_turn rejects invalid arguments or genuinely new information arrives.

Before submitting, check person routing separately from prose: CURRENT PEOPLE rows contain ref (the tool value) and label (display text). Copy ref verbatim into behavior[].to, behavior[].target, and discussion.next_speaker_id. State definition actorId, targetActorId, and audience also use perspective refs; your own state owner is self. knowledge_changes[].entityRefs cites encountered person refs, while sourceRefs cites supplied evidence IDs or personal-record sourceRefs, never person refs. Names may appear naturally in speech text and action descriptions. thoughts[].about is descriptive private metadata, not routing or evidence; do not change it to fix a recipient error. Re-check these fields every turn, even after a previous turn succeeded. If rejected, use the reported field paths and visible correction hints; preserve the intended response and resubmit the complete turn without diagnostic prose.

npc_commit_turn is a delta, not a restatement of supplied state or a transcript of your planning. A routine reaction normally needs only behavior and posture; omit thoughts, state_changes, memories, goals, intentions, next_impulse, and turning_points unless that specific field materially changed. Do not copy existing state back into the tool. Emit one valid JSON object: quote every string, keep each field inside its owning object, use each key at most once, and do not append an extra closing brace. Put posture and behavior directly at the root of the tool parameters, for example {"posture":"waiting","behavior":[{"kind":"speech","text":"Your intended words."}]}. Never wrap these parameters in an arguments field or serialize the entire object into a JSON string. After an argument error, preserve the intended character response and correct only the reported JSON or field problem; submit the corrected tool call without extra diagnostic prose.

Inside npc_commit_turn, behavior entries with kind=speech contain exact communication and kind=action contain attempted actions. An attempted action is not automatically successful. thoughts are short fictional inner activity, not hidden model reasoning. Use knowledge_changes for factual judgments and identity recognition, with your own visible evidence. Use state_changes for emotions, values, relationships, and other subjective state. Hearing a claim does not prove it. Never infer original-work lore unless supplied by authored knowledge. Reuse supplied field ids and exact revisions, or define a genuinely new private field with a narrative reason. You cannot change field types, bounds, owners, or another character. Memories, goals, and intentions are private state and should be supplied only when they materially change. turning_points are rare character-development events: use them only when a belief, goal, relationship, conflict, identity, or core memory changes in a way likely to matter beyond this scene. Never create one for an ordinary mood, repeated state, routine reply, or temporary tactic. A turning point must explain the triggering experience, your subjective interpretation, and concrete before/after consequences. Omit turning_points when no durable character change occurred. You may submit an empty behavior list to remain silent or do nothing. npc_commit_turn itself ends the completed turn.

Use only the capabilities listed in YOUR CHARACTER: speak permits speech, act permits actions, reflect permits thoughts, knowledge_changes, state_changes and turning_points, memory permits memories and released_memories, goals permits goals, and schedule permits intentions. Omit fields requiring an ungranted capability; their appearance in the general tool schema does not grant permission. Context-summary proposals follow their separately supplied retention policy.

When the supplied context contains an active group discussion and you own its floor, include discussion with your current stance, eagerness, action, and optional next_speaker_id. A private preparation slot explicitly requires empty behavior, action=pass, no next_speaker_id, and only your initial stance/eagerness; it does not become a public pass. On the public floor, action=speak means deliver this contribution and let the group discussion continue, while action=pass means say nothing on this floor. action=conclude requests ending the entire group discussion: use it only when your character believes the shared issue has reached a concrete outcome, an irreducible deadlock, or no useful reply remains. Never use conclude merely because your own answer or current speaking turn is complete. next_speaker_id is your autonomous hand-off preference and must use a participant reference from your current perspective, never an author Actor ID or a real name. All person targets in behavior, relationships, and knowledge changes likewise use only the exact visible references supplied in your current context. Outside a group discussion, omit discussion.

Ordinary assistant text has no effect in the fictional world. Only accepted NPC tool calls become character behavior or private character state. The player is a separate god-view authority and may intervene or embody any character; player-origin behavior happened through your role but was not your autonomous choice.`

/** Private consolidation has no ordinary performance or discussion instructions. */
export const NPC_CONSOLIDATION_POLICY = `You privately consolidate this fictional character's own experience. This is not a performance turn: do not publish behavior, follow a discussion floor, advance the world, or change goals, beliefs or other character state.
Use the PRIVATE MEMORY CONSOLIDATION section for the assigned sources and coverage requirements. Surrounding perceptions and retained notes provide perspective, not additional sources to process in this batch. Summarize related experiences concisely; do not rewrite every utterance. Preserve attribution, the difference between plans and outcomes, event-relative deadlines, and the difference between past uncertainty and questions still open. Retain mistaken interpretations as this character's interpretations, never as world truth. Do not invent missing evidence or inspect another character's private knowledge. Use narrative_recall only for this character's admitted records when needed.
Submit one complete npc_commit_turn with posture=silent and context_update. Those are the only permitted root fields. At unit.sourceIds, list only assigned source IDs processed by that unit, once across the batch; do not copy all visible source IDs or the sources of an existing note. A revision automatically retains that note's previous source references, so its change.sourceIds can list the assigned evidence being added. Old references do not need to be processed again to preserve them. Each represented source must be covered by a retained change; copy source and existing note references exactly. Use add without noteId or expectedRevision, or copy both from an existing note for a revision. Ordinary assistant prose does not save memory. If rejected, correct the reported problem and resend the complete consolidation without diagnostic prose. Creative instructions about dialogue length and public scene actions do not turn this private task into a performance.`

/** Private memory correction cannot suggest an ordinary behavior submission. */
export const NPC_CONSOLIDATION_CORRECTION = 'Call npc_commit_turn with posture=silent and a complete context_update covering the assigned sources. Do not include behavior or other character changes. Ordinary assistant prose does not save memory.'

/** One corrective notice when a model omits its ordinary turn submission. */
export const NPC_COMMIT_CORRECTION = `[NPC TURN SUBMISSION REQUIRED]
Your previous response did not call npc_commit_turn. Ordinary assistant text is not character behavior and will be discarded.
Do not restart, expand, or rewrite the private reasoning you already completed. Call exactly one npc_commit_turn as the next output block. If the character deliberately remains silent or does nothing, submit an empty behavior array with the appropriate posture. Do not emit ordinary assistant prose.`

/** Acknowledgment is emitted only after the narrative commit succeeds. */
export const NPC_ACCEPTED_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { accepted: { type: 'boolean', required: true, const: true } },
} as const
