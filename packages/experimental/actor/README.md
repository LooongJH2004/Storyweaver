---
description: "Event-sourced autonomous roleplaying Actors and a separate god-view PlayerAuthority host API."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-actor

English | [中文](README.zh.md)

## Summary

`dsh-experimental-actor` turns an exact live dsh Agent into a persistent fictional Actor. The Actor deliberately speaks, acts, reflects, remembers, recalls, forgets, forms goals, and schedules intentions through typed operations. Every operation is a log-only Session event, and current state is replayed from that log. A separate trusted PlayerAuthority API can observe private state, choose story direction, intervene in the world, or speak and act through any Actor without falsifying the event's origin.

The package is an experimental foundation. It defines identity, autonomy, memory, authority, and audit semantics; environment resolution, autonomous wake scheduling, and a player UI remain separate layers.

A successful `actor/turn-closed` may carry sparse continuity source annotations. The Story integration validates their audience and ownership, establishes the referenced behavior, and then records the annotations idempotently. Actor rewind and Story runtime checkpoints restore both private state and these source-backed matters.

`actor/state-changed` records definition-driven private state. `actor/commit` stores a complete synchronous transaction as one durable event; staged reads include its prior operations, and validation failure publishes none of them. Player corrections use the same exact field revisions and retain compensating history. `playerInspectEvents` projects a dormant Actor directly from its retained log without starting a model request.

`HarnessActorExecutor` is the execution adapter for independent narrative instances. It creates or resumes an instance-scoped character session, submits semantic model changes through the application callback, and logs the frozen narrative request and receipt. It retains current-turn tool transactions while projecting earlier execution messages out of the next model request.

The independent actor submission supports discussion invitations through `discussion_request`; recipient references are resolved by the narrative application. Director scheduling exposes revision-bound invitation decisions through discussion control. The legacy Session Actor adapter explicitly rejects invitations instead of silently discarding them. Invitation tool fields and director guidance are recorded in request snapshots.

The actor tool describes an invitation as one issue needing reciprocal exchange, not a status round-up or a wait for external evidence. Director execution guidance defers requests whose answer depends on pending settlement or an outside person's choice, and avoids agenda-style scene cues. The director still decides whether to accept; these descriptions do not enforce literary quality. Settlement guidance keeps an attempted action's recorded actor as its performer when describing the result.

Private consolidation selects its own execution policy and missing-submission correction, without ordinary performance or discussion-floor instructions. Its correction requests silent context updates rather than behavior. The actor tool advertises only silent posture and context updates; ordinary turn fields remain absent from that request schema. The application still validates exact source coverage and rejects extra writes. Both actor and domain-derived director memory schemas explain that add omits note identity, other operations require an existing note ID and its exact note revision, and each change lists its own sources. Narrative executions report malformed JSON with its parser error and request a complete corrected object; they do not repair or commit malformed input. Ordinary actor requests retain their full schema. Private consolidation distinguishes assigned batch sources from a retained note’s prior evidence: revisions preserve prior sources automatically, so actors need not reprocess them.

Independent `context_update` proposals may attach episode details to a brief note. The schema asks for subjective experience, interpretation, impact and unresolved matters; `narrative_recall` can retrieve approved details by their retained reference. The application owns source validation, review and context replacement; attaching details does not grant automatic approval or access to another character's memory. For recall, a known record reference goes in query. sourceId is a continuation check, not a record selector; a new search omits sourceId and characterOffset, while continuation copies the returned fields with the same query.

Director transition guidance requires newly perceptible time or location to reach affected actors through shared or individual observations. Narration and scene cues do not update perceived evidence, and old agreement terms are not reissued as new observations to prompt recall. This is model guidance; the host does not infer recipients or broadcast literary prose.

Director finish instructions describe an ordered, single-pass actor list. A later actor can respond to earlier behavior within its own visibility; an earlier actor does not automatically receive another turn. Directors should place initiators before respondents and use discussion scheduling for repeated replies, while preserving player control and silence.

Actor instructions interpret relative deadlines from the originating experience and use newly perceived time changes to decide whether action is due. Private consolidation preserves that event-relative meaning, distinguishes plans from completion and retains uncertainty without inventing calendar dates. These are model instructions, not a host-maintained story clock or proof that every generated summary preserves temporal meaning.

Context-note briefs and recalled note details include sourceRevisionRange derived from their owner-visible original records, separately from the note version. This is evidence ordering, not fictional calendar time. Consolidation instructions distinguish uncertainty at an earlier event from questions still unresolved in the supplied perspective; later evidence outside the assigned batch cannot be claimed as an outcome proved by that batch. Originals and stored note versions remain unchanged.

Actor instructions permit fallible belief revision when perceived evidence contradicts an earlier claim; knowing the hidden explanation is not required. They discourage invented exceptions used solely to protect that claim and waiting for absolute certainty, while retaining character-motivated denial and trust. The instruction governs private choices rather than requiring evidence lectures in dialogue; it does not automatically change stored beliefs.

Independent action tools expose public or concealed visibility; the legacy Session adapter rejects concealed actions. Director observation supports shared perception and recipient supplement/replace modes, including in pending narration drafts. The host expands these into ordered evidence without an extra model call. These schema and guidance changes affect the model-visible prefix; no cache or acting-quality improvement is inferred from them.

Independent director tools include complete operation examples and nonempty-text hints. Their argument parser rejects extra root fields as well as invalid operation fields. NPC field guidance distinguishes turn disposition from physical posture, existing-state updates from new definitions, and private discussion preparation from public speech. See the [local-log protocol correction](../../../.agents/notes/implemented/bug-fix/2026-09-08-log-driven-tool-guidance.md) for evidence and limits; these wording changes alter request prefixes without establishing a measured model error-rate or cache improvement.

`director_observe` accepts flat settlement fields and commits objective evidence, audience-specific perceptions and optional narration together. `director_command` handles the remaining planning and scheduling operations. Both use the same execution fence and receipt log. Narration guidance separates an observable outcome from a character's subsequent reaction or disclosure; this is model guidance, not a semantic validator of literary text. Live drafts recognize the flat tool and previously recorded nested narration. Every director_observe call requires an explicit settles array: exact IDs and performer feedback when resolving pending world attempts, or [] when none is resolved. Omission is rejected before the observation is written; domain input and stored records retain their existing optional field. An outcome described only in prose leaves the attempt pending. Repair guidance preserves already published events instead of replaying their narration. Director discussion tools expose only closing and request decisions; player-only floor selection, intervention and resume operations are excluded and rejected by tool parsing.

Character records and lifecycle validation live in `roleplay-core`; this package interprets Session execution envelopes and rewind coordinates. Story integrations supply `ActorNarrativeReader`, containing only the bound character’s allowed sources, references, and initial cognition. Actor code cannot query the Story registry directly.

`HarnessRequestHistory` (`./request-history`) reads a live or persisted request boundary and delegates serialization to the original LLM provider. It never provisions an Actor. The application authorizes the narrative instance and perspective before supplying archived evidence. Exports retain full logs plus portable serialized requests; an unavailable serializer records its reason without discarding logs. Imported request lookup uses only supplied instance evidence and never falls through to the original live session. Unsupported reconstruction fails instead of substituting current context.

`HarnessDirectorExecutor` and `HarnessActorExecutor` share session acquisition, cancellation, request-history isolation, receipt logging and disposal through `HarnessExecutionSessions`. The director protocol invokes application commands and returns a response plan; it never mutates character state directly. Session keys distinguish a director from every character within the same instance. `HarnessRequestHistory` captures both kinds of execution and exports complete immutable log evidence without restoring an Agent.

Director inputs expose nested domain fields through the native tool schema. Request summaries include the native complete-turn usage fold and attempt count; portable archives retain these values. Live diagnostics retain earlier responses from the current execution.

Actor recall and both ordinary and private director recall share the domain schema descriptions for exact record lookup and continuation. A known record ID belongs in query; sourceId only accompanies a returned continuation. This guidance does not change search, authority or pagination behavior.

The actual-request regression verifies that long public expression preferences and scene cues appear before and after private consolidation but not inside it, for both actors and directors. Dedicated context-section snapshots retain the private request roles and order. This separation is performed by the narrative application; the Harness logs and executes the supplied request.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

Mount the service after the Agent registry, create a fresh Agent, and bind it before its first conversation turn:

```ts
import type { Context } from '@deepseek-ai/cordis'
import ActorService, { ActorId } from '@deepseek-ai/dsh-experimental-actor'

declare const ctx: Context
declare const sessionId: Parameters<typeof ctx.agentLoop.create>[0]

await ctx.plugin(ActorService)

const actor = ctx.agentLoop.create(sessionId, { provider: 'deepseek', model: 'deepseek-chat' })
ctx.actors.bind(actor, {
  id: ActorId('archive-keeper'),
  displayName: 'The Keeper',
  persona: 'Protects the archive, distrusts fire, and remembers promises.',
  capabilities: ['speak', 'act', 'reflect', 'memory', 'goals', 'schedule'],
})
```

An Actor Session must be fresh: inherited fork history is rejected, and binding after conversation has begun is rejected. Stable `ActorId` values are independent from display names and Session ids. The id is unique inside an owning Story, not process-global: two independent Story runs may keep separate live Actor Sessions for the same storybook character.

### Actor autonomy

The service exposes explicit operations rather than treating assistant prose as behavior:

- `speak()` and `act()` commit world-facing intents.
- `reflect()` commits fictional inner activity for trusted inspection.
- `remember()`, `recall()`, and `forget()` give the Actor deliberate memory control. Forgetting appends a tombstone; it never erases the audit record.
- `setGoal()` and `abandonGoal()` maintain revisioned self-chosen goals.
- `recordTurningPoint()` preserves a sparse, revisioned subjective interpretation of a durable belief, goal, relationship, conflict, identity, or memory change.
- `schedule()` records a future intention using a world-time trigger.
- `closeCurrentTurn()` records why the Actor stopped.

Only active memories appear in recall and model context. At core-memory capacity, the service first archives the least-important oldest active memory with a durable `core-memory-capacity` tombstone and then commits the new memory. Long-running Actors therefore do not fail a turn at capacity, and every eviction remains auditable.

### PlayerAuthority

The trusted host API deliberately does not model the player as one fictional character:

- `playerChooseDirection(controlSession, direction)` chooses a story direction.
- `playerInterveneWorld(controlSession, description)` changes or declares world state.
- `playerSpeakAs(actor, request)` and `playerActAs(actor, request)` replace any Actor's speech or action.
- `playerInspect(actor)` reads the god-view private projection, including thoughts, turning points, and forgotten-memory tombstones.
- `updateTurningPoint(actor, request)` edits, integrates, reverses, or rejects one turning point over its exact revision.

Embodied speech and action produce both a player-intervention event and a matching expression/action event with `origin: 'player'`. The story can treat the act as coming through that role, while audit and later reasoning can still distinguish it from the Actor's own choice.

<a id="understand-the-implementation"></a>
## Understand the implementation

The exact live Agent object is the authority credential. `ActorService` maps it to one stable fictional identity with revisioned author configuration and rejects stale Agent objects. It does not use bare `ActorId` as an authority boundary because the same authored identity can be live in separate Story runs; `find(actorId)` therefore returns a membership only when that id is process-locally unambiguous. Story orchestration resolves Actors through Story-owned Session registrations. Every Actor-owned value is stored in that Agent's own Session; actor-independent story and world interventions may be stored in a separate control Session.

[`src/fold.ts`](src/fold.ts) strictly decodes the event vocabulary and enforces descriptor identity, unique ids, memory tombstones, goal and turning-point revisions, embodied-player provenance, and once-per-turn closure. The [`./invariant`](src/invariant.ts) companion replays each candidate event against the committed prefix before append.

Author initialization commits state, memories, goals, and intentions atomically once per branch, independently of model mutation capabilities. The Host can revise name, persona, and granted capabilities with `configure` over an exact configuration revision; the stable Actor ID cannot change. These author settings are logged separately from NPC commits and survive fictional-state rewrites. Configuration changes preserve current state and lifecycle records. Current context exposes stable lifecycle source references for explaining dynamic-state changes.

<a id="dev-note"></a>
## Dev Note

The owning decision is [Autonomous Actor kernel foundation](../../../.agents/notes/implemented/feature/2026-08-28-autonomous-actor-kernel-foundation.md).

The independent `HarnessActorExecutor` also exposes `narrative_recall` through an application-supplied query callback. The callback binds instance, actor and narrative revision; tool arguments contain only the query and page. Shared execution lifecycle code authenticates the active Agent, rejects calls after cancellation or accepted completion, and keeps query results in the technical request history. The director protocol routes `recall` and player-reviewed `context-update` through the director application commands.

NPC guidance encourages natural introductions when a name matters, without requiring every stranger to be questioned. Director narration stays player-facing and perceptions stay explicitly addressed. The director is instructed to preserve decisive observable details and replace obsolete cues; actors respond to newer perceptions when a cue assumes an outdated situation. These are prompt requirements, not automatic narration filtering or semantic consistency validation. No additional model call is added. See [attributed character perception](../../../.agents/notes/implemented/feature/2026-09-11-attributed-character-perception.md).

Independent NPC execution treats floor assignments, knowledge checks and player ownership as private execution instructions, not fictional dialogue or shared character traits. Director cues describe one immediate choice or opportunity while leaving delivery to each character; after an offer, the director schedules the person who can answer it before requesting another round of teammate proposals. Saved private records preserve continuity without prescribing repeated speeches. See [character expression and context defaults](../../../.agents/notes/implemented/feature/2026-09-11-context-defaults-and-character-voice.md).

<a id="model-experience"></a>
## Model Experience

### Actor self-state projection

#### What the model sees

This domain package installs no prompt or tool by itself. When paired with [`@deepseek-ai/dsh-experimental-tool-actor`](../tool-actor/README.md), the model receives its persona, active memories, a bounded relevance-ranked character journey, active goals, scheduled intentions, and a bounded recent speech/action window. Thoughts, rejected turning points, and forgotten memories are excluded. Every visible state snapshot is assembled into the request header and therefore logged by the normal dsh request boundary.

#### Token effect

Actor domain events are log-only and do not become chat messages. The projected self-state costs tokens in proportion to active memory, at most six selected turning points, goals, intentions, and the bounded recent activity window. Compact tool receipts expose only state that was committed first.

#### KV Cache effect

The behavioral contract and current Actor configuration form the leading prefix. A projected memory, goal, intention, expression, or action change rewrites the dynamic self-state section and invalidates cache reuse from that section onward; private thoughts and forgotten-memory tombstones do not change it.

## Known Limitations and Deferred Work

- Speech and action are intents only; no environment adapter yet resolves success, witnesses, or consequences.
- Scheduled intentions are stored but no autonomous clock/scheduler wakes Actors yet.
- Active memories are replayed in-process with a simple case-insensitive text/tag recall; no semantic memory provider or checkpoint compaction exists yet.
- PlayerAuthority is a trusted host API; authentication, multiplayer permissions, and UI controls are not included.
- Story/world interventions are recorded but no world-state projection distributes them to affected Actors yet.
- The package is private and experimental; event and service contracts may change without migration support.

Private director consolidation keeps the same `director_command` envelope as ordinary execution: exactly one top-level `command`, with the operation and its fields inside. The private policy supplies the finish example and rejects an extra `arguments` wrapper through the existing schema. Argument repair does not commit fiction or waive source coverage.

Independent execution uses `HarnessActorExecutor`, `HarnessDirectorExecutor` and `HarnessRequestHistory`; the legacy Actor service described above is absent from the default narrative profile. Recorded response reconstruction separates text, reasoning and tool calls and never infers completion from a missing finish event. Portable evidence remains instance-scoped after import. Live readers coalesce Session event notifications, authorize each scope refresh and dispose their listeners on cancellation. `ExecutionModelSettings` owns the existing settings-provider integration; a selected route is sampled for each execution and frozen through its steps, with the actual route recorded in request headers.

Historical request details reuse the already loaded authorized event log for header reconstruction, avoiding a second persistence inspection in the same read. This does not cache evolving responses, resume a model, or alter request contents.

The independent director protocol uses live player ownership to distinguish observer automation from reserved player turns, even when authored prose calls the protagonist a player character. It asks for meaningful scene development and normally schedules a present, available protagonist through the character executor. Narration develops observable events in the configured style; concise planning does not limit public prose. These are model instructions, not guaranteed pacing or a mandatory protagonist turn. The host retains attendance, ownership and discussion-floor checks. Request snapshots record this protocol and its scene inputs; prompt changes replace a stable prefix once without changing model routes, token limits or stored author settings.

The director_command schema and policy demonstrate style with scope=scene for audience-specific performance cues before finish. Guidance may direct a character toward the user's requested development without publishing its choices as narration. The editable performance context module supplies default creative targets, including 4–6 paragraphs and roughly 500–900 Chinese characters for substantive narration; explicit lengthPreference and scene direction take precedence. Fixed execution policies contain tool and ownership rules, with no duplicate creative length target when the module is disabled. These targets concern public prose, exclude private records and remain advisory. The optional isolated director-performance diagnostic records actual public lengths and actor cue delivery; keyless composition snapshots verify the same tool-to-context path without a provider key.

Enabled numeric narration limits add a recorded context section and take precedence over editorial targets. director_revise_narration appends or replaces a pending draft using the exact returned revision. Draft receipts enter the same technical history; each of at most two revisions adds a model request and input proportional to the draft. An exhausted receipt ends the turn and reports failure without publishing its world event. See the [narration length decision](../../../.agents/notes/implemented/feature/2026-09-10-narration-length-check.md).

Independent request history attaches optional turnTiming to every request in a completed technical turn, using deriveTurnPerformance from the native session-stats package. The same authorized log supplies token accounting and timing without another model call. Portable archives retain these fields; older archives omit missing readings.

Director consolidation also uses a dedicated policy and exposes only recall, context-update and finish through director_command. Ordinary scene, narration and scheduling tools return on the next ordinary execution. Exact-batch validation and private-write restrictions remain application responsibilities. The Harness regression checks rejected submission recovery and protocol restoration; reduced real-model retry cost is not yet established.

Director settlement guidance applies the attempt/result boundary to narration too: a resolved handoff does not perform proposed bookkeeping or departure. Time jumps preserve last established state without inventing an actor choice or proving an unrecorded promise failed; present inspection does not prove uninterrupted historical custody.

After JSON parsing rejects tool arguments, the shared actor/director execution adapter adds a delimiter hint when it detects an unclosed string, missing closing containers, or a mismatched/extra closing delimiter. Brackets inside strings and escaped quotes do not count as containers. This is diagnostic text only: the original payload remains rejected, and the model must resend its complete intended update. Valid requests, tool schemas and normal prompt prefixes are unchanged. Local and real Harness composition tests verify the hint and recovery path; real-model retry reduction remains unverified.
