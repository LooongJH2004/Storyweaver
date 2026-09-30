---
description: "The Story package group: opaque Story identity, managed storage, and durable orchestration boundaries."
kind: "package-group"
---

# packages/story

English | [中文](README.zh.md)

## Summary

The Story group gives Storyweaver one product aggregate that does not depend on a working directory. `story-home` owns the fixed Host-only filesystem root and managed per-Story layout. `story` owns opaque identity, typed Session roles, the persistent Plot Ledger, and strict Director Brief commits. Together they keep browser and model contracts path-free while Actor Session logs remain authoritative for persistent-character behavior.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`story-home`](story-home/README.md) | Fixed Host-only Storyweaver root and managed per-Story directories | `ctx.storyHome` |
| [`story`](story/README.md) | Durable Story registry, Session ownership, Plot Ledger, and Director boundary | `ctx.storyRegistry` |
| [`roleplay-core`](roleplay-core/README.md) | Pure narrative rules, independent application services, and memory test storage | Explicit constructors |
| [`roleplay-store-sqlite`](roleplay-store-sqlite/README.md) | Dedicated transactional narrative storage and resource verification | Explicit constructor |

-----

<a id="related-documentation"></a>
## Related documentation

- [Story subsystem](../../docs/subsystems/story.md) — Story vocabulary, persistence, Remote projection, and generated Cordis API.
- [Actor subsystem](../../docs/subsystems/actor.md) — autonomous character state and NPC behavior events consumed by the Plot Ledger.
- [Storyweaver Director boundary and Plot Ledger](../../.agents/notes/implemented/feature/2026-08-29-storyweaver-director-ledger.md) — authority and provenance rationale.

-----

<a id="dev-note"></a>
## Dev Note

None.
