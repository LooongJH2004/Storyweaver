# Agent Note: NPC person routing and corrective receipts

Status: implemented

English | [中文](2026-09-10-npc-reference-routing.zh.md)

## Evidence

The local actor session ending in `a1076bf8d5a965c3b` records `npc_commit_turn` failures at turn 2 / step 1 and turn 3 / step 1 (tool result sequences 1236 and 2170). Both submissions use a display name in `behavior[1].to[0]`; the corresponding step 2 submissions use the supplied person reference and succeed. Turn 2 changes only that recipient field; turn 3 also changes action prose unnecessarily. Neither rejected submission contains knowledge or state source citations. Private thought subjects already use references in turn 3 and are not the failure cause. Source logs stay local; tests use neutral fictional text.

## Decision

The shared NPC policy, recipient schema examples, and required CURRENT PEOPLE section distinguish routing refs, display labels, and evidence sources. Private thought subjects remain descriptive. The semantic submission validates behavior targets, new state-definition person fields, knowledge subjects, and discussion handoffs before staging character changes. Rejections identify every invalid field and preserve the entire transaction. A unique matching visible label receives its ref as a correction hint; ambiguous labels receive only observer-visible candidates. The caller must still submit an explicit ref.

## Alternatives and consequences

Automatic name resolution risks choosing the wrong person or revealing an unknown identity. Dynamic tool-schema enums would change request prefixes with each roster. The implementation preserves observer-local lookup and static tool schemas. Hidden author names and other observers' references are not included in correction hints. Existing authored recipes and historical logs remain unchanged; the shared runtime policy and required context apply to new requests in existing instances. This adds bounded routing guidance to each context and a fixed policy/schema cost; provider cache savings and live-model error reductions are not measured.

## Verification

Domain regression replays two consecutive label failures, verifies complete rollback, rejects another observer's ref, and accepts corrected recipients while preserving descriptive thoughts. A combined-error case checks exact paths and ambiguous labels. The real Loader, SQLite authority, Harness loop and mocked provider replay confirm the corrective tool result reaches the next model request; the request protocol snapshot pins the policy and schema. These checks prove deterministic validation and retry behavior, not that a live model can never produce invalid arguments.
