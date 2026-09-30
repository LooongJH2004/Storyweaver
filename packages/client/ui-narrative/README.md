---
description: "Play and author independent Storyweaver instances through narrative query views."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-narrative

English | [中文](README.zh.md)

<a id="summary"></a>
## Summary

This Client plugin supplies the independent Storyweaver sidebar, play surface, author workspace, storybook publication, and history controls. It consumes the [roleplay browser API](../../api/roleplay-controller/README.md); it never reads Story aggregates, Session events, or storage files.

Memory proposals show brief text with optional episode details collapsed under their topic. Editing provides labeled fields for the brief, experience, interpretation, impact and unresolved matters while preserving source coverage and target revisions. Raw JSON editing remains a secondary action; cancellation discards the local edit, and failed saves retain it. Episode-summary recall results do not offer original-source pinning.

Episode interpretation and impact are optional additions to the brief. The editor explains this, keeps topic and experience required, and removes either optional field when cleared instead of saving an empty string. Review cards omit absent detail fields. Existing fully populated episodes remain editable; removing prose never changes source references.

The memory panel lists effective summaries with a disable action bound to the inspected story and note revisions. Failed actions show their error and remain retryable; accepted actions refresh the inspected state. Disabling a summary restores sources without other effective coverage and retains historical details.

The same panel selects automatic activation or review for new summaries of the inspected owner. The persisted policy controls the selector; failed saves do not imply activation. Existing pending proposals remain reviewable, and automatically activated proposals carry a visible label.

A character's private book settings can inherit shared ordinary knowledge or supply a separate list. Disabling inheritance starts an empty list, and leaving it empty grants no shared knowledge. The choice changes the draft definition; running instances retain their pinned definitions.

The AI creation workspace starts independent book-bound native conversations, with an optional explicitly selected local directory and task-specific prompt settings. The library groups numbered runs below each book; a plus action starts a new run from its published version. Manual book fields retain advanced JSON, and portable book packages retain embedded resources. Browser storage preserves book edits, settings, recipes and unsent play input. Source modules expose rule, tool and reasoning-language editors. Player directions support same-instance edit and resend; history retains the discarded version. Resending keeps the currently saved context recipe. Recipe editors show unsaved status beside the creative textarea, provide a local save-and-apply action, and keep the save bar visible while scrolling. Removal controls distinguish a book's authoring entry from an individual run.

Play shows native dsh turn usage and request counts. Long recorded messages expand in place with separate reasoning, content and tool blocks. Source editors open in a modal; the active character streams labeled drafts while earlier steps remain inspectable.

Discussion controls and the composer show used and remaining public exchanges. Book and instance settings share budget and speaking-order controls; editing one preserves the other. Balanced opportunities and the original eagerness rule are selectable for future discussions, with existing omitted policies preserved. Private preparation does not consume public exchanges; passing does.

Pending discussion invitations have a composer entry and appear in the existing discussion panel with the requester, topic, expandable purpose and accept/defer/decline actions. Decisions carry both instance and request revisions; failures retain the invitation and show the error. Accept creates a discussion but does not impersonate participants or automatically supply their public responses.

Streaming prose uses incremental Markdown rendering. The reading column follows growth before paint; scrolling upward pauses following until the reader returns to the bottom or selects Latest story. Historical usage and expanded thinking remain mounted during same-turn refreshes; changing their story, character or historical revision clears the previous selection immediately. Reserved scrollbar space keeps reply widths stable when overflow begins.

Story prose and streamed drafts share Markdown typography for headings, emphasis, quotations, lists, tables, links and code. Repeated literal `\n` or `\r\n` separators render as paragraph breaks; simple `<br>` tags render as line breaks. Paragraph spacing and soft line breaks remain visible. Code spans, code blocks, URLs and Windows paths retain their literal content; lone escaped newlines are left unchanged because they may be notation. Copying story text uses the same normalized separators, while stored fiction and original request inspection retain the exact source. Raw HTML remains disabled.

Accepted actor rows suppress older execution drafts even when the two streams arrive out of order. Settled usage and fully loaded settled records stop background refreshes; command completion rechecks incomplete accounting. Usage footers reserve space before their numbers arrive. Book-list refresh runs separately from command completion, so it cannot keep the composer busy after execution ends.

<a id="table-of-contents"></a>
## Table of Contents

- [Product views](#product-views)
- [Composition and ownership](#composition-and-ownership)
- [Validation and limitations](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="product-views"></a>
## Product views

The story heading and play tools share one sticky navigation container, so character, state, style, context, model and memory entries remain reachable while reading later messages. Scene people open in a native modal outside the reading column; opening and closing it preserves prose width and scroll position. Escape closes the list and returns focus to its trigger. Narrow screens wrap tool buttons within the viewport.

The author workspace keeps a visible **Back to story** action in the sticky navigation. Returning from character, state, style or context editing restores the paused reading position and retains unsent directions. Readers following the latest reply continue following; switching story or perspective starts at the latest reply for that scope.

The reading column retains a collapsible preparation card at each discussion’s chronological boundary. Compact character buttons select one preparation record at a time, showing recorded reasoning and submitted stance, willingness and thoughts. Reads use the preparation attempt and fixed revision, so public turns cannot replace preparation evidence. Expanded live records refresh without clearing existing content; collapsing stops reads. Group counts distinguish running, waiting and complete preparation. Private records remain author diagnostics, outside fictional messages.

In an active creation conversation, **Edit creation prompt** opens the current task settings and focuses its prompt field. The prompt, enabled state and message role remain editable after starting the task. **Save task settings** confirms persistence; subsequent model requests read the saved settings without creating a new session. Defaults for other tasks remain separate.

The library uses a shared open-book mark, a welcome area, two creation shortcuts and typographic book covers. Existing-work imports expand below the shortcuts. Book summaries, publication status and run entries stay together on the shelf. Warm light and graphite dark palettes share semantic tokens; dark reading uses quiet character rules, a single-layer composer and restrained bone-colored submit controls; narrow screens stack the cards and retain visible keyboard focus.

Character turns show one player-facing name with a secondary appearance label. Thinking expands beneath each speaker name, before accepted prose. Director dispatch remains visible after player directions, including the initial turn without narration. Its collapsed row opens recorded thinking and tool steps. Original context opens the request-step reader with searchable messages and separate raw JSON. In the side inspector, request history forms a horizontal strip above the content and scrolls away with it, on both wide and narrow screens. Sidebar deletion names the target before confirmation. Default-role repair remains an explicit saved edit; details and measured limitations are in the [recipe and reading decision](../../../.agents/notes/implemented/bug-fix/2026-09-08-recipe-roles-and-turn-reading.md).

The book library and selected editor are separate. Section navigation covers world settings, characters, Director style and context recipes; character tabs expose private cognition, initial state and Actor style. One save bar preserves drafts before publication review. Fresh runs expose author, model and memory tools immediately. See the [editor and reasoning decision](../../../.agents/notes/implemented/bug-fix/2026-09-08-storybook-editor-and-reasoning.md) for reasoning-module ownership and explicit restoration in existing runs.

The play surface presents a story heading, opening guidance, committed character turns and a bottom composer. Streaming and committed replies share one reading column, including when the people panel is open. Speech and action labels use 14px semibold text for clearer scanning. Adjacent speech and actions from the same person and revision stay together. Each model turn offers an explicit player diagnostic disclosure for recorded requests and reasoning. Empty scenes omit the people panel; idle runs omit pause controls. Manual discussion creation lives in More actions, while active discussions expose their current controls. Memory review and model checks open focused dialogs that preserve the story and unsent input. Mobile layouts use a mode selector and the same dismissible people dialog.

The library lists independent instances with their pinned book version. Play displays accepted narrative rows, published identity labels, and execution phases supplied by the application. Embodiment selects a revealed character label and supports speech, whispers, written messages, and action attempts. Perceptions distinguish observations, claims, and reports. Changing input modes retains prose; acceptance clears only the text that was actually submitted.

Group discussion controls start a bounded discussion, advance automatic responses, interrupt for the player, resume, request speaking order, and close the discussion. Player interruption invalidates old execution before technical cancellation. The author workspace edits instance settings, characters, scene attendance, copied performance styles, temporary scene guidance, dynamic state, context recipes, and retention proposals.

Player labels show the perceived description followed by the true name in parentheses. This annotation is separate from character knowledge and model context. Historical fiction keeps its published wording; the name annotation comes from the selected narrative revision. People, judgments, and memory review use shared cards, localized status labels, and expandable evidence. Raw records and advanced JSON editing remain available in details. See the [player identity presentation decision](../../../.agents/notes/implemented/feature/2026-09-08-player-identity-presentation.md).

Storybooks expose editable drafts, normalized publication review, immutable publication, and version-based creation. Material extraction defaults to base character settings; experiences, knowledge, and state require explicit selection. History controls inspect revisions, create checkpoints, restore by compensation, restart from the original version, and import or export complete narrative archives.

Author context inspection separates today's preview from recorded model requests. The request list is scoped to the selected instance, person, and narrative revision; it distinguishes prepared requests from recorded responses. A late response from a previous selection cannot publish private data into the new selection. Imported execution logs remain archive evidence, never live sessions. Request bodies saved during export are viewable with an imported-evidence label; unavailable serializers preserve the logs and an explicit reason.

<a id="composition-and-ownership"></a>
## Composition and ownership

The native dsh sidebar owns its compact rail, resize and Settings. This plugin supplies `sidebar.stories`, `sidebar.brand.mark`, `sidebar.brand.name` and typed `sidebarNavigation`; the create action opens Storybooks without starting a technical Session. Markdown, clipboard, icons and tool dialogs use shared dsh primitives. Content follows the exact font-size setting and the existing `dsh.conversation.contentWidth` preference. Reply edges resize reading width, and the top composer handle resizes input height. Layout provides sliders and a default reset. Focused handles support arrow keys, Shift for larger steps, Home/End and Escape to cancel a drag. Pointer movement previews locally and saves on release; width and composer height persist separately in browser storage. Viewport bounds constrain display without replacing the saved preference. Model and memory tools preserve unsent input.

The experimental [independent profile](../../experimental/roleplay-web-profile/cordis.patch.yml) enables this plugin with the narrative services and disables the original Story UI and business writers. It selects a separate Storyweaver Home. This is now the default roleplay profile; the old composition is a non-exported regression fixture.

Browser pagination reads `queryLimits` from the application, which uses the host `queryPageLimit` configuration. The plugin owns the conversation seat; a root-scoped child keeps shared navigation independent of technical Session selection. The API plugin owns observable server data. The UI store owns navigation, input mode, unsaved author edits and unsent prose. Components receive named callbacks and view hooks, never Cordis Context or the Remote service.

Command attempts retain their command ID and reviewed revision after an uncertain response. The application reports whether a command committed and whether its execution ended; only confirmed rejections or ended failed/cancelled attempts release the ID for the next user submission. Repeated in-flight execution commands share one operation. Settings refresh preserves edited fields and accepts concurrent changes to untouched fields. Clearing an override restores the pinned baseline. Style presets, including browser-local personal presets, are copied before editing. Current state comes from dynamic definitions and values; an empty current state does not display initial values again.

<a id="model-experience"></a>
## Model Experience

Indirectly, through author-edited narrative configuration; application owners assemble prompts and tool definitions, while this package renders recorded requests and usage.

#### KV Cache effect

Actor recipe editors in stories and book drafts offer an explicit cache-order action followed by saving. It reorders stable sources before live state and evidence through the core optimizer while preserving authored content and custom boundaries. Reading never writes stored recipes. Both story and book editors show inherited creative defaults when performance is absent. Authors can edit, disable or restore this module independently for the director and actors; saving a story recipe affects subsequent requests, while book edits supply future runs after publication. Style editors link to these settings; saved previews use the execution renderer. This UI does not claim measured cache hits or token savings.

## Known Limitations and Deferred Work

Player control lists the run's full active cast, with off-scene annotations, rather than borrowing the current-scene embodiment list. Loading and a genuinely empty run have distinct feedback. An off-scene character may be claimed before the opening, but their response cannot be submitted until they enter; the composer explains how to advance or request an entrance.

Character definitions offers Add protagonist, creating a normal character and selecting its ID as narrative focus. An unspecified protagonist remains empty through import, ordinary character creation, saving and publication; only Add protagonist explicitly selects the new character. During play, the composer exposes persistent Player control independently of reading perspective and temporary embodiment; it restores the selected character after reload. A player-owned discussion floor displays a response action and explicit silence action. Continue automatic discussion remains beside the input after a response or pass; ownership is not implicitly released. Imported books still require reviewed publication, and existing runs keep their pinned versions.

<a id="known-limitations-and-deferred-work"></a>

The composer uses Enter to submit and Shift+Enter for line breaks, protecting IME candidate selection and repeated keydown. Continue has a separately disclosed optional field for direction visible to characters dispatched in that beat; it is not character knowledge and should not contain author secrets. Its draft persists per story and clears on acceptance only if unchanged since submission. Director input is never copied into it. Pending operations show their status without claiming completion. Accepted player directions appear in the transcript and survive reload and export; they are not fictional evidence. Failed operations retain the editable draft. Local selection restores the last existing instance in observer view. Character inspection and memory review share the native dialog, with full edits available in the author workspace.

`apps/web/tests/reading-layout.e2e.ts` independently checks resizing, saved dimensions, cancellation, keyboard controls and narrow-screen geometry without model calls.

The real Loader and browser scenario in `apps/web/tests/independent-narrative.e2e.ts` exercises the isolated product with no model credentials, including discussion, style copying, original-request inspection, checkpoints, compensation, archive import, reload, and narrow layouts. Focused Client tests cover command retries, state editing, lazy turn records, paginated request steps and late private responses. Application and Harness tests cover actual request reconstruction, discussion cancellation, state ownership, and narrative replay.

- Isolated live opening diagnostics do not establish long-running roleplaying quality. Arbitrary setting objects use typed recursive controls with optional raw JSON editing; narrative history uses bounded pagination.

<a id="dev-note"></a>
### Dev Note

The Context synchronization workspace places book-shared settings on the left and the destination story on the right. Select compact module rows and synchronize them together. Copying once is the default; following future shared updates is explicit. Full content, shared editing and source restoration open on demand. More contains book draft imports and new-book defaults. Recipe editors retain provenance and one management link. Shared drafts survive navigation and do not block synchronizing saved shared values; book imports preserve other unsaved edits and return for review without saving or publishing. See the [synchronization UX decision](../../../.agents/notes/implemented/feature/2026-09-11-context-sync-workspace.md).

Player embodiment has separate speech and action inputs with independent recipients. Either field may be empty; a combined submission publishes speech followed by the attempted action in one command. Drafts persist per story and character, and acceptance clears only text that still matches the submitted draft. The mode remembers its own composer height. Player control offers an explicit Hand back to AI button; releasing ownership returns to observation, and Continue advances AI performance, including the configured protagonist. One-off embodiment does not change persistent ownership. See [player response inputs](../../../.agents/notes/implemented/feature/2026-09-10-player-response-inputs.md).

See the [independent narrative architecture note](../../../.agents/notes/implemented/architecture/2026-09-07-independent-narrative-instances.md). Preserve old data; no implicit migration or dual writing is provided.

The [play interaction recovery note](../../../.agents/notes/implemented/feature/2026-09-08-play-interface-recovery.md) records the restored reading workflow and the remaining gaps against the previous UI.

Discussion evidence is inserted before the first public discussion turn, after preceding player intent and director preparation. Older discussion cards keep their own timeline positions. Discussion controls live in a side inspector opened from persistent navigation or the composer status strip; they do not push the transcript or disappear below it. Recorded context, memory and model inspection use the same side-panel geometry, with native Escape, focus containment and return to the opening control. Opening recorded context requests execution evidence directly instead of rebuilding unrelated current author views.

Character turn headers, including live output, pair the canonical player-facing name with the definition’s objective appearance. Scene encounter labels remain separate for perspective controls. The character workspace keeps the material-extraction card and its workflow explanation visible; selecting and previewing material creates a new draft, which must be reviewed and published in Storybooks. It does not merge into the original book.

Import your work is available from the sidebar, library and book editor. Its side panel separates book JSON/packages from independent run archives, accepts files or pasted JSON, and shows a content summary before confirmation. Host validation must succeed before a new draft opens; errors retain the selected content and retries reuse its draft ID. Imports do not overwrite existing books or publish them. The editor exports saved settings and resources as a title-named .storybook.json package; unsaved edits must be saved first. Story progress remains a separate run archive in History and recovery.

Both context editors expose narration minimum and target inputs with an explicit automatic-expansion switch and inline range validation. Saved numeric settings take precedence over prose suggestions. The reader retains a single unpublished draft while additional paragraphs stream, and preserves exhausted drafts with a visible count after the run stops.

Story turn footers and request details display native token accounting alongside whole-turn first-token latency in seconds and average decode throughput in tokens per second. Missing recorded timing reads Not recorded; zero remains a valid reading. Multi-step throughput divides summed eligible output tokens by summed decode seconds, excluding tool waiting.

The composer footer shows cumulative native statistics across director and character sessions, including durable history and imported full logs. It refreshes after execution changes and uses the same renderer as native chat. See the [cumulative usage decision](../../../.agents/notes/implemented/feature/2026-09-11-story-usage-totals.md).

Effective memories also expose collapsed episode details without entering edit mode. Source records on notes and proposals offer numbered Read source buttons, including supporting citations beyond processed batch coverage. The buttons reuse owner-scoped recall, move focus to the results and preserve read failures for retry without approving or modifying memory.

Recognized complete behavior originals display the frozen speaker or actor label, delivery or target labels and exact content; action records remain attempts. The full original stays collapsed under Raw data. Recognition checks source identity and revision against the recalled entry and recognizes only the recipient behavior display shape. Other records and partial pages remain verbatim; the UI does not substitute current identities or infer outcomes.
