import { describe, expect, it } from 'vitest'
import type { DirectorOutlinePlayerInput } from '../src/types.ts'
import {
  applyDirectorOutlinePatch,
  emptyDirectorOutline,
  parseDirectorOutlinePatchInput,
  replaceDirectorOutlineByPlayer,
  resolveDirectorOutlineSuggestion,
} from '../src/outline.ts'

function playerInput(overrides: Partial<DirectorOutlinePlayerInput> = {}): DirectorOutlinePlayerInput {
  return {
    updateMode: 'auto_unlocked',
    premise: '让失去的记忆重新选择主人。',
    premiseLocked: false,
    themes: [],
    hardConstraints: [],
    arcs: [],
    beats: [],
    foreshadows: [],
    mysteries: [],
    clocks: [],
    ...overrides,
  }
}

describe('Director Outline', () => {
  it('persists complete player revisions with ownership and history', () => {
    const changed = replaceDirectorOutlineByPlayer(emptyDirectorOutline(), 0, playerInput({
      themes: [{ id: 'theme-autonomy', text: '自主权', locked: true }],
    }), '玩家建立初始大纲')

    expect(changed).toMatchObject({ revision: 1, updatedBy: 'player', premise: '让失去的记忆重新选择主人。' })
    expect(changed.themes).toEqual([{
      id: 'theme-autonomy', text: '自主权', locked: true, source: 'player',
    }])
    expect(changed.history.at(-1)).toMatchObject({
      revision: 1, author: 'player', reason: '玩家建立初始大纲',
    })
  })

  it('rejects stale revisions and Director changes to player-locked content', () => {
    const current = replaceDirectorOutlineByPlayer(emptyDirectorOutline(), 0, playerInput({
      premiseLocked: true,
      themes: [{ id: 'locked-theme', text: '记忆属于本人', locked: true }],
    }), '锁定边界')

    expect(() => applyDirectorOutlinePatch(current, {
      expectedRevision: 0,
      reason: '过期更新',
      premise: '另一个故事',
    })).toThrow(expect.objectContaining({ code: 'OUTLINE_STALE' }))
    expect(() => applyDirectorOutlinePatch(current, {
      expectedRevision: 1,
      reason: '越过玩家锁定',
      themes: [{ id: 'locked-theme', text: '由导演定义记忆' }],
    })).toThrow(expect.objectContaining({ code: 'OUTLINE_LOCKED' }))
  })

  it('queues every Director update for player review when configured', () => {
    const current = replaceDirectorOutlineByPlayer(emptyDirectorOutline(), 0, playerInput({
      updateMode: 'review_all',
    }), '开启审核')
    const queued = applyDirectorOutlinePatch(current, {
      expectedRevision: 1,
      reason: '加入午夜压力',
      clocks: [{
        id: 'midnight', title: '午夜', progress: 1, limit: 4,
        trigger: '每推进一幕', consequence: '阴影门开启', status: 'active',
      }],
    })

    expect(queued).toMatchObject({ revision: 2, clocks: [], updatedBy: 'director' })
    expect(queued.pendingSuggestions).toHaveLength(1)
    const suggestionId = queued.pendingSuggestions[0]?.id
    if (suggestionId === undefined) throw new Error('expected queued suggestion')
    const accepted = resolveDirectorOutlineSuggestion(queued, 2, suggestionId, true)
    expect(accepted).toMatchObject({ revision: 3, updatedBy: 'player', pendingSuggestions: [] })
    expect(accepted.clocks[0]).toMatchObject({ id: 'midnight', source: 'director', locked: false })
  })

  it('requires event evidence before marking beats and foreshadows resolved', () => {
    expect(() => applyDirectorOutlinePatch(emptyDirectorOutline(), {
      expectedRevision: 0,
      reason: '无来源地宣称解决',
      beats: [{
        id: 'beat-answer', title: '答案', intent: '揭示线索', status: 'resolved', priority: 3,
        prerequisiteLedgerFacts: [], prerequisiteBeatIds: [], triggerConditions: [],
        externalPressure: [], revealCandidates: [], exitConditions: [], fallbackOptions: [],
        resolvedByEventRefs: [],
      }],
    })).toThrow()
  })

  it('rejects behavior-shaped unknown fields at the Director patch boundary', () => {
    expect(() => parseDirectorOutlinePatchInput({
      expectedRevision: 0,
      reason: '越权字段',
      dialogue: '影心说：不要碰它。',
    })).toThrow(expect.objectContaining({ code: 'OUTLINE_INVALID' }))
  })
})
