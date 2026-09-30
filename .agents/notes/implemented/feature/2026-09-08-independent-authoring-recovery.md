# Agent Note: independent authoring and historical interaction recovery

Status: implemented

English | [中文](2026-09-08-independent-authoring-recovery.zh.md)

## Problem

The independent narrative application needs the established authoring workflow without restoring Story aggregates as business authority. A JSON editor alone cannot supply a durable creative conversation, local materials, request inspection, or distinct runs of a published book. Native conversation mounting also assumed an optional Story picker was always present.

## Decision

Use a root-scoped narrative workspace to select between independent play and the embedded native conversation. The native conversation keeps its Session scope, tools, permission controls and request history. Its optional Story-picker requirement applies only when the picker service is composed. Shared navigation and author drafts belong to the root browser store so switching creator Sessions does not split or discard them.

Each creation task binds a native `storyweaver-author` Session to one draft. Dedicated tools read the exact schema, save revision-checked drafts, preview publication and publish immutable versions. Plain assistant prose does not save content. Defaults are copied when a task is initialized; later task guidance is independent of default changes. An explicit local directory is fixed at task creation. A tool guard rejects local file and shell operations when the task lacks that binding, while native permission policy remains authoritative for each operation.

Storybooks and runs have distinct navigation identities. A plus action creates a fresh instance from a published version. Manual fields preserve advanced document content; portable book exports retain resource bytes. Removing a book hides its authoring entry while retaining published versions and runs. Removing a run appends a removal event and invalidates execution before cancellation, retaining physical history. Player-direction rewriting restores the same instance to the preceding boundary and starts a new request with retry-stable command identities.

Context source order, roles and switches remain persisted configuration. Rules, tool guidance and reasoning language can occupy separate modules. Existing grouped recipes are split only by an explicit author action; reads do not rewrite them. Unsaved recipes and settings survive navigation and reload. Narrative previews include the pending director instruction when requested; complete model inputs and outputs remain the recorded-request inspector's responsibility.

## Alternatives considered

**Restore the aggregate-backed UI composition.** This reintroduces the business ownership removed by the independent architecture. The historical UI remains a workflow reference.

**Use local JSON as the authoritative draft.** Generic filesystem writes cannot enforce draft revisions or immutable publication. Local materials are separate from the managed book document.

**Replace history in place.** An in-place rewrite loses the reviewable original and cannot fence late model work. Compensation and epoch invalidation preserve both boundaries.

## Consequences

The [AI authoring handoff](../../../../docs/storybook-json-editing-guide.md) describes native book tools and external JSON delivery separately. Its v6 template is checked by the current parser and independent publication preparation; regression cases reject the obsolete v4/v5 versions and private-state shapes. It does not prescribe legacy managed paths, automatic publication, or a terminal tool for every creative exchange.

Active creation tasks expose a direct prompt-edit action in the workspace header. It opens the existing settings form and focuses the prompt instead of introducing another editor or copy of its state. Saving confirms that later model requests use the updated task settings. Browser coverage edits a prompt and role after the first response, reloads the page, and checks the next actual mock-adapter request.

Embedded conversation ownership can disappear during plugin reload. Restoring the ordinary shell inside the declaration-removal callback collided with child slots still awaiting recursive teardown. Restoration now runs after that cascade, with an epoch and plugin-lifetime check to reject stale work. Registration tests cover both load orders, replacement in the same tick, and disposal; browser checks cover repeated play/creation visits with separate unsent drafts.

The supported profile composes the native tool, command, permission and request-history surfaces with independent book tools. Director and Actor executions retain their restricted tools. No old files are converted, no previous books are republished during reads, and no old Story writer is enabled.

Keyless tests exercise native authoring, directory authorization, file output, task-only prompts, publication, independent runs, same-instance rewriting and removal. Domain tests verify retry identity, old-history replay, sibling isolation and settings revisions. Browser checks cover recipe draft reload and source editing alongside the existing play workflow. Real-model quality and performance remain unmeasured.

The [play interaction decision](2026-09-08-play-interface-recovery.md), [legacy creation decision](2026-08-31-storybook-creation-mode.md) and [legacy independent-run decision](2026-08-31-independent-story-runs-and-deletion.md) remain active for their distinct reading, managed-file and ownership rationale. This decision replaces their supported-product wiring where it differs; their remaining mechanisms are not consolidated or archived.
