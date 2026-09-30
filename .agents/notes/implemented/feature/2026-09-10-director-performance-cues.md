# Agent Note: User-directed performances through scene guidance

Status: implemented

English | [中文](2026-09-10-director-performance-cues.zh.md)

## Decision

Director authority includes giving character executors actionable performance direction on behalf of the user. The existing style command with scope=scene carries an audience-specific objective, approach, tone, initiative and length instruction. Its model-facing example appears beside scheduling examples. Successful cues precede finish or discussion advancement; cue writes do not themselves dispatch actors or publish behavior. Directors can inspect active directions and clear or replace them without changing permanent character profiles.

Actor requests label scene direction as author-side performance guidance, not perception or evidence. Actors actively realize the requested development in their own voice, subject to actual player ownership and available knowledge. Autonomy assigns performance authorship rather than a general veto over direction. The director still cannot publish unsubmitted character choices as narration; a cue cannot establish another person's consent, unknown fact or successful action. Source code cannot prove that arbitrary natural-language guidance contains no secret, so the model protocol also prohibits forwarding private author context in cues.

## Evidence and reference

After the observer-initiative adjustment, local requests contained the new policy and the protagonist appeared in dispatch, but recent actor contributions remained roughly 97–233 characters. Broad requests for developed prose did not specify a useful writing scale. The user-supplied AIAgentRolePlay reference implements spotlight_cue with a separate situation cue for each recipient. This project reuses its existing audience-scoped scene instruction mechanism instead of introducing a second cue store or a competing dispatcher. It does not copy the reference's mandatory question endings, unconditional refusal of player-labeled protagonists, or arbitrary disasters as an anti-stall strategy.

## Prose and progression

The director develops cause, observable change and practical implications; actors develop a response and a concrete initiative. Repeated atmosphere, hesitation and paraphrased warnings do not satisfy a new substantive beat. Default editorial targets are 4–6 paragraphs and 500–900 Chinese characters for narration, and 3–5 paragraphs and 400–800 characters for an actor contribution. Comparable depth applies in other languages. Existing lengthPreference and scene instructions override these targets; short interruptions, private preparation, silence and maintenance remain valid. No hard minimum, automatic rewrite loop or extra discussion round is added. Longer prose can increase generation time and token use; it does not prove faster narrative progress.

## Verification

Application tests exercise cue delivery to one actor, separation from facts and evidence, isolation across actors and instances, changed-scene exclusion and historical replay. Real Harness composition sends style then finish, records the resulting actor guidance and snapshots director/NPC policies and tool descriptions. An optional real-provider probe uses two neutral temporary characters, records received cues and public response lengths, and checks successful dispatch. Literary quality and appropriate progression still require human review of those outputs.

One DeepSeek V4 Flash Low probe completed in approximately 50 seconds with 490 narration characters and actor contributions of 460 and 538 characters. Both actors received distinct cues and produced a crossing proposal, risk assessment and division of work. This is one neutral scenario, not an A/B comparison with the user's story, a throughput benchmark or a guarantee of factual consistency. The focused keyless suite has 72 passing tests; the full build and the optional live probe also pass.
