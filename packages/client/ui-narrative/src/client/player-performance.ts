/** Browser draft and ordered behavior for one player-authored character response. */
export type PlayerPerformance = {
  speech: string
  action: string
  delivery: 'spoken' | 'whispered' | 'written'
  target: string
  actionTarget: string
}

/** Empty fields leave the corresponding behavior out of the submission. */
export const emptyPerformance: PlayerPerformance = { speech: '', action: '', delivery: 'spoken', target: '', actionTarget: '' }

/**
 * Keep speech and action separate, in their displayed order.
 * @param value - Complete player draft with independent targets.
 * @returns public speech followed by the attempted action, omitting blank fields.
 */
export function performanceBehavior(value: PlayerPerformance) {
  return [
    ...(value.speech.trim() === '' ? [] : [{ kind: 'speech' as const, text: value.speech,
      to: value.target === '' ? [] : [value.target], delivery: value.delivery }]),
    ...(value.action.trim() === '' ? [] : [{ kind: 'action' as const, attempt: value.action,
      ...(value.actionTarget === '' ? {} : { target: value.actionTarget }) }]),
  ]
}
