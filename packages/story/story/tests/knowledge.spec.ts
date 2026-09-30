import { describe, expect, it } from 'vitest'
import { applyKnowledgeChanges, emptyKnowledge, knowledgeChangeSchema, queryKnowledge } from '../src/knowledge.ts'
import { emptyStoryCharacters, initializeStoryCharacters, frameStoryCharacters, visibleCharacters, resolvePersonReference, projectIdentityReferences, historicalCharacterLabels, renderPerspectiveText } from '../src/characters.ts'
import { parseStorybookDocument } from '../src/storybook.ts'
import { readContextSource } from '../src/context-sources.ts'
import { emptyStoryWorld, stageDirectorScene } from '../src/roleplay.ts'

const book = () => parseStorybookDocument({ schemaVersion: 6, id: 'knowledge', title: 'Knowledge', directorPrompt: '',
  characters: ['a', 'b', 'c'].map((id, index) => ({ actorId: id, displayName: `SECRET-${id}`,
    appearance: `stranger-${index}`, publicPersona: 'Private autonomous person', rolePrompt: '',
    capabilities: ['speak', 'act', 'reflect'], actingGuidance: {},
  })), directorGuidance: {}, commonKnowledge: ['Rain wets clothing.'] })

const belief = (overrides = {}) => knowledgeChangeSchema.parse({ id: 'belief-1', expectedRevision: 0,
  text: 'The stranger claims the ledger was burned.', kind: 'belief', attitude: 'doubted', acquisition: 'heard',
  entityRefs: ['person-a'], sourceRefs: ['heard-1'], status: 'active', reason: 'I heard this claim.', ...overrides })
const authority = { origin: 'actor' as const, entityRefs: ['person-a'], sourceRefs: ['heard-1'] }

describe('personal cognition', () => {
  it('preserves a doubtful claim without establishing a fact, and validates the whole batch', () => {
    const empty = emptyKnowledge()
    const changed = applyKnowledgeChanges(empty, [belief()], authority)
    expect(changed.entries[0]?.attitude).toBe('doubted')
    expect(empty.entries).toEqual([])
    expect(() => applyKnowledgeChanges(empty, [belief(), belief({ id: 'other', sourceRefs: ['private-c'] })], authority)).toThrow('unavailable')
    expect(empty.history).toEqual([])
  })
  it('rejects invisible persons, other observers’ evidence, author impersonation and stale revisions', () => {
    expect(() => applyKnowledgeChanges(emptyKnowledge(), [belief({ entityRefs: ['hidden'] })], authority)).toThrow('not encountered')
    expect(() => applyKnowledgeChanges(emptyKnowledge(), [belief({ sourceRefs: [] })], authority)).toThrow('require perceived')
    expect(() => applyKnowledgeChanges(emptyKnowledge(), [belief({ acquisition: 'authored' })], authority)).toThrow('author')
    const state = applyKnowledgeChanges(emptyKnowledge(), [belief()], authority)
    expect(() => applyKnowledgeChanges(state, [belief()], authority)).toThrow('revision')
  })
  it('retains contradictory beliefs, forgetting, and compensating restoration with all evidence', () => {
    let state = applyKnowledgeChanges(emptyKnowledge(), [belief(), belief({ id: 'contradiction', text: 'The ledger survived.', attitude: 'believed' })], authority)
    expect(state.entries).toHaveLength(2)
    state = applyKnowledgeChanges(state, [belief({ expectedRevision: 1, status: 'forgotten', sourceRefs: ['knowledge:belief-1:r1'] })], authority)
    expect(queryKnowledge(state, '', [], 0, 20).entries).toHaveLength(1)
    state = applyKnowledgeChanges(state, [belief({ expectedRevision: 2, status: 'active', reason: 'Player compensates the forgotten revision.' })], { ...authority, origin: 'player' })
    expect(state.history.filter(item => item.id === 'belief-1')).toHaveLength(3)
  })
  it('ranks and paginates retained judgments without forgetting omitted entries', () => {
    const changes = Array.from({ length: 200 }, (_, index) => belief({ id: `knowledge-${index}`, text: `event ${index}`, entityRefs: index === 155 ? ['person-a'] : [] }))
    const state = applyKnowledgeChanges(emptyKnowledge(), changes, authority)
    const page = queryKnowledge(state, '155', ['person-a'], 0, 5)
    expect(page.entries[0]?.id).toBe('knowledge-155')
    expect(page.next).toBe(5)
    expect(state.entries).toHaveLength(200)
  })
})

describe('independent people and observer identities', () => {
  it('does not reveal canonical names or use another observer’s reference', () => {
    let cast = initializeStoryCharacters(emptyStoryCharacters(), book())
    cast = frameStoryCharacters(cast, 'tavern', ['a', 'b'])
    const audience = visibleCharacters(cast, 'a', 'tavern', ['a', 'b'])
    expect(audience).toHaveLength(1)
    expect(JSON.stringify(audience)).not.toContain('SECRET')
    expect(audience[0]?.label).toBe('stranger-1')
    expect(resolvePersonReference(cast, 'a', audience[0]!.ref)).toBe('b')
    expect(() => resolvePersonReference(cast, 'c', audience[0]!.ref)).toThrow('unavailable')
    expect(() => resolvePersonReference(cast, 'a', 'b')).toThrow('unavailable')
  })
  it('keeps anonymous history after learning a claimed name and returns to the same person', () => {
    let cast = frameStoryCharacters(initializeStoryCharacters(emptyStoryCharacters(), book()), 'tavern', ['a', 'b'])
    const first = visibleCharacters(cast, 'a', 'tavern', ['a', 'b'])[0]!
    const historical = historicalCharacterLabels(cast, 'b')
    const knowledge = applyKnowledgeChanges(cast.knowledge.a!, [belief({ kind: 'identity', entityRefs: [first.ref], label: 'Robin', attitude: 'believed' })], { ...authority, entityRefs: [first.ref] })
    cast = { ...cast, knowledge: { ...cast.knowledge, a: knowledge } }
    expect(visibleCharacters(cast, 'a', 'tavern', ['a', 'b'])[0]?.label).toBe('Robin')
    expect(historical.a).toBe('stranger-1')
    cast = frameStoryCharacters(cast, 'street', ['a'])
    cast = frameStoryCharacters(cast, 'tavern-again', ['a', 'b'])
    expect(visibleCharacters(cast, 'a', 'tavern-again', ['a', 'b'])[0]?.ref).toBe(first.ref)
    expect(renderPerspectiveText('[[person:b]] opens a door.', cast, 'a')).toBe('Robin opens a door.')
  })
  it('does not identify a disguise from a canonical identity or an old acquaintance', () => {
    const authored = book()
    authored.characters[0]!.initialKnowledge = [{ kind: 'identity', targetActorId: 'b', label: 'Robin', text: 'An old friend.', attitude: 'believed' }]
    let cast = frameStoryCharacters(initializeStoryCharacters(emptyStoryCharacters(), authored), 'tavern', ['a', 'b'])
    const ordinary = visibleCharacters(cast, 'a', 'tavern', ['a', 'b'])[0]!
    cast = frameStoryCharacters(cast, 'night', ['a', 'b'], [{ actorId: 'b', key: 'masked', label: 'Masked visitor' }])
    const masked = visibleCharacters(cast, 'a', 'night', ['a', 'b'])[0]!
    expect(masked.ref).not.toBe(ordinary.ref)
    expect(masked.label).toBe('Masked visitor')
    cast = frameStoryCharacters(cast, 'night', ['a', 'b'])
    expect(visibleCharacters(cast, 'a', 'night', ['a', 'b'])[0]?.ref).toBe(ordinary.ref)
  })
  it('copies templates independently, and refuses omniscient framing as an Actor perception', () => {
    const first = initializeStoryCharacters(emptyStoryCharacters(), book())
    const second = initializeStoryCharacters(emptyStoryCharacters(), book())
    first.entries[0]!.definition.displayName = 'Changed'
    expect(second.entries[0]?.definition.displayName).toBe('SECRET-a')
    const world = { ...emptyStoryWorld(), characters: first }
    const input = { expectedWorldRevision: 0, sceneId: 'room', location: 'Inn', presentActorIds: ['a', 'b'], summary: 'SECRET-b is a spy.' }
    expect(() => stageDirectorScene(world, input)).toThrow('perspective-specific')
    const staged = stageDirectorScene(world, { ...input, perceptions: [{ actorId: 'a', content: '[[person:b]] waits.' }, { actorId: 'b', content: 'You wait.' }] })
    expect(staged.perceptions.find(item => item.actorId === 'a')?.content).toBe('stranger-1 waits.')
    expect(staged.perceptions.some(item => item.actorId === 'c')).toBe(false)
  })
})


it('keeps hearsay unbound and freezes historical source identity labels', async () => {
  const state = { ...emptyStoryWorld(), characters: initializeStoryCharacters(emptyStoryCharacters(), book()) }
  const staged = stageDirectorScene(state, { expectedWorldRevision: 0, sceneId: 'room', location: 'Inn', presentActorIds: ['a'], summary: 'A hears a rumor.',
    perceptions: [{ actorId: 'a', content: 'Someone mentions the owner of the inn.', clues: [{ key: 'inn-owner', label: 'The innkeeper mentioned by the courier' }] }] })
  const clue = staged.characters.encounters.find(item => item.observerId === 'a')!
  expect(clue.actorId).toBeUndefined()
  expect(() => resolvePersonReference(staged.characters, 'a', clue.ref)).toThrow('unavailable')
  expect(staged.characters.entries).toHaveLength(3)
  expect(staged.characters.knowledge.a!.entries).toEqual([])
  const source = { id: 'brief-source', kind: 'perception', sceneId: 'room', scopes: ['actor:a'], order: 0,
    perspectives: { a: { refs: { a: 'self', b: 'person-old' }, labels: { a: 'you', b: 'A stranger' } } },
    locator: { kind: 'session' as const, sessionId: 'director', seq: 1, path: ['perception'] } }
  const read = async () => ({ perception: { actor_id: 'a', content: '[[person:b]] waits.' } })
  expect(await readContextSource(staged, source, read, undefined, 'a')).toBe('{"actor_id":"self","content":"A stranger waits."}')
  expect(await readContextSource(staged, source, read)).toContain('[[person:b]]')
})

it('bounds knowledge pages and keeps oversized judgments separately addressable', () => {
  const state = applyKnowledgeChanges(emptyKnowledge(), [belief({ text: 'long evidence '.repeat(1000) }), belief({ id: 'short', text: 'A short belief.' })], authority)
  const page = queryKnowledge(state, '', [], 0, 10, 500)
  expect(page.deferred).toEqual(['belief-1'])
  expect(page.entries.map(item => item.id)).toEqual(['short'])
  expect(JSON.stringify(page.entries).length).toBeLessThan(500)
  expect(state.entries[0]?.text.length).toBeGreaterThan(10000)
})

it('keeps a scene prompt bounded while thousands of unrelated people remain off scene', () => {
  const state = initializeStoryCharacters(emptyStoryCharacters(), book())
  const exemplar = state.entries[0]!
  for (let index = 0; index < 5000; index++) state.entries.push({ ...exemplar, definition: { ...exemplar.definition, actorId: `offscene-${index}`, displayName: `HIDDEN-${index}` } })
  const framed = frameStoryCharacters(state, 'room', ['a', 'b'])
  const visible = visibleCharacters(framed, 'a', 'room', ['a', 'b'])
  expect(visible).toHaveLength(1)
  expect(JSON.stringify(visible).length).toBeLessThan(160)
  expect(JSON.stringify(projectIdentityReferences({ participants: ['a', 'b'] }, framed, 'a'))).not.toContain('HIDDEN-')
  expect(projectIdentityReferences({ actorId: 'a', text: 'a', content: 'b', value: 'b' }, framed, 'a')).toEqual({ actorId: 'self', text: 'a', content: 'b', value: 'b' })
  expect(framed.entries).toHaveLength(5003)
})
