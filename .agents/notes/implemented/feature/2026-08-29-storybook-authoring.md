# Agent Note: Revisioned storybook authoring

Status: implemented

English | [中文](2026-08-29-storybook-authoring.zh.md)

## Problem

Storyweaver loaded `world/storybook.json` as Director and Actor context, but the browser could only inspect projections derived from that file. Authors had to edit managed files outside the product, and the Director loader and browser projection maintained separate validation rules. A browser write also needed to preserve private character definitions without exposing Host paths or allowing story content to replace the fixed Director responsibility policy.

## Decision

`dsh-story` owns the strict `schemaVersion: 4` storybook schema. The allowed top-level sections are identity, title, setting, premise, world truth, characters, beats, supplemental Director rules, structured `directorGuidance`, and one `protagonistActorId`. Character definitions contain stable Actor identity, public persona, display state, capabilities, private context, and structured `actingGuidance`. A non-empty cast must identify exactly one existing Actor as the protagonist; this is a narrative-continuity anchor for the Director, not an embodiment restriction on the player. Unknown top-level, character, or guidance fields fail validation, so a storybook cannot add a `systemPrompt`, tool definition, or another authority extension.

The Director loader, character-state projection, and authoring Remote all parse through the same schema. Director guidance enters only Director context after the fixed policy. Acting guidance enters only its owning Actor's private snapshot. Neither can authorize persistent-character dialogue or action, replace tool protocol, expose the Director Outline, reveal world truth, or copy another Actor's private data.

Story Controller exposes complete canonical JSON without physical paths. Every read returns a SHA-256 content revision that distinguishes an absent file from an identical persisted document. A save supplies that exact revision, parses the complete replacement, serializes writes per Story, and atomically replaces `world/storybook.json`. Invalid, oversized, and stale writes fail without replacing the durable file.

The roleplaying Client keeps an emphasized Storybook Studio beside the player-intent dock, which remains mounted while a new Story uses the blank-scene Hero layout. Its viewport-fixed panel stays above the composer on desktop and uses the compact-screen workspace layout on narrow viewports. The default editor projects the canonical document into basic metadata, world data, Director guidance, supplemental rules, and per-Actor definitions. Character cards mark the protagonist and allow the author to move that designation; removing or renaming a character preserves a valid single selection. Structured guidance has dedicated controls, default restoration, one-step undo, a before-and-after section diff, and a labeled quick-paste parser; complete-document JSON remains an advanced mode. Canonical Storybook JSON and individual Actor JSON can be imported or exported, and draft export serializes the currently edited complete document. Imports remain unsaved drafts until an ordinary exact-revision save succeeds. A stale save retains the draft and exposes an explicit latest-version reload. A successful save also synchronizes the Story aggregate title and premise so sidebar navigation describes the edited document. The context inspector requests Host-filtered Director or Actor sections and displays source, permission, visibility, and inclusion reason. This Client projection does not define another durable schema: Host validation remains authoritative.

## Alternatives considered

**A browser form with an independent Client schema.** This would improve field-level usability immediately but duplicate durable validation and risk dropping flexible private context. The first surface edits the complete canonical document; specialized forms can project the same Remote value later.

**A free-form storybook that accepts arbitrary top-level keys.** This would preserve maximum author flexibility but let story content masquerade as system policy or tool configuration. Strict named sections keep creative data editable while reserving authority to Host composition.

**Blind last-write-wins saves.** This would be simpler but one browser tab could silently overwrite another. Exact revisions make conflicts explicit without putting filesystem metadata on the wire.

**Free-form prompt replacement.** A single text area would be easier to paste into, but it would blur creative preferences with immutable authority and make per-Actor isolation difficult to inspect. Named guidance fields preserve useful authoring freedom while strict schemas reject policy-shaped additions.

## Consequences

Authors can edit, exchange, inspect, and restore the world bible, Director guidance, protagonist anchor, and Actor-scoped performance guidance inside Storyweaver. The saved document is the same input consumed by Director and Actor provisioning, while the context preview proves filtering without exposing Host paths. Immutable responsibility prompts and tool schemas remain Host-owned, and the player remains free to embody any cast member regardless of protagonist selection. This editor continues to exchange one storybook JSON document or one Actor definition; a later versioned Story Package surface separately bundles the aggregate, storybook, Session logs, and portable world files.
