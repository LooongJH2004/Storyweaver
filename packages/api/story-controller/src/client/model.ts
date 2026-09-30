import type { StoryCharacterQuery, StoryCharacterWorkspaceValue, StoryCharacterSaveRequest, StoryKnowledgeUpdateRequest, StoryCharacterCollectRequest } from '../types.ts'
/** React-free Client Story model and command merger. */

import { notifySubscribers } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-api-story-controller/remote'
import type { RemoteFailure, RemoteResult, TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { StoryId } from '@deepseek-ai/dsh-story/types'
import type {
  StoryContextReviewRequest, StoryContextEditRequest, StoryContextPinRequest, StoryContextSourceRequest, StoryContextSourceValue,
  StoryActorStatesValue,
  StoryUpdateActorTurningPointRequest,
  StoryStateUpdateRequest,
  StoryActAsRequest,
  StoryBaseline,
  StorybookAuthoringValue,
  StorybookImportRequest,
  StorybookUpdateRequest,
  StoryPromptSettingsValue,
  StoryPromptUpdateRequest,
  StoryStyleUpdateRequest,
  StoryReasoningLanguageUpdateRequest,
  StoryContextRuleUpdateRequest,
  StoryCreateRequest,
  StoryCreateFromTemplateRequest,
  StoryCreateValue,
  StoryContextPreviewRequest,
  StoryContextPreviewValue,
  StoryRequestContextPreviewRequest,
  StoryRequestContextPreviewValue,
  StoryChooseDirectionRequest,
  StoryCloseDiscussionRequest,
  StoryDirectorOutlineSuggestionRequest,
  StoryDirectorOutlineUpdateRequest,
  StoryDirectorRunActorRequest,
  StoryDirectorRunRequest,
  StoryDeleteRequest,
  StoryDeleteValue,
  StoryInterveneWorldRequest,
  StoryProposeMemoryRequest,
  StoryPackageExportValue,
  StoryPackageImportRequest,
  StoryRecordDiscussionTurnRequest,
  StoryClearDiscussionInterventionRequest,
  StoryRequestDiscussionFloorRequest,
  StoryRequestDiscussionInterventionRequest,
  StoryReviewMemoryRequest,
  StoryUpdateMemoryRequest,
  StorySettleActorWorldEventRequest,
  StorySpeakAsRequest,
  StoryStartDiscussionRequest,
  StorySetPremiseRequest,
  StoryValue,
  StoryView,
  StoryUpdateContextRecipeRequest,
} from '../types.ts'

/** Generated Story Remote namespace. */
export type StoryRemote = TypertClientRemote['story']

/** Client Story list lifecycle. */
export type StoryListPhase = 'loading' | 'ready' | 'error'

/** Stable snapshot exposed to browser UI packages. */
export interface StorySnapshot {
  readonly items: readonly StoryView[]
  readonly phase: StoryListPhase
  readonly error: RemoteFailure | null
}

/** Operations accepted from the reconnecting Story state stream. */
export interface StoryFollowSink {
  replaceBaseline(baseline: StoryBaseline): void
  upsertView(story: StoryView): void
  removeView(storyId: StoryId): void
}

/** Owns path-free Story state and unary/stream race reconciliation. */
export class ClientStoryModel implements StoryFollowSink {
  private items: readonly StoryView[] = []
  private phase: StoryListPhase = 'loading'
  private error: RemoteFailure | null = null
  private readonly listeners = new Set<() => void>()
  private snapshot: StorySnapshot = this.buildSnapshot()

  /** @param remote - Generated Story Remote namespace. */
  constructor(private readonly remote: StoryRemote) {}

  /**
   * Create a Story and merge the authoritative projection immediately.
   * @param input - Initial title and optional premise.
   * @returns the generated Remote result.
   */
  async create(input: StoryCreateRequest): Promise<RemoteResult<StoryCreateValue>> {
    const result = await this.safe(() => this.remote.create(input))
    if (result.ok) this.upsert(result.value.story)
    return result
  }

  /** Create an independent Story run from one authored baseline. */
  async createFromTemplate(
    request: StoryCreateFromTemplateRequest,
  ): Promise<RemoteResult<StoryCreateValue>> {
    const result = await this.safe(() => this.remote.createFromTemplate(request))
    if (result.ok) this.upsert(result.value.story)
    return result
  }

  /** Delete one Story run and remove it from the active Client list. */
  async delete(storyId: StoryId): Promise<RemoteResult<StoryDeleteValue>> {
    const result = await this.safe(() => this.remote.delete({ storyId }))
    if (result.ok) this.removeView(storyId)
    return result
  }

  /** Delete one runtime Story while retaining an empty anchor for its storybook when necessary. */
  async deleteRun(storyId: StoryId): Promise<RemoteResult<StoryDeleteValue>> {
    const request: StoryDeleteRequest = { storyId, preserveTemplate: true }
    const result = await this.safe(() => this.remote.delete(request))
    if (result.ok) {
      if (result.value.retainedTemplate === undefined) this.removeView(storyId)
      else this.upsert(result.value.retainedTemplate)
    }
    return result
  }

  /**
   * Rename one Story.
   * @param storyId - Target Story identity.
   * @param title - New player-facing title.
   * @returns the authoritative Story projection or a classified failure.
   */
  async rename(storyId: StoryId, title: string): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.rename({ storyId, title }))
  }

  /**
   * Replace one Story premise.
   * @param storyId - Target Story identity.
   * @param premise - New premise, or null to clear it.
   * @returns the authoritative Story projection or a classified failure.
   */
  async setPremise(
    storyId: StoryId,
    premise: StorySetPremiseRequest['premise'],
  ): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.setPremise({ storyId, premise }))
  }

  /**
   * Archive one Story and remove it from the active Client list.
   * @param storyId - Target Story identity.
   * @returns the archived Story projection or a classified failure.
   */
  async archive(storyId: StoryId): Promise<RemoteResult<StoryValue>> {
    const result = await this.safe(() => this.remote.archive({ storyId }))
    if (result.ok) this.removeView(storyId)
    return result
  }

  /**
   * Mark one Story as most recently used.
   * @param storyId - Target Story identity.
   * @returns the authoritative Story projection or a classified failure.
   */
  async touch(storyId: StoryId): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.touch({ storyId }))
  }

  /**
   * Read one people page and the selected personal perspective.
   * @param request - Typed Story command and its required revisions.
   * @returns the authoritative result or classified failure.
   */
  async characterWorkspace(request: StoryCharacterQuery): Promise<RemoteResult<StoryCharacterWorkspaceValue>> {
    return this.safe(() => this.remote.characterWorkspace(request))
  }

  /**
   * Save a revisioned instance definition without changing its template.
   * @param request - Typed Story command and its required revisions.
   * @returns the authoritative result or classified failure.
   */
  async saveCharacter(request: StoryCharacterSaveRequest): Promise<RemoteResult<StoryCharacterWorkspaceValue>> {
    return this.safe(() => this.remote.saveCharacter(request))
  }

  /**
   * Append player corrections to personal knowledge.
   * @param request - Typed Story command and its required revisions.
   * @returns the authoritative result or classified failure.
   */
  async updateKnowledge(request: StoryKnowledgeUpdateRequest): Promise<RemoteResult<StoryCharacterWorkspaceValue>> {
    return this.safe(() => this.remote.updateKnowledge(request))
  }

  /**
   * Preview or confirm collection into a base storybook.
   * @param request - Typed Story command and its required revisions.
   * @returns the authoritative result or classified failure.
   */
  async collectCharacter(request: StoryCharacterCollectRequest): Promise<RemoteResult<StorybookAuthoringValue>> {
    return this.safe(() => this.remote.collectCharacter(request))
  }

  /**
   * Read the player's god-view Actor-state projection.
   * @param storyId - Story whose configured and running Actors are read.
   * @returns the Actor-state projection or a classified failure.
   */
  async actorStates(storyId: StoryId): Promise<RemoteResult<StoryActorStatesValue>> {
    return this.safe(() => this.remote.actorStates({ storyId }))
  }

  /**
   * Submit revisioned player state changes.
   * @param request - target Actor or world state and exact field revisions.
   * @returns the updated projection or a classified validation/conflict failure.
   */
  async updateState(request: StoryStateUpdateRequest): Promise<RemoteResult<StoryActorStatesValue>> {
    return this.safe(() => this.remote.updateState(request))
  }

  /** Replace one revisioned Actor turning point. */
  async updateActorTurningPoint(
    request: StoryUpdateActorTurningPointRequest,
  ): Promise<RemoteResult<StoryActorStatesValue>> {
    return this.safe(() => this.remote.updateActorTurningPoint(request))
  }

  /**
   * Read one complete player-editable storybook.
   * @param storyId - Story whose authoring JSON is read.
   * @returns canonical JSON and revision, or a classified failure.
   */
  async storybook(storyId: StoryId): Promise<RemoteResult<StorybookAuthoringValue>> {
    return this.safe(() => this.remote.storybook({ storyId }))
  }

  /** Read effective Director and per-Actor prompt settings. */
  async prompts(storyId: StoryId): Promise<RemoteResult<StoryPromptSettingsValue>> {
    return this.safe(() => this.remote.prompts({ storyId }))
  }

  /**
   * Preview one filtered Storyweaver model context.
   * @param request - Story and Director or selected-Actor audience.
   * @returns ordered visible context sections or a classified failure.
   */
  async contextPreview(request: StoryContextPreviewRequest): Promise<RemoteResult<StoryContextPreviewValue>> {
    return this.safe(() => this.remote.contextPreview(request))
  }

  /** Read the exact request context that produced one Story-owned AI event. */
  async requestContextPreview(
    request: StoryRequestContextPreviewRequest,
  ): Promise<RemoteResult<StoryRequestContextPreviewValue>> {
    return this.safe(() => this.remote.requestContextPreview(request))
  }

  /**
   * Replace one storybook over its exact prior revision.
   * @param request - Story, revision, and complete replacement JSON.
   * @returns canonical saved JSON and revision, or a classified failure.
   */
  async updateStorybook(
    request: StorybookUpdateRequest,
  ): Promise<RemoteResult<StorybookAuthoringValue>> {
    return this.safe(() => this.remote.updateStorybook(request))
  }

  /** Import a standalone Storybook and merge its new template projection immediately. */
  async importStorybook(request: StorybookImportRequest): Promise<RemoteResult<StoryCreateValue>> {
    const result = await this.safe(() => this.remote.importStorybook(request))
    if (result.ok) this.upsert(result.value.story)
    return result
  }

  /**
   * Update one storybook style baseline, Story override, or scene guidance.
   * @param request - recipient, persistence scope, and expected revision.
   * @returns resolved guidance and its source or a classified failure.
   */
  async updateStyle(request: StoryStyleUpdateRequest): Promise<RemoteResult<StoryPromptSettingsValue>> {
    return this.safe(() => this.remote.updateStyle(request))
  }

  /**
   * Update a prompt baseline or run override.
   * @param request - prompt recipient, scope, text, and expected revision.
   * @returns resolved prompts or a classified failure.
   */
  async updatePrompt(request: StoryPromptUpdateRequest): Promise<RemoteResult<StoryPromptSettingsValue>> {
    return this.safe(() => this.remote.updatePrompt(request))
  }

  /** Update the shared reasoning-language baseline or Story-local override. */
  async updateReasoningLanguage(
    request: StoryReasoningLanguageUpdateRequest,
  ): Promise<RemoteResult<StoryPromptSettingsValue>> {
    return this.safe(() => this.remote.updateReasoningLanguage(request))
  }

  /** Update one policy/tool guidance baseline or Story-local override. */
  async updateContextRule(
    request: StoryContextRuleUpdateRequest,
  ): Promise<RemoteResult<StoryPromptSettingsValue>> {
    return this.safe(() => this.remote.updateContextRule(request))
  }

  /**
   * Replace one player-visible Director Outline.
   * @param request - Exact revision and complete player-editable Outline content.
   * @returns the authoritative Story projection or a classified failure.
   */
  async updateDirectorOutline(
    request: StoryDirectorOutlineUpdateRequest,
  ): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.updateDirectorOutline(request))
  }

  /**
   * Accept or reject one queued Director suggestion.
   * @param request - Exact revision, suggestion identity, and player decision.
   * @returns the authoritative Story projection or a classified failure.
   */
  async resolveDirectorOutlineSuggestion(
    request: StoryDirectorOutlineSuggestionRequest,
  ): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.resolveDirectorOutlineSuggestion(request))
  }

  async chooseDirection(request: StoryChooseDirectionRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.chooseDirection(request))
  }

  async interveneWorld(request: StoryInterveneWorldRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.interveneWorld(request))
  }

  async speakAs(request: StorySpeakAsRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.speakAs(request))
  }

  async actAs(request: StoryActAsRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.actAs(request))
  }

  async settleActorWorldEvent(request: StorySettleActorWorldEventRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.settleActorWorldEvent(request))
  }

  async proposeMemory(request: StoryProposeMemoryRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.proposeMemory(request))
  }

  /**
   * Approve or reject complete source-processing units over exact revisions.
   * @param request - Story identity and original references or observed revisions.
   * @returns The typed Remote result; errors preserve revision conflicts.
   */
  async reviewContext(request: StoryContextReviewRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.reviewContext(request))
  }
  /**
   * Edit a pending source-processing unit.
   * @param request - Story identity and original references or observed revisions.
   * @returns The typed Remote result; errors preserve revision conflicts.
   */
  async editContext(request: StoryContextEditRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.editContext(request))
  }
  /**
   * Explicitly retain an original for a reader.
   * @param request - Story identity and original references or observed revisions.
   * @returns The typed Remote result; errors preserve revision conflicts.
   */
  async pinContext(request: StoryContextPinRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.pinContext(request))
  }
  /**
   * Read active original content for player review.
   * @param request - Story identity and original references or observed revisions.
   * @returns The typed Remote result; errors preserve revision conflicts.
   */
  async contextSource(request: StoryContextSourceRequest): Promise<RemoteResult<StoryContextSourceValue>> {
    return this.safe(() => this.remote.contextSource(request))
  }

  async reviewMemory(request: StoryReviewMemoryRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.reviewMemory(request))
  }

  async updateMemory(request: StoryUpdateMemoryRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.updateMemory(request))
  }

  async startDiscussion(request: StoryStartDiscussionRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.startDiscussion(request))
  }

  async requestDiscussionFloor(request: StoryRequestDiscussionFloorRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.requestDiscussionFloor(request))
  }

  /** Pause automatic discussion dispatch for a player intervention. */
  async requestDiscussionIntervention(
    request: StoryRequestDiscussionInterventionRequest,
  ): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.requestDiscussionIntervention(request))
  }

  /** Clear an acknowledged player intervention. */
  async clearDiscussionIntervention(
    request: StoryClearDiscussionInterventionRequest,
  ): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.clearDiscussionIntervention(request))
  }

  async recordDiscussionTurn(request: StoryRecordDiscussionTurnRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.recordDiscussionTurn(request))
  }

  async closeDiscussion(request: StoryCloseDiscussionRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.closeDiscussion(request))
  }

  async updateContextRecipe(request: StoryUpdateContextRecipeRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.updateContextRecipe(request))
  }

  async exportPackage(storyId: StoryId): Promise<RemoteResult<StoryPackageExportValue>> {
    return this.safe(() => this.remote.exportPackage({ storyId }))
  }

  async importPackage(request: StoryPackageImportRequest): Promise<RemoteResult<StoryCreateValue>> {
    const result = await this.safe(() => this.remote.importPackage(request))
    if (result.ok) this.upsert(result.value.story)
    return result
  }

  /**
   * Resume all unfinished Actors in one exact Director Run checkpoint.
   * @param request - Story and exact current Run revision.
   * @returns the authoritative Story projection or a classified failure.
   */
  async resumeDirectorRun(request: StoryDirectorRunRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.resumeDirectorRun(request))
  }

  /**
   * Retry one failed or cancelled Actor in one exact Director Run checkpoint.
   * @param request - Story, exact current Run revision, and Actor identity.
   * @returns the authoritative Story projection or a classified failure.
   */
  async retryDirectorRunActor(request: StoryDirectorRunActorRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.retryDirectorRunActor(request))
  }

  /**
   * Pause one exact Director Run checkpoint.
   * @param request - Story and exact current Run revision.
   * @returns the authoritative Story projection or a classified failure.
   */
  async pauseDirectorRun(request: StoryDirectorRunRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.pauseDirectorRun(request))
  }

  /**
   * Cancel one exact Director Run terminally.
   * @param request - Story and exact current Run revision.
   * @returns the authoritative Story projection or a classified failure.
   */
  async cancelDirectorRun(request: StoryDirectorRunRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.cancelDirectorRun(request))
  }

  /**
   * Skip one incomplete Actor in one exact Director Run checkpoint.
   * @param request - Story, exact current Run revision, and Actor identity.
   * @returns the authoritative Story projection or a classified failure.
   */
  async skipDirectorRunActor(request: StoryDirectorRunActorRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.skipDirectorRunActor(request))
  }

  /**
   * Cancel one active Actor attempt without cancelling its Director Run.
   * @param request - Story, exact current Run revision, and Actor identity.
   * @returns the authoritative Story projection or a classified failure.
   */
  async cancelDirectorRunActor(request: StoryDirectorRunActorRequest): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.cancelDirectorRunActor(request))
  }

  /**
   * Archive one Story-owned Session relation.
   * @param sessionId - Scene, control, or Actor Session identity.
   * @returns the owning Story projection or a classified failure.
   */
  async archiveSession(sessionId: Parameters<StoryRemote['archiveSession']>[0]['sessionId']): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.archiveSession({ sessionId }))
  }

  /**
   * Select the Story scene shown by the conversation surface.
   * @param storyId - Owning Story identity.
   * @param sessionId - Scene Session to select.
   * @returns the authoritative Story projection or a classified failure.
   */
  async selectScene(
    storyId: StoryId,
    sessionId: Parameters<StoryRemote['selectScene']>[0]['sessionId'],
  ): Promise<RemoteResult<StoryValue>> {
    return this.mutation(() => this.remote.selectScene({ storyId, sessionId }))
  }

  replaceBaseline(baseline: StoryBaseline): void {
    this.items = sortStories(baseline.items)
    this.phase = 'ready'
    this.error = null
    this.publish()
  }

  upsertView(story: StoryView): void { this.upsert(story) }

  removeView(storyId: StoryId): void {
    const next = this.items.filter(item => item.storyId !== storyId)
    if (next.length === this.items.length) return
    this.items = next
    this.publish()
  }

  /** Mark state as reconnecting after the transport carrier fails. */
  handleCarrierFailure(): void {
    this.phase = 'loading'
    this.error = null
    this.publish()
  }

  /**
   * Publish a terminal Story stream failure.
   * @param error - Unclassified stream error.
   */
  handleStreamFailure(error: unknown): void {
    this.phase = 'error'
    this.error = failureOf(error)
    this.publish()
  }

  /**
   * Subscribe to immutable Story snapshot changes.
   * @param listener - Callback invoked after each published snapshot.
   * @returns an idempotent unsubscribe callback.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Read state without allocating a replacement snapshot.
   * @returns the current immutable Story snapshot.
   */
  getSnapshot(): StorySnapshot { return this.snapshot }

  private async mutation(operation: () => Promise<RemoteResult<StoryValue>>): Promise<RemoteResult<StoryValue>> {
    const result = await this.safe(operation)
    if (result.ok) this.upsert(result.value.story)
    return result
  }

  private async safe<T>(operation: () => Promise<RemoteResult<T>>): Promise<RemoteResult<T>> {
    try {
      return await operation()
    } catch (error) {
      return { ok: false, error: failureOf(error) }
    }
  }

  private upsert(story: StoryView): void {
    const current = this.items.find(item => item.storyId === story.storyId)
    if (current !== undefined && Date.parse(current.updatedAt) > Date.parse(story.updatedAt)) return
    this.items = sortStories([
      story,
      ...this.items.filter(item => item.storyId !== story.storyId),
    ])
    this.publish()
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot()
    notifySubscribers(this.listeners, '[story-controller]')
  }

  private buildSnapshot(): StorySnapshot {
    return { items: this.items, phase: this.phase, error: this.error }
  }
}

function sortStories(items: readonly StoryView[]): StoryView[] {
  return [...items].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    || String(left.storyId).localeCompare(String(right.storyId)))
}

function failureOf(error: unknown): RemoteFailure {
  return {
    code: 'internal',
    message: error instanceof Error ? error.message : String(error),
    details: {},
  }
}
