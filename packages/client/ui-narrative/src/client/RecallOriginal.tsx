/** Present only recognized, complete recipient records; preserve the exact original for inspection. */
import type { Evidence } from '@deepseek-ai/dsh-roleplay-core/world'
import type { NarrativeRecallView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'

type Entry = NarrativeRecallView['entries'][number]

type Person = { ref: string; label: string }
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const person = (value: unknown): value is Person => {
  const fields = object(value)
  return typeof fields.ref === 'string' && fields.ref.length > 0 && typeof fields.label === 'string' && fields.label.length > 0
}

// This recognizes a display shape only; the host remains the validator and complete raw text remains available.
function behaviorOf(value: unknown): Evidence['behavior'] {
  const behavior = object(value)
  if (behavior.kind === 'speech' && person(behavior.speaker)
    && (behavior.delivery === 'spoken' || behavior.delivery === 'whispered' || behavior.delivery === 'written')
    && (behavior.addressedTo === undefined || (Array.isArray(behavior.addressedTo) && behavior.addressedTo.every(person)))) {
    return { kind: 'speech', speaker: behavior.speaker, delivery: behavior.delivery,
      ...(behavior.addressedTo === undefined ? {} : { addressedTo: behavior.addressedTo }) }
  }
  if (behavior.kind === 'action' && person(behavior.actor) && (behavior.target === undefined || person(behavior.target))) {
    return { kind: 'action', actor: behavior.actor, ...(behavior.target === undefined ? {} : { target: behavior.target }) }
  }
  return undefined
}

function attributed(entry: Entry) {
  if (entry.truncated || (entry.characterOffset ?? 0) !== 0
    || !['claim', 'action-attempt'].includes(entry.kind)) return undefined
  try {
    const value: unknown = JSON.parse(entry.text)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
    const record = value as Record<string, unknown>
    if (record.id !== entry.id || record.revision !== entry.revision || typeof record.content !== 'string') return undefined
    const behavior = behaviorOf(record.behavior)
    if (behavior === undefined || (behavior.kind === 'speech'
      ? entry.kind !== 'claim' || record.kind !== 'claim'
      : entry.kind !== 'action-attempt' || record.kind !== 'observation')) return undefined
    return { content: record.content, behavior }
  } catch { return undefined }
}

/** Read frozen names and wording, never current character identity or inferred action outcomes. */
export function RecallOriginal({ item, t }: Pick<NarrativeProps, 't'> & { item: Entry }) {
  const record = attributed(item)
  if (record === undefined) return <><small>{item.id}</small><p className={css.recordText}>{item.text}</p></>
  const behavior = record.behavior
  const person = behavior.kind === 'speech' ? behavior.speaker : behavior.actor
  const targets = behavior.kind === 'speech' ? behavior.addressedTo ?? [] : behavior.target === undefined ? [] : [behavior.target]
  return <>
    <header className={css.cardHeader}><strong>{person.label}</strong><span className={css.badge}>{t(behavior.kind)}</span>
      {behavior.kind === 'speech' && <span className={css.metadata}>{t(behavior.delivery)}</span>}
    </header>
    {targets.length > 0 && <p className={css.metadata}>{t('performanceTarget')}: {targets.map(target => target.label).join(' · ')}</p>}
    <p className={css.recordText}>{record.content}</p>
    <details className={css.disclosure}><summary>{t('rawData')}</summary><pre>{item.text}</pre></details>
  </>
}
