import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionEventMap, SessionEventType } from '@deepseek-ai/dsh-session'
import { ActorId, ActorMemoryId, PlayerInterventionId } from '../src/types.ts'
import { foldActor, isActorEvent } from '../src/fold.ts'

const ACTOR = ActorId('keeper')

function event<T extends SessionEventType>(type: T, data: SessionEventMap[T], seq: number): SessionEvent<T> {
  return { type, data, seq, time: seq } as SessionEvent<T>
}

const descriptor = event('actor/descriptor', {
  version: 1,
  actor: {
    id: ACTOR,
    displayName: 'The Keeper',
    persona: 'Protects the archive but fears fire.',
    capabilities: ['speak', 'act', 'reflect', 'memory', 'goals', 'schedule'],
  },
}, 0)

describe('Actor fold', () => {
  it('restores private state to an audit-only rewind boundary before applying the new branch', () => {
    const state = foldActor([
      descriptor,
      event('actor/thought', {
        version: 1,
        thought: {
          id: 'thought-superseded' as never,
          actorId: ACTOR,
          content: 'I already answered this question in the discarded branch.',
          about: ['discarded branch'],
        },
      }, 1),
      event('actor/state-rewind', {
        version: 1,
        afterEventSeq: 0,
        reason: 'story-rewrite',
      }, 2),
      event('actor/thought', {
        version: 1,
        thought: {
          id: 'thought-first-branch' as never,
          actorId: ACTOR,
          content: 'Only the current fictional moment is familiar.',
          about: ['current moment'],
        },
      }, 3),
      event('actor/state-rewind', {
        version: 1,
        afterEventSeq: 2,
        reason: 'story-rewrite',
      }, 4),
      event('actor/thought', {
        version: 1,
        thought: {
          id: 'thought-current' as never,
          actorId: ACTOR,
          content: 'I respond from what I know now.',
          about: ['current moment'],
        },
      }, 5),
    ])

    expect(state.thoughts).toEqual([expect.objectContaining({ id: 'thought-current' })])
    expect(isActorEvent(event('actor/state-rewind', {
      version: 1,
      afterEventSeq: 0,
      reason: 'story-rewrite',
    }, 1))).toBe(true)
  })

  it('projects active memory and preserves a forgotten tombstone', () => {
    const memoryId = ActorMemoryId('memory-1')
    const state = foldActor([
      descriptor,
      event('actor/memory', {
        version: 1,
        memory: {
          id: memoryId,
          actorId: ACTOR,
          content: 'Mira returned the brass key.',
          importance: 4,
          tags: ['mira', 'key'],
          sourceRefs: ['scene-7'],
        },
      }, 1),
      event('actor/memory-forgotten', {
        version: 1,
        actorId: ACTOR,
        memoryId,
        reason: 'The bargain demanded it.',
      }, 2),
    ])

    expect(state.memories.get(memoryId)).toMatchObject({
      status: 'forgotten',
      forgottenReason: 'The bargain demanded it.',
      record: { content: 'Mira returned the brass key.' },
    })
    expect(isActorEvent(descriptor)).toBe(true)
    expect(isActorEvent(event('turn/start', { turn: 1 }, 3))).toBe(false)
  })

  it('keeps player embodiment distinct from Actor-authored behavior', () => {
    const interventionId = PlayerInterventionId('player-1')
    const state = foldActor([
      descriptor,
      event('actor/player-intervention', {
        version: 1,
        intervention: {
          id: interventionId,
          kind: 'embody-speech',
          targetActorId: ACTOR,
          content: 'Open the gate.',
          audience: ['guard'],
          delivery: 'spoken',
        },
      }, 1),
      event('actor/expression', {
        version: 1,
        expression: {
          id: 'expression-1' as never,
          actorId: ACTOR,
          origin: 'player',
          playerInterventionId: interventionId,
          text: 'Open the gate.',
          audience: ['guard'],
          delivery: 'spoken',
        },
      }, 2),
    ])

    expect(state.expressions).toEqual([expect.objectContaining({ origin: 'player' })])
    expect(state.playerInterventions).toEqual([expect.objectContaining({ kind: 'embody-speech' })])
  })

  it('rejects malformed relations and duplicate terminal transitions', () => {
    expect(() => foldActor([event('actor/memory-forgotten', {
      version: 1,
      actorId: ACTOR,
      memoryId: ActorMemoryId('missing'),
    }, 0)])).toThrow(/precedes character\.defined/)

    const mismatchedIntervention = event('actor/player-intervention', {
      version: 1,
      intervention: {
        id: PlayerInterventionId('player-mismatch'),
        kind: 'embody-action',
        targetActorId: ACTOR,
        content: 'Raise the bridge.',
      },
    }, 1)
    expect(() => foldActor([
      descriptor,
      mismatchedIntervention,
      event('actor/action-intent', {
        version: 1,
        action: {
          id: 'action-1' as never,
          actorId: ACTOR,
          origin: 'player',
          playerInterventionId: PlayerInterventionId('player-mismatch'),
          description: 'Lower the bridge.',
        },
      }, 2),
    ])).toThrow(/diverges from its intervention/)

    expect(() => foldActor([
      descriptor,
      event('turn/start', { turn: 1 }, 1),
      event('actor/turn-closed', { version: 1, actorId: ACTOR, turn: 1, reason: 'yield' }, 2),
      event('actor/turn-closed', { version: 1, actorId: ACTOR, turn: 1, reason: 'yield' }, 3),
    ])).toThrow(/closed twice/)
  })

  it('accepts actor-independent player direction in a control Session', () => {
    const state = foldActor([event('actor/player-intervention', {
      version: 1,
      intervention: {
        id: PlayerInterventionId('direction-1'),
        kind: 'story-direction',
        content: 'Let the eclipse arrive before dawn.',
      },
    }, 0)])
    expect(state.descriptor).toBeUndefined()
    expect(state.playerInterventions).toHaveLength(1)
    expect(SessionId('control')).toBe('control')
  })
})
