import { expect, it } from 'vitest'
import { planGrowthResume } from './growth-resume.ts'

const phase = (id: string, completed: boolean, startRevision: number, endRevision: number) => ({
  id, instruction: id, completed, startRevision, endRevision,
  perceptions: [{ actorId: 'child', requestRevision: endRevision, evidence: [{ id: 'seen', revision: endRevision }] }],
})
const report = () => ({ scenario: 'A7', floorPolicy: 'balanced', model: 'mock', reasoningEffort: 'low',
  bookHash: 'book', executionSettings: {}, collection: 'complete', collectionErrors: [], timedOut: true, failure: 'deadline',
  document: { characters: [{ actorId: 'child' }] }, growthPlan: ['repeat', 'counter', 'transfer'].map(id => ({ id, instruction: id })),
  growthPhases: [phase('repeat', true, 10, 20), phase('counter', false, 20, 25)],
})

it('retains completed learning and rewinds only the interrupted phase', () => {
  const result = planGrowthResume(report())
  expect(result.revision).toBe(20)
  expect(result.phase.id).toBe('counter')
  expect(result.completed.map(item => item.id)).toEqual(['repeat'])
})
it('starts an unentered phase at the last completed boundary', () => {
  const value = report(); value.growthPhases = [phase('repeat', true, 10, 20), phase('counter', true, 20, 30)]
  expect(planGrowthResume(value).revision).toBe(30)
  expect(planGrowthResume(value).phase.id).toBe('transfer')
})
it('does not treat a completed call without fresh actor evidence as completed learning', () => {
  const value = report(); value.growthPhases[0]!.perceptions = []
  expect(planGrowthResume(value).revision).toBe(10)
  expect(planGrowthResume(value).completed).toEqual([])
  value.growthPhases[0] = phase('repeat', true, 10, 20)
  value.growthPhases[0].perceptions[0]!.evidence[0]!.revision = 10
  expect(planGrowthResume(value).completed).toEqual([])
})
it('rejects missing boundaries, collector failures, non-timeout failures and completed plans', () => {
  expect(() => planGrowthResume({ ...report(), growthPhases: [] })).toThrow('No recorded learning boundary')
  expect(() => planGrowthResume({ ...report(), collection: 'incomplete' })).toThrow()
  expect(() => planGrowthResume({ ...report(), timedOut: false })).toThrow('non-timeout failure')
  expect(() => planGrowthResume({ ...report(), growthPhases: [phase('repeat', true, 10, 20),
    phase('repeat', true, 10, 20)] })).toThrow('Ambiguous phase history')
  expect(() => planGrowthResume({ ...report(), growthPhases: [phase('repeat', true, 10, 20),
    phase('counter', true, 20, 30), phase('transfer', true, 30, 40)] })).toThrow('All recorded')
})

it('does not replace fresh world perception with another actor behavior', () => {
  const value = report()
  const first = phase('repeat', true, 10, 20)
  const behaviorOnly = { ...first, perceptions: [{ actorId: 'child', requestRevision: 20,
    evidence: [{ revision: 19, behavior: { kind: 'action' } }] }] }
  expect(planGrowthResume({ ...value, growthPhases: [behaviorOnly] }).completed).toEqual([])
  expect(planGrowthResume({ ...value, growthPhases: [first] }).completed).toHaveLength(1)
})
