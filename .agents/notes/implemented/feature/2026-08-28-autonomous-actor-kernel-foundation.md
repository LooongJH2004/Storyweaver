# Agent Note: Autonomous Actor kernel foundation

Status: implemented

English | [中文](2026-08-28-autonomous-actor-kernel-foundation.zh.md)

## Problem

The harness could orchestrate context and isolate agents, but those mechanisms alone did not make a roleplaying NPC an autonomous subject. A director could ask a generic agent to write dialogue, yet the character did not own durable choices such as speaking, acting, reflecting, remembering, forgetting, forming a goal, or intending to act later. Treating assistant prose as all of those things also made it impossible to distinguish private thought from world-visible behavior.

The player has a different authority problem. In this product concept the player is not necessarily one character. The player observes with a god view, chooses story direction, changes the world, and may temporarily replace any character's speech or action. Folding that authority into an NPC identity would make a player override look like the NPC's autonomous decision.

## Decision

Fixed model tools, source-backed ongoing matters, and explicit memory replacement are governed by [source continuity and fixed tools](../architecture/2026-09-04-roleplay-source-continuity-and-fixed-tools.md).

The experimental foundation consists of two private packages:

- `@deepseek-ai/dsh-experimental-actor` owns Actor identity, event vocabulary, replay projection, memory, goals, intentions, world-facing intents, turn closure, and the trusted PlayerAuthority host API.
- `@deepseek-ai/dsh-experimental-tool-actor` installs the fixed `npc_commit_turn` schema with execution-time capability checks and a dynamic self-state policy in each exact Actor Agent scope.

An Actor is one exact live dsh Agent bound to one immutable `ActorDescriptor`. Its Session must start without inherited fork history, and binding happens before its first conversation turn. `ActorId` is stable and independent from both display name and Session id. Actor state lives in that Actor's own append-only Session log; there is no director-owned mutable character object.

Assistant text has no fictional-world authority. `actor_speak` and `actor_act` create the only Actor-authored world-facing intents in this slice. `actor_reflect` records explicit fictional inner activity rather than hidden model reasoning. Core memory is voluntary: the Actor calls remember, recall, or forget; forgetting appends a tombstone and ends the turn so the next request is rebuilt without that memory. When configured memory capacity is full, remember first appends `core-memory-capacity` tombstones for enough least-important active memories to restore the bound, choosing the oldest among equal priorities, and then records the new memory instead of failing the Actor turn. Goals are revisioned snapshots, future intentions use a minimal world-time trigger, and `actor_yield` explicitly closes the turn. Text-only completion is recorded as `implicit-silence`.

PlayerAuthority is separate from Actor capability. It records story direction and world intervention in a caller-selected control Session. It may also speak or act through any bound Actor regardless of that Actor's model-facing capability list. Embodiment appends a player-intervention event before a matching expression or action event, and the latter permanently carries `origin: 'player'` plus the intervention id. A god-view inspection returns thoughts and forgotten-memory tombstones that Actor model context excludes.

## Event and context boundaries

All Actor events are log-only. The strict fold validates descriptor ownership, stable and unique ids, one-way memory tombstones, contiguous goal abandonment, embodied-player provenance, and one Actor closure per generic Agent turn. The package invariant replays each candidate event against the committed Session prefix before append.

The tool policy renders persona, active memories, active goals, scheduled intentions, and a bounded recent expression/action window. It excludes thoughts and forgotten memories. The normal request-header event records the assembled model-visible prompt; tool results are returned only after the domain event append. This preserves the repository rule that model-visible state has a logged source.

Actor scopes use native tool presentation. By default they hide inherited global tools and expose `npc_commit_turn`; the Story integration adds authorized read-only recall. The submission tool closes the turn and validates descriptor-granted capabilities at execution. This makes the Actor API the behavioral boundary while leaving OS/process sandboxing to existing harness layers.

## Alternatives considered

**Reuse continuable subagents as NPCs.** Continuable subagents solve delegated work and inherited task context, not fictional identity. Their tool surface, parent authority, and optional fork history make them the wrong owner for an information-isolated character whose decisions persist across scenes.

**Keep one director Agent and generate every NPC line from it.** This preserves central narrative control but leaves characters as outputs rather than agents. Memory, forgetting, goals, and future action remain director-authored, so the design cannot produce genuine character-level autonomy or information asymmetry.

**Treat assistant prose as speech, action, and inner thought simultaneously.** This has the smallest API but no reliable world boundary. A private draft can accidentally become dialogue, and a narrated action can claim success without an environment resolver. Explicit tools give each kind of behavior a typed, auditable meaning.

**Model the player as another Actor.** This would simplify routing, but it incorrectly limits the player to one body and one information boundary. It also obscures whether an NPC chose an act or the player replaced that role. PlayerAuthority therefore remains a separate trusted host capability.

**Physically erase forgotten events.** Erasure would make the current Actor context smaller, but it would destroy replay, debugging, and god-view audit. A tombstone removes the memory from active recall and model context while retaining what happened.

## Consequences

The foundation now provides a compilable domain seam for character autonomy and a distinct player-god authority. It creates real information differences: each Actor has a separate fresh Session, only active self-selected memory re-enters its model context, capacity pressure remains auditable without aborting a turn, and player-origin behavior is not misattributed.

The first slice deliberately stops at intent. Speech has no audience-delivery adapter, action has no outcome resolver, world interventions have no distribution projection, and scheduled intentions have no clock that wakes an Actor. Recall is simple text/tag matching, and dynamic state has no checkpoint or context-budget compaction. Those layers can now evolve as plugins against stable event provenance instead of being hidden inside an agent loop or monolithic director prompt.

Real AgentLoop composition tests cover capability-filtered schemas, logged speech plus explicit yield, and text-only implicit silence. Domain tests cover memory tombstones, private inspection, player provenance, identity collision, and replay relation failures.
