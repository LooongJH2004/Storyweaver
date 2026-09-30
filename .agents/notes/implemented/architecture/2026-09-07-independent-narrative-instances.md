# Agent Note: Independent narrative instances and execution adapters

Status: implemented

English | [中文](2026-09-07-independent-narrative-instances.zh.md)

## Problem

StoryRegistry, Actor Session folds, Director tools, and StoryController jointly own mutable fiction. Character edits can restore an Agent, context preparation can mutate Story state, and a Session event decides whether an apparent turn reached narrative authority. Creating a story from another run's directory also obscures which author baseline is fixed. These dependencies prevent isolated business tests and make interruption, retries, and instance isolation difficult to establish.

## Decision

Keep immutable published storybook versions, independent narrative instances, and technical execution sessions as separate objects. Use explicit commands, audience-specific query values, narrow execution ports, and a dedicated transactional RoleplayStore. The event commit is authoritative; projections and checkpoints derive from narrative events. Model requests and their receipts remain execution evidence. Do not automatically migrate old files, dual-write both authorities, add runtime forks, or synchronize separate instances.

## Current implementation

Exact current-revision queries read the committed projection within the transaction that checks its revision. Historical queries retain event replay, including deleted instances and compensating restores. This avoids rebuilding the entire history for every current author detail query. A process cache was avoided because invalidation and cross-instance privacy would add ownership beyond this fix. The focused narrative, world and SQLite regression passes 152 tests; the new read-path test verifies no current commit scan and preserved older reads after another commit. This does not establish end-to-end page latency or optimize long execution-log reads.

The [player identity presentation decision](../feature/2026-09-08-player-identity-presentation.md) adds canonical-name annotations to authorized player views. Actor perspective queries remain separate and retain their identity restrictions.

The pure roleplay-core package owns storybook, state, knowledge, identity, planning, discussion and lifecycle rules. Separate application capabilities own publication, instances, people, cognition, configuration, narrative commits, runtime coordination, restoration and perspective queries. Memory and SQLite adapters provide the same atomic commit, revision, idempotency and outbox semantics. Actor and Director executors receive narrow command/query callbacks; model execution does not hold a database transaction.

The default roleplay profile now installs the independent applications and ui-narrative in a separate Storyweaver Home. It no longer mounts the old Story registry, Story API, Actor business service or Director tool orchestrator. The old composition is a non-exported regression fixture. Existing runtime directories and unsubmitted workspace changes remain preserved; there is no automatic migration or dual writing.

Published versions remain pinned, and imports allocate independent instance/version identities. People and cognition editing require no live Actor. Audience filtering precedes retrieval; stable perspective references protect identities and historical labels. Checkpoints and compensating restores preserve original logs and support same-Session resend through the Harness adapter. Retention proposals, review, original recall, current context recipes and actual request reconstruction have separate application or adapter owners.

The author UI connects settings, people, styles, dynamic state, lifecycle JSON, outline locks/proposals, context and material extraction. Same-perspective refresh preserves edited settings and rebases untouched fields; conflicts preserve drafts. Personal style presets copy values. Exact concurrent runtime retries share one execution, while command-status queries distinguish accepted fiction from ended execution. Portable request bodies and responses remain readable inside an imported instance without restoring original sessions. Opt-in live diagnostics clear private output on perspective changes and do not publish it as fiction.

Execution model preferences live in the Harness settings adapter, not story facts. Writes validate routes and expected settings revisions. Existing and new Actor/Director sessions sample the next execution selection; recorded request headers retain the actual model. Credentials stay in the established settings system.

## Validation

The final focused regression passed 23 files and 116 tests, including independent fixture, API client, UI, dependency, SQLite and real Loader checks. The isolated browser scenario passes publication, privacy, supporting characters, states, settings conflicts, personal styles, outline review, discussion, checkpoint recovery, archive import/export, material selection, live draft privacy and model changes. Real Loader/HTTP tests cover plugin composition, native tool correction and atomic acceptance, cold recovery, original request evidence and same-Session resend. Resource tests preserve pinned bytes; 2,000-absent-person queries cover context size and instance isolation. Final check logs are in the workspace .tmp directory.

Earlier exhaustive GUI and Web runs were not clean: unrelated directory-picker, welcome-notice, scrollbar and platform fixture failures remain recorded. Do not report them as passing. Real-model name leakage, unsupported knowledge, repeated person creation, latency, tokens and acting quality remain unmeasured; keyless tests do not replace human play review.

## Remaining validation and limitations

Very long execution-log performance needs measurement: live diagnostics coalesce notices but scan request history. Advanced author fields still use JSON and drafts are not persisted across every navigation. No autonomous offscene scheduler, instance branching/merging, implicit legacy migration or cross-instance knowledge sharing is included. The real-model evaluation harness retained under legacy fixtures is historical evidence, not an evaluation of this new composition.

## Alternatives considered

**Retain Story and Session as joint narrative owners.** This preserves the coupling that requires Actor recovery for author edits and makes fiction depend on execution protocols.

**Expand generic Harness KV into the narrative transaction store.** The dedicated RoleplayStore supplies cross-record atomicity without broadening unrelated Harness storage obligations.

**Dual-write old and new representations.** The product instead switches to an isolated directory and keeps the old composition only as a regression fixture; no reconciliation bridge is introduced.

## Consequences

Independent applications can be tested with an in-memory store and scripted executors. Immutable book versions and instance-scoped commits prevent runtime inheritance. The replacement uses a separate data directory, so existing users must explicitly import authored settings or supported new archives. Keyless validation establishes structural behavior; real-model performance and human acting review remain separate work.
