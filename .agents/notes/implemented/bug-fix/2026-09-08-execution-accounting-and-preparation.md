# Agent Note: independent execution accounting and director preparation

Status: implemented

English | [中文](2026-09-08-execution-accounting-and-preparation.zh.md)

## Problem

Independent play omitted native token usage, while opaque Director tool inputs caused repeated parameter corrections. Empty scenes hid existing cast identities. A stopped group discussion waited for another player command. Long original records could be truncated with no continuation, and live character output was hidden behind a diagnostic switch.

## Decision

The execution adapter uses the native complete-turn token fold, retains every request attempt, and exports those totals with portable request evidence. The browser reuses the native disclosure with its locale and exact cache/input/output buckets. Missing records remain unavailable, never estimated as zero.

A required command union derives complete operation fields, required properties and enums from the domain command schemas. Domain parsing still enforces numeric and text bounds. The context includes a bounded existing-person directory even before attendance is established. Tool instructions distinguish scene staging from publishing narration and defer analysis language to the enabled narrative instructions.

A completed discussion automatically invokes one Director conclusion under the existing cancellation epoch. The continuation records no player message and reuses its durable receipt on retry. Private discussion preparation runs concurrently on frozen inputs. A shared revision fence advances only for sibling preparation writes; external edits and cancellation reject late results. Public character responses stay serial. Manual discussion defaults follow the instance configuration.

Original recall includes director-visible player instructions and published narration with distinct provenance. Character access remains separately filtered. A truncated original returns a source ID and character offset; the next page resumes that original before advancing to another record. A changed source rejects continuation.

The main play view follows the host-selected active character. Partial public behavior fields render as uncommitted drafts; private mutations remain diagnostic. Earlier request steps remain readable while the next step streams. Accepted narrative records remain the sole source of historical story text.

## Alternatives considered

**Count tokens from rendered prose.** This loses prompt, cache, tool and retry usage and cannot reproduce provider accounting.

**Forbid multiple Director requests.** Preparation contains legitimate dependent tool steps; preventing all iteration would conceal failures and block scene publication.

**Rewrite historical requests or merge duplicate names.** Historical inputs must remain factual, and matching names do not establish identical people.

## Consequences

Focused application, native adapter and browser tests cover request accounting, source continuation, cancellation, idempotent discussion handoff and readable drafts. The isolated live-provider diagnostic checks a four-person opening for published narration, duplicate creation, tool failures, language and native usage. Prompted reasoning length remains a model instruction, not a hard token or sentence limit. Existing authored recipe choices and user story data are retained.
