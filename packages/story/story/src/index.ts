import { updateStyle, type StyleUpdate } from './style.ts'
import { initializeWorldState, changeWorldState } from './roleplay.ts'
import type { StateInitialValue } from './dynamic-state.ts'
import { initializeDynamicState } from './dynamic-state.ts'
/**
 * Durable Story aggregate registry. StoryId, not a filesystem path, is the
 * product identity; physical layout remains behind ctx.storyHome.
 * @module @deepseek-ai/dsh-story
 */

import { randomUUID } from 'node:crypto'
import { applyStoryContinuity } from './continuity.ts'
import { activeContextNotes, indexContextSources, proposeContextUpdate, editContextProposal, reviewContextProposals, pinContextSource } from './context-retention.ts'
import type { ContextSource, ContextUpdateUnit } from './context-retention.ts'
export * from './context-retention.ts'
export * from './context-sources.ts'
export * from './knowledge.ts'
export * from './characters.ts'
import { initializeStoryCharacters, frameStoryCharacters, seedCharacterKnowledge, storyCharacterSchema, type StoryCharacter } from './characters.ts'
import { applyKnowledgeChanges, emptyKnowledge, knowledgeAuthoritySchema, knowledgeChangeSchema, knowledgeStateSchema } from './knowledge.ts'
import type { StorybookDocument } from './storybook.ts'
import { Context, Service } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { validateStoryPathId } from '@deepseek-ai/dsh-story-home'
import {
  beginDirectorDispatch as beginPlotLedgerDirectorDispatch,
  cancelDirectorRun as cancelPlotLedgerDirectorRun,
  cancelDirectorRunActor as cancelPlotLedgerDirectorRunActor,
  commitDirectorBrief as commitPlotLedgerBrief,
  dispatchableDirectorActorIds,
  emptyPlotLedger,
  npcEventFromActorTool,
  npcBehaviorsFromCommit, npcEventRef,
  parseDirectorBriefInput,
  pauseDirectorRun as pausePlotLedgerDirectorRun,
  requeueCompletedDirectorRunActor as requeueCompletedPlotLedgerDirectorRunActor,
  skipDirectorRunActor as skipPlotLedgerDirectorRunActor,
  settleDirectorDispatch as settlePlotLedgerDirectorDispatch,
  StoryDirectorError,
} from './director.ts'
import {
  applyDirectorOutlinePatch,
  emptyDirectorOutline,
  parseDirectorOutlinePatchInput,
  parseDirectorOutlinePlayerInput,
  replaceDirectorOutlineByPlayer,
  resolveDirectorOutlineSuggestion,
} from './outline.ts'
import {
  emptyStoryPromptOverrides,
  updateActorPromptOverride,
  updateCreatorPromptOverride,
  updateContextRuleOverride,
  updateDirectorPromptOverride,
  updateReasoningLanguageOverride,
} from './prompts.ts'
import {
  actAsPlayer,
  choosePlayerDirection,
  currentStorySceneCast,
  clearDiscussionIntervention,
  closeStoryDiscussion,
  defaultStoryContextRecipe,
  emptyStoryDiscussions,
  emptyStoryMemory,
  emptyStoryWorld,
  intervenePlayerWorld,
  narrateDirectorWorld,
  proposeStoryMemory,
  recordDiscussionTurn,
  requestDiscussionFloor,
  requestDiscussionIntervention,
  reviewStoryMemory,
  settleActorWorldEvents,
  speakAsPlayer,
  stageDirectorScene,
  startStoryDiscussion,
  StoryRoleplayError,
  updateStoryContextRecipe,
  updateDiscussionParticipantIntent,
  updateStoryMemory,
} from './roleplay.ts'
import { storyDomainSpec, storyRecord, storyRuntimeSnapshotSchema, storySessionRecord } from './spec.ts'
import type { StoryRecord, StorySessionRecord } from './spec.ts'
import type {
  DirectorBriefInput,
  DirectorActorDispatchAttemptInput,
  DirectorActorDispatchOutcome,
  DirectorOutlinePatchInput,
  DirectorOutlinePlayerInput,
  DirectorOutline,
  PlotLedger,
  PlotLedgerNpcEvent,
  Story,
  DirectorRunAttemptId as DirectorRunAttemptIdBrand,
  ActorWorldSettlementInput,
  ActorWorldSettlementBatchInput,
  DirectorNarrationInput,
  DirectorSceneCastInput,
  PlayerActionInput,
  PlayerDirectionInput,
  PlayerSpeechInput,
  PlayerWorldInterventionInput,
  StoryContextRecipe,
  StoryContextRuleKey,
  StoryDiscussionState,
  StoryMemoryProposalInput,
  StoryMemoryUpdateInput,
  StoryMemoryState,
  StoryPromptOverrides,
  StoryRuntimeSnapshot,
  StoryWorldState,
  StoryContinuityInput,
  StoryId as StoryIdBrand,
  StorySessionOwner,
  StorySessionRegistration,
  StorySessionRole,
} from './types.ts'

export type {
  StoryContinuityInput,
  StoryContinuityChange,
  StoryContinuityItem,
  DirectorActorBrief,
  DirectorActorDispatchAttemptInput,
  DirectorActorDispatchOutcome,
  DirectorBrief,
  DirectorBriefInput,
  DirectorNarrationInput,
  DirectorSceneCastInput,
  DirectorRun,
  DirectorRunActor,
  DirectorRunAttempt,
  DirectorRunFailure,
  DirectorRunExecutor,
  DirectorRunStatus,
  DirectorForeshadow,
  DirectorMystery,
  DirectorNarrativeClock,
  DirectorOutline,
  DirectorOutlineAuthor,
  DirectorOutlinePatchInput,
  DirectorOutlinePlayerInput,
  DirectorOutlineRevision,
  DirectorOutlineSuggestion,
  DirectorOutlineTextItem,
  DirectorOutlineUpdateMode,
  DirectorPlotBeat,
  DirectorStoryArc,
  PlotLedger,
  PlotLedgerNpcEvent,
  Story,
  StoryActorStreamChunk,
  StorySessionOwner,
  StorySessionRegistration,
  StorySessionRole,
  ActorPerception,
  ActorWorldSettlement,
  ActorWorldSettlementBatchInput,
  ActorWorldSettlementInput,
  PlayerActionInput,
  PlayerAuthorityBaseInput,
  PlayerDirectionInput,
  PlayerSpeechInput,
  PlayerWorldInterventionInput,
  StoryContextRecipe,
  StoryContextRecipeSection,
  StoryContextSnapshot,
  StoryContextRenderer,
  StoryContextMessageRole,
  StoryContextRuleKey,
  StoryContextSectionId,
  StoryRuntimeSnapshot,
  StoryDiscussion,
  StoryDiscussionState,
  StoryDiscussionTurn,
  StoryMemoryEntry,
  StoryMemoryProposalInput,
  StoryMemoryUpdateInput,
  StoryMemoryState,
  StoryPromptOverrides,
  StorySceneCast,
  StoryWorldState,
  WorldEvent,
  WorldPatchOperation,
} from './types.ts'
export { applyStoryContinuity, storyContinuityItems } from './continuity.ts'
export {
  storyDomainSpec,
  storyIdSchema,
  storyRecord,
  storyRuntimeSnapshotSchema,
  storyTurnCheckpointFileSchema,
  storySessionRecord,
  storySessionRoleSchema,
} from './spec.ts'
export {
  beginDirectorDispatch as beginPlotLedgerDirectorDispatch,
  cancelDirectorRun as cancelPlotLedgerDirectorRun,
  cancelDirectorRunActor as cancelPlotLedgerDirectorRunActor,
  commitDirectorBrief as commitPlotLedgerBrief,
  directorActorBriefSchema,
  directorBriefInputSchema,
  directorBriefSchema,
  directorRunSchema,
  dispatchableDirectorActorIds,
  emptyPlotLedger,
  isNpcBehaviorEvent,
  npcEventFromActorTool,
  npcBehaviorsFromCommit, npcEventRef,
  parseDirectorBriefInput,
  pauseDirectorRun as pausePlotLedgerDirectorRun,
  plotLedgerNpcEventSchema,
  plotLedgerSchema,
  requeueCompletedDirectorRunActor as requeueCompletedPlotLedgerDirectorRunActor,
  skipDirectorRunActor as skipPlotLedgerDirectorRunActor,
  settleDirectorDispatch as settlePlotLedgerDirectorDispatch,
  StoryDirectorError,
} from './director.ts'
export {
  applyDirectorOutlinePatch,
  directorOutlinePatchInputSchema,
  directorOutlineSchema,
  emptyDirectorOutline,
  parseDirectorOutlinePatchInput,
  parseDirectorOutlinePlayerInput,
  replaceDirectorOutlineByPlayer,
  resolveDirectorOutlineSuggestion,
  StoryOutlineError,
} from './outline.ts'
export {
  effectiveStoryPrompt,
  emptyStoryPromptOverrides,
  renderReasoningLanguageInstruction,
  storyPromptOverridesSchema,
  updateActorPromptOverride,
  updateCreatorPromptOverride,
  updateContextRuleOverride,
  updateDirectorPromptOverride,
  updateReasoningLanguageOverride,
} from './prompts.ts'
export {
  activeStoryMemories,
  actorPerceptionSchema,
  actorWorldSettlementInputSchema,
  actorWorldSettlementBatchInputSchema,
  actAsPlayer,
  applyStoryContextRecipe,
  choosePlayerDirection,
  clearDiscussionIntervention,
  closeStoryDiscussion,
  currentStorySceneCast,
  defaultStoryContextRecipe,
  emptyStoryDiscussions,
  emptyStoryMemory,
  emptyStoryWorld,
  intervenePlayerWorld,
  narrateDirectorWorld,
  playerActionInputSchema,
  playerDirectionInputSchema,
  playerSpeechInputSchema,
  playerWorldInterventionInputSchema,
  proposeStoryMemory,
  recordDiscussionTurn,
  requestDiscussionFloor,
  requestDiscussionIntervention,
  reviewStoryMemory,
  settleActorWorldEvent,
  settleActorWorldEvents,
  speakAsPlayer,
  stageDirectorScene,
  startStoryDiscussion,
  updateDiscussionParticipantIntent,
  storyContextRecipeSchema,
  storyContextRecipeSectionSchema,
  storyDiscussionSchema,
  storyDiscussionStateSchema,
  storyDiscussionTurnSchema,
  storyMemoryEntrySchema,
  storyMemoryProposalInputSchema,
  storyMemoryUpdateInputSchema,
  storyMemoryStateSchema,
  directorSceneCastInputSchema,
  storySceneCastSchema,
  storyWorldStateSchema,
  StoryRoleplayError,
  updateStoryContextRecipe,
  updateStoryMemory,
  worldEventSchema,
  worldPatchOperationSchema,
} from './roleplay.ts'
export type { StoryRecord, StorySessionRecord } from './spec.ts'
export type {
  ActingGuidance,
  DirectorGuidance,
  StorybookActorCapability,
  StorybookActorDefinition,
  StorybookContextRules,
  StorybookDiscussionSettings,
  StorybookDocument,
  StorybookPrivateContext,
} from './storybook.ts'
export {
  DEFAULT_STORY_CREATOR_PROMPT,
  DEFAULT_STORYBOOK_CONTEXT_RULES,
  DEFAULT_STORYBOOK_DISCUSSION_SETTINGS,
  DEFAULT_STORYBOOK_REASONING_LANGUAGE,
  actingGuidanceSchema,
  directorGuidanceSchema,
  parseStorybookDocument,
  materializeStorybookContextDefaults,
  reasoningLanguageSchema,
  renderStorybookActorPrivateContext,
  storybookActorCapabilitySchema,
  storybookActorDefinitionSchema,
  storybookContextRulesSchema,
  storybookDiscussionSettingsSchema,
  storybookDocumentSchema,
  storybookPrivateContextSchema,
} from './storybook.ts'

/** Opaque stable identity of one Story aggregate. */
export type StoryId = StoryIdBrand
/** Opaque ownership identity of one Actor dispatch attempt. */
export type DirectorRunAttemptId = DirectorRunAttemptIdBrand

/**
 * Brand and validate one Story identity.
 * @param id - Untrusted Story identity text.
 * @returns the validated opaque Story identity.
 */
export function StoryId(id: string): StoryId {
  validateStoryPathId(id)
  return id as StoryId
}

/**
 * Brand one nonblank Host-minted Director Actor attempt identity.
 * @param id - Unique Host-minted attempt identity.
 * @returns the branded ownership identity.
 */
export function DirectorRunAttemptId(id: string): DirectorRunAttemptId {
  if (id.trim().length === 0) throw new Error('Director Run attempt id must not be blank')
  return id as DirectorRunAttemptId
}

/** A caller addressed a Story absent from the canonical registry. */
export class StoryNotFoundError extends Error {
  /** @param storyId - Missing Story identity. */
  constructor(readonly storyId: StoryId) {
    super(`Story '${storyId}' does not exist`)
    this.name = 'StoryNotFoundError'
  }
}

/** A Session is already owned by another Story or incompatible role. */
export class StorySessionOwnershipError extends Error {
  /** @param sessionId - Conflicting Session identity. @param message - Conflict detail. */
  constructor(readonly sessionId: SessionId, message: string) {
    super(message)
    this.name = 'StorySessionOwnershipError'
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Canonical Story identity, metadata, and Session-role ownership. */
    storyRegistry: StoryRegistry
    /** Optional Host provider for executing and cancelling Director Actor attempts. */
    directorRuns: import('./types.ts').DirectorRunExecutor
    /** Optional Host provider for read-only effective Storyweaver context rendering. */
    storyContextRenderer: import('./types.ts').StoryContextRenderer
  }
}

/** Stable in-process entity whose record snapshot swaps after durable writes. */
class StoryEntity implements Story {
  /** @param id - Stable Story identity. @param record - Initial validated record. */
  constructor(readonly id: StoryId, private record: StoryRecord) {}

  get templateId(): string { return this.record.templateId ?? String(this.id) }
  get templateOnly(): boolean { return this.record.templateOnly ?? false }
  get title(): string { return this.record.title }
  get premise(): string { return this.record.premise }
  get sessions(): readonly StorySessionRegistration[] { return this.record.sessions }
  get currentSceneSessionId(): SessionId | undefined { return this.record.currentSceneSessionId }
  get createdAt(): string { return this.record.createdAt }
  get updatedAt(): string { return this.record.updatedAt }
  get archivedAt(): string | undefined { return this.record.archivedAt }
  get plotLedger(): PlotLedger { return this.record.plotLedger }
  get directorOutline(): DirectorOutline { return this.record.directorOutline }
  get world(): StoryWorldState { return this.record.world }
  get memory(): StoryMemoryState { return this.record.memory }
  get discussions(): StoryDiscussionState { return this.record.discussions }
  get contextRecipe(): StoryContextRecipe { return this.record.contextRecipe }
  get promptOverrides(): StoryPromptOverrides { return this.record.promptOverrides }
  get sceneSessionIds(): readonly SessionId[] {
    return this.record.sessions
      .filter(item => item.role === 'scene' && item.archivedAt === undefined)
      .map(item => item.sessionId)
  }
  get controlSessionId(): SessionId | undefined {
    return this.record.sessions.find(item => item.role === 'control' && item.archivedAt === undefined)?.sessionId
  }

  /** @param next - Newly durable record snapshot. */
  replace(next: StoryRecord): void { this.record = next }
  /** @returns the current immutable record snapshot. */
  snapshot(): StoryRecord { return this.record }
}

interface IndexedOwner extends StorySessionOwner {
  readonly registration: StorySessionRecord
}

/** Canonical Story registry with no Workspace or historical Session bootstrap. */
export class StoryRegistry extends Service {
  static inject = ['storageDomain', 'storyHome', 'sessions']

  private table?: KvTable<StoryId, StoryRecord>
  private readonly entities = new Map<StoryId, StoryEntity>()
  private readonly owners = new Map<SessionId, IndexedOwner>()
  private operationTail: Promise<void> = Promise.resolve()
  private readonly ledgerFailures = new Map<SessionId, Error>()

  /**
   * Instantiate story-local people once; reads and previews never initialize them.
   * @param storyId - Independent runtime story.
   * @param book - Authoring snapshot used only for initialization.
   * @returns persisted story including its independent registry.
   */
  initializeCharacters(storyId: StoryId, book: StorybookDocument): Promise<Story> {
    return this.update(storyId, (record) => {
      if (record.world.characters.initialized) return record
      let characters = initializeStoryCharacters(record.world.characters, book)
      const scene = currentStorySceneCast(record.world)
      if (scene !== undefined) characters = frameStoryCharacters(characters, scene.sceneId, scene.presentActorIds)
      return { ...record, world: { ...record.world, characters } }
    })
  }

  /**
   * Create or revise one instance person with optimistic concurrency and retained revisions.
   * @param storyId - Owning independent story.
   * @param expectedRevision - Exact registry revision shown to the writer.
   * @param input - Complete revisioned character definition; IDs are generated by the host for creation.
   * @returns updated story; failed validation changes nothing.
   */
  saveCharacter(storyId: StoryId, expectedRevision: number, input: StoryCharacter): Promise<Story> {
    const entry = storyCharacterSchema.parse(input)
    return this.update(storyId, (record) => {
      const cast = record.world.characters
      if (!cast.initialized || cast.revision !== expectedRevision) throw new Error('Character registry revision changed; reload before editing')
      const previous = cast.entries.find(item => item.definition.actorId === entry.definition.actorId)
      if (entry.revision !== (previous?.revision ?? 0) + 1) throw new Error('Character revision changed')
      const ids = [...cast.entries.map(item => item.definition.actorId), entry.definition.actorId]
      initializeDynamicState(entry.definition.state, ids)
      if (entry.definition.state.some(item => item.definition.actorId !== entry.definition.actorId)) throw new Error('Character fields must name their owner')
      if (entry.definition.initialKnowledge.some(item => item.targetActorId !== undefined && !ids.includes(item.targetActorId))) {
        throw new Error('Initial knowledge references an unregistered person')
      }
      let characters = { ...cast, revision: cast.revision + 1,
        entries: [...cast.entries.filter(item => item.definition.actorId !== entry.definition.actorId), entry],
        history: [...cast.history, entry] }
      if (previous === undefined) characters = seedCharacterKnowledge(characters, entry)
      let dynamicState = record.world.dynamicState
      if (previous === undefined && record.world.stateInitialized) {
        const initial = initializeDynamicState(entry.definition.state.filter(item => item.definition.owner === 'world'), ids)
        if (initial.entries.some(item => dynamicState.entries.some(existing => existing.definition.id === item.definition.id))) throw new Error('World field identity already exists')
        dynamicState = { ...dynamicState, entries: [...dynamicState.entries, ...initial.entries],
          history: [...dynamicState.history, ...initial.history] }
      }
      return { ...record, world: { ...record.world, characters, dynamicState } }
    })
  }

  /**
   * Correct cognition before an Actor Session exists; later writes belong to that Actor's log.
   * @param storyId - Owning story.
   * @param actorId - Unprovisioned person.
   * @param changes - Exact-revision compensating changes.
   * @returns durable updated initial cognition, retaining every prior revision.
   */
  correctUnprovisionedKnowledge(storyId: StoryId, actorId: string, changes: readonly import('./knowledge.ts').KnowledgeChange[]): Promise<Story> {
    return this.update(storyId, (record) => {
      if (record.sessions.some(item => item.role === 'actor' && item.actorId === actorId && item.archivedAt === undefined)) {
        throw new Error('Current cognition belongs to the existing Actor Session')
      }
      const cast = record.world.characters
      if (!cast.entries.some(item => item.definition.actorId === actorId)) throw new Error('Person is not registered')
      const state = applyKnowledgeChanges(cast.knowledge[actorId] ?? emptyKnowledge(), changes, {
        origin: 'player', sourceRefs: [], entityRefs: cast.encounters.filter(item => item.observerId === actorId).map(item => item.ref),
      })
      return { ...record, world: { ...record.world, characters: { ...cast, knowledge: { ...cast.knowledge, [actorId]: state } } } }
    })
  }

  /** @param ctx - Host context carrying Story Home and the domain storage form. */
  constructor(ctx: Context) {
    super(ctx, 'storyRegistry')
  }

  /** Open only the Story domain; deliberately do not scan old Session headers. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(storyDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'story.domainClose')
    this.table = domain.table('stories')
    for (const [id, value] of this.table.entries()) {
      const storyId = StoryId(id)
      const record = storyRecord.parse(value)
      validateRecord(storyId, record)
      const entity = new StoryEntity(storyId, record)
      this.entities.set(storyId, entity)
      this.indexRecord(entity)
    }
    await Promise.all([...this.entities.values()].map(async (story) => {
      await this.ctx.storyHome.ensureStory(story.id)
      await this.writeManifest(story)
    }))
    this.ctx.on('session/event', (session, event) => { this.observeSessionEvent(session, event) })
    this.ctx.on('session/flush', session => this.flushLedger(session))
  }

  /**
   * Create one empty Story with its managed physical aggregate.
   * @param title - Initial display title; blank values are rejected.
   * @param premise - Optional player-facing premise.
   * @param templateId - Stable authored-setting identity; omitted uses the new StoryId.
   * @returns the newly durable Story.
   */
  create(title: string = '未命名故事', premise: string = '', templateId?: string): Promise<Story> {
    return this.enqueue(async () => {
      const acceptedTitle = normalizeTitle(title)
      const acceptedPremise = normalizePremise(premise)
      const id = StoryId(`story-${randomUUID()}`)
      const now = new Date().toISOString()
      const record: StoryRecord = {
        templateId: normalizeTemplateId(templateId ?? String(id)),
        templateOnly: false,
        title: acceptedTitle,
        premise: acceptedPremise,
        sessions: [],
        createdAt: now,
        updatedAt: now,
        plotLedger: emptyPlotLedger(),
        directorOutline: emptyDirectorOutline(),
        world: emptyStoryWorld(),
        memory: emptyStoryMemory(),
        discussions: emptyStoryDiscussions(),
        contextRecipe: defaultStoryContextRecipe(),
        promptOverrides: emptyStoryPromptOverrides(),
      }
      await this.ctx.storyHome.ensureStory(id)
      await this.requireTable().put(id, record)
      const entity = new StoryEntity(id, record)
      this.entities.set(id, entity)
      await this.writeManifest(entity)
      return entity
    })
  }

  /**
   * Resolve one Story by identity.
   * @param id - Story identity.
   * @returns the stable entity or undefined.
   */
  get(id: StoryId): Story | undefined {
    return this.entities.get(id)
  }

  /**
   * Return Stories ordered by recent registry mutation.
   * @param options - Include archived aggregates when requested.
   * @returns a fresh ordered entity array.
   */
  list(options: { readonly includeArchived?: boolean } = {}): Story[] {
    return [...this.entities.values()]
      .filter(story => options.includeArchived === true || story.archivedAt === undefined)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
        || String(left.id).localeCompare(String(right.id)))
  }

  /**
   * Return a detached validated record for versioned Story Package export.
   * @param storyId - Story whose canonical record is exported.
   * @returns a detached validated Story record.
   */
  exportRecord(storyId: StoryId): StoryRecord {
    return storyRecord.parse(structuredClone(this.requireEntity(storyId).snapshot()))
  }

  /**
   * Import one already-remapped Story Package record under a fresh Story identity.
   * @param input - Validated record whose internal Session ids are already remapped.
   * @returns the newly durable Story.
   */
  importRecord(input: StoryRecord): Promise<Story> {
    return this.enqueue(async () => {
      const id = StoryId(`story-${randomUUID()}`)
      const now = new Date().toISOString()
      const record = storyRecord.parse({
        ...structuredClone(input),
        archivedAt: undefined,
        createdAt: now,
        updatedAt: now,
      })
      validateRecord(id, record)
      for (const registration of record.sessions) {
        const owner = this.owners.get(registration.sessionId)
        if (owner !== undefined) {
          throw new StorySessionOwnershipError(
            registration.sessionId,
            `Imported Session '${registration.sessionId}' is already owned by Story '${owner.storyId}'`,
          )
        }
      }
      await this.ctx.storyHome.ensureStory(id)
      await this.requireTable().put(id, record)
      const entity = new StoryEntity(id, record)
      this.entities.set(id, entity)
      this.indexRecord(entity)
      await this.writeManifest(entity)
      return entity
    })
  }

  /**
   * Resolve the Story and role owning one Session.
   * @param sessionId - Session identity.
   * @returns ownership metadata, or undefined for an unregistered Session.
   */
  storyForSession(sessionId: SessionId): StorySessionOwner | undefined {
    const owner = this.owners.get(sessionId)
    if (owner === undefined) return undefined
    return {
      storyId: owner.storyId,
      role: owner.role,
      ...(owner.actorId === undefined ? {} : { actorId: owner.actorId }),
      archived: owner.archived,
    }
  }

  /**
   * Return the Host-only runtime cwd for a Story Session.
   * @param storyId - Story identity.
   * @returns the managed .runtime path.
   */
  runtimePath(storyId: StoryId): string {
    this.requireStory(storyId)
    return this.ctx.storyHome.storyPath(storyId, '.runtime')
  }

  /**
   * Rename one Story.
   * @param storyId - Story identity.
   * @param title - Replacement display title.
   * @returns the changed Story.
   */
  setTitle(storyId: StoryId, title: string): Promise<Story> {
    const accepted = normalizeTitle(title)
    return this.update(storyId, record => record.title === accepted
      ? record
      : { ...record, title: accepted })
  }

  /**
   * Replace one Story's premise.
   * @param storyId - Story identity.
   * @param premise - Replacement premise.
   * @returns the changed Story.
   */
  setPremise(storyId: StoryId, premise: string): Promise<Story> {
    const accepted = normalizePremise(premise)
    return this.update(storyId, record => record.premise === accepted
      ? record
      : { ...record, premise: accepted })
  }

  /**
   * Persist a structured Director Brief without granting it character speech or action authority.
   * @param storyId - Story whose Plot Ledger is updated.
   * @param directorSessionId - active scene or control Session authoring the Brief.
   * @param input - strict planning fields over an exact Ledger revision.
   * @returns the changed Story after the Brief consumes pending NPC tool events.
   */
  commitDirectorBrief(
    storyId: StoryId,
    directorSessionId: SessionId,
    input: DirectorBriefInput,
  ): Promise<Story> {
    const accepted = parseDirectorBriefInput(input)
    return this.update(storyId, (record) => {
      const director = activeRegistration(record, directorSessionId)
      if (director === undefined || (director.role !== 'scene' && director.role !== 'control')) {
        throw new StoryDirectorError(
          'DIRECTOR_INVALID_SESSION',
          `Session '${directorSessionId}' is not an active Director Session in Story '${storyId}'`,
        )
      }
      const scene = activeRegistration(record, accepted.sceneSessionId)
      if (scene?.role !== 'scene' || record.currentSceneSessionId !== accepted.sceneSessionId) {
        throw new StoryDirectorError(
          'DIRECTOR_INVALID_SESSION',
          `Session '${accepted.sceneSessionId}' is not the current scene in Story '${storyId}'`,
        )
      }
      if (director.role === 'scene' && director.sessionId !== accepted.sceneSessionId) {
        throw new StoryDirectorError(
          'DIRECTOR_INVALID_SESSION',
          `Scene Director Session '${directorSessionId}' cannot brief scene '${accepted.sceneSessionId}'`,
        )
      }
      requireCurrentSceneCast(record, 'Director Brief')
      const activeActorIds = new Set(record.sessions
        .filter(item => item.role === 'actor' && item.archivedAt === undefined)
        .map(item => item.actorId as string))
      for (const actorBrief of accepted.actorBriefs) {
        requireActorInCurrentScene(record, actorBrief.actorId, 'Director Brief')
        if (!activeActorIds.has(actorBrief.actorId)) {
          throw new StoryDirectorError(
            'DIRECTOR_UNKNOWN_ACTOR',
            `Director Brief names inactive Actor '${actorBrief.actorId}' in Story '${storyId}'`,
          )
        }
      }
      return {
        ...record,
        plotLedger: commitPlotLedgerBrief(record.plotLedger, directorSessionId, {
          ...accepted, establishedFacts: record.plotLedger.establishedFacts, openThreads: record.plotLedger.openThreads,
        }),
      }
    })
  }

  /**
   * Replace the Host-managed physical cast before committing the next Director Brief.
   * Scene changes are rejected while a run or discussion still owns the current cast.
   * @param storyId - Story whose physical scene changes.
   * @param input - Exact-revision scene location and complete present Actor set.
   * @returns the changed durable Story.
   */
  stageScene(storyId: StoryId, input: DirectorSceneCastInput): Promise<Story> {
    return this.update(storyId, (record) => {
      const run = record.plotLedger.directorRun
      if (run !== undefined && run.status !== 'completed' && run.status !== 'cancelled') {
        throw new StoryDirectorError(
          'DIRECTOR_RUN_INCOMPLETE',
          `Director Run '${run.id}' must finish before the scene cast changes`,
        )
      }
      const discussion = record.discussions.discussions.find(item => (
        item.status === 'active' || item.status === 'awaiting-player' || item.status === 'summarizing'
      ))
      if (discussion !== undefined) {
        throw new StoryRoleplayError(
          'INVALID_SCENE_STATE',
          `Discussion '${discussion.id}' must finish before the scene cast changes`,
        )
      }
      const world = stageDirectorScene(record.world, input)
      const previousScene = currentStorySceneCast(record.world)?.sceneId
      const styles = record.promptOverrides.styles
      const promptOverrides = previousScene !== input.sceneId && styles.scene !== undefined
        ? { ...record.promptOverrides, revision: record.promptOverrides.revision + 1, styles: { profiles: styles.profiles } }
        : record.promptOverrides
      return { ...record, world, promptOverrides }
    })
  }

  /**
   * Initialize objective authored fields once per Story.
   * @param storyId - target Story.
   * @param initial - objective authored fields.
   * @param actorIds - validated storybook cast.
   * @returns the initialized Story.
   */
  initializeWorldState(storyId: StoryId, initial: readonly StateInitialValue[], actorIds: readonly string[]): Promise<Story> {
    return this.update(storyId, record => ({ ...record, world: initializeWorldState(record.world, initial, actorIds) }))
  }

  /**
   * Commit a revisioned world-state batch and its observable consequences.
   * @param storyId - target Story.
   * @param input - world mutation and audience.
   * @returns the updated Story.
   */
  changeWorldState(storyId: StoryId, input: import('./types.ts').WorldStateChangeInput): Promise<Story> {
    return this.update(storyId, record => ({ ...record, world: changeWorldState(record.world, input) }))
  }

  /**
   * Establish one objective Director narration over an exact World revision.
   * @param storyId - Story whose World receives the narration.
   * @param input - Narration and expected World revision to commit.
   * @returns the updated Story after the narration is accepted.
   */
  narrate(storyId: StoryId, input: DirectorNarrationInput): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      world: narrateDirectorWorld(record.world, {
        ...input,
        audience: input.audience.length === 0 ? [] : resolveActorAudience(record, input.audience),
      }),
    }))
  }

  /**
   * Persist the exact Actors selected for one resumable Director dispatch attempt.
   * @param storyId - Story whose current Director Run advances.
   * @param directorSessionId - Scene or control Session that owns the run.
   * @param expectedRunRevision - Exact current Run revision.
   * @param attempts - Host-minted ownership intervals for selected incomplete Actors.
   * @returns the changed durable Story projection.
   */
  beginDirectorDispatch(
    storyId: StoryId,
    directorSessionId: SessionId,
    expectedRunRevision: number,
    attempts: readonly DirectorActorDispatchAttemptInput[],
  ): Promise<Story> {
    return this.update(storyId, (record) => {
      requireDirectorRegistration(record, storyId, directorSessionId)
      const run = record.plotLedger.directorRun
      if (run === undefined || run.directorSessionId !== directorSessionId) {
        throw new StoryDirectorError(
          'DIRECTOR_INVALID_SESSION',
          `Session '${directorSessionId}' does not own the current Director Run`,
        )
      }
      dispatchableDirectorActorIds(record.plotLedger, attempts.map(attempt => attempt.actorId))
      return {
        ...record,
        plotLedger: beginPlotLedgerDirectorDispatch(record.plotLedger, expectedRunRevision, attempts),
      }
    })
  }

  /**
   * Requeue the exact completed Actor that currently owns an active discussion floor.
   * @param storyId - Story whose discussion is advancing.
   * @param directorSessionId - Director Session that owns the current Run.
   * @param expectedRunRevision - Exact current Run revision.
   * @param discussionId - Active discussion granting the floor.
   * @param actorId - Completed current speaker to requeue.
   * @returns the changed durable Story projection.
   */
  requeueDiscussionSpeaker(
    storyId: StoryId,
    directorSessionId: SessionId,
    expectedRunRevision: number,
    discussionId: string,
    actorId: string,
  ): Promise<Story> {
    return this.update(storyId, (record) => {
      requireDirectorRegistration(record, storyId, directorSessionId)
      const run = record.plotLedger.directorRun
      if (run === undefined || run.directorSessionId !== directorSessionId) {
        throw new StoryDirectorError(
          'DIRECTOR_INVALID_SESSION',
          `Session '${directorSessionId}' does not own the current Director Run`,
        )
      }
      const discussion = record.discussions.discussions.find(item => item.id === discussionId)
      if (discussion?.status !== 'active' || discussion.currentSpeakerId !== actorId) {
        throw new StoryRoleplayError(
          'INVALID_DISCUSSION_STATE',
          `Actor '${actorId}' does not own the active discussion floor`,
        )
      }
      return {
        ...record,
        plotLedger: requeueCompletedPlotLedgerDirectorRunActor(
          record.plotLedger,
          expectedRunRevision,
          actorId,
        ),
      }
    })
  }

  /**
   * Settle completed and failed Actors without discarding accepted event references.
   * @param storyId - Story whose current Director Run settles.
   * @param directorSessionId - Scene or control Session that owns the run.
   * @param outcomes - Per-Actor completion or classified failure results.
   * @returns the changed durable Story projection.
   */
  settleDirectorDispatch(
    storyId: StoryId,
    directorSessionId: SessionId,
    outcomes: readonly DirectorActorDispatchOutcome[],
  ): Promise<Story> {
    return this.update(storyId, (record) => {
      requireDirectorRegistration(record, storyId, directorSessionId)
      const run = record.plotLedger.directorRun
      if (run === undefined || run.directorSessionId !== directorSessionId) {
        throw new StoryDirectorError(
          'DIRECTOR_INVALID_SESSION',
          `Session '${directorSessionId}' does not own the current Director Run`,
        )
      }
      validateOutcomeEventRefs(record.plotLedger, outcomes)
      return {
        ...record,
        plotLedger: settlePlotLedgerDirectorDispatch(record.plotLedger, outcomes),
      }
    })
  }

  /**
   * Pause the exact current Director Run checkpoint.
   * @param storyId - Story whose active Run pauses.
   * @param expectedRunRevision - Exact current Run revision.
   * @returns the changed durable Story.
   */
  pauseDirectorRun(storyId: StoryId, expectedRunRevision: number): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      plotLedger: pausePlotLedgerDirectorRun(record.plotLedger, expectedRunRevision),
    }))
  }

  /**
   * Cancel the exact current Director Run terminally.
   * @param storyId - Story whose active Run is cancelled.
   * @param expectedRunRevision - Exact current Run revision.
   * @returns the changed durable Story.
   */
  cancelDirectorRun(storyId: StoryId, expectedRunRevision: number): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      plotLedger: cancelPlotLedgerDirectorRun(record.plotLedger, expectedRunRevision),
    }))
  }

  /**
   * Skip one incomplete Actor over the exact current Director Run revision.
   * @param storyId - Story whose Actor checkpoint changes.
   * @param expectedRunRevision - Exact current Run revision.
   * @param actorId - Incomplete Actor to mark skipped.
   * @returns the changed durable Story.
   */
  skipDirectorRunActor(
    storyId: StoryId,
    expectedRunRevision: number,
    actorId: string,
  ): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      plotLedger: skipPlotLedgerDirectorRunActor(record.plotLedger, expectedRunRevision, actorId),
    }))
  }

  /**
   * Cancel one owned Actor attempt over the exact current Director Run revision.
   * @param storyId - Story whose Actor attempt is cancelled.
   * @param expectedRunRevision - Exact current Run revision.
   * @param actorId - Running Actor whose owned attempt is cancelled.
   * @returns the changed durable Story.
   */
  cancelDirectorRunActor(
    storyId: StoryId,
    expectedRunRevision: number,
    actorId: string,
  ): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      plotLedger: cancelPlotLedgerDirectorRunActor(record.plotLedger, expectedRunRevision, actorId),
    }))
  }

  /**
   * Replace player-editable Director Outline content over an exact revision.
   * @param storyId - Story whose private plan is replaced.
   * @param expectedRevision - Exact current Outline revision.
   * @param input - Complete player-editable Outline fields.
   * @param reason - Player-facing audit reason.
   * @returns the changed durable Story.
   */
  replaceDirectorOutline(
    storyId: StoryId,
    expectedRevision: number,
    input: DirectorOutlinePlayerInput,
    reason: string,
  ): Promise<Story> {
    const accepted = parseDirectorOutlinePlayerInput(input)
    return this.update(storyId, record => ({
      ...record,
      directorOutline: replaceDirectorOutlineByPlayer(
        record.directorOutline,
        expectedRevision,
        accepted,
        reason,
      ),
    }))
  }

  /**
   * Apply or queue one Director-authored Outline patch over an exact revision.
   * @param storyId - Story whose private plan is patched.
   * @param input - Strict category patch and audit reason.
   * @returns the changed durable Story.
   */
  patchDirectorOutline(storyId: StoryId, input: DirectorOutlinePatchInput): Promise<Story> {
    const accepted = parseDirectorOutlinePatchInput(input)
    return this.update(storyId, record => ({
      ...record,
      directorOutline: applyDirectorOutlinePatch(record.directorOutline, accepted),
    }))
  }

  /**
   * Resolve one pending Director Outline suggestion as an explicit player action.
   * @param storyId - Story that owns the suggestion.
   * @param expectedRevision - Exact current Outline revision.
   * @param suggestionId - Pending suggestion identity.
   * @param accept - Whether the player accepts the proposed patch.
   * @returns the changed durable Story.
   */
  resolveDirectorOutlineSuggestion(
    storyId: StoryId,
    expectedRevision: number,
    suggestionId: string,
    accept: boolean,
  ): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      directorOutline: resolveDirectorOutlineSuggestion(
        record.directorOutline,
        expectedRevision,
        suggestionId,
        accept,
      ),
    }))
  }

  /**
   * Persist a player-selected direction through the typed PlayerAuthority boundary.
   * @param storyId - Story whose direction changes.
   * @param input - Exact-revision direction and audience.
   * @returns the changed durable Story.
   */
  chooseDirection(storyId: StoryId, input: PlayerDirectionInput): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      world: choosePlayerDirection(record.world, {
        ...input,
        audience: resolveActorAudience(record, input.audience),
      }),
    }))
  }

  /**
   * Apply an explicit player intervention to authoritative world facts.
   * @param storyId - Story whose world changes.
   * @param input - Exact-revision facts, patch, and audience.
   * @returns the changed durable Story.
   */
  interveneWorld(storyId: StoryId, input: PlayerWorldInterventionInput): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      world: intervenePlayerWorld(record.world, {
        ...input,
        audience: resolveActorAudience(record, input.audience),
      }),
    }))
  }

  /**
   * Establish player-authored speech as one active Story Actor.
   * @param storyId - Story whose Actor speaks.
   * @param input - Exact-revision Actor speech and audience.
   * @returns the changed durable Story.
   */
  speakAs(storyId: StoryId, input: PlayerSpeechInput): Promise<Story> {
    return this.update(storyId, (record) => {
      requireActiveActor(record, storyId, input.actorId)
      requireActorInCurrentScene(record, input.actorId, 'Player speech')
      const world = speakAsPlayer(record.world, {
        ...input,
        audience: resolveActorAudience(record, input.audience),
      })
      const current = record.discussions.discussions.find(discussion => discussion.status === 'active')
      const discussions = current?.currentSpeakerId === input.actorId
        ? recordDiscussionTurn(record.discussions, {
          expectedRevision: record.discussions.revision,
          discussionId: current.id,
          speakerId: input.actorId,
          text: input.text,
          sourceEventRef: `world:${String(world.revision)}`,
        })
        : record.discussions
      return { ...record, world, discussions }
    })
  }

  /**
   * Establish a player-authored Actor action and its explicit world patch.
   * @param storyId - Story whose Actor acts.
   * @param input - Exact-revision Actor action, facts, patch, and audience.
   * @returns the changed durable Story.
   */
  actAs(storyId: StoryId, input: PlayerActionInput): Promise<Story> {
    return this.update(storyId, (record) => {
      requireActiveActor(record, storyId, input.actorId)
      requireActorInCurrentScene(record, input.actorId, 'Player action')
      return {
        ...record,
        world: actAsPlayer(record.world, {
          ...input,
          audience: resolveActorAudience(record, input.audience),
        }),
      }
    })
  }

  /**
   * Settle one captured Actor speech/action into world truth and scoped perceptions.
   * @param storyId - Story containing the sourced Actor event.
   * @param input - Exact-revision settlement, patch, and audience delivery.
   * @returns the changed durable Story.
   */
  settleActorWorldEvent(storyId: StoryId, input: ActorWorldSettlementInput): Promise<Story> {
    return this.settleActorWorldEvents(storyId, {
      expectedWorldRevision: input.expectedWorldRevision,
      settlements: [input],
    })
  }

  /**
   * Atomically settle captured Actor speech/actions against one world revision.
   * Every decision is validated before any fact, event, perception, or discussion state is changed.
   * @param storyId - Story containing every sourced Actor event.
   * @param input - Exact-revision settlement transaction.
   * @returns the changed durable Story.
   */
  settleActorWorldEvents(storyId: StoryId, input: ActorWorldSettlementBatchInput): Promise<Story> {
    return this.update(storyId, (record) => {
      const sourced = input.settlements.map((settlement) => {
        const event = findNpcEvent(record.plotLedger, settlement.sourceEventRef)
        if (event === undefined) {
          throw new StoryRoleplayError(
            'UNKNOWN_ACTOR_EVENT',
            `Actor event '${settlement.sourceEventRef}' is not present in the Story Plot Ledger`,
          )
        }
        return {
          settlement: {
            ...settlement,
            audience: resolveActorAudience(record, settlement.audience),
          },
          event,
        }
      })
      const world = settleActorWorldEvents(record.world, {
        expectedWorldRevision: input.expectedWorldRevision,
        settlements: sourced.map(item => item.settlement),
      }, sourced.map(item => item.event))
      const discussions = sourced.reduce((state, item) => {
        const active = state.discussions.find(discussion => discussion.status === 'active')
        return item.settlement.accepted && item.event.kind === 'speech'
          && active?.currentSpeakerId === item.event.actorId
          ? recordDiscussionTurn(state, {
            expectedRevision: state.revision,
            discussionId: active.id,
            speakerId: item.event.actorId,
            text: item.event.text,
            sourceEventRef: item.settlement.sourceEventRef,
          })
          : state
      }, record.discussions)
      return { ...record, world, discussions }
    })
  }

  /**
   * Create a player-reviewable scene or arc memory proposal.
   * @param storyId - Story whose memory receives a proposal.
   * @param input - Exact-revision proposal content and visibility.
   * @returns the changed durable Story.
   */
  proposeMemory(storyId: StoryId, input: StoryMemoryProposalInput): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      memory: proposeStoryMemory(record.memory, {
        ...input,
        publicAudience: input.publicAudience ?? [],
      }),
    }))
  }

  /**
   * Commit source-backed Actor matters through the serialized Story writer.
   * @param storyId - owning Story.
   * @param actorId - authenticated, active Actor author.
   * @param inputs - accepted source events and idempotent annotation ids.
   * @param attemptId - completed dispatch attempt that owns the submission.
   * @returns Story with the new matters available to permitted viewers.
   */
  recordContinuity(
    storyId: StoryId, actorId: string, inputs: readonly StoryContinuityInput[], attemptId: DirectorRunAttemptIdBrand,
  ): Promise<Story> {
    return this.update(storyId, (record) => {
      requireActiveActor(record, storyId, actorId)
      const actor = record.plotLedger.directorRun?.actors.find(item => item.actorId === actorId)
      if (actor?.status !== 'completed' || actor.attempt?.attemptId !== attemptId) {
        throw new StoryRoleplayError('INVALID_DISCUSSION_STATE', 'Continuity submission no longer owns its Actor attempt')
      }
      return { ...record, world: applyStoryContinuity(record.world, actorId, inputs) }
    })
  }

  /**
   * Append source pointers and pending notes through the serialized writer. Actor attempts must be accepted.
   * @param storyId - Story whose retention state is changed.
   * @param sources - Accepted original locations and captured visibility.
   * @param proposal - Optional pending update; Actor submission requires an accepted attempt.
   * @returns The durably updated Story; unaccepted Actor attempts cannot write proposals.
   */
  recordContext(storyId: StoryId, sources: readonly ContextSource[], proposal?: {
    scope: string
    submissionId: string
    turnId: string
    units: readonly ContextUpdateUnit[]
    attemptId?: DirectorRunAttemptIdBrand
  }): Promise<Story> {
    return this.update(storyId, (record) => {
      if (proposal?.scope.startsWith('actor:')) {
        const actorId = proposal.scope.slice(6)
        requireActiveActor(record, storyId, actorId)
        const actor = record.plotLedger.directorRun?.actors.find(item => item.actorId === actorId)
        if (actor?.status !== 'completed' || actor.attempt?.attemptId !== proposal.attemptId) {
          throw new Error('Context proposal no longer owns an accepted Actor attempt')
        }
      }
      let context = indexContextSources(record.world.context, sources)
      if (proposal !== undefined) {
        context = proposeContextUpdate(context, proposal.scope, proposal.submissionId, proposal.turnId, proposal.units)
      }
      return { ...record, world: { ...record.world, context } }
    })
  }

  /**
   * Edit a pending source-processing unit without activating it.
   * @param storyId - Story whose retention state is changed.
   * @param id - Pending proposal identity.
   * @param revision - Exact revision observed by the player.
   * @param unit - Complete edited source-processing unit.
   * @returns The Story with a revised pending proposal; stale revisions reject.
   */
  editContext(storyId: StoryId, id: string, revision: number, unit: ContextUpdateUnit): Promise<Story> {
    return this.update(storyId, record => ({ ...record, world: { ...record.world,
      context: editContextProposal(record.world.context, id, revision, unit),
    } }))
  }

  /**
   * Approve complete units atomically and refresh the Director's derived fact/thread projection.
   * @param storyId - Story whose retention state is changed.
   * @param reviews - Atomic approval or rejection decisions and observed revisions.
   * @returns The Story with atomic review decisions and derived Brief facts and threads.
   */
  reviewContext(storyId: StoryId, reviews: readonly { id: string; revision: number; approve: boolean }[]): Promise<Story> {
    return this.update(storyId, (record) => {
      const context = reviewContextProposals(record.world.context, reviews)
      const notes = activeContextNotes(context, 'director')
      return { ...record, world: { ...record.world, context }, plotLedger: { ...record.plotLedger,
        establishedFacts: notes.filter(note => note.kind === 'fact' || note.kind === 'outcome').map(note => note.text),
        openThreads: notes.filter(note => note.status === 'active' && note.kind !== 'fact' && note.kind !== 'outcome').map(note => note.text),
      } }
    })
  }

  /**
   * Player control of original-text retention for an exact knowledge scope.
   * @param storyId - Story whose retention state is changed.
   * @param sourceId - Original source identity.
   * @param scope - Exact Director or Actor knowledge scope.
   * @param pinned - Whether the original must remain in this viewer’s context.
   * @returns The Story with the viewer-specific original pin changed.
   */
  pinContext(storyId: StoryId, sourceId: string, scope: string, pinned: boolean): Promise<Story> {
    return this.update(storyId, record => ({ ...record, world: { ...record.world,
      context: pinContextSource(record.world.context, sourceId, scope, pinned),
    } }))
  }

  /**
   * Approve or reject one memory proposal over the exact current revision.
   * @param storyId - Story whose memory is reviewed.
   * @param expectedRevision - Exact current memory revision.
   * @param memoryId - Proposed memory identity.
   * @param approve - Whether the proposal becomes active.
   * @returns the changed durable Story.
   */
  reviewMemory(storyId: StoryId, expectedRevision: number, memoryId: string, approve: boolean): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      memory: reviewStoryMemory(record.memory, expectedRevision, memoryId, approve),
    }))
  }

  /**
   * Replace one memory entry's player-editable content over the exact current revision.
   * @param storyId - Story whose memory entry changes.
   * @param input - Exact-revision memory replacement.
   * @returns the changed durable Story.
   */
  updateMemory(storyId: StoryId, input: StoryMemoryUpdateInput): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      memory: updateStoryMemory(record.memory, input),
    }))
  }

  /**
   * Begin one bounded durable group discussion among active Actors.
   * @param storyId - Story that owns the discussion.
   * @param input - Exact revision, topic, participants, and round budget.
   * @returns the changed durable Story.
   */
  startDiscussion(
    storyId: StoryId,
    input: {
      readonly expectedRevision: number
      readonly topic: string
      readonly participantIds: readonly string[]
      readonly maxRounds: number
      readonly initiatedBy?: 'director' | 'player' | undefined
    },
  ): Promise<Story> {
    return this.update(storyId, (record) => {
      for (const actorId of input.participantIds) {
        requireActorInCurrentScene(record, actorId, 'Discussion')
        requireActiveActor(record, storyId, actorId)
      }
      return { ...record, discussions: startStoryDiscussion(record.discussions, input) }
    })
  }

  /**
   * Queue an active participant for the next discussion floor.
   * @param storyId - Story that owns the discussion.
   * @param expectedRevision - Exact current discussion-state revision.
   * @param discussionId - Active discussion identity.
   * @param actorId - Participant requesting the floor.
   * @returns the changed durable Story.
   */
  requestDiscussionFloor(
    storyId: StoryId,
    expectedRevision: number,
    discussionId: string,
    actorId: string,
  ): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      discussions: requestDiscussionFloor(record.discussions, expectedRevision, discussionId, actorId),
    }))
  }

  /**
   * Persist the current floor owner's autonomous discussion preference.
   * @param storyId - Story that owns the active discussion.
   * @param expectedRevision - Exact current discussion-state revision.
   * @param discussionId - Active discussion identity.
   * @param actorId - Current Actor floor owner.
   * @param intent - Actor-declared stance, eagerness, action, and optional hand-off.
   * @returns the changed durable Story.
   */
  updateDiscussionParticipantIntent(
    storyId: StoryId,
    expectedRevision: number,
    discussionId: string,
    actorId: string,
    intent: {
      readonly stance?: string | undefined
      readonly eagerness: 'low' | 'medium' | 'high'
      readonly action: 'speak' | 'pass' | 'conclude'
      readonly nextSpeakerId?: string | undefined
    },
  ): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      discussions: updateDiscussionParticipantIntent(
        record.discussions, expectedRevision, discussionId, actorId, intent,
      ),
    }))
  }

  /**
   * Accept an independently completed preparation without a shared revision race.
   * @param storyId - owning Story.
   * @param discussionId - exact discussion generation.
   * @param actorId - prepared participant.
   * @param intent - private stance and eagerness; preparation always passes silently.
   * @param attemptId - completed attempt, or omission for an explicitly skipped Actor.
   * @returns Story after removing that participant from the preparation barrier.
   */
  completeDiscussionPreparation(
    storyId: StoryId, discussionId: string, actorId: string,
    intent: { readonly stance?: string | undefined; readonly eagerness: 'low' | 'medium' | 'high' },
    attemptId?: DirectorRunAttemptIdBrand,
  ): Promise<Story> {
    return this.update(storyId, (record) => {
      const discussion = record.discussions.discussions.find(item => item.id === discussionId)
      const actor = record.plotLedger.directorRun?.actors.find(item => item.actorId === actorId)
      const ownsAttempt = attemptId === undefined ? actor?.status === 'skipped'
        : actor?.status === 'completed' && actor.attempt?.attemptId === attemptId
      if (discussion?.status !== 'active' || !ownsAttempt || discussion.playerIntervention !== undefined) {
        throw new StoryRoleplayError('INVALID_DISCUSSION_STATE', 'Preparation no longer owns its discussion or Actor attempt')
      }
      if (!discussion.preparationPendingIds?.includes(actorId)) return record
      return { ...record, discussions: updateDiscussionParticipantIntent(
        record.discussions, record.discussions.revision, discussionId, actorId, { ...intent, action: 'pass' },
      ) }
    })
  }

  /**
   * Pause automatic discussion dispatch for an explicit player intervention.
   * @param storyId - Story that owns the discussion.
   * @param expectedRevision - Exact current discussion-state revision.
   * @param discussionId - Active discussion identity.
   * @param intervention - Whether the player requests a turn or a conclusion.
   * @returns the changed durable Story.
   */
  requestDiscussionIntervention(
    storyId: StoryId,
    expectedRevision: number,
    discussionId: string,
    intervention: 'speak' | 'conclude',
  ): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      discussions: requestDiscussionIntervention(
        record.discussions,
        expectedRevision,
        discussionId,
        intervention,
      ),
    }))
  }

  /**
   * Clear one Director-acknowledged discussion intervention.
   * @param storyId - Story that owns the discussion.
   * @param expectedRevision - Exact current discussion-state revision.
   * @param discussionId - Active discussion identity.
   * @returns the changed durable Story.
   */
  clearDiscussionIntervention(
    storyId: StoryId,
    expectedRevision: number,
    discussionId: string,
  ): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      discussions: clearDiscussionIntervention(record.discussions, expectedRevision, discussionId),
    }))
  }

  /**
   * Record one externally supplied discussion turn from the exact floor owner.
   * @param storyId - Story that owns the discussion.
   * @param input - Exact-revision speaker turn and optional event source.
   * @returns the changed durable Story.
   */
  recordDiscussionTurn(
    storyId: StoryId,
    input: {
      readonly expectedRevision: number
      readonly discussionId: string
      readonly speakerId: string
      readonly text: string
      readonly action?: 'speak' | 'pass' | 'conclude' | undefined
      readonly sourceEventRef?: string | undefined
    },
  ): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      discussions: recordDiscussionTurn(record.discussions, input),
    }))
  }

  /**
   * Complete or cancel one durable discussion.
   * @param storyId - Story that owns the discussion.
   * @param expectedRevision - Exact current discussion-state revision.
   * @param discussionId - Active discussion identity.
   * @param status - Terminal completion or cancellation state.
   * @returns the changed durable Story.
   */
  closeDiscussion(
    storyId: StoryId,
    expectedRevision: number,
    discussionId: string,
    status: 'completed' | 'cancelled',
  ): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      discussions: closeStoryDiscussion(record.discussions, expectedRevision, discussionId, status),
    }))
  }

  /**
   * Copy or clear one audience's run style or current-scene instruction.
   * @param storyId - Story whose guidance changes.
   * @param expectedRevision - Exact current prompt-settings revision.
   * @param update - Profile override or instruction for the exact current scene.
   * @param actorIds - Authored cast used to validate the recipient.
   * @returns the changed durable Story.
   */
  updateStyle(storyId: StoryId, expectedRevision: number, update: StyleUpdate, actorIds: readonly string[]): Promise<Story> {
    return this.update(storyId, (record) => {
      if (record.promptOverrides.revision !== expectedRevision) throw new Error('Style revision is stale; refresh before saving')
      return { ...record, promptOverrides: { ...record.promptOverrides, revision: expectedRevision + 1,
        styles: updateStyle(record.promptOverrides.styles, update, actorIds, currentStorySceneCast(record.world)?.sceneId) } }
    })
  }

  /**
   * Replace the Director prompt at its current revision.
   * @param storyId - Story whose override changes.
   * @param expectedRevision - exact loaded prompt revision.
   * @param prompt - replacement or undefined to inherit the storybook.
   * @returns the durably updated Story.
   */
  updateDirectorPrompt(
    storyId: StoryId,
    expectedRevision: number,
    prompt: string | undefined,
  ): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      promptOverrides: updateDirectorPromptOverride(record.promptOverrides, expectedRevision, prompt),
    }))
  }

  /**
   * Replace or clear the Story-local creation Agent prompt over an exact revision.
   * @param storyId - Story whose creation-task prompt changes.
   * @param expectedRevision - Exact current prompt-settings revision.
   * @param prompt - Replacement prompt, or undefined to inherit the workspace default.
   * @returns the changed durable Story.
   */
  updateCreatorPrompt(
    storyId: StoryId,
    expectedRevision: number,
    prompt: string | undefined,
  ): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      promptOverrides: updateCreatorPromptOverride(record.promptOverrides, expectedRevision, prompt),
    }))
  }

  /**
   * Replace or clear one Actor's Story-local prompt over an exact revision.
   * @param storyId - Story whose Actor override changes.
   * @param expectedRevision - Exact current prompt-settings revision.
   * @param actorId - Actor whose private prompt changes.
   * @param prompt - Replacement prompt, or undefined to inherit the storybook.
   * @returns the changed durable Story.
   */
  updateActorPrompt(
    storyId: StoryId,
    expectedRevision: number,
    actorId: string,
    prompt: string | undefined,
  ): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      promptOverrides: updateActorPromptOverride(record.promptOverrides, expectedRevision, actorId, prompt),
    }))
  }

  /**
   * Replace or clear the Story-local private-reasoning language over an exact revision.
   * @param storyId - Story whose reasoning-language instruction changes.
   * @param expectedRevision - Exact current prompt-settings revision.
   * @param language - Replacement language, or undefined to inherit the storybook.
   * @returns the changed durable Story.
   */
  updateReasoningLanguage(
    storyId: StoryId,
    expectedRevision: number,
    language: string | undefined,
  ): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      promptOverrides: updateReasoningLanguageOverride(record.promptOverrides, expectedRevision, language),
    }))
  }

  /**
   * Replace or clear one Story-local policy/tool guidance override.
   * @param storyId - Story whose context-rule override changes.
   * @param expectedRevision - Exact current prompt-settings revision.
   * @param key - Director/Actor policy or capability-rule identity.
   * @param text - Replacement rule text, or undefined to inherit the storybook.
   * @returns the changed durable Story.
   */
  updateContextRule(
    storyId: StoryId,
    expectedRevision: number,
    key: StoryContextRuleKey,
    text: string | undefined,
  ): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      promptOverrides: updateContextRuleOverride(record.promptOverrides, expectedRevision, key, text),
    }))
  }

  /**
   * Replace the safe Director/Actor context recipe over an exact revision.
   * @param storyId - Story whose composition recipe changes.
   * @param expectedRevision - Exact current recipe revision.
   * @param input - Complete Director and Actor section recipes.
   * @returns the changed durable Story.
   */
  updateContextRecipe(
    storyId: StoryId,
    expectedRevision: number,
    input: Pick<StoryContextRecipe, 'director' | 'actor'>,
  ): Promise<Story> {
    return this.update(storyId, record => ({
      ...record,
      contextRecipe: updateStoryContextRecipe(record.contextRecipe, expectedRevision, input),
    }))
  }

  /**
   * Capture the complete tool-mutated Story state before a player scene turn.
   * @param storyId - Story whose runtime state is captured.
   * @returns the validated runtime snapshot.
   */
  runtimeSnapshot(storyId: StoryId): StoryRuntimeSnapshot {
    const story = this.requireEntity(storyId).snapshot()
    return storyRuntimeSnapshotSchema.parse({
      plotLedger: story.plotLedger,
      directorOutline: story.directorOutline,
      world: story.world,
      memory: story.memory,
      discussions: story.discussions,
    })
  }

  /**
   * Restore one previously captured player-turn state while retaining authored settings and Session ownership.
   * @param storyId - Story whose runtime state is restored.
   * @param snapshot - Previously captured runtime snapshot.
   * @returns the changed durable Story.
   */
  restoreRuntime(storyId: StoryId, snapshot: StoryRuntimeSnapshot): Promise<Story> {
    const accepted = storyRuntimeSnapshotSchema.parse(snapshot)
    return this.update(storyId, (record) => {
      const edits = record.world.characters.entries.filter(item => item.origin === 'player' && item.revision > 1)
      const characters = { ...accepted.world.characters,
        entries: accepted.world.characters.entries.map(item =>
          edits.find(edit => edit.definition.actorId === item.definition.actorId) ?? item),
        history: [...accepted.world.characters.history, ...record.world.characters.history.filter(item => item.origin === 'player' && item.revision > 1 && !accepted.world.characters.history.some(old => old.definition.actorId === item.definition.actorId && old.revision === item.revision))] }
      return { ...record, ...accepted, world: { ...accepted.world, characters } }
    })
  }

  /**
   * Attach a Session under one semantic Story role.
   * @param storyId - Owning Story.
   * @param sessionId - Session to attach.
   * @param role - Scene, control, or private Actor role.
   * @param actorId - Required only for the Actor role.
   * @returns the changed Story.
   */
  attachSession(
    storyId: StoryId,
    sessionId: SessionId,
    role: StorySessionRole = 'scene',
    actorId?: string,
  ): Promise<Story> {
    return this.enqueue(async () => {
      const normalizedActorId = normalizeRoleActor(role, actorId)
      const existing = this.owners.get(sessionId)
      if (existing !== undefined) {
        if (existing.storyId === storyId && existing.role === role
          && existing.actorId === normalizedActorId && !existing.archived) {
          return this.requireStory(storyId)
        }
        throw new StorySessionOwnershipError(
          sessionId,
          `Session '${sessionId}' is already registered as ${existing.role} in Story '${existing.storyId}'`,
        )
      }
      const entity = this.requireEntity(storyId)
      const current = entity.snapshot()
      if (role === 'control' && current.sessions.some(item => item.role === 'control' && item.archivedAt === undefined)) {
        throw new StorySessionOwnershipError(sessionId, `Story '${storyId}' already has an active control Session`)
      }
      if (role === 'actor' && current.sessions.some(item => item.role === 'actor'
        && item.actorId === normalizedActorId && item.archivedAt === undefined)) {
        throw new StorySessionOwnershipError(
          sessionId,
          `Story '${storyId}' already has an active Session for Actor '${normalizedActorId}'`,
        )
      }
      const registration: StorySessionRecord = {
        sessionId,
        role,
        ...(normalizedActorId === undefined ? {} : { actorId: normalizedActorId }),
        ...(role === 'actor' ? {
          actorStateRevision: this.ctx.sessions.get(sessionId)?.events.at(-1)?.seq ?? 0,
        } : {}),
        createdAt: new Date().toISOString(),
      }
      const next = await this.requireTable().update(storyId, record => stamp({
        ...record,
        sessions: [registration, ...record.sessions],
        ...(role === 'scene' ? { currentSceneSessionId: sessionId } : {}),
      }))
      entity.replace(next)
      this.owners.set(sessionId, ownerOf(storyId, registration))
      await this.writeManifest(entity)
      return entity
    })
  }

  /**
   * Archive one Story-owned Session without erasing its audit identity.
   * @param sessionId - Registered Session.
   * @returns the changed Story.
   */
  archiveSession(sessionId: SessionId): Promise<Story> {
    return this.enqueue(async () => {
      const owner = this.owners.get(sessionId)
      if (owner === undefined) {
        throw new StorySessionOwnershipError(sessionId, `Session '${sessionId}' is not registered to a Story`)
      }
      if (owner.archived) return this.requireStory(owner.storyId)
      const entity = this.requireEntity(owner.storyId)
      const archivedAt = new Date().toISOString()
      const next = await this.requireTable().update(owner.storyId, (record) => {
        const sessions = record.sessions.map(item => item.sessionId === sessionId
          ? { ...item, archivedAt }
          : item)
        const currentSceneSessionId = record.currentSceneSessionId === sessionId
          ? sessions.find(item => item.role === 'scene' && item.archivedAt === undefined)?.sessionId
          : record.currentSceneSessionId
        return stamp({
          ...record,
          sessions,
          ...(currentSceneSessionId === undefined
            ? { currentSceneSessionId: undefined }
            : { currentSceneSessionId }),
        })
      })
      entity.replace(next)
      const registration = next.sessions.find(item => item.sessionId === sessionId)
      if (registration === undefined) throw new Error(`Story '${owner.storyId}' lost Session '${sessionId}' during archive`)
      this.owners.set(sessionId, ownerOf(owner.storyId, registration))
      await this.writeManifest(entity)
      return entity
    })
  }

  /**
   * Select one active scene as the Story's current scene.
   * @param storyId - Story identity.
   * @param sessionId - Active scene Session.
   * @returns the changed Story.
   */
  setCurrentScene(storyId: StoryId, sessionId: SessionId): Promise<Story> {
    return this.update(storyId, (record) => {
      if (!record.sessions.some(item => item.sessionId === sessionId
        && item.role === 'scene' && item.archivedAt === undefined)) {
        throw new StorySessionOwnershipError(
          sessionId,
          `Session '${sessionId}' is not an active scene in Story '${storyId}'`,
        )
      }
      return record.currentSceneSessionId === sessionId ? record : { ...record, currentSceneSessionId: sessionId }
    })
  }

  /**
   * Archive or restore an entire Story aggregate without deleting any file.
   * @param storyId - Story identity.
   * @param archived - Whether the Story should be archived.
   * @returns the changed Story.
   */
  setArchived(storyId: StoryId, archived: boolean): Promise<Story> {
    return this.update(storyId, record => archived
      ? record.archivedAt === undefined ? { ...record, archivedAt: new Date().toISOString() } : record
      : record.archivedAt === undefined ? record : { ...record, archivedAt: undefined })
  }

  /**
   * Assign the authored-setting identity used to group independent Story runs.
   * @param storyId - Story run to classify.
   * @param templateId - Stable storybook/template identity.
   * @returns the changed Story projection source.
   */
  setTemplateId(storyId: StoryId, templateId: string): Promise<Story> {
    const accepted = normalizeTemplateId(templateId)
    return this.update(storyId, record => record.templateId === accepted
      ? record
      : { ...record, templateId: accepted })
  }

  /**
   * Convert the final runtime Story of a storybook into an authored-settings anchor.
   * Authored files remain available while runtime projections and non-control
   * Session owners are cleared. The creator control Session stays attached so
   * the published creation task remains addressable and independently deletable.
   * @param storyId - Final runtime Story whose identity will retain the storybook.
   * @returns the durable template-only Story record.
   */
  retainAsTemplate(storyId: StoryId): Promise<Story> {
    return this.update(storyId, (record) => {
      const { currentSceneSessionId: _currentSceneSessionId, ...base } = record
      return {
        ...base,
        templateOnly: true,
        sessions: record.sessions.filter(item => item.role === 'control' && item.archivedAt === undefined),
        plotLedger: emptyPlotLedger(),
        directorOutline: emptyDirectorOutline(),
        world: emptyStoryWorld(),
        memory: emptyStoryMemory(),
        discussions: emptyStoryDiscussions(),
        contextRecipe: defaultStoryContextRecipe(),
        promptOverrides: emptyStoryPromptOverrides(),
      }
    })
  }

  /**
   * Delete one Story run from the canonical registry and move its managed files to trash.
   * @param storyId - Story run to delete.
   */
  delete(storyId: StoryId): Promise<void> {
    return this.enqueue(async () => {
      const story = this.requireEntity(storyId)
      const trashEntry = await this.ctx.storyHome.trashStory(storyId)
      try {
        const deleted = await this.requireTable().delete(storyId)
        if (!deleted) throw new StoryNotFoundError(storyId)
      } catch (error) {
        try {
          await this.ctx.storyHome.restoreTrashedStory(storyId, trashEntry)
        } catch (restoreError) {
          throw new AggregateError(
            [error, restoreError],
            `Story '${storyId}' deletion failed and its managed files could not be restored`,
          )
        }
        throw error
      }
      this.entities.delete(storyId)
      for (const registration of story.sessions) this.owners.delete(registration.sessionId)
    })
  }

  /**
   * Move a Story to the top of recency order.
   * @param storyId - Story identity.
   * @returns the changed Story.
   */
  touch(storyId: StoryId): Promise<Story> {
    return this.update(storyId, record => ({ ...record }))
  }

  private update(storyId: StoryId, transform: (record: StoryRecord) => StoryRecord): Promise<Story> {
    return this.enqueue(() => this.updateNow(storyId, transform))
  }

  private async updateNow(storyId: StoryId, transform: (record: StoryRecord) => StoryRecord): Promise<Story> {
    const entity = this.requireEntity(storyId)
    const next = await this.requireTable().update(storyId, current => stamp(transform(current)))
    validateRecord(storyId, next)
    entity.replace(next)
    this.reindexStory(entity)
    await this.writeManifest(entity)
    return entity
  }

  private reindexStory(story: StoryEntity): void {
    for (const [sessionId, owner] of this.owners) {
      if (owner.storyId === story.id) this.owners.delete(sessionId)
    }
    this.indexRecord(story)
  }

  private indexRecord(story: StoryEntity): void {
    validateRecord(story.id, story.snapshot())
    for (const registration of story.snapshot().sessions) {
      const previous = this.owners.get(registration.sessionId)
      if (previous !== undefined) {
        throw new Error(
          `Story domain is inconsistent: Session '${registration.sessionId}' belongs to both `
          + `'${previous.storyId}' and '${story.id}'`,
        )
      }
      this.owners.set(registration.sessionId, ownerOf(story.id, registration))
    }
  }

  private requireStory(storyId: StoryId): Story {
    return this.requireEntity(storyId)
  }

  private requireEntity(storyId: StoryId): StoryEntity {
    const entity = this.entities.get(storyId)
    if (entity === undefined) throw new StoryNotFoundError(storyId)
    return entity
  }

  private requireTable(): KvTable<StoryId, StoryRecord> {
    if (this.table === undefined) throw new Error('Story registry has not initialized')
    return this.table
  }

  private async writeManifest(story: StoryEntity): Promise<void> {
    const record = story.snapshot()
    try {
      await this.ctx.storyHome.writeManifest(story.id, {
        schemaVersion: 10,
        storyId: story.id,
        ...record,
      })
    } catch (error) {
      this.ctx.logger.warn(`Story '${story.id}' manifest refresh failed: ${String(error)}`)
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation)
    this.operationTail = result.then(() => {}, () => {})
    return result
  }

  private observeSessionEvent(session: Session, event: SessionEvent): void {
    const candidate: { readonly type: string; readonly seq: number; readonly data: unknown } = event
    if (!candidate.type.startsWith('actor/')) return
    const owner = this.owners.get(session.id)
    if (owner?.role !== 'actor' || owner.archived || owner.actorId === undefined) return
    const operation = this.enqueue(async () => {
      const currentOwner = this.owners.get(session.id)
      if (currentOwner?.role !== 'actor' || currentOwner.archived || currentOwner.actorId === undefined) return
      const current = this.requireEntity(currentOwner.storyId).snapshot()
      const registration = activeRegistration(current, session.id)
      if (registration === undefined) return
      const advancesActorState = candidate.seq > (registration.actorStateRevision ?? 0)
      const runActor = current.plotLedger.directorRun?.actors.find(actor => actor.actorId === currentOwner.actorId)
      const ownsNpcEvent = runActor?.status === 'running'
        && runActor.attempt?.actorSessionId === session.id
        && candidate.seq > runActor.attempt.afterEventSeq
      const registeredActorId = currentOwner.actorId
      const npcEvents = ownsNpcEvent ? npcBehaviorsFromCommit(candidate).flatMap((behavior) => {
        if (hasNpcEvent(current.plotLedger, session.id, candidate.seq, behavior.operationIndex)) return []
        const accepted = npcEventFromActorTool(session.id, registeredActorId, session.events, behavior, current.plotLedger.revision + 1)
        return accepted === undefined ? [] : [accepted]
      }).map((accepted, index) => ({ ...accepted, ledgerRevision: current.plotLedger.revision + index + 1 })) : []
      if (!advancesActorState && npcEvents.length === 0) return
      await this.updateNow(currentOwner.storyId, record => ({
        ...record,
        world: advancesActorState ? projectActorKnowledge(record.world, registeredActorId, candidate) : record.world,
        sessions: record.sessions.map(item => item.sessionId === session.id
          ? { ...item, actorStateRevision: Math.max(item.actorStateRevision ?? 0, candidate.seq) }
          : item),
        ...(npcEvents.length === 0 ? {} : {
          plotLedger: {
            ...record.plotLedger,
            revision: current.plotLedger.revision + npcEvents.length,
            pendingNpcEvents: [...record.plotLedger.pendingNpcEvents, ...npcEvents],
          },
        }),
      }))
    })
    void operation.catch((error: unknown) => {
      const failure = error instanceof Error
        ? error
        : new Error('Story Plot Ledger capture failed', { cause: error })
      if (!this.ledgerFailures.has(session.id)) this.ledgerFailures.set(session.id, failure)
      this.ctx.logger.warn(
        `Story Plot Ledger failed to capture Session '${session.id}' event ${candidate.seq}: ${String(failure)}`,
      )
    })
  }

  private async flushLedger(session: Session): Promise<void> {
    const owner = this.owners.get(session.id)
    if (owner?.role !== 'actor') return
    await this.operationTail
    const failure = this.ledgerFailures.get(session.id)
    if (failure !== undefined) throw failure
  }
}

function normalizeTitle(title: string): string {
  const accepted = title.trim()
  if (accepted.length === 0) throw new Error('Story title must not be blank')
  if (accepted.length > 160) throw new Error('Story title must be at most 160 characters')
  return accepted
}

function normalizePremise(premise: string): string {
  return premise.trim()
}

function normalizeTemplateId(templateId: string): string {
  const accepted = templateId.trim()
  if (accepted.length === 0) throw new Error('Story templateId must not be blank')
  if (accepted.length > 200) throw new Error('Story templateId must be at most 200 characters')
  return accepted
}

function normalizeRoleActor(role: StorySessionRole, actorId: string | undefined): string | undefined {
  const accepted = actorId?.trim()
  if (role === 'actor') {
    if (accepted === undefined || accepted.length === 0) throw new Error('Actor Session requires actorId')
    if (accepted.length > 160) throw new Error('actorId must be at most 160 characters')
    return accepted
  }
  if (accepted !== undefined && accepted.length > 0) {
    throw new Error(`${role} Session must not carry actorId`)
  }
  return undefined
}

function stamp(record: StoryRecord): StoryRecord {
  return { ...record, updatedAt: new Date().toISOString() }
}

function ownerOf(storyId: StoryId, registration: StorySessionRecord): IndexedOwner {
  return {
    storyId,
    role: registration.role,
    ...(registration.actorId === undefined ? {} : { actorId: registration.actorId }),
    archived: registration.archivedAt !== undefined,
    registration,
  }
}

function activeRegistration(record: StoryRecord, sessionId: SessionId): StorySessionRecord | undefined {
  return record.sessions.find(item => item.sessionId === sessionId && item.archivedAt === undefined)
}

function requireDirectorRegistration(
  record: StoryRecord,
  storyId: StoryId,
  sessionId: SessionId,
): StorySessionRecord {
  const registration = activeRegistration(record, sessionId)
  if (registration === undefined || (registration.role !== 'scene' && registration.role !== 'control')) {
    throw new StoryDirectorError(
      'DIRECTOR_INVALID_SESSION',
      `Session '${sessionId}' is not an active Director Session in Story '${storyId}'`,
    )
  }
  return registration
}

function hasNpcEvent(ledger: PlotLedger, sessionId: SessionId, actorEventSeq: number, operationIndex?: number): boolean {
  const matches = (event: Pick<PlotLedgerNpcEvent, 'sessionId' | 'actorEventSeq' | 'operationIndex'>): boolean =>
    event.sessionId === sessionId && event.actorEventSeq === actorEventSeq && event.operationIndex === operationIndex
  const ref = npcEventRef({ sessionId, actorEventSeq, ...(operationIndex === undefined ? {} : { operationIndex }) })
  return ledger.pendingNpcEvents.some(matches)
    || ledger.latestBrief?.sourceNpcEvents.some(matches) === true
    || ledger.directorRun?.actors.some(actor => actor.eventRefs.includes(ref)) === true
}

function findNpcEvent(ledger: PlotLedger, ref: string): PlotLedgerNpcEvent | undefined {
  const matches = (event: PlotLedgerNpcEvent): boolean =>
    npcEventRef(event) === ref
  return ledger.pendingNpcEvents.find(matches)
    ?? ledger.latestBrief?.sourceNpcEvents.find(matches)
}

function activeActorIds(record: StoryRecord): readonly string[] {
  return record.sessions.flatMap(item => item.role === 'actor' && item.archivedAt === undefined
    && item.actorId !== undefined ? [item.actorId] : [])
}

function requireActiveActor(record: StoryRecord, storyId: StoryId, actorId: string): void {
  if (!activeActorIds(record).includes(actorId)) {
    throw new StoryRoleplayError('UNKNOWN_ACTOR', `Actor '${actorId}' is not active in Story '${storyId}'`)
  }
}

function resolveActorAudience(record: StoryRecord, requested: readonly string[]): readonly string[] {
  const scene = currentStorySceneCast(record.world)
  if (scene === undefined) {
    if (requested.length === 0) return []
    throw new StoryRoleplayError(
      'INVALID_SCENE_STATE',
      'Actor audience delivery requires a staged current scene',
    )
  }
  const audience = requested.length === 0 ? scene.presentActorIds : requested
  const known = new Set(scene.presentActorIds)
  for (const actorId of audience) {
    if (!known.has(actorId)) {
      throw new StoryRoleplayError(
        'INVALID_SCENE_STATE',
        `Audience Actor '${actorId}' is not present in scene '${scene.sceneId}'`,
      )
    }
  }
  return [...new Set(audience)]
}

function requireActorInCurrentScene(record: StoryRecord, actorId: string, operation: string): void {
  const scene = requireCurrentSceneCast(record, operation)
  if (!scene.presentActorIds.includes(actorId)) {
    throw new StoryRoleplayError(
      'INVALID_SCENE_STATE',
      `${operation} Actor '${actorId}' is not present in scene '${scene.sceneId}'`,
    )
  }
}

function requireCurrentSceneCast(record: StoryRecord, operation: string) {
  const scene = currentStorySceneCast(record.world)
  if (scene === undefined) {
    throw new StoryRoleplayError(
      'INVALID_SCENE_STATE',
      `${operation} requires a current scene cast; stage the scene before selecting Actors`,
    )
  }
  return scene
}

function validateOutcomeEventRefs(
  ledger: PlotLedger,
  outcomes: readonly DirectorActorDispatchOutcome[],
): void {
  const run = ledger.directorRun
  if (run === undefined) return
  const pending = new Set(ledger.pendingNpcEvents.map(event =>
    npcEventRef(event)))
  for (const outcome of outcomes) {
    const actor = run.actors.find(item => item.actorId === outcome.actorId)
    if (actor === undefined) continue
    const accepted = new Set(actor.eventRefs)
    for (const ref of outcome.eventRefs) {
      if (accepted.has(ref)) continue
      const attempt = actor.attempt
      const event = ledger.pendingNpcEvents.find(item =>
        npcEventRef(item) === ref)
      if (attempt === undefined || !pending.has(ref) || event?.sessionId !== attempt.actorSessionId
        || event.actorEventSeq <= attempt.afterEventSeq) {
        throw new StoryDirectorError(
          'DIRECTOR_STALE_ATTEMPT',
          `Actor '${outcome.actorId}' event '${ref}' is outside its owned attempt`,
        )
      }
    }
  }
}

function validateRecord(storyId: StoryId, record: StoryRecord): void {
  storyRecord.parse(record)
  const seen = new Set<SessionId>()
  let controls = 0
  const actors = new Set<string>()
  for (const item of record.sessions) {
    storySessionRecord.parse(item)
    if (seen.has(item.sessionId)) {
      throw new Error(`Story '${storyId}' registers Session '${item.sessionId}' more than once`)
    }
    seen.add(item.sessionId)
    normalizeRoleActor(item.role, item.actorId)
    if (item.role !== 'actor' && item.actorStateRevision !== undefined) {
      throw new Error(`Story '${storyId}' non-Actor Session '${item.sessionId}' carries an Actor state revision`)
    }
    if (item.archivedAt !== undefined) continue
    if (item.role === 'control' && ++controls > 1) {
      throw new Error(`Story '${storyId}' has more than one active control Session`)
    }
    if (item.role === 'actor') {
      const actorId = item.actorId as string
      if (actors.has(actorId)) throw new Error(`Story '${storyId}' has duplicate active Actor '${actorId}'`)
      actors.add(actorId)
    }
  }
  if (record.currentSceneSessionId !== undefined
    && !record.sessions.some(item => item.sessionId === record.currentSceneSessionId
      && item.role === 'scene' && item.archivedAt === undefined)) {
    throw new Error(`Story '${storyId}' current scene is not an active scene Session`)
  }
}

export default StoryRegistry

export * from './dynamic-state.ts'

export * from './style.ts'

/** Fold only committed Actor cognition operations; the Actor Session remains the authority. */
function projectActorKnowledge(world: StoryWorldState, actorId: string, event: { type: string; data: unknown }): StoryWorldState {
  const data = event.data as { operations?: { type: string; data: unknown }[] }
  const operations = event.type === 'actor/commit' ? data.operations ?? [] : [event]
  let state = world.characters.knowledge[actorId] ?? emptyKnowledge()
  let changed = false
  for (const operation of operations) {
    if (operation.type === 'actor/knowledge-initialized') {
      const content = operation.data as { actorId: string; state: unknown }
      if (content.actorId !== actorId) throw new Error('Knowledge owner differs from registered Actor')
      state = knowledgeStateSchema.parse(content.state)
      changed = true
    } else if (operation.type === 'actor/knowledge-changed') {
      const content = operation.data as { actorId: string; changes: unknown[]; authority: unknown }
      if (content.actorId !== actorId) throw new Error('Knowledge owner differs from registered Actor')
      state = applyKnowledgeChanges(state, content.changes.map(item => knowledgeChangeSchema.parse(item)),
        knowledgeAuthoritySchema.parse(content.authority))
      changed = true
    }
  }
  return changed ? { ...world, characters: { ...world.characters, knowledge: { ...world.characters.knowledge, [actorId]: state } } } : world
}
