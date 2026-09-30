/** Story-specific adapter for the Gateway-owned snapshot stream lifecycle. */

import type { Context } from '@deepseek-ai/cordis'
import {
  RemoteSnapshotStream, RemoteStreamCarrierError, type ClientRemote,
} from '@deepseek-ai/dsh-api-gateway/client'
import type { StoryFollowFrame, StoryFollowIncrement } from '../types.ts'
import { ClientStoryModel } from './model.ts'
import type { StoryFollowSink, StoryRemote } from './model.ts'
import { StoryController } from './service.ts'

export { ClientStoryModel } from './model.ts'
export type { StoryFollowSink, StoryListPhase, StoryRemote, StorySnapshot } from './model.ts'
export { StoryController } from './service.ts'
export type { IStories, StorySource } from './service.ts'
export type { StoryCharacterQuery, StoryCharacterWorkspaceValue, StoryCharacterSaveRequest, StoryKnowledgeUpdateRequest, StoryCharacterCollectRequest } from '../types.ts'
export type {
  DirectorOutline,
  DirectorOutlinePlayerInput,
  ActorWorldSettlementInput,
  PlayerActionInput,
  PlayerDirectionInput,
  PlayerSpeechInput,
  PlayerWorldInterventionInput,
  StoryActorStateFacet,
  StoryActorStateView,
  StoryActorTurningPointDimension,
  StoryActorTurningPointStatus,
  StoryActorTurningPointView,
  StoryUpdateActorTurningPointRequest,
  StoryStateUpdateRequest,
  StorybookAuthoringValue,
  StoryPromptSettingsValue,
  StoryPromptUpdateRequest,
  StoryStyleUpdateRequest,
  StoryPromptValue,
  StoryReasoningLanguageUpdateRequest,
  StoryReasoningLanguageValue,
  StoryContextPreviewValue,
  StoryRequestContextPreviewValue,
  StoryContextRuleUpdateRequest,
  StoryContextSection,
  StoryContextRecipe,
  StoryContextRecipeSection,
  StoryDiscussion,
  StoryDiscussionState,
  StoryId,
  StoryMemoryEntry,
  StoryMemoryProposalInput,
  StoryMemoryUpdateInput,
  StoryMemoryState,
  StoryPackageExportValue,
  StoryPackageV5,
  StoryWorldState,
  WorldPatchOperation,
  StoryView,
} from '../types.ts'

type StoryStreamRemote = Pick<ClientRemote, '$stream'> & { readonly story: StoryRemote }
type StoryBaselineFrame = Extract<StoryFollowFrame, { type: 'baseline' }>

/** Gateway-owned stream configured for Story state. */
export type StoryStateStream = RemoteSnapshotStream<StoryBaselineFrame, StoryFollowIncrement>

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** React-free Client Story state and commands. */
    stories: import('./service.ts').IStories
  }
}

/** Required Client Remote services. */
export const inject = ['remote', 'remote.story']

/** Install Client Story state, commands, and reconnecting follow control. */
export function apply(ctx: Context): void {
  const remote = ctx.remote as StoryStreamRemote
  const model = new ClientStoryModel(remote.story)
  new StoryController(ctx, model)
  const control = createStoryStateStream(remote, {
    accept: model,
    carrierFailed: () => { model.handleCarrierFailure() },
    failed: (error) => { model.handleStreamFailure(error) },
  })
  control.start()
  ctx.effect(() => async () => { await control.dispose() }, 'story-controller.client.control')
}

/** Story state stream destinations. */
export interface StoryStateStreamOptions {
  readonly accept: StoryFollowSink
  readonly carrierFailed?: (error: RemoteStreamCarrierError) => void
  readonly failed: (error: unknown) => void
}

/**
 * Create the reconnecting Story state stream.
 * @param remote - Generated Remote carrier and Story namespace.
 * @param options - State destinations and failure callbacks.
 * @returns a configured stream controller; the caller owns its lifecycle.
 */
export function createStoryStateStream(
  remote: StoryStreamRemote,
  options: StoryStateStreamOptions,
): StoryStateStream {
  const stream = remote.$stream<StoryFollowFrame>({
    name: 'Story state stream',
    open: signal => remote.story.follow(signal),
    ended: accepted => accepted
      ? new RemoteStreamCarrierError('Story state stream ended without a terminal result')
      : new Error('Story state stream ended before its opening snapshot'),
    ...(options.carrierFailed === undefined ? {} : { carrierFailed: options.carrierFailed }),
  })
  return new RemoteSnapshotStream<StoryBaselineFrame, StoryFollowIncrement>(stream, {
    name: 'Story state stream',
    isSnapshot: (frame): frame is StoryBaselineFrame => frame.type === 'baseline',
    replace: (frame) => { options.accept.replaceBaseline(frame.value) },
    update: (frame) => { acceptIncrement(options.accept, frame) },
    failed: options.failed,
  })
}

function acceptIncrement(accept: StoryFollowSink, frame: StoryFollowIncrement): void {
  switch (frame.type) {
    case 'upsert':
      accept.upsertView(frame.story)
      return
    case 'remove':
      accept.removeView(frame.storyId)
      return
    default:
      return assertNever(frame)
  }
}

function assertNever(value: never): never {
  throw new Error(`unreachable Story increment: ${JSON.stringify(value)}`)
}
