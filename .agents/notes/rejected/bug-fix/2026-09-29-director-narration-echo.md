# Agent Note: Keep director narration from replaying accepted actor turns

Status: rejected for this round; the one-line guidance change was reverted after live Agent Role Play replay

English | [中文](2026-09-29-director-narration-echo.zh.md)

## Problem

In the kitchen-letter live replay, the director narrated Nono's paper-handling action again after the actor's action and speech were already visible, then quoted the same line. The result made one moment play twice and exposed an appearance label as prose. Earlier kitchen replays also repeated paper-handling actions. The existing [director performance guidance](../../implemented/feature/2026-09-10-director-performance-cues.md) already advises against step-by-step restatement, but the `director_observe.narration` field still requested fully developed paragraphs for every observable event.

## Decision

The proposal changed only the `director_observe.narration` field description to ask for newly observable world results and consequences. The old source text and snapshots were restored after the live replay did not meet the registered acceptance condition.

## Alternatives considered

- **Repeat the prohibition in general director performance guidance:** that guidance already contained it, while the more local tool field still pushed a fully developed retelling.
- **Suppress similar prose mechanically:** text overlap alone cannot distinguish a redundant replay from a necessary account of a new consequence, and could hide important results.
- **Make all settlement narration short:** major transitions and configured length preferences need room to develop.

## Consequences

The focused schema test verified the candidate's model-visible field description. The first real provider A/B pair did not support the hypothesis: baseline A1 had no repeated narration, while candidate B1 repeated Nono's already visible paper-handling action. The pair consumed nearly all of its registered token budget, so the required repeats and holdout were not run. [The round record](../../../../.artifacts/storyweaver-evolution/round2-director-echo-registration.md) records incomplete evidence and the exact failure. A later independent experiment is required before claiming literary improvement.
