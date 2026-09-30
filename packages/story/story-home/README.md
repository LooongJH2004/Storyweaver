---
description: "Fixed, Host-only Storyweaver storage root and managed per-story directory layout."
kind: "package-reference"
---

# @deepseek-ai/dsh-story-home

English | [中文](README.zh.md)

## Summary

`dsh-story-home` replaces process-working-directory ownership with one fixed Storyweaver data root. On Windows the default is `%LOCALAPPDATA%/Storyweaver`; `STORYWEAVER_HOME` or plugin `root` overrides it. The Host creates `stories`, `sessions`, `storages`, `attachments`, and `trash` below that root. Each Story receives `assets`, `exports`, `world`, and `.runtime` directories, while browser APIs receive only opaque Story ids.

## Development Contract

The storage redesign intentionally imports neither Workspaces nor historical Sessions. `copyBaseline` copies only `assets` and `world` into a fresh Story; `.runtime`, `exports`, and Session state never cross a new-run boundary. `trashStory` stages a managed aggregate under `trash` so a registry deletion can compensate safely if its canonical write fails.

## Model Experience

None, as this package only owns Host storage paths.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- The derived `story.json` manifest is human-readable but is not the canonical registry record.
- Browser deletion removes the canonical Story and stages its managed directory in `trash`; no browser restore flow exists yet.
