import type { CreativeSettingsView, CreativeSourceInput, PublishCreativeInput } from '@deepseek-ai/dsh-roleplay-core/creative-application'
import type { GlobalCreativeSettings } from '@deepseek-ai/dsh-roleplay-core/creative-modules'
/** Slot shares expose business queries and named operations, without a remote or runtime aggregate. */
export type {} from './index.ts'
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { LibrarySnapshot, PlaySnapshot, AuthorSnapshot, InspectionSnapshot, PersonalStylesSnapshot } from '@deepseek-ai/dsh-api-roleplay-controller/client'
import type { StyleProfile } from '@deepseek-ai/dsh-roleplay-core/style'
import type { ExecutionLiveSnapshot } from '@deepseek-ai/dsh-api-roleplay-controller/client'
import type { BookId, BookDraft, BookDraftInput, InstanceId, PlayAudience, Json, TemplateVersionId } from '@deepseek-ai/dsh-roleplay-core/types'
import type { ContextRecipe } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import type { SettingsUpdateInput, StyleUpdateInput, CognitionRevisionInput, CreatePersonInput, RevisePersonInput, ObservationInput } from '@deepseek-ai/dsh-roleplay-core/command-inputs'
import type { createNarrativeStore, InputMode } from './stores.ts'
import type { RetentionReviewInput, NarrativeRecallInput, MaterialSelection, StartDiscussionInput, DiscussionControlInput, StageSceneInput } from '@deepseek-ai/dsh-roleplay-core/command-inputs'
import type { ExtractionPreview } from '@deepseek-ai/dsh-roleplay-core/types'
import type { ExecutionModelSelection } from '@deepseek-ai/dsh-roleplay-core/types'
import type { ExecutionModelSnapshot } from '@deepseek-ai/dsh-api-roleplay-controller/client'
import type { OutlinePlayerUpdateInput } from '@deepseek-ai/dsh-roleplay-core/command-inputs'

/** Authoring preferences belong to a task, independently of its book content. */
export type CreatorPreferences = { revision: number; cwd: string | null; prompt: string; role: 'system' | 'user' | 'assistant'; enabled: boolean }
export type CreatorDirectory = {
  path: string | null
  listing: {
    path: string
    crumbs: { name: string; path: string }[]
    entries: { name: string; path: string; hidden: boolean }[]
    truncated: boolean
  } | null
}
/** Application callbacks accept explicit instance identity and reviewed revisions. */
export interface NarrativeInjected {
  contextDefaults(): Promise<ContextRecipe>
  saveContextDefaults(recipe: ContextRecipe): Promise<ContextRecipe>
  memoryJobs(instanceId: InstanceId): Promise<readonly import('@deepseek-ai/dsh-roleplay-core/types').MemoryJob[]>
  memoryJob(instanceId: InstanceId, jobId: string): Promise<import('@deepseek-ai/dsh-roleplay-core/types').MemoryJob>
  retryMemoryJob(instanceId: InstanceId, jobId: string): Promise<void>
  globalCreative(bookId: BookId): Promise<GlobalCreativeSettings>
  creativeSettings(instanceId: InstanceId): Promise<CreativeSettingsView>
  publishCreative(input: PublishCreativeInput): Promise<GlobalCreativeSettings>
  bindCreative(instanceId: InstanceId, revision: number, input: CreativeSourceInput): Promise<void>
  readExecutionPage(scope: import('@deepseek-ai/dsh-roleplay-core/types').ExecutionHistoryScope, offset: number): Promise<import('@deepseek-ai/dsh-roleplay-core/types').ExecutionRequestPage>
  readExecutionDetail(scope: import('@deepseek-ai/dsh-roleplay-core/types').ExecutionHistoryScope, requestId: number, evidenceId?: string): Promise<import('@deepseek-ai/dsh-roleplay-core/types').ExecutionRequestDetail>
  usageT: import('@deepseek-ai/dsh-client-ui-chat/client').TurnUsageDisclosureProps['t']
  executionUsage(instanceId: InstanceId): Promise<import('@deepseek-ai/dsh-roleplay-core/types').ExecutionUsageTotals>
  turnUsage(instanceId: InstanceId, revision: number, actorId?: string): Promise<import('@deepseek-ai/dsh-roleplay-core/types').ExecutionRequestSummary | null>
  hooks: { library: HostObservable<LibrarySnapshot>
    play: HostObservable<PlaySnapshot>
    author: HostObservable<AuthorSnapshot>
    inspection: HostObservable<InspectionSnapshot>
    personalStyles: HostObservable<PersonalStylesSnapshot>
    execution: HostObservable<ExecutionLiveSnapshot>
    modelSettings: HostObservable<ExecutionModelSnapshot> }
  followExecution(instanceId: InstanceId, actorId?: string): void
  stopExecution(): void
  savePersonalStyle(name: string, profile: StyleProfile): void
  removePersonalStyle(name: string, kind: StyleProfile['kind']): void
  refreshPersonalStyles(): void
  refresh(): Promise<void>
  executionModel(): Promise<void>
  selectExecutionModel(expectedRevision: number, selection: ExecutionModelSelection): Promise<void>
  select(instanceId: InstanceId, audience: PlayAudience, offset?: number): void
  author(instanceId: InstanceId, actorId?: string, query?: string, offset?: number): Promise<void>
  history(instanceId: InstanceId, audience: PlayAudience, revision: number, offset?: number): Promise<void>
  start(templateVersionId: TemplateVersionId): Promise<void>
  createCreator(book?: BookDraft, preferences?: CreatorPreferences): Promise<void>
  creationPreferences(book?: BookDraft): Promise<CreatorPreferences>
  saveCreationPreferences(preferences: CreatorPreferences, book?: BookDraft): Promise<CreatorPreferences>
  creationDirectory(path?: string): Promise<CreatorDirectory>
  removeBook(book: BookDraft): Promise<void>
  removeInstance(instanceId: InstanceId, revision: number): Promise<void>
  rewriteDirection(instanceId: InstanceId, revision: number, targetRevision: number, instruction: string): Promise<void>
  restart(instanceId: InstanceId): Promise<void>
  saveBook(input: BookDraftInput): Promise<BookDraft>
  previewBook(book: BookDraft): Promise<BookDraft>
  publish(book: BookDraft): Promise<void>
  submit(instanceId: InstanceId, revision: number, mode: InputMode, text: string, actorId: string,
    performance: import('./player-performance.ts').PlayerPerformance, actorFacingBeat: string): Promise<void>
  pause(instanceId: InstanceId, revision: number): Promise<void>
  settings(instanceId: InstanceId, revision: number, input: SettingsUpdateInput): Promise<void>
  planning(instanceId: InstanceId, revision: number, input: OutlinePlayerUpdateInput): Promise<void>
  style(instanceId: InstanceId, revision: number, input: StyleUpdateInput): Promise<void>
  recipe(instanceId: InstanceId, revision: number, input: ContextRecipe): Promise<void>
  cognition(instanceId: InstanceId, revision: number, actorId: string, input: CognitionRevisionInput): Promise<void>
  world(instanceId: InstanceId, revision: number, input: ObservationInput): Promise<void>
  createPerson(instanceId: InstanceId, revision: number, input: CreatePersonInput): Promise<void>
  revisePerson(instanceId: InstanceId, revision: number, input: RevisePersonInput): Promise<void>
  retention(instanceId: InstanceId, revision: number, input: RetentionReviewInput): Promise<void>
  recall(input: NarrativeRecallInput): Promise<void>
  executionRequests(offset?: number): Promise<void>
  previewContext(instanceId: InstanceId, revision: number, actorId: string | undefined, instruction: string): Promise<void>
  inspectTurn(instanceId: InstanceId, revision: number, actorId?: string): Promise<void>
  executionRequest(requestId: number, evidenceId?: string): Promise<void>
  startDiscussion(instanceId: InstanceId, revision: number, input: StartDiscussionInput): Promise<void>
  controlDiscussion(instanceId: InstanceId, revision: number, input: DiscussionControlInput): Promise<void>
  advanceDiscussion(instanceId: InstanceId, revision: number): Promise<void>
  controlPlayer(instanceId: InstanceId, revision: number, actorId: string | null): Promise<void>
  passPlayer(instanceId: InstanceId, revision: number): Promise<void>
  stageScene(instanceId: InstanceId, revision: number, input: StageSceneInput): Promise<void>
  previewExtraction(instanceId: InstanceId, selection: MaterialSelection, title: string): Promise<ExtractionPreview>
  extract(instanceId: InstanceId, revision: number, selection: MaterialSelection, title: string): Promise<void>
  checkpoint(instanceId: InstanceId, revision: number, name: string): Promise<void>
  restore(instanceId: InstanceId, revision: number, targetRevision: number): Promise<void>
  exportArchive(instanceId: InstanceId, revision: number): Promise<Json>
  importArchive(archive: Json): Promise<void>
  toggleSidebar(): void
}
/** Shared browser callback, locale, and view-store seats. */
export type NarrativeProps = InjectFace<NarrativeInjected> & PropsStore<ReturnType<typeof createNarrativeStore>> & PropsLocale<'narrative'>
/** Whole play surface uses the layout-owned optional-session seat without selecting a technical session. */
export type SurfaceProps = NarrativeProps & PropsRuntime<'narrative.surface'> & PropsRenderSlots<'model.selection.control'>
/** The product sidebar retains the existing model-settings seat. */
export type LibraryProps = NarrativeProps & PropsRuntime<'sidebar.stories'>
