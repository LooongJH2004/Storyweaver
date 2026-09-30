/** Separate, labeled speech and action drafts share one atomic submission. */
import { useId, useRef } from 'react'
import type { NarrativeProps } from './contract.ts'
import type { PlayerPerformance } from './player-performance.ts'
import css from './Narrative.module.css'

/** Render independent recipient controls and preserve IME composition in both textareas. */
export function PlayerPerformanceFields({ value, people, change, t }: {
  value: PlayerPerformance
  people: readonly { ref: string; label: string }[]
  change: (value: PlayerPerformance) => void
  t: NarrativeProps['t']
}) {
  const composingUntil = useRef(0)
  const hint = useId()
  const recipientError = value.speech.trim() !== '' && value.delivery !== 'spoken' && value.target === ''
  return <div className={css.performanceFields}>
    <p id={hint} className={css.metadata}>{t('performanceFieldsHint')}</p>
    {(['speech', 'action'] as const).map(kind => <section className={css.performanceField} key={kind}>
      <label className={css.composerField}><span>{t(kind === 'speech' ? 'playerSpeech' : 'playerAction')}</span>
        <textarea aria-label={t(kind === 'speech' ? 'playerSpeech' : 'playerAction')} aria-describedby={hint}
          placeholder={t(kind === 'speech' ? 'playerSpeechPlaceholder' : 'playerActionPlaceholder')} value={value[kind]} rows={3}
          onChange={(event) => { change({ ...value, [kind]: event.target.value }) }}
          onCompositionStart={() => { composingUntil.current = Infinity }}
          onCompositionEnd={() => { composingUntil.current = Date.now() + 10 }}
          onKeyDown={(event) => {
            // Safari can report the IME-closing Enter after compositionend.
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || Date.now() < composingUntil.current) return
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault(); if (!event.repeat) event.currentTarget.form?.requestSubmit()
            }
          }} />
      </label>
      <div className={css.performanceOptions}>
        {kind === 'speech' && <label>{t('delivery')}<select aria-label={t('delivery')} value={value.delivery}
          onChange={(event) => { change({ ...value, delivery: event.target.value as PlayerPerformance['delivery'] }) }}>
          {(['spoken', 'whispered', 'written'] as const).map(delivery => <option key={delivery} value={delivery}>{t(delivery)}</option>)}
        </select></label>}
        <label>{t(kind === 'speech' ? 'speechRecipient' : 'actionRecipient')}<select
          aria-label={t(kind === 'speech' ? 'speechRecipient' : 'actionRecipient')}
          value={kind === 'speech' ? value.target : value.actionTarget} aria-invalid={kind === 'speech' && recipientError}
          onChange={(event) => { change({ ...value, [kind === 'speech' ? 'target' : 'actionTarget']: event.target.value }) }}>
          <option value="">{t(kind === 'speech' ? 'sceneRecipients' : 'noPersonTarget')}</option>
          {(kind === 'speech' ? value.target : value.actionTarget) !== ''
            && !people.some(person => person.ref === (kind === 'speech' ? value.target : value.actionTarget))
            && <option value={kind === 'speech' ? value.target : value.actionTarget}>{t('performanceTargetUnavailable')}</option>}
          {people.map(person => <option key={person.ref} value={person.ref}>{person.label}</option>)}
        </select></label>
      </div>
      {kind === 'speech' && recipientError && <p className={css.metadata} role="status">{t('speechRecipientRequired')}</p>}
      {kind === 'action' && <small className={css.metadata}>{t('attemptHint')}</small>}
    </section>)}
  </div>
}
