/** Slow and late technical frames cannot publish into another character's diagnostic panel. */
import { expect, it, vi } from 'vitest'
import type { RemoteStreamItem } from '@deepseek-ai/dsh-api-gateway/client'
import type { ExecutionLiveView, InstanceId } from '@deepseek-ai/dsh-roleplay-core/types'
import { ExecutionLiveModel, type ExecutionSubscription } from '../src/client/execution-live.ts'

function channel() {
  let waiter: ((result: IteratorResult<RemoteStreamItem<ExecutionLiveView>>) => void) | undefined
  let closed = false
  const stream: ExecutionSubscription = { [Symbol.asyncIterator]: () => ({ next: () => closed
    ? Promise.resolve({ done: true, value: undefined }) : new Promise((resolve) => { waiter = resolve }) }),
  dispose: async () => { closed = true; waiter?.({ done: true, value: undefined }); waiter = undefined } }
  return { stream, send(view: ExecutionLiveView) {
    const accept = vi.fn(); const receive = waiter; waiter = undefined
    receive?.({ done: false, value: { value: view, generation: 1, signal: new AbortController().signal, accept } })
    return accept
  } }
}

it('clears private frames on perspective changes and refuses a mismatched stream owner', async () => {
  const a = channel(); const b = channel(); const streams = [a, b]
  const model = new ExecutionLiveModel(() => streams.shift()!.stream)
  const instanceId = 'A' as InstanceId
  model.follow({ instanceId, actorId: 'keeper' })
  const accepted = a.send({ scope: { instanceId, actorId: 'keeper', revision: 1 }, request: null })
  model.follow({ instanceId, actorId: 'visitor' })
  expect(model.snapshot.getSnapshot().view).toBeNull()
  await Promise.resolve()
  expect(accepted).not.toHaveBeenCalled()
  b.send({ scope: { instanceId, actorId: 'keeper', revision: 1 }, request: null })
  await vi.waitFor(() => { expect(model.snapshot.getSnapshot().error).toContain('perspective') })
  expect(model.snapshot.getSnapshot().view).toBeNull()
  model.stop(); expect(model.snapshot.getSnapshot().request).toBeNull()
  await model.dispose()
})
