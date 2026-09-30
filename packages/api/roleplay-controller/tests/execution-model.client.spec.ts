/** A late settings read must not replace a newer saved route or a reviewed baseline after failure. */
import { expect, it } from 'vitest'
import type { ExecutionModelView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { ExecutionModelMirror } from '../src/client/execution-model.ts'

it('orders settings reads and writes and retains the prior value on write failure', async () => {
  const initial: ExecutionModelView = { selection: { provider: 'mock', model: 'first' }, revision: 1, writable: true }
  let resolve!: (result: RemoteResult<ExecutionModelView>) => void
  const model = new ExecutionModelMirror({ executionModel: () => new Promise((done) => { resolve = done }),
    selectExecutionModel: async (request) => {
      if (request.expectedRevision !== 1) throw new Error('revision conflict')
      return { ok: true, value: { ...initial, selection: request.selection, revision: 2 } }
    } })
  const pending = model.refresh()
  await model.save(1, { provider: 'mock', model: 'second' })
  resolve({ ok: true, value: initial }); await pending
  expect(model.snapshot.getSnapshot().view?.selection.model).toBe('second')
  await expect(model.save(0, { provider: 'mock', model: 'stale' })).rejects.toThrow('revision conflict')
  expect(model.snapshot.getSnapshot().view?.selection.model).toBe('second')
  const closing = model.refresh(); model.dispose(); resolve({ ok: true, value: initial }); await closing
  expect(model.snapshot.getSnapshot().view?.selection.model).toBe('second')
})
