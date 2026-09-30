# Agent Note: Logged request-history projection separates replay from model context

Status: implemented

English | [中文](2026-09-02-request-history-projection.zh.md)

## Problem

Long-lived Storyweaver Sessions serve two different consumers. The product needs the complete append-only surface for replay, rewrites, audit, and the player-facing transcript, while a model request needs only the current interaction transaction plus authoritative continuity. Sending the whole surface to every Director and Actor request repeatedly carried old reasoning, tool calls, tool errors, and prose that had already been projected into World, Plot Ledger, memory, or discussion state. The duplicate carriers reduced provider KV-cache reuse and made token pressure grow with UI history rather than with information the model still needed.

Trimming the Session surface itself was not acceptable: it would remove player-visible history and weaken exact rewrites. Provider-only filtering was also not acceptable because the session log could no longer reconstruct what the model received.

## Decision

The Agent request pipeline exposes the `agent/request-history` waterfall after prefix context assembly. Its input is the ordinary `Session.deriveMessages()` result. Returning the same array keeps ordinary behavior; returning any other array records that exact replacement as `EpochHeader.historyMessages`. Absence means “derive from the current surface,” while an explicit empty array means “send no durable surface history.” Request reconstruction and the loop invariant use the logged projection, so every request remains a pure function of the Session log.

Storyweaver starts a new request series for the first step of every Director or Actor turn and projects only the current turn's live surface messages. Within one turn, assistant reasoning, tool calls, matching tool results, and Host correction messages remain together so DeepSeek tool transactions and retries are protocol-complete. At the next wake, those raw messages remain available to replay and UI but no longer enter the model request. Durable continuity comes from typed Story state instead of old model transcripts.

Storyweaver also assigns one canonical carrier to high-volume continuity:

- Director World context contains the current scene, facts, and at most 64 recent authoritative events, but never the Actor perception-delivery ledger. Plot Ledger context omits settled source-event copies and transport identities, retaining the current Brief and compact Run status.
- Actor World context contains the current physical scene and at most 32 subjective delivered perceptions. The latest Director Brief contributes only that Actor's current perceptions not already present in World context and its uncertainties. Duplicate prior-speech and accepted-event lists are removed; bounded recent self-speech or self-actions remain only when the current World and discussion projections do not already carry them.
- Active discussion context keeps at most 12 recent public turns verbatim plus the latest older non-empty contribution from each participant. An Actor receives only its own private discussion intent; the Director may receive all intents. Actor speech already represented by this active discussion is omitted from the parallel World-event tail.
- Approved long-story memory remains complete. It has an explicit review and supersession lifecycle, so truncating it by age would discard semantic authority rather than duplicate transport history.

The three bounds are Cordis plugin config keys (`directorRecentEventLimit`, `actorRecentPerceptionLimit`, and `discussionRecentTurnLimit`) with shipped values `64`, `32`, and `12`. The token meter prices header-owned projected history exactly once. It still reports physical `surfaceTokens` and nodes for diagnostics, while `totalTokens` and `contextBreakdown.messageTokens` follow the actual request history.

## Alternatives considered

- **Replace or compact the Session surface at every turn.** Rejected because transcript, audit, reroll, and checkpoint consumers need the complete surface independently of model context.
- **Filter messages only inside a provider adapter.** Rejected because the dispatched request would no longer be reconstructable from durable state and different adapters could observe different histories.
- **Keep full history and rely only on prefix ordering.** Rejected because ordering improves cache locality but does not stop old reasoning, tool JSON, and duplicate semantic carriers from being resent.
- **Summarize every old discussion or turn with another model call.** Rejected for the default path because it adds latency, cost, nondeterminism, and a second authority. Deterministic typed projections already contain the required continuity.
- **Create a fresh Session for every Director or Actor wake.** Rejected because it fragments ownership, replay, cancellation, retries, and the player-facing attempt history without providing more information than a logged request projection.

## Consequences

Storyweaver request size now follows bounded authoritative state plus the current transaction instead of total transcript age. Stable policy, identity, Storybook, memory, and Outline sections remain at the front of the request, so ordinary world updates and new turns preserve a longer byte-identical cache prefix. Same-turn tool correction still sees the exact failed call and result; cross-turn reasoning and tool traces do not become narrative memory accidentally.

The full Session log grows independently and remains the source for UI and audit. Because each changing projection is a full request-header snapshot, a many-step turn repeats its bounded current-turn history in header events; this is an intentional storage cost for self-contained reconstruction. Approved memory can still exceed a provider context window until its reviewed semantic supersession workflow is used or a future memory-specific summarizer is designed.
