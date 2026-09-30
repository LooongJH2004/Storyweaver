# Story identity and storage

English | [中文](story.zh.md)

Storyweaver treats a Story as the product aggregate. A Story is addressed by an opaque `StoryId`; its physical directory is a Host-only implementation detail and never enters browser contracts.

## Ownership chain

`ctx.storyHome` resolves the fixed application-data root and creates the managed directory skeleton. `ctx.storyRegistry` persists Story metadata and assigns every Session one explicit role: scene, control, or Actor. `ctx.storyController` projects active records to `ctx.stories` in the browser through a reconnect-safe baseline stream.

The direction is:

`Storyweaver home → Story registry → Story Remote → Client Story model → Story UI`

No stage discovers a Story from process cwd, and startup does not import Workspace records or historical Session headers.

The [narrative core](../../packages/story/roleplay-core/README.md) owns shared character, state, knowledge, style, and storybook rules. Its independent command application and [SQLite adapter](../../packages/story/roleplay-store-sqlite/README.md) are under product integration; they do not yet replace the live Story/Session persistence described here.

The independent `PlayView.discussion.preparation` contains pending group counts. `PlayView.discussionPreparation` additionally retains the latest discussion's per-character readiness and fixed attempt/revision coordinates after preparation completes. Private contents are loaded through execution history only when expanded; public turns remain sequential. Execution and cancellation semantics belong to the [narrative core](../../packages/story/roleplay-core/README.md).

Independent `discussionSettings.floorPolicy` optionally selects `balanced` or `eagerness`; the selected value is captured in `StoryDiscussion.floorPolicy` at start. Absence retains the original eagerness rule. `PlayView.discussion.publicTurns` provides `used`, `total` and `remaining` public opportunities, including passes and excluding preparation; these counts are independent of transcript pagination.

`StoryDiscussionState.requests` stores actor invitations with owner, scene, participant IDs, topic, opening purpose, source, revision, status and optional accepted discussion ID. Status is pending, deferred, accepted or declined. `PlayView.discussionRequests` exposes unresolved invitations for player review, filtered to the requester in actor audiences. The discussion-control request operation carries request ID, expected request revision, decision and reason.

Independent observation input optionally includes `shared` with `actorIds`, `content`, `kind` and `sourceRefs`. A recipient delivery optionally selects `mode: supplement | replace`; replacement requires membership in shared recipients. Evidence optionally stores an intra-commit `order`. Action input optionally selects `visibility: public | concealed`; omitted visibility retains ordinary publication, while concealed attempts have no broadcast audience and receive world feedback through subsequent observations.

## Physical layout

Independent actor evidence and event entries in `NarrativeRecallView` preserve publication revision and optional within-commit order. Personal records and retained summaries instead identify record-local versions with optional `revisionScope: record`; omission denotes a story revision. Received behavior includes frozen observer-local attribution; recall and pins retain it without exposing private motives. The [attributed perception decision](../../.agents/notes/implemented/feature/2026-09-11-attributed-character-perception.md) defines historical omissions and prompt-only director consistency.

Windows defaults to `%LOCALAPPDATA%/Storyweaver`; `STORYWEAVER_HOME` overrides it. The root contains shared `sessions`, `storages`, `attachments`, and `trash` areas plus `stories/<StoryId>`. Each Story directory reserves `world`, `assets`, `exports`, and `.runtime`. Session headers may use `.runtime` as an internal cwd for existing runtime contracts, but the browser and system prompt do not expose it.

## Session roles

- A scene Session is the player-facing evolving narrative surface.
- A control Session records god-view direction and world intervention.
- An Actor Session owns one fictional character's private context and requires a stable Actor id.

One Session belongs to at most one Story. A Story has at most one active control Session and one active Session per Actor id. Archive operations retain records and logs.

## Director boundary and Plot Ledger

Each Story persists one revisioned Plot Ledger containing the current situation, established facts, open threads, NPC events awaiting the next planning pass, and the latest structured Director Brief. A Brief names the current scene and may give active Actors perceptions and uncertainties. Its strict input fields contain no character dialogue, decisions, thoughts, or actions, and a stale expected revision cannot overwrite newer Actor input.

Only Actor-origin `actor/expression` and `actor/action-intent` events with a matching open `npc_speak` or `npc_act` call in the same Agent step become pending NPC events. The Story invariant rejects bypass attempts before the Actor event enters the Session log. Committing the next Brief moves the pending events into that Brief's source list; the private Actor Session remains the authoritative record.

Director prose has no persistent-character authority. When no accepted NPC event exists, the character remains silent and its next behavior remains unresolved. Player embodiment remains player-origin under the Actor subsystem rather than becoming an autonomous NPC choice.

## Storybook authoring

The browser can read and replace `world/storybook.json` through the path-free Story Remote. Storybook documents share one strict schema across the Director tool, Host projections, and browser editor. They contain world truth, scene beats, Director supplemental rules, and Actor public/private configuration, while unknown authority-bearing fields such as a per-story system prompt are rejected.

Every read returns canonical JSON and a content revision. A save must present that exact revision, is serialized per Story, and atomically replaces the file; stale editors cannot overwrite a newer save. The non-editable Director boundary remains a product system policy and is shown explicitly in the studio rather than being embedded in editable story content.

## Roleplaying runtime state

Version-10 Story records own four additional revisioned state machines. World state accepts only typed `set` and `remove` patches, settles each sourced Actor attempt once, and stores audience-specific perceptions. PlayerAuthority has separate direction, intervention, speech, and action commands, so trusted player changes do not depend on prompt markers. Long-story memory enters context only after explicit review and can supersede an older approved entry of the same kind. Durable discussions persist participants, floor ownership, queue, transcript, round budget, player intervention, and a pre-completion summarizing phase instead of relying on an in-memory loop.

The saved context recipe controls the order and inclusion of creative Director and Actor sections. Fixed policy, tools, and Actor identity remain locked. Every enabled section is included in full with no character-budget truncation. The same composition path powers model requests and context preview, including informational character and estimated-token accounting. A strict version-1 Story Package can export and import the aggregate, storybook, registered Session logs, and portable `world/` files. Import validates all content and remaps every opaque Story and Session identity before publication.

## Approved context retention

`StorybookActorDefinition.commonKnowledge` is an optional nullable string array. Omission/null inherits shared book knowledge; an array replaces it for that character, including an empty array. Personal judgments and received evidence remain independent inputs. Character creation, pinned instances and archives preserve the same field.

`DirectorRunView.consolidationSources?: string[]` marks a director memory batch. Commands require exact source coverage and prohibit world writes and dispatch; import validation enforces the record restrictions. `directorConsolidationThreshold` controls triggering.

An independent actor execution may carry host-assigned `consolidationSources`. Its private request uses those frozen source IDs, and its commit permits only retention and execution changes with exact batch coverage. `roleplay-services.consolidationThreshold` controls ordinary-run triggering; zero disables it. Execution ownership, retry and cancellation remain in the actor runtime.

`roleplay-services.consolidationBatchLimit` is a positive integer limiting private batches per actor at each discussion-consolidation entry. The runtime default is 1; the web profile sets 2. Ordinary actor runs still add at most one consolidation execution.

Independent owner retention optionally stores `activation: automatic | review`; omission requires review. Player `RetentionReviewInput.operation: policy` selects the mode for subsequent submissions. Automatically activated proposals store `activation: automatic`; their notes and coverage commit with the originating transaction. Existing pending proposals do not change mode retroactively, and model tools cannot select the owner's policy.

Player `RetentionReviewInput.operation: correct` takes `owner`, note `id`, exact `revision` and `content: { text, episode? }`. The host retains source IDs, ownership, kind and status and records the correction under player authority. Omitted episode details remain on the same note.

Independent `ContextNote` and note changes optionally carry `episode: { topic, experience, interpretation, impact, unresolved }`. `text` remains the brief understanding; effective details are retrieved with `retention:<noteId>:r<revision>` through owner-scoped recall. `RetentionReviewInput` includes `revoke` with `owner`, note `id` and exact `revision`; the player operation archives the note and restores sources without other effective coverage. Historical reads and exports retain its details. Runtime and review semantics belong to [roleplay-core](../../packages/story/roleplay-core/README.md).

`ContextSource` locates full original content and captures who may read it. `ContextNote` is a revisioned, audience-specific short record; `ContextProposal` groups note changes and source handling into one player-reviewed unit. All belong to the Story checkpoint. Brief facts and open threads derive from approved notes, and recent windows cannot discard unapproved originals. See [the Story package](../../packages/story/story/README.md) and [the retention decision](../../.agents/notes/implemented/architecture/2026-09-04-player-approved-context-retention.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdirectorruns--directorrunexecutor"></a>

### `ctx.directorRuns` — `DirectorRunExecutor`

Host orchestration provider used by player and Director control surfaces.

```ts cordis-catalog
/**
 * Resume unfinished Actors over an exact Run revision.
 * @param storyId - Story whose Run resumes.
 * @param expectedRunRevision - Exact current Run revision.
 * @returns the Story after selected Actors settle.
 */
resume(storyId: StoryId, expectedRunRevision: number): Promise<Story>

/**
 * Retry one failed or cancelled Actor over an exact Run revision.
 * @param storyId - Story whose Actor retries.
 * @param expectedRunRevision - Exact current Run revision.
 * @param actorId - Failed or cancelled Actor identity.
 * @returns the Story after the Actor settles.
 */
retryActor(storyId: StoryId, expectedRunRevision: number, actorId: string): Promise<Story>

/**
 * Pause a Run and abort all active attempts over an exact revision.
 * @param storyId - Story whose Run pauses.
 * @param expectedRunRevision - Exact current Run revision.
 * @returns the paused Story checkpoint.
 */
pause(storyId: StoryId, expectedRunRevision: number): Promise<Story>

/**
 * Cancel a Run terminally over an exact revision.
 * @param storyId - Story whose Run is cancelled.
 * @param expectedRunRevision - Exact current Run revision.
 * @returns the terminally cancelled Story checkpoint.
 */
cancel(storyId: StoryId, expectedRunRevision: number): Promise<Story>

/**
 * Skip one incomplete Actor over an exact Run revision.
 * @param storyId - Story whose Actor is skipped.
 * @param expectedRunRevision - Exact current Run revision.
 * @param actorId - Incomplete Actor identity.
 * @returns the changed Story checkpoint.
 */
skipActor(storyId: StoryId, expectedRunRevision: number, actorId: string): Promise<Story>

/**
 * Cancel one running Actor attempt over an exact Run revision.
 * @param storyId - Story whose Actor attempt is cancelled.
 * @param expectedRunRevision - Exact current Run revision.
 * @param actorId - Running Actor identity.
 * @returns the changed resumable Story checkpoint.
 */
cancelActor(storyId: StoryId, expectedRunRevision: number, actorId: string): Promise<Story>
```

Source: [`packages/story/story/src/types.ts`](../../packages/story/story/src/types.ts)

<a id="ctxstorycontextrenderer--storycontextrenderer"></a>

### `ctx.storyContextRenderer` — `StoryContextRenderer`

Read-only runtime context provider shared by actual requests and configuration preview.

```ts cordis-catalog
/**
 * Render current effective sections using the configured runtime projection.
 * @param storyId - Exact Story to inspect.
 * @param audience - Director or private Actor recipient.
 * @param actorId - Required identity for an Actor recipient.
 * @returns current sections; uninitialized Actor state is explicitly absent.
 */
render(storyId: StoryId, audience: 'director' | 'actor', actorId?: string): Promise<StoryContextSnapshot>
```

Source: [`packages/story/story/src/types.ts`](../../packages/story/story/src/types.ts)

<a id="ctxstorycontroller--storycontroller"></a>

### `ctx.storyController` — `StoryController`

Host service backing the generated `ctx.remote.story` namespace.

```ts cordis-catalog
/**
 * Create an empty Story with no historical import.
 * @param request - Initial title and optional premise.
 * @returns the newly created Story projection.
 */
@Remote('create') async create(request: StoryCreateRequest): Promise<StoryCreateValue>

/**
 * Create a completely independent Story run from authored baseline material.
 * Runtime world state, memory, planning, Actors, and Sessions are reset.
 * @param request - Existing Story whose storybook and authored files are reused.
 * @returns the fresh Story projection before its first scene is created.
 */
@Remote('createFromTemplate') async createFromTemplate(request: StoryCreateFromTemplateRequest): Promise<StoryCreateValue>

/**
 * Import one standalone version-6 Storybook as a new library template.
 * The complete document is validated before mutation; a failed durable write
 * removes the provisional aggregate instead of leaving an empty story behind.
 * @param request - Serialized standalone Storybook JSON.
 * @returns the newly imported authored-settings template.
 */
@Remote('importStorybook') async importStorybook(request: StorybookImportRequest): Promise<StoryCreateValue>

/**
 * Delete one Story run from the active registry and move its managed aggregate to trash.
 * @param request - Story run identity.
 * @returns the deleted identity for client reconciliation.
 */
@Remote('delete') async delete(request: StoryDeleteRequest): Promise<StoryDeleteValue>

/**
 * Rename one Story.
 * @param request - Story identity and replacement title.
 * @returns the changed Story projection.
 */
@Remote('rename') async rename(request: StoryRenameRequest): Promise<StoryValue>

/**
 * Replace one Story premise.
 * @param request - Story identity and replacement premise.
 * @returns the changed Story projection.
 */
@Remote('setPremise') async setPremise(request: StorySetPremiseRequest): Promise<StoryValue>

/**
 * Archive one Story without deleting files or logs.
 * @param request - Story identity.
 * @returns the archived Story projection.
 */
@Remote('archive') async archive(request: StoryRequest): Promise<StoryValue>

/**
 * Move one Story to the top of the recent list.
 * @param request - Story identity.
 * @returns the touched Story projection.
 */
@Remote('touch') async touch(request: StoryRequest): Promise<StoryValue>

/**
 * Archive one Story-owned scene Session.
 * @param request - Registered Session identity.
 * @returns its changed owning Story projection.
 */
@Remote('archiveSession') async archiveSession(request: StorySessionRequest): Promise<StoryValue>

/**
 * Select one active scene as current.
 * @param request - Story and active scene identities.
 * @returns the changed Story projection.
 */
@Remote('selectScene') async selectScene(request: StorySelectSceneRequest): Promise<StoryValue>

/**
 * Commit structured Director planning without accepting character dialogue or autonomous action fields.
 * @param request - Story, authoring Session, and strict Brief fields.
 * @returns the changed Story projection with its durable Plot Ledger.
 */
@Remote('commitDirectorBrief') async commitDirectorBrief(request: StoryDirectorBriefRequest): Promise<StoryValue>

/**
 * Resume every unfinished Actor in one exact Director Run checkpoint.
 * @param request - Story and exact current Run revision.
 * @returns the changed Story projection after dispatch settles.
 */
@Remote('resumeDirectorRun') async resumeDirectorRun(request: StoryDirectorRunRequest): Promise<StoryValue>

/**
 * Retry one failed or cancelled Actor in one exact Director Run checkpoint.
 * @param request - Story, exact current Run revision, and Actor identity.
 * @returns the changed Story projection after that Actor settles.
 */
@Remote('retryDirectorRunActor') async retryDirectorRunActor(request: StoryDirectorRunActorRequest): Promise<StoryValue>

/**
 * Pause one exact Director Run and abort its active Actor attempts.
 * @param request - Story and exact current Run revision.
 * @returns the paused Story projection.
 */
@Remote('pauseDirectorRun') async pauseDirectorRun(request: StoryDirectorRunRequest): Promise<StoryValue>

/**
 * Cancel one exact Director Run terminally.
 * @param request - Story and exact current Run revision.
 * @returns the terminally cancelled Story projection.
 */
@Remote('cancelDirectorRun') async cancelDirectorRun(request: StoryDirectorRunRequest): Promise<StoryValue>

/**
 * Skip one incomplete Actor in one exact Director Run checkpoint.
 * @param request - Story, exact current Run revision, and Actor identity.
 * @returns the changed Story projection.
 */
@Remote('skipDirectorRunActor') async skipDirectorRunActor(request: StoryDirectorRunActorRequest): Promise<StoryValue>

/**
 * Cancel one active Actor attempt without cancelling its Director Run.
 * @param request - Story, exact current Run revision, and Actor identity.
 * @returns the resumable Story projection.
 */
@Remote('cancelDirectorRunActor') async cancelDirectorRunActor(request: StoryDirectorRunActorRequest): Promise<StoryValue>

/**
 * Replace the player-visible Director Outline over an exact revision.
 * @param request - Story, expected revision, complete player content, and audit reason.
 * @returns the changed Story projection with its durable Director Outline.
 */
@Remote('updateDirectorOutline') async updateDirectorOutline(request: StoryDirectorOutlineUpdateRequest): Promise<StoryValue>

/**
 * Accept or reject one queued Director Outline suggestion.
 * @param request - Story, exact revision, suggestion identity, and player decision.
 * @returns the changed Story projection after the suggestion decision.
 */
@Remote('resolveDirectorOutlineSuggestion') async resolveDirectorOutlineSuggestion( request: StoryDirectorOutlineSuggestionRequest, ): Promise<StoryValue>

/**
 * Establish a typed player-selected narrative direction.
 * @param request - Story and exact-revision direction input.
 * @returns the changed Story projection.
 */
@Remote('chooseDirection') async chooseDirection(request: StoryChooseDirectionRequest): Promise<StoryValue>

/**
 * Apply a typed player world intervention.
 * @param request - Story and exact-revision world patch input.
 * @returns the changed Story projection.
 */
@Remote('interveneWorld') async interveneWorld(request: StoryInterveneWorldRequest): Promise<StoryValue>

/**
 * Establish player-authored speech as one Actor.
 * @param request - Story, Actor, audience, and exact-revision speech input.
 * @returns the changed Story projection.
 */
@Remote('speakAs') async speakAs(request: StorySpeakAsRequest): Promise<StoryValue>

/**
 * Establish a player-authored Actor action.
 * @param request - Story, Actor, audience, and exact-revision action input.
 * @returns the changed Story projection.
 */
@Remote('actAs') async actAs(request: StoryActAsRequest): Promise<StoryValue>

/**
 * Settle one captured Actor event into authoritative world truth.
 * @param request - Story and exact-revision settlement decision.
 * @returns the changed Story projection.
 */
@Remote('settleActorWorldEvent') async settleActorWorldEvent(request: StorySettleActorWorldEventRequest): Promise<StoryValue>

/**
 * Approve or reject complete source-processing units over exact revisions.
 * @param request - Story identity and original references or observed revisions.
 * @returns The Story after atomic review; stale proposal or note revisions reject.
 */
@Remote('reviewContext') async reviewContext(request: StoryContextReviewRequest): Promise<StoryValue>

/**
 * Edit pending short memories and their source-processing decision together.
 * @param request - Story identity and original references or observed revisions.
 * @returns The Story with the pending unit edited, without activating its notes.
 */
@Remote('editContext') async editContext(request: StoryContextEditRequest): Promise<StoryValue>

/**
 * Keep an original in one viewer's active context regardless of approval.
 * @param request - Story identity and original references or observed revisions.
 * @returns The Story with an explicit viewer-specific original pin.
 */
@Remote('pinContext') async pinContext(request: StoryContextPinRequest): Promise<StoryValue>

/**
 * Read a source from the active Story index, including offline durable Sessions.
 * @param request - Story identity and original references or observed revisions.
 * @returns The active source’s complete original content, including offline logs.
 */
@Remote('contextSource') async contextSource(request: StoryContextSourceRequest): Promise<StoryContextSourceValue>

/**
 * Create a player-reviewable long-form memory.
 * @param request - Story and exact-revision memory proposal.
 * @returns the changed Story projection.
 */
@Remote('proposeMemory') async proposeMemory(request: StoryProposeMemoryRequest): Promise<StoryValue>

/**
 * Approve or reject one memory proposal.
 * @param request - Story, exact revision, memory identity, and review decision.
 * @returns the changed Story projection.
 */
@Remote('reviewMemory') async reviewMemory(request: StoryReviewMemoryRequest): Promise<StoryValue>

/**
 * Replace one memory entry's editable content over the exact current revision.
 * @param request - Story and exact-revision memory replacement.
 * @returns the changed Story projection.
 */
@Remote('updateMemory') async updateMemory(request: StoryUpdateMemoryRequest): Promise<StoryValue>

/**
 * Begin one bounded durable group discussion.
 * @param request - Story, participants, topic, round budget, and exact revision.
 * @returns the changed Story projection.
 */
@Remote('startDiscussion') async startDiscussion(request: StoryStartDiscussionRequest): Promise<StoryValue>

/**
 * Queue one participant for the discussion floor.
 * @param request - Story, discussion, participant, and exact revision.
 * @returns the changed Story projection.
 */
@Remote('requestDiscussionFloor') async requestDiscussionFloor(request: StoryRequestDiscussionFloorRequest): Promise<StoryValue>

/**
 * Pause automatic discussion dispatch for an explicit player request.
 * @param request - Story, discussion, exact revision, and intervention kind.
 * @returns the changed Story projection.
 */
@Remote('requestDiscussionIntervention') async requestDiscussionIntervention( request: StoryRequestDiscussionInterventionRequest, ): Promise<StoryValue>

/**
 * Clear an acknowledged player request and allow automatic floor dispatch to continue.
 * @param request - Story, discussion, and exact discussion-state revision.
 * @returns the changed Story projection.
 */
@Remote('clearDiscussionIntervention') async clearDiscussionIntervention( request: StoryClearDiscussionInterventionRequest, ): Promise<StoryValue>

/**
 * Record one turn from the exact current discussion speaker.
 * @param request - Story and exact-revision discussion turn.
 * @returns the changed Story projection.
 */
@Remote('recordDiscussionTurn') async recordDiscussionTurn(request: StoryRecordDiscussionTurnRequest): Promise<StoryValue>

/**
 * Complete or cancel one durable discussion.
 * @param request - Story, discussion, exact revision, and terminal status.
 * @returns the changed Story projection.
 */
@Remote('closeDiscussion') async closeDiscussion(request: StoryCloseDiscussionRequest): Promise<StoryValue>

/**
 * Replace the safe context recipe over an exact revision.
 * @param request - Story, exact revision, and complete Director/Actor recipes.
 * @returns the changed Story projection.
 */
@Remote('updateContextRecipe') async updateContextRecipe(request: StoryUpdateContextRecipeRequest): Promise<StoryValue>

/**
 * Export a versioned complete Story Package including storybook and Session logs.
 * @param request - Story to export.
 * @returns the validated portable package JSON.
 */
@Remote('exportPackage') async exportPackage(request: StoryRequest): Promise<StoryPackageExportValue>

/**
 * Import a version-5 Story Package under fresh Story and Session identities.
 * @param request - Serialized version-5 Story Package.
 * @returns the newly imported Story projection and scene identity.
 */
@Remote('importPackage') async importPackage(request: StoryPackageImportRequest): Promise<StoryCreateValue>

/**
 * Query bounded instance people and the selected personal perspective.
 * @param request - Scene, author view, or authorized observer selection.
 * @returns one people page and observer-owned cognition.
 */
@Remote('characterWorkspace') async characterWorkspace(request: StoryCharacterQuery): Promise<StoryCharacterWorkspaceValue>

/**
 * Save a player-authored instance person; authoring templates remain independent.
 * @param request - Definition draft and exact registry revision.
 * @returns the refreshed author workspace.
 */
@Remote('saveCharacter') async saveCharacter(request: StoryCharacterSaveRequest): Promise<StoryCharacterWorkspaceValue>

/**
 * Apply a player correction through the existing Actor log, or its unprovisioned seed.
 * @param request - Owner and exact-revision judgment changes.
 * @returns the refreshed personal workspace.
 */
@Remote('updateKnowledge') async updateKnowledge(request: StoryKnowledgeUpdateRequest): Promise<StoryCharacterWorkspaceValue>

/**
 * Preview or explicitly collect a character into a base template; live stories receive no update.
 * @param request - Target template, opt-in contents, revisions, and accepted preview.
 * @returns the exact proposed or saved template document.
 */
@Remote('collectCharacter') async collectCharacter(request: StoryCharacterCollectRequest): Promise<StorybookAuthoringValue>

/**
 * Return private autonomous-character state for the player's author panel.
 * @param request - Story whose registered and live Actors are projected.
 * @returns the complete merged Actor-state list.
 */
@Remote('actorStates') async actorStates(request: StoryRequest): Promise<StoryActorStatesValue>

/**
 * Apply player-authored state corrections without changing the storybook baseline.
 * @param request - target owner and exact field revisions.
 * @returns the updated player-visible character list.
 */
@Remote('updateState') async updateState(request: StoryStateUpdateRequest): Promise<StoryActorStatesValue>

/**
 * Replace one revisioned character turning point after player review.
 * @param request - Story, Actor, revision, and replacement turning-point content.
 * @returns the refreshed current Actor-state projection.
 */
@Remote('updateActorTurningPoint') async updateActorTurningPoint(request: StoryUpdateActorTurningPointRequest): Promise<StoryActorStatesValue>

/**
 * Read the complete player-editable storybook without exposing its managed path.
 * @param request - Story whose world, Director guidance, and cast are read.
 * @returns canonical JSON and its exact save revision.
 */
@Remote('storybook') async storybook(request: StoryRequest): Promise<StorybookAuthoringValue>

/**
 * Read effective Director and per-Actor prompts with baseline and override provenance.
 * @param request - Story whose context settings are read.
 * @returns the storybook baselines, Story overrides, effective values, and revisions.
 */
@Remote('prompts') async prompts(request: StoryRequest): Promise<StoryPromptSettingsValue>

/**
 * Copy or clear one audience's style baseline, run override, or current-scene guidance.
 * @param request - Exact book or prompt revision and recipient-scoped guidance.
 * @returns the refreshed context settings and provenance.
 */
@Remote('updateStyle') async updateStyle(request: StoryStyleUpdateRequest): Promise<StoryPromptSettingsValue>

/**
 * Update a prompt baseline or exact-revision override.
 * @param request - audience, replacement, and loaded book or prompt revision.
 * @returns the refreshed effective settings and provenance.
 */
@Remote('updatePrompt') async updatePrompt(request: StoryPromptUpdateRequest): Promise<StoryPromptSettingsValue>

/**
 * Update the shared reasoning-language baseline or current Story override.
 * @param request - Exact-revision reasoning-language mutation and storage scope.
 * @returns the refreshed context settings and provenance.
 */
@Remote('updateReasoningLanguage') async updateReasoningLanguage( request: StoryReasoningLanguageUpdateRequest, ): Promise<StoryPromptSettingsValue>

/**
 * Update one Director/Actor policy or tool-guidance baseline or Story override.
 * @param request - Exact-revision context-rule mutation and storage scope.
 * @returns the refreshed context settings and provenance.
 */
@Remote('updateContextRule') async updateContextRule(request: StoryContextRuleUpdateRequest): Promise<StoryPromptSettingsValue>

/**
 * Preview the effective Director or Actor context after visibility filtering.
 * @param request - Story and model audience to inspect.
 * @returns ordered sections with source, permission, visibility, and inclusion reason.
 */
@Remote('contextPreview') async contextPreview(request: StoryContextPreviewRequest): Promise<StoryContextPreviewValue>

/**
 * Reconstruct the sender-serialized context that produced one Story-owned AI event.
 * @param request - Story ownership, source Session, and producing event boundary.
 * @returns request coordinates and JSON built by the sender's serializer from the original log.
 */
@Remote('requestContextPreview') async requestContextPreview(request: StoryRequestContextPreviewRequest): Promise<StoryRequestContextPreviewValue>

/**
 * Replace the player-authored storybook while the prior revision remains current.
 * @param request - Story identity, exact revision, and complete replacement JSON.
 * @returns canonical saved JSON and its new revision.
 */
@Remote('updateStorybook') async updateStorybook(request: StorybookUpdateRequest): Promise<StorybookAuthoringValue>

/**
 * Stream a complete baseline followed by Story changes.
 * @param signal - Generation cancellation.
 * @returns the baseline and ordered incremental updates.
 */
@Remote({ mode: 'stream' }) follow(signal: AbortSignal): AsyncIterable<StoryFollowFrame>
```

Source: [`packages/api/story-controller/src/index.ts`](../../packages/api/story-controller/src/index.ts)

<a id="ctxstoryhome--storyhome"></a>

### `ctx.storyHome` — `StoryHome`

Host service owning the one physical root and every managed story directory.

```ts cordis-catalog
/**
 * Resolve one controlled top-level data path.
 * @param area - Managed top-level area.
 * @param segments - Additional trusted path segments.
 * @returns an absolute path below the Storyweaver root.
 */
path(area: StoryHomeArea, ...segments: readonly string[]): string

/**
 * Resolve one managed story path from its opaque identity.
 * @param storyId - Valid Story id.
 * @param segments - Additional trusted path segments.
 * @returns an absolute path below stories/<StoryId>.
 */
storyPath(storyId: string, ...segments: readonly string[]): string

/**
 * Ensure the physical aggregate skeleton for a Story exists.
 * @param storyId - Story identity.
 * @returns resolution after every directory exists.
 */
async ensureStory(storyId: string): Promise<void>

/**
 * Copy only player-authored baseline material into a fresh Story aggregate.
 * Runtime, exports, and prior Session state are deliberately excluded.
 * @param sourceStoryId - Story whose authored setting is reused.
 * @param targetStoryId - Fresh Story receiving that setting.
 */
async copyBaseline(sourceStoryId: string, targetStoryId: string): Promise<void>

/**
 * Move one managed Story aggregate into the application trash.
 * @param storyId - Story whose managed directory is removed from active storage.
 * @returns the opaque trash entry used for rollback when a registry write fails.
 */
async trashStory(storyId: string): Promise<string>

/**
 * Restore a just-staged Story deletion after its canonical registry write failed.
 * @param storyId - Original Story identity.
 * @param trashEntry - Exact entry returned by {@link trashStory}.
 */
async restoreTrashedStory(storyId: string, trashEntry: string): Promise<void>

/**
 * Write the human-readable derived Story manifest. Canonical state remains
 * in the Story domain; startup can regenerate this file at any time.
 * @param storyId - Story identity.
 * @param manifest - JSON-safe public Story metadata.
 * @returns resolution after the manifest is replaced.
 */
async writeManifest(storyId: string, manifest: object): Promise<void>
```

Source: [`packages/story/story-home/src/index.ts`](../../packages/story/story-home/src/index.ts)

<a id="ctxstoryregistry--storyregistry"></a>

### `ctx.storyRegistry` — `StoryRegistry`

Canonical Story registry with no Workspace or historical Session bootstrap.

```ts cordis-catalog
/**
 * Instantiate story-local people once; reads and previews never initialize them.
 * @param storyId - Independent runtime story.
 * @param book - Authoring snapshot used only for initialization.
 * @returns persisted story including its independent registry.
 */
initializeCharacters(storyId: StoryId, book: StorybookDocument): Promise<Story>

/**
 * Create or revise one instance person with optimistic concurrency and retained revisions.
 * @param storyId - Owning independent story.
 * @param expectedRevision - Exact registry revision shown to the writer.
 * @param input - Complete revisioned character definition; IDs are generated by the host for creation.
 * @returns updated story; failed validation changes nothing.
 */
saveCharacter(storyId: StoryId, expectedRevision: number, input: StoryCharacter): Promise<Story>

/**
 * Correct cognition before an Actor Session exists; later writes belong to that Actor's log.
 * @param storyId - Owning story.
 * @param actorId - Unprovisioned person.
 * @param changes - Exact-revision compensating changes.
 * @returns durable updated initial cognition, retaining every prior revision.
 */
correctUnprovisionedKnowledge(storyId: StoryId, actorId: string, changes: readonly import('./knowledge.ts').KnowledgeChange[]): Promise<Story>

/**
 * Create one empty Story with its managed physical aggregate.
 * @param title - Initial display title; blank values are rejected.
 * @param premise - Optional player-facing premise.
 * @param templateId - Stable authored-setting identity; omitted uses the new StoryId.
 * @returns the newly durable Story.
 */
create(title: string = '未命名故事', premise: string = '', templateId?: string): Promise<Story>

/**
 * Resolve one Story by identity.
 * @param id - Story identity.
 * @returns the stable entity or undefined.
 */
get(id: StoryId): Story | undefined

/**
 * Return Stories ordered by recent registry mutation.
 * @param options - Include archived aggregates when requested.
 * @returns a fresh ordered entity array.
 */
list(options: { readonly includeArchived?: boolean } = {}): Story[]

/**
 * Return a detached validated record for versioned Story Package export.
 * @param storyId - Story whose canonical record is exported.
 * @returns a detached validated Story record.
 */
exportRecord(storyId: StoryId): StoryRecord

/**
 * Import one already-remapped Story Package record under a fresh Story identity.
 * @param input - Validated record whose internal Session ids are already remapped.
 * @returns the newly durable Story.
 */
importRecord(input: StoryRecord): Promise<Story>

/**
 * Resolve the Story and role owning one Session.
 * @param sessionId - Session identity.
 * @returns ownership metadata, or undefined for an unregistered Session.
 */
storyForSession(sessionId: SessionId): StorySessionOwner | undefined

/**
 * Return the Host-only runtime cwd for a Story Session.
 * @param storyId - Story identity.
 * @returns the managed .runtime path.
 */
runtimePath(storyId: StoryId): string

/**
 * Rename one Story.
 * @param storyId - Story identity.
 * @param title - Replacement display title.
 * @returns the changed Story.
 */
setTitle(storyId: StoryId, title: string): Promise<Story>

/**
 * Replace one Story's premise.
 * @param storyId - Story identity.
 * @param premise - Replacement premise.
 * @returns the changed Story.
 */
setPremise(storyId: StoryId, premise: string): Promise<Story>

/**
 * Persist a structured Director Brief without granting it character speech or action authority.
 * @param storyId - Story whose Plot Ledger is updated.
 * @param directorSessionId - active scene or control Session authoring the Brief.
 * @param input - strict planning fields over an exact Ledger revision.
 * @returns the changed Story after the Brief consumes pending NPC tool events.
 */
commitDirectorBrief( storyId: StoryId, directorSessionId: SessionId, input: DirectorBriefInput, ): Promise<Story>

/**
 * Replace the Host-managed physical cast before committing the next Director Brief.
 * Scene changes are rejected while a run or discussion still owns the current cast.
 * @param storyId - Story whose physical scene changes.
 * @param input - Exact-revision scene location and complete present Actor set.
 * @returns the changed durable Story.
 */
stageScene(storyId: StoryId, input: DirectorSceneCastInput): Promise<Story>

/**
 * Initialize objective authored fields once per Story.
 * @param storyId - target Story.
 * @param initial - objective authored fields.
 * @param actorIds - validated storybook cast.
 * @returns the initialized Story.
 */
initializeWorldState(storyId: StoryId, initial: readonly StateInitialValue[], actorIds: readonly string[]): Promise<Story>

/**
 * Commit a revisioned world-state batch and its observable consequences.
 * @param storyId - target Story.
 * @param input - world mutation and audience.
 * @returns the updated Story.
 */
changeWorldState(storyId: StoryId, input: import('./types.ts').WorldStateChangeInput): Promise<Story>

/**
 * Establish one objective Director narration over an exact World revision.
 * @param storyId - Story whose World receives the narration.
 * @param input - Narration and expected World revision to commit.
 * @returns the updated Story after the narration is accepted.
 */
narrate(storyId: StoryId, input: DirectorNarrationInput): Promise<Story>

/**
 * Persist the exact Actors selected for one resumable Director dispatch attempt.
 * @param storyId - Story whose current Director Run advances.
 * @param directorSessionId - Scene or control Session that owns the run.
 * @param expectedRunRevision - Exact current Run revision.
 * @param attempts - Host-minted ownership intervals for selected incomplete Actors.
 * @returns the changed durable Story projection.
 */
beginDirectorDispatch( storyId: StoryId, directorSessionId: SessionId, expectedRunRevision: number, attempts: readonly DirectorActorDispatchAttemptInput[], ): Promise<Story>

/**
 * Requeue the exact completed Actor that currently owns an active discussion floor.
 * @param storyId - Story whose discussion is advancing.
 * @param directorSessionId - Director Session that owns the current Run.
 * @param expectedRunRevision - Exact current Run revision.
 * @param discussionId - Active discussion granting the floor.
 * @param actorId - Completed current speaker to requeue.
 * @returns the changed durable Story projection.
 */
requeueDiscussionSpeaker( storyId: StoryId, directorSessionId: SessionId, expectedRunRevision: number, discussionId: string, actorId: string, ): Promise<Story>

/**
 * Settle completed and failed Actors without discarding accepted event references.
 * @param storyId - Story whose current Director Run settles.
 * @param directorSessionId - Scene or control Session that owns the run.
 * @param outcomes - Per-Actor completion or classified failure results.
 * @returns the changed durable Story projection.
 */
settleDirectorDispatch( storyId: StoryId, directorSessionId: SessionId, outcomes: readonly DirectorActorDispatchOutcome[], ): Promise<Story>

/**
 * Pause the exact current Director Run checkpoint.
 * @param storyId - Story whose active Run pauses.
 * @param expectedRunRevision - Exact current Run revision.
 * @returns the changed durable Story.
 */
pauseDirectorRun(storyId: StoryId, expectedRunRevision: number): Promise<Story>

/**
 * Cancel the exact current Director Run terminally.
 * @param storyId - Story whose active Run is cancelled.
 * @param expectedRunRevision - Exact current Run revision.
 * @returns the changed durable Story.
 */
cancelDirectorRun(storyId: StoryId, expectedRunRevision: number): Promise<Story>

/**
 * Skip one incomplete Actor over the exact current Director Run revision.
 * @param storyId - Story whose Actor checkpoint changes.
 * @param expectedRunRevision - Exact current Run revision.
 * @param actorId - Incomplete Actor to mark skipped.
 * @returns the changed durable Story.
 */
skipDirectorRunActor( storyId: StoryId, expectedRunRevision: number, actorId: string, ): Promise<Story>

/**
 * Cancel one owned Actor attempt over the exact current Director Run revision.
 * @param storyId - Story whose Actor attempt is cancelled.
 * @param expectedRunRevision - Exact current Run revision.
 * @param actorId - Running Actor whose owned attempt is cancelled.
 * @returns the changed durable Story.
 */
cancelDirectorRunActor( storyId: StoryId, expectedRunRevision: number, actorId: string, ): Promise<Story>

/**
 * Replace player-editable Director Outline content over an exact revision.
 * @param storyId - Story whose private plan is replaced.
 * @param expectedRevision - Exact current Outline revision.
 * @param input - Complete player-editable Outline fields.
 * @param reason - Player-facing audit reason.
 * @returns the changed durable Story.
 */
replaceDirectorOutline( storyId: StoryId, expectedRevision: number, input: DirectorOutlinePlayerInput, reason: string, ): Promise<Story>

/**
 * Apply or queue one Director-authored Outline patch over an exact revision.
 * @param storyId - Story whose private plan is patched.
 * @param input - Strict category patch and audit reason.
 * @returns the changed durable Story.
 */
patchDirectorOutline(storyId: StoryId, input: DirectorOutlinePatchInput): Promise<Story>

/**
 * Resolve one pending Director Outline suggestion as an explicit player action.
 * @param storyId - Story that owns the suggestion.
 * @param expectedRevision - Exact current Outline revision.
 * @param suggestionId - Pending suggestion identity.
 * @param accept - Whether the player accepts the proposed patch.
 * @returns the changed durable Story.
 */
resolveDirectorOutlineSuggestion( storyId: StoryId, expectedRevision: number, suggestionId: string, accept: boolean, ): Promise<Story>

/**
 * Persist a player-selected direction through the typed PlayerAuthority boundary.
 * @param storyId - Story whose direction changes.
 * @param input - Exact-revision direction and audience.
 * @returns the changed durable Story.
 */
chooseDirection(storyId: StoryId, input: PlayerDirectionInput): Promise<Story>

/**
 * Apply an explicit player intervention to authoritative world facts.
 * @param storyId - Story whose world changes.
 * @param input - Exact-revision facts, patch, and audience.
 * @returns the changed durable Story.
 */
interveneWorld(storyId: StoryId, input: PlayerWorldInterventionInput): Promise<Story>

/**
 * Establish player-authored speech as one active Story Actor.
 * @param storyId - Story whose Actor speaks.
 * @param input - Exact-revision Actor speech and audience.
 * @returns the changed durable Story.
 */
speakAs(storyId: StoryId, input: PlayerSpeechInput): Promise<Story>

/**
 * Establish a player-authored Actor action and its explicit world patch.
 * @param storyId - Story whose Actor acts.
 * @param input - Exact-revision Actor action, facts, patch, and audience.
 * @returns the changed durable Story.
 */
actAs(storyId: StoryId, input: PlayerActionInput): Promise<Story>

/**
 * Settle one captured Actor speech/action into world truth and scoped perceptions.
 * @param storyId - Story containing the sourced Actor event.
 * @param input - Exact-revision settlement, patch, and audience delivery.
 * @returns the changed durable Story.
 */
settleActorWorldEvent(storyId: StoryId, input: ActorWorldSettlementInput): Promise<Story>

/**
 * Atomically settle captured Actor speech/actions against one world revision.
 * Every decision is validated before any fact, event, perception, or discussion state is changed.
 * @param storyId - Story containing every sourced Actor event.
 * @param input - Exact-revision settlement transaction.
 * @returns the changed durable Story.
 */
settleActorWorldEvents(storyId: StoryId, input: ActorWorldSettlementBatchInput): Promise<Story>

/**
 * Create a player-reviewable scene or arc memory proposal.
 * @param storyId - Story whose memory receives a proposal.
 * @param input - Exact-revision proposal content and visibility.
 * @returns the changed durable Story.
 */
proposeMemory(storyId: StoryId, input: StoryMemoryProposalInput): Promise<Story>

/**
 * Commit source-backed Actor matters through the serialized Story writer.
 * @param storyId - owning Story.
 * @param actorId - authenticated, active Actor author.
 * @param inputs - accepted source events and idempotent annotation ids.
 * @param attemptId - completed dispatch attempt that owns the submission.
 * @returns Story with the new matters available to permitted viewers.
 */
recordContinuity( storyId: StoryId, actorId: string, inputs: readonly StoryContinuityInput[], attemptId: DirectorRunAttemptIdBrand, ): Promise<Story>

/**
 * Append source pointers and pending notes through the serialized writer. Actor attempts must be accepted.
 * @param storyId - Story whose retention state is changed.
 * @param sources - Accepted original locations and captured visibility.
 * @param proposal - Optional pending update; Actor submission requires an accepted attempt.
 * @returns The durably updated Story; unaccepted Actor attempts cannot write proposals.
 */
recordContext(storyId: StoryId, sources: readonly ContextSource[], proposal?: { scope: string submissionId: string turnId: string units: readonly ContextUpdateUnit[] attemptId?: DirectorRunAttemptIdBrand }): Promise<Story>

/**
 * Edit a pending source-processing unit without activating it.
 * @param storyId - Story whose retention state is changed.
 * @param id - Pending proposal identity.
 * @param revision - Exact revision observed by the player.
 * @param unit - Complete edited source-processing unit.
 * @returns The Story with a revised pending proposal; stale revisions reject.
 */
editContext(storyId: StoryId, id: string, revision: number, unit: ContextUpdateUnit): Promise<Story>

/**
 * Approve complete units atomically and refresh the Director's derived fact/thread projection.
 * @param storyId - Story whose retention state is changed.
 * @param reviews - Atomic approval or rejection decisions and observed revisions.
 * @returns The Story with atomic review decisions and derived Brief facts and threads.
 */
reviewContext(storyId: StoryId, reviews: readonly { id: string; revision: number; approve: boolean }[]): Promise<Story>

/**
 * Player control of original-text retention for an exact knowledge scope.
 * @param storyId - Story whose retention state is changed.
 * @param sourceId - Original source identity.
 * @param scope - Exact Director or Actor knowledge scope.
 * @param pinned - Whether the original must remain in this viewer’s context.
 * @returns The Story with the viewer-specific original pin changed.
 */
pinContext(storyId: StoryId, sourceId: string, scope: string, pinned: boolean): Promise<Story>

/**
 * Approve or reject one memory proposal over the exact current revision.
 * @param storyId - Story whose memory is reviewed.
 * @param expectedRevision - Exact current memory revision.
 * @param memoryId - Proposed memory identity.
 * @param approve - Whether the proposal becomes active.
 * @returns the changed durable Story.
 */
reviewMemory(storyId: StoryId, expectedRevision: number, memoryId: string, approve: boolean): Promise<Story>

/**
 * Replace one memory entry's player-editable content over the exact current revision.
 * @param storyId - Story whose memory entry changes.
 * @param input - Exact-revision memory replacement.
 * @returns the changed durable Story.
 */
updateMemory(storyId: StoryId, input: StoryMemoryUpdateInput): Promise<Story>

/**
 * Begin one bounded durable group discussion among active Actors.
 * @param storyId - Story that owns the discussion.
 * @param input - Exact revision, topic, participants, and round budget.
 * @returns the changed durable Story.
 */
startDiscussion( storyId: StoryId, input: { readonly expectedRevision: number readonly topic: string readonly participantIds: readonly string[] readonly maxRounds: number readonly initiatedBy?: 'director' | 'player' | undefined }, ): Promise<Story>

/**
 * Queue an active participant for the next discussion floor.
 * @param storyId - Story that owns the discussion.
 * @param expectedRevision - Exact current discussion-state revision.
 * @param discussionId - Active discussion identity.
 * @param actorId - Participant requesting the floor.
 * @returns the changed durable Story.
 */
requestDiscussionFloor( storyId: StoryId, expectedRevision: number, discussionId: string, actorId: string, ): Promise<Story>

/**
 * Persist the current floor owner's autonomous discussion preference.
 * @param storyId - Story that owns the active discussion.
 * @param expectedRevision - Exact current discussion-state revision.
 * @param discussionId - Active discussion identity.
 * @param actorId - Current Actor floor owner.
 * @param intent - Actor-declared stance, eagerness, action, and optional hand-off.
 * @returns the changed durable Story.
 */
updateDiscussionParticipantIntent( storyId: StoryId, expectedRevision: number, discussionId: string, actorId: string, intent: { readonly stance?: string | undefined readonly eagerness: 'low' | 'medium' | 'high' readonly action: 'speak' | 'pass' | 'conclude' readonly nextSpeakerId?: string | undefined }, ): Promise<Story>

/**
 * Accept an independently completed preparation without a shared revision race.
 * @param storyId - owning Story.
 * @param discussionId - exact discussion generation.
 * @param actorId - prepared participant.
 * @param intent - private stance and eagerness; preparation always passes silently.
 * @param attemptId - completed attempt, or omission for an explicitly skipped Actor.
 * @returns Story after removing that participant from the preparation barrier.
 */
completeDiscussionPreparation( storyId: StoryId, discussionId: string, actorId: string, intent: { readonly stance?: string | undefined; readonly eagerness: 'low' | 'medium' | 'high' }, attemptId?: DirectorRunAttemptIdBrand, ): Promise<Story>

/**
 * Pause automatic discussion dispatch for an explicit player intervention.
 * @param storyId - Story that owns the discussion.
 * @param expectedRevision - Exact current discussion-state revision.
 * @param discussionId - Active discussion identity.
 * @param intervention - Whether the player requests a turn or a conclusion.
 * @returns the changed durable Story.
 */
requestDiscussionIntervention( storyId: StoryId, expectedRevision: number, discussionId: string, intervention: 'speak' | 'conclude', ): Promise<Story>

/**
 * Clear one Director-acknowledged discussion intervention.
 * @param storyId - Story that owns the discussion.
 * @param expectedRevision - Exact current discussion-state revision.
 * @param discussionId - Active discussion identity.
 * @returns the changed durable Story.
 */
clearDiscussionIntervention( storyId: StoryId, expectedRevision: number, discussionId: string, ): Promise<Story>

/**
 * Record one externally supplied discussion turn from the exact floor owner.
 * @param storyId - Story that owns the discussion.
 * @param input - Exact-revision speaker turn and optional event source.
 * @returns the changed durable Story.
 */
recordDiscussionTurn( storyId: StoryId, input: { readonly expectedRevision: number readonly discussionId: string readonly speakerId: string readonly text: string readonly action?: 'speak' | 'pass' | 'conclude' | undefined readonly sourceEventRef?: string | undefined }, ): Promise<Story>

/**
 * Complete or cancel one durable discussion.
 * @param storyId - Story that owns the discussion.
 * @param expectedRevision - Exact current discussion-state revision.
 * @param discussionId - Active discussion identity.
 * @param status - Terminal completion or cancellation state.
 * @returns the changed durable Story.
 */
closeDiscussion( storyId: StoryId, expectedRevision: number, discussionId: string, status: 'completed' | 'cancelled', ): Promise<Story>

/**
 * Copy or clear one audience's run style or current-scene instruction.
 * @param storyId - Story whose guidance changes.
 * @param expectedRevision - Exact current prompt-settings revision.
 * @param update - Profile override or instruction for the exact current scene.
 * @param actorIds - Authored cast used to validate the recipient.
 * @returns the changed durable Story.
 */
updateStyle(storyId: StoryId, expectedRevision: number, update: StyleUpdate, actorIds: readonly string[]): Promise<Story>

/**
 * Replace the Director prompt at its current revision.
 * @param storyId - Story whose override changes.
 * @param expectedRevision - exact loaded prompt revision.
 * @param prompt - replacement or undefined to inherit the storybook.
 * @returns the durably updated Story.
 */
updateDirectorPrompt( storyId: StoryId, expectedRevision: number, prompt: string | undefined, ): Promise<Story>

/**
 * Replace or clear the Story-local creation Agent prompt over an exact revision.
 * @param storyId - Story whose creation-task prompt changes.
 * @param expectedRevision - Exact current prompt-settings revision.
 * @param prompt - Replacement prompt, or undefined to inherit the workspace default.
 * @returns the changed durable Story.
 */
updateCreatorPrompt( storyId: StoryId, expectedRevision: number, prompt: string | undefined, ): Promise<Story>

/**
 * Replace or clear one Actor's Story-local prompt over an exact revision.
 * @param storyId - Story whose Actor override changes.
 * @param expectedRevision - Exact current prompt-settings revision.
 * @param actorId - Actor whose private prompt changes.
 * @param prompt - Replacement prompt, or undefined to inherit the storybook.
 * @returns the changed durable Story.
 */
updateActorPrompt( storyId: StoryId, expectedRevision: number, actorId: string, prompt: string | undefined, ): Promise<Story>

/**
 * Replace or clear the Story-local private-reasoning language over an exact revision.
 * @param storyId - Story whose reasoning-language instruction changes.
 * @param expectedRevision - Exact current prompt-settings revision.
 * @param language - Replacement language, or undefined to inherit the storybook.
 * @returns the changed durable Story.
 */
updateReasoningLanguage( storyId: StoryId, expectedRevision: number, language: string | undefined, ): Promise<Story>

/**
 * Replace or clear one Story-local policy/tool guidance override.
 * @param storyId - Story whose context-rule override changes.
 * @param expectedRevision - Exact current prompt-settings revision.
 * @param key - Director/Actor policy or capability-rule identity.
 * @param text - Replacement rule text, or undefined to inherit the storybook.
 * @returns the changed durable Story.
 */
updateContextRule( storyId: StoryId, expectedRevision: number, key: StoryContextRuleKey, text: string | undefined, ): Promise<Story>

/**
 * Replace the safe Director/Actor context recipe over an exact revision.
 * @param storyId - Story whose composition recipe changes.
 * @param expectedRevision - Exact current recipe revision.
 * @param input - Complete Director and Actor section recipes.
 * @returns the changed durable Story.
 */
updateContextRecipe( storyId: StoryId, expectedRevision: number, input: Pick<StoryContextRecipe, 'director' | 'actor'>, ): Promise<Story>

/**
 * Capture the complete tool-mutated Story state before a player scene turn.
 * @param storyId - Story whose runtime state is captured.
 * @returns the validated runtime snapshot.
 */
runtimeSnapshot(storyId: StoryId): StoryRuntimeSnapshot

/**
 * Restore one previously captured player-turn state while retaining authored settings and Session ownership.
 * @param storyId - Story whose runtime state is restored.
 * @param snapshot - Previously captured runtime snapshot.
 * @returns the changed durable Story.
 */
restoreRuntime(storyId: StoryId, snapshot: StoryRuntimeSnapshot): Promise<Story>

/**
 * Attach a Session under one semantic Story role.
 * @param storyId - Owning Story.
 * @param sessionId - Session to attach.
 * @param role - Scene, control, or private Actor role.
 * @param actorId - Required only for the Actor role.
 * @returns the changed Story.
 */
attachSession( storyId: StoryId, sessionId: SessionId, role: StorySessionRole = 'scene', actorId?: string, ): Promise<Story>

/**
 * Archive one Story-owned Session without erasing its audit identity.
 * @param sessionId - Registered Session.
 * @returns the changed Story.
 */
archiveSession(sessionId: SessionId): Promise<Story>

/**
 * Select one active scene as the Story's current scene.
 * @param storyId - Story identity.
 * @param sessionId - Active scene Session.
 * @returns the changed Story.
 */
setCurrentScene(storyId: StoryId, sessionId: SessionId): Promise<Story>

/**
 * Archive or restore an entire Story aggregate without deleting any file.
 * @param storyId - Story identity.
 * @param archived - Whether the Story should be archived.
 * @returns the changed Story.
 */
setArchived(storyId: StoryId, archived: boolean): Promise<Story>

/**
 * Assign the authored-setting identity used to group independent Story runs.
 * @param storyId - Story run to classify.
 * @param templateId - Stable storybook/template identity.
 * @returns the changed Story projection source.
 */
setTemplateId(storyId: StoryId, templateId: string): Promise<Story>

/**
 * Convert the final runtime Story of a storybook into an authored-settings anchor.
 * Authored files remain available while runtime projections and non-control
 * Session owners are cleared. The creator control Session stays attached so
 * the published creation task remains addressable and independently deletable.
 * @param storyId - Final runtime Story whose identity will retain the storybook.
 * @returns the durable template-only Story record.
 */
retainAsTemplate(storyId: StoryId): Promise<Story>

/**
 * Delete one Story run from the canonical registry and move its managed files to trash.
 * @param storyId - Story run to delete.
 */
delete(storyId: StoryId): Promise<void>

/**
 * Move a Story to the top of recency order.
 * @param storyId - Story identity.
 * @returns the changed Story.
 */
touch(storyId: StoryId): Promise<Story>
```

Types: [SessionId](core.md)

Source: [`packages/story/story/src/index.ts`](../../packages/story/story/src/index.ts)
<!-- END GENERATED cordis-surface -->

## Current foundation

The registry, Plot Ledger, strict Brief commit, world settlement, reviewed memory, durable discussion, context recipes, and Story Package transport are durable and path-free. Independent clock scheduling and richer asset semantics can build on the aggregate without reopening generic filesystem authority to Actors.

PlayView.discussionPreparations supplies chronological preparation boundaries for transcript insertion before public speech. The composer and navigation open discussion controls in an inspector independent of scroll position. Historical request inspection skips current author context construction; replay shares immutable unchanged records and copies only its final result.

Actor and director context assembly no longer imposes a total character ceiling. Recall pagination and observer isolation remain enforced. Automatic context includes all authorized, unrepresented history without an entry-count cap. Execution history and portable archives also retain native completed-turn timing alongside token accounting; narrative footers and request details display both. See the [context and timing decision](../../.agents/notes/implemented/feature/2026-09-11-context-length-and-native-timing.md).

CreativeSettingsView includes recipe (the saved effective ContextRecipe) and storybook (the ContextRecipe pinned at story creation), alongside bindings and global shared values. Reading the view does not synchronize or write. The client uses it for source previews in the book-scoped [context synchronization workspace](../../.agents/notes/implemented/feature/2026-09-11-context-sync-workspace.md).

CreativeSourceInput accepts either module or a nonempty modules array without duplicates, plus one source and expected binding/shared revisions. A binding command validates and applies the entire selection in one transaction; a missing shared value or revision conflict leaves every selected module unchanged.
