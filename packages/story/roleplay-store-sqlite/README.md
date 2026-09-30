---
description: "Dedicated SQLite transactions for independent roleplay narrative records."
kind: "package-reference"
---

# @deepseek-ai/dsh-roleplay-store-sqlite

English | [中文](README.zh.md)

## Summary

`SqliteRoleplayStore` implements the narrative transaction port with Node's synchronous SQLite driver. It stores published versions, instance events, projections, receipts, checkpoints, and pending notifications in a dedicated database. It does not extend Harness KV storage or read Actor Session logs.

## Table of Contents

- [Development Contract](#development-contract)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="development-contract"></a>
## Development Contract

Construct the provider with explicit `path`, `journalMode`, and `busyTimeoutMs` values; `:memory:` is a valid path. A new database uses schema version 1, a dedicated application identity, and full synchronous durability. Unsupported, foreign, or unversioned nonempty databases are rejected. `close` releases the owned connection. The constructor creates missing parent directories; the caller chooses the isolated data directory.

A write callback runs inside `BEGIN IMMEDIATE`; failures roll back every write. Read callbacks use a consistent SQLite snapshot. Every record key contains scope, collection, and local identity. Callbacks are synchronous, and retained transaction views reject later access. Notifications are delivered outside these transactions by the application service. `embeddedResourceVerifier` checks portable paths, canonical base64 bytes, and SHA-256 digests without writing resource files.

<a id="model-experience"></a>
## Model Experience

### Narrative persistence

#### What the model sees

The provider adds no model messages; applications use `SqliteRoleplayStore` records to reconstruct perspective-scoped context.

#### Token effect

SQLite writes consume no model tokens. Context selection and recall rendering belong to narrative applications.

#### KV Cache effect

Storage does not assemble or reorder model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The driver blocks the host thread while accessing SQLite. The independent profile uses this provider; Loader and browser tests exercise its transactions and restoration. Multi-process contention acceptance remains pending. Existing Story files are preserved; this package supplies no automatic migration.

<a id="dev-note"></a>
### Dev Note

The memory and SQLite tests share rollback, retry, and transaction-lifetime expectations. See [the narrative core](../roleplay-core/README.md) for application semantics and integration status.
