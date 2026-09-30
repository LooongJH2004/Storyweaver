import { performanceBehavior } from './player-performance.ts'
/** Independent-instance product slots, with no Story registry or Actor session navigation. */
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { Context } from '@deepseek-ai/cordis'
import type { SidebarNavigation } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-api-roleplay-controller/client'
import type { InstanceId, CommandId, Instance, BookDraft } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeInjected } from './contract.ts'
import { CommandAttempts } from './commands.ts'
import { createNarrativeStore } from './stores.ts'
import { NarrativeMark } from './NarrativeMark.tsx'
import { Library, LibraryBrand } from './Library.tsx'
import { Surface } from './Surface.tsx'
import { NarrativeRoot, NarrativeWorkspace } from './Root.tsx'
import { en, zh, type NarrativeKey } from './locales.ts'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { BookId } from '@deepseek-ai/dsh-roleplay-core/types'

class CommandFailure extends Error {
  constructor(readonly code: string, message: string) { super(`${code}: ${message}`) }
}

export { createNarrativeStore } from './stores.ts'
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { narrative: NarrativeKey }
  interface SlotMap { 'narrative.surface': { kind: 'single'; scope: 'root'; owner: object }
    'narrative.workspace': { kind: 'single'; scope: 'root'; owner: object } }
}
/** Required query mirrors and application command adapter. */
export const inject = ['slots', 'locale', 'theme', 'layout', 'sessions', 'roleplay', 'roleplayBrowser', 'roleplayInspection', 'roleplayPersonalStyles', 'roleplayExecutionLive', 'roleplayModelSettings']
/** Register product surfaces after their layout declarations exist.
 * @param ctx - assembly services; none is passed into a component.
 * @returns completion after the configured host page budget and slot registrations are available.
 */
export async function apply(ctx: Context): Promise<void> {
  const model = ctx.roleplayBrowser
  const remote = ctx.roleplay
  const attempts = new CommandAttempts()
  const store = createNarrativeStore()
  const navigation: SidebarNavigation = { storyMode: true, open: () => { throw new Error('Narrative navigation is not mounted') } }
  ctx.effect(() => ctx.reflect.provide('sidebarNavigation', navigation))
  const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T => {
    if (!result.ok) throw new CommandFailure(result.error.code, result.error.message)
    return result.value
  }
  const limits = unwrap(await remote.queryLimits())
  const page = { offset: 0, limit: limits.pageLimit }
  const mutation = async (kind: string, instanceId: InstanceId, expectedRevision: number, input: object,
    operation: (scope: { instanceId: InstanceId; expectedRevision: number; commandId: CommandId }) => Promise<unknown>) => {
    const intent = { kind, instanceId, input }
    await attempts.atRevision(intent, expectedRevision, async (commandId, reviewed) => {
      try { return await operation({ instanceId, expectedRevision: reviewed, commandId }) }
      catch (error) {
        if (error instanceof CommandFailure) {
          const status = await remote.commandStatus({ instanceId, commandId }).catch(() => undefined)
          if (status?.ok && (['failed', 'cancelled'].includes(status.value.execution)
            || status.value.acceptedRevision === null && ['roleplay-conflict', 'roleplay-invalid', 'roleplay-stale-execution'].includes(error.code)))
            attempts.retryable(intent, reviewed, commandId)
        }
        throw error
      }
    })
    // Command completion must not wait for unrelated book/instance listings.
    void model.refreshLibrary()
  }
  const select: NarrativeInjected['select'] = (instanceId, audience, offset = 0) => {
    localStorage.setItem('storyweaver.selectedInstance', instanceId)
    model.follow({ instanceId, audience, ...page, offset })
  }
  const refresh = async () => {
    await model.refreshLibrary()
    if (model.play.getSnapshot().request !== null) return
    const saved = localStorage.getItem('storyweaver.selectedInstance')
    const instances = model.library.getSnapshot().instances
    const instance = instances.find(value => value.id === saved) ?? (saved === null && instances.length === 1 ? instances[0] : undefined)
    if (instance !== undefined) select(instance.id, { kind: 'observer' })
  }
  const props: NarrativeInjected = {
    readExecutionPage: async (scope, offset) => unwrap(await remote.executionRequests({ ...scope, offset, limit: limits.pageLimit })),
    readExecutionDetail: async (scope, requestId, evidenceId) => unwrap(await remote.executionRequest({ ...scope, requestId,
      ...(evidenceId === undefined ? {} : { evidenceId }) })),
    usageT: ctx.locale.bind('chat'),
    executionUsage: async instanceId => unwrap(await remote.executionUsage({ instanceId })),
    turnUsage: async (instanceId, revision, actorId) => {
      const requests = unwrap(await remote.executionRequests({ instanceId, revision, offset: 0, limit: 1,
        ...(actorId === undefined ? {} : { actorId }) }))
      return requests.entries[0] ?? null
    },
    hooks: { library: model.library, play: model.play, author: model.author, inspection: ctx.roleplayInspection.snapshot,
      personalStyles: ctx.roleplayPersonalStyles.snapshot, execution: ctx.roleplayExecutionLive.snapshot,
      modelSettings: ctx.roleplayModelSettings.snapshot },
    followExecution: (instanceId, actorId) => {
      ctx.roleplayExecutionLive.follow({ instanceId, ...(actorId === undefined ? {} : { actorId }) })
    },
    stopExecution: () => { ctx.roleplayExecutionLive.stop() },
    savePersonalStyle: (name, profile) => { ctx.roleplayPersonalStyles.save(name, profile) },
    removePersonalStyle: (name, kind) => { ctx.roleplayPersonalStyles.remove(name, kind) },
    refreshPersonalStyles: () => { ctx.roleplayPersonalStyles.refresh() },
    refresh, select,
    creationPreferences: async book => unwrap(await remote.creationPreferences(book === undefined ? {} : { bookId: book.id })),
    saveCreationPreferences: async (preferences, book) => unwrap(await remote.saveCreationPreferences({ ...preferences,
      ...(book === undefined ? {} : { bookId: book.id }) })),
    creationDirectory: async path => unwrap(await remote.creationDirectory(path === undefined ? {} : { path })),
    createCreator: async (book, preferences) => {
      let draft = book
      if (draft === undefined) {
        const id = randomUUID() as BookId
        const title = ctx.locale.bind('narrative')('newBook')
        draft = unwrap(await remote.saveDraft({ id, expectedRevision: 0, title, resources: [],
          document: { schemaVersion: 6, id, title, directorPrompt: '', directorGuidance: {}, characters: [] } }))
      }
      let saved = unwrap(await remote.creationPreferences({ bookId: draft.id }))
      if (saved.revision === 0) saved = unwrap(await remote.saveCreationPreferences({
        ...(preferences ?? saved), revision: 0, bookId: draft.id }))
      const sessionId = await ctx.sessions.create({ sessionId: SessionId(`creator-${draft.id}`), agentPreset: 'storyweaver-author',
        ...(saved.cwd === null ? {} : { cwd: saved.cwd }) })
      ctx.sessions.open(sessionId)
      await model.refreshLibrary()
    },
    previewContext: (instanceId, revision, actorId, instruction) => ctx.roleplayInspection.inspect({ instanceId, revision, instruction,
      ...(actorId === undefined ? {} : { actorId }) }),
    inspectTurn: (instanceId, revision, actorId) => ctx.roleplayInspection.inspectRecorded({ instanceId, revision,
      ...(actorId === undefined ? {} : { actorId }) }, limits.pageLimit),
    executionModel: () => ctx.roleplayModelSettings.refresh(),
    selectExecutionModel: (expectedRevision, selection) => ctx.roleplayModelSettings.save(expectedRevision, selection),
    author: async (instanceId, actorId, query = '', offset = 0) => {
      await model.inspectAuthor({ instanceId, ...(actorId === undefined ? {} : { actorId }), query: { query, ...page, offset } })
      const workspace = model.author.getSnapshot().workspace
      if (workspace?.instance.id === instanceId && model.author.getSnapshot().request?.actorId === actorId) {
        await ctx.roleplayInspection.inspect({ instanceId, revision: workspace.instance.revision,
          ...(actorId === undefined ? {} : { actorId }) })
      }
    },
    history: (instanceId, audience, revision, offset = 0) => model.history({ instanceId, audience, revision, ...page, offset }),
    start: async (templateVersionId) => {
      const instance = await attempts.run({ kind: 'create', templateVersionId }, async commandId => unwrap<Instance>(await remote.createStory({ templateVersionId, commandId })))
      select(instance.id, { kind: 'observer' }); await model.refreshLibrary()
    },
    removeBook: async (book) => {
      unwrap(await remote.removeBook({ bookId: book.id, expectedRevision: book.revision })); await model.refreshLibrary()
    },
    removeInstance: (instanceId, revision) => mutation('removeInstance', instanceId, revision, {}, async (scope) => {
      unwrap(await remote.removeInstance(scope)); localStorage.removeItem('storyweaver.selectedInstance'); model.clearPlay()
    }),
    rewriteDirection: (instanceId, revision, targetRevision, instruction) => mutation('rewriteDirection', instanceId, revision, { targetRevision, instruction },
      async scope => unwrap(await remote.rewriteDirection({ ...scope, targetRevision, instruction }))),
    restart: async (instanceId) => {
      const instance = await attempts.run({ kind: 'restart', instanceId }, async commandId => unwrap<Instance>(await remote.restart({ instanceId, commandId })))
      select(instance.id, { kind: 'observer' }); await model.refreshLibrary()
    },
    saveBook: async (input) => { const draft = unwrap<BookDraft>(await remote.saveDraft(input))
      await model.refreshLibrary(); return draft },
    previewBook: async book => unwrap(await remote.previewPublication({ bookId: book.id, expectedRevision: book.revision })),
    publish: async (book) => { unwrap(await remote.publish({ bookId: book.id, expectedRevision: book.revision }))
      await model.refreshLibrary() },
    submit: (instanceId, revision, mode, text, actorId, performance, actorFacingBeat) => mutation(mode, instanceId, revision,
      mode === 'embody' ? { actorId, performance } : mode === 'advance' ? { text, actorFacingBeat } : { text }, async (scope) => {
        if (mode === 'embody') unwrap(await remote.embody({ ...scope, input: { actorId, reason: 'player input', behavior: performanceBehavior(performance) } }))
        else if (mode === 'intervene') unwrap(await remote.interveneScene({ ...scope, content: text }))
        else unwrap(await remote.advance({ ...scope, instruction: text,
          ...(mode === 'advance' && actorFacingBeat.trim() !== '' ? { actorFacingBeat: actorFacingBeat.trim() } : {}) }))
      }),
    controlPlayer: (instanceId, revision, actorId) => mutation('controlPlayer', instanceId, revision, { actorId },
      async scope => unwrap(await remote.controlPlayer({ ...scope, actorId }))),
    passPlayer: (instanceId, revision) => mutation('passPlayer', instanceId, revision, {},
      async scope => unwrap(await remote.passPlayer(scope))),
    pause: (instanceId, revision) => mutation('pause', instanceId, revision, {}, async scope => unwrap(await remote.pause({ ...scope, reason: 'player pause' }))),
    settings: (instanceId, revision, input) => mutation('settings', instanceId, revision, input, async scope => unwrap(await remote.settings({ ...scope, input }))),
    planning: (instanceId, revision, input) => mutation('planning', instanceId, revision, input, async scope => unwrap(await remote.planning({ ...scope, input }))),
    style: (instanceId, revision, input) => mutation('style', instanceId, revision, input, async scope => unwrap(await remote.style({ ...scope, input }))),
    contextDefaults: async () => unwrap(await remote.contextDefaults()),
    saveContextDefaults: async recipe => unwrap(await remote.saveContextDefaults({ recipe })),
    memoryJobs: async instanceId => unwrap(await remote.memoryJobs({ instanceId })),
    memoryJob: async (instanceId, jobId) => unwrap(await remote.memoryJob({ instanceId, jobId })),
    retryMemoryJob: async (instanceId, jobId) => unwrap(await remote.retryMemoryJob({ instanceId, jobId })),
    globalCreative: async bookId => unwrap(await remote.globalCreative({ bookId })),
    creativeSettings: async instanceId => unwrap(await remote.creativeSettings({ instanceId })),
    publishCreative: async (input) => {
      const { commandId: _proposedId, ...payload } = input
      return attempts.run({ kind: 'global-creative', ...payload }, async commandId => unwrap(await remote.publishCreative({ ...payload, commandId })))
    },
    bindCreative: (instanceId, revision, input) => mutation('creative-source', instanceId, revision, input,
      async scope => unwrap(await remote.bindCreative({ ...scope, input }))),
    recipe: (instanceId, revision, input) => mutation('recipe', instanceId, revision, input, async scope => unwrap(await remote.contextRecipe({ ...scope, input }))),
    cognition: (instanceId, revision, actorId, input) => mutation('cognition', instanceId, revision, { actorId, input },
      async scope => unwrap(await remote.reviseCognition({ ...scope, actorId, input }))),
    world: (instanceId, revision, input) => mutation('world', instanceId, revision, input, async scope => unwrap(await remote.observe({ ...scope, input }))),
    createPerson: (instanceId, revision, input) => mutation('createPerson', instanceId, revision, input,
      async scope => unwrap(await remote.createCharacter({ ...scope, input }))),
    revisePerson: (instanceId, revision, input) => mutation('revisePerson', instanceId, revision, input,
      async scope => unwrap(await remote.reviseCharacter({ ...scope, input }))),
    retention: (instanceId, revision, input) => mutation('retention', instanceId, revision, input,
      async scope => unwrap(await remote.reviewRetention({ ...scope, input }))),
    recall: input => ctx.roleplayInspection.recall(input),
    executionRequests: (offset = 0) => ctx.roleplayInspection.executionRequests(offset, page.limit),
    executionRequest: (requestId, evidenceId) => ctx.roleplayInspection.executionRequest(requestId, evidenceId),
    startDiscussion: (instanceId, revision, input) => mutation('startDiscussion', instanceId, revision, input,
      async scope => unwrap(await remote.startDiscussion({ ...scope, input }))),
    controlDiscussion: (instanceId, revision, input) => mutation('controlDiscussion', instanceId, revision, input,
      async scope => unwrap(await remote.controlDiscussion({ ...scope, input }))),
    advanceDiscussion: (instanceId, revision) => mutation('advanceDiscussion', instanceId, revision, {},
      async scope => unwrap(await remote.advanceDiscussion(scope))),
    stageScene: (instanceId, revision, input) => mutation('stageScene', instanceId, revision, input,
      async scope => unwrap(await remote.stageScene({ ...scope, input }))),
    previewExtraction: async (instanceId, selection, title) => unwrap(await remote.previewExtraction({ instanceId, selection, title })),
    extract: (instanceId, revision, selection, title) => mutation('extract', instanceId, revision, { selection, title },
      async scope => unwrap(await remote.extractDraft({ ...scope, selection, title }))),
    checkpoint: (instanceId, revision, name) => mutation('checkpoint', instanceId, revision, { name }, async scope => unwrap(await remote.checkpoint({ ...scope, name }))),
    restore: (instanceId, revision, targetRevision) => mutation('restore', instanceId, revision, { targetRevision }, async scope => unwrap(await remote.restore({ ...scope, targetRevision, reason: 'player restore' }))),
    exportArchive: async (instanceId, expectedRevision) => unwrap(await remote.exportArchive({ instanceId, expectedRevision })),
    importArchive: async (archive) => {
      const instance = await attempts.run({ kind: 'import', archive }, async commandId => unwrap<Instance>(await remote.importArchive({ commandId, archive })))
      select(instance.id, { kind: 'observer' }); await model.refreshLibrary()
    },
    toggleSidebar: () => { ctx.layout.toggleSidebar() },
  }
  ctx.effect(() => ctx.theme.overrideTokens('@deepseek-ai/dsh-client-ui-narrative', {
    '--dsw-alias-bg-base': { light: 'rgb(251, 249, 246)', dark: 'rgb(21, 22, 24)' },
    '--dsw-alias-button-elevated-fill': { light: 'rgb(255, 253, 250)', dark: 'rgb(29, 30, 33)' },
    '--dsw-alias-button-floating-hover': { light: 'rgb(240, 234, 252)', dark: 'rgb(42, 43, 46)' },
    '--dsw-alias-interactive-bg-hover': { light: 'rgb(240, 234, 252)', dark: 'rgb(42, 43, 46)' },
    '--dsw-alias-state-business-primary': { light: 'rgb(116, 82, 190)', dark: 'rgb(197, 180, 151)' },
    '--dsw-specific-menu': { light: 'rgb(255, 253, 250)', dark: 'rgb(29, 30, 33)' },
    '--dsw-specific-input-major': { light: 'rgb(255, 253, 250)', dark: 'rgb(29, 30, 33)' },
    '--dsw-specific-sidebar-fill': { light: 'rgb(244, 241, 236)', dark: 'rgb(25, 26, 28)' },
    '--dsw-specific-bubble': { light: 'rgb(241, 236, 252)', dark: 'rgb(38, 39, 42)' },
    '--dsw-roleplay-font-story': { light: "Georgia, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif", dark: "Georgia, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif" },
    '--dsw-roleplay-composer': { light: 'rgb(255, 254, 252)', dark: 'rgb(32, 33, 36)' },
    '--dsw-roleplay-hairline': { light: 'rgba(45, 40, 34, 0.12)', dark: 'rgba(239, 235, 224, 0.1)' },
    '--dsw-roleplay-reading-ink': { light: 'rgb(47, 45, 42)', dark: 'rgb(219, 218, 215)' },
    '--dsw-roleplay-control-hover': { light: 'rgb(242, 239, 234)', dark: 'rgb(42, 43, 46)' },
    '--dsw-roleplay-submit': { light: 'rgb(86, 69, 119)', dark: 'rgb(219, 210, 192)' },
    '--dsw-roleplay-submit-ink': { light: 'rgb(255, 255, 255)', dark: 'rgb(36, 33, 28)' },
    '--dsw-roleplay-shadow': { light: 'rgba(47, 36, 65, 0.08)', dark: 'rgba(0, 0, 0, 0.24)' },
    '--dsw-roleplay-on-accent': { light: 'rgb(255, 255, 255)', dark: 'rgb(31, 28, 24)' },
    '--dsw-roleplay-card': { light: 'rgb(255, 253, 250)', dark: 'rgb(29, 30, 33)' },
    '--dsw-roleplay-canvas': { light: 'rgb(251, 249, 246)', dark: 'rgb(21, 22, 24)' },
    '--dsw-roleplay-accent': { light: 'rgb(116, 82, 190)', dark: 'rgb(197, 180, 151)' },
    '--dsw-roleplay-accent-ink': { light: 'rgb(79, 52, 137)', dark: 'rgb(226, 213, 192)' },
    '--dsw-roleplay-accent-soft': { light: 'rgb(240, 234, 252)', dark: 'rgb(47, 44, 39)' },
    '--dsw-roleplay-accent-border': { light: 'rgba(116, 82, 190, 0.28)', dark: 'rgba(197, 180, 151, 0.24)' },
    '--dsw-roleplay-actor-0': { light: 'rgb(156, 105, 32)', dark: 'rgb(197, 138, 50)' },
    '--dsw-roleplay-actor-1': { light: 'rgb(35, 126, 107)', dark: 'rgb(47, 155, 131)' },
    '--dsw-roleplay-actor-2': { light: 'rgb(43, 118, 171)', dark: 'rgb(61, 143, 202)' },
    '--dsw-roleplay-actor-3': { light: 'rgb(84, 117, 54)', dark: 'rgb(113, 152, 76)' },
    '--dsw-roleplay-actor-4': { light: 'rgb(164, 79, 96)', dark: 'rgb(192, 103, 120)' },
    '--dsw-roleplay-actor-5': { light: 'rgb(108, 83, 181)', dark: 'rgb(128, 105, 207)' },
    '--dsw-roleplay-actor-6': { light: 'rgb(168, 86, 50)', dark: 'rgb(202, 112, 72)' },
  }))
  ctx.effect(() => ctx.locale.register('narrative', { en, zh }))
  ctx.slots.inject('sidebar.stories', () => ctx.slots.register({ name: 'sidebar.stories', locale: 'narrative', store,
    inject: (actions) => { navigation.open = actions.bookLibrary; return props } }, Library))
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark' }, NarrativeMark))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', locale: 'narrative' }, LibraryBrand))
  ctx.slots.inject('conversation', function* () {
    yield ctx.slots.register({ name: 'conversation', priority: -100,
      children: { 'narrative.workspace': { kind: 'single', scope: 'root' } } }, NarrativeRoot)
    yield ctx.slots.register({ name: 'narrative.workspace', store, locale: 'narrative', inject: () => props,
      children: { 'narrative.surface': { kind: 'single', scope: 'root' }, 'conversation.embedded': { kind: 'single', scope: 'session-maybe' } } }, NarrativeWorkspace)
    yield ctx.slots.register({ name: 'narrative.surface', locale: 'narrative', store, inject: () => props,
      children: { 'model.selection.control': { kind: 'single', scope: 'root' } } }, Surface)
  })
}
