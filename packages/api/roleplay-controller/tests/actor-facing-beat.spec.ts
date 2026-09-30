/** Advancement forwards only the separately supplied actor-visible beat. */
import { expect, it, vi } from 'vitest'
import type { InstanceId, CommandId } from '@deepseek-ai/dsh-roleplay-core/types'
import { RoleplayController } from '../src/index.ts'

it('passes an explicit actor-facing beat to the Director and leaves it absent otherwise', async () => {
  const run = vi.fn().mockResolvedValue({ status: 'completed' })
  const controller = Object.create(RoleplayController.prototype) as RoleplayController
  Reflect.set(controller, 'ctx', { roleplayDirector: { run } })
  const command = { instanceId: 'story' as InstanceId, commandId: 'command' as CommandId, expectedRevision: 4,
    instruction: 'Private direction for the Director.' }
  await controller.advance({ ...command, actorFacingBeat: 'Keep this beat at the table.' })
  expect(run).toHaveBeenLastCalledWith({ instanceId: command.instanceId, id: command.commandId,
    expectedRevision: 4, principal: { kind: 'player' } }, command.instruction, 'Keep this beat at the table.')
  await controller.advance(command)
  expect(run).toHaveBeenLastCalledWith({ instanceId: command.instanceId, id: command.commandId,
    expectedRevision: 4, principal: { kind: 'player' } }, command.instruction, undefined)
})
