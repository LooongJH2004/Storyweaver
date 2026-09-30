import { ContextAssembly, recipeOf } from './context-recipe.ts'
import { reasoningLanguageInstruction } from './reasoning-mode.ts'
import { resolveInstanceSettings } from './settings.ts'
import { appendRetention } from './retention-records.ts'
import { RetentionQueries } from './retention.ts'
import type { NarrativeRecallInput } from './command-inputs.ts'
import type { NarrativeRecallView } from './types.ts'
import { inspectCharacter } from './actor-state.ts'
import { currentDiscussion } from './discussions.ts'
import { pendingWorldAttempts } from './world-attempts.ts'
/** Request and preview use the same instance-filtered, observer-projected query. */
import { z } from 'zod'
import { renderDynamicState } from './dynamic-state.ts'
import { encounterLabel, projectIdentityReferences, visibleCharacters } from './characters.ts'
import { renderStyle, resolveStyle, styleOverridesSchema } from './style.ts'
import { queryKnowledge } from './knowledge.ts'
import { entity, compareRecordKeys, RoleplayError } from './records.ts'
import { perceivedEvidenceFor, comparePerceivedEvents } from './perceived-evidence.ts'
import { castOf, knowledgeOf, lifecycleFor, personOf, sceneOf, stateOf, discussionsOf } from './world.ts'
import type { InstanceId } from './types.ts'
import type { NarrativeReader, KnownPeopleView, CharacterCognitionView } from './types.ts'

export type { ActorContextView, PerspectiveRequest, AuthorPeopleView } from './types.ts'
import type { ActorContextView, PerspectiveRequest, AuthorPeopleView } from './types.ts'

/** Perspective queries return explicit play/author views rather than the Story aggregate. */
export class PerspectiveQueries {
  /** Retrieve original personal records at the same frozen revision as the current actor request. */
  recall(input: PerspectiveRequest, query: NarrativeRecallInput): NarrativeRecallView {
    return new RetentionQueries(this.commands, this.pageLimit, this.recallCharacterLimit)
      .recall(input.instanceId, `actor:${input.actorId}`, query, input.revision)
  }
  constructor(private readonly commands: NarrativeReader, private readonly recallCharacterLimit: number,
    private readonly fieldReference: (id: string) => string, private readonly pageLimit: number) {
    if (!Number.isSafeInteger(pageLimit) || pageLimit < 1) throw new RoleplayError('invalid', 'Query page limit must be positive')
    if (!Number.isSafeInteger(recallCharacterLimit) || recallCharacterLimit < 1) throw new RoleplayError('invalid', 'Recall character limit must be positive')
  }

  actorContext(input: PerspectiveRequest): ActorContextView {
    const snapshot = input.revision === undefined ? this.commands.snapshot(input.instanceId)
      : this.commands.replay(input.instanceId, input.revision)
    const person = personOf(snapshot, input.actorId)
    const cast = castOf(snapshot)
    const scene = sceneOf(snapshot)
    const people = visibleCharacters(cast, input.actorId, scene.id, scene.present)
    const style = resolveStyle({ kind: 'actor', guidance: person.definition.actingGuidance },
      styleOverridesSchema.parse(entity(snapshot, { collection: 'style', id: 'current' })), `actor:${input.actorId}`, scene.id)
    const projected = projectIdentityReferences({ person: { publicPersona: person.definition.publicPersona,
      rolePrompt: person.definition.rolePrompt, capabilities: person.definition.capabilities },
    people, state: stateOf(snapshot, input.actorId), objective: { version: 1,
      entries: stateOf(snapshot, 'world').entries.filter(item => item.active && item.definition.audience.includes(input.actorId)), history: [] },
    }, cast, input.actorId, this.fieldReference) as { person: unknown
      people: unknown
      state: ReturnType<typeof stateOf>
      objective: ReturnType<typeof stateOf> }
    const discussion = currentDiscussion(snapshot)
    const participation = discussion?.participantIds.includes(input.actorId) ? discussion : undefined
    const discussionText = participation === undefined
      ? '\n[DISCUSSION FLOOR]\nNo assigned group discussion. Omit discussion from npc_commit_turn; ordinary speech still belongs in behavior.'
        + (discussion === undefined
          ? ' If you want several present people to exchange views together before deciding, submit discussion_request in this turn with the issue, opening purpose and their local refs. That is an invitation awaiting acceptance, not the discussion field for an assigned floor. Merely asking everyone in speech does not create the request. Ordinary conversation does not require an invitation.'
          : '')
      : `\n[DISCUSSION FLOOR]\n${JSON.stringify(projectIdentityReferences({
        id: participation.id, topic: participation.topic, status: participation.status,
        preparing: participation.preparationPendingIds?.includes(input.actorId) ?? false,
        currentSpeakerId: participation.currentSpeakerId, participants: participation.participantIds,
        publicTurns: {
          used: participation.turns.length,
          total: participation.maxRounds * participation.participantIds.length,
          remaining: Math.max(0, participation.maxRounds * participation.participantIds.length - participation.turns.length),
          counting: 'Each public speak, pass or conclude consumes one turn. Private preparation consumes none. Remaining includes the current turn; it is a ceiling, not a requirement to keep talking.',
        },
        opportunities: participation.participantIds.map(actorId => ({ actorId,
          publicTurns: participation.turns.filter(turn => turn.speakerId === actorId).length })),
        yourIntent: participation.participantIntents?.[input.actorId] === undefined ? undefined : {
          stance: participation.participantIntents[input.actorId]?.stance,
          eagerness: participation.participantIntents[input.actorId]?.eagerness,
        },
        instruction: (participation.preparationPendingIds?.length ?? 0) > 0
          ? 'PRIVATE PREPARATION ONLY. No public speech or action. Submit posture=watching, behavior=[], discussion.action=pass and your actual eagerness. Optionally note what your character wants from this exchange in stance; do not prewrite a speech or an evidence checklist. Omit next_speaker_id. Preparation is private and revisable after hearing others.'
          : 'Only the current speaker may publish. Submit a discussion decision with this turn. Your prior stance is a private starting intention, not a speech outline. Answer the relevant words or actions you actually perceived, rather than restating your position. Prefer one useful contribution: a reply, question, choice, commitment or attempted action. Keep it as brief as the moment allows while respecting explicit character and scene length guidance. Pass if you have nothing useful to add. If your contribution needs world feedback, keep action=speak or pass as appropriate: the host pauses and resumes the discussion after settlement. Waiting for a result is not a reason to conclude. Conclude only when an outcome or irreducible deadlock is reached, or no useful exchange remains. Before concluding, give an affected participant with no public opportunity a chance to respond, object or pass; lack of a floor is not agreement. Finishing your own reply alone does not end the group exchange. Quiet changes and unresolved disagreement are valid outcomes. Floor metadata is not character dialogue.',
      }, cast, input.actorId, this.fieldReference))}`
    const settings = resolveInstanceSettings(snapshot).effective
    const recipe = recipeOf(snapshot).actor
    const assembly = new ContextAssembly(recipe)
    const add = (id: string, label: string, content: unknown, source: string): boolean =>
      assembly.add(id, `[${label}]\n${JSON.stringify(content)}`, source)
    add('identity', 'YOUR CHARACTER', projected.person, 'character:self')
    assembly.add('people', `[CURRENT PEOPLE]\nRouting: copy ref into behavior[].to or target. label is display text, never a routing value. Person refs are not evidence sourceRefs.\n${JSON.stringify(projected.people)}`, 'scene:current')
    assembly.add('subjective-state', `[CURRENT SUBJECTIVE STATE]\n${renderDynamicState(projected.state)}`, 'state:self')
    assembly.add('objective-state', `[PERCEIVED OBJECTIVE STATE]\n${renderDynamicState(projected.objective)}`, 'state:perceived')
    assembly.add('discussion', discussionText, 'discussion:current')
    const awaiting = pendingWorldAttempts(snapshot).filter(item => item.actorId === input.actorId)
      .map(item => ({ id: item.id, attempt: item.behavior.kind === 'action' ? item.behavior.attempt : '' }))
    if (awaiting.length > 0) add('evidence', 'YOUR PENDING WORLD ATTEMPTS — await feedback; do not repeat them', awaiting, 'world:pending')
    const ownRequests = (discussionsOf(snapshot).requests ?? []).filter(item => item.actorId === input.actorId)
      .map(item => ({ id: item.id, revision: item.revision, topic: item.topic,
        status: item.status, reason: item.reason }))
    if (ownRequests.length > 0) add('discussion', 'YOUR DISCUSSION REQUESTS — do not repeat pending invitations', ownRequests, 'discussion:requests')
    assembly.add('style', renderStyle(style.profile), 'style:current')
    if (style.sceneInstruction !== '') assembly.add('scene-style',
      `[CURRENT SCENE GUIDANCE — author-side performance direction, not perceived facts or evidence]\n${style.sceneInstruction}`,
      'style:scene')
    const separate = (id: string) => recipe.some(section => section.id === id)
    for (const [id, value] of [['policy', settings.contextRules.actor.policy], ['tools', settings.contextRules.actor.tools]] as const)
      if (separate(id)) assembly.add(id, value, 'setting:overrides')
    const language = reasoningLanguageInstruction(settings.reasoningLanguage)
    if (separate('reasoning-language')) assembly.add('reasoning-language', language, 'setting:overrides')
    const grouped = { ...(!separate('policy') ? { policy: settings.contextRules.actor.policy } : {}),
      ...(!separate('tools') ? { tools: settings.contextRules.actor.tools } : {}),
      ...(!separate('reasoning-language') ? { reasoningLanguage: language } : {}) }
    if (Object.keys(grouped).length > 0) add('guidance', 'AUTHOR GUIDANCE — current tool schemas and host authority govern execution', grouped, 'setting:overrides')
    const archived = appendRetention(snapshot, `actor:${input.actorId}`, (label, content, source) => add('retention', label, content, source))
    for (const turn of participation?.turns ?? []) {
      const label = turn.identityLabels?.[input.actorId]
      const ref = turn.speakerId === input.actorId ? 'self' : turn.speakerRefs?.[input.actorId]
      if (archived.has(turn.sourceEventRef ?? turn.id)) continue
      if (ref !== undefined) add('discussion', 'DISCUSSION TURN — recap only; cite RECEIVED EVIDENCE ids for sources',
        { speaker: ref, label, text: turn.text, action: turn.action }, turn.sourceEventRef ?? turn.id)
    }
    // Only observer-authorized, unarchived entries enter automatic context; originals remain recallable.
    for (const common of person.definition.commonKnowledge ?? cast.commonKnowledge) {
      add('common-knowledge', 'AUTHORED COMMON KNOWLEDGE', common, 'commonKnowledge')
    }
    const evidence = perceivedEvidenceFor(snapshot, input.actorId).filter(item => !archived.has(item.id))
      .sort(comparePerceivedEvents)
    assembly.addHistory('evidence', evidence.map(item => ({ source: item.id,
      content: `[RECEIVED EVIDENCE — claims and reports are not established truth; actions are attempts, not settled outcomes]\n${JSON.stringify(item)}` })))
    const ownKnowledge = knowledgeOf(snapshot, input.actorId)
    const knowledge = queryKnowledge({ ...ownKnowledge,
      entries: ownKnowledge.entries.filter(entry => !archived.has(`knowledge:${entry.id}:r${entry.revision}`)) },
    input.query.trim(), people.map(item => item.ref), 0, ownKnowledge.entries.length)
    for (const entry of knowledge.entries) {
      const source = `knowledge:${entry.id}:r${entry.revision}`
      if (!archived.has(source)) add('knowledge', 'YOUR JUDGMENT', entry, source)
    }
    const lifecycle = lifecycleFor(snapshot, input.actorId)
    const groups = [
      [...lifecycle.goals.values()].filter(item => item.status === 'active').map(item => ({ kind: 'goal', value: item })),
      [...lifecycle.intentions.values()].map(item => ({ kind: 'intention', value: item })),
      [...lifecycle.memories.values()].filter(item => item.status === 'active').map(item => ({ kind: 'memory', value: item.record })),
      [...lifecycle.turningPoints.values()].filter(item => item.status !== 'rejected').map(item => ({ kind: 'turning-point', value: item })),
    ]
    const sourceOf = (item: (typeof groups)[number][number]) =>
      `${item.kind}:${item.value.id}${'revision' in item.value ? `:r${item.value.revision}` : ''}`
    const records = groups.flatMap(group => group.filter(item => !archived.has(sourceOf(item))))
    for (const item of records) {
      const { actorId: _owner, ...value } = item.value
      const sourceRef = sourceOf(item)
      add('lifecycle', 'YOUR PERSONAL RECORD', { kind: item.kind, ...value, sourceRef }, sourceRef)
    }
    return { instanceId: snapshot.instance.id, revision: snapshot.instance.revision, templateVersionId: snapshot.instance.templateVersionId,
      configurationRevision: z.number().int().nonnegative().parse(entity(snapshot, { collection: 'configuration', id: 'revision' })),
      actorId: input.actorId, capabilities: [...person.definition.capabilities], ...assembly.finish() }
  }

  /** Author-only query deliberately differs from the observer's person references. */
  authorPeople(instanceId: InstanceId, input: { query: string; location?: string; offset: number; limit: number },
    revision?: number): AuthorPeopleView {
    this.validatePage(input.offset, input.limit)
    const snapshot = revision === undefined ? this.commands.snapshot(instanceId) : this.commands.replay(instanceId, revision)
    const cast = castOf(snapshot)
    const words = input.query.toLocaleLowerCase().split(/\s+/u).filter(Boolean)
    const selected = cast.entries.filter(person => input.location === undefined || person.location === input.location)
      .filter(person => words.every(word => `${person.definition.displayName} ${person.purpose} ${person.definition.publicPersona}`.toLocaleLowerCase().includes(word)))
      .sort((a, b) => compareRecordKeys(a.definition.actorId, b.definition.actorId))
    return { revision: snapshot.instance.revision, entries: selected.slice(input.offset, input.offset + input.limit),
      total: selected.length }
  }

  /** Inspect current private state and its retained history without restoring an Actor. */
  authorCognition(instanceId: InstanceId, actorId: string, revision?: number): CharacterCognitionView {
    const snapshot = revision === undefined ? this.commands.snapshot(instanceId) : this.commands.replay(instanceId, revision)
    const lifecycle = lifecycleFor(snapshot, actorId)
    lifecycle.knowledge = knowledgeOf(snapshot, actorId)
    lifecycle.dynamicState = stateOf(snapshot, actorId)
    return { instanceId, actorId, revision: snapshot.instance.revision, current: inspectCharacter(lifecycle) }
  }

  /** An observer can search only encountered identities; names never join people automatically. */
  knownPeople(instanceId: InstanceId, actorId: string, query: string, offset: number, limit: number): KnownPeopleView {
    this.validatePage(offset, limit)
    const snapshot = this.commands.snapshot(instanceId)
    personOf(snapshot, actorId)
    const cast = castOf(snapshot)
    const knowledge = knowledgeOf(snapshot, actorId)
    const entries = cast.encounters.filter(item => item.observerId === actorId)
      .map(item => ({ ref: item.ref, label: encounterLabel(item, knowledge) }))
      .filter(item => item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => compareRecordKeys(a.ref, b.ref))
    return { revision: snapshot.instance.revision, entries: entries.slice(offset, offset + limit), total: entries.length }
  }
  private validatePage(offset: number, limit: number): void {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > this.pageLimit) {
      throw new RoleplayError('invalid', 'Query pagination exceeds its configured bounds')
    }
  }

}
