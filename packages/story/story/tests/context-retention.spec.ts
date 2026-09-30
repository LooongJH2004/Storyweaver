import { describe, expect, it } from 'vitest'
import {
  activeContextNotes, contextSourceCanArchive, editContextProposal, emptyContextRetention, emptyStoryWorld,
  indexContextSources, pinContextSource, proposeContextUpdate, readContextSource, retainedContextSources,
  reviewContextProposals, storyContextRetentionSchema,
} from '../src/index.ts'
import type { ContextSource, ContextUpdateUnit, StoryContextRetention } from '../src/index.ts'

const source = (id: string, scopes = ['director', 'actor:a']): ContextSource => ({
  id, sceneId: 'scene', scopes, kind: 'actor-speech', order: 0, locator: { kind: 'world', eventId: id },
})
const unit = (sourceIds = ['old']): ContextUpdateUnit => ({ sourceIds, disposition: 'represented', reason: '保留履约条件', changes: [{
  operation: 'add', kind: 'promise', text: '甲承诺：乙交出账簿后，天亮前交付钥匙；尚未履行。', sourceIds,
}] })
const indexed = () => indexContextSources(emptyContextRetention(), [source('old'), source('new'), source('latest')])
const approve = (state: StoryContextRetention, id = 'submission:0') => reviewContextProposals(state, [{ id, revision: 1, approve: true }])

describe('player-approved source retention', () => {
  it('retains every unreviewed original beyond the configured recent minimum', () => {
    const state = proposeContextUpdate(indexed(), 'director', 'submission', 'turn', [unit()])
    expect(activeContextNotes(state, 'director')).toEqual([])
    expect(retainedContextSources(state, 'director', 1, 1).sources.map(item => item.id)).toEqual(['old', 'new', 'latest'])
    expect(contextSourceCanArchive(state, 'old', 'director')).toBe(false)
  })
  it('requires approval, keeps recent originals, and scopes retirement to the actual reader', () => {
    const state = approve(proposeContextUpdate(indexed(), 'director', 'submission', 'turn', [unit()]))
    expect(retainedContextSources(state, 'director', 1, 1).sources.map(item => item.id)).toEqual(['new', 'latest'])
    expect(retainedContextSources(state, 'actor:a', 1, 1).sources.map(item => item.id)).toEqual(['old', 'new', 'latest'])
    expect(retainedContextSources(state, 'director', 64, 12).sources).toHaveLength(3)
    expect(activeContextNotes(state, 'director')[0]?.text).toContain('乙交出账簿后，天亮前')
  })
  it('does not retire rejected sources and rejects stale or repeated decisions', () => {
    const pending = proposeContextUpdate(indexed(), 'director', 'submission', 'turn', [unit()])
    const rejected = reviewContextProposals(pending, [{ id: 'submission:0', revision: 1, approve: false }])
    expect(contextSourceCanArchive(rejected, 'old', 'director')).toBe(false)
    expect(() => approve(rejected)).toThrow('revision conflict')
    const edited = editContextProposal(pending, 'submission:0', 1, { ...unit(), reason: '保留条件、期限及结果' })
    expect(() => approve(edited)).toThrow('revision conflict')
    expect(activeContextNotes(edited, 'director')).toEqual([])
  })
  it('pins approved originals and permits explicit archive-only approval', () => {
    let state = approve(proposeContextUpdate(indexed(), 'director', 'submission', 'turn', [{ sourceIds: ['old'],
      disposition: 'archive', reason: '重复问候不需要常驻', changes: [] }]))
    expect(contextSourceCanArchive(state, 'old', 'director')).toBe(true)
    state = pinContextSource(state, 'old', 'director', true)
    expect(contextSourceCanArchive(state, 'old', 'director')).toBe(false)
    expect(contextSourceCanArchive(pinContextSource(state, 'old', 'director', false), 'old', 'director')).toBe(true)
  })
  it('retains resolved consequences and transfers old source coverage to explicit replacements', () => {
    let state = approve(proposeContextUpdate(indexed(), 'director', 'submission', 'turn', [unit()]))
    const note = state.notes[0]!
    state = proposeContextUpdate(state, 'director', 'resolve', 'turn2', [{ ...unit(['new']), changes: [{
      operation: 'resolve', noteId: note.id, expectedRevision: 1, kind: 'promise', text: '账簿已交付，甲在天亮前交出了钥匙。', sourceIds: ['new'],
    }] }])
    state = approve(state, 'resolve:0')
    expect(activeContextNotes(state, 'director')[0]?.status).toBe('resolved')
    state = proposeContextUpdate(state, 'director', 'replace', 'turn3', [{ ...unit(['latest']), changes: [{
      operation: 'replace', noteId: note.id, expectedRevision: 2, kind: 'promise', text: '交换已完成，乙持有钥匙；甲保管账簿。', sourceIds: ['latest'],
    }] }])
    state = approve(state, 'replace:0')
    expect(contextSourceCanArchive(state, 'old', 'director')).toBe(true)
    expect(activeContextNotes(state, 'director')).toHaveLength(1)
    expect(activeContextNotes(state, 'director')[0]?.sourceIds).toEqual(['old', 'new', 'latest'])
  })
  it('rejects missing evidence, scope escalation and Director withdrawal of Actor promises', () => {
    expect(() => proposeContextUpdate(indexed(), 'actor:b', 'x', 'turn', [unit()])).toThrow('not visible')
    expect(() => proposeContextUpdate(indexed(), 'director', 'x', 'turn', [unit(['absent'])])).toThrow('not visible')
    expect(() => proposeContextUpdate(indexed(), 'actor:a', 'x', 'turn', [{ ...unit(), changes: [{ ...unit().changes[0]!, kind: 'fact' }] }])).toThrow('not canonical facts')
    const state = approve(proposeContextUpdate(indexed(), 'director', 'submission', 'turn', [unit()]))
    expect(() => proposeContextUpdate(state, 'director', 'x', 'turn', [{ ...unit(), changes: [{ ...unit().changes[0]!,
      operation: 'withdraw', noteId: state.notes[0]!.id, expectedRevision: 1,
    }] }])).toThrow('cannot withdraw')
  })
  it('rejects partial source coverage and applies selected units atomically', () => {
    expect(() => proposeContextUpdate(indexed(), 'director', 'x', 'turn', [{ ...unit(), sourceIds: ['old', 'new'] }])).toThrow('Every represented source')
    const state = proposeContextUpdate(indexed(), 'director', 'submission', 'turn', [unit(), unit(['new'])])
    const approved = approve(state)
    expect(contextSourceCanArchive(approved, 'new', 'director')).toBe(false)
    expect(() => reviewContextProposals(state, [
      { id: 'submission:0', revision: 1, approve: true }, { id: 'submission:1', revision: 8, approve: true },
    ])).toThrow('revision conflict')
    expect(state.notes).toEqual([])
  })
  it('persists indexes and approvals, restores checkpoints, and handles duplicate accepted submissions', () => {
    const checkpoint = indexed()
    const pending = proposeContextUpdate(checkpoint, 'director', 'submission', 'turn', [unit()])
    expect(proposeContextUpdate(pending, 'director', 'submission', 'turn', [unit()])).toBe(pending)
    const reloaded = storyContextRetentionSchema.parse(JSON.parse(JSON.stringify(approve(pending))))
    expect(contextSourceCanArchive(reloaded, 'old', 'director')).toBe(true)
    expect(contextSourceCanArchive(checkpoint, 'old', 'director')).toBe(false)
    expect(() => proposeContextUpdate(pending, 'director', 'submission', 'turn', [unit(['new'])])).toThrow('identity conflict')
  })
  it('keeps originals while another unit for the same source is pending or a required note is archived', () => {
    const twoNotes = { ...unit(), changes: [...unit().changes, { ...unit().changes[0]!, kind: 'condition' as const, text: '乙须先交账簿。' }] }
    let state = approve(proposeContextUpdate(indexed(), 'director', 'submission', 'turn', [twoNotes]))
    const note = state.notes[1]!
    state = proposeContextUpdate(state, 'director', 'archive-note', 'turn2', [{ sourceIds: ['new'], disposition: 'archive', reason: '玩家明确移除旧条件', changes: [{
      operation: 'archive', noteId: note.id, expectedRevision: note.revision, kind: note.kind, text: note.text, sourceIds: ['new'],
    }] }])
    state = approve(state, 'archive-note:0')
    expect(contextSourceCanArchive(state, 'old', 'director')).toBe(false)
    const overlap = proposeContextUpdate(indexed(), 'director', 'submission', 'turn', [unit(), unit()])
    expect(contextSourceCanArchive(approve(overlap), 'old', 'director')).toBe(false)
  })
  it('replays the immutable submission after a player edit and review without overwriting either', () => {
    const original = unit()
    const pending = proposeContextUpdate(indexed(), 'actor:a', 'actor-call', 'turn', [original])
    const editedUnit = { ...original, changes: original.changes.map(change => ({ ...change, text: '乙先交账簿，甲才交钥匙；期限为天亮前。' })) }
    const edited = editContextProposal(pending, 'actor-call:0', 1, editedUnit)
    for (const state of [edited, ...[true, false].map(approve => reviewContextProposals(edited, [
      { id: 'actor-call:0', revision: 2, approve },
    ]))]) {
      const restored = storyContextRetentionSchema.parse(JSON.parse(JSON.stringify(state)))
      expect(proposeContextUpdate(restored, 'actor:a', 'actor-call', 'turn', [original])).toBe(restored)
      expect(restored.proposals[0]?.unit).toEqual(editedUnit)
      expect(restored.proposals[0]?.submittedUnit).toEqual(original)
      expect(() => proposeContextUpdate(restored, 'actor:a', 'actor-call', 'turn', [editedUnit])).toThrow('identity conflict')
    }
  })
  it('reads full narration and structured action fields from original log locations', async () => {
    const world = emptyStoryWorld()
    const original = { data: { arguments: JSON.stringify({ text: '完整旁白\n包含摘要没有的红色封蜡', action: { attempt: '开门', target: '东门', detail: '只能从里面打开' } }) } }
    const location = { ...source('narration'), locator: { kind: 'session' as const, sessionId: 'scene', seq: 2, path: ['data', 'arguments', 'text'] } }
    expect(await readContextSource(world, location, async () => original)).toBe('完整旁白\n包含摘要没有的红色封蜡')
    expect(await readContextSource(world, { ...location, locator: { ...location.locator, path: ['data', 'arguments', 'action'] } }, async () => original)).toContain('只能从里面打开')
    await expect(readContextSource(world, location, async () => undefined)).rejects.toThrow('unavailable')
  })
})
