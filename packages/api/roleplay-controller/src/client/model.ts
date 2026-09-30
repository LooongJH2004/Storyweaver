/** React-free query mirrors own cancellation and stale-response ordering. */
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteStreamItem } from '@deepseek-ai/dsh-api-gateway/client'
import type { PlayQueryRequest, PlayView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { PlayFollowRequest } from '../types.ts'
import type { RoleplayRemote } from './index.ts'
import type { LibrarySnapshot, PlaySnapshot, AuthorRequest, AuthorSnapshot } from './contracts.ts'

/** Logical stream supervision remains owned by the Gateway. */
export interface PlaySubscription extends AsyncIterable<RemoteStreamItem<PlayView>> { dispose(): Promise<void> }

function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}
const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Narrow browser model; it owns mirrors and subscription lifetimes, not domain decisions. */
export class RoleplayBrowserModel {
  private readonly libraryStore = createSnapshotStore<LibrarySnapshot>({ books: [], instances: [], loading: false, error: null })
  private readonly playStore = createSnapshotStore<PlaySnapshot>({ request: null, view: null, choices: null, loading: false, error: null })
  private readonly authorStore = createSnapshotStore<AuthorSnapshot>({ request: null, workspace: null, people: null,
    loading: false, error: null })
  readonly library: ObservableSnapshot<LibrarySnapshot> = this.libraryStore
  readonly play: ObservableSnapshot<PlaySnapshot> = this.playStore
  readonly author: ObservableSnapshot<AuthorSnapshot> = this.authorStore
  private libraryGeneration = 0
  private playGeneration = 0
  private authorGeneration = 0
  private disposed = false
  private subscription: PlaySubscription | undefined
  private readonly cleanupFailures: unknown[] = []
  private readonly closing = new Set<Promise<void>>()

  constructor(private readonly remote: Pick<RoleplayRemote, 'books' | 'instances' | 'play' | 'authorWorkspace' | 'characters' | 'embodimentChoices'>,
    private readonly open: (request: PlayFollowRequest) => PlaySubscription) {}

  /** Read both library lists as one usable baseline; an older pull cannot overwrite a newer one. */
  async refreshLibrary(): Promise<void> {
    this.assertActive()
    const generation = ++this.libraryGeneration
    this.libraryStore.update((state) => { Object.assign(state, { loading: true, error: null }) })
    try {
      const [books, instances] = await Promise.all([this.remote.books(), this.remote.instances()])
      if (this.disposed || generation !== this.libraryGeneration) return
      this.libraryStore.set({ books: unwrap(books), instances: unwrap(instances), loading: false, error: null })
    } catch (error) {
      if (!this.disposed && generation === this.libraryGeneration) this.libraryStore.update((state) => {
        Object.assign(state, { loading: false, error: message(error) })
      })
    }
  }

  /** Replace a live audience subscription without retaining another character's private view. */
  follow(request: PlayFollowRequest): void {
    this.assertActive()
    const generation = ++this.playGeneration
    this.closeSubscription()
    this.playStore.set({ request, view: null, choices: null, loading: true, error: null })
    try {
      const stream = this.open(request)
      this.subscription = stream
      void this.consume(stream, request, generation)
    } catch (error) { this.playStore.set({ request, view: null, choices: null, loading: false, error: message(error) }) }
  }

  /** A historical page is a point query and never merges with the current live stream. */
  async history(request: PlayQueryRequest & { revision: number }): Promise<void> {
    this.assertActive()
    const generation = ++this.playGeneration
    this.closeSubscription()
    this.playStore.set({ request, view: null, choices: null, loading: true, error: null })
    try {
      const view = unwrap(await this.remote.play(request))
      if (this.disposed || generation !== this.playGeneration) return
      if (view.instanceId !== request.instanceId || view.revision !== request.revision) throw new Error('Historical play revision does not match its query')
      this.playStore.set({ request, view, choices: null, loading: false, error: null })
    } catch (error) { this.playFailure(generation, error) }
  }

  /** Read the workspace first, then bind its character page to that exact historical revision. */
  async inspectAuthor(request: AuthorRequest): Promise<void> {
    this.assertActive()
    const generation = ++this.authorGeneration
    const prior = this.authorStore.getSnapshot()
    const samePerspective = prior.request?.instanceId === request.instanceId && prior.request.actorId === request.actorId
    this.authorStore.set({ request, workspace: samePerspective ? prior.workspace : null,
      people: samePerspective ? prior.people : null, loading: true, error: null })
    try {
      const workspace = unwrap(await this.remote.authorWorkspace({ instanceId: request.instanceId,
        ...(request.actorId === undefined ? {} : { actorId: request.actorId }) }))
      if (!this.authorCurrent(generation)) return
      const people = unwrap(await this.remote.characters({ instanceId: request.instanceId, query: request.query,
        revision: workspace.instance.revision }))
      if (!this.authorCurrent(generation)) return
      if (workspace.instance.id !== request.instanceId || people.revision !== workspace.instance.revision) throw new Error('Author query revisions do not match')
      this.authorStore.set({ request, workspace, people, loading: false, error: null })
    } catch (error) {
      if (!this.disposed && generation === this.authorGeneration) this.authorStore.update((state) => {
        Object.assign(state, { loading: false, error: message(error) })
      })
    }
  }

  /** End subscriptions and invalidate in-flight pulls before removing the client service. */
  /** Stop the selected run after explicit library removal without disposing the browser. */
  clearPlay(): void {
    ++this.playGeneration; this.closeSubscription()
    this.playStore.set({ request: null, view: null, choices: null, loading: false, error: null })
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.closeSubscription()
    await Promise.allSettled(this.closing)
    if (this.cleanupFailures.length > 0) throw new AggregateError(this.cleanupFailures, 'Play subscription disposal failed')
  }

  private async consume(stream: PlaySubscription, request: PlayFollowRequest, generation: number): Promise<void> {
    let revision = -1
    try {
      for await (const item of stream) {
        if (this.disposed || generation !== this.playGeneration) return
        const view = item.value
        if (view.instanceId !== request.instanceId) throw new Error('Play stream changed instance')
        if (view.revision < revision) throw new Error('Play stream regressed its narrative revision')
        revision = view.revision
        this.playStore.set({ request, view, choices: null, loading: false, error: null })
        void this.loadChoices(view, generation)
        item.accept()
      }
      if (!this.disposed && generation === this.playGeneration) throw new Error('Play stream ended before cancellation')
    } catch (error) { this.playFailure(generation, error) }
    finally {
      if (this.subscription === stream) { this.subscription = undefined; this.close(stream) }
    }
  }

  private async loadChoices(view: PlayView, generation: number): Promise<void> {
    try {
      const choices = unwrap(await this.remote.embodimentChoices({ instanceId: view.instanceId, revision: view.revision }))
      if (this.disposed || generation !== this.playGeneration || this.playStore.getSnapshot().view?.revision !== view.revision) return
      if (choices.revision !== view.revision) throw new Error('Character selection revision does not match play')
      this.playStore.update((state) => { Object.assign(state, { choices }) })
    } catch (error) {
      if (this.playStore.getSnapshot().view?.revision === view.revision) this.playFailure(generation, error)
    }
  }

  private playFailure(generation: number, error: unknown): void {
    if (!this.disposed && generation === this.playGeneration) this.playStore.update((state) => {
      Object.assign(state, { loading: false, error: message(error) })
    })
  }
  private closeSubscription(): void {
    const stream = this.subscription
    this.subscription = undefined
    if (stream !== undefined) this.close(stream)
  }
  private close(stream: PlaySubscription): void {
    const closing = stream.dispose().finally(() => { this.closing.delete(closing) })
    this.closing.add(closing)
    void closing.catch((error: unknown) => { this.cleanupFailures.push(error) })
  }
  private authorCurrent(generation: number): boolean { return !this.disposed && generation === this.authorGeneration }
  private assertActive(): void { if (this.disposed) throw new Error('Roleplay client is disposed') }
}
