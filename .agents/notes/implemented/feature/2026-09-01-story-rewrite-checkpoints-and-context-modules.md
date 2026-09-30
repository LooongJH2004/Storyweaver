# Agent Note: Story rewrite checkpoints and authored context modules

Status: implemented

English | [中文](2026-09-01-story-rewrite-checkpoints-and-context-modules.zh.md)

## Problem

Same-session rewrite replaced the visible Session surface but left Story-owned world, Plot Ledger, Director Outline, memory, discussions, and persistent Actor histories unchanged. A rewritten Director therefore still reasoned from the superseded turn. Context recipes were also a closed list of runtime sections, so Director and Actor thinking-style guidance could not be independently authored and players could not add their own context modules.

## Decision

`agent/history-rewrite` is a scoped serial preparation boundary that runs before replacement input is appended. Storyweaver records a pre-turn checkpoint containing the authoritative Story runtime and each active Actor Session's visible boundary. Checkpoint retention is a deployment-owned bounded policy, configured by `storyTurnCheckpointLimit` with a default of 128 entries per Story. Rewriting a checkpointed player turn first shadows every later Actor surface node with an explicit rewind notice, then restores the Story snapshot. The first player turn from before checkpoint support can return to its deterministic empty runtime baseline; any other turn without a retained historical snapshot is rejected before replacement admission rather than continuing from mismatched current state. External domains that do not participate remain unchanged.

Chat exposes the rewrite pencil only on the latest durable text-only user message. Clicking it replaces that exact bubble with a controlled inline editor; Cancel and Escape never stage a rewrite, while Send submits directly through the Session without borrowing or overwriting the global composer draft and its attachments. A rejected inline admission clears its exact staged rewrite target so a later ordinary prompt cannot accidentally consume stale rewrite intent.

DeepSeek thinking requests explicitly pass `reasoning_content` back for every Assistant history message. Real reasoning blocks are concatenated verbatim; empty-reasoning tool turns and authored Assistant-role context use an empty string so an omitted field cannot make the entire rerun fail with a 400 response. Ordinary Assistant messages still do not receive a fabricated field when thinking is disabled.

Director Outline tool descriptions now expose semantic constraints that cannot be represented by the supported JSON-schema subset: beat priority is limited to `1..5`, and planted or later foreshadows require evidence references. Outline parsing and final cross-field validation preserve Zod issue paths in tool errors, so an invalid call reports the exact field instead of the generic "patch fields are invalid" message that encouraged blind retries.

Context recipes now distinguish fixed built-in ids from stable `custom:*` ids. Director and Actor recipes include editable default modules for analysis-style and immersive first-person reasoning guidance respectively. Authored sections persist a title and full content, may use any supported message role, participate in ordering and enablement, and flow through the same renderer used by effective preview and model requests. The workbench supports add, edit, reorder, enable, role selection, and custom-module deletion, with inline required-field validation.

Director request partitioning treats policy, settings, Storybook material, approved memory, and the low-frequency Director Outline as cacheable leading `system` context. World, Plot Ledger, discussion, Brief, Actor state, and the first authored non-system section start the post-history tail. An approved-memory or Outline revision invalidates the following cache lineage deliberately; ordinary high-frequency world updates do not rewrite the larger leading block. Known player control envelopes are split during pre-step admission: durable history retains a compact typed value, while the interpretation protocol enters only that turn's request snapshot before the saved dynamic tail. Unknown bracketed prose is never retyped implicitly.

Storyweaver now pairs that physical partition with the logged [request-history projection](../architecture/2026-09-02-request-history-projection.md). Each new Director or Actor turn begins a request series whose history contains only the current turn transaction; same-turn reasoning, tool calls, results, and corrections remain protocol-complete, while later turns recover continuity from bounded World, Ledger, Brief, discussion, state, and approved-memory projections instead of replaying old model traces.

## Alternatives considered

**Continue treating rewrite as a UI-only Session operation.** Rejected because the model would keep reading superseded authoritative Story state.

**Reconstruct Story state by replaying old chat text.** Rejected because tool mutations and private Actor state are structured domain data, not recoverable faithfully from transcript prose.

**Hard-code the two thinking prompts outside the recipe.** Rejected because users could neither inspect nor customize them, and preview would diverge from actual request composition.

**Persist complete player-control boilerplate as ordinary history.** Rejected because repeated protocol text consumes context and can be mistaken for a lasting story fact; discarding the entire message was also rejected because a concrete desired direction remains useful continuity data.

## Consequences

New player turns are genuinely rewindable across Session presentation, Story authority, and Actor-visible private history. A pre-feature first turn can also return deterministically to the initial runtime; a later unavailable checkpoint fails closed, and the player can still choose a retained turn or start an ordinary new turn. DeepSeek thinking-mode reruns no longer fail because an empty reasoning turn or Assistant context module omitted the field. Invalid Director Outline updates produce actionable field-level feedback rather than repeated speculative retries. Typed control history preserves player intent without retaining one-turn interpretation rules; request-history projection prevents old reasoning and tool traces from becoming accidental continuity, and low-frequency Director context remains eligible for provider prefix caching until its owning revision changes. External file changes and tools outside rollback-aware domains are still not undone. Existing current-format Story records include the two authored modules without a legacy-format compatibility branch. Focused host tests and TypeScript builds verify rewrite, bounded checkpoint retention, context partitioning, and directive parsing.
