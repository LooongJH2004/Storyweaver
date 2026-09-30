# Agent Note: Context length and native timing

Status: implemented

English | [中文](2026-09-11-context-length-and-native-timing.zh.md)

## Problem

The assembled context character ceiling silently omitted whole evidence entries and rejected long required settings or pins. Narrative token disclosures also lacked the first-token and decode-speed readings already supported by native DSH events.

## Decision

ContextAssembly includes complete text from enabled recipe sections without a total character ceiling or a recipe-module count ceiling. Actor and director automatic contexts now include all authorized, unrepresented history and active records without entry-count selection. Sources are indexed by section ID during assembly while retaining recipe order, roles and provenance. Observer filtering and effective-summary replacement remain enforced. `recallCharacterLimit` and `queryPageLimit` bound only explicit retrieval pages, whose continuation preserves access to long originals. The older `PerspectiveBudget` and its count fields were removed. Narration output length settings remain independent. This updates the length policy in [attributed character perception](2026-09-11-attributed-character-perception.md).

The public session-stats deriveTurnPerformance helper reuses the native projection fold over a complete durable log. Completed technical turns receive optional first-entered-step TTFT and average decode throughput. Throughput is summed eligible provider output tokens divided by summed decode seconds, excluding prefill and tool waiting. Non-empty reasoning and tool deltas count as first tokens; in-step retry behavior remains native. Missing first-step timing is not replaced by a later step, and reasoning tokens are not counted twice.

The execution request index attaches these readings to each request in the same turn. Portable archives preserve them, while old archives leave absent readings unset. The native token disclosure remains in place; narrative footers and request details add seconds and tokens per second. Missing readings display Not recorded, independently of valid zero values. No additional provider request or model-facing statistics text is introduced.

## Alternatives considered

- Raising the character ceiling retains arbitrary omissions and oversized-pin failures.
- Keeping automatic entry-count selection would still silently omit authorized history, even without a total character ceiling.
- Dividing tokens by total turn time mixes generation with tool waiting, while averaging step rates gives short and long steps equal weight.
- Reconstructing missing archive timings from tokens invents measurements.

## Consequences

Complete authorized history increases model input size and can encounter the provider's context-window limit. The application does not silently truncate it; provider capacity remains external. Effective summaries still replace covered originals unless pinned, and archived, forgotten or unauthorized records remain excluded. Recall page limits still provide explicit continuation. Indexed assembly reduces local source-collection work; it does not change model input length or establish a provider-latency gain.

Domain tests cover long settings, perception, pins, chronology, disabled sections and audience isolation. Native timing tests cover weighted multi-step decode, missing usage, retries, zero readings and incomplete turns. Request-index and archive tests cover propagation and compatibility. UI tests cover units and missing values; the real Loader browser layout test verifies recorded timing and narrow-screen overflow. Builds and targeted checks are recorded in the task; repository-wide documentation failures outside this change remain separate.
