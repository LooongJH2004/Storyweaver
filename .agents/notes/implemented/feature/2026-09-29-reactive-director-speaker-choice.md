# Agent Note: Reactive Director speaker choice

Status: implemented

English | [中文](2026-09-29-reactive-director-speaker-choice.zh.md)

## Problem

One Director finish plan can dispatch several actors in order, but it chooses every speaker before hearing the first accepted response. A single-actor plan lets the next choice use that response only on a later player advance. In a quiet multi-character scene, the first approach invites a predetermined round of similar advice; the second can stop an exchange before the addressed person replies.

## Decision

`DirectorRuntime` accepts a configured `reactiveDirectorLimit`. After an accepted single-actor plan and its world-feedback processing, each available continuation opens a separate logged Director attempt against the current revision. Its model-visible purpose asks whether one present AI-controlled person has an immediate reason to answer the committed response. The host permits inspection and a finish selecting at most one actor, or nobody. It rejects scene mutations and discussion advancement in this continuation. Pending world attempts and active discussions keep their existing settlement and floor paths. The Web composition selects one continuation; the service default is zero.

Each continuation has a deterministic child command ID and a saved execution purpose. Retry reuses accepted receipts and does not reinterpret a completed root against later story changes. The existing Director command budget applies to each preparation; the configured continuation count bounds additional model and actor executions. The resulting run view describes the latest completed Director step, as it already does for feedback continuations.

## Alternatives considered

- Always dispatching every present actor keeps one model plan but cannot react to accepted speech and often turns a local exchange into a status round.
- Requiring another player advance after every single response interrupts a reply that depends on the first speaker's actual words.
- An unbounded Director and actor loop can monopolize the player turn and repeat itself without fresh evidence.

## Consequences

Focused runtime tests exercise disabled and enabled continuation, world-feedback and discussion precedence, player control, cancellation and retry. The real Loader composition records the accepted actor reply in the subsequent Director request. A continuation adds a Director model call when it opens; it can still choose nobody. These deterministic checks establish control flow and model-visible context, not literary quality. Archived scene diagnostics and human review remain necessary to judge whether the extra choice reduces repeated advice and preserves character voice.
