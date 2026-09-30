# Agent Note: Background memory queue

Status: implemented

English | [中文](2026-09-13-background-memory-queue.zh.md)

## Problem

Private consolidation was a separate model call but remained awaited by actor completion,
discussion closure and director continuation. It occupied foreground execution records,
so continuing the story waited for memory work. Simply detaching that promise would race
foreground revisions and reuse the same technical session.

## Decision

The shipped roleplay service supplies a durable FIFO memory scheduler to actor and director
runtimes. Foreground work enqueues source batches without awaiting model generation.
The queue owns one background worker and separate Harness memory sessions. It never opens
an actor performance attempt or director orchestration record. Service-only callers without
the scheduler retain their explicit synchronous runtime behavior.

Jobs are scoped to an instance and actor or director. Evidence thresholds and the batch
limit remain configured; discussion closure may enqueue a shorter final batch. Sources
already assigned to queued, running, ready or failed jobs are not assigned again. Frozen
context and retention revision are captured when work begins. The worker has only
memory submission and perspective-filtered recall tools. It cannot publish dialogue,
settle actions, or change goals or world state.

A validated result is stored as ready before integration. The scheduler applies it only
when foreground actor/director execution is idle. A changed history epoch cancels the job;
a changed personal retention revision supersedes it and requires regeneration. New world
events alone do not overwrite the frozen memory input. Accepted units are applied through
the current review or automatic policy, and original evidence remains retrievable. Archive
validation independently reconstructs the expected retention change and rejects other
world mutations through the memory command.

Queue records live in the existing SQLite record table, in a separate technical namespace.
They do not advance narrative revisions; integrating a result does. Interrupted generation
returns to queued on restart, while applied results use a stable narrative command identity
to prevent duplicate integration after a crash. Failure does not block continuing fiction.
Pending technical jobs are local to this Home and are not transferred by narrative archives;
applied proposals and native execution evidence are exported normally.

The Background memory panel independently reads job summaries and loads a result only on
request. It shows queued, running, ready, integrated, failed, cancelled and superseded states,
with explicit regeneration for failed or stale work. It does not load author workspaces or
context previews. Native usage totals and exported request evidence include memory sessions.
`memoryQueueIntervalMs` controls polling and defaults to 1000 ms. One worker limits additional
model concurrency; it does not eliminate provider rate-limit or token costs.

This partially supersedes the blocking execution section of the
[discussion/perception/memory implementation](2026-09-12-discussion-perception-memory.md).
That note remains active for independent perception, memory, privacy and evaluation decisions.

## Verification

The scoped regression passes 327 tests, the browser flow passes, and a native DeepSeek Flash low probe preserves an unsettled action as an attempt. In that isolated probe, the fixed foreground seed returned in 97 ms while native background generation and integration completed after 5.99 seconds. The background model used 731 output tokens; the fixed seed is not a measure of ordinary model performance. Evidence: `.tmp/background-memory-full-regression.log`, `.tmp/background-memory-browser.log`, and `.artifacts/pending-attempt/2026-09-12T23-14-04-409Z/review.json`.

Queue tests cover foreground progress during generation, delayed integration, source
assignment deduplication, player memory conflicts, regeneration, interrupted-job recovery,
history restoration and archive round trips. The shipped Loader/executor composition checks
that discussion and director work finish before memory calls, then verifies retained results,
native totals, imported evidence and later recall. The separate panel test covers preview
and retry without loading the author workspace. The pending-action native probe now waits
for the background queue and separately records foreground elapsed time.

## Alternatives considered

**Detach the existing awaited call.** Rejected because the original runtime owns foreground
attempts and exact revision fences; another turn would collide with or invalidate it.

**Write model results directly into the live context.** Rejected because a background answer
can be older than a player correction or history restoration. Durable staging and a checked
integration boundary preserve both foreground work and player decisions.

**Automatically approve every completed job.** Rejected because background scheduling does
not improve the truthfulness of generated memories. Existing owner policies remain in force.

## Consequences

Foreground completion no longer includes background model latency. A later turn may begin
before its new memory exists and therefore continues using available originals and earlier
approved memory. Queue failures and conflicts are visible separately. Model resources are
still shared with foreground requests; this is concurrent orchestration, not provider-level
priority reservation. Historical inline consolidation fixtures remain explicit reference
coverage; native fixtures that assume synchronous completion need to wait on queue state.
