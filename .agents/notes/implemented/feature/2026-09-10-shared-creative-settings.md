# Agent Note: Book-scoped shared creative settings

Status: implemented

English | [中文](2026-09-10-shared-creative-settings.zh.md)

## Problem

Instances of one storybook need reusable narration limits and creative instructions without losing their independent settings. Different books must remain isolated even when their JSON identifiers or titles match.

## Decision

Scope shared settings to the library BookId, resolved from each instance's pinned template version. Store publication values, immutable versions, and idempotent receipts under a book-specific namespace; reject publication from an instance belonging to another book. [System initialization defaults](2026-09-11-context-defaults-and-character-voice.md) separately provide copied initial values for new books and never subscribe existing books or instances.

Share five atomic modules: narration length, director creative instructions, actor creative instructions, director reasoning instructions, and actor reasoning instructions. Do not share people, world state, memories, model configuration, or the complete context recipe.

Every instance initially retains independent copies. Each module can use its saved local value, the pinned storybook value, or an explicitly selected shared version. Following preserves the local backup; switching back restores it. Copying shared values into local settings deliberately replaces that backup and stops following.

Publication requires explicit module selection and a matching shared revision. Publishing from an instance additionally verifies its saved revision and exact saved values. Publication does not change that instance's source choice. The UI retains shared drafts separately for each book and blocks stale publication until reviewed.

Following updates atomically at the next accepted player-operation boundary. Shared values become ordinary recipe snapshots in the same commit as the operation. Context validation runs before persistence, so a failed validation cannot partly accept a world intervention or update its settings. In-flight execution keeps its applied snapshot.

Restore and archive import preserve materialized values and pause shared following. Resuming requires an explicit source save. Storybook JSON export contains ordinary recipe values; it does not export a live subscription. Copying shared modules into a book draft changes only that draft until it is saved and published.

## Alternatives considered

- Application-wide live sharing: rejected because settings from unrelated stories must not influence each other; initialization copies are a separate capability.
- Immediate propagation into every instance: rejected because it overwrites independent work and changes an active request mid-run.
- Dynamic reads during every model request: rejected because replay would depend on today's shared values instead of the accepted historical snapshot.
- Whole-recipe replacement: rejected because structural context settings and custom sections are outside the shared module contract.

## Consequences

The sidebar exposes book-shared settings, and the context editor exposes a source selector beside each supported module. Followed values are read-only until made independent. Shared publication and instance source changes are separate actions; missing shared modules cannot be followed silently.

The [core tests](../../../../packages/story/roleplay-core/tests/world.spec.ts) cover book isolation, revision conflicts, rollback, local restoration, deferred following, and paused restoration/import. The [browser test](../../../../apps/web/tests/player-performance.e2e.ts) exercises publication and independent/followed switching through the shipped profile. Pure module schemas are the browser-safe leaf; persistence and commands stay on the host.
