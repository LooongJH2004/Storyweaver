/** Durable memory work is separate from foreground narrative attempts. */
import { z } from 'zod'
import { RoleplayError } from './records.ts'
import { contextUpdateSchema, proposeContextUpdate, type ContextUpdateUnit } from './context-retention.ts'
import { indexedRetention, narrativeOriginals, retentionOf } from './retention-records.ts'
import { perceivedEvidenceFor, comparePerceivedEvents } from './perceived-evidence.ts'
import { personOf, replace, json } from './world.ts'
import { currentDiscussion } from './discussions.ts'
import { playerActor } from './player-control.ts'
import type { NarrativeCommands } from './commands.ts'
import type { CommandId, InstanceId, NarrativeSnapshot, RoleplayStore, RuntimeValues } from './types.ts'

const jobSchema = z.strictObject({
  id: z.string(), sequence: z.number().int().nonnegative(), ownerLabel: z.string().optional(), instanceId: z.string(),
  owner: z.string(), revision: z.number().int(), epoch: z.number().int(),
  retentionRevision: z.number().int(), boundaryId: z.string().optional(), sourceIds: z.array(z.string()),
  createdAt: z.string(), updatedAt: z.string(),
  status: z.enum(['queued', 'running', 'ready', 'applied', 'failed', 'cancelled', 'superseded']),
  attempts: z.number().int(), error: z.string().optional(), units: contextUpdateSchema.optional(),
})
export type MemoryJob = z.infer<typeof jobSchema>
/** Frozen work may call a model but cannot mutate narrative state. */
export interface MemoryGenerator {
  generate(job: MemoryJob, snapshot: NarrativeSnapshot, signal: AbortSignal,
    submit: (units: readonly ContextUpdateUnit[]) => void): Promise<void>
}
/** Runtime entry points enqueue work without awaiting its model execution. */
export interface MemoryScheduler {
  enqueue(instanceId: InstanceId, owner: string, boundary?: boolean): void
}
/** Validate one complete batch against the frozen perspective before retaining its result. */
export function validateMemoryUnits(snapshot: NarrativeSnapshot, owner: string, sources: readonly string[],
  raw: readonly ContextUpdateUnit[], id: string): ContextUpdateUnit[] {
  const units = contextUpdateSchema.parse(raw)
  const covered = units.flatMap(unit => unit.sourceIds)
  if (covered.length !== sources.length || new Set(covered).size !== covered.length
    || covered.some(source => !sources.includes(source))) throw new RoleplayError('invalid', 'Memory result must cover its assigned sources exactly once')
  proposeContextUpdate(indexedRetention(snapshot, owner), owner, id, id, units)
  return units
}
/** Queue metadata never advances a story revision or occupies its actor/director run records. */
export class MemoryQueue implements MemoryScheduler {
  private active: { job: MemoryJob; controller: AbortController; done: Promise<void> } | undefined
  private readonly jobs = new Map<string, MemoryJob>()
  private stopped = false
  private timer: ReturnType<typeof setTimeout> | undefined
  constructor(private readonly store: RoleplayStore, private readonly commands: NarrativeCommands,
    private readonly values: RuntimeValues, private readonly generator: MemoryGenerator,
    private readonly busy: (id: InstanceId) => boolean,
    private readonly options: { actorThreshold: number; directorThreshold: number; batchLimit: number; intervalMs: number },
    private readonly onError: (error: unknown) => void) {
    for (const job of store.read(tx => tx.scan('background-memory', 'jobs').map(row => jobSchema.parse(row.value)))) this.jobs.set(job.id, job)
  }

  start(): void {
    for (const job of this.all()) if (job.status === 'running') this.save({ ...job, status: 'queued' })
    this.schedule()
  }
  list(instanceId: InstanceId): readonly MemoryJob[] {
    this.commands.snapshot(instanceId)
    return this.all().filter(job => job.instanceId === instanceId).sort((a, b) => b.sequence - a.sequence)
      .map(({ units: _units, ...job }) => ({ ...job, sourceIds: [...job.sourceIds] }))
  }
  detail(instanceId: InstanceId, id: string): MemoryJob {
    this.commands.snapshot(instanceId)
    const job = this.jobs.get(id)
    if (job === undefined || job.instanceId !== instanceId) throw new RoleplayError('not-found', 'Memory job is unavailable')
    return structuredClone(job)
  }
  retry(instanceId: InstanceId, id: string): void {
    const job = this.list(instanceId).find(job => job.id === id)
    if (job === undefined || !['failed', 'superseded'].includes(job.status)) throw new RoleplayError('invalid', 'Memory job cannot be retried')
    this.save({ ...job, status: 'cancelled' })
    this.enqueue(instanceId, job.owner, true)
  }
  enqueue(instanceId: InstanceId, owner: string, boundary = false): void {
    const threshold = owner === 'director' ? this.options.directorThreshold : this.options.actorThreshold
    if (threshold === 0 || this.stopped) return
    const snapshot = this.commands.snapshot(instanceId)
    if (owner !== 'director' && (playerActor(snapshot) === owner.slice(6)
      || !personOf(snapshot, owner.slice(6)).definition.capabilities.includes('memory'))) return
    const occupied = new Set([...retentionOf(snapshot, owner).proposals.flatMap(item => item.unit.sourceIds),
      ...this.list(instanceId).filter(job => job.owner === owner && ['queued', 'running', 'ready', 'failed'].includes(job.status))
        .flatMap(job => job.sourceIds)])
    const originals = owner === 'director' ? narrativeOriginals(snapshot, owner)
      : perceivedEvidenceFor(snapshot, owner.slice(6)).sort(comparePerceivedEvents)
    const available = originals.filter(source => !occupied.has(source.id))
    const discussion = boundary ? currentDiscussion(snapshot) : undefined
    const boundaryId = discussion === undefined ? undefined : JSON.stringify([discussion.id, snapshot.instance.epoch, owner])
    const usedBatches = boundaryId === undefined ? 0 : this.all().filter(job => job.instanceId === instanceId
      && job.boundaryId === boundaryId && job.status !== 'cancelled').length
    const revisions = new Set(discussion?.turns.flatMap((turn) => {
      const receipt = turn.sourceEventRef === undefined ? undefined : this.commands.receipt(instanceId, turn.sourceEventRef as CommandId)
      return receipt === undefined ? [] : [receipt.revision]
    }) ?? [])
    const exchange = new Set(originals.filter(item => revisions.has(item.revision)).map(item => item.id))
    const inExchange = (item: (typeof available)[number]): boolean => exchange.has(item.id)
      || 'respondsTo' in item && Array.isArray(item.respondsTo) && item.respondsTo.some((id: string) => exchange.has(id))
    if (discussion !== undefined) available.sort((a, b) => Number(inExchange(b)) - Number(inExchange(a)))
    for (let batch = usedBatches; batch < this.options.batchLimit && available.length > 0; batch++) {
      if (available.length < threshold && !(boundary && (discussion === undefined || available.some(inExchange)))) break
      const sourceIds = available.splice(0, threshold).map(item => item.id)
      const now = this.values.now()
      this.save({ id: this.values.id(), sequence: this.jobs.size, instanceId, owner,
        ...(owner === 'director' ? {} : { ownerLabel: personOf(snapshot, owner.slice(6)).definition.displayName }), revision: snapshot.instance.revision, epoch: snapshot.instance.epoch,
        retentionRevision: retentionOf(snapshot, owner).revision,
        ...(boundaryId === undefined ? {} : { boundaryId }), sourceIds, status: 'queued', attempts: 0,
        createdAt: now, updatedAt: now })
    }
    this.schedule()
  }
  private all(): MemoryJob[] {
    return [...this.jobs.values()].sort((a, b) => a.sequence - b.sequence)
  }
  private save(job: MemoryJob): void {
    const next = jobSchema.parse({ ...job, updatedAt: this.values.now() })
    this.store.transaction((tx) => { tx.put('background-memory', 'jobs', job.id, next) })
    this.jobs.set(next.id, next)
  }
  private schedule(): void {
    if (this.stopped || this.timer !== undefined) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      try { this.tick() } catch (error) { this.onError(error) } finally { this.schedule() }
    }, this.options.intervalMs)
  }
  private tick(): void {
    for (const job of this.all().filter(job => ['queued', 'running', 'ready'].includes(job.status))) {
      let snapshot: NarrativeSnapshot
      try { snapshot = this.commands.snapshot(job.instanceId as InstanceId) }
      catch (error) {
        if (!(error instanceof RoleplayError) || error.code !== 'not-found') throw error
        if (this.active?.job.id === job.id) this.active.controller.abort('Story is unavailable')
        this.save({ ...job, status: 'cancelled', error: 'Story is unavailable' }); continue
      }
      if (snapshot.instance.epoch !== job.epoch) {
        if (this.active?.job.id === job.id) this.active.controller.abort('Story history changed')
        this.save({ ...job, status: 'cancelled', error: 'Story history changed' }); continue
      }
      if (job.status === 'running' && retentionOf(snapshot, job.owner).revision !== job.retentionRevision) {
        if (this.active?.job.id === job.id) this.active.controller.abort('Memory changed')
        this.save({ ...job, status: 'superseded', error: 'Memory changed; regenerate against the latest memory' }); continue
      }
      if (job.status !== 'ready' || this.busy(job.instanceId as InstanceId)) continue
      try {
        const receipt = this.commands.receipt(job.instanceId as InstanceId, `memory:${job.id}` as CommandId)
        if (receipt === undefined) {
          if (retentionOf(snapshot, job.owner).revision !== job.retentionRevision) {
            this.save({ ...job, status: 'superseded', error: 'Memory changed while this job was running; retry against the latest memory' }); continue
          }
          this.commands.execute({ instanceId: job.instanceId as InstanceId, id: `memory:${job.id}` as CommandId,
            expectedRevision: snapshot.instance.revision, principal: { kind: 'system', operation: 'memory-consolidation' },
            kind: 'memory.accept', input: json({ owner: job.owner, sourceIds: job.sourceIds, units: job.units ?? [],
              sourceRevision: job.revision, epoch: job.epoch, retentionRevision: job.retentionRevision }) }, (current) => {
            const units = validateMemoryUnits(current, job.owner, job.sourceIds, job.units ?? [], job.id)
            const next = proposeContextUpdate(indexedRetention(current, job.owner), job.owner, job.id, job.id, units)
            return { events: [replace('retention', job.owner, next)], result: { jobId: job.id } }
          })
        }
        this.save({ ...job, status: 'applied' })
      } catch (error) { this.save({ ...job, status: 'failed', error: String(error) }) }
    }
    if (this.active !== undefined) return
    const queued = this.all().find(job => job.status === 'queued' && !this.busy(job.instanceId as InstanceId))
    if (queued === undefined) return
    const latest = this.commands.snapshot(queued.instanceId as InstanceId)
    const { error: _error, ...pending } = queued
    const job = { ...pending, revision: latest.instance.revision, retentionRevision: retentionOf(latest, queued.owner).revision }
    const covered = new Set(retentionOf(latest, job.owner).proposals.flatMap(proposal => proposal.unit.sourceIds))
    if (job.sourceIds.some(source => covered.has(source))) {
      this.save({ ...job, status: 'superseded', error: 'Some sources were already processed; regenerate the remaining batch' }); return
    }
    const controller = new AbortController()
    this.save({ ...job, status: 'running', attempts: job.attempts + 1 })
    const done = Promise.resolve().then(async () => {
      const snapshot = this.commands.replay(job.instanceId as InstanceId, job.revision)
      const progress = { submitted: false }
      await this.generator.generate(job, snapshot, controller.signal, (raw) => {
        controller.signal.throwIfAborted()
        if (progress.submitted) throw new RoleplayError('invalid', 'Memory job already submitted')
        const units = validateMemoryUnits(snapshot, job.owner, job.sourceIds, raw, job.id)
        this.save({ ...job, attempts: job.attempts + 1, status: 'ready', units }); progress.submitted = true
      })
      if (!progress.submitted) throw new RoleplayError('invalid', 'Memory worker ended without a result')
    }).catch((error: unknown) => {
      const saved = this.all().find(item => item.id === job.id)
      if (saved?.status === 'running') this.save({ ...saved, status: controller.signal.aborted ? 'queued' : 'failed', error: String(error) })
    }).finally(() => { this.active = undefined })
    this.active = { job, controller, done }
  }
  async dispose(): Promise<void> {
    this.stopped = true
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.active?.controller.abort('Memory worker stopped')
    await this.active?.done
  }
}
