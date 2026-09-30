# Agent Note: Outline-first Director advancement

Status: implemented

English | [中文](2026-08-31-outline-first-director-advancement.zh.md)

## Problem

The canonical Moonshadow Ledger fixture included a complete Director Outline sample, and development imports treated that sample as initial runtime state. A new story therefore appeared to have long-range plans authored before its Director had observed or advanced the story. The Director policy asked the model to update an empty Outline before committing a Brief, but the Host still accepted a Brief when the model skipped that instruction.

## Decision

A new Story starts with the domain's revision-zero empty Director Outline. Storybook data supplies authored world, character, and scene material; it does not pre-author runtime planning. The Moonshadow Ledger `director-outline.json` remains a structural acceptance fixture and is not part of the default story import.

`director_commit_brief` checks the applied Outline content before provisioning Actors or mutating the Plot Ledger. When the premise and every planning section are empty, it rejects the call and requires `director_update_outline` to create the first useful long-range draft. The fixed Director policy and tool description state the same ordering. If an empty Outline uses player review mode, the queued draft must be accepted before a Brief can proceed.

## Alternatives considered

**Import a player-authored seed Outline.** This makes fixture expectations look like story events and prevents the Director from producing a plan responsive to the actual first advancement.

**Rely only on the Director prompt.** A model can skip advisory ordering, leaving the first Brief committed without a long-range plan.

**Generate an Outline implicitly while committing a Brief.** This conflates two independently revisioned records and prevents the player from reviewing or locking long-range planning separately.

## Consequences

The Director Outline panel is empty at R0 for a fresh story. On first advancement, the Director must create an explicit Outline revision before it can commit the per-turn Brief and dispatch Actors. Storybook fixtures can still validate rich Outline structures without changing initial product state.
