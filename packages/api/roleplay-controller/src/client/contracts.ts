/** Browser mirrors use explicit query views, never a Story or execution aggregate. */
import type { BookDraft, InstanceOverview, PlayView, PlayQueryRequest, AuthorWorkspaceView,
  AuthorPeopleView, AuthorPeopleQuery, InstanceId, EmbodimentChoicesView } from '@deepseek-ai/dsh-roleplay-core/types'

/** Last usable library baseline and the state of its latest refresh. */
export interface LibrarySnapshot {
  readonly books: readonly BookDraft[]
  readonly instances: readonly InstanceOverview[]
  readonly loading: boolean
  readonly error: string | null
}
/** A changing query scope clears the old perspective before any replacement request is made. */
export interface PlaySnapshot {
  readonly request: PlayQueryRequest | null
  readonly view: PlayView | null
  readonly choices: EmbodimentChoicesView | null
  readonly loading: boolean
  readonly error: string | null
}
/** Author query scope is separate from the play audience, including its character selection. */
export interface AuthorRequest {
  readonly instanceId: InstanceId
  readonly actorId?: string
  readonly query: AuthorPeopleQuery
}
/** Author settings and character pages are accepted only at the same narrative revision. */
export interface AuthorSnapshot {
  readonly request: AuthorRequest | null
  readonly workspace: AuthorWorkspaceView | null
  readonly people: AuthorPeopleView | null
  readonly loading: boolean
  readonly error: string | null
}
