/** Cross-controller Story navigation policy. */
import { Service, type Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IStories, StoryId, StoryView } from '@deepseek-ai/dsh-api-story-controller/client'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Story and scene operations consumed by browser presentation packages. */
export interface UiStory {
  connectStory(storyId: StoryId): Promise<SessionId>
  startStory(storyId?: StoryId): void
  createStory(title?: string): Promise<StoryView>
  createCreationTask(): Promise<SessionId | undefined>
  openCreationTask(sessionId: SessionId): void
  deleteCreationTask(sessionId: SessionId): Promise<void>
  importStory(source: string): Promise<StoryView>
  newStory(sourceStoryId: StoryId): Promise<SessionId>
  openScene(storyId: StoryId, sessionId: SessionId): Promise<void>
  renameStory(storyId: StoryId, title: string): Promise<void>
  deleteStory(storyId: StoryId): Promise<void>
  deleteTemplate(templateId: string): Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Path-free Story and scene navigation policy. */
    uiStory: UiStory
  }
}

/** Coordinates Story metadata with the Session runtime. */
export class UiStoryService extends Service implements UiStory {
  private readonly connecting = new Map<StoryId, Promise<SessionId>>()
  private navigationMutationDepth = 0

  /**
   * @param ctx - Client root.
   * @param stories - Story state.
   * @param sessions - Session state.
   * @param directoryPicker - host directory picker used for explicit local-workspace authorization.
   */
  constructor(
    ctx: Context,
    private readonly stories: IStories,
    private readonly sessions: ISessions,
    private readonly directoryPicker: ClientRemote['directoryPicker'],
  ) {
    super(ctx, 'uiStory')
    ctx.effect(() => this.watchNavigation(), 'ui-story: navigation policy')
  }

  async connectStory(storyId: StoryId): Promise<SessionId> {
    const story = this.story(storyId)
    if (story.templateOnly) throw new Error(`Story ${storyId} is an authored-settings template, not a runtime Story`)
    const inflight = this.connecting.get(storyId)
    if (inflight !== undefined) return inflight
    const target = story.currentSceneSessionId ?? story.sceneSessionIds[0]
    if (target !== undefined) {
      await this.stories.selectScene(storyId, target)
      await this.stories.touch(storyId)
      return target
    }
    return this.createScene(storyId)
  }

  startStory(storyId?: StoryId): void {
    const task = storyId === undefined
      ? this.createStory().then(story => this.connectStory(story.storyId))
      : this.connectStory(storyId)
    void task.then(
      (sessionId) => { this.sessions.open(sessionId) },
      (reason: unknown) => { console.warn('Story navigation failed:', reason) },
    )
  }

  createStory(title?: string): Promise<StoryView> {
    return this.stories.create(title === undefined ? {} : { title })
  }

  async createCreationTask(): Promise<SessionId | undefined> {
    const picked = await this.directoryPicker.pick()
    if (!picked.ok) throw new Error(`directory picker failed: ${picked.error.message}`)
    const cwd = picked.value
    if (cwd === null) return undefined
    const story = await this.stories.create()
    try {
      const sessionId = await this.sessions.create({
        storyId: story.storyId,
        storySessionRole: 'control',
        agentPreset: 'storyweaver-creator',
        cwd,
      })
      this.sessions.open(sessionId)
      return sessionId
    } catch (error) {
      await this.stories.delete(story.storyId).catch(() => undefined)
      throw error
    }
  }

  openCreationTask(sessionId: SessionId): void {
    const session = this.sessions.list.getSnapshot().byId[sessionId]
    if (session?.projectionValues?.agentPreset !== 'storyweaver-creator') {
      throw new Error(`Session ${sessionId} is not a Storyweaver creation task`)
    }
    this.sessions.open(sessionId)
  }

  async deleteCreationTask(sessionId: SessionId): Promise<void> {
    const session = this.sessions.list.getSnapshot().byId[sessionId]
    if (session?.projectionValues?.agentPreset !== 'storyweaver-creator') {
      throw new Error(`Session ${sessionId} is not a Storyweaver creation task`)
    }
    const managed = this.stories.list.getSnapshot().items.find(story => story.controlSessionId === sessionId)
    const current = this.sessions.list.getSnapshot().current
    if (managed !== undefined) {
      await this.withNavigationMutation(() => managed.templateOnly
        ? this.stories.archiveSession(sessionId).then(() => undefined)
        : this.stories.delete(managed.storyId))
    }
    if (current !== sessionId) return
    const selected = this.sessions.list.getSnapshot().current
    if (selected !== undefined && selected !== current) return
    const remaining = this.stories.list.getSnapshot().items
    const sessionState = this.sessions.list.getSnapshot()
    const nextCreator = remaining
      .map(story => story.controlSessionId)
      .find(id => id !== undefined && id !== sessionId
        && sessionState.byId[id]?.projectionValues?.agentPreset === 'storyweaver-creator')
    if (nextCreator !== undefined) {
      this.sessions.open(nextCreator)
      return
    }
    const nextStory = remaining.find(story => !story.templateOnly && story.sceneSessionIds.length > 0)
    if (nextStory === undefined) this.sessions.clear()
    else this.startStory(nextStory.storyId)
  }

  async importStory(source: string): Promise<StoryView> {
    const decoded = JSON.parse(source) as unknown
    return isStoryPackage(decoded)
      ? this.stories.importPackage(source)
      : this.stories.importStorybook(source)
  }

  async newStory(sourceStoryId: StoryId): Promise<SessionId> {
    this.story(sourceStoryId)
    const created = await this.stories.createFromTemplate(sourceStoryId)
    try {
      const sessionId = await this.createScene(created.storyId)
      this.sessions.open(sessionId)
      return sessionId
    } catch (error) {
      await this.stories.delete(created.storyId).catch(() => undefined)
      throw error
    }
  }

  async openScene(storyId: StoryId, sessionId: SessionId): Promise<void> {
    const story = this.story(storyId)
    if (!story.sceneSessionIds.includes(sessionId)) {
      throw new Error(`scene ${sessionId} does not belong to Story ${storyId}`)
    }
    await this.stories.selectScene(storyId, sessionId)
    await this.stories.touch(storyId)
    this.sessions.open(sessionId)
  }

  async renameStory(storyId: StoryId, title: string): Promise<void> {
    await this.stories.rename(storyId, title)
  }

  async deleteStory(storyId: StoryId): Promise<void> {
    const story = this.story(storyId)
    const current = this.sessions.list.getSnapshot().current
    await this.withNavigationMutation(() => this.stories.deleteRun(storyId))
    if (current === undefined || !owns(story, current)
      || this.sessions.list.getSnapshot().current !== current) return
    const next = this.stories.list.getSnapshot().items.find(item => (
      item.templateId === story.templateId && !item.templateOnly
    ))
    if (next === undefined) this.sessions.clear()
    else this.startStory(next.storyId)
  }

  async deleteTemplate(templateId: string): Promise<void> {
    const targets = this.stories.list.getSnapshot().items.filter(story => story.templateId === templateId)
    const current = this.sessions.list.getSnapshot().current
    const clearsCurrent = current !== undefined && targets.some(story => owns(story, current))
    await this.withNavigationMutation(async () => {
      for (const story of targets) await this.stories.delete(story.storyId)
    })
    if (!clearsCurrent || this.sessions.list.getSnapshot().current !== current) return
    const next = this.stories.list.getSnapshot().items.find(story => !story.templateOnly)
    if (next === undefined) this.sessions.clear()
    else this.startStory(next.storyId)
  }

  private createScene(storyId: StoryId): Promise<SessionId> {
    this.story(storyId)
    const existing = this.connecting.get(storyId)
    if (existing !== undefined) return existing
    const attempt = this.sessions.create({ storyId, storySessionRole: 'scene' })
      .then(async (sessionId) => {
        await this.stories.selectScene(storyId, sessionId)
        await this.stories.touch(storyId)
        return sessionId
      })
      .finally(() => { this.connecting.delete(storyId) })
    this.connecting.set(storyId, attempt)
    return attempt
  }

  private story(storyId: StoryId): StoryView {
    const story = this.stories.list.getSnapshot().items.find(item => item.storyId === storyId)
    if (story === undefined) throw new Error(`unknown Story ${storyId}`)
    return story
  }

  private async withNavigationMutation<T>(operation: () => Promise<T>): Promise<T> {
    this.navigationMutationDepth += 1
    try {
      return await operation()
    } finally {
      this.navigationMutationDepth -= 1
    }
  }

  private watchNavigation(): () => void {
    let initial = true
    let disposed = false
    const reconcile = (): void => {
      if (disposed) return
      const storyState = this.stories.list.getSnapshot()
      const sessionState = this.sessions.list.getSnapshot()
      if (storyState.phase !== 'ready' || sessionState.phase !== 'ready') return
      const current = sessionState.current
      if (this.navigationMutationDepth === 0 && current !== undefined
        && !storyState.items.some(story => owns(story, current))
        && !isManagedCreator(storyState.items, sessionState, current)) {
        this.sessions.clear()
      }
      if (!initial) return
      initial = false
      if (current !== undefined || storyState.items.length === 0) return
      const firstStory = storyState.items.find(story => !story.templateOnly)
      if (firstStory === undefined) return
      void this.connectStory(firstStory.storyId).then(
        (sessionId) => { if (!disposed && this.sessions.list.getSnapshot().current === undefined) this.sessions.open(sessionId) },
        (reason: unknown) => { console.warn('Initial Story selection failed:', reason) },
      )
    }
    const disposeStories = this.stories.list.subscribe(reconcile)
    const disposeSessions = this.sessions.list.subscribe(reconcile)
    reconcile()
    return () => {
      disposed = true
      disposeSessions()
      disposeStories()
    }
  }
}

function isStoryPackage(value: unknown): boolean {
  return typeof value === 'object' && value !== null
    && (value as Record<string, unknown>).format === 'dsh-roleplay-story-package'
}

function owns(story: StoryView, sessionId: SessionId): boolean {
  return story.sceneSessionIds.includes(sessionId)
    || story.controlSessionId === sessionId
    || story.actors.some(actor => actor.sessionId === sessionId)
}

function isManagedCreator(
  stories: readonly StoryView[],
  sessions: ReturnType<ISessions['list']['getSnapshot']>,
  sessionId: SessionId,
): boolean {
  return sessions.byId[sessionId]?.projectionValues?.agentPreset === 'storyweaver-creator'
    && stories.some(story => story.controlSessionId === sessionId)
}
