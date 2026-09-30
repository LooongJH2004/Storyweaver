/** Execution model preferences live in Harness settings, outside fictional instance records. */
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'

import type { ExecutionModelSelection, ExecutionModelView } from '@deepseek-ai/dsh-roleplay-core/types'
const namespace = settingsNamespace('roleplay-execution-model')
const schema: z<ExecutionModelSelection> = z.object({
  provider: z.string().required(), model: z.string().required(), reasoningEffort: z.string(),
})
declare module '@deepseek-ai/cordis' { interface Context { roleplayExecutionModel: ExecutionModelSettings } }

/** A setting change affects the next execution, including previously created actor sessions. */
export class ExecutionModelSettings extends Service {
  static inject = ['llm']
  static Config = schema
  private source: () => ExecutionModelSelection
  constructor(ctx: Context, config: ExecutionModelSelection) {
    super(ctx, 'roleplayExecutionModel')
    this.source = () => ({ ...config })
    installSettingsSection(ctx, namespace, schema, config, { setSource: (source) => { this.source = source }, onChange: () => {} })
  }
  /** @returns Detached settings and the revision required by the next write. */
  read(): ExecutionModelView {
    const settings = this.ctx.get('settings')
    const descriptor = settings?.describe().find(value => value.ns === namespace)
    return { selection: { ...this.source() }, revision: descriptor?.revision ?? 0, writable: settings?.writable ?? false }
  }
  /** @returns The host-owned selection sampled at an execution boundary. */
  selection(): ModelSelection {
    const value = this.source()
    return { provider: value.provider, model: value.model,
      ...(value.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(value.reasoningEffort) }) }
  }
  /** Validate the provider route before committing a reviewed settings revision.
   * @param input - Exact route and revision read by the player.
   * @returns Saved selection; an unavailable model or conflict preserves the prior value.
   */
  async save(input: { expectedRevision: number; selection: ExecutionModelSelection }): Promise<ExecutionModelView> {
    const settings = this.ctx.get('settings')
    if (settings === undefined || !settings.writable) throw new Error('Execution model settings are read-only')
    const route = await this.ctx.llm.resolveCallConfig({ provider: input.selection.provider, model: input.selection.model,
      ...(input.selection.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(input.selection.reasoningEffort) }) })
    await settings.replace(namespace, { provider: route.provider, model: route.model,
      ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: String(route.reasoningEffort) }) }, input.expectedRevision)
    return this.read()
  }
}
