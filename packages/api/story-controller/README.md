---
description: "Path-free Story Remote commands and reconnect-safe browser state."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-story-controller

English | [中文](README.zh.md)

## Summary

The Story Controller projects active Stories to the browser and owns create, rename, premise, archive, current-scene, and scene-archive commands. `StoryView` contains StoryId and typed Session identities but never a Host path. Every follow generation starts with a complete baseline.

`createFromTemplate` is the roleplaying new-run boundary. It reads one existing run's canonical storybook identity, copies only authored `world` and `assets` material, and creates a new Story aggregate with an independent character registry and authored initial cognition. Event history, memory, discussion, Director Outline, Plot Ledger, Actor sessions, and scene sessions start empty. `StoryView.templateId` lets the browser group those independent aggregates under one storybook. Run deletion asks `delete` to preserve the final record as `templateOnly`: runtime state and Session ownership are cleared while authored settings remain available for the next run. Storybook deletion still removes every aggregate and stages its managed files in Host trash. Neither roleplaying operation uses archive.

`StoryView` includes the durable Plot Ledger. The `commitDirectorBrief` command requires a Story-owned scene or control Session and forwards only the strict Director Brief fields; stale revisions, inactive Actors, non-current scenes, and extra character-behavior fields fail explicitly.

`StoryView` also includes the complete Director Outline. `updateDirectorOutline` accepts an exact-revision player replacement, including locks and update policy. `resolveDirectorOutlineSuggestion` records an explicit player acceptance or rejection of a queued Director patch. Outline failures use stable stale, locked, invalid, and missing-suggestion error codes.

The same projection carries the durable Director Run revision, statuses, Actor queue, attempt ownership, failures, and accepted event references. Six exact-revision commands expose trusted player control without exposing Actor prompts: resume unfinished Actors, retry one failed or cancelled Actor, pause the Run, cancel it terminally, skip one incomplete Actor, or cancel one running Actor attempt. The Host delegates execution and cancellation to `DirectorRunExecutor`; when that provider is absent, the Remote returns a stable `director-run-unavailable` failure.

The player character-state projection reads registered live or persisted Actor logs and current world-owned fields. Authored values initialize each run once; an empty or inactive runtime field never falls back to its opening value. `updateState` checks ownership and exact revisions, resumes a registered dormant Actor through the Session controller when necessary, and rejects invalid types or ranges. `updateStyle` shares the storybook save owner or Story prompt revision, including audience-specific current-scene guidance.

`storybook` returns the complete canonical player-editable JSON and a content revision without exposing its managed path. `updateStorybook` accepts only an exact-revision complete replacement, applies the shared Story schema, serializes writes per Story, and atomically replaces the file. `prompts` returns baseline, Story override, effective value, and source for Director/Actor settings, runtime rules, capability rules, and reasoning language; the corresponding exact-revision updates write those independent modules. `contextPreview` delegates to the runtime `storyContextRenderer` and returns its current complete sections before request batching with their `system`, `user`, or `assistant` identity, source, permission, visibility, and inclusion reason. Actor previews include only the selected Actor's private settings and data; world truth, Director Outline, and other Actors' private data are absent. Preview reads live or durable logs without mounting an Agent or initializing state. An uninitialized Actor has no current-state section and returns `pendingActorInitialization: true`; a missing runtime provider fails explicitly. These sections are not the batched wire request; `requestContextPreview` reconstructs a specific sent request.

The Remote also exposes typed PlayerAuthority, world settlement, reviewed memory, durable discussion, player discussion intervention, and context-recipe commands. Every mutating operation checks the exact current revision and returns the complete changed `StoryView`. Context preview applies the saved recipe, includes every enabled section in full, and reports character and estimated-token statistics; every visible section can be reordered, toggled, and assigned a message identity. Authored recipe sections expose their title and full content, including stable player-created `custom:*` modules, so the editor and preview share the request renderer. Runtime and capability rules are editable model guidance and cannot expand Host-granted tools, data visibility, or settlement authority. Story Package export produces a strict version-5 bundle containing the version-12 Story record, version-6 storybook, registered Session logs, version-3 turn checkpoints with Actor rewind boundaries, and portable files under `world/`; import validates limits, paths, roles, and every Session log before minting fresh Story and Session identities.

`reviewContext` applies source-processing units atomically, checking proposal and target-note revisions. `editContext` changes a pending unit; `pinContext` controls a viewer’s original retention; `contextSource` reads full original content through the current Story source index, including offline logs. These are player-authority operations, not model tools. `requestContextPreview.retention` comes from the selected recorded request rather than current Story state.

The people workspace separates spectator or Actor labels from explicit author editing. Character queries use `characterPageSize` (default 40, configurable on the Story Controller). Player cognition corrections retain prior revisions. Template collection previews basic settings with optional current knowledge, state, and memories; confirmation verifies the exact preview, character revision, and template revision. Collection preserves referenced template identities and rejects missing dependencies. It neither stages the person nor modifies existing runs.

The staged `./roleplay` entry exposes the `roleplay` Remote namespace over independent application services. It provides version publication and creation, person and cognition commands, style and attendance changes, discussion control and execution, material extraction, and explicit play/context queries. Browser payloads carry revision and command IDs; the entry supplies player authority. It does not access storage or restore Agents. The isolated Loader test creates an instance and reads its play view through the real HTTP gateway. The shipped browser still uses the old Story entry pending UI and product cutover.

The independent-instance Remote entry now lives in [`api-roleplay-controller`](../roleplay-controller/README.md), whose client export exposes only application commands and explicit query views. This package retains the current product's Story API until cutover.

## Table of Contents

- [Development Contract](#development-contract)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="development-contract"></a>
## Development Contract

The wire API intentionally has no Workspace navigation or migration arm.

`requestContextPreview` verifies Story ownership, then delegates execution-log reading to `HarnessRequestHistory`. The event coordinate selects the recorded context and resolved settings, not current Story settings. It returns `requestJson` through [LLM request reconstruction](../../llm/llm/README.md#historical-request-inspection), preserving the sender's serialization.

Missing history, invalid coordinates, or unsupported reconstruction return `story-request-context-unavailable`, never substitute content. Inspection starts no Actor, sends no model request, and writes no full-request copy.

<a id="dev-note"></a>
## Dev Note

The Director contract is owned by [Storyweaver Director boundary and Plot Ledger](../../../.agents/notes/implemented/feature/2026-08-29-storyweaver-director-ledger.md); browser writes are owned by [Revisioned storybook authoring](../../../.agents/notes/implemented/feature/2026-08-29-storybook-authoring.md) and [Roleplaying world operations and portable stories](../../../.agents/notes/implemented/feature/2026-08-30-roleplay-world-operations.md).

<a id="model-experience"></a>
## Model Experience

None, as this package only transports path-free Story state.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Deleted Stories have no browser restore UI; their managed aggregate is staged in Host trash.
- Actor state reads include persisted inactive Sessions; editing an inactive Actor requires the Session controller to resume its registered Agent.
- Actor execution remains Host-only. Checkpoint controls return no prompts; historical request inspection separately exposes the selected Story-owned request to the player.
- Story Package import is a new aggregate: it never overwrites an existing Story or preserves imported Story and Session identities. Character identities and observer-local references remain stable within the imported story.
