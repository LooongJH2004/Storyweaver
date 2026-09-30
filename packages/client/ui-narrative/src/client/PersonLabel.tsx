/** Player-only canonical-name annotation; the perspective label stays unchanged. */
import type { PlayerPersonLabel } from '@deepseek-ai/dsh-roleplay-core/types'
import css from './Narrative.module.css'

/** Plain-text form for native selection controls. */
export function personLabelText(person: PlayerPersonLabel): string {
  return person.trueName?.trim() && person.trueName !== person.label ? `${person.label}（${person.trueName}）` : person.label
}

/** Turn headers pair the canonical name with objective appearance; perspective controls keep encounter labels. */
export function PersonLabel({ person, nameFirst = false }: { person: PlayerPersonLabel; nameFirst?: boolean }) {
  const description = person.appearance?.trim() || person.label
  if (nameFirst && person.trueName?.trim()) return <span className={css.speakerIdentity}><strong>{person.trueName}</strong>
    {person.trueName !== description && <span>{description}</span>}</span>
  return <span className={css.personLabel}><strong>{person.label}</strong>
    {person.trueName?.trim() && person.trueName !== person.label && <span className={css.trueName}>（{person.trueName}）</span>}
  </span>
}
