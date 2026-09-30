/** Validate model routing fields without interpreting names or free-form character prose. */
import { encounterLabel, visibleCharacters } from './characters.ts'
import type { StoryCharacters } from './characters.ts'
import { emptyKnowledge } from './knowledge.ts'
import type { NpcTurnInput } from './npc-turn.ts'
import { RoleplayError } from './records.ts'

/**
 * Report all invalid person fields before staging a character turn.
 * @param cast - Authoritative encounters, filtered to the authenticated observer.
 * @param actorId - Authenticated character identity.
 * @param input - Model submission with perspective-local routing fields.
 * @param scene - Current scene and its participants, used only for visible correction hints.
 * @returns nothing; invalid references reject the complete submission without resolving labels.
 */
export function validateNpcReferences(cast: StoryCharacters, actorId: string, input: NpcTurnInput,
  scene: { id: string; present: readonly string[] }): void {
  const issues: string[] = []
  const people = visibleCharacters(cast, actorId, scene.id, scene.present)
  const check = (ref: string, path: string, knowledge = false): void => {
    const encounter = cast.encounters.find(item => item.observerId === actorId && item.ref === ref)
    if (knowledge ? encounter !== undefined : ref === 'self' || encounter?.actorId !== undefined) return
    const candidates = knowledge
      ? cast.encounters.filter(item => item.observerId === actorId).map(item => ({ ref: item.ref,
        label: encounterLabel(item, cast.knowledge[actorId] ?? emptyKnowledge()) }))
      : people
    const matches = candidates.filter(item => item.label === ref)
    const first = matches[0]
    const hint = matches.length === 1 && first !== undefined ? ` This visible label has ref=${JSON.stringify(first.ref)}; copy that ref.`
      : matches.length > 1 ? ` This label is ambiguous; choose the intended ref from ${JSON.stringify(matches)}.`
        : ' Copy an available ref from your supplied perspective; do not guess a name or another observer\'s ref.'
    issues.push(`${path}: Person reference is unavailable.${hint}`)
  }
  for (const [index, item] of (input.behavior ?? []).entries()) {
    if (item.kind === 'speech') (item.to ?? []).forEach((ref, target) => { check(ref, `behavior[${index}].to[${target}]`) })
    else if (item.target !== undefined) check(item.target, `behavior[${index}].target`)
  }
  for (const [index, item] of (input.state_changes ?? []).entries()) {
    if (item.definition === undefined) continue
    const path = `state_changes[${index}].definition`
    check(item.definition.actorId, `${path}.actorId`)
    if (item.definition.targetActorId !== undefined) check(item.definition.targetActorId, `${path}.targetActorId`)
    for (const [target, ref] of (item.definition.audience ?? []).entries()) check(ref, `${path}.audience[${target}]`)
  }
  for (const [index, item] of (input.knowledge_changes ?? []).entries()) {
    item.entityRefs.forEach((ref, target) => { check(ref, `knowledge_changes[${index}].entityRefs[${target}]`, true) })
  }
  if (input.discussion?.next_speaker_id !== undefined) check(input.discussion.next_speaker_id, 'discussion.next_speaker_id')
  input.discussion_request?.participant_refs.forEach((ref, index) => { check(ref, `discussion_request.participant_refs[${index}]`) })
  if (issues.length > 0) throw new RoleplayError('invalid', `${issues.join('\n')}\nNo part of this turn was committed. Correct only the listed fields and resubmit the complete npc_commit_turn, preserving speech, actions and required fields. Labels are display text; person refs are not evidence sourceRefs.`)
}
