/** Accepted character behavior freezes its audience, source and identity projection at publication. */
import type { z } from 'zod'
import { historicalCharacterLabels, historicalPersonReferences, resolvePersonReference, type StoryCharacters } from './characters.ts'
import { castOf, sceneOf, personOf, replace, type behaviorSchema } from './world.ts'
import { RoleplayError } from './records.ts'
import type { NarrativeSnapshot, NarrativeEvent, RuntimeValues } from './types.ts'

/** Publish an actor turn or player embodiment without asserting successful action consequences. */
export function publishBehaviors(snapshot: NarrativeSnapshot, actorId: string, behavior: readonly z.infer<typeof behaviorSchema>[],
  origin: 'actor' | 'player', values: RuntimeValues): { events: NarrativeEvent[]; ids: string[] } {
  personOf(snapshot, actorId)
  const cast = castOf(snapshot)
  const scene = sceneOf(snapshot)
  if (!scene.present.includes(actorId) && behavior.length > 0) throw new RoleplayError('invalid', 'Character is not in the current scene')
  const labels = historicalCharacterLabels(cast, actorId)
  const references = historicalPersonReferences(cast, actorId)
  const events: NarrativeEvent[] = []
  const ids: string[] = []
  for (const [order, item] of behavior.entries()) {
    const id = values.id()
    ids.push(id)
    const targets = item.kind === 'speech' ? item.to.map(ref => resolvePersonReference(cast, actorId, ref))
      : item.target === undefined ? [] : [resolvePersonReference(cast, actorId, item.target)]
    if (targets.some(target => !scene.present.includes(target))) throw new RoleplayError('invalid', 'Behavior target is not present')
    const audience = item.kind === 'action' && item.visibility === 'concealed' ? []
      : item.kind === 'speech' && item.delivery !== 'spoken' ? targets : [...scene.present, 'observer']
    events.push(replace('behavior', id, { id, order, actorId, origin, behavior: item, targets, audience,
      labels, references, sceneId: scene.id, revision: snapshot.instance.revision + 1 }))
    const content = item.kind === 'speech' ? item.text : item.attempt
    for (const recipient of new Set([...audience.filter(id => id !== 'observer'), actorId])) {
      events.push(replace(`evidence:${recipient}`, id, { id, recipient, content,
        kind: item.kind === 'speech' ? 'claim' : 'observation', sourceRefs: [],
        behavior: perceiveBehavior(cast, actorId, item, targets, recipient),
        personRefs: references[recipient] === undefined ? [] : [references[recipient]], revision: snapshot.instance.revision + 1 }))
    }
  }
  return { events, ids }
}

/**
 * Freeze public behavior attribution using only the recipient's current identity judgments.
 * @param cast - Cast before publication, including current encounters.
 * @param actorId - Actual performer, never emitted as a canonical identity.
 * @param behavior - Accepted speech or action; private intent and purpose are excluded.
 * @param targets - Resolved present addressees or the action's person target.
 * @param recipient - Authenticated observer receiving this event.
 * @returns Observable attribution with stable local refs and historical labels.
 */
export function perceiveBehavior(cast: StoryCharacters, actorId: string, behavior: z.infer<typeof behaviorSchema>,
  targets: readonly string[], recipient: string) {
  const person = (personId: string) => {
    if (personId === recipient) return { ref: 'self', label: '你' }
    const ref = historicalPersonReferences(cast, personId)[recipient]
    const label = historicalCharacterLabels(cast, personId)[recipient]
    if (ref === undefined || label === undefined) throw new RoleplayError('invalid', 'Present person has no recipient identity projection')
    return { ref, label }
  }
  return behavior.kind === 'speech'
    ? { kind: 'speech' as const, speaker: person(actorId), delivery: behavior.delivery,
      addressedTo: targets.map(person) }
    : { kind: 'action' as const, actor: person(actorId), ...(targets[0] === undefined ? {} : { target: person(targets[0]) }) }
}
