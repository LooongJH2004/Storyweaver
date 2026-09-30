/** Optional actor-visible direction stays separate from private Director instruction. */
import { useId, useState } from 'react'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'

/** Show a labeled draft only when the player opens this part of the composer. */
export function ActorFacingBeatField({ t, value, change }: Pick<NarrativeProps, 't'> & {
  value: string
  change: (value: string) => void
}) {
  const [open, setOpen] = useState(value !== '')
  const helpId = useId()
  return <section className={css.actorFacingBeat}>
    <button type="button" className={css.actorFacingBeatToggle} aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
      {t('actorFacingBeatToggle')}{value !== '' ? ` · ${t('actorFacingBeatDrafted')}` : ''}
    </button>
    {open && <>
      <label className={css.composerField}><span>{t('actorFacingBeatLabel')}</span>
        <textarea aria-describedby={helpId} placeholder={t('actorFacingBeatPlaceholder')} value={value}
          onChange={(event) => { change(event.target.value) }} />
      </label>
      <p id={helpId} className={css.modeDescription}>{t('actorFacingBeatHint')}</p>
    </>}
  </section>
}
