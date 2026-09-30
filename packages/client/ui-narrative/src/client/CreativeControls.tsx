/** Shared author controls keep publication distinct from following and copying. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { type ContextSection } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import { type CreativeModule, type CreativeValue } from '@deepseek-ai/dsh-roleplay-core/creative-modules'
import type { CreativeSettingsView } from '@deepseek-ai/dsh-roleplay-core/creative-application'
import { NarrationLengthFields } from './NarrationLengthFields.tsx'
import css from './Narrative.module.css'

export const creativeLabels = { narrationLength: 'creativeModuleNarration', 'director.performance': 'creativeModuleDirector',
  'actor.performance': 'creativeModuleActor', 'director.reasoning-mode': 'creativeModuleDirectorReasoning', 'actor.reasoning-mode': 'creativeModuleActorReasoning' } as const
/** Render the same module fields for global editing and explicit copying. */
export function CreativeValueEditor({ t, module, value, change }: PropsLocale<'narrative'> & {
  module: CreativeModule
  value: CreativeValue
  change: (value: CreativeValue) => void
}) {
  if (module === 'narrationLength') return <NarrationLengthFields t={t}
    value={value !== null && 'minimum' in value ? value : undefined} change={change} />
  if (value === null || !('id' in value)) return <p>{t('disabled')}</p>
  const patch = (input: Partial<ContextSection>) => { change({ ...value, ...input }) }
  return <div className={css.creativeFields}>
    <label><input type="checkbox" checked={value.enabled} onChange={(event) => { patch({ enabled: event.target.checked }) }} />{t('enabled')}</label>
    <label>{t('title')}<input value={value.title ?? ''} onChange={(event) => { patch({ title: event.target.value }) }} /></label>
    <label>{t('role')}<select value={value.role} onChange={(event) => { patch({ role: event.target.value as ContextSection['role'] }) }}>
      {(['system', 'user', 'assistant'] as const).map(role => <option key={role}>{role}</option>)}
    </select></label>
    <label>{t(creativeLabels[module])}<textarea rows={8} value={value.content ?? ''} onChange={(event) => { patch({ content: event.target.value }) }} /></label>
  </div>
}
/** Readable provenance is shared by the editor and the synchronization overview. */
export function CreativeSourceLabel({ t, view, module }: PropsLocale<'narrative'> & {
  view: CreativeSettingsView
  module: CreativeModule
}) {
  const binding = view.bindings.modules[module]
  return <span>{t(binding.source === 'local' ? 'syncLocal' : binding.source === 'storybook' ? 'syncPinned' : 'syncFollowing')}
    {binding.source === 'global' && <small> · {t(binding.followPaused ? 'syncPaused'
      : binding.appliedGlobalRevision === view.global.revision ? 'syncCurrent' : 'syncPending')}</small>}
  </span>
}
