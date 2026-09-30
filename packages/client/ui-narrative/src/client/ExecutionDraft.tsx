/** Incomplete model arguments are readable drafts, never published narrative records. */
import { parse } from 'partial-json'
import { StoryMarkdown } from './StoryMarkdown.tsx'
import type { ExecutionResponseView, PlayView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
type DraftLine = { id: string; kind: 'speech' | 'action' | 'narration'; text: string }

/** Decode only public behavior/narration fields, without displaying private tool mutations as fiction. */
export function draftLines(response: ExecutionResponseView): DraftLine[] {
  return response.toolCalls.flatMap<DraftLine>((call) => {
    let raw: unknown
    try { raw = parse(call.arguments) } catch { return [] } // A partial escape or key may not yet be parseable.
    const value = call.name === 'director_command' ? record(record(raw).command) : record(raw)
    if (call.name === 'director_observe' || call.name === 'director_command' && value.operation === 'observe') {
      const narration = call.name === 'director_observe' ? value.narration : record(value.input).narration
      return typeof narration === 'string' ? [{ id: call.id, kind: 'narration' as const, text: narration }] : []
    }
    if (call.name !== 'npc_commit_turn' || !Array.isArray(value.behavior)) return []
    return value.behavior.flatMap<DraftLine>((item: unknown, index: number) => {
      const behavior = record(item)
      if (behavior.kind === 'speech' && typeof behavior.text === 'string') return [{ id: `${call.id}:${index}`, kind: 'speech' as const, text: behavior.text }]
      if (behavior.kind === 'action' && typeof behavior.attempt === 'string') return [{ id: `${call.id}:${index}`, kind: 'action' as const, text: behavior.attempt }]
      return []
    })
  })
}

/** Draft cards disappear when the application publishes the accepted turn or cancels it. */
export function ExecutionDraft({ response, t, draft }: Pick<NarrativeProps, 't'> & {
  response?: ExecutionResponseView | undefined
  draft?: PlayView['narrationDraft']
}) {
  let lines = response === undefined ? [] : draftLines(response)
  if (draft !== undefined) {
    let text = draft.text
    for (const call of response?.toolCalls ?? []) {
      if (call.name !== 'director_revise_narration') continue
      let raw: unknown
      try { raw = parse(call.arguments) } catch { continue }
      const value = record(raw)
      if (value.draftRevision !== draft.revision || typeof value.narration !== 'string') continue
      if (value.mode === 'append') text += `\n\n${value.narration}`
      else if (value.mode === 'replace') text = value.narration
    }
    lines = [{ id: draft.attempt, kind: 'narration', text }]
  }
  return <div data-execution-draft>{draft !== undefined && <p role="status">{t(draft.status === 'exhausted' ? 'narrationDraftExhausted' : 'narrationDraftProgress', {
    count: draft.characters, minimum: draft.minimum,
  })}</p>}{lines.map((line, index) => <div key={line.kind === 'narration' && index === 0 ? 'narration' : line.id} className={css.turnRow} data-kind={line.kind}>
    <small>{t(line.kind)} · {t('uncommittedDraft')}</small>
    <StoryMarkdown text={line.text} streaming={response?.state === 'streaming'} t={t} />
  </div>)}</div>
}
