import { randomUUID } from 'node:crypto'
import z from '@deepseek-ai/schemastery'
import { emptyKnowledge, encounterLabel, storybookActorDefinitionSchema, initializeStoryCharacters, emptyStoryCharacters, knowledgeChangeSchema } from '@deepseek-ai/dsh-story'
import type { StoryCharacterQuery, StoryCharacterWorkspaceValue, StoryCharacterSaveRequest, StoryKnowledgeUpdateRequest, StoryCharacterCollectRequest } from './types.ts'
/** Host Story Remote owner: path-free commands and reconnect-safe state. */

import { mkdir, writeFile } from 'node:fs/promises'
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-story-home'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-experimental-actor/request-history'
import { Session, SessionId, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteFailure, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  readContextSource, currentStorySceneCast, styleProfileSchema,
  DEFAULT_STORY_CREATOR_PROMPT,
  DEFAULT_STORYBOOK_CONTEXT_RULES,
  DEFAULT_STORYBOOK_REASONING_LANGUAGE,
  parseStorybookDocument,
  StoryDirectorError,
  StoryNotFoundError,
  StoryOutlineError,
  StoryRoleplayError,
  StorySessionOwnershipError,
} from '@deepseek-ai/dsh-story'
import type { Story, StorybookDocument, StoryContextRuleKey } from '@deepseek-ai/dsh-story'
import { presentStoryContextPreview } from './context-preview.ts'
import { StoryFeed, storyView } from './feed.ts'
import {
  readStorybookAuthoring,
  StorybookRevisionError,
  writeStorybookAuthoring,
} from './storybook-authoring.ts'
import { loadStorybookActorStates, mergeStoryActorState } from './storybook-state.ts'
import { exportStoryPackage, prepareStoryPackageImport, writeStoryPackageFiles } from './story-package.ts'
import type {
  StoryContextReviewRequest, StoryContextEditRequest, StoryContextPinRequest, StoryContextSourceRequest, StoryContextSourceValue,
  StoryActorStateView,
  StoryActAsRequest,
  StoryActorStatesValue,
  StoryUpdateActorTurningPointRequest,
  StoryStateUpdateRequest,
  StorybookAuthoringValue,
  StorybookImportRequest,
  StorybookUpdateRequest,
  StoryPromptSettingsValue,
  StoryPromptUpdateRequest,
  StoryStyleUpdateRequest,
  StoryContextRuleUpdateRequest,
  StoryReasoningLanguageUpdateRequest,
  StoryCreateFromTemplateRequest,
  StoryCreateRequest,
  StoryCreateValue,
  StoryContextPreviewRequest,
  StoryContextPreviewValue,
  StoryRequestContextPreviewRequest,
  StoryRequestContextPreviewValue,
  StoryChooseDirectionRequest,
  StoryDirectorBriefRequest,
  StoryDirectorRunActorRequest,
  StoryDirectorRunRequest,
  StoryDirectorOutlineSuggestionRequest,
  StoryDirectorOutlineUpdateRequest,
  StoryDeleteRequest,
  StoryDeleteValue,
  StoryFollowFrame,
  StoryInterveneWorldRequest,
  StoryCloseDiscussionRequest,
  StoryProposeMemoryRequest,
  StoryPackageExportValue,
  StoryPackageImportRequest,
  StoryRecordDiscussionTurnRequest,
  StoryClearDiscussionInterventionRequest,
  StoryRequestDiscussionFloorRequest,
  StoryRequestDiscussionInterventionRequest,
  StoryReviewMemoryRequest,
  StoryUpdateMemoryRequest,
  StoryRenameRequest,
  StoryRequest,
  StorySelectSceneRequest,
  StorySettleActorWorldEventRequest,
  StorySessionRequest,
  StorySetPremiseRequest,
  StorySpeakAsRequest,
  StoryStartDiscussionRequest,
  StoryUpdateContextRecipeRequest,
  StoryValue,
} from './types.ts'

export type * from './types.ts'
export { storyView } from './feed.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host Story business API and Remote namespace owner. */
    storyController: StoryController
  }
}

/** Character browser deployment settings. */
export interface Config {
  /** Maximum visible people returned per browser query. */
  readonly characterPageSize?: number
}

/** Host service backing the generated `ctx.remote.story` namespace. */
export class StoryController extends TypertRemoteService {
  static inject = ['typert', 'storyRegistry', 'storyHome', 'sessions']
  static Config: z<Config> = z.object({ characterPageSize: z.number().step(1).min(1).default(40) })
  private readonly characterPageSize: number

  private readonly feed: StoryFeed
  private readonly storybookWrites = new Map<string, Promise<void>>()

  /** @param ctx - Host context containing the canonical Story registry. */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'storyController', { namespace: 'story' })
    this.characterPageSize = config.characterPageSize ?? 40
    if (!Number.isSafeInteger(this.characterPageSize) || this.characterPageSize < 1) throw new Error('characterPageSize must be a positive integer')
    this.feed = new StoryFeed(ctx)
  }

  /**
   * Create an empty Story with no historical import.
   * @param request - Initial title and optional premise.
   * @returns the newly created Story projection.
   */
  @Remote('create')
  async create(request: StoryCreateRequest): Promise<StoryCreateValue> {
    try {
      const story = await this.ctx.storyRegistry.create(request.title, request.premise)
      return { story: storyView(story) }
    } catch (error) {
      throw failure('story-create-failed', error, {})
    }
  }

  /**
   * Create a completely independent Story run from authored baseline material.
   * Runtime world state, memory, planning, Actors, and Sessions are reset.
   * @param request - Existing Story whose storybook and authored files are reused.
   * @returns the fresh Story projection before its first scene is created.
   */
  @Remote('createFromTemplate')
  async createFromTemplate(request: StoryCreateFromTemplateRequest): Promise<StoryCreateValue> {
    const source = this.ctx.storyRegistry.get(request.sourceStoryId)
    if (source === undefined) {
      throw failure('story-not-found', new Error('Story not found'), { storyId: request.sourceStoryId })
    }
    let templateId = source.templateId
    try {
      const authoring = await readStorybookAuthoring(
        this.ctx.storyHome.storyPath(source.id, 'world', 'storybook.json'),
        fallbackStorybook(source),
      )
      if (authoring.exists) {
        templateId = parseStorybookDocument(JSON.parse(authoring.storybookJson) as unknown).id
      }
      await this.ctx.storyRegistry.setTemplateId(source.id, templateId)
      const story = await this.ctx.storyRegistry.create(source.title, source.premise, templateId)
      try {
        await this.ctx.storyHome.copyBaseline(source.id, story.id)
        if (authoring.exists) {
          await this.ctx.storyRegistry.initializeCharacters(story.id, parseStorybookDocument(JSON.parse(authoring.storybookJson)))
        }
      } catch (error) {
        await this.ctx.storyRegistry.delete(story.id)
        throw error
      }
      return { story: storyView(story) }
    } catch (error) {
      throw failure('story-template-create-failed', error, { storyId: request.sourceStoryId })
    }
  }

  /**
   * Import one standalone version-6 Storybook as a new library template.
   * The complete document is validated before mutation; a failed durable write
   * removes the provisional aggregate instead of leaving an empty story behind.
   * @param request - Serialized standalone Storybook JSON.
   * @returns the newly imported authored-settings template.
   */
  @Remote('importStorybook')
  async importStorybook(request: StorybookImportRequest): Promise<StoryCreateValue> {
    let document: StorybookDocument
    try {
      document = parseStorybookDocument(JSON.parse(request.storybookJson) as unknown)
    } catch (error: unknown) {
      throw failure('storybook-import-failed', error, {})
    }
    const existing = this.ctx.storyRegistry.list().find(item => item.templateOnly && item.templateId === document.id)
    if (existing !== undefined) {
      throw failure('storybook-import-conflict', new Error(`Storybook '${document.id}' already exists`), {
        storyId: existing.id,
        templateId: document.id,
      })
    }
    let story: Story | undefined
    try {
      const created = await this.ctx.storyRegistry.create(document.title, document.premise, document.id)
      story = created
      await this.ctx.storyHome.ensureStory(created.id)
      await this.serializeStorybook(String(created.id), async () => {
        const fallback = fallbackStorybook(created)
        const current = await readStorybookAuthoring(
          this.ctx.storyHome.storyPath(created.id, 'world', 'storybook.json'),
          fallback,
        )
        await writeStorybookAuthoring(
          this.ctx.storyHome.storyPath(created.id, 'world', 'storybook.json'),
          fallback,
          current.revision,
          JSON.stringify(document, undefined, 2),
        )
      })
      const retained = await this.ctx.storyRegistry.retainAsTemplate(created.id)
      return { story: storyView(retained) }
    } catch (error: unknown) {
      if (story !== undefined) await this.ctx.storyRegistry.delete(story.id).catch(() => undefined)
      throw failure('storybook-import-failed', error, {})
    }
  }

  /**
   * Delete one Story run from the active registry and move its managed aggregate to trash.
   * @param request - Story run identity.
   * @returns the deleted identity for client reconciliation.
   */
  @Remote('delete')
  async delete(request: StoryDeleteRequest): Promise<StoryDeleteValue> {
    const source = this.ctx.storyRegistry.get(request.storyId)
    if (source === undefined) {
      throw failure('story-not-found', new Error('Story not found'), { storyId: request.storyId })
    }
    try {
      if (request.preserveTemplate === true) {
        const hasSibling = this.ctx.storyRegistry.list().some(story => (
          story.id !== source.id && story.templateId === source.templateId
        ))
        if (!hasSibling) {
          const retained = await this.ctx.storyRegistry.retainAsTemplate(source.id)
          return { storyId: request.storyId, retainedTemplate: storyView(retained) }
        }
      }
      await this.ctx.storyRegistry.delete(request.storyId)
      return { storyId: request.storyId }
    } catch (error) {
      if (error instanceof StoryNotFoundError) {
        throw failure('story-not-found', error, { storyId: request.storyId })
      }
      throw failure('story-delete-failed', error, { storyId: request.storyId })
    }
  }

  /**
   * Rename one Story.
   * @param request - Story identity and replacement title.
   * @returns the changed Story projection.
   */
  @Remote('rename')
  async rename(request: StoryRenameRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.setTitle(request.storyId, request.title))
  }

  /**
   * Replace one Story premise.
   * @param request - Story identity and replacement premise.
   * @returns the changed Story projection.
   */
  @Remote('setPremise')
  async setPremise(request: StorySetPremiseRequest): Promise<StoryValue> {
    return this.mutate(
      request.storyId,
      () => this.ctx.storyRegistry.setPremise(request.storyId, request.premise),
    )
  }

  /**
   * Archive one Story without deleting files or logs.
   * @param request - Story identity.
   * @returns the archived Story projection.
   */
  @Remote('archive')
  async archive(request: StoryRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.setArchived(request.storyId, true))
  }

  /**
   * Move one Story to the top of the recent list.
   * @param request - Story identity.
   * @returns the touched Story projection.
   */
  @Remote('touch')
  async touch(request: StoryRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.touch(request.storyId))
  }

  /**
   * Archive one Story-owned scene Session.
   * @param request - Registered Session identity.
   * @returns its changed owning Story projection.
   */
  @Remote('archiveSession')
  async archiveSession(request: StorySessionRequest): Promise<StoryValue> {
    try {
      return { story: storyView(await this.ctx.storyRegistry.archiveSession(request.sessionId)) }
    } catch (error) {
      if (error instanceof StorySessionOwnershipError) {
        throw failure('story-session-not-found', error, { sessionId: request.sessionId })
      }
      throw failure('story-mutation-failed', error, { sessionId: request.sessionId })
    }
  }

  /**
   * Select one active scene as current.
   * @param request - Story and active scene identities.
   * @returns the changed Story projection.
   */
  @Remote('selectScene')
  async selectScene(request: StorySelectSceneRequest): Promise<StoryValue> {
    return this.mutate(
      request.storyId,
      () => this.ctx.storyRegistry.setCurrentScene(request.storyId, request.sessionId),
    )
  }

  /**
   * Commit structured Director planning without accepting character dialogue or autonomous action fields.
   * @param request - Story, authoring Session, and strict Brief fields.
   * @returns the changed Story projection with its durable Plot Ledger.
   */
  @Remote('commitDirectorBrief')
  async commitDirectorBrief(request: StoryDirectorBriefRequest): Promise<StoryValue> {
    return this.mutate(
      request.storyId,
      () => this.ctx.storyRegistry.commitDirectorBrief(
        request.storyId,
        request.directorSessionId,
        request.brief,
      ),
    )
  }

  /**
   * Resume every unfinished Actor in one exact Director Run checkpoint.
   * @param request - Story and exact current Run revision.
   * @returns the changed Story projection after dispatch settles.
   */
  @Remote('resumeDirectorRun')
  async resumeDirectorRun(request: StoryDirectorRunRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.directorRuns().resume(
      request.storyId,
      request.expectedRunRevision,
    ))
  }

  /**
   * Retry one failed or cancelled Actor in one exact Director Run checkpoint.
   * @param request - Story, exact current Run revision, and Actor identity.
   * @returns the changed Story projection after that Actor settles.
   */
  @Remote('retryDirectorRunActor')
  async retryDirectorRunActor(request: StoryDirectorRunActorRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.directorRuns().retryActor(
      request.storyId,
      request.expectedRunRevision,
      request.actorId,
    ))
  }

  /**
   * Pause one exact Director Run and abort its active Actor attempts.
   * @param request - Story and exact current Run revision.
   * @returns the paused Story projection.
   */
  @Remote('pauseDirectorRun')
  async pauseDirectorRun(request: StoryDirectorRunRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.directorRuns().pause(
      request.storyId,
      request.expectedRunRevision,
    ))
  }

  /**
   * Cancel one exact Director Run terminally.
   * @param request - Story and exact current Run revision.
   * @returns the terminally cancelled Story projection.
   */
  @Remote('cancelDirectorRun')
  async cancelDirectorRun(request: StoryDirectorRunRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.directorRuns().cancel(
      request.storyId,
      request.expectedRunRevision,
    ))
  }

  /**
   * Skip one incomplete Actor in one exact Director Run checkpoint.
   * @param request - Story, exact current Run revision, and Actor identity.
   * @returns the changed Story projection.
   */
  @Remote('skipDirectorRunActor')
  async skipDirectorRunActor(request: StoryDirectorRunActorRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.directorRuns().skipActor(
      request.storyId,
      request.expectedRunRevision,
      request.actorId,
    ))
  }

  /**
   * Cancel one active Actor attempt without cancelling its Director Run.
   * @param request - Story, exact current Run revision, and Actor identity.
   * @returns the resumable Story projection.
   */
  @Remote('cancelDirectorRunActor')
  async cancelDirectorRunActor(request: StoryDirectorRunActorRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.directorRuns().cancelActor(
      request.storyId,
      request.expectedRunRevision,
      request.actorId,
    ))
  }

  /**
   * Replace the player-visible Director Outline over an exact revision.
   * @param request - Story, expected revision, complete player content, and audit reason.
   * @returns the changed Story projection with its durable Director Outline.
   */
  @Remote('updateDirectorOutline')
  async updateDirectorOutline(request: StoryDirectorOutlineUpdateRequest): Promise<StoryValue> {
    return this.mutate(
      request.storyId,
      () => this.ctx.storyRegistry.replaceDirectorOutline(
        request.storyId,
        request.expectedRevision,
        request.outline,
        request.reason,
      ),
    )
  }

  /**
   * Accept or reject one queued Director Outline suggestion.
   * @param request - Story, exact revision, suggestion identity, and player decision.
   * @returns the changed Story projection after the suggestion decision.
   */
  @Remote('resolveDirectorOutlineSuggestion')
  async resolveDirectorOutlineSuggestion(
    request: StoryDirectorOutlineSuggestionRequest,
  ): Promise<StoryValue> {
    return this.mutate(
      request.storyId,
      () => this.ctx.storyRegistry.resolveDirectorOutlineSuggestion(
        request.storyId,
        request.expectedRevision,
        request.suggestionId,
        request.accept,
      ),
    )
  }

  /**
   * Establish a typed player-selected narrative direction.
   * @param request - Story and exact-revision direction input.
   * @returns the changed Story projection.
   */
  @Remote('chooseDirection')
  async chooseDirection(request: StoryChooseDirectionRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.chooseDirection(request.storyId, request.input))
  }

  /**
   * Apply a typed player world intervention.
   * @param request - Story and exact-revision world patch input.
   * @returns the changed Story projection.
   */
  @Remote('interveneWorld')
  async interveneWorld(request: StoryInterveneWorldRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.interveneWorld(request.storyId, request.input))
  }

  /**
   * Establish player-authored speech as one Actor.
   * @param request - Story, Actor, audience, and exact-revision speech input.
   * @returns the changed Story projection.
   */
  @Remote('speakAs')
  async speakAs(request: StorySpeakAsRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.speakAs(request.storyId, request.input))
  }

  /**
   * Establish a player-authored Actor action.
   * @param request - Story, Actor, audience, and exact-revision action input.
   * @returns the changed Story projection.
   */
  @Remote('actAs')
  async actAs(request: StoryActAsRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.actAs(request.storyId, request.input))
  }

  /**
   * Settle one captured Actor event into authoritative world truth.
   * @param request - Story and exact-revision settlement decision.
   * @returns the changed Story projection.
   */
  @Remote('settleActorWorldEvent')
  async settleActorWorldEvent(request: StorySettleActorWorldEventRequest): Promise<StoryValue> {
    return this.mutate(
      request.storyId,
      () => this.ctx.storyRegistry.settleActorWorldEvent(request.storyId, request.input),
    )
  }

  /**
   * Approve or reject complete source-processing units over exact revisions.
   * @param request - Story identity and original references or observed revisions.
   * @returns The Story after atomic review; stale proposal or note revisions reject.
   */
  @Remote('reviewContext')
  async reviewContext(request: StoryContextReviewRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.reviewContext(request.storyId, request.reviews))
  }

  /**
   * Edit pending short memories and their source-processing decision together.
   * @param request - Story identity and original references or observed revisions.
   * @returns The Story with the pending unit edited, without activating its notes.
   */
  @Remote('editContext')
  async editContext(request: StoryContextEditRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.editContext(
      request.storyId, request.id, request.revision, request.unit,
    ))
  }

  /**
   * Keep an original in one viewer's active context regardless of approval.
   * @param request - Story identity and original references or observed revisions.
   * @returns The Story with an explicit viewer-specific original pin.
   */
  @Remote('pinContext')
  async pinContext(request: StoryContextPinRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.pinContext(
      request.storyId, request.sourceId, request.scope, request.pinned,
    ))
  }

  /**
   * Read a source from the active Story index, including offline durable Sessions.
   * @param request - Story identity and original references or observed revisions.
   * @returns The active source’s complete original content, including offline logs.
   */
  @Remote('contextSource')
  async contextSource(request: StoryContextSourceRequest): Promise<StoryContextSourceValue> {
    const story = this.ctx.storyRegistry.get(request.storyId)
    const source = story?.world.context.sources.find(item => item.id === request.sourceId)
    if (story === undefined || source === undefined) throw new Error('Story source is unavailable')
    const text = await readContextSource(story.world, source, async (id, seq) => {
      const sessionId = SessionId(id)
      const events = this.ctx.sessions.get(sessionId)?.events ?? (await this.ctx.sessionPersistence.inspect(sessionId)).events
      return events[seq]
    }, story.discussions)
    return { id: source.id, text }
  }

  /**
   * Create a player-reviewable long-form memory.
   * @param request - Story and exact-revision memory proposal.
   * @returns the changed Story projection.
   */
  @Remote('proposeMemory')
  async proposeMemory(request: StoryProposeMemoryRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.proposeMemory(request.storyId, request.input))
  }

  /**
   * Approve or reject one memory proposal.
   * @param request - Story, exact revision, memory identity, and review decision.
   * @returns the changed Story projection.
   */
  @Remote('reviewMemory')
  async reviewMemory(request: StoryReviewMemoryRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.reviewMemory(
      request.storyId,
      request.expectedRevision,
      request.memoryId,
      request.approve,
    ))
  }

  /**
   * Replace one memory entry's editable content over the exact current revision.
   * @param request - Story and exact-revision memory replacement.
   * @returns the changed Story projection.
   */
  @Remote('updateMemory')
  async updateMemory(request: StoryUpdateMemoryRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.updateMemory(request.storyId, request.input))
  }

  /**
   * Begin one bounded durable group discussion.
   * @param request - Story, participants, topic, round budget, and exact revision.
   * @returns the changed Story projection.
   */
  @Remote('startDiscussion')
  async startDiscussion(request: StoryStartDiscussionRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.startDiscussion(
      request.storyId,
      { ...request, initiatedBy: 'player' },
    ))
  }

  /**
   * Queue one participant for the discussion floor.
   * @param request - Story, discussion, participant, and exact revision.
   * @returns the changed Story projection.
   */
  @Remote('requestDiscussionFloor')
  async requestDiscussionFloor(request: StoryRequestDiscussionFloorRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.requestDiscussionFloor(
      request.storyId,
      request.expectedRevision,
      request.discussionId,
      request.actorId,
    ))
  }

  /**
   * Pause automatic discussion dispatch for an explicit player request.
   * @param request - Story, discussion, exact revision, and intervention kind.
   * @returns the changed Story projection.
   */
  @Remote('requestDiscussionIntervention')
  async requestDiscussionIntervention(
    request: StoryRequestDiscussionInterventionRequest,
  ): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.requestDiscussionIntervention(
      request.storyId,
      request.expectedRevision,
      request.discussionId,
      request.intervention,
    ))
  }

  /**
   * Clear an acknowledged player request and allow automatic floor dispatch to continue.
   * @param request - Story, discussion, and exact discussion-state revision.
   * @returns the changed Story projection.
   */
  @Remote('clearDiscussionIntervention')
  async clearDiscussionIntervention(
    request: StoryClearDiscussionInterventionRequest,
  ): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.clearDiscussionIntervention(
      request.storyId,
      request.expectedRevision,
      request.discussionId,
    ))
  }

  /**
   * Record one turn from the exact current discussion speaker.
   * @param request - Story and exact-revision discussion turn.
   * @returns the changed Story projection.
   */
  @Remote('recordDiscussionTurn')
  async recordDiscussionTurn(request: StoryRecordDiscussionTurnRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.recordDiscussionTurn(request.storyId, request))
  }

  /**
   * Complete or cancel one durable discussion.
   * @param request - Story, discussion, exact revision, and terminal status.
   * @returns the changed Story projection.
   */
  @Remote('closeDiscussion')
  async closeDiscussion(request: StoryCloseDiscussionRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.closeDiscussion(
      request.storyId,
      request.expectedRevision,
      request.discussionId,
      request.status,
    ))
  }

  /**
   * Replace the safe context recipe over an exact revision.
   * @param request - Story, exact revision, and complete Director/Actor recipes.
   * @returns the changed Story projection.
   */
  @Remote('updateContextRecipe')
  async updateContextRecipe(request: StoryUpdateContextRecipeRequest): Promise<StoryValue> {
    return this.mutate(request.storyId, () => this.ctx.storyRegistry.updateContextRecipe(
      request.storyId,
      request.expectedRevision,
      { director: request.director, actor: request.actor },
    ))
  }

  /**
   * Export a versioned complete Story Package including storybook and Session logs.
   * @param request - Story to export.
   * @returns the validated portable package JSON.
   */
  @Remote('exportPackage')
  async exportPackage(request: StoryRequest): Promise<StoryPackageExportValue> {
    const story = this.ctx.storyRegistry.get(request.storyId)
    if (story === undefined) throw failure('story-not-found', new Error('Story not found'), { storyId: request.storyId })
    try {
      return await exportStoryPackage(this.ctx, story)
    } catch (error: unknown) {
      throw failure('story-package-export-failed', error, { storyId: request.storyId })
    }
  }

  /**
   * Import a version-5 Story Package under fresh Story and Session identities.
   * @param request - Serialized version-5 Story Package.
   * @returns the newly imported Story projection and scene identity.
   */
  @Remote('importPackage')
  async importPackage(request: StoryPackageImportRequest): Promise<StoryCreateValue> {
    try {
      const prepared = prepareStoryPackageImport(request.packageJson)
      const story = await this.ctx.storyRegistry.importRecord({
        ...prepared.record,
        templateId: prepared.storybook.id,
      })
      const cwd = this.ctx.storyRegistry.runtimePath(story.id)
      for (const session of prepared.sessions) {
        const imported = Session.create(session.sessionId, session.events, {
          version: SESSION_FORMAT_VERSION, id: session.sessionId, cwd, createdAt: session.header.createdAt,
          ...(session.header.agentPreset === undefined ? {} : { agentPreset: session.header.agentPreset }),
        })
        const detach = this.ctx.sessions.enter(imported)
        try {
          this.ctx.sessions.announce(imported)
          await this.ctx.sessions.flush(imported)
        } finally { detach() }
      }
      await writeStoryPackageFiles(this.ctx, story.id, prepared.files)
      await mkdir(this.ctx.storyHome.storyPath(story.id, '.runtime'), { recursive: true })
      await writeFile(this.ctx.storyHome.storyPath(story.id, '.runtime', 'turn-checkpoints.json'), JSON.stringify(prepared.checkpoints), { mode: 0o600 })
      await this.serializeStorybook(String(story.id), async () => {
        const fallback = fallbackStorybook(story)
        const current = await readStorybookAuthoring(
          this.ctx.storyHome.storyPath(story.id, 'world', 'storybook.json'),
          fallback,
        )
        await writeStorybookAuthoring(
          this.ctx.storyHome.storyPath(story.id, 'world', 'storybook.json'),
          fallback,
          current.revision,
          JSON.stringify(prepared.storybook, undefined, 2),
        )
      })
      return { story: storyView(story) }
    } catch (error: unknown) {
      throw failure('story-package-import-failed', error, {})
    }
  }

  /**
   * Query bounded instance people and the selected personal perspective.
   * @param request - Scene, author view, or authorized observer selection.
   * @returns one people page and observer-owned cognition.
   */
  @Remote('characterWorkspace')
  async characterWorkspace(request: StoryCharacterQuery): Promise<StoryCharacterWorkspaceValue> {
    const story = this.ctx.storyRegistry.get(request.storyId)
    if (story === undefined) throw new Error('Story unavailable')
    const authoring = await this.storybook({ storyId: request.storyId })
    const cast = story.world.characters.initialized ? story.world.characters
      : initializeStoryCharacters(emptyStoryCharacters(), parseStorybookDocument(JSON.parse(authoring.storybookJson)))
    const observer = request.observerId ?? 'observer'
    const knowledge = story.world.characters.initialized ? cast.knowledge[observer] ?? emptyKnowledge() : emptyKnowledge()
    const encounters = story.world.characters.initialized ? cast.encounters.filter(item => item.observerId === observer) : []
    const present = currentStorySceneCast(story.world)?.presentActorIds ?? []
    const offset = request.offset ?? 0
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Character offset must be nonnegative')
    const candidates = cast.entries.filter(item => !item.archived && (request.authorView === true
      || item.definition.actorId === observer || encounters.some(encounter => encounter.actorId === item.definition.actorId)))
      .map((item) => {
        const encounter = encounters.find(value => value.actorId === item.definition.actorId && value.sceneId !== '') ?? encounters.findLast(value => value.actorId === item.definition.actorId)
        return { actorId: item.definition.actorId, label: request.authorView === true || item.definition.actorId === observer
          ? item.definition.displayName : encounter === undefined ? '未具名的人物' : encounterLabel(encounter, knowledge),
        present: present.includes(item.definition.actorId) }
      }).filter(item => ((request.mode ?? 'scene') !== 'scene' || item.present)
        && (request.query === undefined || item.label.toLocaleLowerCase().includes(request.query.toLocaleLowerCase())))
    const page = candidates.slice(offset, offset + this.characterPageSize)
    return { revision: story.world.characters.revision, people: page,
      next: offset + this.characterPageSize < candidates.length ? offset + this.characterPageSize : null,
      records: request.authorView === true
        ? cast.entries.filter(item => page.some(person => person.actorId === item.definition.actorId)) : [],
      knowledge, encounters: encounters.map(item => ({ ref: item.ref, label: encounterLabel(item, knowledge) })) }
  }

  /**
   * Save a player-authored instance person; authoring templates remain independent.
   * @param request - Definition draft and exact registry revision.
   * @returns the refreshed author workspace.
   */
  @Remote('saveCharacter')
  async saveCharacter(request: StoryCharacterSaveRequest): Promise<StoryCharacterWorkspaceValue> {
    return this.serializeStorybook(`characters:${request.storyId}`, async () => {
      const story = this.ctx.storyRegistry.get(request.storyId)
      if (story === undefined) throw new Error('Story unavailable')
      if (story.world.characters.revision !== request.expectedRevision) throw new Error('Character registry revision changed; reload before editing')
      if (!story.world.characters.initialized) {
        const book = await this.storybook({ storyId: request.storyId })
        await this.ctx.storyRegistry.initializeCharacters(story.id, parseStorybookDocument(JSON.parse(book.storybookJson)))
      }
      const expectedRevision = story.world.characters.revision
      const previous = story.world.characters.entries.find(item => item.definition.actorId === request.actorId)
      if (request.actorId !== undefined && previous === undefined) throw new Error('Person is not registered')
      const actorId = previous?.definition.actorId ?? `character-${randomUUID()}`
      const definition = storybookActorDefinitionSchema.parse({ ...JSON.parse(request.definitionJson), actorId })
      await this.ctx.storyRegistry.saveCharacter(story.id, expectedRevision, {
        definition, revision: (previous?.revision ?? 0) + 1, origin: 'player',
        ...(previous?.templateActorId === undefined ? {} : { templateActorId: previous.templateActorId }),
        importance: request.importance, purpose: request.purpose, sourceRefs: previous?.sourceRefs ?? [],
        location: request.location, archived: request.archived, createdAt: previous?.createdAt ?? new Date().toISOString(),
      })
      return this.characterWorkspace({ storyId: story.id, authorView: true, mode: 'all' })
    })
  }

  /**
   * Apply a player correction through the existing Actor log, or its unprovisioned seed.
   * @param request - Owner and exact-revision judgment changes.
   * @returns the refreshed personal workspace.
   */
  @Remote('updateKnowledge')
  async updateKnowledge(request: StoryKnowledgeUpdateRequest): Promise<StoryCharacterWorkspaceValue> {
    const story = this.ctx.storyRegistry.get(request.storyId)
    if (story === undefined) throw new Error('Story unavailable')
    const changes = request.changes.map(item => knowledgeChangeSchema.parse(item))
    const registration = story.sessions.find(item => item.role === 'actor' && item.actorId === request.actorId && item.archivedAt === undefined)
    if (registration === undefined) await this.ctx.storyRegistry.correctUnprovisionedKnowledge(story.id, request.actorId, changes)
    else {
      const controller = this.ctx.get('sessionController') as unknown as { resolveAgent(id: string): Promise<{ agent: unknown } | { error: { message: string } }> } | undefined
      const actors = this.ctx.get('actors') as unknown as { initializeKnowledge(agent: unknown): void; changeKnowledge(agent: unknown, input: typeof changes, origin: 'player'): unknown } | undefined
      if (controller === undefined || actors === undefined) throw new Error('Actor editing is unavailable')
      const result = await controller.resolveAgent(registration.sessionId)
      if ('error' in result) throw new Error(result.error.message)
      actors.initializeKnowledge(result.agent)
      actors.changeKnowledge(result.agent, changes, 'player')
      const session = this.ctx.sessions.get(registration.sessionId)
      if (session !== undefined) await this.ctx.sessions.flush(session)
    }
    return this.characterWorkspace({ storyId: story.id, observerId: request.actorId, mode: 'all' })
  }

  /**
   * Preview or explicitly collect a character into a base template; live stories receive no update.
   * @param request - Target template, opt-in contents, revisions, and accepted preview.
   * @returns the exact proposed or saved template document.
   */
  @Remote('collectCharacter')
  async collectCharacter(request: StoryCharacterCollectRequest): Promise<StorybookAuthoringValue> {
    const story = this.ctx.storyRegistry.get(request.storyId)
    const target = this.ctx.storyRegistry.get(request.targetStoryId)
    if (story === undefined || target === undefined || story.templateId !== target.templateId || !target.templateOnly) throw new Error('Choose this storybook’s base template')
    const person = story.world.characters.entries.find(item => item.definition.actorId === request.actorId)
    if (person === undefined || person.revision !== request.expectedCharacterRevision) throw new Error('Character revision changed')
    const authoring = await this.storybook({ storyId: target.id })
    if (authoring.revision !== request.expectedRevision) throw new Error('Storybook revision changed')
    const book = parseStorybookDocument(JSON.parse(authoring.storybookJson))
    const definition = structuredClone(person.definition)
    definition.actorId = person.templateActorId ?? person.definition.actorId
    definition.initialKnowledge = []
    definition.state = []
    definition.privateContext = { perspective: [], coreMemories: [], goals: [], intentions: [] }
    const templateActorId = (actorId: string): string => {
      const source = story.world.characters.entries.find(item => item.definition.actorId === actorId)
      const targetId = source?.templateActorId ?? actorId
      if (targetId !== definition.actorId && !book.characters.some(item => item.actorId === targetId)) throw new Error('Collect referenced people first, or omit current relationships and identity knowledge')
      return targetId
    }
    if (request.includeKnowledge) definition.initialKnowledge = (story.world.characters.knowledge[request.actorId]?.entries ?? [])
      .filter(item => item.status === 'active').map((item) => {
        const targetId = story.world.characters.encounters.find(encounter => encounter.observerId === request.actorId
          && encounter.ref === item.entityRefs[0])?.actorId
        return { text: item.text, kind: item.kind, attitude: item.attitude,
          ...(item.label === undefined ? {} : { label: item.label }),
          ...(targetId === undefined ? {} : { targetActorId: templateActorId(targetId) }) }
      })
    const actor = (await this.actorStates({ storyId: story.id })).actors.find(item => item.actorId === request.actorId)
    if (request.includeState && actor !== undefined) definition.state = actor.dynamicState.entries
      .filter(item => item.active).map((item) => {
        const { targetPersonRef, ...field } = item.definition
        void targetPersonRef
        return { definition: { ...field, actorId: definition.actorId,
          audience: field.audience.map(templateActorId),
          ...(field.targetActorId === undefined ? {} : { targetActorId: templateActorId(field.targetActorId) }) }, value: item.value }
      })
    if (request.includeMemories && actor !== undefined) definition.privateContext.coreMemories = actor.memories.filter(item => item.status === 'active').map(item => ({ content: item.content, importance: item.importance, ...(item.meaning === undefined ? {} : { meaning: item.meaning }) }))
    const document = parseStorybookDocument({ ...book,
      characters: [...book.characters.filter(item => item.actorId !== definition.actorId), definition] })
    const previewJson = JSON.stringify(document, undefined, 2)
    if (request.preview) return { ...authoring, storybookJson: previewJson }
    if (request.expectedPreviewJson !== previewJson) throw new Error('Collection content changed; preview again before saving')
    return this.updateStorybook({ storyId: target.id, expectedRevision: authoring.revision, storybookJson: JSON.stringify(document) })
  }

  /**
   * Return private autonomous-character state for the player's author panel.
   * @param request - Story whose registered and live Actors are projected.
   * @returns the complete merged Actor-state list.
   */
  @Remote('actorStates')
  async actorStates(request: StoryRequest): Promise<StoryActorStatesValue> {
    const story = this.ctx.storyRegistry.get(request.storyId)
    if (story === undefined) throw failure('story-not-found', new Error('Story not found'), { storyId: request.storyId })
    let configured: readonly StoryActorStateView[]
    try {
      configured = await loadStorybookActorStates(
        this.ctx.storyHome.storyPath(request.storyId, 'world', 'storybook.json'),
        story.world.characters.initialized
          ? story.world.characters.entries.filter(item => !item.archived).map(item => item.definition) : undefined,
      )
    } catch (error) {
      throw failure('storybook-invalid', error, { storyId: request.storyId })
    }
    const values = new Map(configured.map(actor => [actor.actorId, actor]))
    const agents = this.ctx.get('agents') as unknown as {
      get(id: string): unknown
    } | undefined
    const actors = this.ctx.get('actors') as unknown as {
      playerInspect(agent: unknown): ActorPrivateShape
      playerInspectEvents(events: readonly import('@deepseek-ai/dsh-session').SessionEvent[]): ActorPrivateShape
    } | undefined
    if (actors === undefined && story.sessions.some(item => item.role === 'actor' && item.archivedAt === undefined)) throw new Error('Actor projection service is unavailable')
    for (const registration of story.sessions) {
      if (registration.role !== 'actor' || registration.archivedAt !== undefined || !values.has(registration.actorId ?? '')) continue
      if (actors === undefined) throw new Error('Actor projection service is unavailable')
      const agent = agents?.get(registration.sessionId)
      const persisted = agent === undefined
        ? this.ctx.sessions.get(registration.sessionId)?.events
          ?? (await this.ctx.sessionPersistence.inspect(registration.sessionId)).events
        : undefined
      const running = actorStateView(persisted === undefined ? actors.playerInspect(agent) : actors.playerInspectEvents(persisted))
      values.set(running.actorId, mergeStoryActorState(values.get(running.actorId), running))
    }
    return { actors: [...values.values()].map(actor => ({ ...actor, dynamicState: {
      ...actor.dynamicState,
      entries: [...actor.dynamicState.entries,
        ...story.world.dynamicState.entries.filter(entry => entry.definition.actorId === actor.actorId)],
      history: [...actor.dynamicState.history,
        ...story.world.dynamicState.history.filter(entry => entry.definition.actorId === actor.actorId)],
    } })) }
  }

  /**
   * Apply player-authored state corrections without changing the storybook baseline.
   * @param request - target owner and exact field revisions.
   * @returns the updated player-visible character list.
   */
  @Remote('updateState')
  async updateState(request: StoryStateUpdateRequest): Promise<StoryActorStatesValue> {
    const story = this.ctx.storyRegistry.get(request.storyId)
    if (story === undefined) throw failure('story-not-found', new Error('Story not found'), { storyId: request.storyId })
    const authoring = await this.storybook({ storyId: request.storyId })
    const document = instanceStorybook(story, parseStorybookDocument(JSON.parse(authoring.storybookJson)))
    if (!document.characters.some(actor => actor.actorId === request.actorId)) throw new Error('Unknown character')
    if (request.changes.some(change => change.definition !== undefined
      && (change.definition.actorId !== request.actorId || change.definition.owner !== request.owner))) {
      throw new Error('State changes must belong to the selected character and owner')
    }
    if (request.owner === 'world') {
      if (request.changes.some((change) => {
        const existing = story.world.dynamicState.entries.find(entry => entry.definition.id === change.fieldId)
        return existing !== undefined && existing.definition.actorId !== request.actorId
      })) throw new Error('World state changes must belong to the selected character')
      if (request.expectedWorldRevision === undefined) throw new Error('World edits require expectedWorldRevision')
      await this.ctx.storyRegistry.changeWorldState(request.storyId, {
        expectedWorldRevision: request.expectedWorldRevision, changes: request.changes,
        actorIds: document.characters.map(actor => actor.actorId), audience: [],
        summary: request.changes.map(change => change.reason).join('；'), origin: 'player',
      })
    } else {
      const registration = story.sessions.find(item => item.role === 'actor'
        && item.archivedAt === undefined && item.actorId === request.actorId)
      const agents = this.ctx.get('agents') as unknown as { get(id: string): unknown } | undefined
      const actors = this.ctx.get('actors') as unknown as {
        playerChangeState(agent: unknown, changes: StoryStateUpdateRequest['changes']): unknown
      } | undefined
      let agent = registration === undefined ? undefined : agents?.get(registration.sessionId)
      if (agent === undefined && registration !== undefined) {
        const sessions = this.ctx.get('sessionController') as unknown as {
          resolveAgent(id: string): Promise<{ agent: unknown } | { error: { message: string } }>
        } | undefined
        if (sessions !== undefined) {
          const resolved = await sessions.resolveAgent(registration.sessionId)
          if ('error' in resolved) throw new Error(resolved.error.message)
          agent = resolved.agent
        }
      }
      if (actors === undefined || agent === undefined) throw new Error('The character must be active before editing its current state; edit the storybook for initial values')
      actors.playerChangeState(agent, request.changes)
    }
    return this.actorStates({ storyId: request.storyId })
  }

  /**
   * Replace one revisioned character turning point after player review.
   * @param request - Story, Actor, revision, and replacement turning-point content.
   * @returns the refreshed current Actor-state projection.
   */
  @Remote('updateActorTurningPoint')
  async updateActorTurningPoint(request: StoryUpdateActorTurningPointRequest): Promise<StoryActorStatesValue> {
    const story = this.ctx.storyRegistry.get(request.storyId)
    if (story === undefined) throw failure('story-not-found', new Error('Story not found'), { storyId: request.storyId })
    const registration = story.sessions.find(item => item.role === 'actor'
      && item.archivedAt === undefined
      && item.actorId === request.actorId)
    if (registration === undefined) {
      throw failure('actor-not-active', new Error(`Actor '${request.actorId}' is not active`), {
        storyId: request.storyId,
        actorId: request.actorId,
      })
    }
    const agents = this.ctx.get('agents') as unknown as { get(id: string): unknown } | undefined
    const actors = this.ctx.get('actors') as unknown as {
      updateTurningPoint(agent: unknown, input: Omit<StoryUpdateActorTurningPointRequest, 'storyId' | 'actorId'>): unknown
    } | undefined
    const agent = agents?.get(registration.sessionId)
    if (actors === undefined || agent === undefined) {
      throw failure('actor-not-running', new Error(`Actor '${request.actorId}' is not running`), {
        storyId: request.storyId,
        actorId: request.actorId,
      })
    }
    actors.updateTurningPoint(agent, {
      turningPointId: request.turningPointId,
      expectedRevision: request.expectedRevision,
      trigger: request.trigger,
      interpretation: request.interpretation,
      significance: request.significance,
      status: request.status,
      changes: request.changes,
      sourceRefs: request.sourceRefs,
    })
    return await this.actorStates({ storyId: request.storyId })
  }

  /**
   * Read the complete player-editable storybook without exposing its managed path.
   * @param request - Story whose world, Director guidance, and cast are read.
   * @returns canonical JSON and its exact save revision.
   */
  @Remote('storybook')
  async storybook(request: StoryRequest): Promise<StorybookAuthoringValue> {
    const story = this.ctx.storyRegistry.get(request.storyId)
    if (story === undefined) throw failure('story-not-found', new Error('Story not found'), { storyId: request.storyId })
    try {
      return await readStorybookAuthoring(
        this.ctx.storyHome.storyPath(request.storyId, 'world', 'storybook.json'),
        fallbackStorybook(story),
      )
    } catch (error: unknown) {
      throw failure('storybook-invalid', error, { storyId: request.storyId })
    }
  }

  /**
   * Read effective Director and per-Actor prompts with baseline and override provenance.
   * @param request - Story whose context settings are read.
   * @returns the storybook baselines, Story overrides, effective values, and revisions.
   */
  @Remote('prompts')
  async prompts(request: StoryRequest): Promise<StoryPromptSettingsValue> {
    const story = this.ctx.storyRegistry.get(request.storyId)
    if (story === undefined) throw failure('story-not-found', new Error('Story not found'), { storyId: request.storyId })
    try {
      const authoring = await readStorybookAuthoring(
        this.ctx.storyHome.storyPath(request.storyId, 'world', 'storybook.json'),
        fallbackStorybook(story),
      )
      const document = instanceStorybook(story, parseStorybookDocument(JSON.parse(authoring.storybookJson) as unknown))
      return promptSettings(story, authoring.revision, document)
    } catch (error: unknown) {
      throw failure('storybook-invalid', error, { storyId: request.storyId })
    }
  }

  /**
   * Copy or clear one audience's style baseline, run override, or current-scene guidance.
   * @param request - Exact book or prompt revision and recipient-scoped guidance.
   * @returns the refreshed context settings and provenance.
   */
  @Remote('updateStyle')
  async updateStyle(request: StoryStyleUpdateRequest): Promise<StoryPromptSettingsValue> {
    const story = this.ctx.storyRegistry.get(request.storyId)
    if (story === undefined) throw failure('story-not-found', new Error('Story not found'), { storyId: request.storyId })
    try {
      await this.serializeStorybook(String(request.storyId), async () => {
        const path = this.ctx.storyHome.storyPath(request.storyId, 'world', 'storybook.json')
        const current = await readStorybookAuthoring(path, fallbackStorybook(story))
        const authored = parseStorybookDocument(JSON.parse(current.storybookJson) as unknown)
        const document = instanceStorybook(story, authored)
        const director = request.key === 'director'
        const actor = document.characters.find(item => request.key === `actor:${item.actorId}`)
        if (!director && actor === undefined) throw new Error('Unknown style audience')
        if (request.scope !== 'storybook') {
          await this.ctx.storyRegistry.updateStyle(request.storyId, request.expectedStoryPromptRevision, request,
            document.characters.map(item => item.actorId))
          return
        }
        if (!director && !authored.characters.some(item => request.key === `actor:${item.actorId}`)) {
          throw new Error('Collect this story-local character into the storybook before editing its template style')
        }
        const profile = styleProfileSchema.parse(request.profile)
        if (profile.kind !== (director ? 'director' : 'actor')) throw new Error('Style audience does not match profile kind')
        const next = parseStorybookDocument(director
          ? { ...authored, directorGuidance: profile.guidance }
          : { ...authored,
            characters: authored.characters.map(item => item.actorId === actor?.actorId ? { ...item,
              actingGuidance: profile.guidance } : item) })
        await writeStorybookAuthoring(path, fallbackStorybook(story), request.expectedStorybookRevision, JSON.stringify(next, undefined, 2))
      })
      return await this.prompts({ storyId: request.storyId })
    } catch (error: unknown) {
      throw failure('story-style-update-failed', error, { storyId: request.storyId })
    }
  }

  /**
   * Update a prompt baseline or exact-revision override.
   * @param request - audience, replacement, and loaded book or prompt revision.
   * @returns the refreshed effective settings and provenance.
   */
  @Remote('updatePrompt')
  async updatePrompt(request: StoryPromptUpdateRequest): Promise<StoryPromptSettingsValue> {
    const story = this.ctx.storyRegistry.get(request.storyId)
    if (story === undefined) throw failure('story-not-found', new Error('Story not found'), { storyId: request.storyId })
    try {
      if (request.scope === 'storybook') {
        await this.serializeStorybook(String(request.storyId), async () => {
          const path = this.ctx.storyHome.storyPath(request.storyId, 'world', 'storybook.json')
          const current = await readStorybookAuthoring(path, fallbackStorybook(story))
          const document = parseStorybookDocument(JSON.parse(current.storybookJson) as unknown)
          const next = updateStorybookPrompt(document, request.target, request.actorId, request.prompt)
          await writeStorybookAuthoring(
            path,
            fallbackStorybook(story),
            request.expectedStorybookRevision,
            JSON.stringify(next, undefined, 2),
          )
        })
      } else if (request.target === 'creator') {
        await this.ctx.storyRegistry.updateCreatorPrompt(
          request.storyId,
          request.expectedStoryPromptRevision,
          request.prompt,
        )
      } else if (request.target === 'director') {
        await this.ctx.storyRegistry.updateDirectorPrompt(
          request.storyId,
          request.expectedStoryPromptRevision,
          request.prompt,
        )
      } else {
        const actorId = requiredPromptActorId(request.actorId)
        await this.requireStorybookActor(request.storyId, story, actorId)
        await this.ctx.storyRegistry.updateActorPrompt(
          request.storyId,
          request.expectedStoryPromptRevision,
          actorId,
          request.prompt,
        )
      }
      return await this.prompts({ storyId: request.storyId })
    } catch (error: unknown) {
      if (error instanceof TypertRemoteFailure) throw error
      if (error instanceof StorybookRevisionError) {
        throw failure('storybook-stale', error, {
          storyId: request.storyId,
          expectedRevision: error.expected,
          actualRevision: error.actual,
        })
      }
      throw failure('story-prompt-update-failed', error, { storyId: request.storyId })
    }
  }

  /**
   * Update the shared reasoning-language baseline or current Story override.
   * @param request - Exact-revision reasoning-language mutation and storage scope.
   * @returns the refreshed context settings and provenance.
   */
  @Remote('updateReasoningLanguage')
  async updateReasoningLanguage(
    request: StoryReasoningLanguageUpdateRequest,
  ): Promise<StoryPromptSettingsValue> {
    const story = this.ctx.storyRegistry.get(request.storyId)
    if (story === undefined) throw failure('story-not-found', new Error('Story not found'), { storyId: request.storyId })
    try {
      if (request.scope === 'storybook') {
        await this.serializeStorybook(String(request.storyId), async () => {
          const path = this.ctx.storyHome.storyPath(request.storyId, 'world', 'storybook.json')
          const current = await readStorybookAuthoring(path, fallbackStorybook(story))
          const document = parseStorybookDocument(JSON.parse(current.storybookJson) as unknown)
          const next = parseStorybookDocument({ ...document, reasoningLanguage: request.language })
          await writeStorybookAuthoring(
            path,
            fallbackStorybook(story),
            request.expectedStorybookRevision,
            JSON.stringify(next, undefined, 2),
          )
        })
      } else {
        await this.ctx.storyRegistry.updateReasoningLanguage(
          request.storyId,
          request.expectedStoryPromptRevision,
          request.language,
        )
      }
      return await this.prompts({ storyId: request.storyId })
    } catch (error: unknown) {
      if (error instanceof TypertRemoteFailure) throw error
      if (error instanceof StorybookRevisionError) {
        throw failure('storybook-stale', error, {
          storyId: request.storyId,
          expectedRevision: error.expected,
          actualRevision: error.actual,
        })
      }
      throw failure('story-prompt-update-failed', error, { storyId: request.storyId })
    }
  }

  /**
   * Update one Director/Actor policy or tool-guidance baseline or Story override.
   * @param request - Exact-revision context-rule mutation and storage scope.
   * @returns the refreshed context settings and provenance.
   */
  @Remote('updateContextRule')
  async updateContextRule(request: StoryContextRuleUpdateRequest): Promise<StoryPromptSettingsValue> {
    const story = this.ctx.storyRegistry.get(request.storyId)
    if (story === undefined) throw failure('story-not-found', new Error('Story not found'), { storyId: request.storyId })
    const key = contextRuleKey(request.target, request.section)
    try {
      if (request.scope === 'storybook') {
        await this.serializeStorybook(String(request.storyId), async () => {
          const path = this.ctx.storyHome.storyPath(request.storyId, 'world', 'storybook.json')
          const current = await readStorybookAuthoring(path, fallbackStorybook(story))
          const document = parseStorybookDocument(JSON.parse(current.storybookJson) as unknown)
          const side = document.contextRules[request.target]
          const next = parseStorybookDocument({
            ...document,
            contextRules: {
              ...document.contextRules,
              [request.target]: { ...side, [request.section]: request.text },
            },
          })
          await writeStorybookAuthoring(
            path,
            fallbackStorybook(story),
            request.expectedStorybookRevision,
            JSON.stringify(next, undefined, 2),
          )
        })
      } else {
        await this.ctx.storyRegistry.updateContextRule(
          request.storyId,
          request.expectedStoryPromptRevision,
          key,
          request.text,
        )
      }
      return await this.prompts({ storyId: request.storyId })
    } catch (error: unknown) {
      if (error instanceof TypertRemoteFailure) throw error
      if (error instanceof StorybookRevisionError) {
        throw failure('storybook-stale', error, {
          storyId: request.storyId,
          expectedRevision: error.expected,
          actualRevision: error.actual,
        })
      }
      throw failure('story-prompt-update-failed', error, { storyId: request.storyId })
    }
  }

  /**
   * Preview the effective Director or Actor context after visibility filtering.
   * @param request - Story and model audience to inspect.
   * @returns ordered sections with source, permission, visibility, and inclusion reason.
   */
  @Remote('contextPreview')
  async contextPreview(request: StoryContextPreviewRequest): Promise<StoryContextPreviewValue> {
    const story = this.ctx.storyRegistry.get(request.storyId)
    if (story === undefined) throw failure('story-not-found', new Error('Story not found'), { storyId: request.storyId })
    const renderer = this.ctx.get('storyContextRenderer')
    if (renderer === undefined) throw failure('context-unavailable', new Error('Storyweaver context renderer is unavailable'), { storyId: request.storyId })
    try {
      const snapshot = await renderer.render(request.storyId, request.audience, request.actorId)
      return presentStoryContextPreview(snapshot, request.audience, request.actorId)
    } catch (error) {
      throw failure('context-unavailable', error, { storyId: request.storyId })
    }
  }

  /**
   * Reconstruct the sender-serialized context that produced one Story-owned AI event.
   * @param request - Story ownership, source Session, and producing event boundary.
   * @returns request coordinates and JSON built by the sender's serializer from the original log.
   */
  @Remote('requestContextPreview')
  async requestContextPreview(request: StoryRequestContextPreviewRequest): Promise<StoryRequestContextPreviewValue> {
    const story = this.ctx.storyRegistry.get(request.storyId)
    if (story === undefined) {
      throw failure('story-not-found', new Error('Story not found'), { storyId: request.storyId })
    }
    if (!story.sessions.some(item => item.sessionId === request.sessionId)) {
      throw failure('story-session-not-owned', new Error('Session is not owned by Story'), {
        storyId: request.storyId,
        sessionId: request.sessionId,
      })
    }
    try {
      const history = this.ctx.get('roleplayRequests')
      if (history === undefined) throw new Error('Request reconstruction is unavailable')
      return await history.inspect({ sessionId: request.sessionId, beforeEventSeq: request.beforeEventSeq })
    } catch (error: unknown) {
      throw failure('story-request-context-unavailable', error, {
        storyId: request.storyId,
        sessionId: request.sessionId,
        beforeEventSeq: request.beforeEventSeq,
      })
    }
  }

  /**
   * Replace the player-authored storybook while the prior revision remains current.
   * @param request - Story identity, exact revision, and complete replacement JSON.
   * @returns canonical saved JSON and its new revision.
   */
  @Remote('updateStorybook')
  async updateStorybook(request: StorybookUpdateRequest): Promise<StorybookAuthoringValue> {
    return this.serializeStorybook(String(request.storyId), async () => {
      const story = this.ctx.storyRegistry.get(request.storyId)
      if (story === undefined) throw failure('story-not-found', new Error('Story not found'), { storyId: request.storyId })
      try {
        await this.ctx.storyHome.ensureStory(request.storyId)
        return await writeStorybookAuthoring(
          this.ctx.storyHome.storyPath(request.storyId, 'world', 'storybook.json'),
          fallbackStorybook(story),
          request.expectedRevision,
          request.storybookJson,
        )
      } catch (error: unknown) {
        if (error instanceof StorybookRevisionError) {
          throw failure('storybook-stale', error, {
            storyId: request.storyId,
            expectedRevision: error.expected,
            actualRevision: error.actual,
          })
        }
        throw failure('storybook-invalid', error, { storyId: request.storyId })
      }
    })
  }

  /**
   * Stream a complete baseline followed by Story changes.
   * @param signal - Generation cancellation.
   * @returns the baseline and ordered incremental updates.
   */
  @Remote({ mode: 'stream' })
  follow(signal: AbortSignal): AsyncIterable<StoryFollowFrame> {
    return this.feed.follow(signal)
  }

  private async mutate(
    storyId: StoryRenameRequest['storyId'],
    operation: () => Promise<import('@deepseek-ai/dsh-story').Story>,
  ): Promise<StoryValue> {
    try {
      return { story: storyView(await operation()) }
    } catch (error) {
      if (error instanceof TypertRemoteFailure) throw error
      if (error instanceof StoryNotFoundError) {
        throw failure('story-not-found', error, { storyId })
      }
      if (error instanceof StorySessionOwnershipError) {
        throw failure('story-session-conflict', error, { storyId, sessionId: error.sessionId })
      }
      if (error instanceof StoryDirectorError) {
        throw failure('story-director-rejected', error, { storyId, reason: error.code })
      }
      if (error instanceof StoryOutlineError) {
        throw failure('story-outline-rejected', error, { storyId, reason: error.code })
      }
      if (error instanceof StoryRoleplayError) {
        throw failure('story-roleplay-rejected', error, { storyId, reason: error.code })
      }
      throw failure('story-mutation-failed', error, { storyId })
    }
  }

  private directorRuns(): import('@deepseek-ai/dsh-story').DirectorRunExecutor {
    const runtime = this.ctx.get('directorRuns')
    if (runtime === undefined) {
      throw failure('director-run-unavailable', new Error('Director Run executor is unavailable'), {})
    }
    return runtime
  }

  private async requireStorybookActor(storyId: Story['id'], story: Story, actorId: string): Promise<void> {
    if (story.world.characters.initialized) {
      if (!story.world.characters.entries.some(item => item.definition.actorId === actorId && !item.archived)) throw new Error('Person is not registered')
      return
    }
    const value = await readStorybookAuthoring(
      this.ctx.storyHome.storyPath(storyId, 'world', 'storybook.json'),
      fallbackStorybook(story),
    )
    const document = parseStorybookDocument(JSON.parse(value.storybookJson) as unknown)
    if (!document.characters.some(actor => actor.actorId === actorId)) {
      throw new Error(`Storybook does not define Actor '${actorId}'`)
    }
  }

  private async serializeStorybook<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.storybookWrites.get(key) ?? Promise.resolve()
    let release: () => void = () => undefined
    const current = new Promise<void>((resolve) => { release = resolve })
    const tail = previous.then(() => current)
    this.storybookWrites.set(key, tail)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.storybookWrites.get(key) === tail) this.storybookWrites.delete(key)
    }
  }
}

function fallbackStorybook(story: Story): StorybookDocument {
  return parseStorybookDocument({
    schemaVersion: 6,
    id: String(story.id),
    title: story.title,
    premise: story.premise,
    directorPrompt: '',
    reasoningLanguage: DEFAULT_STORYBOOK_REASONING_LANGUAGE,
    contextRules: DEFAULT_STORYBOOK_CONTEXT_RULES,
    directorGuidance: {
      narrativeStyle: '', atmosphereAndPacing: '', focus: [], avoid: [], additionalInstructions: '',
    },
    characters: [],
  })
}

function promptSettings(
  story: Story,
  storybookRevision: string,
  document: StorybookDocument,
): StoryPromptSettingsValue {
  const overrides = story.promptOverrides
  const directorOverride = overrides.directorPrompt
  const creatorOverride = overrides.creatorPrompt
  const reasoningLanguageOverride = overrides.reasoningLanguage
  const rule = (key: StoryContextRuleKey, baseline: string) => {
    const override = overrides.contextRules[key]
    return {
      storybookPrompt: baseline,
      ...(override === undefined ? {} : { storyOverride: override }),
      effectivePrompt: override ?? baseline,
      source: override === undefined ? 'storybook' as const : 'story' as const,
    }
  }
  return {
    styles: {
      baselines: { director: { kind: 'director', guidance: document.directorGuidance },
        ...Object.fromEntries(document.characters.map(actor => [`actor:${actor.actorId}`, { kind: 'actor' as const, guidance: actor.actingGuidance }])) },
      overrides: overrides.styles,
      sceneId: currentStorySceneCast(story.world)?.sceneId,
    },
    storyPromptRevision: overrides.revision,
    storybookRevision,
    creator: {
      storybookPrompt: DEFAULT_STORY_CREATOR_PROMPT,
      ...(creatorOverride === undefined ? {} : { storyOverride: creatorOverride }),
      effectivePrompt: creatorOverride ?? DEFAULT_STORY_CREATOR_PROMPT,
      source: creatorOverride === undefined ? 'storybook' : 'story',
    },
    reasoningLanguage: {
      storybookLanguage: document.reasoningLanguage,
      ...(reasoningLanguageOverride === undefined ? {} : { storyOverride: reasoningLanguageOverride }),
      effectiveLanguage: reasoningLanguageOverride ?? document.reasoningLanguage,
      source: reasoningLanguageOverride === undefined ? 'storybook' : 'story',
    },
    director: {
      storybookPrompt: document.directorPrompt,
      ...(directorOverride === undefined ? {} : { storyOverride: directorOverride }),
      effectivePrompt: directorOverride ?? document.directorPrompt,
      source: directorOverride === undefined ? 'storybook' : 'story',
    },
    contextRules: {
      director: {
        policy: rule('director-policy', document.contextRules.director.policy),
        tools: rule('director-tools', document.contextRules.director.tools),
      },
      actor: {
        policy: rule('actor-policy', document.contextRules.actor.policy),
        tools: rule('actor-tools', document.contextRules.actor.tools),
      },
    },
    actors: document.characters.map((actor) => {
      const override = overrides.actorPrompts[actor.actorId]
      return {
        actorId: actor.actorId,
        displayName: actor.displayName,
        storybookPrompt: actor.rolePrompt,
        ...(override === undefined ? {} : { storyOverride: override }),
        effectivePrompt: override ?? actor.rolePrompt,
        source: override === undefined ? 'storybook' as const : 'story' as const,
      }
    }),
  }
}

function contextRuleKey(
  target: 'director' | 'actor',
  section: 'policy' | 'tools',
): StoryContextRuleKey {
  return `${target}-${section}`
}

function updateStorybookPrompt(
  document: StorybookDocument,
  target: 'director' | 'actor',
  actorId: string | undefined,
  prompt: string,
): StorybookDocument {
  if (target === 'director') return parseStorybookDocument({ ...document, directorPrompt: prompt })
  const acceptedActorId = requiredPromptActorId(actorId)
  if (!document.characters.some(actor => actor.actorId === acceptedActorId)) {
    throw new Error(`Storybook does not define Actor '${acceptedActorId}'`)
  }
  return parseStorybookDocument({
    ...document,
    characters: document.characters.map(actor => actor.actorId === acceptedActorId
      ? { ...actor, rolePrompt: prompt }
      : actor),
  })
}

function requiredPromptActorId(actorId: string | undefined): string {
  const accepted = actorId?.trim()
  if (accepted === undefined || accepted.length === 0) throw new Error('Actor prompt update requires actorId')
  return accepted
}

interface ActorPrivateShape {
  readonly dynamicState: import('@deepseek-ai/dsh-story/types').DynamicState
  readonly descriptor: { readonly id: string; readonly displayName: string; readonly persona: string }
  readonly emotions: readonly {
    readonly emotion: string
    readonly intensity: number
    readonly toward: readonly string[]
    readonly cause?: string
    readonly impulse?: string
  }[]
  readonly beliefs: readonly { readonly proposition: string; readonly stance: string; readonly confidence: number }[]
  readonly relationships: readonly {
    readonly target: string
    readonly dimension: string
    readonly value: number
    readonly reason: string
  }[]
  readonly memories: readonly {
    readonly content: string
    readonly importance: number
    readonly meaning?: string
    readonly status: 'active' | 'forgotten'
  }[]
  readonly goals: readonly {
    readonly description: string
    readonly priority: number
    readonly status: 'active' | 'completed' | 'abandoned'
    readonly reason?: string
  }[]
  readonly intentions: readonly {
    readonly description: string
    readonly trigger: {
      readonly kind: string
      readonly at?: string
      readonly when?: string
      readonly condition?: string
    }
    readonly commitment: number
  }[]
  readonly turningPoints: readonly {
    readonly id: string
    readonly revision: number
    readonly trigger: string
    readonly interpretation: string
    readonly significance: 3 | 4 | 5
    readonly status: 'tentative' | 'integrated' | 'reversed' | 'rejected'
    readonly changes: readonly {
      readonly dimension: 'belief' | 'goal' | 'relationship' | 'conflict' | 'identity' | 'memory'
      readonly subject: string
      readonly before?: string
      readonly after: string
    }[]
    readonly sourceRefs: readonly string[]
    readonly createdAt: string
    readonly updatedAt: string
  }[]
}

function actorStateView(view: ActorPrivateShape): StoryActorStateView {
  return {
    actorId: view.descriptor.id,
    displayName: view.descriptor.displayName,
    persona: view.descriptor.persona,
    lifecycle: 'active',
    dynamicState: view.dynamicState,
    facets: [],
    emotions: view.emotions.map(({ emotion, intensity, toward, cause, impulse }) => ({
      emotion,
      intensity,
      toward,
      ...cause === undefined ? {} : { cause },
      ...impulse === undefined ? {} : { impulse },
    })),
    beliefs: view.beliefs.map(({ proposition, stance, confidence }) => ({ proposition, stance, confidence })),
    relationships: view.relationships.map(({ target, dimension, value, reason }) => ({ target, dimension, value, reason })),
    memories: view.memories.map(({ content, importance, meaning, status }) => ({
      content,
      importance,
      status,
      ...meaning === undefined ? {} : { meaning },
    })),
    goals: view.goals.map(({ description, priority, status, reason }) => ({
      description,
      priority,
      status,
      ...reason === undefined ? {} : { reason },
    })),
    intentions: view.intentions.map(({ description, trigger, commitment }) => ({
      description,
      trigger: trigger.kind === 'world-time' ? trigger.at ?? trigger.kind : trigger.when ?? trigger.condition ?? trigger.kind,
      commitment,
    })),
    turningPoints: view.turningPoints.map(point => ({
      id: point.id,
      revision: point.revision,
      trigger: point.trigger,
      interpretation: point.interpretation,
      significance: point.significance,
      status: point.status,
      changes: point.changes.map(change => ({ ...change })),
      sourceRefs: [...point.sourceRefs],
      createdAt: point.createdAt,
      updatedAt: point.updatedAt,
    })),
  }
}

function failure(code: string, error: unknown, details: object): TypertRemoteFailure {
  return new TypertRemoteFailure({
    code,
    message: error instanceof Error ? error.message : String(error),
    details,
  })
}



export default StoryController

/** Runtime consumers resolve the independent registry, while template editing retains its authored snapshot. */
function instanceStorybook(story: Story, document: StorybookDocument): StorybookDocument {
  return story.world.characters.initialized
    ? { ...document, characters: story.world.characters.entries.filter(item => !item.archived).map(item => item.definition) } : document
}
