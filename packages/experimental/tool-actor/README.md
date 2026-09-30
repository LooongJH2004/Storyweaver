---
description: "Scoped tools that turn experimental Actor domain operations into autonomous model behavior."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-tool-actor

English | [中文](README.zh.md)

## Summary

`dsh-experimental-tool-actor` gives each bound NPC a capability-filtered, roleplaying-native model surface. The model supplies character meaning and prose; the host owns ids, retrieval, matching, persistence, and visibility. Ordinary assistant text is private scratch output, not dialogue or action.

`npc_commit_turn.state_changes` creates or updates the Actor’s own subjective fields in the same atomic commit as its ordered behavior. Existing fields use their stable IDs and exact revisions. Models cannot change an existing definition, write another Actor’s state, or settle objective injury. Every new definition needs a description and narrative reason; type and range failures reject the complete commit.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

Mount it after `@deepseek-ai/dsh-experimental-actor`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import * as ToolActor from '@deepseek-ai/dsh-experimental-tool-actor'

declare const ctx: Context

await ctx.plugin(ToolActor, { isolateGlobalTools: true })
```

`isolateGlobalTools` defaults to `true` and hides inherited global tools. The model-facing tool set contains only `npc_commit_turn`; capabilities constrain its submitted fields at execution. The Story Director plugin separately installs the fixed read-only `roleplay_recall` tool for each Actor.

| Capability | Submission fields |
|---|---|
| `speak` / `act` | ordered speech / action `behavior` |
| `reflect` | thoughts, emotions, beliefs, relationships |
| `memory` | memories, released memories |
| `goals` / `schedule` | goals / intentions |

Relevant memory and at most six selected turning points enter private context. The fixed optional `context_update` field in `npc_commit_turn` accepts up to 16 source-processing units by default (`maxContextUpdateUnits`). Each proposes note changes, original references, and a represented/archive decision. `$behavior:N` refers to accepted behavior in this submission; other references must already be visible. Pending notes never become effective memory or permit original retirement without player approval.

The autonomous model calls `npc_commit_turn` exactly once per turn. The transaction is a delta: a routine reaction normally sends only ordered speech/action and posture, while unchanged private state and absent turning points are omitted. Its `behavior` schema is a discriminated choice between an explicit speech shape and an explicit action shape, so every item must carry `kind` plus the corresponding required `text` or `attempt`. The Host commits it sequentially and closes the turn without misclassifying shared Actor state as concurrency-safe. A turning point must accompany a material belief, relationship, goal, or memory change, and an exact repeated change is rejected before the transaction writes. Descriptive action intent is accepted as non-authoritative model guidance and ignored by persistence; only the canonical speech-intent vocabulary is stored. Malformed JSON receives an actionable correction result so the model can preserve its response and retry only the serialization. Deliberate silence is an explicit `npc_commit_turn` with empty behavior and a silent posture. If the model emits ordinary text and stops, the package injects one bounded correction that tells it not to restart or rewrite its completed reasoning and to submit the transaction immediately; a second omission remains unclosed and becomes a retryable Director Run failure. Ordinary assistant text never becomes fictional speech.

On a public group-discussion floor, `discussion.action=speak` completes only the Actor's current contribution and keeps the exchange moving. `conclude` requests an end to the entire discussion and is reserved for a concrete shared outcome, an irreducible deadlock, or a point where no useful reply remains; finishing one's own answer is not sufficient. This distinction preserves autonomous endings without turning every completed utterance into a premature group summary.

<a id="understand-the-implementation"></a>
## Understand the implementation

Tools are registered through the exact Actor Agent's scoped context when `actor/bound` fires and are removed on unbind/disposal. The adapter delegates every operation to `ctx.actors`; it does not duplicate identity, memory, provenance, or transition rules.

The policy states that a PlayerAuthority intervention may operate through the role but remains player-origin. This keeps roleplaying continuity without teaching the Actor that it autonomously chose the player's override.

<a id="dev-note"></a>
## Dev Note

The owning decisions are [Autonomous Actor kernel foundation](../../../.agents/notes/implemented/feature/2026-08-28-autonomous-actor-kernel-foundation.md) and [Actor journey and audience-scoped long memory](../../../.agents/notes/implemented/feature/2026-08-31-actor-journey-and-audience-memory.md).

<a id="model-experience"></a>
## Model Experience

### Actor policy and capability tools

#### What the model sees

The model sees a fixed behavioral contract and one stable `npc_commit_turn` schema for every capability grant and discussion phase. Its fields express sparse private-state changes and ordered behavior. The Story integration supplies visible source and matter ids for continuity and authorized recall; other private persistence ids remain hidden. Ordinary assistant prose has no world authority.

#### Token effect

The policy contributes the current persona, active memories, selected character journey, goals, intentions, bounded recent activity, and the `npc_commit_turn` schema. It asks the model to plan the whole turn once and submit once, omitting `turning_points` unless the scene creates a durable change. A successful transaction returns compact JSON after its events enter the Actor Session log.

#### KV Cache effect

Tool schemas stay unchanged between private preparation and public speech. Story integration uses per-Actor context baselines plus exact appended updates, with periodic baseline rebuilds. Capability and phase checks occur on execution; they do not add or remove tools.

## Known Limitations and Deferred Work

- The package offers Actor tools only; it does not deliver world observations or other Actors' speech.
- World action outcomes and audience perception require a future environment adapter.
- Scheduled intentions require a future wake scheduler.
- Dynamic state still changes the volatile request suffix; no semantic context-budget policy is included yet.
- Global-tool isolation is process-local composition, not an OS or network sandbox.
- The package is private and experimental and is mounted by the Storyweaver roleplaying profile.
