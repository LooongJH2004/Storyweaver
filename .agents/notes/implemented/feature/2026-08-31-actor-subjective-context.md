# Agent Note: Actor subjective context without truth labels

Status: implemented

English | [中文](2026-08-31-actor-subjective-context.zh.md)

## Problem

The storybook previously stored initial Actor cognition under `knows`, `doesNotKnow`, `secrets`, and `falseMemory`. A statement such as “you do not know that X is true” still discloses X to the model. Marking a memory as false likewise gives the Actor model Director-level truth awareness and asks it to simulate ignorance.

## Decision

Storybook schema version 4 replaces those epistemic truth categories with one `privateContext.perspective` list. Each item is written as something the Actor presently experiences, remembers, or believes, without a truth-status label. Facts unavailable to an Actor are omitted completely and remain only in Director-visible world truth. Initial emotions, beliefs, relationships, core memories, goals, and intentions remain structured because they describe actionable private state rather than whether a world claim is objectively true.

The Actor policy gives one general instruction: supplied perceptions, memories, and judgments may be partial, outdated, or mistaken. It does not identify which item is unreliable. Actual runtime context and context preview share `renderStorybookActorPrivateContext`, which renders perspective as natural bullet text and never serializes the old metadata keys.

The version-3 storybook shape is intentionally rejected. The Moonshadow Ledger fixture and active local storybook are rewritten directly; no migration or compatibility reader is added.

## Consequences

Information isolation becomes a context-construction guarantee rather than roleplay-by-denial. Actors can sincerely inhabit mistaken beliefs without receiving the correction in another field. Authors must place hidden truth only in Director-owned data and express an Actor's starting viewpoint from inside that Actor's experience.
