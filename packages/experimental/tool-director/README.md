---
description: "Strict Storyweaver Director context, Outline and Brief tools, and isolated autonomous Actor dispatch."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-tool-director

English | [中文](README.zh.md)

## Summary

`dsh-experimental-tool-director` supplies a Story Director with ten orchestration tools and one read-only history recall tool. Each Actor uses its own fixed submission and recall tools. Private discussion preparations can run concurrently; public replies follow durable floor ownership. Player controls can resume, retry, pause, cancel, or skip attempts.

The package also exports two preset-scoped boundaries. `@deepseek-ai/dsh-experimental-tool-director/director` masks every inherited Host tool except the ten ordinary `director_*` operations and `roleplay_recall`, so Story Sessions cannot see coding, filesystem, shell, workflow, delegation, or manual world-settlement tools. `@deepseek-ai/dsh-experimental-tool-director/creator` is a separate Story control capability: it isolates inherited tools and exposes strict Storybook operations plus bounded managed-draft and player-authorized local-workspace tools.

The package never turns Director prose into character behavior. Director context keeps the product policy and tool protocol locked first, applies the remaining ordered Story context, and places the authored Director reasoning-mode constraint at the default recipe tail with `user` message identity. A dispatch creates or resumes one private Agent Session per instance Actor, mounts the separate `storyweaver-actor` preset, sends only that Actor's permitted data, and likewise places the authored Actor reasoning-mode constraint at the default recipe tail with `user` identity. Players may still reorder either recipe or change those identities. While an Actor runs, its reasoning blocks and in-flight `npc_speak` or `npc_act` arguments are mirrored incrementally into one player-only attempt projection. Settlement replaces that draft with accepted, source-linked read-only events from the Plot Ledger. Reasoning and stream drafts never enter the Ledger; they remain available only inside the same in-flight tool transaction and are excluded from later turns and other agents.

Before each Actor request, the runtime applies the current authored name, persona, and capabilities through an exact-revision configuration event. Existing Actors resume against their persisted stable identity. Editing opening values affects future initialization only; current state and memories remain intact.

Player embodiment is enforced from the original Session input: Brief creation, private discussion preparation, public turns, and resumed dispatch reject autonomous execution of the controlled Actor. Retry envelopes retain ownership; a new ordinary player turn releases it. Historical display names resolve only when exact and unambiguous.

The Director searches and creates story-local people before staging them; ordinary background crowds need no Actor. Each recipient receives its own observable perception, including unbound hearsay clues when appropriate. Actor rosters and structured targets use observer-local references. Explicit `[[person:actorId]]` mentions are rendered for the viewer, while accepted speech remains exact. Source projections and attempt labels retain their historical identity view. `npc_recall_knowledge` reads only the calling Actor’s retained judgments and clues, with configurable entry and character budgets. Oversized judgments remain available through chunked recall.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the boundary](#understand-the-boundary)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

Mount it after Story, Actor, Actor tools, and Agent presets:

```ts
import type { Context } from '@deepseek-ai/cordis'
import * as ToolDirector from '@deepseek-ai/dsh-experimental-tool-director'

declare const ctx: Context

await ctx.plugin(ToolDirector, {
  actorPreset: 'storyweaver-actor',
  directorRecentEventLimit: 64,
  actorRecentPerceptionLimit: 32,
  discussionRecentTurnLimit: 12,
  storyTurnCheckpointLimit: 128,
  preparationConcurrency: 4,
  contextBatchSize: 12,
  contextDeltaCharacterLimit: 24_000,
  recallEventLimit: 8,
  recallCharacterLimit: 12_000,
})
```

Each Story may provide `world/storybook.json` and `world/opening.md`. A missing storybook is shown explicitly in Director context and makes Brief provisioning or Actor dispatch fail. The storybook uses the strict schema owned by `dsh-story`, so browser authoring, Director loading, Actor provisioning, and character projection accept the same document. Invalid present JSON fails the model step rather than silently omitting the story.

Mount the director subpath inside the ordinary `storyweaver` preset after the Host orchestration plugin has registered its tools. Mount the creator subpath only inside the dedicated `storyweaver-creator` preset. Managed Story files remain logical paths and never expose `StoryHome` physical paths; separate local tools resolve against the player-authorized Session working directory. The creator cannot run a shell, delete files, reach another Story, advance the world, or call Director/Actor tools. `world/storybook.json` is changed only through `storybook_save`, which requires the revision returned by `storybook_read`, validates the complete strict v4 document, and delegates the atomic replacement to Story Controller.

<a id="understand-the-boundary"></a>
## Understand the boundary

- `director_stage_scene` writes the single Host-managed physical scene frame over an exact World revision only when the location or co-present cast changes. Its complete cast uses stable storybook Actor ids, but staging does not wake or provision every Actor Session.
- `director_commit_brief` stores situation, established facts, open threads, and perceptions and uncertainties for this turn's spotlight Actors over an exact Ledger revision. Brief Actors must be a subset of the current scene cast, and each entry accepts only `actor_id`, `perceptions`, and `uncertainties`. The Host rejects a Brief while the Outline is empty, so the Director must first create a useful long-range draft with `director_update_outline`. The Director may replace a just-committed Brief before `director_narrate`; authoritative narration closes that correction window, and after dispatch starts it must resume the incomplete run.
- `director_update_outline` replaces selected unlocked planning sections over an exact Outline revision. Director context presents current planning as a copy-safe `tool_input_base` with the tool's snake-case names, separate from read-only review and lock metadata. The first revision can stay compact: a premise and only the arc, one to three beats, or other sections needed for the opening. Brief commits never update the Outline, and player locks and review mode remain enforced by the Story domain.
- `director_narrate` is required before dispatching every fresh Brief, and the Director policy requires objective narration on every ordinary player turn. It projects literary player-visible prose into the scene while retaining an authoritative Director-sourced World Event with a canonical summary, scoped Actor perceptions, and an optional world patch. A prose-only Director completion without narration receives up to two bounded corrective continuations; recovery controls and discussion pauses do not create duplicate narration. Narration is canonical Markdown: blank lines separate paragraphs and ordinary Markdown emphasis is supported. The Host converts legacy bare `<p>`/`<br>` fragments and rejects every remaining HTML or XML construct. The browser applies the same narrow conversion to historical narration before using the shared untrusted-Markdown renderer, where raw HTML and unsafe links remain non-executable. Narration may advance environment, time, external pressure, objective player-action results, and transitions, but cannot supply Actor dialogue, private thought, or voluntary decisions. Interrupted retries reuse the same Brief narration.
- Accepted Actor speech and action attempts are established automatically by the Host after durable attempt ownership is verified. Speech keeps its resolved audience; an action is recorded only as an attempt, with current-scene perception and no inferred success or arbitrary world-fact patch. The recovery settlement primitive remains internal and is not exposed to an ordinary Director.
- `director_propose_memory` creates a pending scene/arc memory with separate Director continuity, shared public knowledge, and per-Actor subjective memory. It does not enter model context until the player approves it. Director guidance requests this only after a meaningful scene or arc transition, not every turn.
- `director_start_discussion` lets the Director create a persisted floor-controlled discussion only when replies among present Brief Actors are needed to produce the current beat. An opening scene or bare spectate request uses ordinary dispatch by default. Before public speech, every participant receives one private preparation slot; public work can then invoke every participant once per player-authored round, so the Director does not use this path for atmosphere or independent reactions.
- `director_resolve_discussion` resumes a player-paused discussion or marks it complete only after the discussion enters its durable summarizing phase and the Director has projected a concrete outcome summary in the same turn. A successful `complete` resolution concludes the current player turn. The completed exchange and its summary already satisfy observe-and-advance; the Host does not force a second Brief or an unrelated post-discussion beat.
- `director_dispatch_actors` uses the latest current-scene Brief and is Host-rejected until that fresh Brief has a `director_narrate` event. Actor ids must belong to that Brief, the storybook, and the current scene cast. Outside a discussion it gives every selected Actor exactly one autonomous turn and is the default for openings, bare spectate advancement, and independent reactions. When the current beat requires questions and replies, dispute, negotiation, or a shared decision, the Director first calls `director_start_discussion`; the Host then follows the durable floor without waiting for another player message. Multiple Actors are awakened, awaited, and settled one at a time in Brief order; each later Actor receives previously accepted speech visible to it instead of generating concurrently without the prior reply. Private preparation alone uses bounded concurrency (default 4), one owned attempt per Actor, and an all-prepared barrier; it consumes no public turn. Failures leave that barrier pending for retry or explicit skip.

While a discussion is running, one Director dispatch completes private preparation and then keeps following the persisted public floor until an explicit player intervention, an Actor failure, an Actor concludes, or the player-authored round budget is exhausted. The Actor context labels the current submission contract explicitly as `PRIVATE PREPARATION MODE` or `PUBLIC FLOOR MODE`: preparation gives the sole valid empty-behavior/pass shape, while the public floor requires `discussion` and explicit speech/action `kind` values. A temporary Host guard validates every `npc_commit_turn` against that phase before Actor events are written. Invalid submissions receive an in-turn correction instead of partially committing speech or action. Each Actor sees its own declared intent but never another participant's private stance or eagerness; public turns remain visible through sourced speech. Speakers are encouraged to react to and hand off to specific participants instead of producing isolated round-robin statements. The Host gives a dispatch-ready active discussion that stopped before dispatch a dedicated continuation which forbids rebuilding the Outline, scene, Brief, or narration. If an invalid earlier sequence opened the discussion before its Brief or narration, that same phase-specific continuation repairs only the missing prerequisites without replacing the Outline, scene, or discussion. Natural or budgeted completion enters a durable summarizing phase; a separate continuation includes the exact World and discussion revisions for narration and closure. Ordinary advancement, active discussion, and conclusion repairs have independent bounds, and successful closure is terminal for the player turn. A player request to speak or conclude pauses automatic progression until the Director resolves it; interruption remains an explicit player control.

Before each Actor wake, the runtime writes a fresh attempt id, generation, Actor Session, and event floor into the exact current Run revision. Cancellation propagates through an `AbortSignal` and `Agent.cancel()`. Settlement first verifies that the Actor still owns the same attempt, then uses the durable `actor/turn-closed` event to determine whether the character turn closed before persisting the outcome and projecting accepted events. Both behavior and deliberate silence must close through one accepted `npc_commit_turn`; silence uses empty behavior. Text-only completion receives one same-turn corrective step, and a repeated omission fails as `ACTOR_DID_NOT_COMMIT` instead of being recorded as successful silence. Paused or cancelled attempts reject late Actor events; completed Actors and their accepted references are never replaced by a retry. An Actor request classified as quota exhaustion receives one bounded delayed retry to absorb transient provider drift. If it still fails, dispatch stops before contacting later Actors, the Run remains at an `awaiting_retry` checkpoint, and resume dispatches only unfinished Actors.

Actor prompts never include the Story Bible, world truth, Director Outline, Director guidance, other Actors' private context or acting guidance, or a desired response. Actor assistant text has no world authority; only accepted NPC tools create speech or action. Scene projections preserve the Actor Session id and source event sequence so rendering cannot be mistaken for Director authorship.

`roleplay_recall` reads complete original payloads from active source-index locations: player input, Director narration, accepted Actor behavior, and delivered perceptions. Literal keywords, source ids, and scene ids select results; each page contains at most 8 sources and 12,000 text characters with continuation offsets. Actor access covers only authored outputs and actually received content. The fixed `context_update` field in `director_commit_brief`, `director_narrate`, and `npc_commit_turn` proposes short memories during ordinary work, without a separate summarizer.

<a id="dev-note"></a>
## Dev Note

The owning decision is [Storyweaver Director boundary and Plot Ledger](../../../.agents/notes/implemented/feature/2026-08-29-storyweaver-director-ledger.md).

<a id="model-experience"></a>
## Model Experience

### Director context and orchestration tools

#### What the model sees

The Director receives fixed rules and authored settings, a baseline, ordered state changes, and the current-turn interaction. The saved recipe preserves section identities and order. Each Actor sees its own accepted behavior and delivered perceptions; source ids deduplicate world and discussion records. The recent minima are 64 Director sources, 32 Actor sources, and 12 discussion turns. Every older original remains unless player-approved processing covers that exact viewer and the original is not pinned. Approved notes preserve facts, claims, promises, conditions, questions, clues, player direction, and resolved consequences. Briefs change scheduling and current situation without replacing these records. Player control interpretation stays turn-local while original player input stays intact.

#### Token effect

Every Director step reloads current settings and applies the saved section order, enablement, and message identity without character-count truncation; the read-only `storyContextRenderer` service shares the same section renderers and projection bounds with requests. Preview reports the full current sections and character/token estimates before request batching, while logged request inspection reconstructs the actual sender payload. It reads dormant Actor logs without creating an Agent; uninitialized Actors are explicitly marked and have no current-state section. Request history retains only the current turn's user input and assistant reasoning/tool-call/result/correction transaction; completed prior-turn reasoning and tool traces remain in the Session/UI but are not resent. Actor turns include only one character definition and its permitted semantic slices, with exact duplicates removed between World and Brief. Approved long-story memory stays complete until explicit replacement or archival. The default Director guidance keeps the first Outline update to the opening's minimum useful plan, treats ordinary dispatch as the default opening action, and reserves a potentially multi-call discussion for a beat that requires replies. Its reasoning section uses one to three short sentences to select the current dramatic pressure, next objective beat, and immediate action; later tool steps do not restate the plan, and technical analysis is limited to a one-sentence parameter correction after an actual tool error. The reasoning-language module issues a mandatory instruction for private analysis, planning, tool selection, and consistency checks to remain in the selected language, checked once at the beginning of each assistant response rather than restarted before every tool call, without requesting hidden chain-of-thought disclosure.

#### KV Cache effect

Leading system sections form a per-Agent baseline. Exact changes append before the current-turn transaction. Rebuilding occurs at a 12-visible-source batch boundary, after 24,000 accumulated update characters, or when the scene, static prompt, or recipe changes. Another Actor’s private sources do not advance this Agent’s counter. Eligible originals retire only during rebuilding; unapproved or pinned originals remain. History rewrite restores authoritative checkpoints and clears derived batches; restart rebuilds the projection. These are character/source thresholds, not token estimates or guaranteed cache hit rates.

### Creation workspace

#### What the model sees

The creator receives a task-editable authoring prompt followed by a locked creation-only policy, and dedicated `storybook_schema`, `storybook_read`, `storybook_save`, `storybook_publish`, `creator_complete`, `storybook_list_files`, `story_file_read`, `story_file_write`, and `story_file_edit` tools. Its preset separately mounts local `read`, `read_image`, `write`, `edit`, `glob`, `grep`, and the platform shell against the directory the player explicitly selected when creating the task. The creation chain preserves that directory as the Creator control Session's `cwd`; ordinary Story and Actor Sessions continue to use the Story `.runtime`. Director Outline, World State, Plot Ledger, discussions, and Director/Actor reasoning modules are never projected into a Creator request. The canonical storybook read returns normalized JSON and its content revision; the schema tool returns the exact current v5 JSON Schema.

#### Token effect

The model reads only the files it requests. Managed Story supporting files remain line-windowed and bounded to 2 MiB. Local tools use the Session permission preset: read-only forbids local mutations, workspace-write confines mutations to the selected `cwd` (with one-shot escalation available after a denial), and explicitly confirmed Full access permits the available local tools to mutate other local paths. Storybook saves return a short validation result instead of echoing the complete document back into context; the model already supplied that document as tool input.

#### KV Cache effect

The creation persona, workspace policy, and tool schemas remain stable across turns. File contents enter context only through explicit reads, so editing one asset does not rewrite an unrelated fixed prompt prefix. Every durable control Session in the fixed Creation workspace represents one independent new-storybook task and retains that task's discussion and tool outcomes. `storybook_publish` atomically ends a managed Storybook task, while `creator_complete` verifies and ends an explicitly external-artifact-only task. A prose-only stop receives one bounded corrective step; a second omission fails with `CREATOR_DID_NOT_COMPLETE` instead of being recorded as successful work.

## Known Limitations and Deferred Work

- Dispatch remains synchronous to each tool or player control request; there is no independent scheduler for narrative clocks or future intentions.
- Host automation establishes that an accepted Actor speech or action attempt occurred, but does not infer an action's success or apply its consequences to world facts. Rich deterministic consequence resolution remains deferred.
- Review backlog, pinned originals, and active notes can exceed the recent minima. Provider capacity errors stop the request without automatic truncation; the player must review or explicitly archive content. Provenance and revision checks do not verify semantic completeness.
- A missing live scene still retains accepted events in the Plot Ledger, but cannot receive the optional public scene projection until that Session is live.
- The package is private and experimental and is mounted by the Storyweaver roleplaying profile.
- Managed Story assets intentionally support only UTF-8 `.json`, `.md`, `.txt`, `.yaml`, and `.yml`. The separate authorized local workspace supports general text and image reads, text edits, discovery, and a local platform shell under the selected permission preset. No dedicated network or delegation tools are mounted, and Creator authority never includes another Story, Director orchestration, or Actor tools.
