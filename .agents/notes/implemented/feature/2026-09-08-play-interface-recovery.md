# Agent Note: Restore story-centered play interaction

Status: implemented

English | [中文](2026-09-08-play-interface-recovery.zh.md)

## Problem

The independent backend cutover also replaced the established play UI with application forms. The interface lost character-turn grouping and nearby execution inspection, presented manual discussion controls as the main path, and showed empty attendance and inactive controls. Mock-based acceptance missed a default provider route that the real adapter did not register. Generic execution failure text then concealed that cause.

## Decision

The supported independent authoring and rewrite wiring is described by the [authoring recovery decision](2026-09-08-independent-authoring-recovery.md). This note retains the remaining workflow and ownership rationale.

Reuse the native dsh sidebar shell, including its collapse animation, compact rail, resize and Settings. Independent navigation supplies a typed primary action and browsing/brand slots without creating a technical Session. Use dsh Markdown, clipboard, icons and Modal primitives. Font size follows the theme preference exactly; reading width retains the existing browser preference key. Model selection, memory review and advanced tools remain beside the draft. Instance identifiers live in tooltips rather than the main list text.

Restore story heading, opening guidance, committed character groups and a bottom composer inside ui-narrative. Keep the independent application and query boundaries. Player-only speaker identifiers route explicit inspection to the original revision and actor; models continue using separate perspective references. Retain canonical-name annotations. Live diagnostics remain explicitly opened player information, separate from accepted fiction. Memory and model tools use focused native dialogs; author editing and history remain available.

Use the default model route shipped by the base profile and verify that correspondence in the profile test. Preserve the current execution's turn-end error rather than replacing provider failures with a missing-submission message. No model calls are required to test unavailable routes or error propagation.

Reply width and composer height are independent browser preferences. Edge and top handles preview captured pointer gestures and commit on release; Escape or capture cancellation restores the saved size. Keyboard arrows, Home/End, Layout sliders and reset provide alternatives to dragging. ResizeObserver clamps display to the available viewport without overwriting wider-screen preferences. The dark palette uses graphite surfaces, subtle rules and a bone-colored primary control; a single-layer input field gives writing space priority over nested decoration.

## Alternatives considered

**Restore the old aggregate-backed product composition.** This would recover the old UI by reintroducing the business dependencies the user asked to remove. The old components remain design references.

**Keep decorating the form-based surface.** Shared colors and cards alone do not restore reading flow, contextual operations or useful execution feedback.

**Show model drafts as accepted dialogue.** This would misrepresent uncommitted output. Explicit diagnostics keep the boundary visible.

## Consequences

Streaming drafts and committed turns share the same reading-column container. The previous separate 900px execution dock caused a horizontal jump on commit and diverged further when the people panel was open. A browser geometry check compares both states at a custom width, with the people panel and on mobile. Speech/action labels use 14px semibold primary text.

Thinking uses the shared disclosure row beneath a speaker name, ahead of accepted prose; streaming output follows the same order. Director dispatch is a visible collapsed row after each player direction, so an initial dispatch without narration remains reachable. The scope ends at the first following character turn or before the next direction. A page starting without a direction retains a director entry at its first visible revision. Inline readers use injected historical page/detail reads, independent of the shared author-inspection selection. They select the latest technical turn at that boundary, retain its request steps, lazily load details, paginate earlier steps and reject late results after collapse or scope changes. Tool arguments remain recorded requests, not evidence of successful narrative mutation.


Library presentation follows the same story-centered hierarchy: an open-book mark, a concise welcome, AI and manual creation shortcuts, and typographic covers with publication state and existing runs. Imports use a keyboard-accessible disclosure. Covers derive their title and summary from the book and use local vector artwork; they require no remote assets or generated plot content. Light and dark tokens, narrow layouts and reduced-motion rules belong to the narrative presentation layer.

Retain eight character tones with lightweight speech rules and subdued action panels from `RoleplayEventView`, through a Cordis-free `TranscriptCard` renderer. The independent query remains the owner of names and accepted content. Character knowledge and memory review use the same native modal; full editing uses a section navigator and a scoped workspace. Opening live diagnostics starts the subscription directly instead of requiring a second nested switch. Recorded reasoning uses the native disclosure component.

The composer shows request progress immediately, preserves text after failure, and follows the original Enter / Shift+Enter and IME safeguards. The accepted director-opening transaction also records player instructions as player-only interface history; replay, compensation and archive validation cover that collection without exposing it as actor evidence. Browser selection survives reload, while audience restoration starts in observer mode. Tool guidance explicitly distinguishes top-level finish fields and perspective-specific actor targets; this corrects protocol guidance, not a measured model-quality result.

The main play path no longer requires manual discussion setup, author-workspace navigation for memory review, or reading technical revision identifiers. Per-turn inspection uses the existing generation-fenced API mirror. Dialogs retain keyboard focus, Escape support and unsent prose. Tests cover native tool failure propagation, default route correspondence, original request inspection, memory review, draft retention and responsive layouts. Same-instance player-direction rewriting follows the linked recovery decision. Complete silent-turn history and continuous multi-page transcript loading remain outside this reading decision; bounded pagination is available. Real-model performance and player assessment remain separate from keyless checks.
