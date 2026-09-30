---
description: "Use the roleplaying-first Web chrome, player-authority draft shortcuts, and autonomous Actor event cards."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-roleplay

English | [中文](README.zh.md)

## Summary

This private Client plugin turns the generic dsh conversation shell toward roleplaying without replacing its session, streaming, persistence, localization, or slot architecture. It supplies Storyweaver branding, a warmer theatrical palette, four player-authority draft shortcuts, and typed transcript cards for durable Actor events. Private thoughts, memories, goals, and intentions are collapsed behind a visible god-view disclosure; speech and action remain world-facing, while player embodiment retains separate provenance.

The interaction structure takes limited inspiration from the state, memory, psychology, relationship, observe, interrupt, and perspective surfaces in AIAgentRolePlay. It does not port that demo's Vue application or make its page state authoritative.

The palette is deliberately paired rather than replaced: **Light** uses the warm ivory and parchment surfaces of the original Storyweaver presentation, while **Dark** uses the aubergine night palette. The browser preference is owned by **Settings → Appearance** and may be Light, Dark, or System; selecting Dark does not remove or rewrite the light tokens.

World Operations shows ongoing matters by Director or Actor knowledge, including status and expandable original sources. The discussion dock shows individual preparation progress before public speech begins. Memory review shows which approved entries a proposal replaces; unselected entries remain active.

Memory Review opens a nonmodal drawer from the Story header. Proposals group by player turn and show editable notes, reasons, complete original sources, and original pins. Players can approve or reject selected source-processing units together; unsaved edits cannot enter a batch decision. Pending notes stay outside model memory, and rejection keeps originals. Pinned originals remain independently accessible for unpinning. Request previews report recent originals, additional retained originals, active notes, and archived sources from the recorded request, without inferred cache usage.

The input mode and selected embodiment character travel with the submitted message; clicking a mode fills an empty draft or replaces its untouched suggestion. Player edits are preserved, and mode selection never submits. The Continue action advances directly. Execution feedback uses actual Session and Director Run state. Desktop character state opens in a collapsible sidebar, with a modal drawer on narrow screens. Story, character, style, state, and context entries share the existing editors and revisioned save commands. The state workspace can copy current active values into a reviewable storybook draft; saving that draft does not change the running state.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

Install it through [`@deepseek-ai/dsh-experimental-roleplay-web-profile`](../roleplay-web-profile/README.md) after the stable Web bundle. That profile pairs this presentation with the path-free Story library: the sidebar groups scene Sessions below Story titles, and the blank hero selects or creates a Story rather than a filesystem directory. The Web Client loader mounts this package's `/client` export; its Host entry is inert.

### Choose the player's stance

The composer dock exposes four shortcuts:

- **Observe** asks the world to continue while every character stays within its own knowledge, goals, and emotions.
- **Choose direction** states a desired narrative trajectory without embodying a character.
- **Intervene** declares a change to the world.
- **Embody character** lets the player temporarily speak or act through any role.

Selecting a mode fills an empty draft or replaces the previous untouched suggestion. Player-edited text is preserved, and the draft is not submitted. The selected mode and embodiment character are captured with the next message, independently of later mode changes.

The centered interaction shelf shows execution state, discussion controls when applicable, and four input modes within the composer width. Director Run and World Reference live in the persistent session header, where operational controls remain reachable while the transcript or composer scrolls. Storybook and Director Outline open as modal workspaces with an always-visible close action, Escape handling, focus restoration, and one document-owned scroll area; closing a workspace preserves its unsaved in-memory draft for the current session. Desktop users can resize the workspace from any edge or corner, with opposite-edge anchoring, viewport constraints, and keyboard-operable side handles. During editing, the primary save and cancel commands stay in a contextual toolbar above the document, followed by reversible and import/export commands; compact screens use the full available workspace, disable manual resizing, and stack the primary commands into touch-sized controls.

### Operate the world

The persistent **World Operations** workspace is the authoritative companion to the lightweight draft shortcuts. It opens on a live runtime summary that foregrounds what the system is doing, the current discussion speaker and round, pending memory, and any player intervention. While a discussion is active, its composer-level console appears alongside the input modes: topic, actual phase, live speaker, completed turns, participant stance/eagerness, and the latest public turn remain visible. Director-led discussions continue automatically across speakers and end with an automatic Director summary; the visible player controls are secondary requests to speak or converge. A pending player request remains visible and cancellable from that console, including while AI activity is still settling. Manual discussion creation, floor editing, raw world settlement, and memory proposal forms remain available under collapsed advanced operations. Typed player authority and complete Story Package exchange remain available here; prompt, memory, preview, and context orchestration live together in Context Builder. All controls retain visible labels, async status feedback, disabled pending actions, keyboard operation, and touch-sized targets.

### Read autonomous character state

The session-header character panel displays storybook-defined characters before an Actor Session exists. Character identity is the primary navigation boundary: a roster selects one character, then category tabs separate overview, mind, relationships, and memory/intent. This avoids mixing private state from several characters into one scrolling surface. The desktop panel is resizable within viewport limits; compact screens switch to a responsive stacked layout.

Every character distinguishes **Definition loaded** from **Autonomous**: the former is initial storybook state, while the latter means a running Actor with the same ActorId is bound. Story-authored facets render location, injuries, equipment, and other extensions generically. Running Actor events override corresponding semantic initial values without deleting storybook extension facets.

### Edit the Director Outline

The player-intent dock exposes the Story-level Director Outline even in a new blank scene. Its fixed viewport panel shows the Outline revision separately from the latest per-run Brief revision and dispatch status, so a saved Brief cannot be mistaken for a long-range Outline update. The structured studio separates intent and rules, arcs, a reorderable Beats timeline with visible dependencies, foreshadows, mysteries, and narrative clocks. Every card exposes its stable id, source, player lock, category-specific fields, and event-evidence references. Players can drag cards or use keyboard-accessible move controls, inspect revision history, accept or reject queued Director suggestions, and switch to the complete player-writable JSON projection. Director provenance, revision history, and pending-suggestion internals remain server-owned rather than becoming editable JSON. Exact-revision saves stop stale drafts and offer an explicit latest-revision reload.

### Control a Director Run

The same dock exposes a compact Director Run checkpoint that opens a queue-first modal drawer. Queue rows foreground Actor status, attempt count, failure, and accepted-event count; the Brief, Actor perception slices, attempt id, generation, and event references remain available through explicit tabs and disclosures. Exact-revision controls resume unfinished work, pause or terminally cancel the Run, retry one failed or cancelled Actor only when it has no accepted events, skip incomplete work, or abort one running Actor. Cancellation, skipping, and aborting require confirmation; the drawer traps focus, closes with Escape, restores focus, and becomes a bottom sheet on compact viewports. No control turns ordinary Director or Actor prose into NPC behavior.

### Edit the storybook

The Storybook Studio remains beside the player-intent dock even while a new Story shows the blank-scene Hero layout. Its fixed viewport panel stays above the composer on desktop and becomes a full-width workspace on compact screens. It reads and saves the complete managed storybook through path-free Client commands. Editing defaults to section navigation for basic metadata, world data, structured Director guidance, Director rules, and character definitions. Each Actor has separate acting-guidance controls, and exactly one character is marked as the protagonist continuity anchor without restricting whom the player may embody. Quick paste parses labeled creative notes into one selected scope; a before-and-after section diff, one-step undo, and default restoration keep edits inspectable; full-document JSON remains the expert mode. Canonical Storybook JSON and individual Actor JSON can be imported or exported, including export of the current unsaved document; imports remain drafts until an exact-revision save succeeds. A stale save preserves the draft and exposes a latest-version reload. A successful save synchronizes the Story title and premise used by sidebar navigation. The effective-context inspector shows Host-filtered Director or Actor sections with message identity, source, permission, visibility, and inclusion reason. Runtime and capability rules are independently editable in the Context Builder.

### Build Director and Actor context

The unified Context Builder combines editing, actual-request inspection, and orchestration in one master-detail workbench. The module list on the left owns dragging, enablement, and system/user/assistant message roles. Selecting a module opens its editor and saved model-facing content on the right; the complete ordered next-request context appears below. Runtime rules, capability rules, Director settings, the selected Actor's identity and private settings, reasoning language, reviewed memory, and other story context remain separately inspectable. Editable sources distinguish the reusable storybook baseline from the current Story override. Visible up/down controls remain keyboard, touch, and single-pointer alternatives. Enabled content has no character cap; character and estimated-token values remain informational statistics. Host authority and private-data isolation remain code-enforced.

Each dispatched Actor attempt becomes one collapsed character card. Opening it reveals individually collapsed reasoning blocks followed by the final intent and speech. Reasoning deltas and incremental `npc_speak`/`npc_act` tool arguments stream from the private Actor Session into that card; authoritative accepted events replace the draft at settlement. Model reasoning remains player-only, distinct from fictional `actor/thought` activity, and never enters world facts or another model's context.

The avatar's Context control loads the producing request through the [Story Controller](../../api/story-controller/README.md#development-contract). A reading dialog keeps its heading, view controls, and close button visible while messages scroll. Messages retain their sender order and role labels; text preserves line breaks, with six-line previews that expand to the complete content. Reasoning, tool calls, and tool results have separate labels. Tools and parameters occupy a secondary view, and message JSON disclosures and the raw-request view retain all fields. Escape, the close button, and the mask dismiss the dialog and restore focus to its trigger. Loading errors offer retry; successful loads remain cached for that event.

The plugin claims the Actor event vocabulary from [`@deepseek-ai/dsh-experimental-actor`](../actor/README.md):

- descriptor, expression, and action events become visible story cards;
- thought, memory, forgotten-memory, goal, and future-intention events become collapsed god-view cards;
- story direction and world intervention become player-origin cards;
- embodied intervention records are suppressed because their paired expression or action already carries `origin: 'player'` and would otherwise render twice.
- `story/npc-event-projected` records render accepted Actor speech or action in the public scene while retaining the Actor Session and event references in the durable payload.

<a id="understand-the-implementation"></a>
## Understand the implementation

The plugin contributes only through existing Client services and slots. It registers one Conversation definition, one keyed Chat renderer, the sidebar and hero brand occupants, session-header authority and state utilities, a player-intent dock with an interrupted-Run checkpoint and a collapsed World Reference menu, the typed World Operations workspace, localized hero/composer copy through the Conversation presentation registry, locale dictionaries, and a disposable theme-token override layer. Accepted speech uses the primary reading treatment while action uses a compact stage-direction treatment; this presentation distinction does not change event order or authority.

| File | Role |
|---|---|
| [`src/client/RoleplayChrome.tsx`](src/client/RoleplayChrome.tsx) | Storyweaver mark, player-authority badge, and draft shortcuts |
| [`src/client/RoleplayStoryDock.tsx`](src/client/RoleplayStoryDock.tsx) | Blank-scene-safe composition of player intents, Run Console, Context Builder, Storybook Studio, and Outline Studio |
| [`src/client/DirectorRunConsole.tsx`](src/client/DirectorRunConsole.tsx) | Exact-revision Run and per-Actor checkpoint controls |
| [`src/client/StoryOperationsPanel.tsx`](src/client/StoryOperationsPanel.tsx) | PlayerAuthority, world, discussion, and Story Package operations |
| [`src/client/CharacterStatePanel.tsx`](src/client/CharacterStatePanel.tsx) | God-view projection of storybook and running Actor state |
| [`src/client/DirectorOutlinePanel.tsx`](src/client/DirectorOutlinePanel.tsx) | Player inspection, editing, locks, and suggestion review for the Story Outline |
| [`src/client/StorybookStudioPanel.tsx`](src/client/StorybookStudioPanel.tsx) | Guidance forms, quick paste, context preview, import/export, and exact-revision save |
| [`src/client/ContextBuilderPanel.tsx`](src/client/ContextBuilderPanel.tsx) | Unified prompt, memory, source-definition, effective-preview, and drag orchestration workspace |
| [`src/client/roleplay-event-definition.ts`](src/client/roleplay-event-definition.ts) | Durable Actor event to Chat-node projection |
| [`src/client/RoleplayEventView.tsx`](src/client/RoleplayEventView.tsx) | World, player, and private event cards |
| [`src/client/index.ts`](src/client/index.ts) | Locale, theme, Conversation, renderer, and slot registrations |

<a id="dev-note"></a>
## Dev Note

The owning decisions are [Roleplaying-first Web foundation](../../../.agents/notes/implemented/feature/2026-08-28-roleplaying-web-foundation.md), [Storyweaver Director boundary and Plot Ledger](../../../.agents/notes/implemented/feature/2026-08-29-storyweaver-director-ledger.md), [Revisioned storybook authoring](../../../.agents/notes/implemented/feature/2026-08-29-storybook-authoring.md), and [Roleplaying world operations and portable stories](../../../.agents/notes/implemented/feature/2026-08-30-roleplay-world-operations.md).

<a id="model-experience"></a>
## Model Experience

### Player-intent draft markers

#### What the model sees

Nothing changes when the player merely selects a shortcut. If the player submits it, the selected marker such as `【旁观推进】` travels through the ordinary durable user-message path together with any edits the player made. Actor event cards are presentation-only and do not reinsert private card contents into model context.

#### Token effect

Only a submitted draft costs tokens, in proportion to its final text. The palette, brand, authority badge, and transcript projection add no request tokens.

#### KV Cache effect

Selecting or opening a card has no cache effect. Submitting a message with structured intent has the same cache boundary as any other new user message; displaying Actor log events does not create another model request.

## Known Limitations and Deferred Work

- **Mode interpretation** — the selected mode is durable input metadata interpreted by the Director. Explicit PlayerAuthority operations also remain available from World Operations.
- **Hybrid storybook editor** — guidance, common metadata, Director rules, Actor capabilities, and character identity/persona use dedicated controls. Arbitrary nested setting, world-truth, beat, state, and private-context values remain section-local JSON until their vocabularies stabilize. Story Package exchange separately covers the aggregate, Session logs, storybook, and portable `world/` files.
- **Settlement is explicit** — natural-language Director prose does not mutate state by itself. The Director settlement tool or trusted player world intervention must submit typed patches.
- **Actor ids in later cards** — only the descriptor event carries a display name. The first projection shows stable Actor ids on later cards until a session-level descriptor index is added.
- **Source-checkout only** — the package is private, experimental, and excluded from official release payloads.
