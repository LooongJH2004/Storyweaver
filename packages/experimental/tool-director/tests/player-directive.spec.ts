import { describe, expect, it } from 'vitest'
import { parsePlayerDirective, parseStructuredPlayerDirective } from '../src/player-directive.ts'

describe('player directive envelopes', () => {
  it('retains an explicit Actor ID and body without parsing them as a historical envelope', () => {
    const directive = parseStructuredPlayerDirective({ kind: 'storyweaver', payload: { mode: 'embody', actorId: 'cast]1' } },
      'I make this character say or do: nothing.', ['cast]1'])
    expect(directive?.embodiedActor).toBe('cast]1')
    expect(directive?.persistentText).toBe('【玩家代演：cast]1】I make this character say or do: nothing.')
    expect(directive?.turnInstruction).toContain('Preserve silence and never add subsequent speech or voluntary actions.')
  })
  it('keeps only the typed direction value in durable history', () => {
    expect(parsePlayerDirective('【指定走向】我希望故事接下来朝这个方向发展：让两人暂时合作'))
      .toMatchObject({
        kind: 'direction',
        persistentText: '【玩家指定走向】让两人暂时合作',
      })
  })

  it('turns observe boilerplate into one compact durable intent', () => {
    const parsed = parsePlayerDirective('【旁观推进】让世界继续运转。角色自主行动。')
    expect(parsed?.persistentText).toBe('【玩家意图】旁观推进')
    expect(parsed?.turnInstruction).toContain('applies only to the current turn')
  })

  it('leaves unknown bracketed story prose unchanged', () => {
    expect(parsePlayerDirective('【场景】雨还在下。')).toBeUndefined()
  })
})
