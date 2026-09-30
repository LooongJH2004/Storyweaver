/** Visual state-template authoring backed by the existing storybook JSON draft. */
import { applyStateChanges, initializeDynamicState, stateInitialValueSchema } from '@deepseek-ai/dsh-story/state'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import { DynamicStateEditor } from './DynamicStateEditor.tsx'

/** Edit the same initial-state values used by the JSON editor and runtime initializer. */
export function StorybookStateFields({ source, actorId, actors, t, onChange }: {
  source: string
  actorId: string
  actors: readonly { actorId: string; displayName: string }[]
  t: PropsLocale<typeof NS>['t']
  onChange: (source: string) => void
}) {
  let state
  try {
    const values: unknown = JSON.parse(source)
    if (!Array.isArray(values)) throw new Error('State definitions must be an array')
    state = initializeDynamicState(values.map(value => stateInitialValueSchema.parse(value)), actors.map(actor => actor.actorId))
  } catch (error) {
    return <p role="alert">{error instanceof Error ? error.message : String(error)}</p>
  }
  return <DynamicStateEditor state={state} actorId={actorId} actors={actors} t={t} onSave={(changes) => {
    const next = applyStateChanges(state, changes, { kind: 'author' }, actors.map(actor => actor.actorId))
    const initial = next.entries.filter(entry => entry.active).map(entry => ({ definition: entry.definition, value: entry.value }))
    onChange(JSON.stringify(initial, undefined, 2))
    return Promise.resolve()
  }} />
}
