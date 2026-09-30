/** Browser-personal style copies never synchronize running narrative instances. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { personalStylePresetsSchema, styleProfileSchema, type PersonalStylePreset, type StyleProfile } from '@deepseek-ai/dsh-roleplay-core/style'

const storageKey = 'storyweaver.personal-styles.v1'
/** Read failures remain visible and never silently replace existing personal presets. */
export interface PersonalStylesSnapshot { readonly entries: readonly PersonalStylePreset[]; readonly error: string | null }

/** The existing browser preset format is shared with both product compositions. */
export class PersonalStyles {
  private readonly state = createSnapshotStore<PersonalStylesSnapshot>({ entries: [], error: null })
  readonly snapshot = this.state
  constructor(private readonly storage: () => Pick<Storage, 'getItem' | 'setItem'>) { this.refresh() }

  /** Load personal preferences; invalid stored data stays untouched for repair. */
  refresh(): void {
    try { this.state.set({ entries: this.read(), error: null }) }
    catch (error) { this.state.update((state) => { Object.assign(state, { error: String(error) }) }) }
  }

  /** Save a validated copy; unrelated names and the other performance role remain independent. */
  save(name: string, profile: StyleProfile): void {
    const accepted = personalStylePresetsSchema.element.parse({ name: name.trim(), profile: styleProfileSchema.parse(profile) })
    const entries = [...this.read().filter(item => item.name !== accepted.name || item.profile.kind !== accepted.profile.kind), accepted]
    this.write(entries)
  }

  /** Remove only the selected name and role from this browser's reusable preferences. */
  remove(name: string, kind: StyleProfile['kind']): void {
    this.write(this.read().filter(item => item.name !== name || item.profile.kind !== kind))
  }

  private read(): PersonalStylePreset[] {
    const value = this.storage().getItem(storageKey)
    return value === null ? [] : personalStylePresetsSchema.parse(JSON.parse(value))
  }
  private write(entries: PersonalStylePreset[]): void {
    this.storage().setItem(storageKey, JSON.stringify(entries))
    this.state.set({ entries, error: null })
  }
}
