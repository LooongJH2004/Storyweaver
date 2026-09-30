---
description: "Launch independent Storyweaver instances with transactional narrative storage."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-roleplay-web-profile

English | [中文](README.zh.md)

## Summary

This private product layer applies after `@deepseek-ai/dsh-web-app`. The default composition mounts independent narrative applications, SQLite, a typed browser API and `ui-narrative`. Published storybook versions, instances and Harness sessions have separate identities and owners. The original Story registry, Story API, Actor business service and Director tools are absent from the product composition.

AI authoring uses the independent `storyweaver-author` preset inside the native conversation, tool, permission and request-history surfaces. The creation page uses the host browse-directory backend without the generic workspace registry. Director and Actor executions keep their own restricted tool scopes; restoring creator UI does not enable old Story writers.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Use this package

Install with `pnpm dsh plugin --profile web add ./packages/experimental/roleplay-web-profile`, or launch a one-off supported profile:

```sh
pnpm dsh web --patch ./packages/experimental/roleplay-web-profile/cordis.patch.yml
```

The default Home is `Storyweaver-independent-v1` under the platform data directory; `STORYWEAVER_INDEPENDENT_HOME` selects another isolated directory. Existing directories remain untouched. Old runtime archives are not automatically converted. Import an authored storybook as a draft, review and publish it, then create an instance. Independent narrative archives import as new instances.

## Understand the implementation

[`cordis.patch.yml`](cordis.patch.yml) mounts Story Home, `roleplay-services` and `api-roleplay-controller`, and enables the narrative UI from the Web bundle. Session evidence, attachments and general storage use the selected Home. Dedicated SQLite owns narrative commits, projections, revisions, idempotency and notifications; Harness owns actual request logs and execution recovery.

Play retains four input modes, accepted narration and behavior, discussions, interruption, checkpoints and compensating restoration. The author workspace includes settings, people, styles, state, context, outline review, material extraction and opt-in live diagnostics. Execution model preferences use host settings and are sampled at the next execution, including existing actor sessions. Credentials remain in general model settings.

The old composition exists only in `tests/fixtures/legacy-profile` for baseline regression. It is neither a package export nor a supported launch profile. There is no dual writing or automatic synchronization between old and new authorities.

Director and Actor tools delegate to independent application commands. The Director settles world changes; Actors own subjective cognition and accepted behavior. After a single actor response, the configured Director continuation can choose another speaker from that accepted response. Current previews and actual context share perspective queries. Historical requests read recorded evidence, including responses. Draft text and reasoning never become accepted fiction by themselves.

## Model Experience

Indirectly, through the mounted narrative applications and actor executors, which own model instructions, tools and perspective projection.

#### KV Cache effect

No cache, token or latency improvement is claimed without measurement.

## Known Limitations and Deferred Work

Keyless Loader/browser acceptance covers privacy, supporting characters, state, styles, settings conflicts, outline review, discussions, recovery, archives, material extraction, live drafts, model selection and narrow layouts. Domain and SQLite tests cover isolation, rollback, retry identity, resource bytes and large absent-character queries. Native scenario measurements and their quality limits are recorded in the [discussion and memory plan](../../../.agents/notes/implemented/feature/2026-09-12-discussion-perception-memory.md#execution-evidence); they do not establish universal acting quality or long-run leakage rates.

- There is no autonomous offscene scheduler, runtime branching, instance merging or implicit old-data migration. Advanced structured fields use JSON editors. Live diagnostics coalesce updates but still scan execution history; very long log performance needs separate measurement.

### Dev Note

See the [independent narrative architecture note](../../../.agents/notes/implemented/architecture/2026-09-07-independent-narrative-instances.md). Preserve old files as original evidence.
