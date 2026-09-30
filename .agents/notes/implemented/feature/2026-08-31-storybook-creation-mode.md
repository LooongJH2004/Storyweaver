# Agent Note: fixed-workspace storybook creation tasks

Status: implemented

English | [中文](2026-08-31-storybook-creation-mode.zh.md)

## Problem

Storyweaver had a complete manual storybook workbench but no conversational authoring Agent. Restoring the standard coding preset would let a model create JSON, but it would also expose shell, arbitrary filesystem paths, repositories, and unrelated Agent tools inside a roleplaying product whose ordinary Director and Actor sessions deliberately exclude those capabilities. Plain chat-generated JSON would leave validation and persistence to the player and would not provide a durable workspace the player could leave and resume.

## Decision

The supported independent authoring and rewrite wiring is described by the [authoring recovery decision](2026-09-08-independent-authoring-recovery.md). This note retains the remaining workflow and ownership rationale.

Creation mode is a fixed top-level workspace beside the Story library, not an entry attached to an existing Story. Every Session in that workspace is one independent new-storybook task. Starting a task first asks the player to authorize a local directory through the host picker, then creates an isolated draft Story and a dedicated `control` Session composed with `storyweaver-creator` and that `cwd`. Cancelling the picker leaves no empty task. Saves synchronize the JSON title, premise, and template identity. `storybook_publish` exposes the draft as authored settings in the Story library and completes the task.

The creator preset mounts `@deepseek-ai/dsh-experimental-tool-director/creator`. The plugin removes inherited tools and registers strict Storybook tools plus managed `story_file_*` draft tools; the preset then adds only local `read`, `read_image`, `write`, `edit`, `glob`, and `grep`. Existing filesystem and sandbox policy roots those tools at the Session's authorized `cwd`; shell, network, deletion, delegation, and runtime Director capabilities remain absent. A legacy creator task without `cwd` is denied by a tool guard instead of falling back to the host process directory.

The storybook tools delegate canonical reads and writes to Story Controller. `storybook_save` requires the exact content revision from `storybook_read`, validates the complete strict schema-version-4 document, and uses the controller's serialized atomic replacement. Generic `write` and `edit` reject `world/storybook.json` so no alternate invalid write path exists.

`story_file_read`, `story_file_write`, and `story_file_edit` still accept only normalized logical UTF-8 paths under the owning Story's `world/` and `assets/` areas and reject traversal, absolute paths, backslashes, symlinks, unsupported extensions, and files larger than 2 MiB. This managed namespace stays distinct from the authorized local workspace. Managed `world/storybook.json` remains writable only through `storybook_read` / `storybook_save`, so generic local writes cannot bypass schema and revision checks.

The sidebar permanently shows the Creation workspace, its new-task action, and its durable task list. Each task has a confirmed delete action that removes its isolated draft aggregate and managed runtime from the product. Creator Sessions have their own badge, workspace status strip, and expandable tool trace; ordinary Director and Actor tool calls remain hidden. In-progress drafts are omitted from the Story library until publishing.

## Alternatives considered

**Reuse the standard coding preset.** This would maximize Agent capability reuse, but its shell, repository, arbitrary filesystem, delegation, and workflow powers violate Storyweaver's path-free Story boundary and materially exceed the requested storybook authoring authority.

**Let the creator write the managed storybook with generic filesystem tools.** A direct file write could bypass optimistic concurrency, strict schema validation, normalized defaults, Story feed updates, and the existing browser editor's save contract. A dedicated save tool keeps one canonical mutation boundary.

**Generate JSON only in assistant prose.** This avoids file authority, but the player must manually copy, validate, and save every result. It also turns iterative creation into stateless document exchange instead of a resumable Agent workspace.

**Attach Creation mode to the current Story.** That conflates creating a new storybook with editing the current Story and conflicts with any control Session the Story already owns. The fixed workspace isolates every creation task in its own Session and draft.

## Consequences

The creator Agent can directly read existing fiction, character notes, and setting files and write generated outputs within the explicitly authorized local directory while retaining strict managed-storybook validation and publishing. The UI displays the actual authorized path. History rewrite is unavailable while the task runs or its queue is non-empty and states that completed tool actions and file changes do not roll back with model history. Creation mode still cannot delete or move files, execute scripts, access the network, escape the authorized directory, or call runtime roleplay capabilities.
