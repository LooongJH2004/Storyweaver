/** An uncertain response must not duplicate accepted fiction after the feed advances. */
import { expect, it } from 'vitest'
import { CommandAttempts } from '../src/client/commands.ts'

it('retries with the original revision and command identity after an uncertain response', async () => {
  const attempts = new CommandAttempts()
  const sent: { id: string; revision: number }[] = []
  const execute = async (id: string, revision: number) => {
    sent.push({ id, revision })
    if (sent.length === 1) throw new Error('Response lost after commit')
    return 'accepted'
  }
  const input = { instanceId: 'A', kind: 'embody', text: 'Wait.' }
  await expect(attempts.atRevision(input, 4, execute)).rejects.toThrow('Response lost')
  expect(await attempts.atRevision(input, 6, execute)).toBe('accepted')
  expect(sent[1]).toEqual(sent[0])
  await attempts.atRevision(input, 6, execute)
  expect(sent[2]?.revision).toBe(6)
  expect(sent[2]?.id).not.toBe(sent[0]?.id)
})

it('keeps distinct instances and edited player actions as distinct command attempts', async () => {
  const attempts = new CommandAttempts()
  const ids: string[] = []
  for (const input of [{ instanceId: 'A', text: 'Wait.' }, { instanceId: 'B', text: 'Wait.' }, { instanceId: 'A', text: 'Leave.' }]) {
    await expect(attempts.run(input, async (id) => { ids.push(id); throw new Error('Offline') })).rejects.toThrow('Offline')
  }
  expect(new Set(ids).size).toBe(3)
})

it('uses the newly reviewed revision only after an authoritative rejection', async () => {
  const attempts = new CommandAttempts()
  const intent = { instanceId: 'A', text: 'Wait.' }
  const sent: { id: string; revision: number }[] = []
  await expect(attempts.atRevision(intent, 4, async (id, revision) => {
    sent.push({ id, revision })
    attempts.retryable(intent, revision, id)
    throw new Error('Revision conflict; no receipt')
  })).rejects.toThrow('Revision conflict')
  await attempts.atRevision(intent, 6, async (id, revision) => { sent.push({ id, revision }) })
  expect(sent[1]?.revision).toBe(6)
  expect(sent[1]?.id).not.toBe(sent[0]?.id)
})
