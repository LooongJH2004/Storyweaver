# Agent Note: Exact Web per-Turn token usage

Status: implemented

English | [中文](2026-08-24-web-per-turn-token-usage.zh.md)

## Problem

Web Chat exposes cumulative session token usage near the composer, but that value cannot explain the cost of one completed Turn. A paged history window may begin inside a Turn, retries may consume several model calls, streaming and final events may repeat one attempt's usage, and optional cache fields do not prove an exact total. Displaying a partial subtotal as Turn usage would make recorded provider facts look more complete than they are.

## Decision

The shared `TokenUsage` value carries optional `totalTokens` for one model call. Adapters publish it only from an exact provider total or authoritative aggregate prompt and output counters. DeepSeek checks its prompt-plus-completion aggregate against any wire total, and pi-ai preserves its provided total.

Token-meter owns a browser-safe pure Turn-local fold over durable session events, shared with its retry-aware cumulative usage projection. `step/start` and `llm/retry-started` open actual attempts; a final assistant message replaces the same attempt's streaming sample; terminal failures, retries, and step boundaries close attempts without double counting. Every started attempt must close with safe non-negative integer usage and an exact total. Optional cache, reasoning, and route aggregates appear only when every contributing attempt reports them, and reasoning remains a subset of output.

Web Chat selects a Turn only when its loaded match window includes `turn/start`, passes that complete durable-event window to the token-meter fold, and renders the result. A complete, exact result appears through a local-state `DisclosureRow` above the existing actions; incomplete or contradictory evidence produces no row. Chat owns no token-accounting state machine.

Orchestrators attribute child work through durable `token-meter/child-turn-usage` records carrying parent coordinates and a child Session/Turn identity. The fold includes each child once, rejects conflicting duplicates or unavailable accounting, and refreshes an already completed footer when a late settlement arrives. Story Actor dispatch records billing at child `turn/end`, independently of whether fictional behavior is accepted, so reported retry and cancellation costs remain included. Session-local pressure and cumulative projections do not consume this attribution.

## Alternatives considered

**Subtract neighboring cumulative session values.** Rejected because pagination, compaction, retry coverage, and projection completeness can make adjacent values incomparable; subtraction would infer data that no call reported.

**Publish historical per-Turn values through a new client session projection.** Rejected because the loaded per-Turn view already has durable attempts and attributed child settlements, while a history-growing projection would add transport, persistence, and versioning costs. A non-surface child settlement travels through the existing event stream and keeps accounting with the shared pure fold.

**Show known buckets without an exact total.** Rejected because a lower-bound subtotal presented in a completed Turn footer is indistinguishable from a complete bill.

## Consequences

New provider records can expose exact per-Turn accounting without a new transport or persisted UI state. Older sessions and adapters without enough evidence simply omit the disclosure. Model routes disappear as a group when any billed attempt lacks attribution, while trustworthy token totals remain visible.

Historical logs without child attribution retain parent-only totals; saved sessions are not rewritten.

Adapter, accounting, component, and assembled Web replay tests cover exact totals, optional-field omission, incomplete or contradictory usage, normal Actor replies, repair retries, billed cancellation, duplicate replay, and footer interaction and updates through append and pagination. The cumulative projection reports whole-log buckets; only the Turn fold requires complete, exact accounting.
