import type { ReactNode } from 'react'
import css from './TranscriptCard.module.css'

/** Presentation-only frame recovered from the original roleplay event cards.
 * Callers own projected names, accepted text, metadata, and request inspection.
 */
export function TranscriptCard(props: {
  owner: ReactNode
  initial: string
  glyph: string
  label: string
  variant: 'speech' | 'action' | 'narration' | 'perception' | 'direction'
  rail?: ReactNode
  children: ReactNode
}) {
  return <div className={css.row} data-kind={props.variant}>
    <div className={css.rail}>
      <span className={css.marker} aria-hidden="true"><span>{props.initial}</span><i>{props.glyph}</i></span>
      {props.rail}
    </div>
    <div className={css.card}>
      <div className={css.heading}>{props.owner}<span className={css.label}>{props.label}</span></div>
      <div className={css.content}>{props.children}</div>
    </div>
  </div>
}
