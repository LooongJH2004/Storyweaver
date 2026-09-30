# Agent Note: Context synchronization workspace

Status: implemented

English | [中文](2026-09-11-context-sync-workspace.zh.md)

## Problem

Source selectors, save-source buttons, publication forms and copy actions repeat inside context modules. Book draft imports and system defaults sit elsewhere. Players cannot easily identify the configuration being changed, the stories affected, or the difference between following updates and copying a value once.

## Decision

The transfer view supports both directions while keeping book sharing on the left and the story on the right. Reverse transfer selects saved story values and publishes only those modules through the existing fromInstance revision guard. Pending shared or story edits block reverse publication; subscriptions remain unchanged. Existing followers consume the new shared revision at their next player boundary. The empty shared state can be populated directly from a story.

One Context synchronization workspace presents book-shared settings on the left and the destination story on the right, joined by a directional arrow. Five compact rows align the selectable modules with their current destination sources. One primary action synchronizes the selection; copying once is the default, with an explicit option to follow future shared updates. Context editors retain source labels and one navigation link.

Editing shared content automatically includes changed modules in a single publication. Per-module undo and draft discard are explicit. Drafts remain keyed by book across navigation. Loading a story's saved values requires a deliberate action and does not publish them. A revision conflict preserves the draft and requires a fresh review.

Full module content opens in a comparison dialog. Shared editing and restoration occupy secondary dialogs; book draft imports and new-book defaults sit under More. Restoration distinguishes the retained independent value from the pinned book version. Status labels distinguish an applied update, a pending update and paused following. Unsaved instance drafts block synchronization. Shared drafts remain editable while synchronization uses the saved shared values; the primary action names this choice and a nearby link reopens the draft. Book imports preserve unrelated unsaved edits and return to the editor for review, save and publication.

CreativeSettingsApplication.read adds the effective recipe and pinned storybook recipe to its existing atomic read. Previewing does not synchronize pending values or advance a story revision. Binding accepts either one module or a unique, nonempty selection and commits all selected changes together. An unavailable value or stale revision rejects the whole selection. Publication and binding retain running-execution rejection. Sharing covers narration length and the director/actor performance and reasoning modules.

## Alternatives considered

- Renaming every inline button leaves the same duplicated workflows and competing save semantics.
- Grouping controls into tabs still conceals source and destination; displaying every explanation at once buries the synchronization action.
- Replacing all story context with shared content expands authority beyond the existing five supported modules.
- Automatically saving book imports can overwrite unsaved author work and imply an unintended publication.

## Consequences

Synchronization takes place in one workspace; inline editing remains local to the recipe editor. Detailed text appears on demand. Narrow viewports stack source above destination. Modals remain bounded by the viewport and scroll internally. Native modal focus restoration and keyboard dismissal remain in use.

The real Loader browser scenario covers desktop alignment, narrow layout with the sidebar collapsed, sharing, retained drafts after reload, batch following from saved values with an untouched shared draft, restoring the independent value, copying once, editor provenance and book draft import. Domain tests verify read-only previews, batch atomicity and stale revision rejection. Client tests cover navigation and per-book draft retention, readable previews and paused-versus-pending status. Repository-wide documentation failures remain tracked separately from these focused checks.
