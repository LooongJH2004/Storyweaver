# Agent Note: Separate player speech and action inputs

Status: implemented

English | [中文](2026-09-10-player-response-inputs.zh.md)

## Decision

The embodiment composer presents two labeled textareas. Speech has delivery and recipient controls; action has a separate optional person target. Empty fields produce no behavior, and both filled fields publish in their displayed order, speech then action, through one existing embodiment command. Whispered and written speech require a recipient; an action-only submission does not inherit that requirement. Stale targets remain visibly unavailable until explicitly replaced or cleared.

## Ownership and persistence

The browser store separates drafts by instance and character and retains them across reloads and mode changes. Success clears each text field only if it still matches the submitted text, preserving edits written while the request was pending. Rejection preserves the draft. Embodiment has a separate preferred composer height, defaulting to enough space for the paired fields and clamped to the viewport. Ordinary input height and reply width retain their existing behavior.

Player control remains independent from protagonist metadata and temporary embodiment. Hand back to AI releases persistent ownership through the existing command, switches to observer input, and explains that Continue advances the story. It does not invoke a model immediately or change the storybook.

## Evidence and limits

Client tests cover ordered payloads, empty fields, independent targets, IME Enter, per-character persistence and in-flight draft edits. The isolated browser scenario checks persisted speech/action submission against authoritative behavior records, protagonist handback, narrow-screen layout and private-recipient requirements. The reading-layout scenario covers existing resize and stream-follow behavior. These scenarios use neutral temporary stories and do not submit player actions to existing user stories. This two-field interface expresses speech followed by one action; more elaborate interleaving remains outside its scope.
