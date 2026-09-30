/** Character lifecycle rules run without a Session envelope or Cordis container. */
import { expect, it } from 'vitest'
import { applyCharacterChange, emptyActorFoldState } from '../src/actor-state.ts'
import { ActorId, ActorGoalId, ActorMemoryId, ActorMemoryReleaseId } from '../src/actor-model.ts'

it('preserves explicit memory release and terminal goal transitions independently from execution', () => {
  const state = emptyActorFoldState()
  const actorId = ActorId('person')
  applyCharacterChange(state, { type: 'character.defined', data: { version: 1, actor: {
    id: actorId, displayName: 'Someone', persona: 'Wants to leave.', capabilities: ['memory', 'goals'],
  } } })
  const memory = { id: ActorMemoryId('memory'), actorId, content: 'A bell rang.', importance: 4, tags: [], sourceRefs: ['heard-bell'] }
  applyCharacterChange(state, { type: 'memory.recorded', data: { version: 1, memory } })
  applyCharacterChange(state, { type: 'memory.released', data: { version: 1, release: {
    id: ActorMemoryReleaseId('release'), actorId, about: 'the bell', mode: 'suppress', matchedMemoryIds: [memory.id], reason: 'Too painful.',
  } } })
  expect(state.memories.get(memory.id)).toMatchObject({ status: 'forgotten', record: memory })
  expect(() =>{  applyCharacterChange(state, { type: 'memory.forgotten', data: { version: 1, actorId, memoryId: memory.id } }) }).toThrow('forgotten twice')
  const goal = { id: ActorGoalId('leave'), actorId, description: 'Leave the inn.', priority: 4, revision: 1, status: 'active' as const }
  applyCharacterChange(state, { type: 'goal.revised', data: { version: 1, goal } })
  applyCharacterChange(state, { type: 'goal.revised', data: { version: 1, goal: { ...goal, revision: 2, status: 'completed' } } })
  expect(() =>{  applyCharacterChange(state, { type: 'goal.revised', data: { version: 1, goal: { ...goal, revision: 3 } } }) }).toThrow('invalid completed')
  expect(state.goals.get(goal.id)?.status).toBe('completed')
})
