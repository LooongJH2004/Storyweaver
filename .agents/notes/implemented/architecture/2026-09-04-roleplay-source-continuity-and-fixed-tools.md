# Agent Note: Source continuity, fixed tools, and parallel private preparation

Status: implemented

English | [中文](2026-09-04-roleplay-source-continuity-and-fixed-tools.zh.md)

## Problem

Sliding recent-history windows can discard an unresolved promise while retaining newer routine speech. Replacing every approved memory of the same kind can remove unrelated knowledge. Rebuilding mutable context at the front of each request shortens reusable prefixes, while serial private preparation adds latency without requiring public causal ordering.

## Decision

Ordinary Director and Actor submissions propose player-reviewed short notes and source-processing decisions. [Approved context retention](2026-09-04-player-approved-context-retention.md) owns their approval, revision, provenance, and retirement rules.

Original recall and recent-window retention follow the active source index and explicit player approval described in [approved context retention](2026-09-04-player-approved-context-retention.md).

Director and Actor schemas are independent and fixed: eight Director operations plus recall, or `npc_commit_turn` plus recall. Capability and discussion-phase checks occur during execution. Low-level Actor methods remain available to trusted Host code but are not model tools. A context baseline preserves the ordered leading system sections, followed by exact field updates and then the current-turn transaction. Baselines rebuild on a configured source-count boundary, accumulated update-text boundary, static section changes, or scene changes. Non-system recipe sections retain their original tail order. Request headers log every model-visible baseline and update; process restart rebuilds derived batches without changing authoritative state.

Memory proposals name explicit `replaces` ids. Approval requires every replaced source ref, nonempty private content for each prior private audience, and public content with the prior public audience retained. Other approved entries remain active. These structural checks cannot prove semantic completeness; the player still reviews the text. Captured public audience prevents future uninformed Actors from automatically inheriting old shared knowledge.

Private preparation reserves distinct durable attempts and runs with bounded concurrency, default four. All participants must prepare or be explicitly skipped before an opening speaker is chosen. Preparation never consumes a public pass; public turns remain sequential. Cancellation reaches all active child Agents, late attempts cannot settle, and failed preparation remains retryable. Accepted closure annotations replay idempotently after a crash between Actor logging and Story persistence. Existing Story/Actor rewrite checkpoints restore the new state as well.

## Alternatives considered

**Summarize every turn or trigger by estimated tokens.** This adds routine model input/output and unpredictable latency. Sparse annotations reuse the Actor submission, and deterministic batching requires no token estimator.

**Change tool lists by phase.** This changes model-visible schemas in the prefix. Fixed role-specific definitions preserve the opportunity for prefix reuse while execution guards enforce authority.

**Use one global latest matter state.** A private correction would silently change what another character knows. Immutable audience-scoped changes retain each observer’s knowledge instead.

**Treat source coverage as proof of summary accuracy.** Keeping source ids and audience fields prevents structural loss but cannot verify that rewritten prose preserves every condition or exception. Review and exact-source recall remain necessary.

## Consequences

The focused AgentLoop tests exercise simultaneous preparation, cancellation, failure/retry, skip, first-speaker selection, accepted source annotations, and identical preparation/public tool schemas. Domain tests cover private withdrawals, ownership, explicit replacement coverage, and replay. Batch tests cover unchanged prefixes, exact append/removal/replacement, source boundaries, and rewrite invalidation. Browser appearance is assigned to the user for this change; component and localization checks remain automated.

The design does not guarantee a token ceiling or provider cache hit rate. Unapproved originals and active notes remain in requests. Source indexes and full checkpoints can grow; schema version 10 requires fresh runtime instances while preserving reusable storybooks.
