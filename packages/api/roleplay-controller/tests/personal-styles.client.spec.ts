/** Personal preferences retain copied content without sharing running narrative data. */
import { expect, it } from 'vitest'
import { PersonalStyles } from '../src/client/personal-styles.ts'
import { styleProfileSchema } from '@deepseek-ai/dsh-roleplay-core/style'

it('copies validated styles, separates same-name roles, and preserves other browser edits', () => {
  let content: string | null = null
  const storage = { getItem: () => content, setItem: (_key: string, value: string) => { content = value } }
  const first = new PersonalStyles(() => storage)
  const second = new PersonalStyles(() => storage)
  const actor = styleProfileSchema.parse({ kind: 'actor', guidance: { speechStyle: 'Quiet and direct' } })
  first.save('Evening', actor)
  second.save('Evening', styleProfileSchema.parse({ kind: 'director', guidance: { narrativeStyle: 'Restrained' } }))
  actor.guidance.additionalInstructions = 'Later edits stay local'
  first.refresh()
  expect(first.snapshot.getSnapshot().entries).toHaveLength(2)
  expect(JSON.stringify(first.snapshot.getSnapshot())).not.toContain('Later edits')
  first.remove('Evening', 'actor')
  expect(first.snapshot.getSnapshot().entries.map(preset => preset.profile.kind)).toEqual(['director'])
})

it('keeps malformed personal data and the previous mirror intact when storage rejects a write', () => {
  let content: string | null = '{broken'
  const storage = { getItem: () => content, setItem: () => { throw new Error('Storage full') } }
  const model = new PersonalStyles(() => storage)
  expect(model.snapshot.getSnapshot().error).not.toBeNull()
  const profile = styleProfileSchema.parse({ kind: 'actor', guidance: {} })
  expect(() => { model.save('New', profile) }).toThrow()
  expect(content).toBe('{broken')
  content = null; model.refresh()
  expect(() => { model.save('New', profile) }).toThrow('Storage full')
  expect(model.snapshot.getSnapshot().entries).toEqual([])
})
