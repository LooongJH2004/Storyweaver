import { CreativeSettingsApplication } from '@deepseek-ai/dsh-roleplay-core/creative-application'
import { ExecutionModelSettings } from '@deepseek-ai/dsh-experimental-actor/execution-model'
import { NarrativeNotifications } from './notifications.ts'
import { CreationWorkspace } from './creation-workspace.ts'
import { HarnessDirectorExecutor } from '@deepseek-ai/dsh-experimental-actor/director-executor'
import { HarnessRequestHistory } from '@deepseek-ai/dsh-experimental-actor/request-history'
/** Cordis composes independent applications; business code receives only explicit ports. */
import { randomUUID, createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-persistence'
import z from '@deepseek-ai/schemastery'
import { SqliteRoleplayStore, embeddedResourceVerifier } from '@deepseek-ai/dsh-roleplay-store-sqlite'
import { HarnessActorExecutor, HarnessMemoryExecutor } from '@deepseek-ai/dsh-experimental-actor/narrative-executor'
import { SessionPersistenceNotFoundError } from '@deepseek-ai/dsh-session-persistence'
import {
  MemoryQueue, memoryContext, resolveContextUpdate, CommandStatusQueries, ExecutionHistoryQueries,
  RetentionApplication, RetentionQueries, PlanningApplication,
  AuthorQueries, prepareIndependentBook, StorybookLibrary,
  InstanceApplication, NarrativeCommands, NarrativeDeliveries,
  PeopleApplication, CognitionApplication,
  WorldApplication, PerspectiveQueries, ActorRuntime, NarrativeArchives, MaterialExtraction,
  ConfigurationApplication, DiscussionApplication, DiscussionRuntime, PlayQueries, RecoveryApplication,
  DirectorCommands, DirectorQueries, DirectorRuntime, NarrativeTransfer, PlayerApplication,
} from '@deepseek-ai/dsh-roleplay-core'
import type { Config as CharacterLimits } from '@deepseek-ai/dsh-roleplay-core/actor-model'
import type { InstanceChanges } from '@deepseek-ai/dsh-roleplay-core'

/** Application service names keep authoring, instance commands, queries, and execution separate. */
declare module '@deepseek-ai/cordis' {
  interface Context {
    roleplayMemoryQueue: MemoryQueue
    roleplayCommandStatus: CommandStatusQueries
    roleplayExecutionHistory: ExecutionHistoryQueries
    roleplayRetention: RetentionApplication
    roleplayRetentionViews: RetentionQueries
    roleplayExecutionModel: ExecutionModelSettings
    roleplayPlanning: PlanningApplication
    roleplayAuthor: AuthorQueries
    roleplayPlayer: PlayerApplication
    roleplayChanges: InstanceChanges
    roleplayDirector: DirectorRuntime
    roleplayDirectorViews: DirectorQueries
    roleplayBooks: StorybookLibrary
    roleplayCreation: CreationWorkspace
    roleplayInstances: InstanceApplication
    roleplayPeople: PeopleApplication
    roleplayCognition: CognitionApplication
    roleplayCreative: CreativeSettingsApplication
    roleplayConfiguration: ConfigurationApplication
    roleplayDiscussions: DiscussionApplication
    roleplayDiscussionRuntime: DiscussionRuntime
    roleplayWorld: WorldApplication
    roleplayViews: PerspectiveQueries
    roleplayPlay: PlayQueries
    roleplayRuntime: ActorRuntime
    roleplayTransfer: NarrativeTransfer
    roleplayArchives: NarrativeArchives
    roleplayRecovery: RecoveryApplication
    roleplayExtraction: MaterialExtraction
    roleplayHistory: Pick<NarrativeCommands, 'snapshot' | 'replay' | 'checkpoints' | 'checkpoint' | 'restore' | 'receipt'>
    roleplayDeliveries: NarrativeDeliveries
  }
}

/** The composition requires an explicit new database, model, execution limits, and recall page limit. */
export interface Config {
  readonly databasePath: string
  readonly journalMode: 'wal' | 'delete' | 'truncate' | 'persist'
  readonly busyTimeoutMs: number
  readonly provider: string
  readonly model: string
  readonly characterLimits: Required<CharacterLimits>
  readonly recallCharacterLimit: number
  readonly maxContextUpdateUnits: number
  readonly memoryQueueIntervalMs: number
  readonly notificationIntervalMs: number
  readonly directorCommandLimit: number
  readonly worldFeedbackLimit: number
  readonly reactiveDirectorLimit: number
  readonly directorConsolidationThreshold: number
  readonly consolidationThreshold: number
  readonly consolidationBatchLimit: number
  readonly discussionTurnLimit: number
  readonly queryPageLimit: number
}
/** Deployment values are required; this plugin never derives a path from a running story. */
export const Config: z<Config> = z.object({
  databasePath: z.string().required(), journalMode: z.union(['wal', 'delete', 'truncate', 'persist']).required(),
  busyTimeoutMs: z.number().step(1).min(0).required(), provider: z.string().required(), model: z.string().required(),
  characterLimits: z.object({
    maxCoreMemories: z.number().step(1).min(1).required(), maxRecallResults: z.number().step(1).min(1).required(),
    maxTextBytes: z.number().step(1).min(1).required(), maxSourceRefs: z.number().step(1).min(1).required(),
    maxActiveGoals: z.number().step(1).min(1).required(), maxScheduledIntentions: z.number().step(1).min(1).required(),
  }).required(),
  recallCharacterLimit: z.number().step(1).min(1).required(),
  queryPageLimit: z.number().step(1).min(1).required(),
  memoryQueueIntervalMs: z.number().step(1).min(50).default(1000),
  notificationIntervalMs: z.number().step(1).min(1).required(),
  directorCommandLimit: z.number().step(1).min(1).required(),
  worldFeedbackLimit: z.number().step(1).min(0).default(2),
  reactiveDirectorLimit: z.number().step(1).min(0).default(0),
  directorConsolidationThreshold: z.number().step(1).min(0).default(0),
  consolidationThreshold: z.number().step(1).min(0).default(0),
  consolidationBatchLimit: z.number().step(1).min(1).default(1),
  discussionTurnLimit: z.number().step(1).min(1).required(),
  maxContextUpdateUnits: z.number().step(1).min(1).required(),
})
/** Composition plugin name. */
export const name = 'roleplay-services'
/** Sessions and model execution come from the supported Harness profile. */
export const inject = ['agents', 'sessions', 'sessionPersistence', 'llm']

/**
 * Mount independent application capabilities and release execution before closing storage.
 * @param ctx - Cordis composition scope; it is never passed into the narrative applications.
 * @param config - explicit storage, model, and budget configuration.
 * @returns registration of the model-dependent application scope; Loader tracks its asynchronous initialization.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.plugin(ExecutionModelSettings, { provider: config.provider, model: config.model })
  ctx.inject(['roleplayExecutionModel'], ctx => mount(ctx, config))
}

async function mount(ctx: Context, config: Config): Promise<void> {
  ctx.plugin(HarnessRequestHistory)
  if (!isAbsolute(config.databasePath)) throw new Error('Narrative database path must be absolute')
  await mkdir(dirname(config.databasePath), { recursive: true })
  const store = new SqliteRoleplayStore({ path: config.databasePath, journalMode: config.journalMode, busyTimeoutMs: config.busyTimeoutMs })
  try {
    const values = { id: randomUUID, now: () => new Date().toISOString() }
    const commands = new NarrativeCommands(store, values, (snapshot, command) => {
      const reader = { snapshot: () => snapshot, replay: () => snapshot }
      const instruction = command.kind === 'director.open' && typeof command.input === 'object' && command.input !== null
        && !Array.isArray(command.input) && typeof command.input.instruction === 'string' ? command.input.instruction : ''
      new DirectorQueries(reader, config.recallCharacterLimit, config.queryPageLimit)
        .context({ instanceId: snapshot.instance.id, instruction })
      const actorQueries = new PerspectiveQueries(reader, config.recallCharacterLimit, fieldReference, config.queryPageLimit)
      for (const person of snapshot.entities.filter(item => item.key.collection === 'people')) {
        actorQueries.actorContext({ instanceId: snapshot.instance.id, actorId: person.key.id, query: '' })
      }
    })
    ctx.provide('roleplayCreative', new CreativeSettingsApplication(store, commands, values))
    ctx.provide('roleplayCommandStatus', new CommandStatusQueries(commands))
    const books = new StorybookLibrary(store, values, embeddedResourceVerifier, prepareIndependentBook)
    ctx.provide('roleplayCreation', new CreationWorkspace(store, books))
    const fieldReference = (id: string): string => `field-${createHash('sha256').update(id).digest('hex').slice(0, 32)}`
    const cognition = new CognitionApplication(commands, values,
      { limits: config.characterLimits, maxContextUpdateUnits: config.maxContextUpdateUnits, fieldReference })
    const views = new PerspectiveQueries(commands, config.recallCharacterLimit, fieldReference, config.queryPageLimit)
    const executionOptions = {
      agentOptions: { provider: config.provider, model: config.model }, setup: async () => {},
      selection: () => ctx.roleplayExecutionModel.selection(),
      exists: async (id: import('@deepseek-ai/dsh-session').SessionId) => {
        try { await ctx.sessionPersistence.inspect(id); return true }
        catch (error) { if (error instanceof SessionPersistenceNotFoundError) return false; throw error }
      },
      flush: async (session: import('@deepseek-ai/dsh-session').Session) => { await ctx.sessions.flush(session) },
    }
    const executor = new HarnessActorExecutor(ctx.agents, executionOptions)
    const directorExecutor = new HarnessDirectorExecutor(ctx.agents, executionOptions)
    const memoryExecutor = new HarnessMemoryExecutor(ctx.agents, executionOptions)
    const memoryPort = { enqueue: (instanceId: import('@deepseek-ai/dsh-roleplay-core').InstanceId, owner: string, boundary?: boolean) => {
      try { memory.enqueue(instanceId, owner, boundary) }
      catch (error) { ctx.logger('roleplay-memory').error(error) }
    } }
    const runtime = new ActorRuntime(commands, cognition, views, executor, values,
      config.consolidationThreshold, config.consolidationBatchLimit, memoryPort)
    const discussionRuntime = new DiscussionRuntime(commands, runtime, values, config.discussionTurnLimit)
    const directorQueries = new DirectorQueries(commands, config.recallCharacterLimit, config.queryPageLimit)
    const director = new DirectorRuntime(commands, new DirectorCommands(commands, values, config.maxContextUpdateUnits),
      directorQueries, views, directorExecutor,
      runtime, discussionRuntime, values, config.directorCommandLimit, config.recallCharacterLimit, config.worldFeedbackLimit,
      config.directorConsolidationThreshold, memoryPort, config.reactiveDirectorLimit)
    const memory = new MemoryQueue(store, commands, values, {
      generate: async (job, snapshot, signal, submit) => {
        const reader = { snapshot: () => snapshot, replay: () => snapshot }
        const input = { instanceId: snapshot.instance.id, revision: snapshot.instance.revision }
        const base = job.owner === 'director'
          ? new DirectorQueries(reader, config.recallCharacterLimit, config.queryPageLimit).context({ ...input, instruction: '', purpose: 'consolidation' })
          : new PerspectiveQueries(reader, config.recallCharacterLimit, fieldReference, config.queryPageLimit)
            .actorContext({ ...input, actorId: job.owner.slice(6), query: '' })
        const prepared = memoryContext(base, job, snapshot)
        const recall = new RetentionQueries(reader, config.queryPageLimit, config.recallCharacterLimit)
        await memoryExecutor.execute({ attempt: job.id, context: prepared.context }, signal,
          (units) => {
            if (units.length > config.maxContextUpdateUnits) throw new Error('Memory batch exceeds the configured unit limit')
            submit(resolveContextUpdate(units, prepared.aliases))
          },
          query => recall.recall(snapshot.instance.id, job.owner, query, snapshot.instance.revision))
      },
    }, id => runtime.isRunning(id) || director.isRunning(id), {
      actorThreshold: config.consolidationThreshold, directorThreshold: config.directorConsolidationThreshold,
      batchLimit: config.consolidationBatchLimit, intervalMs: config.memoryQueueIntervalMs,
    }, (error) => { ctx.logger('roleplay-memory').error(error) })
    ctx.provide('roleplayMemoryQueue', memory)
    memory.start()
    ctx.provide('roleplayPlayer' , new PlayerApplication(commands, values, { cancel: (id, epoch, reason) => director.abort(id, epoch, reason) },
      config.characterLimits.maxTextBytes))
    ctx.provide('roleplayDirector', director)
    ctx.provide('roleplayDirectorViews', directorQueries)
    const deliveries = new NarrativeDeliveries(store)
    const notifications = new NarrativeNotifications(deliveries, config.notificationIntervalMs, (error) => { ctx.logger('roleplay-notifications').error(error) })
    ctx.provide('roleplayChanges', notifications)
    ctx.effect(() => async () => {
      try {
        await memory.dispose(); await memoryExecutor.dispose(); await director.dispose()
        await runtime.dispose(); await directorExecutor.dispose(); await executor.dispose()
      }
      finally { await notifications.dispose(); store.close() }
    })
    ctx.provide('roleplayPlanning', new PlanningApplication(commands, values))
    ctx.provide('roleplayRetention', new RetentionApplication(commands))
    ctx.provide('roleplayRetentionViews', new RetentionQueries(commands, config.queryPageLimit, config.recallCharacterLimit))
    ctx.provide('roleplayBooks', books)
    ctx.provide('roleplayAuthor', new AuthorQueries(commands, books))
    ctx.provide('roleplayInstances', new InstanceApplication(books, commands, values))
    ctx.provide('roleplayPeople', new PeopleApplication(commands, values))
    ctx.provide('roleplayCognition', cognition)
    ctx.provide('roleplayConfiguration', new ConfigurationApplication(commands))
    ctx.provide('roleplayDiscussions', new DiscussionApplication(commands, values))
    ctx.provide('roleplayWorld', new WorldApplication(commands, values))
    ctx.provide('roleplayViews', views)
    ctx.provide('roleplayPlay', new PlayQueries(commands, config.queryPageLimit))
    ctx.provide('roleplayRuntime', runtime)
    const archives = new NarrativeArchives(store, values, embeddedResourceVerifier)
    ctx.inject(['roleplayRequests'], (historyCtx) => {
      historyCtx.provide('roleplayExecutionHistory', new ExecutionHistoryQueries(commands, historyCtx.roleplayRequests, config.queryPageLimit, archives))
      historyCtx.provide('roleplayTransfer', new NarrativeTransfer(commands, archives, historyCtx.roleplayRequests))
      historyCtx.provide('roleplayRecovery', new RecoveryApplication(commands, {
        capture: (id, actors) => historyCtx.roleplayRequests.capture(id, actors),
        cancel: (id, epoch, reason) => director.abort(id, epoch, reason),
      }))
    })
    ctx.provide('roleplayDiscussionRuntime', discussionRuntime)
    ctx.provide('roleplayArchives', archives)
    ctx.provide('roleplayExtraction', new MaterialExtraction(commands, books))
    ctx.provide('roleplayHistory', commands)
    ctx.provide('roleplayDeliveries', deliveries)
  } catch (error) { store.close(); throw error }
}
