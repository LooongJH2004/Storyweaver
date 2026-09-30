/** Project the domain command vocabulary into the native tool schema subset. */
import { z } from 'zod'
import { directorCommandSchema, observationSchema, discussionControlSchema } from '@deepseek-ai/dsh-roleplay-core'
import type { ParameterSchemaSpec, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'

const schedulingOptions = directorCommandSchema.options.filter(option => !['observe', 'revise-narration'].includes(option.shape.operation.value))
const directorDiscussionControlSchema = z.union(discussionControlSchema.options
  .filter(option => ['close', 'request'].includes(option.shape.operation.value)))

/** Bounds stay enforced by the domain parser; nonempty text is also described to the model. */
function valueSchema(node: z.core.JSONSchema.JSONSchema | boolean): ValueSchemaSpec {
  if (node === true) return { type: 'json' }
  if (node === false) throw new Error('Impossible director command schema')
  if (node.anyOf !== undefined || node.oneOf !== undefined) {
    const branches = (node.anyOf ?? node.oneOf ?? []).map(valueSchema)
    if (branches.length < 2) throw new Error('Command union requires at least two branches')
    return { oneOf: branches as [ValueSchemaSpec, ValueSchemaSpec, ...ValueSchemaSpec[]] }
  }
  const hint = [node.description, node.type === 'string' && (node.minLength ?? 0) > 0 ? 'Nonempty string.' : undefined]
    .filter(Boolean).join(' ')
  const description = hint === '' ? {} : { description: hint }
  switch (node.type) {
    case 'object': return { type: 'object', additionalProperties: node.additionalProperties !== false,
      properties: properties(node), ...description }
    case 'array': return { type: 'array', items: node.items === undefined ? { type: 'json' } : valueSchema(node.items as z.core.JSONSchema.JSONSchema), ...description }
    case 'string': return { type: 'string', ...(node.enum === undefined ? {} : { enum: node.enum as string[] }),
      ...(node.const === undefined ? {} : { const: node.const as string }), ...description }
    case 'integer': case 'number': return { type: node.type, ...description }
    case 'boolean': return { type: 'boolean', ...description }
    case 'null': return { type: 'null', ...description }
    default: throw new Error(`Unsupported director schema: ${JSON.stringify(node)}`)
  }
}

/** Reject mixed root parameters before executing any director operation.
 * @param input - decoded model tool arguments.
 * @returns the validated single operation; extra root fields are rejected.
 */
export function parseDirectorToolArguments(input: unknown) {
  const { command } = z.strictObject({ command: directorCommandSchema }).parse(input)
  if (command.operation === 'observe') throw new Error('Use director_observe with flat settlement fields, without command or input wrappers.')
  if (command.operation === 'revise-narration') throw new Error('Use director_revise_narration with flat revision fields.')
  if (command.operation === 'discussion-control') directorDiscussionControlSchema.parse(command.input)
  return command
}

/** Revision fields come from the domain schema that enforces draft identity and append semantics.
 * @returns Native parameters for revising the exact current narration draft.
 */
export function directorNarrationRevisionParameters(): ParameterSchemaSpec {
  const option = directorCommandSchema.options.find(option => option.shape.operation.value === 'revise-narration')
  if (option === undefined) throw new Error('Missing narration revision operation')
  const node = z.toJSONSchema(option, { io: 'input' }).properties?.input
  if (node === undefined) throw new Error('Missing narration revision input')
  return properties(node as z.core.JSONSchema.JSONSchema)
}

function properties(node: z.core.JSONSchema.JSONSchema): ParameterSchemaSpec {
  return Object.fromEntries(Object.entries(node.properties ?? {}).map(([key, value]) => [key,
    { ...valueSchema(value), ...(node.required?.includes(key) ? { required: true as const } : {}) }]))
}

/** Derive a required discriminated command from the domain's current operation schemas.
 * @returns Native tool parameters with each operation's required fields preserved.
 */
export function directorToolParameters(): ParameterSchemaSpec {
  const branches = schedulingOptions.map((option) => {
    const node = z.toJSONSchema(option, { io: 'input' })
    if (option.shape.operation.value === 'discussion-control') {
      node.properties = { ...node.properties, input: z.toJSONSchema(directorDiscussionControlSchema, { io: 'input' }) }
    }
    return valueSchema(node)
  })
  return { command: { required: true,
    description: 'Exactly ONE scheduling operation object. Use style with input.scope=scene to give actor:ID a performance cue, desired development or response length before dispatch. This is guidance, not evidence or automatic speech. Publish narration and world evidence with director_observe. Do not nest another command or mix operations. find uses query/offset/limit directly; finish uses actors/advanceDiscussion directly.',
    examples: [
      { operation: 'create', input: { definition: { displayName: 'Gatekeeper', appearance: 'A hooded guard',
        publicPersona: 'Guards the entrance.', rolePrompt: '', capabilities: ['speak', 'act', 'reflect', 'memory'], actingGuidance: {},
        initialKnowledge: [{ text: 'I remember the entrance password.', kind: 'belief', attitude: 'believed' }] },
      purpose: 'Answer visitors at the gate.', sourceRefs: [], location: 'Gate', importance: 'supporting' } },
      { operation: 'discuss', input: { topic: 'How should we respond?', participantIds: ['first-present-id', 'second-present-id'], maxRounds: 4 } },
      { operation: 'style', input: { scope: 'scene', sceneId: 'current-scene-id', key: 'actor:registered-actor-id',
        instruction: 'Respond to the person or change that matters to you now; choose your own words and action without a report.' } },
      { operation: 'finish', actors: ['first-present-id'], advanceDiscussion: false },
      { operation: 'finish', actors: [], advanceDiscussion: false },
      { operation: 'finish', actors: [], advanceDiscussion: true },
    ],
    oneOf: branches as [ValueSchemaSpec, ValueSchemaSpec, ...ValueSchemaSpec[]] } }
}

/** Derive only the operations used by a private director memory execution.
 * @returns Recall, context-update and finish parameters, without world or scheduling examples.
 */
export function directorMemoryToolParameters(): ParameterSchemaSpec {
  const branches = schedulingOptions.filter(option => ['recall', 'context-update', 'finish'].includes(option.shape.operation.value))
    .map(option => valueSchema(z.toJSONSchema(option, { io: 'input' })))
  return { command: { required: true,
    description: 'Recall admitted director records if needed. Submit one complete context-update for the assigned batch, then finish with actors=[] and advanceDiscussion=false. Do not advance the story.',
    oneOf: branches as [ValueSchemaSpec, ValueSchemaSpec, ...ValueSchemaSpec[]] } }
}

/** Flat world-settlement arguments keep long prose outside the scheduling union.
 * @returns Required domain fields with audience and authorship guidance.
 */
export function directorObservationParameters(): ParameterSchemaSpec {
  const fields = properties(z.toJSONSchema(observationSchema, { io: 'input' }))
  const descriptions: Record<string, string> = {
    settles: 'Choose explicitly for every event: list the exact IDs of PENDING WORLD ATTEMPTS resolved here, including unsuccessful or inconclusive results; use [] only when none is resolved. Describing an outcome in content or narration does not settle its attempt. Each attempt is settled once; shared or deliveries must give its actor the perceptible result in this same call before a response can be scheduled.',
    summary: 'Short nonempty summary of this objective event.',
    content: 'Objective event or outcome only. No invented character speech, decisions, emotions, or disclosure of a discovery.',
    narration: 'Fully developed player-facing Markdown narration of the observable event: its cause, visible change and practical consequences, in paragraphs. Follow configured length and pacing; do not compress it into summary or duplicate content. Character performances follow through their executors and can be guided with style. Optional for non-public settlement.',
    shared: 'Optional shared perception: write content once with actorIds, kind and sourceRefs. Only listed recipients receive it. This is perceived content, not the full world truth or automatic player narration. For a perceptible time jump or relocation, explicitly tell affected actors the new time or location here or in deliveries; narration and scene cues alone do not update their perceived situation.',
    deliveries: 'Recipient-specific perceptions, at most one entry per actor. With shared perception, mode=supplement (or omitted) adds a separate evidence item after shared content; mode=replace gives that actor only this entry. Replace requires the actor in shared.actorIds. Keep distinct observation/claim/report provenance. Use [] when shared is sufficient or nobody receives evidence.',
    state: 'Objective state changes only; [] when unchanged.',
  }
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key,
    { ...field, ...(key === 'settles' ? { required: true as const } : {}),
      ...(descriptions[key] === undefined ? {} : { description: descriptions[key] }) }]))
}
