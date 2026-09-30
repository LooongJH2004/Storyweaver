# Agent Note: Dynamic characters and personal knowledge

Status: implemented

English | [中文](2026-09-06-dynamic-characters-and-knowledge.zh.md)

## Problem

An authored cast list exposed strangers’ names to Actors and made new supporting people depend on editing the storybook. Shared narration also conflated world truth, received evidence, and subjective belief. Later recognition could change historical labels.

## Decision

A Story owns an independent character registry inside its restorable world. Template definitions seed it once; Director-created people receive opaque identities and remain local to that Story. Presence, spotlight and Actor Sessions are separate. The Director can search and create people, while background crowds remain narration. Importance changes preserve identity, state and memory.

Each observer owns encounter references and natural-language judgments. Encounter records can represent physical appearances, disguises, or unbound hearsay. Knowledge stores evidence, acquisition, attitude and revision history; a statement heard is not proof that its content is true. Common knowledge seeds new people without granting earlier event audiences. Original-work lore requires explicit authored knowledge or perceived evidence.

The Actor log owns current personal knowledge. `npc_commit_turn` commits knowledge with state and behavior in one transaction. The Host validates ownership, visible sources, entity references and exact revisions before accepting any operation. Player corrections append compensating revisions; forgetting retains history. The Story stores a commit-derived projection for queries, packages and checkpoints. Memory and goals retain their existing lifecycles and can supply evidence references.

Actor context uses observer-local person references and opaque state-field references. The Host resolves behavioral targets. Explicit narrative mentions use the viewer’s labels; spoken dialogue remains exact. Retained authored sources carry captured identity projections, and attempt events carry historical labels. Context preview and actual requests use the same renderer; request reconstruction reads the original logged request.

The people workspace provides scene browsing, author editing, personal judgments and history. Collection into a base storybook previews reusable settings and optional current knowledge, state or memories. Confirmation checks the preview and both revisions. Missing referenced template people must be collected first. Collection does not stage anyone or update running stories.

Storybook version 6, Story domain version 12, manifest version 10, package version 5 and checkpoint version 3 describe the current durable formats. Older formats fail validation; reads perform no implicit conversion. Actor Sessions retain the existing event format with added known cognition event types.

## Alternatives considered

**Hide names only in prompts.** This leaves names and semantic IDs in rosters, tools, sources and historical labels. Structural projection and explicit evidence ownership cover those paths.

**Give every supporting person a separate lightweight simulation.** This duplicates behavior and memory lifecycles. One Actor mechanism can remain dormant until a person needs an independent turn.

**Use a rigid knowledge graph or treat perceptions as truth.** Natural-language judgments support rumors, contradictions, wrong beliefs and uncertainty without requiring a formal entailment engine. Referenced evidence establishes access, not logical correctness.

## Verification

The keyless [composition replay](../../../../packages/experimental/tool-director/tests/characters-knowledge.real.spec.ts) covers creation, lazy Actors, rejected sources, atomic behavior, corrections, cold reload, package import, template collection and same-Session rewind. [Domain tests](../../../../packages/story/story/tests/knowledge.spec.ts) cover aliases, disguise, hearsay, compensation, frozen source labels and 5,000 off-scene people. [Browser coverage](../../../../apps/web/tests/roleplay-characters-knowledge.e2e.ts) exercises the actual people and knowledge commands through the assembled client.

Final local verification: 42 scoped test files / 239 tests passed, plus the assembled-browser interaction test. Follow-up regressions passed after template-style isolation and off-scene reference projection fixes. Host/client type checks, the Web build, and documentation snippet type checks passed. Repository-wide documentation gates passed 25 checks and failed 7 on existing unrelated debt: the approval-slot inspection type, translation coverage, Markdown wrapping, exported JSDoc, older Agent Notes, documentation budgets, and the story-home README skeleton. Real-model cognition scenarios are prepared but have not run.

## Consequences

The Host enforces access and revision rules, but natural-language inference and literal name disclosure still require model evaluation and human review. This change does not introduce background Actor scheduling, a formal reasoning engine or original-work knowledge by default. Real-model name leakage, unsupported knowledge, duplicate-person creation, latency and token measurements require a separate credentialed run; offline tests do not establish performance quality.
