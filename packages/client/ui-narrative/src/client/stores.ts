import type { GlobalCreativeSettings, CreativeModule } from '@deepseek-ai/dsh-roleplay-core/creative-modules'
/** Viewing choices and unsent prose belong to the browser, never the narrative store. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { InstanceSettings } from '@deepseek-ai/dsh-roleplay-core/settings'
import type { ContextRecipe } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import type { BookDraft } from '@deepseek-ai/dsh-roleplay-core/types'
import type { PlayerPerformance } from './player-performance.ts'

/** A mode changes the next command without changing its prose. */
export type InputMode = 'advance' | 'guide' | 'intervene' | 'embody'
/** Author workspace section retained when navigating from a character or player tool. */
export type AuthorTab = 'settings' | 'characters' | 'style' | 'state' | 'context'
type SettingsDraft = { values: Record<keyof InstanceSettings, string>; overridden: string[]; edited: (keyof InstanceSettings)[] }
type BookEdit = { draft: BookDraft; title: string; document: string }
/** Synchronization navigation retains its origin and explicit book/run scope. */
export type CreativeNavigation = { bookId?: string; instanceId?: string; tab: 'shared' | 'stories' | 'book' | 'defaults' }
type ViewState = { creativeNavigation?: CreativeNavigation; creativeReturn?: ViewState['panel']; globalCreativeDrafts?: Record<string, { revision: number; modules: GlobalCreativeSettings['modules']; selected: CreativeModule[] }>; performances?: Record<string, PlayerPerformance>; actorFacingBeatDrafts?: Record<string, string>; importingBooks?: boolean; panel: 'play' | 'author' | 'books' | 'history' | 'creator' | 'creator-home' | 'global-creative'; bookId: string | null; newBook: number; bookEdits: Record<string, BookEdit>; recipeDrafts?: Record<string, ContextRecipe>; settingsDrafts?: Record<string, SettingsDraft>; authorActors?: Record<string, string>; authorTab: AuthorTab; mode: InputMode; drafts: Record<string, string> }
type ViewActions = {
  openCreative: (state: ViewState, navigation: CreativeNavigation) => void
  creativeNavigate: (state: ViewState, navigation: CreativeNavigation) => void
  closeCreative: (state: ViewState) => void
  globalCreativeDraft: (state: ViewState, bookId: string, draft: NonNullable<ViewState['globalCreativeDrafts']>[string] | null) => void
  performance: (state: ViewState, key: string, value: PlayerPerformance) => void
  performanceAccepted: (state: ViewState, key: string, value: PlayerPerformance) => void
  importBooks: (state: ViewState, open: boolean) => void
  bookLibrary: (state: ViewState) => void
  authorActor: (state: ViewState, id: string, actorId: string) => void
  settingsDraft: (state: ViewState, id: string, draft: SettingsDraft | null) => void
  recipeDraft: (state: ViewState, id: string, recipe: ContextRecipe | null) => void
  panel: (state: ViewState, panel: ViewState['panel']) => void
  book: (state: ViewState, id: string | null) => void
  editBook: (state: ViewState, editor: BookEdit) => void
  bookText: (state: ViewState, patch: Partial<Pick<BookEdit, 'title' | 'document'>>) => void
  closeBook: (state: ViewState) => void
  authorTab: (state: ViewState, tab: AuthorTab) => void
  mode: (state: ViewState, mode: InputMode) => void
  draft: (state: ViewState, instanceId: string, text: string) => void
  accepted: (state: ViewState, instanceId: string, submittedText: string) => void
  actorFacingBeat: (state: ViewState, instanceId: string, text: string) => void
  actorFacingBeatAccepted: (state: ViewState, instanceId: string, submittedText: string) => void
}
/** Create one shared navigation and draft handle per plugin lifetime.
 * @returns browser viewing state without server projections.
 */
export function createNarrativeStore(): EngineStoreHandle<ViewState, ViewActions> {
  return defineStore({ persist: 'storyweaver.navigation.v2', init: (): ViewState => ({ panel: 'play', bookId: null, newBook: 0, bookEdits: {}, recipeDrafts: {}, settingsDrafts: {}, authorActors: {}, authorTab: 'settings', mode: 'advance', drafts: {} }), actions: {
    openCreative: (state, navigation) => {
      if (state.panel !== 'global-creative') state.creativeReturn = state.panel
      state.creativeNavigation = navigation; state.panel = 'global-creative'
    },
    creativeNavigate: (state, navigation) => { state.creativeNavigation = navigation },
    closeCreative: (state) => { state.panel = state.creativeReturn ?? 'play' },
    globalCreativeDraft: (state, bookId, draft) => {
      state.globalCreativeDrafts ??= {}
      if (draft === null) Reflect.deleteProperty(state.globalCreativeDrafts, bookId)
      else state.globalCreativeDrafts[bookId] = draft
    },
    importBooks: (state, open) => { state.importingBooks = open; if (open) state.panel = 'books' },
    performance: (state, key, value) => { state.performances ??= {}; state.performances[key] = value },
    performanceAccepted: (state, key, value) => {
      const current = state.performances?.[key]
      if (current === undefined) return
      if (current.speech === value.speech) current.speech = ''
      if (current.action === value.action) current.action = ''
    },
    bookLibrary: (state) => { state.bookId = null; state.newBook = 0; state.panel = 'books' },
    authorActor: (state, id, actorId) => { state.authorActors ??= {}; state.authorActors[id] = actorId },
    settingsDraft: (state, id, draft) => { state.settingsDrafts ??= {}
      if (draft === null) Reflect.deleteProperty(state.settingsDrafts, id); else state.settingsDrafts[id] = draft },
    recipeDraft: (state, id, recipe) => { state.recipeDrafts ??= {}
      if (recipe === null) Reflect.deleteProperty(state.recipeDrafts, id); else state.recipeDrafts[id] = recipe },
    panel: (state, panel) => { state.panel = panel },
    book: (state, id) => { state.bookId = id; if (id === null) state.newBook++; state.panel = 'books' },
    editBook: (state, editor) => { state.bookId = editor.draft.id; state.bookEdits[editor.draft.id] = editor },
    bookText: (state, patch) => {
      if (state.bookId !== null) { const editor = state.bookEdits[state.bookId]; if (editor !== undefined) Object.assign(editor, patch) }
    },
    closeBook: (state) => {
      if (state.bookId !== null) Reflect.deleteProperty(state.bookEdits, state.bookId)
      state.bookId = null; state.newBook = 0
    },
    authorTab: (state, tab) => { state.authorTab = tab },
    mode: (state, mode) => { state.mode = mode },
    draft: (state, instanceId, text) => { state.drafts[instanceId] = text },
    accepted: (state, instanceId, submittedText) => { if (state.drafts[instanceId] === submittedText) state.drafts[instanceId] = '' },
    actorFacingBeat: (state, instanceId, text) => { state.actorFacingBeatDrafts ??= {}; state.actorFacingBeatDrafts[instanceId] = text },
    actorFacingBeatAccepted: (state, instanceId, submittedText) => {
      if (state.actorFacingBeatDrafts?.[instanceId] === submittedText) state.actorFacingBeatDrafts[instanceId] = ''
    },
  } })
}
