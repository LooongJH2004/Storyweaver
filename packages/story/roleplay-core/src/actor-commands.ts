import { inspectCharacter } from './actor-state.ts'
/** Character business commands use explicit state, record, identity, and clock capabilities. */
import type { RuntimeValues } from './types.ts'
import type { ActorFoldState } from './actor-state.ts'
import type { CharacterChangeType, CharacterChangeMap } from './actor-events.ts'
import { ActorError } from './actor-error.ts'
import { actorContinuityRequestSchema } from './actor-continuity.ts'
import {
  ActorActionId,
  ActorBeliefId,
  ActorEmotionId,
  ActorExpressionId,
  ActorGoalId,
  ActorIntentionId,
  ActorMemoryId,
  ActorMemoryReleaseId,
  ActorRelationshipId,
  ActorThoughtId,
  ActorTurningPointId,
  PlayerInterventionId,
} from './actor-model.ts'
import type {
  AbandonGoalRequest,
  ActRequest,
  ActorActionRecord,
  ActorBeliefSnapshot,
  ActorCapability,
  ActorDescriptor,
  ActorEmotionRecord,
  ActorExpressionRecord,
  ActorGoalSnapshot,
  ActorIntentionRecord,
  ActorMemoryRecord,
  ActorMemoryReleaseRecord,
  ActorMemoryView,
  ActorModelContext,
  ActorPrivateView,
  ActorRelationshipSnapshot,
  ActorThoughtRecord,
  ActorTurningPointChange,
  ActorTurningPointSnapshot,
  ActorTurnCloseReason,
  ActorDiscussionIntent,
  ActorContinuityRequest,
  ActorTurnPosture,
  BelieveRequest,
  ChangeGoalRequest,
  Config,
  ForgetRequest,
  FeelRequest,
  PlayerActionResult,
  PlayerInterventionRecord,
  PlayerSpeechResult,
  RecallRequest,
  RecordTurningPointRequest,
  RelateRequest,
  ReleaseMemoryRequest,
  ReflectRequest,
  RememberRequest,
  ScheduleIntentionRequest,
  SetGoalRequest,
  SpeakRequest,
  UpdateTurningPointRequest,
} from './actor-model.ts'
/** Host authentication supplies this descriptor independently from model arguments. */
export interface CharacterMembership { readonly id: ActorDescriptor['id']; readonly descriptor: ActorDescriptor }
/** A transaction-local character capability never exposes an Agent or Story aggregate. */
export interface CharacterAccess {
  readonly descriptor: ActorDescriptor
  state(): ActorFoldState
  append<T extends CharacterChangeType>(type: T, data: CharacterChangeMap[T]): void
  resolvePerson(ref: string): string
}

const ACTOR_CAPABILITIES: ReadonlySet<ActorCapability> = new Set([
  'speak', 'act', 'reflect', 'memory', 'goals', 'schedule',
])
function semanticKey(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function semanticUnits(value: string): Set<string> {
  const normalized = semanticKey(value)
  if (normalized.length < 2) return new Set(normalized === '' ? [] : [normalized])
  return new Set(Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)))
}

function semanticScore(query: string, candidate: string): number {
  const left = semanticKey(query)
  const right = semanticKey(candidate)
  if (left === '' || right === '') return 0
  if (left === right || left.includes(right) || right.includes(left)) return 1
  const leftUnits = semanticUnits(left)
  const rightUnits = semanticUnits(right)
  let overlap = 0
  for (const unit of leftUnits) if (rightUnits.has(unit)) overlap++
  return overlap / Math.max(1, Math.min(leftUnits.size, rightUnits.size))
}

function bestSemanticMatch<T>(query: string, candidates: readonly T[], text: (candidate: T) => string): T | undefined {
  let best: { candidate: T; score: number } | undefined
  for (const candidate of candidates) {
    const score = semanticScore(query, text(candidate))
    if (best === undefined || score > best.score) best = { candidate, score }
  }
  return best !== undefined && best.score >= 0.2 ? best.candidate : undefined
}

/** Validate one positive safe-integer deployment limit. */
function positiveLimit(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ActorError(`${name} must be a positive safe integer`, 'ACTOR_INVALID_CONFIG')
  }
  return value
}

/** Business commands shared by narrative transactions and the execution adapter. */
export class CharacterCommands {
  private readonly encoder = new TextEncoder()
  constructor(private readonly config: Required<Config>,  private readonly values: RuntimeValues) {
    for (const [name, value] of Object.entries(config)) positiveLimit(name, value)
  }
  private membership(access: CharacterAccess): CharacterMembership { return { id: access.descriptor.id, descriptor: access.descriptor } }
  private recordChange<T extends CharacterChangeType>(access: CharacterAccess, type: T,
    data: CharacterChangeMap[T]): void { access.append(type, data) }

  /**
   * Persist one fictional inner reflection chosen by the Actor.
   * @param agent - exact live character access.
   * @param request - complete fictional inner content.
   * @returns the committed thought record.
   */
  reflect(agent: CharacterAccess, request: ReflectRequest): ActorThoughtRecord {
    const membership = this.requireCapability(agent, 'reflect')
    const thought: ActorThoughtRecord = {
      id: ActorThoughtId(this.newId('thought')),
      actorId: membership.id,
      content: this.text('content', request.content),
      about: this.stringList('about', request.about ?? [], this.config.maxSourceRefs),
      ...(request.conclusion === undefined ? {} : { conclusion: this.text('conclusion', request.conclusion) }),
    }
    this.recordChange(agent, 'thought.recorded', { version: 1, thought })
    return thought
  }

  /**
   * Persist one emotional occurrence chosen by this Actor.
   * @param agent - exact live character access.
   * @param request - emotion, intensity, subjects, and optional cause or impulse.
   * @returns the committed emotional occurrence.
   */
  feel(agent: CharacterAccess, request: FeelRequest): ActorEmotionRecord {
    const membership = this.requireCapability(agent, 'reflect')
    if (!Number.isInteger(request.intensity) || request.intensity < 1 || request.intensity > 5) {
      throw new ActorError('intensity must be an integer from 1 through 5', 'ACTOR_INVALID_INPUT')
    }
    const emotion: ActorEmotionRecord = {
      id: ActorEmotionId(this.newId('emotion')),
      actorId: membership.id,
      emotion: this.text('emotion', request.emotion),
      intensity: request.intensity,
      toward: this.stringList('toward', request.toward ?? [], this.config.maxSourceRefs),
      ...(request.cause === undefined ? {} : { cause: this.text('cause', request.cause) }),
      ...(request.impulse === undefined ? {} : { impulse: this.text('impulse', request.impulse) }),
    }
    this.recordChange(agent, 'emotion.recorded', { version: 1, emotion })
    return emotion
  }

  /**
   * Add or revise one subjective belief without asserting a world fact.
   * @param agent - exact live character access.
   * @param request - proposition, stance, confidence, and optional subjects.
   * @returns the committed belief revision.
   */
  believe(agent: CharacterAccess, request: BelieveRequest): ActorBeliefSnapshot {
    const membership = this.requireCapability(agent, 'reflect')
    const proposition = this.text('proposition', request.proposition)
    const confidence = request.confidence ?? 3
    if (!Number.isInteger(confidence) || confidence < 1 || confidence > 5) {
      throw new ActorError('confidence must be an integer from 1 through 5', 'ACTOR_INVALID_INPUT')
    }
    const current = bestSemanticMatch(
      proposition,
      [...agent.state().beliefs.values()],
      belief => belief.proposition,
    )
    const belief: ActorBeliefSnapshot = {
      id: current?.id ?? ActorBeliefId(this.newId('belief')),
      actorId: membership.id,
      revision: (current?.revision ?? 0) + 1,
      proposition: current?.proposition ?? proposition,
      stance: request.stance,
      confidence,
      about: this.stringList('about', request.about ?? current?.about ?? [], this.config.maxSourceRefs),
    }
    this.recordChange(agent, 'belief.revised', { version: 1, belief })
    return belief
  }

  /**
   * Adjust one relationship dimension toward a named subject.
   * @param agent - exact live character access.
   * @param request - target, dimension, bounded shift, and reason.
   * @returns the committed relationship revision.
   */
  relate(agent: CharacterAccess, request: RelateRequest): ActorRelationshipSnapshot {
    const membership = this.requireCapability(agent, 'reflect')
    const target = this.text('target', request.target)
    const state = agent.state()
    const current = [...state.relationships.values()].find(relationship =>
      semanticKey(relationship.target) === semanticKey(target) && relationship.dimension === request.dimension)
    const relationship: ActorRelationshipSnapshot = {
      id: current?.id ?? ActorRelationshipId(this.newId('relationship')),
      actorId: membership.id,
      revision: (current?.revision ?? 0) + 1,
      target: current?.target ?? target,
      dimension: request.dimension,
      value: Math.max(-5, Math.min(5, (current?.value ?? 0) + request.shift)),
      reason: this.text('reason', request.reason),
    }
    this.recordChange(agent, 'relationship.revised', { version: 1, relationship })
    return relationship
  }

  /**
   * Create one explicit active core memory, archiving the least important
   * oldest active memory first when the configured capacity is full.
   * @param agent - exact live character access.
   * @param request - content, importance, tags, and optional source references.
   * @returns the committed active memory.
   */
  remember(agent: CharacterAccess, request: RememberRequest): ActorMemoryRecord {
    this.requireCapability(agent, 'memory')
    return this.writeMemory(agent, request)
  }

  writeMemory(agent: CharacterAccess, request: RememberRequest): ActorMemoryRecord {
    const membership = this.membership(agent)
    const tags = this.stringList('tags', request.tags ?? [], this.config.maxSourceRefs)
    const sourceRefs = this.stringList('sourceRefs', request.sourceRefs ?? [], this.config.maxSourceRefs)
    const importance = request.importance ?? 3
    if (!Number.isInteger(importance) || importance < 1 || importance > 5) {
      throw new ActorError('importance must be an integer from 1 through 5', 'ACTOR_INVALID_INPUT')
    }
    const memory: ActorMemoryRecord = {
      id: ActorMemoryId(this.newId('memory')),
      actorId: membership.id,
      content: this.text('content', request.content),
      importance,
      tags,
      sourceRefs,
      ...(request.meaning === undefined ? {} : { meaning: this.text('meaning', request.meaning) }),
    }
    const active = [...agent.state().memories.values()]
      .filter(candidate => candidate.status === 'active')
    const archiveCount = Math.max(0, active.length - this.config.maxCoreMemories + 1)
    const archived = active
      .map((candidate, index) => ({ candidate, index }))
      .toSorted((left, right) => (
        left.candidate.record.importance - right.candidate.record.importance
        || left.index - right.index
      ))
      .slice(0, archiveCount)
    for (const { candidate } of archived) {
      this.recordChange(agent, 'memory.forgotten', {
        version: 1,
        actorId: membership.id,
        memoryId: candidate.record.id,
        reason: 'core-memory-capacity',
      })
    }
    this.recordChange(agent, 'memory.recorded', { version: 1, memory })
    return memory
  }

  /**
   * Search active memories only; forgotten source records remain outside this view.
   * @param agent - exact live character access.
   * @param request - optional text/tag query and bounded result count.
   * @returns newest matching active memories first.
   */
  recall(agent: CharacterAccess, request: RecallRequest = {}): ActorMemoryRecord[] {
    this.requireCapability(agent, 'memory')
    const query = request.query === undefined ? undefined : this.text('query', request.query).toLocaleLowerCase()
    const limit = request.limit ?? this.config.maxRecallResults
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > this.config.maxRecallResults) {
      throw new ActorError(
        `limit must be an integer from 1 through ${this.config.maxRecallResults}`,
        'ACTOR_INVALID_INPUT',
      )
    }
    return [...agent.state().memories.values()]
      .filter(memory => memory.status === 'active')
      .map(memory => memory.record)
      .filter(memory => query === undefined
        || memory.content.toLocaleLowerCase().includes(query)
        || memory.tags.some(tag => tag.toLocaleLowerCase().includes(query)))
      .reverse()
      .slice(0, limit)
  }

  /**
   * Tombstone one active memory while preserving its raw event for PlayerAuthority audit.
   * @param agent - exact live character access.
   * @param request - active memory identity and optional fictional reason.
   * @returns the newly forgotten memory view.
   */
  forget(agent: CharacterAccess, request: ForgetRequest): ActorMemoryView {
    const membership = this.requireCapability(agent, 'memory')
    const state = agent.state()
    const found = state.memories.get(request.memoryId)
    if (found === undefined || found.status !== 'active') {
      throw new ActorError(`memory "${request.memoryId}" is not active`, 'ACTOR_STATE_CONFLICT')
    }
    const reason = request.reason === undefined ? undefined : this.text('reason', request.reason)
    this.recordChange(agent, 'memory.forgotten', {
      version: 1,
      actorId: membership.id,
      memoryId: request.memoryId,
      ...(reason === undefined ? {} : { reason }),
    })
    return { ...found.record, status: 'forgotten', ...(reason === undefined ? {} : { forgottenReason: reason }) }
  }

  /**
   * Resolve a model-authored semantic description to at most one active memory and release it.
   * @param agent - exact live character access.
   * @param request - semantic subject, release mode, and optional reason.
   * @returns the committed release record and its resolved memory identities.
   */
  releaseMemory(agent: CharacterAccess, request: ReleaseMemoryRequest): ActorMemoryReleaseRecord {
    const membership = this.requireCapability(agent, 'memory')
    const about = this.text('about', request.about)
    const active = [...agent.state().memories.values()]
      .filter(memory => memory.status === 'active')
      .map(memory => memory.record)
    const match = bestSemanticMatch(about, active, memory => `${memory.content} ${memory.meaning ?? ''}`)
    const release: ActorMemoryReleaseRecord = {
      id: ActorMemoryReleaseId(this.newId('memory-release')),
      actorId: membership.id,
      about,
      mode: request.mode ?? 'fade',
      ...(request.reason === undefined ? {} : { reason: this.text('reason', request.reason) }),
      matchedMemoryIds: match === undefined ? [] : [match.id],
    }
    this.recordChange(agent, 'memory.released', { version: 1, release })
    return release
  }

  /**
   * Persist one meaningful Actor-owned interpretation of material state changes.
   * @param agent - exact live character access.
   * @param request - trigger, interpretation, consequences, and durable source references.
   * @returns the committed revision-one turning point.
   */
  recordTurningPoint(agent: CharacterAccess, request: RecordTurningPointRequest): ActorTurningPointSnapshot {
    const membership = this.requireCapability(agent, 'reflect')
    if (!Number.isInteger(request.significance) || request.significance < 3 || request.significance > 5) {
      throw new ActorError('turning-point significance must be an integer from 3 through 5', 'ACTOR_INVALID_INPUT')
    }
    const changes = this.turningPointChanges(request.changes)
    const now = this.values.now()
    const turningPoint: ActorTurningPointSnapshot = {
      id: ActorTurningPointId(this.newId('turning-point')),
      actorId: membership.id,
      revision: 1,
      trigger: this.text('trigger', request.trigger),
      interpretation: this.text('interpretation', request.interpretation),
      significance: request.significance,
      status: request.status ?? 'tentative',
      changes,
      sourceRefs: this.stringList('sourceRefs', request.sourceRefs ?? [], this.config.maxSourceRefs),
      createdAt: now,
      updatedAt: now,
    }
    this.recordChange(agent, 'turning-point.revised', { version: 1, turningPoint })
    return turningPoint
  }

  /**
   * Replace one visible turning point over its exact current revision.
   * @param agent - exact live target character access.
   * @param request - complete player-authored replacement and expected revision.
   * @returns the committed next turning-point revision.
   */
  updateTurningPoint(agent: CharacterAccess, request: UpdateTurningPointRequest): ActorTurningPointSnapshot {
    this.membership(agent)
    const current = agent.state().turningPoints.get(request.turningPointId)
    if (current === undefined) {
      throw new ActorError(`turning point "${request.turningPointId}" does not exist`, 'ACTOR_STATE_CONFLICT')
    }
    if (current.revision !== request.expectedRevision) {
      throw new ActorError(
        `turning point revision ${String(request.expectedRevision)} is stale; current revision is ${String(current.revision)}`,
        'ACTOR_STATE_CONFLICT',
      )
    }
    if (!Number.isInteger(request.significance) || request.significance < 3 || request.significance > 5) {
      throw new ActorError('turning-point significance must be an integer from 3 through 5', 'ACTOR_INVALID_INPUT')
    }
    const turningPoint: ActorTurningPointSnapshot = {
      ...current,
      revision: current.revision + 1,
      trigger: this.text('trigger', request.trigger),
      interpretation: this.text('interpretation', request.interpretation),
      significance: request.significance,
      status: request.status,
      changes: this.turningPointChanges(request.changes),
      sourceRefs: this.stringList('sourceRefs', request.sourceRefs, this.config.maxSourceRefs),
      updatedAt: this.values.now(),
    }
    this.recordChange(agent, 'turning-point.revised', { version: 1, turningPoint })
    return turningPoint
  }

  /**
   * Create one active Actor-owned goal.
   * @param agent - exact live character access.
   * @param request - goal description and optional priority.
   * @returns the revision-one active goal.
   */
  setGoal(agent: CharacterAccess, request: SetGoalRequest): ActorGoalSnapshot {
    this.requireCapability(agent, 'goals')
    return this.writeGoal(agent, request)
  }

  writeGoal(agent: CharacterAccess, request: SetGoalRequest): ActorGoalSnapshot {
    const membership = this.membership(agent)
    const state = agent.state()
    const activeCount = [...state.goals.values()].filter(goal => goal.status === 'active').length
    if (activeCount >= this.config.maxActiveGoals) {
      throw new ActorError(`Actor active-goal limit ${this.config.maxActiveGoals} is reached`, 'ACTOR_LIMIT_REACHED')
    }
    const priority = request.priority ?? 3
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      throw new ActorError('priority must be an integer from 1 through 5', 'ACTOR_INVALID_INPUT')
    }
    const goal: ActorGoalSnapshot = {
      id: ActorGoalId(this.newId('goal')),
      actorId: membership.id,
      revision: 1,
      description: this.text('description', request.description),
      priority,
      status: 'active',
    }
    this.recordChange(agent, 'goal.revised', { version: 1, goal })
    return goal
  }

  /**
   * Abandon one active goal without rewriting its original motivation.
   * @param agent - exact live character access.
   * @param request - active goal identity and optional reason.
   * @returns the committed abandoned goal revision.
   */
  abandonGoal(agent: CharacterAccess, request: AbandonGoalRequest): ActorGoalSnapshot {
    this.requireCapability(agent, 'goals')
    const current = agent.state().goals.get(request.goalId)
    if (current === undefined || current.status !== 'active') {
      throw new ActorError(`goal "${request.goalId}" is not active`, 'ACTOR_STATE_CONFLICT')
    }
    const reason = request.reason === undefined ? undefined : this.text('reason', request.reason)
    const goal: ActorGoalSnapshot = {
      ...current,
      revision: current.revision + 1,
      status: 'abandoned',
      ...(reason === undefined ? {} : { reason }),
    }
    this.recordChange(agent, 'goal.revised', { version: 1, goal })
    return goal
  }

  /**
   * Resolve and revise a goal by natural-language description rather than exposing Goal ids.
   * @param agent - exact live character access.
   * @param request - goal operation, semantic description, priority, and optional reason.
   * @returns the committed goal snapshot.
   */
  changeGoal(agent: CharacterAccess, request: ChangeGoalRequest): ActorGoalSnapshot {
    if (request.operation === 'adopt') {
      return this.setGoal(agent, { description: request.goal, ...(request.priority === undefined ? {} : { priority: request.priority }) })
    }
    this.requireCapability(agent, 'goals')
    const active = [...agent.state().goals.values()].filter(goal => goal.status === 'active')
    const current = bestSemanticMatch(request.goal, active, goal => goal.description)
    if (current === undefined) {
      if (request.operation === 'pursue' || request.operation === 'reprioritize') {
        return this.setGoal(agent, { description: request.goal,
          ...(request.priority === undefined ? {} : { priority: request.priority }) })
      }
      throw new ActorError(`no active goal semantically matches "${request.goal}"`, 'ACTOR_STATE_CONFLICT')
    }
    const priority = request.priority ?? current.priority
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      throw new ActorError('priority must be an integer from 1 through 5', 'ACTOR_INVALID_INPUT')
    }
    const status = request.operation === 'complete'
      ? 'completed' as const
      : request.operation === 'abandon'
        ? 'abandoned' as const
        : 'active' as const
    const goal: ActorGoalSnapshot = {
      ...current,
      revision: current.revision + 1,
      priority,
      status,
      ...(request.reason === undefined ? {} : { reason: this.text('reason', request.reason) }),
    }
    this.recordChange(agent, 'goal.revised', { version: 1, goal })
    return goal
  }

  /**
   * Persist one future intention. The foundation package does not execute it.
   * @param agent - exact live character access.
   * @param request - intended behavior and world-time trigger.
   * @returns the committed scheduled intention.
   */
  schedule(agent: CharacterAccess, request: ScheduleIntentionRequest): ActorIntentionRecord {
    this.requireCapability(agent, 'schedule')
    return this.writeIntention(agent, request)
  }

  writeIntention(agent: CharacterAccess, request: ScheduleIntentionRequest): ActorIntentionRecord {
    const membership = this.membership(agent)
    const state = agent.state()
    if (state.intentions.size >= this.config.maxScheduledIntentions) {
      throw new ActorError(
        `Actor scheduled-intention limit ${this.config.maxScheduledIntentions} is reached`,
        'ACTOR_LIMIT_REACHED',
      )
    }
    const commitment = request.commitment ?? 3
    if (!Number.isInteger(commitment) || commitment < 1 || commitment > 5) {
      throw new ActorError('commitment must be an integer from 1 through 5', 'ACTOR_INVALID_INPUT')
    }
    const trigger = request.trigger.kind === 'soon'
      ? { kind: 'soon' as const }
      : request.trigger.kind === 'world-time'
        ? { kind: 'world-time' as const, at: this.text('trigger.at', request.trigger.at) }
        : request.trigger.kind === 'event'
          ? { kind: 'event' as const, when: this.text('trigger.when', request.trigger.when) }
          : { kind: 'condition' as const, condition: this.text('trigger.condition', request.trigger.condition) }
    const intention: ActorIntentionRecord = {
      id: ActorIntentionId(this.newId('intention')),
      actorId: membership.id,
      description: this.text('description', request.description),
      trigger,
      commitment,
      status: 'scheduled',
    }
    this.recordChange(agent, 'intention.recorded', { version: 1, intention })
    return intention
  }

  /**
   * Record Actor-authored speech intent. Delivery and perception are environment responsibilities.
   * @param agent - exact live character access.
   * @param request - exact words, intended audience, and delivery mode.
   * @returns the committed Actor-origin expression.
   */
  speak(agent: CharacterAccess, request: SpeakRequest): ActorExpressionRecord {
    const membership = this.requireCapability(agent, 'speak')
    const expression: Extract<ActorExpressionRecord, { origin: 'actor' }> = {
      id: ActorExpressionId(this.newId('expression')),
      actorId: membership.id,
      origin: 'actor',
      text: this.text('text', request.text),
      audience: this.stringList('audience', request.audience ?? [], this.config.maxSourceRefs),
      delivery: request.delivery ?? 'spoken',
      ...(request.tone === undefined ? {} : { tone: this.text('tone', request.tone) }),
      ...(request.intent === undefined ? {} : { intent: request.intent }),
    }
    this.recordChange(agent, 'speech.expressed', { version: 1, expression })
    return expression
  }

  /**
   * Record Actor-authored action intent. Resolution is environment-owned and deferred.
   * @param agent - exact live character access.
   * @param request - attempted behavior and optional target.
   * @returns the committed Actor-origin action intent.
   */
  act(agent: CharacterAccess, request: ActRequest): ActorActionRecord {
    const membership = this.requireCapability(agent, 'act')
    const target = request.target === undefined ? undefined : this.text('target', request.target)
    const action: Extract<ActorActionRecord, { origin: 'actor' }> = {
      id: ActorActionId(this.newId('action')),
      actorId: membership.id,
      origin: 'actor',
      description: this.text('description', request.description),
      ...(target === undefined ? {} : { target }),
      ...(request.purpose === undefined ? {} : { purpose: this.text('purpose', request.purpose) }),
      ...(request.manner === undefined ? {} : { manner: this.text('manner', request.manner) }),
    }
    this.recordChange(agent, 'action.attempted', { version: 1, action })
    return action
  }

  /**
   * Append a once-per-turn Actor completion marker.
   * @param agent - exact live character access.
   * @param reason - explicit or fallback reason the Actor stopped.
   * @param expectedTurn - optional generic turn identity used as a race guard.
   * @param details - optional visible posture and next impulse.
   * @returns true when a marker was appended, false when that turn was already closed.
   */
  closeCurrentTurn(
    agent: CharacterAccess,
    reason: ActorTurnCloseReason,
    expectedTurn?: number,
    details: {
      readonly posture?: ActorTurnPosture
      readonly nextImpulse?: string
      readonly discussion?: ActorDiscussionIntent
      readonly continuity?: readonly ActorContinuityRequest[]
    } = {},
  ): boolean {
    const membership = this.membership(agent)
    const state = agent.state()
    const turn = state.currentTurn
    if (turn === undefined) throw new ActorError('Actor has no open turn', 'ACTOR_TURN_NOT_OPEN')
    if (expectedTurn !== undefined && expectedTurn !== turn) {
      throw new ActorError(`expected Actor turn ${expectedTurn}, found ${turn}`, 'ACTOR_STATE_CONFLICT')
    }
    if (state.closedTurns.has(turn)) return false
    this.recordChange(agent, 'character.turn-closed', {
      version: 1,
      actorId: membership.id,
      turn,
      reason,
      ...(details.continuity === undefined ? {} : {
        continuity: details.continuity.map(item => actorContinuityRequestSchema.parse(item)),
      }),
      ...(details.posture === undefined ? {} : { posture: details.posture }),
      ...(details.nextImpulse === undefined ? {} : { nextImpulse: this.text('nextImpulse', details.nextImpulse) }),
      ...(details.discussion === undefined ? {} : { discussion: {
        ...(details.discussion.stance === undefined ? {} : { stance: this.text('discussion stance', details.discussion.stance) }),
        eagerness: details.discussion.eagerness,
        action: details.discussion.action,
        ...(details.discussion.nextSpeakerId === undefined ? {} : { nextSpeakerId: this.text('next speaker id',
          details.discussion.nextSpeakerId) }),
      } }),
    })
    return true
  }

  /**
   * Test whether the current character turn already has an Actor closure marker.
   * @param agent - exact live character access.
   * @returns whether its current open turn is Actor-closed.
   */
  isCurrentTurnClosed(agent: CharacterAccess): boolean {
    this.membership(agent)
    const state = agent.state()
    return state.currentTurn !== undefined && state.closedTurns.has(state.currentTurn)
  }

  /**
   * Test whether one identified turn already has an Actor closure marker.
   * @param agent - exact live character access.
   * @param turn - character turn identity.
   * @returns whether that turn carries an Actor closure.
   */
  isTurnClosed(agent: CharacterAccess, turn: number): boolean {
    this.membership(agent)
    return agent.state().closedTurns.has(turn)
  }

  /**
   * Let the trusted player speak as any bound Actor while preserving player provenance.
   * @param agent - exact live target character access.
   * @param request - exact words, audience, and delivery mode.
   * @returns matching player intervention and player-origin expression.
   */
  playerSpeakAs(agent: CharacterAccess, request: SpeakRequest): PlayerSpeechResult {
    const membership = this.membership(agent)
    const audience = this.stringList('audience', request.audience ?? [], this.config.maxSourceRefs)
    const delivery = request.delivery ?? 'spoken'
    const content = this.text('text', request.text)
    const intervention: Extract<PlayerInterventionRecord, { kind: 'embody-speech' }> = {
      id: PlayerInterventionId(this.newId('player')),
      kind: 'embody-speech',
      targetActorId: membership.id,
      content,
      audience,
      delivery,
    }
    const expression: Extract<ActorExpressionRecord, { origin: 'player' }> = {
      id: ActorExpressionId(this.newId('expression')),
      actorId: membership.id,
      origin: 'player',
      playerInterventionId: intervention.id,
      text: content,
      audience,
      delivery,
    }
    this.recordChange(agent, 'player.intervened', { version: 1, intervention })
    this.recordChange(agent, 'speech.expressed', { version: 1, expression })
    return { intervention, expression }
  }

  /**
   * Let the trusted player act as any bound Actor while preserving player provenance.
   * @param agent - exact live target character access.
   * @param request - embodied action and optional target.
   * @returns matching player intervention and player-origin action.
   */
  playerActAs(agent: CharacterAccess, request: ActRequest): PlayerActionResult {
    const membership = this.membership(agent)
    const content = this.text('description', request.description)
    const target = request.target === undefined ? undefined : this.text('target', request.target)
    const intervention: Extract<PlayerInterventionRecord, { kind: 'embody-action' }> = {
      id: PlayerInterventionId(this.newId('player')),
      kind: 'embody-action',
      targetActorId: membership.id,
      content,
      ...(target === undefined ? {} : { target }),
    }
    const action: Extract<ActorActionRecord, { origin: 'player' }> = {
      id: ActorActionId(this.newId('action')),
      actorId: membership.id,
      origin: 'player',
      playerInterventionId: intervention.id,
      description: content,
      ...(target === undefined ? {} : { target }),
    }
    this.recordChange(agent, 'player.intervened', { version: 1, intervention })
    this.recordChange(agent, 'action.attempted', { version: 1, action })
    return { intervention, action }
  }

  /** Require one capability on an authorized character. */
  requireCapability(agent: CharacterAccess, capability: ActorCapability): CharacterMembership {
    const membership = this.membership(agent)
    if (!membership.descriptor.capabilities.includes(capability)) {
      throw new ActorError(
        `Actor "${membership.id}" does not have the ${capability} capability`,
        'ACTOR_CAPABILITY_REQUIRED',
      )
    }
    return membership
  }

  /** Validate and snapshot an immutable descriptor. */
  normalizeDescriptor(descriptor: ActorDescriptor): ActorDescriptor {
    const id = this.text('actor.id', descriptor.id) as ActorDescriptor['id']
    const capabilities = [...descriptor.capabilities]
    if (capabilities.some(capability => !ACTOR_CAPABILITIES.has(capability))) {
      throw new ActorError('descriptor contains an unknown Actor capability', 'ACTOR_INVALID_INPUT')
    }
    if (new Set(capabilities).size !== capabilities.length) {
      throw new ActorError('descriptor capabilities must be unique', 'ACTOR_INVALID_INPUT')
    }
    return {
      id,
      displayName: this.text('displayName', descriptor.displayName),
      persona: this.text('persona', descriptor.persona),
      capabilities,
    }
  }

  /** Validate one complete UTF-8-bounded nonblank text value. */
  text(name: string, value: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new ActorError(`${name} must be a non-empty string`, 'ACTOR_INVALID_INPUT')
    }
    const bytes = this.encoder.encode(value).byteLength
    if (bytes > this.config.maxTextBytes) {
      throw new ActorError(`${name} exceeds ${this.config.maxTextBytes} UTF-8 bytes`, 'ACTOR_INVALID_INPUT')
    }
    return value
  }

  /** Validate, de-duplicate-check, and detach one bounded string list. */
  stringList(name: string, values: readonly string[], limit: number): string[] {
    const candidate: unknown = values
    if (!Array.isArray(candidate) || candidate.length > limit) {
      throw new ActorError(`${name} may contain at most ${limit} values`, 'ACTOR_INVALID_INPUT')
    }
    const result = candidate.map((value: unknown, index: number) => {
      if (typeof value !== 'string') {
        throw new ActorError(`${name}[${index}] must be a string`, 'ACTOR_INVALID_INPUT')
      }
      return this.text(`${name}[${index}]`, value)
    })
    if (new Set(result).size !== result.length) {
      throw new ActorError(`${name} values must be unique`, 'ACTOR_INVALID_INPUT')
    }
    return result
  }

  /** Validate and detach one bounded turning-point consequence list. */
  turningPointChanges(values: readonly ActorTurningPointChange[]): ActorTurningPointChange[] {
    const candidate: unknown = values
    if (!Array.isArray(candidate) || candidate.length < 1 || candidate.length > 16) {
      throw new ActorError('turning-point changes must contain from 1 through 16 values', 'ACTOR_INVALID_INPUT')
    }
    return candidate.map((value: unknown, index: number) => {
      if (typeof value !== 'object' || value === null) {
        throw new ActorError(`changes[${index}] must be an object`, 'ACTOR_INVALID_INPUT')
      }
      const change = value as Partial<ActorTurningPointChange>
      if (!['belief', 'goal', 'relationship', 'conflict', 'identity', 'memory'].includes(change.dimension ?? '')) {
        throw new ActorError(`changes[${index}].dimension is invalid`, 'ACTOR_INVALID_INPUT')
      }
      return {
        dimension: change.dimension as ActorTurningPointChange['dimension'],
        subject: this.text(`changes[${index}].subject`, change.subject ?? ''),
        ...(change.before === undefined ? {} : { before: this.text(`changes[${index}].before`, change.before) }),
        after: this.text(`changes[${index}].after`, change.after ?? ''),
      }
    })
  }

  /** Generate an opaque, non-semantic domain identity. */
  newId(prefix: string): string {
    return `${prefix}-${this.values.id()}`
  }

  /**
   * Read a persisted Actor without creating or running a model Agent.
   * @param state - current  private character projection.
   * @returns the same complete player projection as a live Actor.
   */
  playerInspect(state: ActorFoldState): ActorPrivateView {
    return inspectCharacter(state)
  }

  /**
   * Render the same model projection from a durable log from character state.
   * @param state - current  private character projection.
   * @returns complete active self-state without automatic entry-count selection.
   */
  modelContext(state: ActorFoldState): ActorModelContext {
    if (state.descriptor === undefined) throw new Error('Character state is missing its descriptor')
    const journeyQuery = [
      ...[...state.goals.values()].filter(goal => goal.status === 'active').map(goal => goal.description),
      ...[...state.relationships.values()].flatMap(relationship => [relationship.target, relationship.reason]),
      ...[...state.memories.values()].filter(memory => memory.status === 'active')
        .flatMap(memory => [memory.record.content, memory.record.meaning ?? '']),
      ...state.expressions.map(expression => expression.text),
      ...state.actions.map(action => action.description),
    ].join(' ')
    const queryUnits = semanticUnits(journeyQuery)
    const journey = [...state.turningPoints.values()]
      .filter(turningPoint => turningPoint.status !== 'rejected')
      .map((turningPoint, index) => {
        const candidate = semanticUnits([
          turningPoint.trigger,
          turningPoint.interpretation,
          ...turningPoint.changes.flatMap(change => [change.subject, change.before ?? '', change.after]),
        ].join(' '))
        let overlap = 0
        for (const unit of candidate) if (queryUnits.has(unit)) overlap += 1
        const statusWeight = turningPoint.status === 'integrated' ? 4 : turningPoint.status === 'tentative' ? 2 : -2
        return { turningPoint, index, score: turningPoint.significance * 10 + statusWeight + overlap }
      })
      .sort((left, right) => right.score - left.score || right.index - left.index)
      .map(item => item.turningPoint)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    return {
      descriptor: state.descriptor,
      knowledge: structuredClone(state.knowledge),
      dynamicState: structuredClone(state.dynamicState),
      memories: [...state.memories.values()].filter(memory => memory.status === 'active').map(memory => memory.record),
      journey,
      emotions: [...state.emotions],
      beliefs: [...state.beliefs.values()],
      relationships: [...state.relationships.values()],
      goals: [...state.goals.values()].filter(goal => goal.status === 'active'),
      intentions: [...state.intentions.values()],
      recentExpressions: [...state.expressions],
      recentActions: [...state.actions],
    }
  }
}
