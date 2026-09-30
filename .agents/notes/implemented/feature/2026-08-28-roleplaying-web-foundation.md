# Agent Note: Roleplaying-first Web foundation

Status: implemented

English | [中文](2026-08-28-roleplaying-web-foundation.zh.md)

## Problem

The stable dsh browser is an effective coding-agent shell. Its visible language and controls emphasize tasks, workspaces, plans, files, Skills, Tools, Agent presets, and execution diagnostics. Reusing that shell unchanged for roleplaying makes the fictional world feel like another coding job and exposes mechanisms that should sit behind character behavior.

The earlier Actor foundation created real behavioral concepts—speech, action, inner activity, deliberate memory, forgetting, goals, intentions, and separate PlayerAuthority—but none had a roleplaying presentation. A player also needed an explicit place in the interface: not permanently one character, but an observer who may choose direction, intervene in the world, or temporarily embody any role.

## Decision

Compose the roleplaying product from reusable Story packages and private experimental Actor/presentation packages instead of forking the stable Web implementation:

- `@deepseek-ai/dsh-experimental-client-ui-roleplay` contributes roleplaying presentation through existing Client definitions, keyed renderers, slots, locale, and theme services.
- `@deepseek-ai/dsh-experimental-roleplay-web-profile` applies after `dsh-web-app`, redirects durable data into Storyweaver Home, requires Story-owned Sessions, selects the `storyweaver` preset, disables coding-oriented Host and Client rows, and mounts the Story, Actor, and roleplaying packages.

The stable session, streaming, replay, persistence, conversation assembly, composer, localization, and settings architecture remains intact. The [Story aggregate storage and navigation decision](2026-08-29-story-aggregate-storage-and-navigation.md) owns the fixed storage root, Story identity, Session ownership, and browser navigation added to this composition.

## Player authority surface

The composer dock provides four editable draft shortcuts: observe, choose direction, intervene in the world, and embody a character. A shortcut never submits automatically and never discards an existing draft. In this first slice the marker travels as an ordinary durable user message, which makes the interaction usable before a trusted PlayerAuthority Remote API exists while keeping the temporary protocol explicit.

This draft boundary is deliberately honest. The UI does not claim that selecting a chip already changed world state. A later Remote layer can replace the marker protocol with committed `playerChooseDirection`, `playerInterveneWorld`, `playerSpeakAs`, and `playerActAs` calls without changing the four player concepts.

## Information-difference presentation

Actor events are projected directly from the durable Session log into a dedicated Chat node kind. Speech, action, character entry, story direction, and world intervention render as visible story cards. Thoughts, core memories, forgetting, goals, and future intentions render collapsed and carry an explicit god-view badge. This lets the player inspect private state without accidentally presenting it as knowledge shared by other characters.

Embodied PlayerAuthority interventions do not render twice. The intervention audit event is omitted from the transcript when a paired expression or action already carries `origin: 'player'`; the visible card still identifies player embodiment rather than attributing the choice to the Actor.

## Visual and composition policy

The roleplaying plugin owns Storyweaver branding, profile-specific hero/composer copy, and a disposable theme-token override layer with parchment-neutral surfaces, violet accents, and serif story headings. A small Conversation presentation registry lets the profile replace placeholders without mutating the generic dsh dictionaries. Components consume semantic tokens and remain valid in light and dark modes. The implementation borrows the useful information architecture of AIAgentRolePlay—player modes and separate private character state—without porting its application state or making the demo an architectural dependency.

The Web profile disables Workspace discovery and browsing, local file references, code execution, technical Tool cards, the generic permission preset and Access selector, commands and input triggers, Cordis UI, workflows, deliverables, references, Skills, generic Goal/Plan surfaces, Subagent and Job controls, Agent-preset management, plugin inventory/configuration, and Trajectory views. The `storyweaver` preset also applies a scoped allowlist containing only the eight Host-owned `director_*` operations, so disabling coding UI cannot conceal an executable coding capability. Creator and Actor presets own separate scoped tool registrations. Model selection, attachments, settings, history, and core conversation remain; sandbox policy stays Host enforcement and does not appear as a selectable story-mode permission.

## Alternatives considered

**Rewrite the Web application around the AIAgentRolePlay frontend.** This would produce the fastest visual resemblance, but it would duplicate session replay, streaming, persistence, localization, composer state, and plugin composition. Keeping the dsh shell and contributing through slots preserves those reliable boundaries.

**Rename the existing coding controls but keep every row mounted.** Copy changes alone would still expose files, technical Tool calls, Plan state, Trajectory views, and preset-authoring concepts. A removable profile layer gives the roleplaying surface a deliberate information hierarchy while preserving the underlying packages.

**Build a complete character dashboard before shipping any UI.** A dashboard needs authoritative world, relationship, and scheduler projections that do not exist yet. Typed event cards and player stances establish the interaction vocabulary now without inventing fake state.

**Call PlayerAuthority directly from the first UI slice.** The Host API exists, but there is no authenticated Client Remote contract or Actor selector. Pretending the chips had committed authority would be misleading, so this slice uses visible editable draft markers and records the RPC transition as deferred work.

## Consequences

The source checkout has a coherent roleplaying-first Web foundation that can be applied and removed as one profile layer. Player authority is visible, autonomous Actor events have distinct world/private/player semantics, every visible conversation is a Story scene, and neither coding chrome nor coding tools enter an ordinary Story Session.

Player shortcuts still submit protocol text rather than trusted authority RPCs. New scene Sessions use the Actor-aware `storyweaver` preset, but character definitions do not yet create or wake isolated Actor Agents automatically; no side dashboard aggregates live status, memory, psychology, or relationships; and no world resolver or scheduler turns intents into consequences. These remain follow-up layers instead of reasons to postpone a working roleplaying shell.
