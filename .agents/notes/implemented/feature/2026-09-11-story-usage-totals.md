# Agent Note: Native cumulative story usage

Status: implemented

English | [中文](2026-09-11-story-usage-totals.zh.md)

## Problem

Individual replies expose native usage, but the story composer lacks the cumulative statistics shown by the native chat. One story spans separate director and character execution sessions, so connecting only the director session undercounts its costs.

## Decision

The composer footer uses the native StatsSummary rendering. An instance-authorized query sums the native sessionStats and tokenUsage folds across director and character logs. Persisted logs remain readable without starting an Agent. Imported full native logs participate; repeated copies of a session count once. Portable request-only evidence cannot reconstruct these complete native statistics.

The row reports technical turns and steps, LLM/tool time, sampled mean first-token latency, aggregate decode throughput, input-weighted cache hits and disjoint input/output totals. Reasoning tokens remain part of output. Billing includes actual superseded attempts and native retry accounting; it does not follow the currently visible fiction branch or history page. Native folds distinguish missing timing samples from recorded zero.

The browser refreshes on story revision and execution-state changes. Switching stories hides the preceding story's figures immediately. Reads do not advance the story, change perspective or open the request inspector. Failed reads retain an explicit retry affordance. The native clipped-line tooltip exposes long rows without crowding the composer.

## Alternatives considered

- Summing reply footers repeats per-turn values across multiple requests and omits unpaged history.
- Averaging per-character rates weights short and long generations equally and misstates throughput.
- A second custom statistics widget duplicates native formatting and billing semantics.

## Consequences

Native packages expose pure whole-log readers, and native chat exposes its existing statistics renderer independently of session hooks. The execution adapter owns technical log interpretation; the frontend receives totals only. Tests cover cross-session weighting, duplicate usage replacement, duplicate exported logs, missing timing, story switching and the native browser footer after reload.
