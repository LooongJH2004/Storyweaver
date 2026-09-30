/** Shared author controls preserve both the public budget and floor policy when editing either. */
import type { InstanceSettings } from '@deepseek-ai/dsh-roleplay-core/settings'
import type { NarrativeProps } from './contract.ts'

/** Scheduling changes apply to discussions started after these settings are saved. */
export function DiscussionSettingsFields(props: {
  value: InstanceSettings['discussionSettings']
  change: (value: InstanceSettings['discussionSettings']) => void
  t: NarrativeProps['t']
}) {
  const { value, change, t } = props
  return <>
    <label>{t('discussionRounds')}<input type="number" min={1} max={20} value={value.maxRounds}
      onChange={(event) => {
        if (Number.isFinite(event.target.valueAsNumber)) change({ ...value, maxRounds: event.target.valueAsNumber })
      }} /></label>
    <label>{t('discussionFloorPolicy')}<select value={value.floorPolicy ?? 'eagerness'} onChange={(event) => {
      change({ ...value, floorPolicy: event.target.value === 'balanced' ? 'balanced' : 'eagerness' })
    }}>
      <option value="balanced">{t('discussionBalanced')}</option>
      <option value="eagerness">{t('discussionEagerness')}</option>
    </select></label>
    <small>{t('discussionPolicyHint')}</small>
  </>
}
