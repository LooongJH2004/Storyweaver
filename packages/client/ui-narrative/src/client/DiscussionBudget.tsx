/** Compact exchange progress uses authoritative public counts rather than transcript pagination. */
import type { PlayView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'

/** Older projected views retain their round display until refreshed. */
export function DiscussionBudget({ discussion, t }: { discussion: NonNullable<PlayView['discussion']>; t: NarrativeProps['t'] }) {
  return <span>{discussion.publicTurns === undefined
    ? t('discussionRound', { round: discussion.round, maximum: discussion.maxRounds })
    : t('discussionPublicTurns', discussion.publicTurns)}</span>
}
