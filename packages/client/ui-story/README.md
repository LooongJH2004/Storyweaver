---
description: "Path-free storybook library and independent Story-run navigation for the browser client."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-story

English | [中文](README.zh.md)

## Summary

Browser presentation for authored storybooks and independent Story runs. It exposes a Story library, nested run navigation, and the empty-state Story picker without revealing managed filesystem paths.

The package coordinates `ctx.stories` and `ctx.sessions`: each nested row is one independent Story aggregate, grouped by `templateId`. The per-storybook plus action asks the Host to copy only authored baseline material into a fresh StoryId, then creates that run's first scene Session. Deleting the final run keeps the storybook visible as an empty `templateOnly` group with a clear start action; deleting the storybook removes the group. Neither Story operation calls the legacy archive command.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Use this package

Install the package as the Story presentation row in a Web composition that provides `stories`, `sessions`, `slots`, and `locale`. Storyweaver uses it through the experimental roleplaying Web profile.

## Understand the implementation

The sidebar groups independent Story runs below their shared authored setting, while the blank-session Hero picker creates or selects a Story. Storybooks and runs keep creation-time order when the player changes the current Session. Run labels use the current public Session title; a managed `.runtime` directory title is replaced by the localized story fallback and never shown as product content. Creation-task, run, and storybook deletion require explicit confirmation and use trash icons rather than archive icons.

A creation task remains owned by its Story control registration. Creating one first uses the host directory picker to grant an explicit local `cwd`; that picker is an authorization seam and does not require coding Workspace ownership. Publishing removes runtime scene/Actor ownership but retains that active control registration with the template. Deleting a draft task deletes its draft Story; deleting a published task archives only its control registration and preserves the published storybook. The sidebar renders creator Sessions only while a Story still owns that control registration, so deleted tasks disappear immediately and remain hidden after reconnect without mounting coding-workspace services.

## Dev Note

The owning decisions are [Story aggregate storage and navigation](../../../.agents/notes/implemented/feature/2026-08-29-story-aggregate-storage-and-navigation.md) and [Independent Story runs and roleplaying deletion](../../../.agents/notes/implemented/feature/2026-08-31-independent-story-runs-and-deletion.md).

## Model Experience

None, as this package only renders browser Story state.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Deleted managed Story aggregates are staged in the Host trash and cannot yet be restored from the browser.
- Actor-private Sessions are intentionally absent from the ordinary scene list.
