# Agent Note: Actor journey and audience-scoped long memory

Status: implemented

English | [中文](2026-08-31-actor-journey-and-audience-memory.zh.md)

## Problem

Actor emotions, beliefs, relationships, memories, goals, and intentions described current state but did not preserve the few experiences that changed how a character understands themself or later choices. Repeated psyche updates were therefore easy to mistake for character development. Story-level long memory also used one summary for every audience, which could expose Director continuity to Actors or force a single supposedly objective recollection onto characters with different knowledge.

## Decision

Fixed model tools, source-backed ongoing matters, and explicit memory replacement are governed by [source continuity and fixed tools](../architecture/2026-09-04-roleplay-source-continuity-and-fixed-tools.md).

An Actor owns a revisioned `actor/turning-point` event in its private Session. A turning point records a material trigger, the Actor's subjective interpretation, significance, status, concrete before/after changes, and references to the private state events that support it. Autonomous turns can submit turning points only inside the single `npc_commit_turn` transaction and only alongside a material belief, relationship, goal, or memory change. The model contract requires an empty list for routine moods and responses, and the Host rejects an exact repeat of an existing non-rejected change before writing the transaction.

Turning points begin as tentative model-authored interpretations. PlayerAuthority can replace the complete value over an exact revision and mark it integrated, reversed, or rejected. Rejected entries remain auditable but are excluded from model context. The model receives at most six relevant non-rejected entries, ranked by significance, status, and overlap with active goals, relationships, memories, and recent behavior. The god-view character panel presents the full timeline and its editor; ordinary scene speech and action remain separate conversation events.

Story long memory uses three explicit audience layers: `directorSummary`, `publicSummary`, and `actorMemories`. The Director receives only the Director summary. An Actor receives only the public summary and the entry addressed to that Actor. There is no fallback from an empty Actor-facing layer to Director content. Scene and arc memories remain proposals until player review, and the Director guidance asks for a proposal only at a meaningful scene or arc boundary.

The persisted Story memory shape is replaced directly. Older `summary` and `actorNotes` fields are not accepted and no compatibility reader is retained.

## Alternatives considered

**Treat every emotion or belief update as a journey entry.** This reproduces the repetitive psyche feed and makes ordinary reactions indistinguishable from durable character development.

**Generate a separate post-turn biography summary.** A second model call adds latency, can reinterpret private state without the Actor's own decision, and breaks the one-plan/one-transaction turn contract.

**Keep one global story summary and redact it heuristically.** Redaction cannot reconstruct what each Actor actually perceived and remembered; explicit audience-owned fields make absence and privacy enforceable.

**Delete rejected turning points.** Deletion would hide player correction and make replay unable to explain why a former interpretation stopped influencing the Actor.

## Consequences

Character development becomes sparse, subjective, reviewable, and durable instead of a renamed stream of per-turn state. Player edits use optimistic revisions and immediately affect the next Actor context. Context cost is bounded, while older entries remain available in the private audit log and player timeline.

The new Actor event expands the persistence vocabulary, and the new Story memory object is intentionally incompatible with the previous pre-release shape. Turning-point generation still depends on model judgment, so the Host enforces transaction coupling and exact duplicate rejection while prompts enforce the broader semantic threshold.
