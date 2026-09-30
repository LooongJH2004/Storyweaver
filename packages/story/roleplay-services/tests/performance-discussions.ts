import type { discussionsOf } from '@deepseek-ai/dsh-roleplay-core/world'

type Discussion = Pick<ReturnType<typeof discussionsOf>['discussions'][number], 'id' | 'status' | 'participantIds' | 'turns'>

/** Count accepted public slots, not speech paragraphs, private preparation or model retries. */
export function performanceDiscussions(discussions: readonly Discussion[]) {
  return discussions.map(discussion => ({
    id: discussion.id, status: discussion.status, publicSlots: discussion.turns.length,
    endingDecision: discussion.turns.at(-1)?.action ?? null,
    speakerOrder: discussion.turns.map(turn => turn.speakerId),
    participants: discussion.participantIds.map((actorId) => {
      const turns = discussion.turns.filter(turn => turn.speakerId === actorId)
      let streak = 0
      let longestConsecutiveSlots = 0
      for (const turn of discussion.turns) {
        streak = turn.speakerId === actorId ? streak + 1 : 0
        longestConsecutiveSlots = Math.max(longestConsecutiveSlots, streak)
      }
      return { actorId, publicSlots: turns.length,
        speakDecisions: turns.filter(turn => turn.action === 'speak').length,
        passes: turns.filter(turn => turn.action === 'pass').length,
        conclusions: turns.filter(turn => turn.action === 'conclude').length,
        unspecifiedDecisions: turns.filter(turn => turn.action === undefined).length,
        longestConsecutiveSlots }
    }),
  }))
}
