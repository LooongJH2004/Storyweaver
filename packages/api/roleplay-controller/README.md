---
description: "Independent story commands, audience-specific queries and the browser Remote namespace."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-roleplay-controller

English | [中文](README.zh.md)

## Summary

This entry adapter exposes the independent `roleplay` Remote namespace. It authenticates player commands, delegates to separate application services and returns explicit play, author and historical views. It never opens an Agent, parses a Session log, or writes storage directly.

Public requests use named framework-independent contracts. Both client and host declarations are checked, including client declaration checking with `skipLibCheck` disabled. Author workspace queries, instance settings, planning review, version inspection and book-entry removal use separate application methods. `followPlay` streams the latest bounded audience view after accepted commits; it coalesces revision notices and releases its subscription on cancellation or disposal. This stream contains published fiction and actual execution phase, not generated progress or raw model drafts.

The React-free `roleplayBrowser` model owns library baselines, live play subscriptions and author query mirrors. Switching audience clears the previous view immediately. Generation checks reject late unary or streaming results, historical pages stay separate from live follow, and author people queries bind to the workspace's captured revision. Gateway stream supervision owns reconnect; the model preserves usable data on failure and reports subscription disposal errors.

Creation Remotes delegate directory selection to the host picker and task preferences to the creation owner. Book removal retains published versions and instances. Run removal and player-direction rewriting delegate to recovery, using explicit instance identity, revision and retry command ID. Narrative context previews accept an optional pending instruction; recorded requests remain historical evidence.

Manual discussion advancement waits for the Director conclusion when participants finish. Retries reuse the conclusion receipt and its reviewed revision. Execution diagnostics carry exact native turn totals, request counts and earlier live steps without exposing technical session ownership.

## Table of Contents

- [Development Contract](#development-contract)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="development-contract"></a>
## Development Contract

Mount with `roleplay-services` and the Typert gateway through a dsh profile. The generated `/remote` export and `/client` adapter expose `ctx.roleplay`; browser consumers do not depend on StoryController or the Story aggregate. The host and client compiler faces remain separate.

Write requests retain command IDs and expected narrative revisions. The host constructs player authority. Queries distinguish published play rows, full author records, current context previews and stored history. `advance` delegates the Director instruction and an independently supplied optional `actorFacingBeat` to the runtime; it never copies the Director instruction into the actor-visible field. Director advancement and pause delegate to the runtime; checkpoint and restore delegate to recovery. Export collects complete associated execution evidence at an exact narrative revision, and import creates a fresh instance.

Application errors retain their stable `roleplay-` code. A revision conflict requires refreshed review; retrying unchanged commands preserves their original identity. Import and export are JSON file payloads validated by the archive application. Existing imported execution logs remain evidence and never become live sessions.

`retention`, `reviewRetention`, and `recall` delegate to the retention applications. Author queries explicitly select `director` or `actor:<id>` and may bind to an older narrative revision; model tools have no such owner selector. Review writes use the normal player command identity and expected revision. The generated client exposes named domain inputs and views, without acquiring Actor, Session, or storage dependencies.

`executionRequests` and `executionRequest` accept narrative scope and adapter-issued request coordinates. An optional evidence ID identifies an imported request within that instance's archive. They delegate to the application query; this API does not accept arbitrary Session IDs or parse execution events. The Client inspection mirror clears stale private data when the instance, person, or revision changes. `commandStatus` queries the narrative receipt and execution outcome so a browser can distinguish uncertain responses from confirmed rejection or ended execution.

<a id="model-experience"></a>
## Model Experience

### Context inspection

#### What the model sees

This browser adapter adds no model instructions. `executionRequest` retrieves recorded requests; context previews delegate to the same application renderers used by execution. Historical reconstruction belongs to the Harness reader.

#### Token effect

Inspection does not execute a model or add request tokens. Subsequent story execution uses the application context and the selected provider.

#### KV Cache effect

None. This package does not assemble model requests or claim measured cache savings.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

embodimentChoices returns separate controlEntries for the active run roster and entries for immediate scene embodiment. The browser mirror accepts both only at the displayed revision and discards late results from another run. Control candidates do not depend on the observer having met the person.

controlPlayer delegates a revision-checked player claim or release to PlayerApplication; passPlayer explicitly yields the owned discussion floor. Both return command effect receipts through the existing mutation/error mirror. PlayView exposes playerActorId and playerTurn so the browser does not infer ownership from a reading audience or book protagonist. These operations do not edit storybook metadata.

- Advanced structured fields use JSON editors. Context previews show narrative sections; complete provider requests are available after execution. Isolated model diagnostics do not establish long-running acting quality or leakage performance.

<a id="dev-note"></a>
### Dev Note

See the [independent narrative proposal](../../../.agents/notes/implemented/architecture/2026-09-07-independent-narrative-instances.md). Preserve old data until the new product composition passes acceptance; do not introduce dual writes.

The streamed `followExecution` query authorizes the selected narrative perspective before the Harness adapter reads technical events. Its response mirror clears late private frames on a perspective change. `executionModel` and `selectExecutionModel` delegate route validation and revision-checked persistence to the Harness settings owner; browser code does not configure an Agent or write storage.

The browser inspection mirror has a dedicated inspectRecorded path. It reads the exact execution page and selected request without querying current cognition, retention, context previews or checkpoints. Generation checks reject late results after a perspective switch, and scope checks remain mandatory.
