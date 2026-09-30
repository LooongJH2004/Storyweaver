import type { StoryCharacterQuery, StoryCharacterWorkspaceValue, StoryCharacterSaveRequest, StoryKnowledgeUpdateRequest, StoryCharacterCollectRequest } from '../types.ts'
/** Client Story service facade. */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { StoryId } from '@deepseek-ai/dsh-story/types'
import type {
  ActorWorldSettlementInput,
  DirectorOutlinePlayerInput,
  PlayerActionInput,
  PlayerDirectionInput,
  PlayerSpeechInput,
  PlayerWorldInterventionInput,
  StoryContextRecipe,
  StoryMemoryProposalInput,
  StoryMemoryUpdateInput,
} from '@deepseek-ai/dsh-story/types'
import type { RemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import type {
  StoryContextReviewRequest, StoryContextEditRequest, StoryContextPinRequest, StoryContextSourceRequest, StoryContextSourceValue,
  StoryActorStateView,
  StoryUpdateActorTurningPointRequest,
  StoryStateUpdateRequest,
  StorybookAuthoringValue,
  StoryPromptSettingsValue,
  StoryPromptUpdateRequest,
  StoryStyleUpdateRequest,
  StoryReasoningLanguageUpdateRequest,
  StoryContextRuleUpdateRequest,
  StoryContextPreviewValue,
  StoryRequestContextPreviewValue,
  StoryPackageExportValue,
  StoryView,
} from '../types.ts'
import type { ClientStoryModel, StorySnapshot } from './model.ts'

/** Bare observable Story snapshot. */
export interface StorySource {
  getSnapshot(): StorySnapshot
  subscribe(listener: () => void): () => void
}

/** Client Story commands and projection. */
export interface IStories {
  readonly list: StorySource
  create(input?: { readonly title?: string; readonly premise?: string }): Promise<StoryView>
  createFromTemplate(sourceStoryId: StoryId): Promise<StoryView>
  deleteRun(storyId: StoryId): Promise<void>
  delete(storyId: StoryId): Promise<void>
  rename(storyId: StoryId, title: string): Promise<StoryView>
  setPremise(storyId: StoryId, premise: string): Promise<StoryView>
  archive(storyId: StoryId): Promise<void>
  touch(storyId: StoryId): Promise<StoryView>
  archiveSession(sessionId: SessionId): Promise<StoryView>
  selectScene(storyId: StoryId, sessionId: SessionId): Promise<StoryView>
  characterWorkspace(request: StoryCharacterQuery): Promise<StoryCharacterWorkspaceValue>
  saveCharacter(request: StoryCharacterSaveRequest): Promise<StoryCharacterWorkspaceValue>
  updateKnowledge(request: StoryKnowledgeUpdateRequest): Promise<StoryCharacterWorkspaceValue>
  collectCharacter(request: StoryCharacterCollectRequest): Promise<StorybookAuthoringValue>
  actorStates(storyId: StoryId): Promise<readonly StoryActorStateView[]>
  updateState(request: StoryStateUpdateRequest): Promise<readonly StoryActorStateView[]>
  updateActorTurningPoint(request: StoryUpdateActorTurningPointRequest): Promise<readonly StoryActorStateView[]>
  storybook(storyId: StoryId): Promise<StorybookAuthoringValue>
  prompts(storyId: StoryId): Promise<StoryPromptSettingsValue>
  contextPreview(storyId: StoryId, audience: 'director' | 'actor', actorId?: string): Promise<StoryContextPreviewValue>
  requestContextPreview(
    storyId: StoryId,
    sessionId: SessionId,
    beforeEventSeq: number,
  ): Promise<StoryRequestContextPreviewValue>
  updateStorybook(
    storyId: StoryId,
    expectedRevision: string,
    storybookJson: string,
  ): Promise<StorybookAuthoringValue>
  importStorybook(storybookJson: string): Promise<StoryView>
  updateStyle(request: StoryStyleUpdateRequest): Promise<StoryPromptSettingsValue>
  updatePrompt(request: StoryPromptUpdateRequest): Promise<StoryPromptSettingsValue>
  updateReasoningLanguage(request: StoryReasoningLanguageUpdateRequest): Promise<StoryPromptSettingsValue>
  updateContextRule(request: StoryContextRuleUpdateRequest): Promise<StoryPromptSettingsValue>
  updateDirectorOutline(
    storyId: StoryId,
    expectedRevision: number,
    outline: DirectorOutlinePlayerInput,
    reason: string,
  ): Promise<StoryView>
  resolveDirectorOutlineSuggestion(
    storyId: StoryId,
    expectedRevision: number,
    suggestionId: string,
    accept: boolean,
  ): Promise<StoryView>
  chooseDirection(storyId: StoryId, input: PlayerDirectionInput): Promise<StoryView>
  interveneWorld(storyId: StoryId, input: PlayerWorldInterventionInput): Promise<StoryView>
  speakAs(storyId: StoryId, input: PlayerSpeechInput): Promise<StoryView>
  actAs(storyId: StoryId, input: PlayerActionInput): Promise<StoryView>
  settleActorWorldEvent(storyId: StoryId, input: ActorWorldSettlementInput): Promise<StoryView>
  proposeMemory(storyId: StoryId, input: StoryMemoryProposalInput): Promise<StoryView>
  reviewContext(request: StoryContextReviewRequest): Promise<StoryView>
  editContext(request: StoryContextEditRequest): Promise<StoryView>
  pinContext(request: StoryContextPinRequest): Promise<StoryView>
  contextSource(request: StoryContextSourceRequest): Promise<StoryContextSourceValue>
  reviewMemory(storyId: StoryId, expectedRevision: number, memoryId: string, approve: boolean): Promise<StoryView>
  updateMemory(storyId: StoryId, input: StoryMemoryUpdateInput): Promise<StoryView>
  startDiscussion(
    storyId: StoryId,
    expectedRevision: number,
    topic: string,
    participantIds: readonly string[],
    maxRounds: number,
  ): Promise<StoryView>
  requestDiscussionFloor(
    storyId: StoryId,
    expectedRevision: number,
    discussionId: string,
    actorId: string,
  ): Promise<StoryView>
  requestDiscussionIntervention(
    storyId: StoryId,
    expectedRevision: number,
    discussionId: string,
    intervention: 'speak' | 'conclude',
  ): Promise<StoryView>
  clearDiscussionIntervention(
    storyId: StoryId,
    expectedRevision: number,
    discussionId: string,
  ): Promise<StoryView>
  recordDiscussionTurn(
    storyId: StoryId,
    expectedRevision: number,
    discussionId: string,
    speakerId: string,
    text: string,
    sourceEventRef?: string,
  ): Promise<StoryView>
  closeDiscussion(
    storyId: StoryId,
    expectedRevision: number,
    discussionId: string,
    status: 'completed' | 'cancelled',
  ): Promise<StoryView>
  updateContextRecipe(
    storyId: StoryId,
    expectedRevision: number,
    director: StoryContextRecipe['director'],
    actor: StoryContextRecipe['actor'],
  ): Promise<StoryView>
  exportPackage(storyId: StoryId): Promise<StoryPackageExportValue>
  importPackage(packageJson: string): Promise<StoryView>
  resumeDirectorRun(storyId: StoryId, expectedRunRevision: number): Promise<StoryView>
  retryDirectorRunActor(storyId: StoryId, expectedRunRevision: number, actorId: string): Promise<StoryView>
  pauseDirectorRun(storyId: StoryId, expectedRunRevision: number): Promise<StoryView>
  cancelDirectorRun(storyId: StoryId, expectedRunRevision: number): Promise<StoryView>
  skipDirectorRunActor(storyId: StoryId, expectedRunRevision: number, actorId: string): Promise<StoryView>
  cancelDirectorRunActor(storyId: StoryId, expectedRunRevision: number, actorId: string): Promise<StoryView>
}

/** Owns the Client-facing Story service. */
export class StoryController extends Service implements IStories {
  readonly list: StorySource

  /** @param ctx - Client root context. @param model - Remote-backed Story model. */
  constructor(ctx: Context, private readonly model: ClientStoryModel) {
    super(ctx, 'stories')
    this.list = model
  }

  async create(input: { readonly title?: string; readonly premise?: string } = {}): Promise<StoryView> {
    const result = await this.model.create(input)
    if (!result.ok) throw commandError('create', result.error)
    return result.value.story
  }

  async createFromTemplate(sourceStoryId: StoryId): Promise<StoryView> {
    const result = await this.model.createFromTemplate({ sourceStoryId })
    if (!result.ok) throw commandError('template start', result.error)
    return result.value.story
  }

  async delete(storyId: StoryId): Promise<void> {
    const result = await this.model.delete(storyId)
    if (!result.ok) throw commandError('delete', result.error)
  }

  async deleteRun(storyId: StoryId): Promise<void> {
    const result = await this.model.deleteRun(storyId)
    if (!result.ok) throw commandError('run delete', result.error)
  }

  async rename(storyId: StoryId, title: string): Promise<StoryView> {
    const result = await this.model.rename(storyId, title)
    if (!result.ok) throw commandError('rename', result.error)
    return result.value.story
  }

  async setPremise(storyId: StoryId, premise: string): Promise<StoryView> {
    const result = await this.model.setPremise(storyId, premise)
    if (!result.ok) throw commandError('premise update', result.error)
    return result.value.story
  }

  async archive(storyId: StoryId): Promise<void> {
    const result = await this.model.archive(storyId)
    if (!result.ok) throw commandError('archive', result.error)
  }

  async touch(storyId: StoryId): Promise<StoryView> {
    const result = await this.model.touch(storyId)
    if (!result.ok) throw commandError('touch', result.error)
    return result.value.story
  }

  async archiveSession(sessionId: SessionId): Promise<StoryView> {
    const result = await this.model.archiveSession(sessionId)
    if (!result.ok) throw commandError('scene archive', result.error)
    return result.value.story
  }

  async selectScene(storyId: StoryId, sessionId: SessionId): Promise<StoryView> {
    const result = await this.model.selectScene(storyId, sessionId)
    if (!result.ok) throw commandError('scene selection', result.error)
    return result.value.story
  }

  async characterWorkspace(request: StoryCharacterQuery): Promise<StoryCharacterWorkspaceValue> {
    const result = await this.model.characterWorkspace(request)
    if (!result.ok) throw commandError('characterWorkspace', result.error)
    return result.value
  }

  async saveCharacter(request: StoryCharacterSaveRequest): Promise<StoryCharacterWorkspaceValue> {
    const result = await this.model.saveCharacter(request)
    if (!result.ok) throw commandError('saveCharacter', result.error)
    return result.value
  }

  async updateKnowledge(request: StoryKnowledgeUpdateRequest): Promise<StoryCharacterWorkspaceValue> {
    const result = await this.model.updateKnowledge(request)
    if (!result.ok) throw commandError('updateKnowledge', result.error)
    return result.value
  }

  async collectCharacter(request: StoryCharacterCollectRequest): Promise<StorybookAuthoringValue> {
    const result = await this.model.collectCharacter(request)
    if (!result.ok) throw commandError('collectCharacter', result.error)
    return result.value
  }

  async actorStates(storyId: StoryId): Promise<readonly StoryActorStateView[]> {
    const result = await this.model.actorStates(storyId)
    if (!result.ok) throw commandError('character state', result.error)
    return result.value.actors
  }

  async updateState(request: StoryStateUpdateRequest): Promise<readonly StoryActorStateView[]> {
    const result = await this.model.updateState(request)
    if (!result.ok) throw commandError('state update', result.error)
    return result.value.actors
  }

  async updateActorTurningPoint(
    request: StoryUpdateActorTurningPointRequest,
  ): Promise<readonly StoryActorStateView[]> {
    const result = await this.model.updateActorTurningPoint(request)
    if (!result.ok) throw commandError('character turning point update', result.error)
    return result.value.actors
  }

  async storybook(storyId: StoryId): Promise<StorybookAuthoringValue> {
    const result = await this.model.storybook(storyId)
    if (!result.ok) throw commandError('storybook read', result.error)
    return result.value
  }

  async prompts(storyId: StoryId): Promise<StoryPromptSettingsValue> {
    const result = await this.model.prompts(storyId)
    if (!result.ok) throw commandError('prompt settings read', result.error)
    return result.value
  }

  async contextPreview(
    storyId: StoryId,
    audience: 'director' | 'actor',
    actorId?: string,
  ): Promise<StoryContextPreviewValue> {
    const result = await this.model.contextPreview({ storyId, audience, ...(actorId === undefined ? {} : { actorId }) })
    if (!result.ok) throw commandError('context preview', result.error)
    return result.value
  }

  async requestContextPreview(
    storyId: StoryId,
    sessionId: SessionId,
    beforeEventSeq: number,
  ): Promise<StoryRequestContextPreviewValue> {
    const result = await this.model.requestContextPreview({ storyId, sessionId, beforeEventSeq })
    if (!result.ok) throw commandError('request context preview', result.error)
    return result.value
  }

  async updateStorybook(
    storyId: StoryId,
    expectedRevision: string,
    storybookJson: string,
  ): Promise<StorybookAuthoringValue> {
    const result = await this.model.updateStorybook({ storyId, expectedRevision, storybookJson })
    if (!result.ok) throw commandError('storybook update', result.error)
    return result.value
  }

  async importStorybook(storybookJson: string): Promise<StoryView> {
    const result = await this.model.importStorybook({ storybookJson })
    if (!result.ok) throw commandError('storybook import', result.error)
    return result.value.story
  }

  async updateStyle(request: StoryStyleUpdateRequest): Promise<StoryPromptSettingsValue> {
    const result = await this.model.updateStyle(request)
    if (!result.ok) throw commandError('style update', result.error)
    return result.value
  }

  async updatePrompt(request: StoryPromptUpdateRequest): Promise<StoryPromptSettingsValue> {
    const result = await this.model.updatePrompt(request)
    if (!result.ok) throw commandError('prompt update', result.error)
    return result.value
  }

  async updateReasoningLanguage(
    request: StoryReasoningLanguageUpdateRequest,
  ): Promise<StoryPromptSettingsValue> {
    const result = await this.model.updateReasoningLanguage(request)
    if (!result.ok) throw commandError('reasoning language update', result.error)
    return result.value
  }

  async updateContextRule(request: StoryContextRuleUpdateRequest): Promise<StoryPromptSettingsValue> {
    const result = await this.model.updateContextRule(request)
    if (!result.ok) throw commandError('context rule update', result.error)
    return result.value
  }

  async updateDirectorOutline(
    storyId: StoryId,
    expectedRevision: number,
    outline: DirectorOutlinePlayerInput,
    reason: string,
  ): Promise<StoryView> {
    const result = await this.model.updateDirectorOutline({ storyId, expectedRevision, outline, reason })
    if (!result.ok) throw commandError('Director Outline update', result.error)
    return result.value.story
  }

  async resolveDirectorOutlineSuggestion(
    storyId: StoryId,
    expectedRevision: number,
    suggestionId: string,
    accept: boolean,
  ): Promise<StoryView> {
    const result = await this.model.resolveDirectorOutlineSuggestion({
      storyId,
      expectedRevision,
      suggestionId,
      accept,
    })
    if (!result.ok) throw commandError('Director Outline suggestion', result.error)
    return result.value.story
  }

  async chooseDirection(storyId: StoryId, input: PlayerDirectionInput): Promise<StoryView> {
    const result = await this.model.chooseDirection({ storyId, input })
    if (!result.ok) throw commandError('direction', result.error)
    return result.value.story
  }

  async interveneWorld(storyId: StoryId, input: PlayerWorldInterventionInput): Promise<StoryView> {
    const result = await this.model.interveneWorld({ storyId, input })
    if (!result.ok) throw commandError('world intervention', result.error)
    return result.value.story
  }

  async speakAs(storyId: StoryId, input: PlayerSpeechInput): Promise<StoryView> {
    const result = await this.model.speakAs({ storyId, input })
    if (!result.ok) throw commandError('embodied speech', result.error)
    return result.value.story
  }

  async actAs(storyId: StoryId, input: PlayerActionInput): Promise<StoryView> {
    const result = await this.model.actAs({ storyId, input })
    if (!result.ok) throw commandError('embodied action', result.error)
    return result.value.story
  }

  async settleActorWorldEvent(storyId: StoryId, input: ActorWorldSettlementInput): Promise<StoryView> {
    const result = await this.model.settleActorWorldEvent({ storyId, input })
    if (!result.ok) throw commandError('Actor world settlement', result.error)
    return result.value.story
  }

  async proposeMemory(storyId: StoryId, input: StoryMemoryProposalInput): Promise<StoryView> {
    const result = await this.model.proposeMemory({ storyId, input })
    if (!result.ok) throw commandError('memory proposal', result.error)
    return result.value.story
  }

  /** Approve or reject complete units. */
  async reviewContext(request: StoryContextReviewRequest): Promise<StoryView> {
    const result = await this.model.reviewContext(request)
    if (!result.ok) throw new Error(result.error.message)
    return result.value.story
  }
  /** Edit a pending proposal. */
  async editContext(request: StoryContextEditRequest): Promise<StoryView> {
    const result = await this.model.editContext(request)
    if (!result.ok) throw new Error(result.error.message)
    return result.value.story
  }
  /** Pin one original for a viewer. */
  async pinContext(request: StoryContextPinRequest): Promise<StoryView> {
    const result = await this.model.pinContext(request)
    if (!result.ok) throw new Error(result.error.message)
    return result.value.story
  }
  /** Inspect the original associated with a review unit. */
  async contextSource(request: StoryContextSourceRequest): Promise<StoryContextSourceValue> {
    const result = await this.model.contextSource(request)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  async reviewMemory(storyId: StoryId, expectedRevision: number, memoryId: string, approve: boolean): Promise<StoryView> {
    const result = await this.model.reviewMemory({ storyId, expectedRevision, memoryId, approve })
    if (!result.ok) throw commandError('memory review', result.error)
    return result.value.story
  }

  async updateMemory(storyId: StoryId, input: StoryMemoryUpdateInput): Promise<StoryView> {
    const result = await this.model.updateMemory({ storyId, input })
    if (!result.ok) throw commandError('memory update', result.error)
    return result.value.story
  }

  async startDiscussion(
    storyId: StoryId,
    expectedRevision: number,
    topic: string,
    participantIds: readonly string[],
    maxRounds: number,
  ): Promise<StoryView> {
    const result = await this.model.startDiscussion({ storyId, expectedRevision, topic, participantIds, maxRounds })
    if (!result.ok) throw commandError('discussion start', result.error)
    return result.value.story
  }

  async requestDiscussionFloor(
    storyId: StoryId,
    expectedRevision: number,
    discussionId: string,
    actorId: string,
  ): Promise<StoryView> {
    const result = await this.model.requestDiscussionFloor({ storyId, expectedRevision, discussionId, actorId })
    if (!result.ok) throw commandError('discussion floor request', result.error)
    return result.value.story
  }

  async requestDiscussionIntervention(
    storyId: StoryId,
    expectedRevision: number,
    discussionId: string,
    intervention: 'speak' | 'conclude',
  ): Promise<StoryView> {
    const result = await this.model.requestDiscussionIntervention({
      storyId,
      expectedRevision,
      discussionId,
      intervention,
    })
    if (!result.ok) throw commandError('discussion intervention', result.error)
    return result.value.story
  }

  async clearDiscussionIntervention(
    storyId: StoryId,
    expectedRevision: number,
    discussionId: string,
  ): Promise<StoryView> {
    const result = await this.model.clearDiscussionIntervention({ storyId, expectedRevision, discussionId })
    if (!result.ok) throw commandError('discussion resume', result.error)
    return result.value.story
  }

  async recordDiscussionTurn(
    storyId: StoryId,
    expectedRevision: number,
    discussionId: string,
    speakerId: string,
    text: string,
    sourceEventRef?: string,
  ): Promise<StoryView> {
    const result = await this.model.recordDiscussionTurn({
      storyId,
      expectedRevision,
      discussionId,
      speakerId,
      text,
      ...(sourceEventRef === undefined ? {} : { sourceEventRef }),
    })
    if (!result.ok) throw commandError('discussion turn', result.error)
    return result.value.story
  }

  async closeDiscussion(
    storyId: StoryId,
    expectedRevision: number,
    discussionId: string,
    status: 'completed' | 'cancelled',
  ): Promise<StoryView> {
    const result = await this.model.closeDiscussion({ storyId, expectedRevision, discussionId, status })
    if (!result.ok) throw commandError('discussion close', result.error)
    return result.value.story
  }

  async updateContextRecipe(
    storyId: StoryId,
    expectedRevision: number,
    director: StoryContextRecipe['director'],
    actor: StoryContextRecipe['actor'],
  ): Promise<StoryView> {
    const result = await this.model.updateContextRecipe({ storyId, expectedRevision, director, actor })
    if (!result.ok) throw commandError('context recipe update', result.error)
    return result.value.story
  }

  async exportPackage(storyId: StoryId): Promise<StoryPackageExportValue> {
    const result = await this.model.exportPackage(storyId)
    if (!result.ok) throw commandError('package export', result.error)
    return result.value
  }

  async importPackage(packageJson: string): Promise<StoryView> {
    const result = await this.model.importPackage({ packageJson })
    if (!result.ok) throw commandError('package import', result.error)
    return result.value.story
  }

  async resumeDirectorRun(storyId: StoryId, expectedRunRevision: number): Promise<StoryView> {
    const result = await this.model.resumeDirectorRun({ storyId, expectedRunRevision })
    if (!result.ok) throw commandError('Director Run resume', result.error)
    return result.value.story
  }

  async retryDirectorRunActor(
    storyId: StoryId,
    expectedRunRevision: number,
    actorId: string,
  ): Promise<StoryView> {
    const result = await this.model.retryDirectorRunActor({ storyId, expectedRunRevision, actorId })
    if (!result.ok) throw commandError('Director Actor retry', result.error)
    return result.value.story
  }

  async pauseDirectorRun(storyId: StoryId, expectedRunRevision: number): Promise<StoryView> {
    const result = await this.model.pauseDirectorRun({ storyId, expectedRunRevision })
    if (!result.ok) throw commandError('Director Run pause', result.error)
    return result.value.story
  }

  async cancelDirectorRun(storyId: StoryId, expectedRunRevision: number): Promise<StoryView> {
    const result = await this.model.cancelDirectorRun({ storyId, expectedRunRevision })
    if (!result.ok) throw commandError('Director Run cancellation', result.error)
    return result.value.story
  }

  async skipDirectorRunActor(
    storyId: StoryId,
    expectedRunRevision: number,
    actorId: string,
  ): Promise<StoryView> {
    const result = await this.model.skipDirectorRunActor({ storyId, expectedRunRevision, actorId })
    if (!result.ok) throw commandError('Director Actor skip', result.error)
    return result.value.story
  }

  async cancelDirectorRunActor(
    storyId: StoryId,
    expectedRunRevision: number,
    actorId: string,
  ): Promise<StoryView> {
    const result = await this.model.cancelDirectorRunActor({ storyId, expectedRunRevision, actorId })
    if (!result.ok) throw commandError('Director Actor cancellation', result.error)
    return result.value.story
  }
}

function commandError(operation: string, error: RemoteFailure): Error {
  return new Error(`Story ${operation} failed: ${error.code}: ${error.message}`)
}
