/** Shared storybook and live-recipe length controls use the persisted numeric settings. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { narrationLengthSchema, type ContextRecipe } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import css from './Narrative.module.css'

/** Keep limits visible and validate their relationship beside the inputs. */
export function NarrationLengthFields({ t, value, change }: PropsLocale<'narrative'> & {
  value: ContextRecipe['narrationLength']
  change: (value: NonNullable<ContextRecipe['narrationLength']>) => void
}) {
  const settings = value ?? { enabled: false, minimum: 1000, target: 1500 }
  const invalid = !narrationLengthSchema.safeParse(settings).success
  return <fieldset className={css.recipeRepair}>
    <legend>{t('narrationLength')}</legend>
    <label><input type="checkbox" checked={settings.enabled} onChange={(event) =>{  change({ ...settings, enabled: event.target.checked }) }} />{t('narrationAutoExpand')}</label>
    <div className={css.toolbar}>
      {(['minimum', 'target'] as const).map(key => <label key={key}>{t(key === 'minimum' ? 'narrationMinimum' : 'narrationTarget')}
        <input type="number" inputMode="numeric" min={key === 'target' ? Math.max(1, settings.minimum) : 1} max={10000} step={1}
          required aria-invalid={invalid} value={settings[key] || ''}
          onChange={(event) =>{  change({ ...settings, [key]: Number(event.target.value) }) }} /></label>)}
    </div>
    {invalid && <p role="alert">{t('narrationLengthInvalid')}</p>}
    <p>{t('narrationLengthHint')}</p>
  </fieldset>
}
