# Agent Note: Same-session rewrite and actionable authentication recovery

Status: implemented

English | [中文](2026-08-30-same-session-rewrite-and-auth-recovery.zh.md)

## Problem

The Chat action labelled “Rewind and rewrite” called Session fork, opened the child, and restored the selected text there. That changed Session identity and Story navigation even though the action described editing the current conversation. The Moonshadow Ledger fixture encoded the same incorrect branch semantics. The first same-session implementation also updated only the TypeScript source contract: its generated Typert request codec remained stale and stripped `rewriteBeforeSeq` before Host admission, silently turning every real rewrite into an append. Separately, the roleplaying Turn-error renderer handled only quota failures and reduced an `AUTH` model failure to a generic “request did not complete” card.

## Decision

Rewriting is a same-session prompt admission. The Client arms one `rewriteBeforeSeq` target and restores the original text in the current composer. The intent survives rejected admission and clears only after Host acceptance. The Host accepts it only in queue mode while it can reserve an idle Agent, the inbox is empty, and the target is a human user message on the current model surface.

The accepted user message carries the rewrite boundary in its durable source. On step entry, the agent loop appends that message as a positional replacement from the target through the prior surface tail, citing every shadowed node. The old events remain in the append-only audit log, the replacement becomes the current model history, and no Session or Story ownership is created or changed. Explicit fork remains a separate action.

Chat derives a presentation-safe version group for each replacement. Superseded human input and Assistant answer nodes remain collapsed beneath the replacement bubble in oldest-to-newest order, while hidden tool traces, navigation entries, current-transcript ordering, and model history continue to use only the replacement surface.

The generated Host and remote-client Typert artifacts are part of the transport contract and must be regenerated whenever the request type changes. The browser-delivered `api/remotes` aggregate must then be rebuilt because it embeds those generated schemas. Regression tests parse a real prompt through both the generated strict codec and the final browser bundle, asserting that the rewrite boundary survives each wire boundary.

The roleplaying error renderer now presents `AUTH` as an alert with the recovery path “Settings → Models,” while quota recovery keeps its checkpoint-specific card.

## Alternatives considered

**Continue using a child Session but hide branch navigation.** Rejected because the identity and Story ownership still change even if the UI conceals them.

**Delete or truncate prior events.** Rejected because Session history is append-only and audit/replay must retain the original turn.

**Rewrite only in browser projection state.** Rejected because the next model request would still derive the old history after reconnect or reload.

## Consequences

The same Session log contains both the original audited turn and the replacement turn, but later model requests derive only the replacement surface. Chat makes the replacement user event visible as the newly submitted turn, attaches prior human/answer versions in an explicit collapsed history, and suppresses the rest of the superseded Turn range from transcript, navigation, and legacy presentation projections while retaining its audit Nodes. The Host rejects stale targets, steering attempts, busy Agents, and non-empty queues without clearing the Client retry intent.

This mechanism rewrites model-visible Session history; a domain must still participate explicitly to roll back its own committed state. Storyweaver does so through its pre-turn checkpoints, while unrelated external tools still require their own compensation. Tests cover the generated RPC codec and final browser Remote aggregate, Client retry retention, Host admission, loop surface replacement, incremental and replayed Chat suppression and version grouping, no-fork wiring, the Moonshadow Ledger contract, and actionable `AUTH` rendering.
