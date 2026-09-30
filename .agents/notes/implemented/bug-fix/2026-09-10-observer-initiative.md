# Agent Note: Observer protagonist initiative and narrative pacing

Status: implemented

English | [中文](2026-09-10-observer-initiative.zh.md)

## Evidence

A local story's six director runs omitted its protagonist while every recorded preparation context had playerControlledActorId=null. Authored guidance still called that character player-controlled, and the director context omitted protagonistActorId. A later player-control command is separate from those historical observer runs. The recorded narration lengths were 90–225 characters and complete runs took approximately 15–26 seconds. These observations establish conflicting ownership instructions and brief output, not provider throughput or a token-limit diagnosis.

## Decision

The director receives protagonistActorId, playerControlledActorId and AI-controlled present IDs in the existing required scene section. Live ownership is authoritative over authored player-character labels. The optional protagonist remains narrative focus, never implicit ownership or an inferred first character. Present IDs describe the frozen revision; accepted staging receipts govern subsequent scheduling. Host ownership, attendance and discussion checks remain authoritative.

The director normally gives a present, available protagonist an opportunity to advance the current beat through its character executor. It develops observable events and consequences without writing character choices. Actor instructions encourage initiative from existing goals and perceptions and permit substantial ordered speech/action contributions in one submission. Compact planning and delta-only private records do not impose terse public prose. Silence, explicit pacing requests, preparation privacy and pending world adjudication remain valid stopping conditions.

## Research and tradeoffs

[SillyTavern group-chat documentation](https://docs.sillytavern.app/usage/core-concepts/groupchats/) separates speaker activation from character generation. A [community discussion of scene pacing](https://www.reddit.com/r/SillyTavernAI/comments/1bk7xwm) suggests character goals as a source of forward movement; its recommendations for slow scenes are not adopted wholesale. These are design references, not evidence that a prompt guarantees improved model behavior. Automatic inclusion on every turn, fixed word quotas and extra discussion rounds are deliberately avoided because they can force irrelevant speech, filler and extra latency. Authored story data and model settings remain unchanged.

## Verification and limits

Application tests cover optional protagonist metadata, observer dispatch, protagonist ownership, ownership of another character, off-scene presence and historical replay. A keyless real Harness composition records the director policy and scene input, verifies logged context against its frozen application query, and dispatches the protagonist for a multi-paragraph speech/action submission. NPC request snapshots cover the revised actor policy. These checks prove delivery and execution rules, not live-model literary quality, protagonist selection frequency or measured speed improvements. New policy text changes the cache prefix once; dynamic scene metadata remains in its existing section.
