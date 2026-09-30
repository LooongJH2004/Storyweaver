# Agent Note: Player-approved context retention with original-source recall

Status: implemented

English | [中文](2026-09-04-player-approved-context-retention.zh.md)

## Problem

A fixed recent window can silently remove an unresolved condition, and a replacement Brief can omit facts that still matter. World summaries cannot recover details that were never copied into them. Automatic summarization consumes additional requests and still cannot prove that its rewritten text preserves every exception.

## Decision

The Story stores immutable source locations, captured knowledge scopes, stable ordering, revisioned short notes, proposals, and viewer-specific original pins. Original text remains in Session logs, world records, delivered perceptions, or durable discussion turns. Narration locates the complete submitted text; accepted action sources retain their structured fields. Recall selects only the active index and the authenticated reader’s scope, then pages complete text by source id, literal keyword, or scene.

Director and Actor normal submissions carry a fixed optional `context_update`; local `$narration` and `$behavior:N` references resolve after acceptance. Host validation rejects missing sources, scope escalation, stale target revisions, and Director withdrawal of Actor promises before submission effects. Accepted Actor attempts write pending proposals idempotently. An immutable submitted unit remains separate from the player-edited review unit, so accepted-attempt recovery neither rejects nor overwrites reviewed edits. No proposal activates a note, runs another model, or grants retirement by itself.

The player reviews source-processing units together with every proposed note and archival reason. Revision checks make a batch atomic; editing, approval, rejection, and original pins remain explicit. Facts, claims, promises, conditions, questions, clues, player direction, and outcomes keep their kind and provenance. Resolved and withdrawn consequences remain in context. Explicit replacement transfers existing source coverage; losing any required note restores the original. Briefs update the situation and dispatch perceptions while fact/thread lists derive from approved notes.

The default 64/32/12 Director, Actor, and discussion windows are minimum recent retention. Older sources stay until that reader has approved coverage or explicit archive-only approval, with no pending overlapping review or original pin. World, discussion, and current-turn carriers deduplicate by source id. A per-Agent baseline advances by visible sources, default 12, or 24,000 update characters; static settings, recipe, and scene changes also rebuild it. Eligible originals retire at rebuilding. Private activity elsewhere cannot advance a reader’s source counter. Request logs carry the actual retention counts, and capacity failures stop without silently discarding history.

The whole retention state belongs to the Story runtime checkpoint. Rewriting restores its active index; replaced Session history remains auditable but is not model-recallable. Restart loads sources, proposals, and approvals from schema-version-10 persistence and rebuilds derived request batches. Reusable storybooks keep their independent format. [Fixed tools and parallel preparation](2026-09-04-roleplay-source-continuity-and-fixed-tools.md) remains active for independent tool authority, memory replacement, and concurrent preparation; this note replaces its automatic annotation and history-retirement decisions.

## Alternatives considered

**Periodic or token-triggered summaries.** They add model input/output and require a trigger whose cost is difficult to predict. Ordinary submissions reuse current context; review progress determines compression instead.

**Automatic short-note activation or hard truncation.** Either can silently authorize an incomplete replacement. Pending originals remain present until the player approves the complete unit; source links support correction without claiming automatic semantic verification.

**Dynamic tool lists or representative early discussion turns.** Dynamic schemas alter the request prefix, while one representative reply cannot preserve all conditions. Fixed role-specific tools and the same approval rule cover every discussion source.

## Consequences

The real Loader replay uses the shipped Storyweaver Director and Actor presets, real persistence and Controller APIs, and scripted external model responses without a browser. It checks full narration recall, Actor denial, pending-note exclusion, explicit approval, stable tools, recorded statistics, and cold restart. Domain and AgentLoop tests cover window overflow, partial and stale review, pins, resolved replacements, simultaneous preparation, cancellation, retries, and history rewrites. Component snapshots cover the review drawer; browser appearance is assigned to the user.

Unapproved originals and active notes can grow beyond model capacity. Reviewing and maintaining short notes is a player cost, and rewritten notes can still omit meaning. The source index and full checkpoints also grow in storage; there is no vector retrieval, periodic summarizer, hard token ceiling, or guaranteed provider cache hit rate.
