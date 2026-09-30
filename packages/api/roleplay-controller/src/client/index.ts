import { RoleplayBrowserModel } from './model.ts'
import { RoleplayInspection } from './inspection.ts'
import { PersonalStyles } from './personal-styles.ts'
import { ExecutionLiveModel } from './execution-live.ts'
import { ExecutionModelMirror } from './execution-model.ts'
export type { ExecutionModelSnapshot } from './execution-model.ts'
export type { ExecutionLiveSnapshot } from './execution-live.ts'
export type { PersonalStylesSnapshot } from './personal-styles.ts'
import contribution from '@deepseek-ai/dsh-api-roleplay-controller/remote'
export type { InspectionSnapshot, InspectionRequest } from './inspection.ts'
export type { LibrarySnapshot, PlaySnapshot, AuthorSnapshot, AuthorRequest } from './contracts.ts'
export type { RoleplayBrowserModel } from './model.ts'
/** Browser access to the generated independent-instance namespace. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
export type {} from '@deepseek-ai/dsh-api-roleplay-controller/remote'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'

/** Typed commands and audience-specific views; this service contains no Story aggregate. */
export type RoleplayRemote = TypertClientRemote['roleplay']

declare module '@deepseek-ai/cordis' {
  interface Context {
    roleplay: RoleplayRemote
    roleplayBrowser: RoleplayBrowserModel
    roleplayInspection: RoleplayInspection
    roleplayPersonalStyles: PersonalStyles
    roleplayModelSettings: ExecutionModelMirror
    roleplayExecutionLive: ExecutionLiveModel }
}

/** The gateway installs the generated namespace before this client adapter. */
export const inject = ['remote']
/** Expose the independent namespace for product UI consumers. */
export async function apply(ctx: Context): Promise<void> {
  const unmount = await ctx.remote.$mount(contribution)
  ctx.effect(() => unmount)
  ctx.inject(['remote.roleplay'], (ctx) => {
    ctx.provide('roleplay', ctx.remote.roleplay)
    const model = new RoleplayBrowserModel(ctx.remote.roleplay, request => ctx.remote.$stream({
      name: 'roleplay.followPlay', open: signal => ctx.remote.roleplay.followPlay(request, signal),
      ended: () => new Error('Play stream ended before cancellation'),
    }))
    ctx.provide('roleplayBrowser', model)
    const inspection = new RoleplayInspection(ctx.remote.roleplay)
    ctx.provide('roleplayInspection', inspection)
    ctx.provide('roleplayPersonalStyles', new PersonalStyles(() => localStorage))
    const modelSettings = new ExecutionModelMirror(ctx.remote.roleplay)
    ctx.provide('roleplayModelSettings', modelSettings)
    ctx.effect(() => () => { modelSettings.dispose() })
    const execution = new ExecutionLiveModel(request => ctx.remote.$stream({ name: 'roleplay.followExecution',
      open: signal => ctx.remote.roleplay.followExecution(request, signal), ended: () => new Error('Execution stream ended before cancellation') }))
    ctx.provide('roleplayExecutionLive', execution)
    ctx.effect(() => () => execution.dispose())
    ctx.effect(() => () =>{  inspection.dispose() })
    ctx.effect(() => () => model.dispose())
  })
}
