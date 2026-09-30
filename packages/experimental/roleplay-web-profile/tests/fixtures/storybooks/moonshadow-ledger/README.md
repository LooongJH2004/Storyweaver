# Moonshadow Ledger test storybook

English | [中文](README.zh.md)

A short transformative test story set in Baldur's Gate's Lower City after the main events of *Baldur's Gate 3*. It assumes no fixed ancestry, class, romance, or final choice for Tav and no single personal ending for Shadowheart, Astarion, or Gale.

This directory is the canonical Storyweaver roleplaying integration fixture. New cross-layer and acceptance tests should extend Moonshadow Ledger instead of introducing a second generic storybook, unless the behavior specifically requires a structurally different document.

This fixture validates Storyweaver roleplaying behavior rather than recreating the original game's quests:

- `storybook.json` contains machine-readable world truth, private character context, and plot nodes.
- `opening.md` contains the public opening available to the Director for scene framing.
- `director-outline.json` is a reference fixture for validating outline structure and long-range planning. It is not imported into the default story: a new story starts with an empty Outline, and the Director drafts it before the first advancement.
- `simulation-cases.json` contains acceptance cases for automated or manual simulation, including typed world settlement, perception delivery, reviewed memory, durable discussion, context recipes, and Story Package round trips.

The Director can inspect the whole storybook but may use it only for environment, continuity, and structured context. A new story starts with an empty Outline; on its first advancement, the Director drafts long-range arcs, candidate beats, mysteries, pacing clocks, and foreshadows before committing a per-turn Brief. The separate outline reference fixture exercises those structures without making them canonical. Persistent characters receive only their own `privateContext`, public setup, and information they actually perceived or were told; their speech and autonomous action must come from their own accepted NPC tools. The player retains god view, can edit and lock the durable outline, and may observe, choose direction, intervene, or temporarily embody any character with explicit player origin.

<a id="performance-comparison"></a>
## Performance comparison

[The live evaluation](../../../../../tool-director/tests/moonshadow-performance.e2e.ts) runs opening, questioning, deception, silence, injury, and discussion against the authored baseline and three preset pairs. That evaluator now reads the preserved legacy-profile fixture and runs the old composition; its results do not evaluate the independent narrative product. The pairs cover all six built-in Director and Actor presets; they compare complete configurations and do not isolate each preset's causal effect.

Build the Host and Web artifacts with `pnpm run build`, configure `DEEPSEEK_API_KEY` in the process environment or repository `.env`, then run `pnpm run test:e2e packages/experimental/tool-director/tests/moonshadow-performance.e2e.ts`. Without a key, all 28 cases skip explicitly. `DSH_ROLEPLAY_EVAL_MODEL` selects the model; the default is `deepseek-v4-flash`. Add `-t performance-opening` to run only the four opening configurations. Each case defaults to 180 seconds and 4096 output tokens per request, with no test-level retries. `DSH_ROLEPLAY_EVAL_TIMEOUT_MS` and `DSH_ROLEPLAY_EVAL_MAX_TOKENS` allow separately recorded budget experiments; `review.json` records those limits. Do not combine these experiments with the original comparison.

The version-6 fixture explicitly defines first-encounter appearances, shared common knowledge and each character’s initial acquaintances. Four additional `cognition-*` scenarios exercise stranger aliases, hearsay without a known person, a returning supporting Actor and private relay. Run them with `-t cognition-`; they use the baseline style only. The review records name leaks, unsupported knowledge and duplicate people as human-audited counts with denominators and evidence; unreviewed counts stay null. These cases have not yet been evaluated with a real model.

Results stay under `.artifacts/moonshadow-performance/<timestamp>/<case>/<variant>/`: complete Session logs, an importable Story Package, and `review.json` with the fixture hash, model, measured runtime, step-start-to-response timings (including context preparation), tool failures, and reported token usage. Missing usage remains unavailable, and partial accounting is marked incomplete. Human reviewers fill the empty judgments and quote evidence for character differences, repetition, plausibility, player agency, knowledge isolation, and example isolation. Session logs, a standalone Story record, and review metrics survive package-export failure; the test still fails and records the export error. The suite also checks that embodied characters have no autonomous world events and that the injury case changes its objective body field. A successful test does not certify performance quality.

This is non-commercial, transformative fan-test material. *Baldur's Gate 3* and its characters belong to their respective rights holders.

The current storybook explicitly uses `director_command` operations. Publication preserves custom wording and never silently rewrites an old custom tool protocol. `packages/story/roleplay-core/tests/moonshadow.spec.ts` covers its independent publication, character initialization and resource-preserving archive round trip. Browser acceptance imports, reviews, publishes and starts this document through the default profile. Initial knowledge uses a durable authored source instead of transient ordinal references.
