/** Event-sourced autonomous Actor kernel and trusted PlayerAuthority host API. */

import { randomUUID, createHash } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent, SessionEventMap } from '@deepseek-ai/dsh-session'
import { applyKnowledgeChanges, emptyKnowledge, knowledgeChangeSchema, type KnowledgeChange, type KnowledgeState,
  type KnowledgeAuthority } from '@deepseek-ai/dsh-roleplay-core/knowledge'
import { applyStateChanges, stateChangeSchema, resolveStateReferences } from '@deepseek-ai/dsh-roleplay-core/dynamic-state'
import type { StateChange, StateInitialValue, DynamicState } from '@deepseek-ai/dsh-roleplay-core/dynamic-state'
import { ActorError } from './error.ts'
import { applyNpcTurn, type NpcTurnInput } from '@deepseek-ai/dsh-roleplay-core/npc-turn'
import { CharacterCommands, type CharacterAccess } from '@deepseek-ai/dsh-roleplay-core/actor-commands'
import { characterChangeToEvent } from './fold.ts'
import type { ActorEventType } from './fold.ts'
import { foldActor } from './fold.ts'
export { actorOperationEvents } from './fold.ts'
import { PlayerInterventionId } from './types.ts'
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
} from './types.ts'

export type * from './types.ts'
export { actorContinuityRequestSchema } from './continuity.ts'
export {
  ActorActionId,
  ActorBeliefId,
  ActorEmotionId,
  ActorExpressionId,
  ActorGoalId,
  ActorId,
  ActorIntentionId,
  ActorMemoryId,
  ActorMemoryReleaseId,
  ActorRelationshipId,
  ActorThoughtId,
  ActorTurningPointId,
  PlayerInterventionId,
} from './types.ts'
export { ActorError } from './error.ts'
export { applyActorEvent, emptyActorFoldState, foldActor, isActorEvent } from './fold.ts'
export type { ActorFoldState, ActorMemoryFold } from './fold.ts'

function stateFieldReference(id: string): string { return `field-${createHash('sha256').update(id).digest('hex').slice(0, 32)}` }

/** Exact live Agent binding used as the Actor service's authority credential. */
export interface ActorMembership {
  readonly id: ActorDescriptor['id']
  readonly agent: Agent
  readonly descriptor: ActorDescriptor
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Observer-filtered narrative inputs supplied by the Harness composition. */
    actorNarrative: import('./types.ts').ActorNarrativeReader
    actors: ActorService
  }

  interface Events {
    /**
     * An exact live Agent became an Actor after its descriptor was committed.
     * @param payload - exact Agent and immutable live membership.
     * @mode emit
     */
    'actor/bound'(payload: { agent: Agent; membership: ActorMembership }): void
    /**
     * An exact Actor Agent left the live registry.
     * @param payload - exact Agent and stable Actor identity that left.
     * @mode emit
     */
    'actor/unbound'(payload: { agent: Agent; actorId: ActorDescriptor['id'] }): void
  }
}

const DEFAULT_MAX_CORE_MEMORIES = 64
const DEFAULT_MAX_RECALL_RESULTS = 8
const DEFAULT_MAX_TEXT_BYTES = 16_384
const DEFAULT_MAX_SOURCE_REFS = 16
const DEFAULT_MAX_ACTIVE_GOALS = 16
const DEFAULT_MAX_SCHEDULED_INTENTIONS = 32

/** Validate one positive safe-integer deployment limit. */
function positiveLimit(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ActorError(`${name} must be a positive safe integer`, 'ACTOR_INVALID_CONFIG')
  }
  return value
}

/** Compare immutable descriptors without depending on object identity. */
function sameDescriptor(left: ActorDescriptor, right: ActorDescriptor): boolean {
  return left.id === right.id
    && left.displayName === right.displayName
    && left.persona === right.persona
    && left.capabilities.length === right.capabilities.length
    && left.capabilities.every((capability, index) => capability === right.capabilities[index])
}

/** Autonomous Actor service backed by each Actor's own exact Session log. */
export class ActorService extends Service {
  static inject = ['agents']

  static Config: z<Config> = z.object({
    maxCoreMemories: z.number().step(1).min(1).default(DEFAULT_MAX_CORE_MEMORIES),
    maxRecallResults: z.number().step(1).min(1).default(DEFAULT_MAX_RECALL_RESULTS),
    maxTextBytes: z.number().step(1).min(1).default(DEFAULT_MAX_TEXT_BYTES),
    maxSourceRefs: z.number().step(1).min(1).default(DEFAULT_MAX_SOURCE_REFS),
    maxActiveGoals: z.number().step(1).min(1).default(DEFAULT_MAX_ACTIVE_GOALS),
    maxScheduledIntentions: z.number().step(1).min(1).default(DEFAULT_MAX_SCHEDULED_INTENTIONS),
  })

  private readonly config: Required<Config>
  private readonly memberships = new Map<Agent, ActorMembership>()
  private readonly agentsByActorId = new Map<ActorDescriptor['id'], Set<Agent>>()
  private readonly kernel: CharacterCommands
  private readonly staged = new Map<Agent, { events: SessionEvent[] }>()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'actors')
    this.config = {
      maxCoreMemories: positiveLimit('maxCoreMemories', config.maxCoreMemories ?? DEFAULT_MAX_CORE_MEMORIES),
      maxRecallResults: positiveLimit('maxRecallResults', config.maxRecallResults ?? DEFAULT_MAX_RECALL_RESULTS),
      maxTextBytes: positiveLimit('maxTextBytes', config.maxTextBytes ?? DEFAULT_MAX_TEXT_BYTES),
      maxSourceRefs: positiveLimit('maxSourceRefs', config.maxSourceRefs ?? DEFAULT_MAX_SOURCE_REFS),
      maxActiveGoals: positiveLimit('maxActiveGoals', config.maxActiveGoals ?? DEFAULT_MAX_ACTIVE_GOALS),
      maxScheduledIntentions: positiveLimit(
        'maxScheduledIntentions',
        config.maxScheduledIntentions ?? DEFAULT_MAX_SCHEDULED_INTENTIONS,
      ),
    }

    this.kernel = new CharacterCommands(this.config, { id: randomUUID, now: () => new Date().toISOString() })
    for (const agent of ctx.agents.list()) this.adopt(agent)
    ctx.on('agent/created', ({ agent }) => { this.adopt(agent) })
    ctx.on('agent/disposed', ({ agent }) => { this.release(agent) })
  }

  /**
   * Bind a fresh, history-isolated Agent to one stable fictional identity.
   * @param agent - exact live Agent that will own this Actor's Session log.
   * @param descriptor - stable identity and initial author configuration; existing bindings must match.
   * @returns the exact live Actor membership.
   */
  bind(agent: Agent, descriptor: ActorDescriptor): ActorMembership {
    this.assertLive(agent)
    const normalized = this.normalizeDescriptor(descriptor)
    const current = this.memberships.get(agent)
    if (current !== undefined) {
      if (sameDescriptor(current.descriptor, normalized)) return current
      throw new ActorError(`agent "${agent.id}" is already bound to Actor "${current.id}"`, 'ACTOR_ALREADY_BOUND')
    }
    if ((agent.session.header.seedLength ?? 0) > 0) {
      throw new ActorError('an Actor Session must start fresh; inherited fork history is forbidden', 'ACTOR_INVALID_SESSION')
    }

    const folded = foldActor(this.actorEvents(agent))
    if (folded.descriptor !== undefined) {
      if (!sameDescriptor(folded.descriptor, normalized)) {
        throw new ActorError(`Session "${agent.id}" already contains another Actor descriptor`, 'ACTOR_ALREADY_BOUND')
      }
      return this.publishMembership(agent, folded.descriptor)
    }
    if (agent.session.events.some(event =>
      event.type === 'turn/start'
      || event.type === 'user/message'
      || event.type === 'assistant/message'
      || event.type === 'tool/call'
      || event.type === 'tool/result')) {
      throw new ActorError('an Actor must be bound before its first conversation turn', 'ACTOR_INVALID_SESSION')
    }

    this.appendActorEvent(agent, 'actor/descriptor', { version: 1, actor: normalized })
    return this.publishMembership(agent, normalized)
  }

  /**
   * Resolve one exact live Agent's Actor identity.
   * @param agent - exact live Agent used as the authority credential.
   * @returns the Actor membership.
   */
  membership(agent: Agent): ActorMembership {
    this.assertLive(agent)
    const membership = this.memberships.get(agent)
    if (membership === undefined) throw new ActorError(`agent "${agent.id}" is not an Actor`, 'ACTOR_NOT_BOUND')
    return membership
  }

  /**
   * Apply an exact-revision author configuration without replacing fictional identity or state.
   * @param agent - Exact live Actor whose author configuration changes.
   * @param expectedRevision - Current configuration revision from its folded Session log.
   * @param descriptor - New name, persona, and host-granted capabilities with the same stable ID.
   * @returns current configuration revision; an identical configuration does not append an event.
   */
  configure(agent: Agent, expectedRevision: number, descriptor: ActorDescriptor): number {
    const membership = this.membership(agent)
    if (this.staged.has(agent)) throw new Error('Author configuration cannot change inside an Actor transaction')
    const state = foldActor(this.actorEvents(agent))
    if (state.configurationRevision !== expectedRevision) throw new Error('Stale Actor configuration revision')
    const normalized = this.normalizeDescriptor(descriptor)
    if (normalized.id !== membership.id) throw new Error('Author configuration cannot replace Actor identity')
    if (state.descriptor !== undefined && sameDescriptor(state.descriptor, normalized)) return expectedRevision
    this.appendActorEvent(agent, 'actor/configuration', { version: 1, expectedRevision, actor: normalized })
    this.memberships.set(agent, { ...membership, descriptor: normalized })
    return expectedRevision + 1
  }

  /**
   * Resolve an Actor without throwing; stale object identities never match.
   * @param agent - candidate exact live Agent.
   * @returns its membership, or undefined when it is not a live Actor.
   */
  tryMembership(agent: Agent): ActorMembership | undefined {
    if (this.ctx.agents.get(agent.id) !== agent) return undefined
    return this.memberships.get(agent)
  }

  /**
   * Resolve one unambiguous live Actor by stable fictional identity.
   * Separate Story runs may legitimately keep distinct live Sessions for the
   * same storybook Actor id, in which case callers must resolve through Story
   * ownership and this convenience lookup returns undefined.
   * @param actorId - stable fictional identity.
   * @returns its live membership, or undefined while that Actor is offline.
   */
  find(actorId: ActorDescriptor['id']): ActorMembership | undefined {
    const agents = this.agentsByActorId.get(actorId)
    if (agents === undefined || agents.size !== 1) return undefined
    const agent = agents.values().next().value
    return agent === undefined ? undefined : this.tryMembership(agent)
  }

  /**
   * Persist one fictional inner reflection chosen by the Actor.
   * @param agent - exact live Actor Agent.
   * @param request - complete fictional inner content.
   * @returns the committed thought record.
   */
  reflect(agent: Agent, request: ReflectRequest): ActorThoughtRecord {
    return this.kernel.reflect(this.access(agent), request)
  }

  /**
   * Persist one private emotional occurrence chosen by this Actor.
   * @param agent - exact live Actor Agent.
   * @param request - emotion, intensity, subjects, and optional cause or impulse.
   * @returns the committed emotional occurrence.
   */
  feel(agent: Agent, request: FeelRequest): ActorEmotionRecord {
    return this.kernel.feel(this.access(agent), request)
  }

  /**
   * Add or revise one subjective belief without asserting a world fact.
   * @param agent - exact live Actor Agent.
   * @param request - proposition, stance, confidence, and optional subjects.
   * @returns the committed belief revision.
   */
  believe(agent: Agent, request: BelieveRequest): ActorBeliefSnapshot {
    return this.kernel.believe(this.access(agent), request)
  }

  /**
   * Adjust one private relationship dimension toward a named subject.
   * @param agent - exact live Actor Agent.
   * @param request - target, dimension, bounded shift, and reason.
   * @returns the committed relationship revision.
   */
  relate(agent: Agent, request: RelateRequest): ActorRelationshipSnapshot {
    return this.kernel.relate(this.access(agent), request)
  }

  /**
   * Create one explicit active core memory, archiving the least important
   * oldest active memory first when the configured capacity is full.
   * @param agent - exact live Actor Agent.
   * @param request - content, importance, tags, and optional source references.
   * @returns the committed active memory.
   */
  remember(agent: Agent, request: RememberRequest): ActorMemoryRecord {
    return this.kernel.remember(this.access(agent), request)
  }

  private writeMemory(agent: Agent, request: RememberRequest): ActorMemoryRecord {
    return this.kernel.writeMemory(this.access(agent), request)
  }

  /**
   * Search active memories only; forgotten source records remain outside this view.
   * @param agent - exact live Actor Agent.
   * @param request - optional text/tag query and bounded result count.
   * @returns newest matching active memories first.
   */
  recall(agent: Agent, request: RecallRequest = {}): ActorMemoryRecord[] {
    return this.kernel.recall(this.access(agent), request)
  }

  /**
   * Tombstone one active memory while preserving its raw event for PlayerAuthority audit.
   * @param agent - exact live Actor Agent.
   * @param request - active memory identity and optional fictional reason.
   * @returns the newly forgotten memory view.
   */
  forget(agent: Agent, request: ForgetRequest): ActorMemoryView {
    return this.kernel.forget(this.access(agent), request)
  }

  /**
   * Resolve a model-authored semantic description to at most one active memory and release it.
   * @param agent - exact live Actor Agent.
   * @param request - semantic subject, release mode, and optional reason.
   * @returns the committed release record and its resolved memory identities.
   */
  releaseMemory(agent: Agent, request: ReleaseMemoryRequest): ActorMemoryReleaseRecord {
    return this.kernel.releaseMemory(this.access(agent), request)
  }

  /**
   * Persist one meaningful Actor-owned interpretation of material state changes.
   * @param agent - exact live Actor Agent.
   * @param request - trigger, interpretation, consequences, and durable source references.
   * @returns the committed revision-one turning point.
   */
  recordTurningPoint(agent: Agent, request: RecordTurningPointRequest): ActorTurningPointSnapshot {
    return this.kernel.recordTurningPoint(this.access(agent), request)
  }

  /**
   * Replace one visible turning point over its exact current revision.
   * @param agent - exact live target Actor Agent.
   * @param request - complete player-authored replacement and expected revision.
   * @returns the committed next turning-point revision.
   */
  updateTurningPoint(agent: Agent, request: UpdateTurningPointRequest): ActorTurningPointSnapshot {
    return this.kernel.updateTurningPoint(this.access(agent), request)
  }

  /**
   * Create one active Actor-owned goal.
   * @param agent - exact live Actor Agent.
   * @param request - goal description and optional priority.
   * @returns the revision-one active goal.
   */
  setGoal(agent: Agent, request: SetGoalRequest): ActorGoalSnapshot {
    return this.kernel.setGoal(this.access(agent), request)
  }

  private writeGoal(agent: Agent, request: SetGoalRequest): ActorGoalSnapshot {
    return this.kernel.writeGoal(this.access(agent), request)
  }

  /**
   * Abandon one active goal without rewriting its original motivation.
   * @param agent - exact live Actor Agent.
   * @param request - active goal identity and optional reason.
   * @returns the committed abandoned goal revision.
   */
  abandonGoal(agent: Agent, request: AbandonGoalRequest): ActorGoalSnapshot {
    return this.kernel.abandonGoal(this.access(agent), request)
  }

  /**
   * Resolve and revise a goal by natural-language description rather than exposing Goal ids.
   * @param agent - exact live Actor Agent.
   * @param request - goal operation, semantic description, priority, and optional reason.
   * @returns the committed goal snapshot.
   */
  changeGoal(agent: Agent, request: ChangeGoalRequest): ActorGoalSnapshot {
    return this.kernel.changeGoal(this.access(agent), request)
  }

  /**
   * Persist one future intention. The foundation package does not execute it.
   * @param agent - exact live Actor Agent.
   * @param request - intended behavior and world-time trigger.
   * @returns the committed scheduled intention.
   */
  schedule(agent: Agent, request: ScheduleIntentionRequest): ActorIntentionRecord {
    return this.kernel.schedule(this.access(agent), request)
  }

  private writeIntention(agent: Agent,
    request: ScheduleIntentionRequest): ActorIntentionRecord {
    return this.kernel.writeIntention(this.access(agent), request)
  }

  /**
   * Record Actor-authored speech intent. Delivery and perception are environment responsibilities.
   * @param agent - exact live Actor Agent.
   * @param request - exact words, intended audience, and delivery mode.
   * @returns the committed Actor-origin expression.
   */
  speak(agent: Agent, request: SpeakRequest): ActorExpressionRecord {
    return this.kernel.speak(this.access(agent), request)
  }

  /**
   * Record Actor-authored action intent. Resolution is environment-owned and deferred.
   * @param agent - exact live Actor Agent.
   * @param request - attempted behavior and optional target.
   * @returns the committed Actor-origin action intent.
   */
  act(agent: Agent, request: ActRequest): ActorActionRecord {
    return this.kernel.act(this.access(agent), request)
  }

  /**
   * Append a once-per-turn Actor completion marker.
   * @param agent - exact live Actor Agent.
   * @param reason - explicit or fallback reason the Actor stopped.
   * @param expectedTurn - optional generic turn identity used as a race guard.
   * @param details - optional visible posture and next impulse.
   * @returns true when a marker was appended, false when that turn was already closed.
   */
  closeCurrentTurn(
    agent: Agent,
    reason: ActorTurnCloseReason,
    expectedTurn?: number,
    details: {
      readonly posture?: ActorTurnPosture
      readonly nextImpulse?: string
      readonly discussion?: ActorDiscussionIntent
      readonly continuity?: readonly ActorContinuityRequest[]
    } = {},
  ): boolean {
    return this.kernel.closeCurrentTurn(this.access(agent), reason, expectedTurn, details)
  }

  /**
   * Test whether the current generic Agent turn already has an Actor closure marker.
   * @param agent - exact live Actor Agent.
   * @returns whether its current open turn is Actor-closed.
   */
  isCurrentTurnClosed(agent: Agent): boolean {
    return this.kernel.isCurrentTurnClosed(this.access(agent))
  }

  /**
   * Test whether one identified turn already has an Actor closure marker.
   * @param agent - exact live Actor Agent.
   * @param turn - generic Agent turn identity.
   * @returns whether that turn carries an Actor closure.
   */
  isTurnClosed(agent: Agent, turn: number): boolean {
    return this.kernel.isTurnClosed(this.access(agent), turn)
  }

  /**
   * Let the trusted player select a story direction without impersonating an Actor.
   * @param controlSession - Session that owns story-level control history.
   * @param direction - player-authored desired direction.
   * @returns the committed player intervention.
   */
  playerChooseDirection(controlSession: Session, direction: string): PlayerInterventionRecord {
    return this.appendControlIntervention(controlSession, 'story-direction', direction)
  }

  /**
   * Let the trusted player change world state without impersonating an Actor.
   * @param controlSession - Session that owns world-level control history.
   * @param description - player-authored world intervention.
   * @returns the committed player intervention.
   */
  playerInterveneWorld(controlSession: Session, description: string): PlayerInterventionRecord {
    return this.appendControlIntervention(controlSession, 'world-intervention', description)
  }

  /**
   * Let the trusted player speak as any bound Actor while preserving player provenance.
   * @param agent - exact live target Actor Agent.
   * @param request - exact words, audience, and delivery mode.
   * @returns matching player intervention and player-origin expression.
   */
  playerSpeakAs(agent: Agent, request: SpeakRequest): PlayerSpeechResult {
    return this.kernel.playerSpeakAs(this.access(agent), request)
  }

  /**
   * Let the trusted player act as any bound Actor while preserving player provenance.
   * @param agent - exact live target Actor Agent.
   * @param request - embodied action and optional target.
   * @returns matching player intervention and player-origin action.
   */
  playerActAs(agent: Agent, request: ActRequest): PlayerActionResult {
    return this.kernel.playerActAs(this.access(agent), request)
  }

  /**
   * Read god-view private state, including thoughts and forgotten-memory tombstones.
   * @param agent - exact live target Actor Agent.
   * @returns complete detached private projection.
   */
  playerInspect(agent: Agent): ActorPrivateView {
    this.membership(agent)
    return this.playerInspectEvents(this.actorEvents(agent))
  }

  /**
   * Read a persisted Actor without creating or running a model Agent.
   * @param events - exact private Session log including rewind markers.
   * @returns the same complete player projection as a live Actor.
   */
  playerInspectEvents(events: readonly SessionEvent[]): ActorPrivateView {
    return this.kernel.playerInspect(foldActor(events))
  }

  /**
   * Read bounded current self-state for the model-facing Actor policy.
   * @param agent - exact live Actor Agent.
   * @returns active self-state without thoughts or forgotten memories.
   */
  modelContext(agent: Agent): ActorModelContext {
    this.membership(agent)
    return this.modelContextEvents(this.actorEvents(agent))
  }

  /**
   * Render the same model projection from a durable log without mounting an Agent.
   * @param events - Private Actor log, including active-branch rewind markers.
   * @returns active self-state with the configured relevance and recent-action bounds.
   */
  modelContextEvents(events: readonly SessionEvent[]): ActorModelContext {
    return this.kernel.modelContext(foldActor(events))
  }

  /**
   * Stage all NPC writes before publishing any event. Validation failures publish nothing.
   * @param agent - exact live Actor.
   * @param operation - synchronous complete turn write operation.
   */
  transaction(agent: Agent, operation: () => void): void {
    this.membership(agent)
    if (this.staged.has(agent)) throw new Error('Actor transactions cannot nest')
    const staged = { events: [] as SessionEvent[] }
    this.staged.set(agent, staged)
    try {
      operation()
      foldActor(this.actorEvents(agent))
    } finally {
      this.staged.delete(agent)
    }
    if (staged.events.length > 0) agent.session.append('actor/commit', { version: 1,
      operations: staged.events.map(event => ({ type: event.type,
        data: event.data as unknown as import('@deepseek-ai/dsh-session').JsonValue })),
    })
  }

  /**
   * Whether the active branch has instantiated its authored state, including an empty baseline.
   * @param agent - exact live Actor.
   * @returns whether an initialization event survives active-branch rewind.
   */
  isStateInitialized(agent: Agent): boolean { return foldActor(this.actorEvents(agent)).stateActorIds !== undefined }

  /**
   * Initialize this Actor's authored fields once on the active branch.
   * @param agent - exact live Actor.
   * @param initial - authored private definitions and starting values.
   * @param actorIds - complete authored cast used for relationship validation.
   * @param context - initial lifecycle records; model mutation capabilities remain unchanged.
   */
  initializeState(
    agent: Agent, initial: readonly StateInitialValue[], actorIds: readonly string[],
    context: import('./types.ts').ActorInitialContext = {},
  ): void {
    const state = foldActor(this.actorEvents(agent))
    if (state.stateActorIds !== undefined) return
    if (state.dynamicState.entries.length !== 0) throw new Error('Actor state is already initialized')
    const perspective = this.ctx.get('actorNarrative')?.read(agent.session.id, this.membership(agent).id)
    const initialize = () => {
      this.writeState(agent, initial.map(item => ({
        fieldId: item.definition.id, expectedRevision: 0, definition: { ...item.definition,
          ...(item.definition.targetActorId === undefined ? {} : { targetPersonRef: perspective?.initialRefs[item.definition.targetActorId] ?? 'unidentified' }) }, value: item.value,
        reason: item.definition.description, sourceRefs: ['storybook'],
      })), actorIds, 'author')
      for (const memory of context.memories ?? []) this.writeMemory(agent, memory)
      for (const goal of context.goals ?? []) this.writeGoal(agent, goal)
      for (const intention of context.intentions ?? []) this.writeIntention(agent, intention)
    }
    if (this.staged.has(agent)) initialize()
    else this.transaction(agent, initialize)
  }

  /**
   * Commit exact-revision state changes authored by the NPC.
   * @param agent - exact live Actor possessing reflection capability.
   * @param changes - requested private-state deltas.
   * @returns the resulting detached state.
   */
  changeState(agent: Agent, changes: readonly StateChange[]): DynamicState {
    this.requireCapability(agent, 'reflect')
    if (this.isCurrentTurnClosed(agent)) throw new Error('Actor turn is already closed')
    const state = foldActor(this.actorEvents(agent)).dynamicState
    const resolved = resolveStateReferences(changes, state, ref => this.resolvePerson(agent, ref), stateFieldReference)
    try {
      return this.writeState(agent, resolved, this.stateCast(agent), 'actor')
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error
      let message = error.message
      for (const entry of state.entries) {
        message = message.replaceAll(entry.definition.id, stateFieldReference(entry.definition.id))
      }
      throw new Error(message)
    }
  }

  /**
   * Apply a player correction or compensating revision to character-private state.
   * @param agent - exact live target Actor.
   * @param changes - revisioned player edits.
   * @returns the resulting detached state.
   */
  playerChangeState(agent: Agent, changes: readonly StateChange[]): DynamicState {
    return this.writeState(agent, changes, this.stateCast(agent), 'player')
  }

  private stateCast(agent: Agent): readonly string[] {
    const initialized = foldActor(this.actorEvents(agent)).stateActorIds
    if (initialized === undefined) throw new Error('Actor dynamic state must be initialized before writing')
    const perspective = this.ctx.get('actorNarrative')?.read(agent.session.id, this.membership(agent).id)
    return perspective?.actorIds ?? initialized
  }

  /**
   * Bind authored cognition once to this Actor's durable branch.
   * @param agent - Registered Actor session.
   */
  initializeKnowledge(agent: Agent): void {
    const current = foldActor(this.actorEvents(agent))
    if (current.knowledge.initialized) return
    const state = this.ctx.get('actorNarrative')?.read(agent.session.id, this.membership(agent).id)?.knowledge
    this.appendActorEvent(agent, 'actor/knowledge-initialized', { version: 1,
      actorId: this.membership(agent).id, state: state ?? { ...emptyKnowledge(), initialized: true } })
  }

  /**
   * Commit private judgments with evidence permissions derived from the registered owner.
   * @param agent - Exact Actor; ordinary submissions require reflection capability and an open turn.
   * @param input - Whole knowledge batch.
   * @param origin - Trusted player correction or ordinary Actor submission.
   * @returns complete private cognition after validation.
   */
  changeKnowledge(agent: Agent, input: readonly KnowledgeChange[], origin: 'actor' | 'player' = 'actor'): KnowledgeState {
    if (origin === 'actor') {
      this.requireCapability(agent, 'reflect')
      if (this.isCurrentTurnClosed(agent)) throw new Error('Actor turn is already closed')
    }
    const actorId = this.membership(agent).id
    const perspective = this.ctx.get('actorNarrative')?.read(agent.session.id, actorId)
    if (perspective === undefined) throw new Error('Knowledge requires a registered story perspective')
    const current = foldActor(this.actorEvents(agent))
    const authority: KnowledgeAuthority = { origin,
      entityRefs: [...perspective.entityRefs],
      sourceRefs: [...perspective.sourceRefs,
        ...[...current.memories].filter(([, item]) => item.status === 'active').map(([id]) => `actor/memory:${id}`),
        ...current.dynamicState.entries.filter(item => item.active).map(item => `state:${stateFieldReference(item.definition.id)}:r${item.revision}`)],
    }
    const changes = input.map(item => knowledgeChangeSchema.parse(item))
    const next = applyKnowledgeChanges(current.knowledge, changes, authority)
    this.appendActorEvent(agent, 'actor/knowledge-changed', { version: 1, actorId, changes, authority })
    return next
  }

  /**
   * Resolve a model's target before recording world-facing behavior.
   * @param agent - Authenticated speaker.
   * @param ref - Observer-local person reference.
   * @returns canonical host identity; standalone Actors retain their existing addressing contract.
   */
  resolvePerson(agent: Agent, ref: string): string {
    const actorId = this.membership(agent).id
    const perspective = this.ctx.get('actorNarrative')?.read(agent.session.id, actorId)
    if (perspective === undefined) return ref
    if (ref === 'self') return actorId
    const target = perspective.targets[ref]
    if (target === undefined) throw new Error('Person reference is unavailable in your perspective')
    return target
  }

  private writeState(agent: Agent, input: readonly StateChange[], actorIds: readonly string[],
    origin: 'actor' | 'player' | 'author'): DynamicState {
    const membership = this.membership(agent)
    const changes = input.map(change => stateChangeSchema.parse(change))
    if (changes.some(change => change.definition !== undefined
      && (change.definition.owner !== 'actor' || change.definition.actorId !== membership.id))) {
      throw new Error('Private state fields must belong to this Actor')
    }
    const next = applyStateChanges(foldActor(this.actorEvents(agent)).dynamicState, changes,
      origin === 'actor' ? { kind: origin, actorId: membership.id } : { kind: origin }, actorIds)
    this.appendActorEvent(agent, 'actor/state-changed', {
      version: 1, actorId: membership.id, actorIds: [...actorIds], origin, changes,
    })
    return structuredClone(next)
  }

  /**
   * Submit a complete NPC delta through the current execution transaction.
   * @param agent - authenticated live Actor execution.
   * @param input - intended semantic character changes.
   * @param maxContextUpdateUnits - accepted source-processing budget.
   * @returns nothing; failures discard the staged execution changes.
   */
  commitNpcTurn(agent: Agent, input: NpcTurnInput, maxContextUpdateUnits: number): void {
    this.transaction(agent, () =>{  applyNpcTurn(this.kernel, this.access(agent), input, {
      independentNarrative: false,
      maxContextUpdateUnits,
      changeKnowledge: (changes) => { this.changeKnowledge(agent, [...changes]) },
      changeState: (changes) => { this.changeState(agent, [...changes]) },
      sourceReference: (kind, id, revision) => `actor/${kind}:${id}${revision === undefined ? '' : `:r${revision}`}`,
    }) })
  }

  /** Bind a transaction-local business capability to this authenticated execution. */
  private access(agent: Agent): CharacterAccess {
    const membership = this.membership(agent)
    return { descriptor: membership.descriptor, state: () => foldActor(this.actorEvents(agent)),
      resolvePerson: ref => this.resolvePerson(agent, ref),
      append: (type, data) => {
        const change = characterChangeToEvent(type, data)
        this.appendActorEvent(agent, change.type, change.data)
      },
    }
  }

  private actorEvents(agent: Agent): readonly SessionEvent[] {
    const staged = this.staged.get(agent)
    return staged === undefined ? agent.session.events : [...agent.session.events, ...staged.events]
  }

  private appendActorEvent<T extends ActorEventType>(agent: Agent, type: T, data: SessionEventMap[T]): void {
    const staged = this.staged.get(agent)
    if (staged === undefined) { agent.session.append<ActorEventType>(type, data); return }
    const snapshot = structuredClone(data)
    // The generic type/data pair is correlated by the method signature.
    staged.events.push({ type, data: snapshot, time: Date.now(),
      seq: (agent.session.events.at(-1)?.seq ?? -1) + staged.events.length + 1 } as SessionEvent)
  }

  /** Restore a descriptor found in an already-created or resumed Agent. */
  private adopt(agent: Agent): void {
    const state = foldActor(this.actorEvents(agent))
    if (state.descriptor === undefined) return
    if ((agent.session.header.seedLength ?? 0) > 0) {
      throw new ActorError('a fork may not inherit an Actor descriptor', 'ACTOR_INVALID_SESSION')
    }
    this.publishMembership(agent, state.descriptor)
  }

  /** Publish one exact live membership and announce it after all checks pass. */
  private publishMembership(agent: Agent, descriptor: ActorDescriptor): ActorMembership {
    this.assertLive(agent)
    const existing = this.memberships.get(agent)
    if (existing !== undefined) return existing
    const membership: ActorMembership = { id: descriptor.id, agent, descriptor }
    this.memberships.set(agent, membership)
    const actors = this.agentsByActorId.get(descriptor.id) ?? new Set<Agent>()
    actors.add(agent)
    this.agentsByActorId.set(descriptor.id, actors)
    this.ctx.emit('actor/bound', { agent, membership })
    return membership
  }

  /** Remove one exact live mapping and announce the loss. */
  private release(agent: Agent): void {
    const membership = this.memberships.get(agent)
    if (membership === undefined) return
    this.memberships.delete(agent)
    const actors = this.agentsByActorId.get(membership.id)
    actors?.delete(agent)
    if (actors?.size === 0) this.agentsByActorId.delete(membership.id)
    this.ctx.emit('actor/unbound', { agent, actorId: membership.id })
  }

  /** Append an actor-independent PlayerAuthority control event. */
  private appendControlIntervention(
    session: Session,
    kind: 'story-direction' | 'world-intervention',
    content: string,
  ): PlayerInterventionRecord {
    const intervention: PlayerInterventionRecord = {
      id: PlayerInterventionId(this.newId('player')),
      kind,
      content: this.text('content', content),
    }
    session.append('actor/player-intervention', { version: 1, intervention })
    return intervention
  }

  /** Require one capability on an exact live Actor. */
  private requireCapability(agent: Agent,
    capability: ActorCapability): ActorMembership  {
    this.kernel.requireCapability(this.access(agent), capability)
    return this.membership(agent)
  }

  /** Reject stale Agent objects even when a later lifecycle reused their Session id. */
  private assertLive(agent: Agent): void {
    if (this.ctx.agents.get(agent.id) !== agent) {
      throw new ActorError(`agent "${agent.id}" is not the exact live registry entry`, 'ACTOR_NOT_LIVE')
    }
  }

  /** Validate and snapshot an immutable descriptor. */
  private normalizeDescriptor(descriptor: ActorDescriptor): ActorDescriptor {
    return this.kernel.normalizeDescriptor(descriptor)
  }

  /** Validate one complete UTF-8-bounded nonblank text value. */
  private text(name: string, value: string): string {
    return this.kernel.text(name, value)
  }

  /** Generate an opaque, non-semantic domain identity. */
  private newId(prefix: string): string {
    return this.kernel.newId(prefix)
  }
}

export default ActorService
