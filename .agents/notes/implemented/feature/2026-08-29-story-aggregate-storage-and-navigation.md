# Agent Note: Story aggregate storage and navigation

Status: implemented

English | [中文](2026-08-29-story-aggregate-storage-and-navigation.zh.md)

## Problem

The coding-oriented Web product treats a filesystem Workspace as the visible project identity and groups Sessions below it. A roleplaying product needs a fictional aggregate instead: one story spans multiple public scenes, private character lifecycles, world material, assets, and exports. Showing a checkout path or asking the player to choose a working directory breaks that model and exposes an implementation detail as part of the fiction.

Using one Session as the whole story also cannot express the intended information difference. Public scene history, player/director control, and one private Session per autonomous Actor need distinct context and persistence while remaining visibly part of one story.

## Decision

`StoryId` is the product-level aggregate identity. `@deepseek-ai/dsh-story-home` owns one operating-system application-data root, `@deepseek-ai/dsh-story` owns durable Story metadata and typed Session relationships, `@deepseek-ai/dsh-api-story-controller` exposes path-free commands and state, and `@deepseek-ai/dsh-client-ui-story` owns Story and scene navigation in the browser.

The roleplaying profile requires every new Session to name a known Story and one role: `scene`, `control`, or `actor`. It does not import Workspace records or historical Sessions, and it provides no compatibility or migration path for the earlier Workspace-oriented product state.

## Storage ownership

Storyweaver Home resolves independently of the process working directory. Its default is `%LOCALAPPDATA%/Storyweaver` on Windows, `~/Library/Application Support/Storyweaver` on macOS, and `$XDG_DATA_HOME/Storyweaver` or `~/.local/share/Storyweaver` on other platforms. Explicit plugin configuration takes precedence over `STORYWEAVER_HOME`, which takes precedence over the platform default.

The root owns `stories`, `sessions`, `storages`, `attachments`, and `trash`. Each Story owns `assets`, `exports`, `world`, `.runtime`, and a derived `story.json`. Generic Session persistence, storage domains, and attachments are redirected below the same root. A Story scene uses its Story's `.runtime` as the internal Session working directory; this path is never a browser identity and is never returned by the Story Remote API.

The Story storage domain is canonical. `story.json` is a human-readable projection that can be regenerated and is not an independently editable source of truth. Story ids and managed path segments are validated before path construction.

## Story and Session relationships

A Story records its title, premise, timestamps, archive state, current scene, and Session registrations. It may own many scene Sessions, at most one active control Session, and many Actor Sessions keyed by stable Actor id. One Session cannot belong to two Stories. Archiving a scene or Story adds durable state and retains logs and files.

The Session Controller resolves a new Story-owned Session's internal directory from `StoryId`, records the Story role in its projection, and attaches the Session to the Story registry before returning success. The roleplaying profile selects the `storyweaver` Agent preset for these Sessions.

## Browser navigation

The browser receives Story projections containing opaque Story and Session ids, titles, premises, scene ordering, current-scene selection, and Actor references. The sidebar renders Stories with nested public scenes and omits private Actor Sessions. The blank hero creates or selects a Story. Opening an empty Story creates its first scene; creating another scene registers it with the same Story; archiving the current scene deterministically selects the next active scene or clears the conversation.

The player never chooses a directory. Workspace UI, local file references, code runtime, command and permission chrome, and other coding-oriented rows are disabled in the roleplaying composition. Existing sandbox policy identifiers may remain inside Host projections, but the roleplaying Client does not render them.

## Alternatives considered

**Keep Workspace as the aggregate and only rename it to Story.** A renamed directory still makes physical location authoritative, cannot represent private Actor Sessions cleanly, and allows generic Workspace discovery to leak unrelated projects into the fiction.

**Treat one Session as one complete Story.** This minimizes new domain code but collapses every scene and character into one context. It prevents isolated Actor memory and makes scene-level navigation, archiving, and continuation ambiguous.

**Expose the managed Story directory to the browser.** This would reuse directory-picker and file-browser UI, but it turns an internal persistence decision into player-visible identity and broadens the browser's authority over Host paths. Opaque ids keep storage replaceable and the fictional hierarchy coherent.

**Migrate old Workspaces and Sessions automatically.** There is no reliable mapping from an arbitrary coding Session to a Story, scene, control context, or Actor. Development-stage replacement is clearer than inventing fictional ownership for unrelated historical data.

## Consequences

The roleplaying application opens on a Story library rather than a working-directory browser. All runtime data lives below one predictable product root, each scene is durably attached to a Story, and private Actor Sessions have an ownership role without appearing in ordinary scene navigation. The repository checkout can move or disappear without changing Story identity.

This foundation reserves `world`, `assets`, and `exports` without defining their domain semantics. Character creation does not yet spawn private Actor Agents, world state does not yet resolve action intents, and archived Stories cannot yet be restored in the browser. Unit tests cover cross-platform root resolution, path rejection, layout creation, persistence reload, ownership conflicts, and navigation races; a real assembled profile boot and authenticated Remote calls cover fixed-root Story and scene creation.
