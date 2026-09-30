import type { CreativeSettingsView, CreativeSourceInput, PublishCreativeInput } from '@deepseek-ai/dsh-roleplay-core/creative-application'
import type { GlobalCreativeSettings } from '@deepseek-ai/dsh-roleplay-core/creative-settings'
import type {} from '@deepseek-ai/dsh-host-directory-picker'
import type { DirectoryListing } from '@deepseek-ai/dsh-host-directory-picker/types'
import type { ContextRecipe } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import type { OutlinePlayerUpdateInput, SettingsUpdateInput, CreatePersonInput, RevisePersonInput, StageSceneInput, ObservationInput, StyleUpdateInput, StartDiscussionInput, DiscussionControlInput, EmbodimentInput, MaterialSelection, CognitionRevisionInput, ExtractDraftInput } from '@deepseek-ai/dsh-roleplay-core/command-inputs'
import type { InstanceOverview, AuthorWorkspaceView, EmbodimentChoicesView, BookDraftInput, AuthorPeopleQuery, PlayQueryRequest, PerspectiveRequest } from '@deepseek-ai/dsh-roleplay-core/types'
import { PlayFeed } from './play-feed.ts'
import type { RetentionReviewInput, NarrativeRecallInput } from '@deepseek-ai/dsh-roleplay-core/command-inputs'
import type { RetentionReviewView, NarrativeRecallView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { ExecutionHistoryScope, ExecutionRequestPage, ExecutionRequestDetail } from '@deepseek-ai/dsh-roleplay-core/types'
import type { PlayerCommand, PlayFollowRequest } from './types.ts'
/** Independent-instance RPC entry: host authority and typed delegation, without storage access. */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteFailure, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-roleplay-services'
import { RoleplayError } from '@deepseek-ai/dsh-roleplay-core'
import type { CommandStatus } from '@deepseek-ai/dsh-roleplay-core/types'
import type { ExecutionModelSelection, ExecutionModelView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { ExecutionLiveRequest, ExecutionLiveView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { BookId, CommandId, CommandScope, InstanceId, TemplateVersionId, BookDraft, Instance, TemplateVersion, PlayView,
  RestoreResult, DirectorContextView, DirectorRunView, Json, CommandEffectResult,
  AuthorPeopleView, CharacterCognitionView, NarrativeCommit, ActorContextView, DiscussionRunView, ExtractionPreview } from '@deepseek-ai/dsh-roleplay-core/types'

declare module '@deepseek-ai/cordis' {
  interface Context { roleplayController: RoleplayController }
}

/** The independent product entry delegates narrative ownership and technical settings to their respective services. */
export class RoleplayController extends TypertRemoteService {
  /** Use the host's configured native or in-app directory chooser. */
  @Remote('creationDirectory')
  async creationDirectory(request: { path?: string }, signal: AbortSignal):
  Promise<{ path: string | null; listing: DirectoryListing | null }> {
    const picker = this.ctx.directoryPicker.capability()
    if (picker.kind === 'native') return { path: await picker.pick(signal), listing: null }
    return { path: null, listing: await picker.list(request.path, signal) }
  }

  /** Read explicit creation-task guidance or the defaults for future tasks. */
  @Remote('creationPreferences')
  creationPreferences(request: { bookId?: BookId }): { revision: number; cwd: string | null; prompt: string; role: 'system' | 'user' | 'assistant'; enabled: boolean } {
    return this.ctx.roleplayCreation.read(request.bookId)
  }

  /** Save author guidance and a selected local workspace independently of story versions. */
  @Remote('saveCreationPreferences')
  saveCreationPreferences(request: { bookId?: BookId; revision: number; cwd: string | null; prompt: string; role: 'system' | 'user' | 'assistant'; enabled: boolean }): Promise<{ revision: number; cwd: string | null; prompt: string; role: 'system' | 'user' | 'assistant'; enabled: boolean }> {
    return this.ctx.roleplayCreation.save(request.bookId, { revision: request.revision, cwd: request.cwd,
      prompt: request.prompt, role: request.role, enabled: request.enabled })
  }
  static inject = ['roleplayMemoryQueue', 'directoryPicker', 'roleplayCreation', 'roleplayExecutionModel', 'roleplayCommandStatus', 'roleplayRetention', 'roleplayRetentionViews', 'roleplayPlanning', 'roleplayAuthor', 'typert', 'roleplayBooks', 'roleplayInstances', 'roleplayPeople', 'roleplayCognition', 'roleplayConfiguration', 'roleplayCreative',
    'roleplayWorld', 'roleplayViews', 'roleplayPlay', 'roleplayRuntime', 'roleplayDiscussions', 'roleplayDiscussionRuntime', 'roleplayExecutionHistory',
    'roleplayArchives', 'roleplayExtraction', 'roleplayHistory', 'roleplayRecovery', 'roleplayDirector', 'roleplayDirectorViews', 'roleplayTransfer', 'roleplayChanges', 'roleplayPlayer']

  /** @param ctx - narrow application capabilities provided by the composition. */
  constructor(ctx: Context) {
    super(ctx, 'roleplayController', { namespace: 'roleplay' })
    this.feed = new PlayFeed(ctx.roleplayChanges, ctx.roleplayPlay)
    ctx.effect(() => () => { this.feed.dispose() })
  }
  private readonly feed: PlayFeed

  /** Read system initialization values independently of any book or instance.
   * @returns The system recipe and its defaults revision.
   */
  @Remote('contextDefaults')
  contextDefaults(): Promise<ContextRecipe> { return this.invoke(() => this.ctx.roleplayBooks.contextDefaults()) }
  /** Save reviewed initial values; existing books and instances retain their own snapshots.
   * @param request - Complete recipe carrying the last-read defaults revision.
   * @returns The accepted initial values and incremented revision.
   */
  @Remote('saveContextDefaults')
  saveContextDefaults(request: { recipe: ContextRecipe }): Promise<ContextRecipe> {
    return this.invoke(() => this.ctx.roleplayBooks.saveContextDefaults(request.recipe))
  }

  /** Read shared modules belonging only to the selected library book. */
  @Remote('globalCreative')
  globalCreative(request: { bookId: BookId }): Promise<GlobalCreativeSettings> {
    return this.invoke(() => this.ctx.roleplayCreative.global(request.bookId))
  }
  /** Read sources and effective, pinned, and shared values without applying updates.
   * @param request - Story identity that scopes the configuration comparison.
   * @returns A read-only snapshot for reviewing synchronization choices.
   */
  @Remote('creativeSettings')
  creativeSettings(request: { instanceId: InstanceId }): Promise<CreativeSettingsView> {
    return this.invoke(() => this.ctx.roleplayCreative.read(request.instanceId))
  }
  /** Publish explicitly selected user-owned settings; no instance is overwritten. */
  @Remote('publishCreative')
  publishCreative(request: PublishCreativeInput): Promise<GlobalCreativeSettings> {
    return this.invoke(() => this.ctx.roleplayCreative.publish(request))
  }
  /** Save a source selection while retaining the independent module value. */
  @Remote('bindCreative')
  bindCreative(request: PlayerCommand & { input: CreativeSourceInput }): Promise<NarrativeCommit> {
    return this.invoke(() => this.ctx.roleplayCreative.bind(this.scope(request), request.input))
  }

  /** Read the application-owned page budget before mounting a browser query consumer. */
  @Remote('queryLimits')
  queryLimits(): { pageLimit: number } { return this.ctx.roleplayPlay.limits() }

  /** Execution preferences are host settings, independent of story revisions and author facts. */
  @Remote('executionModel')
  executionModel(): ExecutionModelView { return this.ctx.roleplayExecutionModel.read() }

  /** Save a validated route for subsequent executions, without recreating characters. */
  @Remote('selectExecutionModel')
  selectExecutionModel(request: { expectedRevision: number; selection: ExecutionModelSelection }): Promise<ExecutionModelView> {
    return this.ctx.roleplayExecutionModel.save(request)
  }

  /** Author-only execution diagnostics never publish draft output as fictional events. */
  @Remote({ mode: 'stream' })
  followExecution(request: ExecutionLiveRequest, signal: AbortSignal): AsyncIterable<ExecutionLiveView> {
    return this.ctx.roleplayExecutionHistory.follow(request, signal)
  }

  /** Resolve whether a failed browser attempt already crossed the narrative commit point. */
  @Remote('commandStatus')
  commandStatus(request: { instanceId: InstanceId; commandId: CommandId }): Promise<CommandStatus> {
    return this.invoke(() => this.ctx.roleplayCommandStatus.read(request.instanceId, request.commandId))
  }

  /** Read native accumulated accounting for the current story, across director and character sessions. */
  @Remote('executionUsage')
  executionUsage(request: { instanceId: InstanceId }): Promise<import('@deepseek-ai/dsh-roleplay-core/types').ExecutionUsageTotals> {
    return this.invoke(() => this.ctx.roleplayExecutionHistory.usage(request.instanceId))
  }

  /** Read bounded author diagnostics through the application query, without parsing Session events. */
  @Remote('executionRequests')
  executionRequests(request: ExecutionHistoryScope & { offset: number; limit: number }): Promise<ExecutionRequestPage> {
    return this.invoke(() => this.ctx.roleplayExecutionHistory.list(request, request.offset, request.limit))
  }

  /** Inspect the historical serialized request selected from its instance-scoped index. */
  @Remote('executionRequest')
  executionRequest(request: ExecutionHistoryScope & { requestId: number; evidenceId?: string }): Promise<ExecutionRequestDetail> {
    return this.invoke(() => this.ctx.roleplayExecutionHistory.read(request, request.requestId, request.evidenceId))
  }

  /** Save instance context modules using the reviewed recipe and narrative revisions. */
  @Remote('contextRecipe')
  contextRecipe(request: PlayerCommand & { input: ContextRecipe }): Promise<NarrativeCommit> {
    return this.invoke(() => this.ctx.roleplayConfiguration.setRecipe(this.scope(request), request.input))
  }

  /** Inspect player-reviewable proposals without creating an execution session. */
  @Remote('retention')
  retention(request: { instanceId: InstanceId; owner: string; revision?: number }): Promise<RetentionReviewView> {
    return this.invoke(() => this.ctx.roleplayRetentionViews.review(request.instanceId, request.owner, request.revision))
  }

  /** Approve, reject, edit, or pin through the retention application's transaction. */
  @Remote('reviewRetention')
  reviewRetention(request: PlayerCommand & { input: RetentionReviewInput }): Promise<NarrativeCommit> {
    return this.invoke(() => this.ctx.roleplayRetention.review(this.scope(request), request.input))
  }

  /** Author browsing chooses a perspective explicitly; model tools cannot select an owner. */
  @Remote('memoryJobs')
  memoryJobs(request: { instanceId: InstanceId }): Promise<readonly import('@deepseek-ai/dsh-roleplay-core/types').MemoryJob[]> {
    return this.invoke(() => this.ctx.roleplayMemoryQueue.list(request.instanceId))
  }
  @Remote('memoryJob')
  memoryJob(request: { instanceId: InstanceId; jobId: string }): Promise<import('@deepseek-ai/dsh-roleplay-core/types').MemoryJob> {
    return this.invoke(() => this.ctx.roleplayMemoryQueue.detail(request.instanceId, request.jobId))
  }
  @Remote('retryMemoryJob')
  retryMemoryJob(request: { instanceId: InstanceId; jobId: string }): Promise<void> {
    return this.invoke(() => { this.ctx.roleplayMemoryQueue.retry(request.instanceId, request.jobId) })
  }

  @Remote('recall')
  recall(request: { instanceId: InstanceId; owner: string; revision?: number; input: NarrativeRecallInput }): Promise<NarrativeRecallView> {
    return this.invoke(() => this.ctx.roleplayRetentionViews.recall(request.instanceId, request.owner, request.input, request.revision))
  }

  /** Stream a current bounded audience view, replacing it after committed revisions. */
  @Remote({ mode: 'stream' })
  followPlay(request: PlayFollowRequest, signal: AbortSignal): AsyncIterable<PlayView> { return this.feed.follow(request, signal) }

  /** Publish an explicitly player-authored character intervention without opening an Actor. */
  @Remote('embody')
  embody(request: PlayerCommand & { input: EmbodimentInput }): Promise<CommandEffectResult> {
    return this.invoke(() => this.ctx.roleplayPlayer.embody(this.scope(request), request.input))
  }

  @Remote('controlPlayer')
  controlPlayer(request: PlayerCommand & { actorId: string | null }): Promise<CommandEffectResult> {
    return this.invoke(() => this.ctx.roleplayPlayer.control(this.scope(request), request.actorId))
  }

  @Remote('passPlayer')
  passPlayer(request: PlayerCommand): Promise<CommandEffectResult> {
    return this.invoke(() => this.ctx.roleplayPlayer.passDiscussion(this.scope(request)))
  }

  /** Settle an explicit player world intervention and invalidate earlier model requests. */
  @Remote('intervene')
  intervene(request: PlayerCommand & { input: ObservationInput }): Promise<CommandEffectResult> {
    return this.invoke(() => this.ctx.roleplayPlayer.intervene(this.scope(request), request.input))
  }

  /** Publish a player-visible scene change with its audience resolved by the application. */
  @Remote('interveneScene')
  interveneScene(request: PlayerCommand & { content: string }): Promise<CommandEffectResult> {
    return this.invoke(() => this.ctx.roleplayPlayer.interveneScene(this.scope(request), request.content))
  }

  /** Prepare a scene and dispatch its accepted actor response plan; actor-facing guidance is explicit and optional. */
  @Remote('advance')
  advance(request: PlayerCommand & { instruction: string; actorFacingBeat?: string }): Promise<DirectorRunView> {
    return this.invoke(() => this.ctx.roleplayDirector.run(this.scope(request), request.instruction, request.actorFacingBeat))
  }

  /** Preview the exact director renderer at an explicit story revision. */
  @Remote('directorContextPreview')
  directorContextPreview(request: { instanceId: InstanceId; revision?: number; instruction: string }): Promise<DirectorContextView> {
    return this.invoke(() => this.ctx.roleplayDirectorViews.context(request))
  }

  /** Export a revision-pinned archive with associated complete execution evidence. */
  @Remote('exportArchive')
  exportArchive(request: { instanceId: InstanceId; expectedRevision: number }): Promise<Json> {
    return this.invoke(() => this.ctx.roleplayTransfer.export(request.instanceId, request.expectedRevision))
  }

  /** Import portable data into an independent instance and preserve its original evidence. */
  @Remote('importArchive')
  importArchive(request: { commandId: CommandId; archive: Json }): Promise<Instance> {
    return this.invoke(() => this.ctx.roleplayTransfer.import(request.archive, request.commandId))
  }

  /** List author drafts without opening execution sessions. */
  @Remote('books')
  books(): readonly BookDraft[] { return this.ctx.roleplayBooks.list() }

  /** List independent instances and their pinned version identities. */
  @Remote('instances')
  instances(): readonly InstanceOverview[] { return this.ctx.roleplayAuthor.instances() }

  /** Edit non-canonical planning or review a director suggestion at its exact revision. */
  @Remote('planning')
  planning(request: PlayerCommand & { input: OutlinePlayerUpdateInput }): Promise<NarrativeCommit> {
    return this.invoke(() => this.ctx.roleplayPlanning.update(this.scope(request), request.input))
  }

  /** Resolve the author workspace at the requested narrative revision. */
  @Remote('authorWorkspace')
  authorWorkspace(request: { instanceId: InstanceId; revision?: number; actorId?: string }): Promise<AuthorWorkspaceView> {
    return this.invoke(() => this.ctx.roleplayAuthor.workspace(request))
  }

  /** Return player-only control choices from the active cast and embodiment choices from the visible scene. */
  @Remote('embodimentChoices')
  embodimentChoices(request: { instanceId: InstanceId; revision?: number }): Promise<EmbodimentChoicesView> {
    return this.invoke(() => this.ctx.roleplayPlay.embodimentChoices(request.instanceId, request.revision))
  }

  /** Edit ongoing instance configuration through its application owner. */
  @Remote('settings')
  settings(request: PlayerCommand & { input: SettingsUpdateInput }): Promise<NarrativeCommit> {
    return this.invoke(() => this.ctx.roleplayConfiguration.setSettings(this.scope(request), request.input))
  }

  /** Inspect one immutable version, even if its editable library entry was removed. */
  @Remote('bookVersion')
  bookVersion(request: { templateVersionId: TemplateVersionId }): Promise<TemplateVersion> {
    return this.invoke(() => this.ctx.roleplayBooks.version(request.templateVersionId))
  }

  /** Remove only the editable library entry; pinned versions and resources remain available. */
  @Remote('removeBook')
  removeBook(request: { bookId: BookId; expectedRevision: number }): Promise<void> {
    return this.invoke(() =>{  this.ctx.roleplayBooks.remove(request.bookId, request.expectedRevision) })
  }

  /** Save an author draft at its exact reviewed revision. */
  @Remote('saveDraft')
  saveDraft(request: BookDraftInput): Promise<BookDraft> {
    return this.invoke(() => this.ctx.roleplayBooks.saveDraft(request))
  }

  /** Preview normalized defaults and settings before publishing an immutable version. */
  @Remote('previewPublication')
  previewPublication(request: { bookId: BookId; expectedRevision: number }): Promise<BookDraft> {
    return this.invoke(() => this.ctx.roleplayBooks.previewPublication(request.bookId, request.expectedRevision))
  }

  /** Publish a new immutable book version. */
  @Remote('publish')
  publish(request: { bookId: BookId; expectedRevision: number }): Promise<TemplateVersion> {
    return this.invoke(() => this.ctx.roleplayBooks.publish(request.bookId, request.expectedRevision))
  }

  /** Seed one independent world from an explicitly selected published version. */
  @Remote('createStory')
  createStory(request: { templateVersionId: TemplateVersionId; commandId: CommandId }): Promise<Instance> {
    return this.invoke(() => this.ctx.roleplayInstances.createStory(request).instance)
  }

  /** Restart with the original instance's book version and no runtime inheritance. */
  @Remote('restart')
  restart(request: { instanceId: InstanceId; commandId: CommandId }): Promise<Instance> {
    return this.invoke(() => this.ctx.roleplayInstances.restart(request).instance)
  }

  /** Return the selected audience's play projection, including historical publication labels. */
  @Remote('play')
  play(request: PlayQueryRequest): Promise<PlayView> { return this.invoke(() => this.ctx.roleplayPlay.read(request)) }

  /** Query author-visible character records using a bounded page. */
  @Remote('characters')
  characters(request: { instanceId: InstanceId; query: AuthorPeopleQuery; revision?: number }): Promise<AuthorPeopleView> {
    return this.invoke(() => this.ctx.roleplayViews.authorPeople(request.instanceId, request.query, request.revision))
  }

  /** Register a persistent instance character without provisioning an Actor. */
  @Remote('createCharacter')
  createCharacter(request: PlayerCommand & { input: CreatePersonInput }): Promise<NarrativeCommit> {
    return this.invoke(() => this.ctx.roleplayPeople.create(this.scope(request), request.input))
  }

  /** Revise current character settings without reapplying initial cognition or state. */
  @Remote('reviseCharacter')
  reviseCharacter(request: PlayerCommand & { input: RevisePersonInput }): Promise<NarrativeCommit> {
    return this.invoke(() => this.ctx.roleplayPeople.revise(this.scope(request), request.input))
  }

  /** Inspect current private cognition and retained lifecycle history without an Actor session. */
  @Remote('cognition')
  cognition(request: { instanceId: InstanceId; actorId: string; revision?: number }): Promise<CharacterCognitionView> {
    return this.invoke(() => this.ctx.roleplayViews.authorCognition(request.instanceId, request.actorId, request.revision))
  }

  /** Apply a player cognition revision through the owning application transaction. */
  @Remote('reviseCognition')
  reviseCognition(request: PlayerCommand & { actorId: string; input: CognitionRevisionInput }): Promise<NarrativeCommit> {
    return this.invoke(() => this.ctx.roleplayCognition.revise(this.scope(request), request.actorId, request.input))
  }

  /** Set explicit scene attendance through world authority. */
  @Remote('stageScene')
  stageScene(request: PlayerCommand & { input: StageSceneInput }): Promise<NarrativeCommit> {
    return this.invoke(() => this.ctx.roleplayPeople.stage(this.scope(request), request.input))
  }

  /** Settle objective changes and explicit perception audiences. */
  @Remote('observe')
  observe(request: PlayerCommand & { input: ObservationInput }): Promise<NarrativeCommit> {
    return this.invoke(() => this.ctx.roleplayWorld.observe(this.scope(request), request.input))
  }

  /** Apply story style or temporary scene guidance at the current revision. */
  @Remote('style')
  style(request: PlayerCommand & { input: StyleUpdateInput }): Promise<NarrativeCommit> {
    return this.invoke(() => this.ctx.roleplayConfiguration.setStyle(this.scope(request), request.input))
  }

  /** Preview the same revision-bound perspective used by the next character request. */
  @Remote('contextPreview')
  contextPreview(request: PerspectiveRequest): Promise<ActorContextView> {
    return this.invoke(() => this.ctx.roleplayViews.actorContext(request))
  }

  /** Start a discussion through its application owner. */
  @Remote('startDiscussion')
  startDiscussion(request: PlayerCommand & { input: StartDiscussionInput }): Promise<NarrativeCommit> {
    return this.invoke(() => this.ctx.roleplayDiscussions.start(this.scope(request), request.input))
  }

  /** Request the floor, intervene, resume, or explicitly close a discussion. */
  @Remote('controlDiscussion')
  controlDiscussion(request: PlayerCommand & { input: DiscussionControlInput }): Promise<CommandEffectResult> {
    return this.invoke(() => this.ctx.roleplayPlayer.controlDiscussion(this.scope(request), request.input))
  }

  /** Advance floor owners until a real stop condition or the configured bound. */
  @Remote('advanceDiscussion')
  advanceDiscussion(request: PlayerCommand): Promise<DiscussionRunView> {
    return this.invoke(async () => {
      const run = await this.ctx.roleplayDiscussionRuntime.advance(this.scope(request))
      if (run.status === 'awaiting-director') {
        const snapshot = this.ctx.roleplayHistory.snapshot(request.instanceId)
        const id = `${request.commandId}:discussion-summary` as CommandId
        const receipt = this.ctx.roleplayHistory.receipt(request.instanceId, id)
        if (receipt === undefined && snapshot.instance.epoch !== run.epoch) throw new Error('Discussion was interrupted before director continuation')
        await this.ctx.roleplayDirector.summarizeDiscussion({ ...this.scope(request),
          id, expectedRevision: receipt?.command.expectedRevision ?? snapshot.instance.revision })
      }
      return run
    })
  }

  /** Run one character with host-created authority and a stale-result fence. */
  @Remote('runCharacter')
  runCharacter(request: PlayerCommand & { actorId: string }): Promise<NarrativeCommit> {
    return this.invoke(() => this.ctx.roleplayRuntime.run(this.scope(request), request.actorId))
  }

  /** Invalidate live attempts before asking their execution adapters to cancel. */
  @Remote('pause')
  pause(request: PlayerCommand & { reason: string }): Promise<NarrativeCommit> {
    return this.invoke(() => this.ctx.roleplayDirector.pause(this.scope(request), request.reason))
  }

  /** Preview selected reusable material without changing an instance or book. */
  @Remote('previewExtraction')
  previewExtraction(request: { instanceId: InstanceId; selection: MaterialSelection; title: string }): Promise<ExtractionPreview> {
    return this.invoke(() => this.ctx.roleplayExtraction.preview(request.instanceId, request.selection, request.title))
  }

  /** Save only the explicitly reviewed material into a fresh book draft. */
  @Remote('extractDraft')
  extractDraft(request: ExtractDraftInput): Promise<BookDraft> {
    return this.invoke(() => this.ctx.roleplayExtraction.save(request))
  }

  /** Save a narrative revision together with separately captured execution boundaries. */
  @Remote('checkpoint')
  checkpoint(request: PlayerCommand & { name: string }): Promise<Instance> {
    return this.invoke(async () => (await this.ctx.roleplayRecovery.checkpoint(this.scope(request), request.name)).instance)
  }

  /** List narrative boundaries without exposing or parsing execution coordinates. */
  @Remote('checkpoints')
  checkpoints(request: { instanceId: InstanceId }): Promise<readonly { name: string; revision: number }[]> {
    return this.invoke(() => this.ctx.roleplayHistory.checkpoints(request.instanceId)
      .map(item => ({ name: item.name, revision: item.revision })))
  }

  /** Restore by compensation and report cancellation separately from the accepted narrative commit. */
  @Remote('removeInstance')
  removeInstance(request: PlayerCommand): Promise<RestoreResult> {
    return this.invoke(() => this.ctx.roleplayRecovery.remove(this.scope(request), 'Player removed the story instance'))
  }

  /** Replace a player direction through the recovery owner, then resume the same instance. */
  @Remote('rewriteDirection')
  rewriteDirection(request: PlayerCommand & { targetRevision: number; instruction: string }): Promise<DirectorRunView> {
    return this.invoke(() => this.ctx.roleplayRecovery.rewrite(this.scope(request), request.targetRevision, request.instruction,
      (scope, instruction) => this.ctx.roleplayDirector.run(scope, instruction)))
  }

  /** Restore a selected history boundary while retaining discarded commits. */
  @Remote('restore')
  restore(request: PlayerCommand & { targetRevision: number; reason: string }): Promise<RestoreResult> {
    return this.invoke(() => this.ctx.roleplayRecovery.restore(this.scope(request), request.targetRevision, request.reason))
  }

  private scope(request: PlayerCommand): CommandScope {
    return { instanceId: request.instanceId, id: request.commandId, expectedRevision: request.expectedRevision, principal: { kind: 'player' } }
  }

  private async invoke<T>(operation: () => T | Promise<T>): Promise<T> {
    try { return await operation() }
    catch (error) {
      throw new TypertRemoteFailure({ code: error instanceof RoleplayError ? `roleplay-${error.code}` : 'roleplay-command-failed',
        message: error instanceof Error ? error.message : String(error), details: {} })
    }
  }
}

export default RoleplayController
