/** Reconnect-safe Story baseline and increment producer. */

import type { Context } from '@deepseek-ai/cordis'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'
import { StoryId, storyRecord, storyContinuityItems } from '@deepseek-ai/dsh-story'
import type { Story, StoryRecord } from '@deepseek-ai/dsh-story'
import type { StoryBaseline, StoryFollowFrame, StoryView } from './types.ts'

/**
 * Project one Story without revealing its Host path.
 * @param story - Authoritative Story entity.
 * @returns detached browser-safe projection.
 */
export function storyView(story: Story): StoryView {
  return viewFromRecord(story.id, {
    templateId: story.templateId,
    templateOnly: story.templateOnly,
    title: story.title,
    premise: story.premise,
    sessions: [...story.sessions],
    ...(story.currentSceneSessionId === undefined ? {} : { currentSceneSessionId: story.currentSceneSessionId }),
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
    ...(story.archivedAt === undefined ? {} : { archivedAt: story.archivedAt }),
    plotLedger: story.plotLedger,
    directorOutline: story.directorOutline,
    world: story.world,
    memory: story.memory,
    discussions: story.discussions,
    contextRecipe: story.contextRecipe,
    promptOverrides: story.promptOverrides,
  })
}

function viewFromRecord(storyId: ReturnType<typeof StoryId>, record: StoryRecord): StoryView {
  const active = record.sessions.filter(item => item.archivedAt === undefined)
  const current = record.currentSceneSessionId !== undefined
    && active.some(item => item.role === 'scene' && item.sessionId === record.currentSceneSessionId)
    ? record.currentSceneSessionId
    : undefined
  const control = active.find(item => item.role === 'control')?.sessionId
  return {
    storyId,
    matters: {
      public: storyContinuityItems(record.world),
      actors: Object.fromEntries(active.flatMap(item => item.role !== 'actor' || item.actorId === undefined
        ? [] : [[item.actorId, storyContinuityItems(record.world, item.actorId)]])),
    },
    templateId: record.templateId ?? String(storyId),
    templateOnly: record.templateOnly ?? false,
    title: record.title,
    premise: record.premise,
    sceneSessionIds: active.filter(item => item.role === 'scene').map(item => item.sessionId),
    ...(current === undefined ? {} : { currentSceneSessionId: current }),
    ...(control === undefined ? {} : { controlSessionId: control }),
    actors: active.filter(item => item.role === 'actor').map(item => ({
      actorId: item.actorId as string,
      sessionId: item.sessionId,
      stateRevision: item.actorStateRevision ?? 0,
    })),
    plotLedger: record.plotLedger,
    directorOutline: record.directorOutline,
    world: record.world,
    memory: record.memory,
    discussions: record.discussions,
    contextRecipe: record.contextRecipe,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

/** Owns Story domain observation and all active follow generations. */
export class StoryFeed {
  private readonly followers = new Set<StoryFollower>()
  private readonly visible = new Set<string>()

  /** @param ctx - Host context containing the Story registry. */
  constructor(private readonly ctx: Context) {
    for (const story of ctx.storyRegistry.list()) this.visible.add(String(story.id))
    ctx.on('domain/changed', (change: DomainChanged) => { this.changed(change) })
    ctx.effect(() => () => {
      for (const follower of this.followers) follower.close()
      this.followers.clear()
    }, 'story-controller.feed')
  }

  /**
   * Build the opening snapshot for a new follow generation.
   * @returns complete active Story projection.
   */
  baseline(): StoryBaseline {
    return { items: this.ctx.storyRegistry.list().map(storyView) }
  }

  /**
   * Open one generation beginning with a complete baseline.
   * @param signal - Generation cancellation.
   * @returns baseline followed by ordered Story increments.
   */
  async *follow(signal: AbortSignal): AsyncIterable<StoryFollowFrame> {
    signal.throwIfAborted()
    const follower = new StoryFollower()
    this.followers.add(follower)
    try {
      yield { type: 'baseline', value: this.baseline() }
      yield* follower.read(signal)
    } finally {
      this.followers.delete(follower)
      follower.close()
    }
  }

  private changed(change: DomainChanged): void {
    if (change.domain !== 'story' || change.table !== 'stories') return
    const id = StoryId(change.key)
    if (change.operation === 'deleted') {
      if (this.visible.delete(change.key)) this.publish({ type: 'remove', storyId: id })
      return
    }
    const record = storyRecord.parse(change.value)
    if (record.archivedAt !== undefined) {
      if (this.visible.delete(change.key)) this.publish({ type: 'remove', storyId: id })
      return
    }
    this.visible.add(change.key)
    this.publish({ type: 'upsert', story: viewFromRecord(id, record) })
  }

  private publish(frame: StoryFollowFrame): void {
    for (const follower of this.followers) follower.push(frame)
  }
}

class StoryFollower {
  private readonly queued: StoryFollowFrame[] = []
  private waiter: (() => void) | undefined
  private closed = false

  push(frame: StoryFollowFrame): void {
    if (this.closed) return
    this.queued.push(frame)
    this.waiter?.()
    this.waiter = undefined
  }

  close(): void {
    this.closed = true
    this.waiter?.()
    this.waiter = undefined
  }

  async *read(signal: AbortSignal): AsyncIterable<StoryFollowFrame> {
    while (!this.closed) {
      signal.throwIfAborted()
      const frame = this.queued.shift()
      if (frame !== undefined) {
        yield frame
        continue
      }
      await new Promise<void>((resolve) => {
        const finish = (): void => {
          signal.removeEventListener('abort', finish)
          resolve()
        }
        this.waiter = finish
        signal.addEventListener('abort', finish, { once: true })
      })
    }
    signal.throwIfAborted()
  }
}
