---
description: "Durable Story registry with opaque identity and scene, control, and Actor Session ownership."
kind: "package-reference"
---

# @deepseek-ai/dsh-story

English | [中文](README.zh.md)

## Summary

`dsh-story` makes StoryId the product aggregate identity. A Story owns metadata plus typed Session registrations: player/director control, public scene, and private Actor. It never discovers Stories from cwd or imports old Session history. Physical paths remain behind `ctx.storyHome`; consumers resolve a managed runtime path only after naming a known StoryId.

Archiving adds durable tombstones and never deletes logs. Actor registrations require a stable Actor id, one active control Session is allowed per Story, and one Session cannot belong to two Stories.

Roleplaying run creation and deletion are separate from that legacy archival primitive. Every current record carries a stable `templateId`: runs sharing authored settings can be grouped while retaining different StoryIds and completely independent world, memory, outline, ledger, Actor, and Session state. Registry deletion durably removes the record and its Session ownership index, while Story Home stages the managed directory in trash with rollback if the canonical delete fails.

Each Story owns a revisioned Plot Ledger and its latest Director Brief. A Brief changes the current situation and Actor-specific perceptions or uncertainties over an exact revision. Established facts and open threads derive from approved short notes; omission in a new Brief never removes them. A committed Brief remains replaceable until Actor dispatch begins; later callers resume the durable run. Strict validation rejects dialogue, decisions, and autonomous actions embedded in a Brief.

The Ledger retains an exact-revision Director Run checkpoint. Run states cover committed, dispatching, paused, retryable, completed, and cancelled work; each Actor checkpoint covers pending, running, completed, failed, skipped, and cancelled work. Every dispatch receives a Host-minted attempt id, monotonic generation, Actor Session id, and pre-attempt event floor. Settlement must own that exact attempt before event references are accepted. Completed Actors are never dispatchable again, while resume selects only unfinished Actors and preserves accepted references across quota failures and retries.

The same aggregate owns a non-canonical, revisioned Director Outline. It separates premise, themes, hard constraints, arcs, beats, foreshadows, mysteries, and narrative clocks. Every item has stable identity, player lock state, and author provenance. Player replacements are exact-revision writes; Director patches either update unlocked sections or enter a review queue according to the player-selected mode. Resolved beats and planted or paid-off foreshadows require durable event references.

The registry accepts NPC speech and action intents from `actor/expression` and `actor/action-intent` operations in a matching `npc_commit_turn` transaction. Each behavior source identifies both the physical `actor/commit` event and its operation index. The runtime invariant rejects Story-owned autonomous behavior that bypasses the turn tool. A new Brief consumes pending NPC events as explicit sources; the Actor Session log remains the authoritative behavior record.

The shared strict `schemaVersion: 6` storybook parser defines observable appearance, common knowledge, and initial personal judgments or acquaintances. A Story consumes these seeds once into its independent person registry and cognition. Initial `privateContext.perspective` statements also become authored judgments at initialization; current knowledge then supplies Actor context. Unknown facts are omitted. The protagonist remains a narrative anchor and does not restrict player embodiment.

Instance people share one Actor mechanism: registration, presence, spotlight, and Session provisioning have separate lifecycles. Exact-revision character edits preserve identity and experience. Knowledge contains natural-language judgments, observer-local entity references, visible evidence, attitude, and revision history. Actor commits validate the entire knowledge batch before accepting state or behavior; a claim can remain false, doubtful, or contradicted. Forgetting and player restoration retain history. See [dynamic people and cognition](../../../.agents/notes/implemented/feature/2026-09-06-dynamic-characters-and-knowledge.md).

Version-12 Story records also persist the roleplaying runtime state and Story-local overrides for prompts, runtime rules, capability rules, and reasoning language. The storybook owns those reusable baselines plus one private role prompt per Actor; a new run receives the copied baseline while later Story overrides remain isolated to that run. Typed player-authority commands record direction, world intervention, player-origin speech, and player-origin action without routing authority through free-form chat markers. World settlement applies exact-revision `set`/`remove` patches, records accepted or rejected Actor attempts exactly once, and delivers audience-specific perceptions. Long-story memory follows proposal and explicit player review; an approved proposal supersedes only explicitly selected entries. Each memory has separate Director continuity, public knowledge, and per-Actor subjective memory, so an Actor never falls back to Director-only content. Durable discussions persist Director- or player-initiated provenance, participants, floor ownership, queue, transcript, round budget, player intervention, and a summarizing phase that must precede completion. The context recipe lets players order, enable, and assign `system`, `user`, or `assistant` identity to every section. Enabled sections are included in full; character and estimated-token values are informational statistics, not truncation limits. Host tool grants, Actor-private isolation, and world settlement remain code-enforced.

Context recipes also carry separately editable Director-analysis and Actor-immersion modules. Players may add, reorder, disable, edit, or remove static modules with stable `custom:*` identities, titles, full content, and a chosen message role; the same authored content drives preview and model requests.

Original sources, scoped short notes, review proposals, and original pins belong to the Story checkpoint. Notes take effect only after player review; resolved consequences stay active until explicit replacement or archival. Source references preserve provenance without proving semantic completeness. See [approved context retention](../../../.agents/notes/implemented/architecture/2026-09-04-player-approved-context-retention.md).

Character state and performance guidance share the storybook and runtime definitions described in [dynamic state and style](../../../.agents/notes/implemented/feature/2026-09-05-storyweaver-dynamic-state-and-style.md). State fields carry a stable identity, ownership, type, optional bounds, and update guidance. Exact-revision changes retain history and inactive fields; Actors can change only their own subjective state, while world settlement owns objective fields and their audiences. Style modules resolve story overrides before scene guidance and remain separate from character experience.

Shared storybook, state, knowledge, style, and identity rules are owned by `roleplay-core`. This package exports those definitions and supplies host time and identity generation for its registry integration. The independent narrative application is still being integrated; current product persistence remains described below.

## Table of Contents

- [Development Contract](#development-contract)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="development-contract"></a>
## Development Contract

Story records require persistence schema version 11. Older runtime records are rejected; reusable storybooks retain their own schema.

<a id="dev-note"></a>
## Dev Note

The owning decisions are [Storyweaver Director boundary and Plot Ledger](../../../.agents/notes/implemented/feature/2026-08-29-storyweaver-director-ledger.md), [Revisioned storybook authoring](../../../.agents/notes/implemented/feature/2026-08-29-storybook-authoring.md), [Roleplaying world operations and portable stories](../../../.agents/notes/implemented/feature/2026-08-30-roleplay-world-operations.md), [Independent Story runs and roleplaying deletion](../../../.agents/notes/implemented/feature/2026-08-31-independent-story-runs-and-deletion.md), and [Story rewrite checkpoints and authored context modules](../../../.agents/notes/implemented/feature/2026-09-01-story-rewrite-checkpoints-and-context-modules.md).

<a id="model-experience"></a>
## Model Experience

None, as this package only owns durable Story metadata and Session relationships.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Registry recency changes on Story mutations, not on every scene event.
- Story manifests are derived from the canonical domain and are not independently editable.
- The registry persists Briefs and Outlines but does not itself create or wake Actor Agents; `dsh-experimental-tool-director` owns that Host orchestration.
- Settlement is explicit and typed; Director prose never mutates world state by inference.
- Narrative clocks are durable planning data, but no independent scheduler wakes Actors when a clock advances.
