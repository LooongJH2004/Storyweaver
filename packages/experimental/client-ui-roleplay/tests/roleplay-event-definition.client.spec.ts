import { describe, expect, it } from 'vitest'
import type {} from '@deepseek-ai/dsh-experimental-actor/types'
import type {} from '@deepseek-ai/dsh-story/types'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import {
  roleplayEventData, roleplayEventDefinition,
} from '../src/client/roleplay-event-definition.ts'

describe('roleplay event projection', () => {
  it('projects authoritative Director narration as a player-visible story event', () => {
    const event = {
      type: 'story/director-narration-projected',
      seq: 3,
      time: 80,
      data: {
        version: 1,
        worldEventId: 'world-event-narration',
        worldRevision: 2,
        briefLedgerRevision: 4,
        turn: 1,
        step: 2,
        content: '雨水沿着站台顶棚骤然倾落，远处的末班车鸣笛逼近。',
      },
    } as SessionEvent<'story/director-narration-projected'>

    expect(roleplayEventData(event)).toEqual({
      kind: 'narration',
      content: '雨水沿着站台顶棚骤然倾落，远处的末班车鸣笛逼近。',
      worldRevision: 2,
      time: 80,
      requestContext: { beforeEventSeq: 3 },
    })
    expect(roleplayEventDefinition.match(event)).toEqual({ id: '3', role: 'start' })
  })

  it('projects accepted Actor behavior copied into the scene without changing its provenance', () => {
    const event = {
      type: 'story/npc-event-projected',
      seq: 4,
      time: 90,
      data: {
        version: 1,
        event: {
          kind: 'speech',
          ledgerRevision: 3,
          actorId: 'shadowheart',
          sessionId: 'actor-shadowheart',
          actorEventSeq: 8,
          toolCallEventSeq: 7,
          text: '别碰那本账簿。',
          audience: ['mira-courier'],
          delivery: 'spoken',
        },
      },
    } as SessionEvent<'story/npc-event-projected'>

    expect(roleplayEventData(event)).toEqual({
      kind: 'speech', actorId: 'shadowheart', content: '别碰那本账簿。', origin: 'actor',
      delivery: 'spoken', audience: ['mira-courier'], time: 90,
      requestContext: { sessionId: 'actor-shadowheart', beforeEventSeq: 7 },
    })
  })

  it('projects Actor speech with provenance and audience intact', () => {
    const event = {
      type: 'actor/expression',
      seq: 7,
      time: 100,
      data: {
        version: 1,
        expression: {
          id: 'expression-1',
          actorId: 'keeper',
          origin: 'player',
          playerInterventionId: 'intervention-1',
          text: 'The archive stays closed.',
          audience: ['visitor'],
          delivery: 'whispered',
        },
      },
    } as SessionEvent<'actor/expression'>

    expect(roleplayEventData(event)).toEqual({
      kind: 'speech',
      actorId: 'keeper',
      content: 'The archive stays closed.',
      origin: 'player',
      delivery: 'whispered',
      audience: ['visitor'],
      time: 100,
    })
    expect(roleplayEventDefinition.match(event)).toEqual({ id: '7', role: 'start' })
  })

  it('projects private memory choices but suppresses duplicate embodied interventions', () => {
    const memory = {
      type: 'actor/memory',
      seq: 9,
      time: 120,
      data: {
        version: 1,
        memory: {
          id: 'memory-1',
          actorId: 'keeper',
          content: 'Fire once reached the eastern stacks.',
          importance: 0.9,
          tags: ['fire'],
          sourceRefs: [],
        },
      },
    } as SessionEvent<'actor/memory'>
    const embodied = {
      type: 'actor/player-intervention',
      seq: 10,
      time: 130,
      data: {
        version: 1,
        intervention: {
          id: 'intervention-2',
          kind: 'embody-action',
          targetActorId: 'keeper',
          content: 'opens the door',
        },
      },
    } as SessionEvent<'actor/player-intervention'>

    expect(roleplayEventData(memory)).toMatchObject({
      kind: 'memory', actorId: 'keeper', importance: 0.9, tags: ['fire'],
    })
    expect(roleplayEventData(embodied)).toBeNull()
    expect(roleplayEventDefinition.match(embodied)).toBeNull()
  })

  it('keeps story direction independent from any fictional Actor', () => {
    const event = {
      type: 'actor/player-intervention',
      seq: 11,
      time: 140,
      data: {
        version: 1,
        intervention: {
          id: 'intervention-3',
          kind: 'story-direction',
          content: 'Move toward reconciliation.',
        },
      },
    } as SessionEvent<'actor/player-intervention'>

    expect(roleplayEventData(event)).toEqual({
      kind: 'story-direction',
      content: 'Move toward reconciliation.',
      time: 140,
    })
  })
})
