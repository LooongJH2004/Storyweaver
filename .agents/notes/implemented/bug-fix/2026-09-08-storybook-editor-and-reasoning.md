# Agent Note: storybook editor and reasoning instructions

Status: implemented

English | [中文](2026-09-08-storybook-editor-and-reasoning.zh.md)

## Problem

The independent UI exposed a long partial book form beside duplicate library operations. Native button colors differed from narrative panels. Fresh runs hid author tools, and the context recipe omitted the historical Actor immersion and Director brief-reasoning instructions. Restoring general settings did not restore those specific modules.

## Decision

Separate the book library from the selected editor. The editor has one save and publication bar, section navigation, and a selected character with profile, private cognition, state and style tabs. Typed controls cover initial memories, goals, intentions, knowledge, state ownership and audiences; arbitrary world objects remain editable without replacing unrelated properties. Book edits change the draft, while instance author tools change only the selected run. All views use the shared theme palette.

Store optional authored recipes in immutable book versions and copy them when creating an instance. Default recipes end with editable Actor immersion and Director brief-reasoning modules. The wording follows the [historical roleplay instructions](https://github.com/victorchen96/deepseek_v4_rolepaly_instruct/) and uses the current tool protocol. These modules retain their message role and exact content instead of receiving the custom-reference wrapper. Host permissions and tool validation remain authoritative.

An existing recipe without these modules remains unchanged on reads. Its editor offers explicit restoration followed by revision-checked saving. Authors can edit, reorder or disable the instructions. Reasoning-mode instructions configure model behavior; they do not guarantee a provider's internal reasoning format or expose its private reasoning as dialogue.

New runs show character, state, style, context, model and memory controls immediately. AI creation exposes baseline editing and creation from a published version. An unpublished book displays a disabled start action with its publication prerequisite.

## Alternatives considered

**Apply CSS alone.** This leaves missing fields and overlapping ownership unresolved.

**Insert instructions whenever an old recipe is read.** This silently changes saved behavior and prevents authors from intentionally omitting a module. Explicit restoration preserves persisted decisions.

## Consequences

The [browser scenario](../../../../apps/web/tests/authoring-recovery.e2e.ts) edits and reloads a book, publishes it, creates a fresh run, checks state visibility, and records the final Actor request through a mock model adapter. Its adjacent request snapshot pins the reasoning message. The scenario also covers native creation, local materials, portable resources, rewrite and removal. Domain tests verify missing-module reads remain unchanged and explicit restoration and disabling affect context. Light and dark screenshots verify the editor. The [recipe-role correction](2026-09-08-recipe-roles-and-turn-reading.md) owns the exact Director analysis marker, default message roles and bounded real-model observations.
