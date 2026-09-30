# Agent Note: Independent Story runs and roleplaying deletion

Status: implemented

English | [中文](2026-08-31-independent-story-runs-and-deletion.zh.md)

## Problem

The sidebar presented one Story as a storybook with nested windows, but its plus action created another scene Session inside the same Story aggregate. Those windows therefore shared world, memory, Director Outline, Plot Ledger, discussions, and Actors. “Start a new story” continued an existing runtime. The archive affordance also contradicted roleplaying language: players expected one playthrough to disappear, while the backend only wrote a restorable tombstone.

## Decision

The supported independent authoring and rewrite wiring is described by the [authoring recovery decision](2026-09-08-independent-authoring-recovery.md). This note retains the remaining workflow and ownership rationale.

An authored setting and a runtime Story are distinct concepts. Every Story projection carries a stable `templateId`; the browser groups separate StoryIds by that identity and orders storybooks and runs by immutable creation time. Selecting a Session changes only the current marker even though runtime activity updates recency metadata. `story/createFromTemplate` reads the canonical storybook identity, creates a new Story with empty runtime state, copies only `world` and `assets`, and then lets the client create the first scene Session. `.runtime`, exports, prior Sessions, world revisions, memory, planning, discussions, and Actor registrations never cross this boundary. Actor identity is unique within one Story rather than across the Host process, so separate runs may keep different live Sessions for the same authored `actorId`; orchestration resolves each Actor through its Story-owned Session registration.

Roleplaying deletion calls `story/delete`, not archive. When another record still represents the same storybook, the Story registry durably deletes the selected run and removes every Session ownership index. When it is the final run, the record becomes `templateOnly`: authored `world` and `assets` remain, while Sessions and all runtime projections reset to their empty state. The UI keeps that empty storybook visible with an explicit start action. Deleting the entire storybook still stages every managed aggregate in product trash. Both destructive actions use trash icons, explicit language, and confirmation.

## Alternatives considered

**Reset the existing Story in place.** This would erase state still owned by another open window and could not provide independent histories.

**Fork the current Session.** A fork intentionally inherits conversation history and would reproduce the exact continuation behavior the plus action must avoid.

**Change only labels and icons.** This would leave shared runtime state and archive tombstones authoritative, so the product promise would remain false.

## Consequences

Each plus action mints a new StoryId from the same authored baseline, while every run evolves independently and remains grouped under one storybook in the sidebar. A live Actor in one run cannot block a same-id Actor in another run. Deleting a run removes that runtime from the sidebar; deleting the final run leaves an empty storybook anchor instead of making its authored setting disappear. The legacy archive RPC remains for compatibility but is not used by the roleplaying surface.
