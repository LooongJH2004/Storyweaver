# Agent Note: Director opening tool scheduling

Status: implemented

English | [中文](2026-09-03-director-opening-tool-scheduling.zh.md)

## Problem

Two consecutive real Director sessions exposed the same opening failure class. The model retried a large first Outline after malformed or server-owned fields, added an unsupported Brief field, and reused a stale World revision after an automatically routed discussion. Host correction made the sequence longer: an active discussion received the generic advancement instruction to rebuild scene work, and a completed discussion forced an unrelated Brief, narration, and dispatch after its own summary had already satisfied the player's observe-and-advance request.

The tool schemas rejected invalid writes correctly, but the model-facing read projection and lifecycle instructions did not match those schemas. Prompt-only reminders could not correct Host continuations that demanded contradictory work.

## Decision

Director Outline context exposes a `tool_input_base` that uses the exact snake-case fields accepted by `director_update_outline`, while update mode, lock ids, pending-suggestion summaries, and update metadata remain under `read_only_governance`. Server-owned item provenance and revision history do not appear as writable fields. The first Outline guidance asks for only the premise and planning sections needed for the opening; it names `candidate` as the planned Beat status. Brief guidance lists the only three accepted Actor fields.

Opening and bare spectate advancement use ordinary one-turn Actor dispatch by default. `director_start_discussion` describes its private preparation and per-round Actor-call cost and is reserved for a concrete beat that requires replies. If a model stops after starting a dispatch-ready discussion, a dedicated bounded continuation tells it to call only `director_dispatch_actors` and forbids rebuilding the Outline, scene, Brief, or narration. If an invalid earlier sequence opened the discussion before those prerequisites, the same phase-specific continuation repairs only the missing Brief or narration. A failed dispatch does not count as completed advancement.

When discussion dispatch reaches summarizing, the Host continuation supplies the exact current World and discussion revisions. The Director narrates the outcome and closes the discussion; successful closure is terminal for that player turn. The Host does not append a fresh Brief or unrelated post-discussion beat.

This decision supersedes only the post-discussion continuation in [Roleplaying world operations and portable stories](../feature/2026-08-30-roleplay-world-operations.md). The durable discussion, player-owned round limit, automatic floor routing, and required Director summary remain unchanged.

## Alternatives considered

**Change only the editable Storybook prompt.** Existing Stories can retain authored rules, and no prompt can override a Host continuation that explicitly requests duplicate work. Fixed tool descriptions, write projections, and phase-specific lifecycle handling apply to every current Story.

**Accept server-owned Outline fields or intuitive aliases such as a planned Beat.** This would blur player locks, audit ownership, and the distinct Arc and Beat status sets. A copy-safe write projection prevents the error without weakening persistence validation.

**Combine Outline, scene, Brief, narration, discussion, and dispatch into one bootstrap tool.** This would reduce call count by hiding independently revisioned records, but it would also remove useful review, correction, and recovery points. The change removes accidental retries while retaining intentional operations.

**Force another story beat after every discussion.** The extra beat can create momentum, but it turns one completed exchange into a second unrequested advancement and contradicts the terminal semantics of `director_resolve_discussion`. A later player turn can request the next beat explicitly.

## Consequences

The opening still uses separate tools for the first Outline, physical scene, Brief, objective narration, and any Actor wake because those records have different ownership and revisions. Their model-facing inputs are smaller and copy-safe, and Host repair follows the current discussion phase instead of restarting the sequence. A completed discussion ends after its summary, eliminating three forced Director calls from the observed long path. Player-authored discussion limits can still invoke many Actor turns when the story genuinely needs an exchange; the guidance exposes that cost instead of silently treating every multi-Actor opening as a discussion.

Focused Director tests pin the Outline projection, tool descriptions, successful-dispatch detection, active-discussion continuation, exact summary revisions, and terminal discussion closure. Real-model pacing and dramatic quality remain player-owned product validation.
