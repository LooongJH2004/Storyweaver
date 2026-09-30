import { playerActor } from './player-control.ts'
import { narrationDraftSchema } from './narration-drafts.ts'
import { directorRunSchema, playerDirectionSchema, discussionsOf, preparationRecordSchema } from './world.ts'
import type { NarrativeCommands } from './commands.ts'
import type { CommandId } from './types.ts'
/** Player views filter fictional content by audience and separately annotate canonical names. */
import { z } from 'zod'
import { encounterLabel, visibleCharacters, resolvePersonReference, renderPerspectiveText } from './characters.ts'
import { entity, compareRecordKeys, RoleplayError } from './records.ts'
import { castOf, evidenceFor, executionSchema, knowledgeOf, personOf, publishedBehaviorSchema, narrationSchema, sceneOf } from './world.ts'
import { currentDiscussion } from './discussions.ts'
import { discussionRunSchema } from './discussion-runtime.ts'
import { resolveInstanceSettings } from './settings.ts'
import type { InstanceId, NarrativeReader, EmbodimentChoicesView } from './types.ts'

export type { PlayAudience, PlayRow, PlayView } from './types.ts'
import type { PlayAudience, PlayRow, PlayView } from './types.ts'

/** Exact positive pagination is shared by play and author entry adapters. */
export const pageSchema = z.strictObject({ offset: z.number().int().nonnegative(), limit: z.number().int().positive() })

/** Query composition owns visibility; browser code never joins hidden identity records. */
export class PlayQueries {
  constructor(private readonly narrative: NarrativeReader & Pick<NarrativeCommands, 'receipt'>, private readonly pageLimit: number) {
    if (!Number.isSafeInteger(pageLimit) || pageLimit < 1) throw new RoleplayError('invalid', 'Play page limit must be positive')
  }

  /** Browser pagination consumes the same configured maximum as the query validator. */
  limits(): { pageLimit: number } { return { pageLimit: this.pageLimit } }

  /** Player ownership uses the complete active cast; immediate embodiment uses the visible scene cast. */
  embodimentChoices(instanceId: InstanceId, revision?: number): EmbodimentChoicesView {
    const snapshot = revision === undefined ? this.narrative.snapshot(instanceId) : this.narrative.replay(instanceId, revision)
    const scene = sceneOf(snapshot)
    const cast = castOf(snapshot)
    return { revision: snapshot.instance.revision,
      controlEntries: cast.entries.filter(person => !person.archived).map(({ definition }) => ({
        actorId: definition.actorId, label: definition.displayName, trueName: definition.displayName,
        appearance: definition.appearance, inScene: scene.present.includes(definition.actorId),
      })),
      entries: visibleCharacters(cast, 'observer', scene.id, scene.present).map(person => ({
        actorId: resolvePersonReference(cast, 'observer', person.ref), label: person.label,
        trueName: personOf(snapshot, resolvePersonReference(cast, 'observer', person.ref)).definition.displayName,
        appearance: personOf(snapshot, resolvePersonReference(cast, 'observer', person.ref)).definition.appearance,
      })) }
  }

  /**
   * Read published fiction and attendance from a single current or historical revision.
   * @param request - authorized instance, audience, revision, and bounded page.
   * @returns audience-filtered fiction, player-only canonical-name annotations, and the actual run phase.
   */
  read(request: { instanceId: InstanceId; audience: PlayAudience; revision?: number; offset: number; limit: number }): PlayView {
    const page = pageSchema.parse({ offset: request.offset, limit: request.limit })
    if (page.limit > this.pageLimit) throw new RoleplayError('invalid', 'Play page exceeds the configured limit')
    const snapshot = request.revision === undefined ? this.narrative.snapshot(request.instanceId)
      : this.narrative.replay(request.instanceId, request.revision)
    const viewer = request.audience.kind === 'observer' ? 'observer' : request.audience.actorId
    if (request.audience.kind === 'actor') personOf(snapshot, viewer)
    const cast = castOf(snapshot)
    const knowledge = knowledgeOf(snapshot, viewer)
    const scene = sceneOf(snapshot)
    const people = visibleCharacters(cast, viewer, scene.id, scene.present).map(person => ({ ...person,
      actorId: resolvePersonReference(cast, viewer, person.ref),
      trueName: personOf(snapshot, resolvePersonReference(cast, viewer, person.ref)).definition.displayName,
      appearance: personOf(snapshot, resolvePersonReference(cast, viewer, person.ref)).definition.appearance,
    }))
    const rows: PlayRow[] = []
    for (const item of snapshot.entities) {
      if (item.key.collection === 'player-input') {
        const published = playerDirectionSchema.parse(item.value)
        rows.push({ ...published, order: 0, kind: 'direction', origin: 'player' })
      }
      if (item.key.collection === 'narration') {
        const published = narrationSchema.parse(item.value)
        const text = published.texts[viewer]
        if (text !== undefined) rows.push({ id: published.id, revision: published.revision, order: 0, kind: 'narration', text })
      }
      if (item.key.collection !== 'behavior') continue
      const published = publishedBehaviorSchema.parse(item.value)
      if (!published.audience.includes(viewer) && published.actorId !== viewer) continue
      const ref = published.actorId === viewer ? 'self' : published.references[viewer]
      if (ref === undefined) continue
      const label = published.actorId === viewer ? '你' : published.labels[viewer] ?? '未具名的人物'
      const encounter = cast.encounters.findLast(entry => entry.observerId === viewer && entry.ref === ref)
      const recognizedAs = encounter === undefined ? undefined : encounterLabel(encounter, knowledge)
      rows.push({ id: published.id, revision: published.revision, order: published.order,
        kind: published.behavior.kind, origin: published.origin,
        text: published.behavior.kind === 'speech' ? published.behavior.text : published.behavior.attempt,
        speaker: { ref, label, actorId: published.actorId, trueName: personOf(snapshot, published.actorId).definition.displayName,
          appearance: personOf(snapshot, published.actorId).definition.appearance },
        ...(recognizedAs === undefined || recognizedAs === label ? {} : { recognizedAs }) })
    }
    if (request.audience.kind === 'actor') {
      const published = new Set(rows.map(row => row.id))
      for (const evidence of evidenceFor(snapshot, viewer)) {
        if (published.has(evidence.id)) continue
        rows.push({ id: evidence.id, revision: evidence.revision, order: 0, kind: 'perception',
          perception: evidence.kind, text: evidence.content })
      }
    }
    rows.sort((a, b) => a.revision - b.revision || a.order - b.order || compareRecordKeys(a.id, b.id))
    const discussion = currentDiscussion(snapshot)
    const controlled = playerActor(snapshot)
    const playerTurn = controlled !== null && discussion?.status === 'active'
      && discussion.currentSpeakerId === controlled && (discussion.preparationPendingIds?.length ?? 0) === 0
    const run = entity(snapshot, { collection: 'run', id: 'discussion' })
    const discussionRun = run === undefined ? undefined : discussionRunSchema.parse(run)
    const executions = snapshot.entities.filter(item => item.key.collection === 'execution').map(item => executionSchema.parse(item.value))
    const directorValue = entity(snapshot, { collection: 'run', id: 'director' })
    const director = directorValue === undefined ? undefined : directorRunSchema.parse(directorValue)
    const epoch = snapshot.instance.epoch
    const liveDirector = director?.epoch === epoch ? director : undefined
    const liveDiscussion = discussionRun?.epoch === epoch ? discussionRun : undefined
    const liveActors = executions.filter(item => item.epoch === epoch)
    const hasCurrentRun = liveDirector !== undefined || liveDiscussion !== undefined || liveActors.length > 0
    const paused = !hasCurrentRun && (director?.status === 'paused' || discussionRun?.status === 'paused'
      || executions.some(item => item.status === 'cancelled'))
    const phase: PlayView['phase'] = liveDirector?.status === 'preparing' ? 'director-preparing'
      : liveActors.some(item => item.status === 'running')
        || liveDirector?.status === 'dispatching' && liveDiscussion?.status !== 'running' ? 'character-responding'
        : liveDiscussion?.status === 'running' ? 'discussion-running'
          : playerTurn || discussion?.status === 'awaiting-player' ? 'waiting-player' : discussion?.status === 'summarizing' ? 'awaiting-director'
            : liveDirector?.status === 'failed' || liveDiscussion?.status === 'failed' || liveActors.some(item => item.status === 'failed') ? 'failed'
              : paused ? 'paused' : 'ready'
    const activeActorId = liveActors.find(item => item.status === 'running')?.actorId
      ?? (liveDirector?.status === 'dispatching' ? liveDirector.actors[liveDirector.completedActors] : undefined)
    const settings = resolveInstanceSettings(snapshot).effective
    const discussionPreparations = discussionsOf(snapshot).discussions
      .filter(item => request.audience.kind !== 'actor' || item.participantIds.includes(viewer))
      .map((preparedDiscussion) => {
        const preparedActors = preparedDiscussion.participantIds.filter(id => !preparedDiscussion.preparationExemptIds?.includes(id))
        const firstPublicTurn = preparedDiscussion.turns[0]?.sourceEventRef
        const firstPublicReceipt = firstPublicTurn === undefined ? undefined
          : this.narrative.receipt(snapshot.instance.id, firstPublicTurn as CommandId)
        const preparationBoundary = firstPublicReceipt === undefined ? undefined : firstPublicReceipt.command.expectedRevision - 1
        return { id: preparedDiscussion.id, topic: renderPerspectiveText(preparedDiscussion.topic, cast, viewer),
          beforeRevision: firstPublicReceipt?.revision ?? snapshot.instance.revision + 1,
          total: preparedActors.length,
          completed: preparedActors.length - (preparedDiscussion.preparationPendingIds?.length ?? 0),
          actors: preparedActors.map((actorId) => {
            const raw = entity(snapshot, { collection: 'discussion-preparation', id: `${preparedDiscussion.id}:${actorId}` })
            const record = raw === undefined ? undefined : preparationRecordSchema.parse(raw)
            const revision = record?.revision ?? preparationBoundary
            const person = people.find(person => person.actorId === actorId)
            return { actorId, label: person?.trueName ?? person?.label ?? personOf(snapshot, actorId).definition.appearance,
              ready: !preparedDiscussion.preparationPendingIds?.includes(actorId),
              ...(revision === undefined ? {} : { revision }), ...(record === undefined ? {} : { attempt: record.attempt }) }
          }),
        }
      })
    const latestPreparation = discussionPreparations.at(-1)
    const failure = liveDirector?.failure ?? liveDiscussion?.failure
    const rawDraft = liveDirector === undefined || request.audience.kind !== 'observer' ? undefined
      : entity(snapshot, { collection: 'narration-draft', id: liveDirector.id })
    const draft = rawDraft === undefined ? undefined : narrationDraftSchema.parse(rawDraft)
    return { instanceId: snapshot.instance.id, title: settings.title, premise: settings.premise,
      ...(draft === undefined || draft.status === 'published' ? {} : { narrationDraft: {
        attempt: draft.attempt, revision: draft.revision, status: draft.status, minimum: draft.minimum,
        target: draft.target, characters: draft.characters,
        text: renderPerspectiveText(draft.input.narration ?? '', cast, 'observer'),
      } }),
      playerActorId: controlled, playerTurn,
      discussionMaxRounds: settings.discussionSettings.maxRounds,
      discussionRequests: (discussionsOf(snapshot).requests ?? [])
        .filter(item => (item.status === 'pending' || item.status === 'deferred')
          && (request.audience.kind !== 'actor' || item.actorId === viewer))
        .map(item => ({ id: item.id, revision: item.revision, topic: renderPerspectiveText(item.topic, cast, viewer),
          requester: people.find(person => person.actorId === item.actorId) ?? {
            label: personOf(snapshot, item.actorId).definition.appearance,
            trueName: personOf(snapshot, item.actorId).definition.displayName,
          },
          opening: renderPerspectiveText(item.opening, cast, viewer), status: item.status as 'pending' | 'deferred', reason: item.reason })),
      discussionPreparations,
      ...(latestPreparation === undefined ? {} : { discussionPreparation: latestPreparation }),
      ...(activeActorId === undefined ? {} : { activeActorId }),
      ...(phase === 'failed' && failure !== undefined ? { failure } : {}),
      templateVersionId: snapshot.instance.templateVersionId, revision: snapshot.instance.revision,
      scene: { id: scene.id, location: scene.location }, people, phase,
      rows: rows.slice(page.offset, page.offset + page.limit), total: rows.length,
      ...(discussion === undefined || request.audience.kind === 'actor' && !discussion.participantIds.includes(viewer) ? {} : {
        discussion: { id: discussion.id, topic: renderPerspectiveText(discussion.topic, cast, viewer),
          ...((discussion.preparationPendingIds?.length ?? 0) === 0 ? {} : { preparation: {
            completed: discussion.participantIds.length - (discussion.preparationExemptIds?.length ?? 0)
              - (discussion.preparationPendingIds?.length ?? 0),
            total: discussion.participantIds.length - (discussion.preparationExemptIds?.length ?? 0),
          } }),
          status: discussion.status, round: discussion.round, maxRounds: discussion.maxRounds,
          publicTurns: { used: discussion.turns.length, total: discussion.maxRounds * discussion.participantIds.length,
            remaining: Math.max(0, discussion.maxRounds * discussion.participantIds.length - discussion.turns.length) } },
      }) }
  }
}
