import { playerActor } from './player-control.ts'
import { pendingWorldAttempts } from './world-attempts.ts'
import { directorOutlinePatchInputSchema } from './outline-rules.ts'
import { PlanningApplication } from './planning.ts'
import { RetentionApplication } from './retention.ts'
import { retentionOf } from './retention-records.ts'
import { contextUpdateSchema } from './context-retention.ts'
import { narrativeRecallSchema } from './command-inputs.ts'
/** Director tools submit narrow application commands under one host-owned execution fence. */
import { z } from 'zod'
import { PeopleApplication, createPersonSchema, stageSceneSchema } from './people.ts'
import { observationSchema } from './cognition.ts'
import { NarrationApplication, narrationDraftSchema, narrationRevisionSchema } from './narration-drafts.ts'
import { DiscussionApplication, startDiscussionSchema, discussionControlSchema, currentDiscussion } from './discussions.ts'
import { ConfigurationApplication, styleUpdateSchema } from './configuration.ts'
import { directorRunSchema, personOf, sceneOf, replace, json } from './world.ts'
import { entity, RoleplayError } from './records.ts'
import type { CommandScope, NarrativeCommit, NarrativeWriter, RuntimeValues } from './types.ts'

/** Query calls and write calls share a protocol, while only writes receive narrative receipts. */
export const directorCommandSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('find'), query: z.string(), offset: z.number().int().nonnegative(), limit: z.number().int().positive() }),
  z.strictObject({ operation: z.literal('create'), input: createPersonSchema }),
  z.strictObject({ operation: z.literal('stage'), input: stageSceneSchema }),
  z.strictObject({ operation: z.literal('observe'), input: observationSchema }),
  z.strictObject({ operation: z.literal('revise-narration'), input: narrationRevisionSchema }),
  z.strictObject({ operation: z.literal('outline'), input: directorOutlinePatchInputSchema }),
  z.strictObject({ operation: z.literal('context-update'), input: contextUpdateSchema }),
  z.strictObject({ operation: z.literal('recall'), input: narrativeRecallSchema }),
  z.strictObject({ operation: z.literal('style'), input: styleUpdateSchema }),
  z.strictObject({ operation: z.literal('discuss'), input: startDiscussionSchema }),
  z.strictObject({ operation: z.literal('discussion-control'), input: discussionControlSchema }),
  z.strictObject({ operation: z.literal('finish'), actors: z.array(z.string().min(1)).describe(
    'Present AI actors in execution order, each at most once. When the next speaker depends on what someone actually says or does, '
    + 'dispatch that person alone; a configured Director continuation may choose another speaker after the accepted response. '
    + 'Batch only actors with independent reasons to act now. '
    + 'Being present is not a reason to speak. Use a discussion for an exchange that needs repeated replies.'), advanceDiscussion: z.boolean() }),
])
/** Model-authored arguments cannot declare authority, revision, or instance. */
export type DirectorCommand = z.infer<typeof directorCommandSchema>

/** Existing business owners perform each write; this application authenticates the live director attempt. */
export class DirectorCommands {
  private readonly planning: PlanningApplication
  private readonly retention: RetentionApplication
  private readonly people: PeopleApplication
  private readonly world: NarrationApplication
  private readonly discussions: DiscussionApplication
  private readonly configuration: ConfigurationApplication
  private readonly writer: NarrativeWriter

  constructor(writer: NarrativeWriter, values: RuntimeValues, private readonly maxContextUpdateUnits: number) {
    if (!Number.isSafeInteger(maxContextUpdateUnits) || maxContextUpdateUnits < 1) throw new RoleplayError('invalid', 'Context proposal budget must be positive')
    this.writer = { execute: (command, handler) => writer.execute(command, (snapshot) => {
      const run = directorRunSchema.parse(entity(snapshot, { collection: 'run', id: 'director' }))
      if (command.principal.kind !== 'director' || command.principal.attempt !== run.id
        || run.epoch !== snapshot.instance.epoch || run.status !== 'preparing') {
        throw new RoleplayError('stale-execution', 'Director preparation is no longer current')
      }
      const draft = entity(snapshot, { collection: 'narration-draft', id: run.id })
      if (run.consolidationSources !== undefined && !['retention.propose', 'director.finish'].includes(command.kind)) {
        throw new RoleplayError('invalid', 'Director consolidation only accepts memory updates and finish')
      }
      if (run.consolidationSources !== undefined && command.kind === 'retention.propose') {
        const sources = contextUpdateSchema.parse(command.input).flatMap(unit => unit.sourceIds)
        assertConsolidationCoverage(run.consolidationSources, sources)
        if (retentionOf(snapshot, 'director').proposals.some(proposal => proposal.id.startsWith(`${run.id}:r`))) {
          throw new RoleplayError('invalid', 'This consolidation batch is already submitted')
        }
      }
      if (command.kind !== 'director.narration' && draft !== undefined && narrationDraftSchema.parse(draft).status !== 'published') {
        throw new RoleplayError('invalid', 'Publish the pending narration draft before changing the scene or finishing preparation')
      }
      return handler(snapshot)
    }) }
    this.planning = new PlanningApplication(this.writer, values)
    this.retention = new RetentionApplication(this.writer)
    this.people = new PeopleApplication(this.writer, values)
    this.world = new NarrationApplication(this.writer, values)
    this.discussions = new DiscussionApplication(this.writer, values)
    this.configuration = new ConfigurationApplication(this.writer)
  }

  /** Route an authenticated operation; all writes retain their individual atomic receipt. */
  submit(scope: CommandScope, action: Exclude<DirectorCommand, { operation: 'find' | 'recall' }>): NarrativeCommit {
    switch (action.operation) {
      case 'outline': return this.planning.patch(scope, action.input)
      case 'context-update': {
        if (action.input.length > this.maxContextUpdateUnits) throw new RoleplayError('invalid', 'Context proposal budget exceeded')
        return this.retention.propose(scope, action.input)
      }
      case 'create': return this.people.create(scope, action.input)
      case 'stage': return this.people.stage(scope, action.input)
      case 'observe': return this.world.observe(scope, action.input)
      case 'revise-narration': return this.world.revise(scope, action.input)
      case 'style': return this.configuration.setStyle(scope, action.input)
      case 'discuss': return this.discussions.start(scope, action.input)
      case 'discussion-control': return this.discussions.control(scope, action.input)
      case 'finish': return this.writer.execute({ ...scope, kind: 'director.finish', input: json(action) }, (snapshot) => {
        const run = directorRunSchema.parse(entity(snapshot, { collection: 'run', id: 'director' }))
        if (run.consolidationSources !== undefined) {
          if (action.actors.length !== 0 || action.advanceDiscussion) throw new RoleplayError('invalid', 'Consolidation cannot dispatch actors or discussions')
          const sources = retentionOf(snapshot, 'director').proposals.filter(proposal => proposal.id.startsWith(`${run.id}:r`))
            .flatMap(proposal => proposal.unit.sourceIds)
          assertConsolidationCoverage(run.consolidationSources, sources)
        }
        const scene = sceneOf(snapshot)
        const actors = action.actors.filter(id => id !== playerActor(snapshot))
        if (new Set(action.actors).size !== action.actors.length) throw new RoleplayError('invalid', 'Dispatch repeats a character')
        for (const id of actors) {
          if (!scene.present.includes(id) || personOf(snapshot, id).archived) throw new RoleplayError('invalid', 'Dispatch character is not present')
        }
        const discussion = currentDiscussion(snapshot)
        const waiting = pendingWorldAttempts(snapshot)
        if (waiting.some(item => actors.includes(item.actorId)
          || action.advanceDiscussion && discussion?.participantIds.includes(item.actorId))) {
          throw new RoleplayError('invalid', 'Settle waiting attempts and deliver feedback before dispatching those actors or their discussion')
        }
        if (discussion?.status === 'summarizing') throw new RoleplayError('invalid', 'Close the summarizing discussion with discussion-control before finishing')
        if (action.advanceDiscussion && discussion === undefined) throw new RoleplayError('invalid', 'No discussion is available to advance')
        if (discussion !== undefined && actors.some(id => discussion.participantIds.includes(id))) {
          throw new RoleplayError('invalid', 'Use discussion scheduling for its participants. '
            + 'Remove discussion participants from finish.actors; use actors=[] when nobody outside the discussion should respond. '
            + 'Use advanceDiscussion=true to continue the discussion, or close it with discussion-control before ordinary dispatch. '
            + 'No scheduling changes were submitted.')
        }
        const next = { ...run, status: 'dispatching', actors, advanceDiscussion: action.advanceDiscussion }
        return { events: [replace('run', 'director', next)], result: json(next) }
      })
    }
  }
}

/** Validate the whole private batch before persistence or completion. */
function assertConsolidationCoverage(assigned: readonly string[], submitted: readonly string[]): void {
  const seen = new Set<string>()
  const duplicated = new Set<string>()
  for (const id of submitted) {
    if (seen.has(id)) duplicated.add(id)
    seen.add(id)
  }
  const missing = assigned.filter(id => !seen.has(id))
  const unexpected = [...seen].filter(id => !assigned.includes(id))
  if (missing.length === 0 && unexpected.length === 0 && duplicated.size === 0) return
  throw new RoleplayError('invalid', 'Consolidation must cover its exact source batch. '
    + `Coverage errors: ${JSON.stringify({ missing, unexpected, duplicated: [...duplicated] })}. `
    + 'No changes were submitted. Send one complete context-update covering only the assigned sources once across units; '
    + 'do not add other visible sources or existing note IDs. After that update succeeds, finish with actors=[] and advanceDiscussion=false.')
}
