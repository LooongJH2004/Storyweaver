import { NPC_TURN_PARAMETERS, NPC_TURN_POLICY, NPC_COMMIT_CORRECTION, NPC_ACCEPTED_SCHEMA } from '@deepseek-ai/dsh-roleplay-core/npc-protocol'
/** Roleplaying-native tools scoped to autonomous NPC Agents. */

import type {} from '@deepseek-ai/dsh-experimental-actor'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { FIRST_PARTY_SECTION_ORDER } from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { InferValue, ToolRunContext } from '@deepseek-ai/dsh-tools'

export const name = 'tool-actor'
export const inject = ['agents', 'actors', 'tools', 'systemPrompt']

/** Runtime isolation policy for autonomous NPC tool scopes. */
export interface Config {
  /** Hide every inherited non-roleplaying tool inside NPC scopes. */
  readonly isolateGlobalTools?: boolean
  /** Maximum player-reviewed source-processing units in one character submission. */
  readonly maxContextUpdateUnits?: number
}
export const Config: z<Config> = z.object({
  isolateGlobalTools: z.boolean().default(true),
  maxContextUpdateUnits: z.number().step(1).min(1).default(16),
})

/** Complete model-facing NPC vocabulary. Internal ids and storage operations are deliberately absent. */
export const NPC_TOOL_NAMES = ['npc_commit_turn'] as const
const NPC_TOOL_NAME_SET: ReadonlySet<string> = new Set(NPC_TOOL_NAMES)
function acceptedOutput(): {
  schema: typeof NPC_ACCEPTED_SCHEMA
  render: (args: unknown, value: InferValue<typeof NPC_ACCEPTED_SCHEMA>) => [{ type: 'text'; text: string }]
} {
  return { schema: NPC_ACCEPTED_SCHEMA, render: () => [{ type: 'text', text: '{"accepted":true}' }] }
}

function callingOpenNpc(ctx: Context, exec: ToolRunContext, toolName: string): Agent {
  const agent = exec.agent
  if (agent === undefined) throw new Error(`${toolName} requires a calling NPC`)
  ctx.actors.membership(agent)
  if (ctx.actors.isCurrentTurnClosed(agent)) throw new Error(`NPC turn is already closed; ${toolName} cannot run`)
  return agent
}

function install(agent: Agent, ctx: Context, config: Required<Config>): () => void {
  const scoped = agent.ctx
  const disposers: Array<() => unknown> = []
  const register = (disposer: () => unknown): void => { disposers.push(disposer) }
  const accept = (): { accepted: true } => ({ accepted: true })
  let correctedTurn: number | undefined

  try {
    register(scoped.tools.presentAs('native'))
    if (config.isolateGlobalTools) register(scoped.tools.restrict({ allow: [] }))
    register(scoped.systemPrompt.section({
      name: 'actor:policy', order: FIRST_PARTY_SECTION_ORDER.ACTOR_POLICY, text: NPC_TURN_POLICY,
    }))
    register(scoped.tools.guard((exec) => {
      if (exec.agent !== agent || !NPC_TOOL_NAME_SET.has(exec.name)) return undefined
      if (ctx.actors.isCurrentTurnClosed(agent)) return 'NPC turn is already closed'
      if (exec.name === 'npc_commit_turn' && typeof exec.arguments === 'string') {
        return 'npc_commit_turn received malformed JSON or a JSON string instead of an object. Submit a JSON object directly, with posture and behavior at its root. Do not add an arguments wrapper or stringify the object. Quote every string, close every text value, and balance braces. Preserve your intended behavior while correcting the JSON.'
      }
      if (exec.name === 'npc_commit_turn' && typeof exec.arguments === 'object'
        && exec.arguments !== null && 'arguments' in exec.arguments) {
        return 'npc_commit_turn parameters have an unexpected outer "arguments" field. The Host validates only the outer object; posture inside arguments is NOT a root posture. Remove the arguments wrapper and any JSON-string encoding, and pass its fields directly: {"posture":"waiting","behavior":[{"kind":"speech","text":"Your intended words."}]}. Preserve your intended behavior; do not resend the wrapper or add diagnostic prose.'
      }
      return exec.name === 'npc_commit_turn'
        ? undefined
        : `Autonomous NPC turns must be submitted once with npc_commit_turn; '${exec.name}' is a low-level recovery primitive`
    }))

    register(scoped.tools.register(defineTool({
      name: 'npc_commit_turn',
      description: 'Submit the complete autonomous NPC turn in one transaction. The Host applies private state updates, then ordered speech/action behavior, then closes the turn. Call exactly once.',
      parameters: NPC_TURN_PARAMETERS,
      output: acceptedOutput(),
      async execute(args, exec) {
        const agent = callingOpenNpc(ctx, exec, 'npc_commit_turn')
        ctx.actors.commitNpcTurn(agent, args, config.maxContextUpdateUnits)
        exec.concludeTurn()
        return Promise.resolve(accept())
      },
    })))

    register(scoped.on('agent/turn-stopping', ({ agent: subject, turn }) => {
      if (subject !== agent || ctx.actors.isTurnClosed(agent, turn)) return
      if (correctedTurn === turn) return
      correctedTurn = turn
      agent.inject(createUserMessage({
        content: [{ type: 'text', text: NPC_COMMIT_CORRECTION }],
        source: { kind: 'plugin', plugin: name, form: 'notice', summary: 'NPC turn submission required' },
      }))
    }))
  } catch (error: unknown) {
    for (const dispose of disposers.reverse()) void dispose()
    throw error
  }
  return () => { for (const dispose of disposers.reverse()) void dispose() }
}

/** Install roleplaying-native tools on every live or subsequently bound NPC Agent. */
export function apply(ctx: Context, config: Config = {}): void {
  const resolved: Required<Config> = {
    isolateGlobalTools: config.isolateGlobalTools ?? true,
    maxContextUpdateUnits: config.maxContextUpdateUnits ?? 16,
  }
  const installed = new Map<Agent, () => void>()
  const maybeInstall = (agent: Agent): void => {
    if (installed.has(agent) || ctx.actors.tryMembership(agent) === undefined) return
    installed.set(agent, install(agent, ctx, resolved))
  }
  const uninstall = (agent: Agent): void => {
    installed.get(agent)?.()
    installed.delete(agent)
  }
  for (const agent of ctx.agents.list()) maybeInstall(agent)
  ctx.on('actor/bound', ({ agent }) => { maybeInstall(agent) })
  ctx.on('actor/unbound', ({ agent }) => { uninstall(agent) })
  ctx.on('agent/disposed', ({ agent }) => { uninstall(agent) })
  ctx.effect(() => () => {
    for (const dispose of installed.values()) dispose()
    installed.clear()
  }, 'tool-actor.scopedTools()')
}
