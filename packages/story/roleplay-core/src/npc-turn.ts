/** Complete character-turn rules shared by execution tools and narrative transactions. */
import { contextUpdateSchema } from './context-retention.ts'
import { knowledgeChangeSchema, type KnowledgeChange } from './knowledge.ts'
import { stateChangeSchema, type StateChange } from './dynamic-state.ts'
import type { CharacterAccess, CharacterCommands } from './actor-commands.ts'
import type { ActorCapability, ReflectRequest, RememberRequest, ReleaseMemoryRequest, ChangeGoalRequest, RecordTurningPointRequest, ActorTurnPosture } from './actor-model.ts'
import type { z } from 'zod'
/** Semantic model delta; identities and record revisions are allocated by the host. */
export interface NpcTurnInput {
  readonly knowledge_changes?: readonly z.input<typeof knowledgeChangeSchema>[]
  readonly state_changes?: readonly z.input<typeof stateChangeSchema>[]
  readonly context_update?: z.input<typeof contextUpdateSchema>
  readonly posture: ActorTurnPosture
  readonly thoughts?: readonly ReflectRequest[]
  readonly memories?: readonly RememberRequest[]
  readonly released_memories?: readonly ReleaseMemoryRequest[]
  readonly goals?: readonly ChangeGoalRequest[]
  readonly intentions?: readonly { intention: string; trigger_kind: 'soon' | 'world-time' | 'event' | 'condition'; trigger?: string; commitment?: number }[]
  readonly turning_points?: readonly Omit<RecordTurningPointRequest, 'sourceRefs' | 'status'>[]
  readonly behavior?: readonly (
  { kind: 'speech'; text: string; to?: readonly string[]; delivery?: 'spoken' | 'whispered' | 'written'; tone?: string; intent?: string } |
  { kind: 'action'; attempt: string; target?: string; purpose?: string; manner?: string; intent?: string; visibility?: 'public' | 'concealed'; await_result?: boolean }
  )[]
  readonly next_impulse?: string
  readonly discussion_request?: { topic: string; opening: string; participant_refs: readonly string[] }
  readonly discussion?: { stance?: string; eagerness: 'low' | 'medium' | 'high'; action: 'speak' | 'pass' | 'conclude'; next_speaker_id?: string }
}
/** Current transaction owns cognition validation and source-address formatting. */
export interface NpcTurnPorts {
  readonly maxContextUpdateUnits: number
  readonly independentNarrative: boolean
  changeKnowledge(changes: readonly KnowledgeChange[]): void
  changeState(changes: readonly StateChange[]): void
  sourceReference(kind: 'memory' | 'memory-release' | 'goal', id: string, revision?: number): string
}
const SPEECH_INTENT_VALUES = [
  'sincere', 'question', 'command', 'promise', 'proposal', 'threat', 'comfort', 'lie', 'mislead', 'evade',
] as const
type SpeechIntent = typeof SPEECH_INTENT_VALUES[number]
const SPEECH_INTENTS: ReadonlySet<string> = new Set(SPEECH_INTENT_VALUES)

function turningPointFingerprint(changes: readonly {
  readonly dimension: string
  readonly subject: string
  readonly after: string
}[]): string {
  return changes.map(change => `${change.dimension}:${change.subject}:${change.after}`)
    .join('|').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}


/**
 * Apply one validated semantic turn to a caller-owned transaction-local capability.
 * @param commands - character business rules and host limits.
 * @param access - authenticated, staged character projection and change sink.
 * @param args - complete intended character delta.
 * @param ports - transaction-local cognition and source capabilities.
 * @returns nothing; any failure must abort the enclosing transaction.
 */
export function applyNpcTurn(commands: CharacterCommands, access: CharacterAccess, args: NpcTurnInput, ports: NpcTurnPorts): void {
  const allowed = new Set(['knowledge_changes', 'context_update', 'posture', 'thoughts', 'state_changes', 'memories',
    'released_memories', 'goals', 'intentions', 'turning_points', 'behavior', 'next_impulse', 'discussion', 'discussion_request'])
  const unknown = Object.keys(args).find(key => !allowed.has(key))
  if (unknown !== undefined) throw new Error(`Unknown npc_commit_turn field '${unknown}'; use state_changes for subjective state`)
  if (!ports.independentNarrative && (args.discussion_request !== undefined
    || args.behavior?.some(item => item.kind === 'action' && (item.visibility === 'concealed' || item.await_result)))) {
    throw new Error('Discussion invitations and concealed actions require the independent narrative runtime')
  }
  if (args.context_update !== undefined) contextUpdateSchema.parse(args.context_update)
  if ((args.context_update?.length ?? 0) > ports.maxContextUpdateUnits) {
    throw new Error(`At most ${ports.maxContextUpdateUnits} context update units may be submitted at once`)
  }
  const requiredCapabilities: Array<readonly [boolean, ActorCapability, string]> = [
    [(args.thoughts?.length ?? 0) > 0 || (args.state_changes?.length ?? 0) > 0
      || (args.knowledge_changes?.length ?? 0) > 0 || (args.turning_points?.length ?? 0) > 0, 'reflect',
    (['thoughts', 'state_changes', 'knowledge_changes', 'turning_points'] as const)
      .filter(key => (args[key]?.length ?? 0) > 0).join(', ')],
    [(args.memories?.length ?? 0) > 0 || (args.released_memories?.length ?? 0) > 0, 'memory', 'memory'],
    [(args.goals?.length ?? 0) > 0, 'goals', 'goal'],
    [(args.intentions?.length ?? 0) > 0, 'schedule', 'intention'],
    [(args.behavior ?? []).some(item => item.kind === 'speech'), 'speak', 'speech'],
    [(args.behavior ?? []).some(item => item.kind === 'action'), 'act', 'action'],
  ]
  for (const [used, capability, label] of requiredCapabilities) {
    if (used && !access.descriptor.capabilities.includes(capability)) throw new Error(`This NPC was not granted the '${capability}' capability required by ${label}`)
  }
  const materialJourneyChangeCount = (args.knowledge_changes?.length ?? 0) + (args.state_changes?.length ?? 0)
    + (args.memories?.length ?? 0)
    + (args.released_memories?.length ?? 0)
    + (args.goals?.length ?? 0)
  if ((args.turning_points?.length ?? 0) > 0 && materialJourneyChangeCount === 0) {
    throw new Error('turning_points require a material belief, goal, relationship, or core-memory change in the same transaction')
  }
  for (const item of args.behavior ?? []) {
    if (item.kind === 'speech' && item.text.trim() === '') {
      throw new Error('Every speech behavior requires non-empty text')
    }
    if (item.kind === 'action' && item.attempt.trim() === '') {
      throw new Error('Every action behavior requires a non-empty attempt')
    }
  }
  const hasSpeech = (args.behavior ?? []).some(item => item.kind === 'speech')
  if (args.discussion?.action === 'speak' && !hasSpeech) {
    throw new Error('discussion action=speak requires at least one speech behavior')
  }
  if (args.discussion?.action === 'pass' && hasSpeech) {
    throw new Error('discussion action=pass cannot include speech behavior')
  }

  const turningPointFingerprints = new Set(commands.playerInspect(access.state()).turningPoints
    .filter(point => point.status !== 'rejected')
    .map(point => turningPointFingerprint(point.changes)))
  for (const item of args.turning_points ?? []) {
    const fingerprint = turningPointFingerprint(item.changes)
    if (turningPointFingerprints.has(fingerprint)) {
      throw new Error('turning_points must not repeat an already recorded durable change')
    }
    turningPointFingerprints.add(fingerprint)
  }
  const turningPointSourceRefs: string[] = []
  if (args.knowledge_changes !== undefined) ports.changeKnowledge( args.knowledge_changes.map(item => knowledgeChangeSchema.parse(item)))
  for (const item of args.thoughts ?? []) commands.reflect(access, item)
  if (args.state_changes !== undefined) {
    const changes = args.state_changes.map(item => stateChangeSchema.parse(item))
    ports.changeState( changes)
    turningPointSourceRefs.push(...changes.map(item => `state:${item.fieldId}:r${item.expectedRevision + 1}`))
  }
  for (const item of args.memories ?? []) {
    const memory = commands.remember(access, item)
    turningPointSourceRefs.push(ports.sourceReference('memory', memory.id))
  }
  for (const item of args.released_memories ?? []) {
    const release = commands.releaseMemory(access, item)
    turningPointSourceRefs.push(ports.sourceReference('memory-release', release.id))
  }
  for (const item of args.goals ?? []) {
    const goal = commands.changeGoal(access, item)
    turningPointSourceRefs.push(ports.sourceReference('goal', goal.id, goal.revision))
  }
  for (const item of args.turning_points ?? []) {
    commands.recordTurningPoint(access, {
      trigger: item.trigger,
      interpretation: item.interpretation,
      significance: item.significance,
      changes: item.changes,
      sourceRefs: [...new Set(turningPointSourceRefs)].slice(0, 16),
    })
  }
  for (const item of args.intentions ?? []) {
    const trigger = item.trigger_kind === 'soon'
      ? { kind: 'soon' as const }
      : item.trigger_kind === 'world-time'
        ? { kind: 'world-time' as const, at: item.trigger ?? '' }
        : item.trigger_kind === 'event'
          ? { kind: 'event' as const, when: item.trigger ?? '' }
          : { kind: 'condition' as const, condition: item.trigger ?? '' }
    commands.schedule(access, {
      description: item.intention, trigger,
      ...(item.commitment === undefined ? {} : { commitment: item.commitment }),
    })
  }
  for (const item of args.behavior ?? []) {
    if (item.kind === 'speech') {
      const speechIntent = item.intent === undefined || !SPEECH_INTENTS.has(item.intent)
        ? undefined
        : item.intent as SpeechIntent
      commands.speak(access, {
        text: item.text,
        ...(item.to === undefined ? {} : { audience: item.to.map(ref => access.resolvePerson( ref)) }),
        ...(item.delivery === undefined ? {} : { delivery: item.delivery }),
        ...(item.tone === undefined ? {} : { tone: item.tone }),
        ...(speechIntent === undefined ? {} : { intent: speechIntent }),
      })
    } else {
      commands.act(access, {
        description: item.attempt,
        ...(item.target === undefined ? {} : { target: item.target.startsWith('person-') ? access.resolvePerson( item.target) : item.target }),
        ...(item.purpose === undefined ? {} : { purpose: item.purpose }),
        ...(item.manner === undefined ? {} : { manner: item.manner }),
      })
    }
  }
  commands.closeCurrentTurn(access, 'yield', undefined, {
    posture: args.posture,
    ...(args.next_impulse === undefined ? {} : { nextImpulse: args.next_impulse }),
    ...(args.discussion === undefined ? {} : { discussion: {
      ...(args.discussion.stance === undefined ? {} : { stance: args.discussion.stance }),
      eagerness: args.discussion.eagerness,
      action: args.discussion.action,
      ...(args.discussion.next_speaker_id === undefined ? {} : { nextSpeakerId: access.resolvePerson( args.discussion.next_speaker_id) }),
    } }),
  })

}
