import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { DirectorRunAttemptId } from '../src/index.ts'
import {
  beginDirectorDispatch,
  cancelDirectorRun,
  cancelDirectorRunActor,
  commitDirectorBrief,
  dispatchableDirectorActorIds,
  emptyPlotLedger,
  pauseDirectorRun,
  skipDirectorRunActor,
  settleDirectorDispatch,
} from '../src/director.ts'

const directorSessionId = SessionId('director-run-test')
const sceneSessionId = SessionId('scene-run-test')
const initialBrief = {
  expectedLedgerRevision: 0,
  sceneSessionId,
  situation: '两名角色隔着一扇门听见铃声。',
  establishedFacts: ['铃声真实存在。'],
  openThreads: ['门后是谁？'],
  actorBriefs: [
    { actorId: 'a', perceptions: ['听见铃声。'], uncertainties: ['铃声来源。'] },
    { actorId: 'b', perceptions: ['看见门缝亮光。'], uncertainties: ['门是否上锁。'] },
  ],
}

describe('durable Director Run checkpoint', () => {
  it('idempotently commits, owns each attempt generation, and resumes only unfinished work', () => {
    const partialBrief = {
      ...initialBrief,
      actorBriefs: [initialBrief.actorBriefs[0]!],
    }
    const committed = commitDirectorBrief(emptyPlotLedger(), directorSessionId, partialBrief)
    expect(committed.directorRun).toMatchObject({
      status: 'brief_committed',
      actors: [
        { actorId: 'a', status: 'pending', attempts: 0 },
      ],
    })
    expect(commitDirectorBrief(committed, directorSessionId, partialBrief)).toBe(committed)
    const corrected = commitDirectorBrief(committed, directorSessionId, {
      ...initialBrief,
      expectedLedgerRevision: 1,
      situation: '导演在调度前修正了推进上下文。',
    })
    expect(corrected).toMatchObject({
      revision: 2,
      situation: '导演在调度前修正了推进上下文。',
      latestBrief: { sourceLedgerRevision: 1, ledgerRevision: 2 },
      directorRun: {
        briefLedgerRevision: 2,
        status: 'brief_committed',
        actors: [
          { actorId: 'a', status: 'pending', attempts: 0 },
          { actorId: 'b', status: 'pending', attempts: 0 },
        ],
      },
    })

    const dispatching = beginDirectorDispatch(corrected, 0, [
      { actorId: 'a', attemptId: DirectorRunAttemptId('attempt-a-1'), actorSessionId: SessionId('actor-a'), afterEventSeq: 10 },
      { actorId: 'b', attemptId: DirectorRunAttemptId('attempt-b-1'), actorSessionId: SessionId('actor-b'), afterEventSeq: 18 },
    ])
    expect(dispatching.directorRun?.actors.map(actor => actor.attempts)).toEqual([1, 1])
    expect(dispatching.directorRun).toMatchObject({
      revision: 1,
      actors: [
        { actorId: 'a', generation: 1, attempt: { attemptId: 'attempt-a-1', generation: 1 } },
        { actorId: 'b', generation: 1, attempt: { attemptId: 'attempt-b-1', generation: 1 } },
      ],
    })
    expect(() => commitDirectorBrief(dispatching, directorSessionId, {
      ...initialBrief,
      expectedLedgerRevision: 2,
      situation: '调度开始后不能覆盖。',
    })).toThrow(/must be completed or resumed/)
    const interrupted = settleDirectorDispatch(dispatching, [
      {
        actorId: 'a', attemptId: DirectorRunAttemptId('attempt-a-1'), generation: 1,
        status: 'completed', eventRefs: ['actor-a:12'],
      },
      {
        actorId: 'b', attemptId: DirectorRunAttemptId('attempt-b-1'), generation: 1,
        status: 'failed',
        eventRefs: [],
        failure: { code: 'QUOTA', message: 'Insufficient Balance' },
      },
    ])
    expect(interrupted.directorRun?.status).toBe('awaiting_retry')
    expect(dispatchableDirectorActorIds(interrupted)).toEqual(['b'])
    expect(dispatchableDirectorActorIds(interrupted, ['a', 'b'])).toEqual(['b'])

    const retrying = beginDirectorDispatch(interrupted, 2, [{
      actorId: 'b', attemptId: DirectorRunAttemptId('attempt-b-2'), actorSessionId: SessionId('actor-b'), afterEventSeq: 23,
    }])
    expect(retrying.directorRun?.actors[0]).toMatchObject({
      actorId: 'a', status: 'completed', attempts: 1, eventRefs: ['actor-a:12'],
    })
    expect(retrying.directorRun?.actors[1]).toMatchObject({
      actorId: 'b', status: 'running', attempts: 2, generation: 2,
      attempt: { attemptId: 'attempt-b-2', generation: 2 },
    })
    const completed = settleDirectorDispatch(retrying, [{
      actorId: 'b', attemptId: DirectorRunAttemptId('attempt-b-2'), generation: 2,
      status: 'completed', eventRefs: ['actor-b:20'],
    }])
    expect(completed.directorRun).toMatchObject({ status: 'completed' })
    expect(completed.directorRun?.actors.map(actor => actor.eventRefs)).toEqual([
      ['actor-a:12'], ['actor-b:20'],
    ])

    expect(settleDirectorDispatch(completed, [{
      actorId: 'b', attemptId: DirectorRunAttemptId('attempt-b-2'), generation: 2,
      status: 'completed', eventRefs: ['actor-b:20'],
    }])).toBe(completed)
    expect(() => settleDirectorDispatch(completed, [{
      actorId: 'b', attemptId: DirectorRunAttemptId('attempt-b-1'), generation: 1,
      status: 'completed', eventRefs: ['actor-b:99'],
    }])).toThrow(/does not own/)
  })

  it('pauses running attempts, keeps the checkpoint, and resumes only unfinished Actors', () => {
    const committed = commitDirectorBrief(emptyPlotLedger(), directorSessionId, initialBrief)
    const dispatching = beginDirectorDispatch(committed, 0, [
      { actorId: 'a', attemptId: DirectorRunAttemptId('attempt-a-1'), actorSessionId: SessionId('actor-a'), afterEventSeq: 4 },
      { actorId: 'b', attemptId: DirectorRunAttemptId('attempt-b-1'), actorSessionId: SessionId('actor-b'), afterEventSeq: 9 },
    ])
    const partial = settleDirectorDispatch(dispatching, [{
      actorId: 'a', attemptId: DirectorRunAttemptId('attempt-a-1'), generation: 1,
      status: 'completed', eventRefs: ['actor-a:7'],
    }])
    const paused = pauseDirectorRun(partial, 2)

    expect(paused.directorRun).toMatchObject({
      revision: 3,
      status: 'paused',
      actors: [
        { actorId: 'a', status: 'completed', eventRefs: ['actor-a:7'] },
        { actorId: 'b', status: 'cancelled', failure: { code: 'RUN_PAUSED' } },
      ],
    })
    expect(dispatchableDirectorActorIds(paused)).toEqual(['b'])
    expect(pauseDirectorRun(paused, 3)).toBe(paused)
    expect(() => beginDirectorDispatch(paused, 2, [{
      actorId: 'b', attemptId: DirectorRunAttemptId('attempt-b-2'), actorSessionId: SessionId('actor-b'), afterEventSeq: 12,
    }])).toThrow(/revision 2/)
  })

  it('skips one Actor, cancels another attempt, and never redispatches accepted Actors', () => {
    const committed = commitDirectorBrief(emptyPlotLedger(), directorSessionId, initialBrief)
    const skipped = skipDirectorRunActor(committed, 0, 'a')
    expect(skipped.directorRun).toMatchObject({
      revision: 1,
      status: 'brief_committed',
      actors: [{ actorId: 'a', status: 'skipped' }, { actorId: 'b', status: 'pending' }],
    })
    expect(skipDirectorRunActor(skipped, 1, 'a')).toBe(skipped)

    const dispatching = beginDirectorDispatch(skipped, 1, [{
      actorId: 'b', attemptId: DirectorRunAttemptId('attempt-b-1'), actorSessionId: SessionId('actor-b'), afterEventSeq: 2,
    }])
    const cancelled = cancelDirectorRunActor(dispatching, 2, 'b')
    expect(cancelled.directorRun).toMatchObject({
      revision: 3,
      status: 'awaiting_retry',
      actors: [{ actorId: 'a', status: 'skipped' }, { actorId: 'b', status: 'cancelled' }],
    })
    expect(dispatchableDirectorActorIds(cancelled, ['a', 'b'])).toEqual(['b'])
    expect(() => settleDirectorDispatch(cancelled, [{
      actorId: 'b', attemptId: DirectorRunAttemptId('attempt-b-1'), generation: 1,
      status: 'completed', eventRefs: ['actor-b:4'],
    }])).toThrow(/status 'cancelled'/)
  })

  it('cancels a whole Run terminally without erasing completed Actor evidence', () => {
    const committed = commitDirectorBrief(emptyPlotLedger(), directorSessionId, initialBrief)
    const dispatching = beginDirectorDispatch(committed, 0, [
      { actorId: 'a', attemptId: DirectorRunAttemptId('attempt-a-1'), actorSessionId: SessionId('actor-a'), afterEventSeq: 1 },
      { actorId: 'b', attemptId: DirectorRunAttemptId('attempt-b-1'), actorSessionId: SessionId('actor-b'), afterEventSeq: 1 },
    ])
    const partial = settleDirectorDispatch(dispatching, [{
      actorId: 'a', attemptId: DirectorRunAttemptId('attempt-a-1'), generation: 1,
      status: 'completed', eventRefs: ['actor-a:3'],
    }])
    const cancelled = cancelDirectorRun(partial, 2)

    expect(cancelled.directorRun).toMatchObject({
      revision: 3,
      status: 'cancelled',
      actors: [
        { actorId: 'a', status: 'completed', eventRefs: ['actor-a:3'] },
        { actorId: 'b', status: 'cancelled', failure: { code: 'RUN_CANCELLED' } },
      ],
    })
    expect(cancelDirectorRun(cancelled, 3)).toBe(cancelled)
    expect(() => dispatchableDirectorActorIds(cancelled)).toThrow(/cancelled/)
  })
})
