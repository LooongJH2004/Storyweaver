/** Review authored text without exposing transport JSON as product UI. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { CreativeValue } from '@deepseek-ai/dsh-roleplay-core/creative-modules'
import css from './CreativeSync.module.css'

export function CreativePreview({ t, value }: PropsLocale<'narrative'> & { value: CreativeValue | undefined }) {
  if (value === undefined) return <p>{t('syncUnset')}</p>
  if (value === null) return <p>{t('disabled')}</p>
  if ('minimum' in value) return <p>{t(value.enabled ? 'syncLengthValue' : 'disabled', {
    minimum: value.minimum, target: value.target,
  })}</p>
  return <><small>{t(value.enabled ? 'enabled' : 'disabled')} · {value.role}</small><div className={css.preview}>{value.content ?? ''}</div></>
}
