# Agent Note: Correct tool guidance from local execution failures

Status: implemented

English | [中文](2026-09-08-log-driven-tool-guidance.zh.md)

## Problem

The inspected local independent story contained 51 tool calls and 10 rejected calls across five execution sessions. Failures included missing observe.state, duplicate command nesting, malformed JSON, an overwritten empty summary, physical posture used as a turn disposition, copied state definitions with the wrong key, missing thought content during repair, invalid discussion phases, and a discussion recap ID used as a source. These are observed protocol failures, not a measured assessment of fictional judgment.

The perspective renderer exposed discussion-turn IDs that the evidence validator could not accept. Generic rejection then led one actor to remove the invalid sources but also omit required thought content. The director parameter projection showed required fields yet provided no complete operation example and omitted nonempty-text constraints.

Two later director preparations on September 9 contained nine calls, four rejected: repeated command nesting and trailing JSON braces persisted despite explicit wrapper warnings. The accepted second narration also invented a character's dialogue after inspecting a ledger and delivered that invented disclosure to the other characters. This motivates simplifying the prose operation and adding a concrete distinction between observation, reaction and disclosure.

## Decision

Keep the single atomic NPC submission and the domain director operation union. Expose world settlement through the flat director_observe tool, with the remaining operations on director_command. Both register through the same guarded execution callback, receipt logging and disposal path. Narration guidance explains objective outcomes, recipient-specific perception and subsequent actor dispatch, with an inspection example that does not invent speech or distribute a private discovery. Place NPC distinctions at the relevant fields: posture is a turn disposition, thought content is required per item, and existing state updates omit definition. Custom wording and immutable versions remain untouched; execution guidance names the current tools.

Perspective text states when there is no assigned discussion and explicitly describes private preparation. Discussion recaps retain speaker and text but omit non-citable turn IDs. Source errors direct the model to received evidence or personal records without granting new access; phase errors describe the permitted correction. The domain still rejects invalid sources and public behavior in preparation without committing partial effects.

## Alternatives considered

Silently stripping invalid fields or converting discussion IDs into evidence would conceal model errors or invent provenance. Relaxing preparation would publish private planning. Splitting every director operation is unnecessary: only prose settlement has the repeated long-payload wrapper failures observed here. Literary authorship remains prompt-guided; heuristically rejecting all quotations or character mentions would also reject legitimate environmental narration and accepted behavior references.

## Consequences

Request text and tool schemas change, so existing cache prefixes can differ. The changes do not guarantee error-free generation or demonstrate lower provider error rates. Additional instructions consume tokens; optional fields remain omitted for routine turns. Saved custom context recipes can still disable the discussion section, while fixed tool policy and domain checks remain active.

The core source alias names index.ts explicitly so source-mode execution does not resolve stale adjacent JavaScript artifacts. The real Loader test records the NPC policy and tools received by the mock provider, verifies rollback and resumed isolation, and checks separate system/user recipe messages. The director schema snapshot validates its examples and rejects sanitized local failure patterns. The discussion application test rejects a recap ID atomically and accepts the actual received evidence ID. No real-player turn or paid provider call is used for validation.

The director composition test rejects a nested narration, accepts the corrected flat submission, verifies only the four successful preparation writes have receipts, and continues into a character turn. It records the complete director policy and schemas. Client tests extract only public narration from partial flat arguments and preserve old recorded narration rendering. These tests verify protocol and publication, not a measured improvement in model literary judgment.

The owning implementations are [NPC protocol](../../../../packages/story/roleplay-core/src/npc-protocol.ts), [perspective projection](../../../../packages/story/roleplay-core/src/perspective.ts), and [director schema](../../../../packages/experimental/actor/src/director-tool-schema.ts). Future real-model evaluation must distinguish first-call success from successful retries and use isolated stories.

Local director turn 8 attempted one supporting-character creation three times: malformed JSON with an extra closing brace, then initial knowledge using the new display name as targetActorId, then a successful corrected creation. The tool schema now supplies an executable creation example and exact-ID guidance; policy distinguishes self/world beliefs from identifying another person. Domain rejection names the invalid target, explains omission, and guarantees no partial creation. Regression coverage checks rejection, correction and receipt reuse without duplicate people. These checks do not measure live-model error-rate reduction.
