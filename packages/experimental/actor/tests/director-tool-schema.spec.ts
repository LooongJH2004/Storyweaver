import { expect, it } from 'vitest'
import { parameterSchemaSpecToJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { directorToolParameters, directorMemoryToolParameters, directorObservationParameters, parseDirectorToolArguments } from '../src/director-tool-schema.ts'
import { observationSchema, discussionControlSchema } from '@deepseek-ai/dsh-roleplay-core'
import { NPC_TURN_PARAMETERS, npcTurnParameters } from '@deepseek-ai/dsh-roleplay-core/npc-protocol'
import { contextUpdateToolParameter } from '@deepseek-ai/dsh-roleplay-core/context-retention'

it('explains exact recall and continuation in both ordinary and private director tools', () => {
  for (const parameters of [directorToolParameters(), directorMemoryToolParameters()]) {
    const command = parameters.command!
    if (!('oneOf' in command)) throw new Error('Missing director operations')
    const recall = command.oneOf.find((branch) => {
      if (!('type' in branch) || branch.type !== 'object') return false
      const operation = branch.properties?.operation
      return operation !== undefined && 'const' in operation && operation.const === 'recall'
    })
    if (recall === undefined || !('type' in recall) || recall.type !== 'object') throw new Error('Missing recall operation')
    const input = recall.properties?.input
    if (input === undefined || !('type' in input) || input.type !== 'object') throw new Error('Missing recall input')
    expect(input.properties?.query?.description).toContain('Put a known memory or source ID here, not in sourceId.')
    expect(input.properties?.query?.description).toContain('All space-separated terms must match the same record.')
    expect(input.properties?.sourceId?.description).toContain('Continuation check only, not a record selector.')
    expect(input.properties?.characterOffset?.description).toContain('Copy from the returned continuation')
    const schema = parameterSchemaSpecToJsonSchema(parameters)
    expect(validateJsonSchemaValue(schema, { command: { operation: 'recall', input: {
      query: 'source:known-record', offset: 0, limit: 1,
    } } }, '')).toEqual([])
  }
})

it('offers actors subjective memory kinds while directors can retain established facts', () => {
  const units = (kind: string) => [{ sourceIds: ['seen-key'], disposition: 'represented', reason: 'Remember custody.',
    changes: [{ operation: 'add', kind, text: 'I saw the key on the counter.', sourceIds: ['seen-key'] }] }]
  const actor = parameterSchemaSpecToJsonSchema(NPC_TURN_PARAMETERS)
  const director = parameterSchemaSpecToJsonSchema({ context_update: contextUpdateToolParameter })
  expect(validateJsonSchemaValue(actor, { posture: 'silent', context_update: units('fact') }, '')).not.toEqual([])
  expect(validateJsonSchemaValue(actor, { posture: 'silent', context_update: units('claim') }, '')).toEqual([])
  expect(validateJsonSchemaValue(director, { context_update: units('fact') }, '')).toEqual([])
})

it('publishes required nested creation and staging fields instead of opaque JSON', () => {
  const schema = parameterSchemaSpecToJsonSchema(directorToolParameters())
  expect(validateJsonSchemaValue(schema, { command: { operation: 'stage', input: { id: 'inn', location: 'Inn', present: ['a'], appearances: [] } } }, '')).toEqual([])
  for (const command of [
    { operation: 'stage', input: { id: 'inn', location: 'Inn', present: ['a'] } },
    { operation: 'stage', id: 'inn', location: 'Inn', present: ['a'], appearances: [] },
    { operation: 'finish' }, { operation: 'find' },
  ]) expect(validateJsonSchemaValue(schema, { command }, '')).not.toEqual([])
  expect(validateJsonSchemaValue(schema, { operation: 'finish', actors: [], advanceDiscussion: false }, '')).not.toEqual([])
  expect(JSON.stringify(schema)).toContain('capabilities')
  expect(JSON.stringify(schema)).toContain('actingGuidance')
  expect(JSON.stringify(schema)).toContain('importance')
})

it('rejects physical posture, incomplete thoughts and copied state definitions from the local failure patterns', () => {
  const schema = parameterSchemaSpecToJsonSchema(NPC_TURN_PARAMETERS)
  for (const input of [
    { posture: 'standing', behavior: [] },
    { posture: 'watching', thoughts: [{ conclusion: 'Wait for a name.' }] },
    { posture: 'watching', state_changes: [{ fieldId: 'fear', expectedRevision: 1, value: 4, reason: 'A knock.', sourceRefs: [],
      definition: { fieldId: 'fear', name: 'Fear', description: 'Fear', group: 'Inner', type: 'number', owner: 'actor', actorId: 'self', guidance: '' } }] },
  ]) expect(validateJsonSchemaValue(schema, input, '')).not.toEqual([])
  expect(validateJsonSchemaValue(schema, { posture: 'watching', thoughts: [{ content: 'I want to wait.', conclusion: 'Wait for a name.' }],
    state_changes: [{ fieldId: 'fear', expectedRevision: 1, value: 4, reason: 'A knock.', sourceRefs: [] }], behavior: [] }, '')).toEqual([])
})

it('requires an explicit visibility choice for every model-authored action', () => {
  const schema = parameterSchemaSpecToJsonSchema(NPC_TURN_PARAMETERS)
  const action = { kind: 'action', attempt: 'Look under the desk.', await_result: true }
  expect(validateJsonSchemaValue(schema, { posture: 'waiting', behavior: [action] }, '')).not.toEqual([])
  for (const visibility of ['public', 'concealed']) {
    expect(validateJsonSchemaValue(schema, { posture: 'waiting', behavior: [{ ...action, visibility }] }, '')).toEqual([])
  }
})

it('advertises only granted actions and cognition without removing independent retention policy', () => {
  const limited = npcTurnParameters(['speak', 'memory'])
  const schema = parameterSchemaSpecToJsonSchema(limited)
  expect(Object.keys(limited)).toContain('context_update')
  for (const field of ['thoughts', 'knowledge_changes', 'state_changes', 'turning_points', 'goals', 'intentions']) {
    expect(Object.keys(limited)).not.toContain(field)
  }
  expect(Object.keys(limited)).toContain('memories')
  expect(validateJsonSchemaValue(schema, { posture: 'waiting', behavior: [{ kind: 'speech', text: 'Wait.' }] }, '')).toEqual([])
  expect(validateJsonSchemaValue(schema, { posture: 'waiting', behavior: [
    { kind: 'action', attempt: 'Look.', visibility: 'public', await_result: true },
  ] }, '')).not.toEqual([])
  const silentParameters = npcTurnParameters([])
  expect(Object.keys(silentParameters)).not.toContain('behavior')
  const silent = parameterSchemaSpecToJsonSchema(silentParameters)
  expect(validateJsonSchemaValue(silent, { posture: 'silent' }, '')).toEqual([])
  const complete = npcTurnParameters(['speak', 'act', 'reflect', 'memory', 'goals', 'schedule'])
  expect(complete).toEqual(NPC_TURN_PARAMETERS)
  expect(npcTurnParameters()).toBe(NPC_TURN_PARAMETERS)
})

it('keeps log-derived director mistakes rejected and publishes executable operation examples', async () => {
  const parameters = directorToolParameters()
  const schema = parameterSchemaSpecToJsonSchema(parameters)
  const observe = { operation: 'observe', input: { summary: 'A knock.', content: 'The door shakes.', deliveries: [], state: [] } }
  expect(() => parseDirectorToolArguments({ command: observe })).toThrow()
  for (const command of [
    { ...observe, input: { summary: 'A knock.', content: 'The door shakes.', deliveries: [] } },
    { command: { operation: 'discuss', input: { topic: 'The door', participantIds: ['a', 'b'], maxRounds: 4 } } },
  ]) {
    expect(validateJsonSchemaValue(schema, { command }, '')).not.toEqual([])
    expect(() => parseDirectorToolArguments({ command })).toThrow()
  }
  expect(() => parseDirectorToolArguments({ command: observe, query: '', offset: 0, limit: 20 })).toThrow()
  expect(() => parseDirectorToolArguments({ command: { ...observe, input: { ...observe.input, summary: '' } } })).toThrow()
  const examples = parameters.command!.examples
  if (!Array.isArray(examples)) throw new Error('Missing model-facing examples')
  for (const command of examples) {
    if (command === null || typeof command !== 'object') throw new Error('Operation example must be an object')
    expect(validateJsonSchemaValue(schema, { command }, '')).toEqual([])
    expect(parseDirectorToolArguments({ command })).toMatchObject(command)
  }
  const independentActors = { operation: 'finish', actors: ['first', 'second'], advanceDiscussion: false }
  expect(validateJsonSchemaValue(schema, { command: independentActors }, '')).toEqual([])
  expect(parseDirectorToolArguments({ command: independentActors })).toEqual(independentActors)
  await expect(JSON.stringify(schema, null, 2) + '\n').toMatchFileSnapshot('./expected/director-tool-schema.json')
})

it('publishes a flat narration tool that rejects the nested wrappers seen in local logs', async () => {
  const schema = parameterSchemaSpecToJsonSchema(directorObservationParameters())
  const input = { summary: 'The page becomes legible.', content: 'The margin contains three faded letters.',
    narration: 'Three faded letters emerge in the light.\n\nThe rest remains blurred.',
    deliveries: [{ actorId: 'reader', content: 'You can distinguish three letters.', kind: 'observation', sourceRefs: [] }], state: [] }
  expect(validateJsonSchemaValue(schema, input, '')).not.toEqual([])
  expect(validateJsonSchemaValue(schema, { ...input, settles: [] }, '')).toEqual([])
  expect(validateJsonSchemaValue(schema, { ...input, settles: ['attempt-1'] }, '')).toEqual([])
  expect(observationSchema.parse({ ...input, settles: ['attempt-1'] }).settles).toEqual(['attempt-1'])
  expect(observationSchema.parse(input)).toEqual(input)
  for (const invalid of [{ command: { operation: 'observe', input } }, { input }, { ...input, summary: '' },
    { ...input, deliveries: [{ actorId: 'reader', content: 'Letters', kind: 'observation' }] }]) {
    expect(() => observationSchema.parse(invalid)).toThrow()
  }
  expect(validateJsonSchemaValue(schema, { command: { command: { operation: 'observe', input } } }, '')).not.toEqual([])
  await expect(JSON.stringify(schema, null, 2) + '\n').toMatchFileSnapshot('./expected/director-observe-schema.json')
})

it('accepts supporting episodes without repeated interpretation or impact, but requires experience', () => {
  const schema = parameterSchemaSpecToJsonSchema(directorToolParameters())
  const episode = { topic: 'A promise', experience: 'The keeper promised a room.', interpretation: 'The promise has not been fulfilled.',
    impact: 'The room remains reserved.', unresolved: ['Will the guest return?'] }
  const note = { operation: 'add', kind: 'promise', text: 'A room is promised, not yet delivered.', sourceIds: ['speech-1'], episode }
  const command = { operation: 'context-update', input: [{ sourceIds: ['speech-1'], disposition: 'represented', reason: 'Keep the promise.', changes: [note] }] }
  expect(validateJsonSchemaValue(schema, { command }, '')).toEqual([])
  expect(parseDirectorToolArguments({ command })).toEqual(command)
  const { impact: _impact, interpretation: _interpretation, ...supporting } = episode
  const minimal = { ...command, input: [{ ...command.input[0], changes: [{ ...note, episode: supporting }] }] }
  expect(validateJsonSchemaValue(schema, { command: minimal }, '')).toEqual([])
  expect(parseDirectorToolArguments({ command: minimal })).toEqual(minimal)
  const { experience: _experience, ...incomplete } = supporting
  const invalid = { ...command, input: [{ ...command.input[0], changes: [{ ...note, episode: incomplete }] }] }
  expect(validateJsonSchemaValue(schema, { command: invalid }, '')).not.toEqual([])
  expect(() => parseDirectorToolArguments({ command: invalid })).toThrow()
})

it('keeps player-only discussion controls out of director tools and argument parsing', () => {
  const schema = parameterSchemaSpecToJsonSchema(directorToolParameters())
  for (const input of [
    { operation: 'floor', discussionId: 'discussion', actorId: 'a' },
    { operation: 'resume', discussionId: 'discussion' },
    { operation: 'intervene', discussionId: 'discussion', intervention: 'speak' },
  ]) {
    expect(discussionControlSchema.parse(input)).toEqual(input)
    const command = { operation: 'discussion-control', input }
    expect(validateJsonSchemaValue(schema, { command }, '')).not.toEqual([])
    expect(() => parseDirectorToolArguments({ command })).toThrow()
  }
  for (const input of [
    { operation: 'close', discussionId: 'discussion', status: 'completed' },
    { operation: 'request', requestId: 'request', expectedRequestRevision: 1, decision: 'accept', reason: 'Discuss now.' },
  ]) {
    const command = { operation: 'discussion-control', input }
    expect(validateJsonSchemaValue(schema, { command }, '')).toEqual([])
    expect(parseDirectorToolArguments({ command })).toEqual(command)
  }
})
