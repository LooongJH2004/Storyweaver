# Agent Note: Attributed character perception

Status: implemented

English | [中文](2026-09-11-attributed-character-perception.zh.md)

## Problem

Actor evidence containing only prose and a person reference requires a separate roster lookup, drops the addressee and communication mode, and loses behavior order within one commit. Player narration and actor deliveries can also diverge when the director omits a decisive observable detail or retains an obsolete scene cue.

## Decision

Accepted behavior freezes a recipient-specific attribution beside each evidence record: the speaker or performer, known label, local reference, speech addressees and delivery mode, or an action's person target. Original speech and action prose remain unchanged. Private intent and purpose are excluded. The existing [routing rules](../bug-fix/2026-09-10-npc-reference-routing.md) remain authoritative: long opaque refs continue to route tools, while labels make the history readable. Names are not automatically resolved or treated as verified identities.

Actor evidence selects recent entries under its entry count, without a total character ceiling, then presents admitted entries in publication and behavior order. Attempts remain distinct from delivered outcomes. Original recall and pinned evidence retain the same attribution; recall pages prefer recent entries and carry their ordering coordinates. Publication freezes labels before later recognition, departure or disguise changes. Existing text-only evidence recovers source labels and order from accepted behavior; missing historical addressee projections remain explicitly unknown. Reads do not migrate records or rewrite recorded model requests.

Actor guidance permits addressing strangers by appearance or natural forms of address and asking names when an introduction, continuing relationship or immediate purpose warrants it. Urgency does not require a naming ritual. Heard names can become sourced personal identity judgments without establishing a true identity.

Director narration remains player-facing; explicit deliveries remain each actor's perceptions. Prompt guidance asks the director to preserve relevant observable actions, words, details and order, and replace or clear scene cues contradicted by settled developments. Actor guidance gives newer perceptions precedence over obsolete cue assumptions. No narration broadcast, automatic perceptibility filter, semantic validator or additional model call is introduced. This extends the [independent narrative architecture](../architecture/2026-09-07-independent-narrative-instances.md) without superseding its perception ownership.

## Alternatives considered

- Sending complete narration to every actor exposes private and off-scene information.
- Automatically filtering literary narration adds model cost and still cannot reliably infer attention, occlusion or sensory access.
- Reconstructing old addressee names from current knowledge can reveal later recognition or link disguises retroactively.
- Replacing exact routing references with names introduces ambiguity and bypasses observer-specific identity boundaries.

## Consequences

Attribution adds text to selected evidence. The later context-length change removes the total character ceiling; entry counts still select recent history and other originals remain retrievable. The [domain tests](../../../../packages/story/roleplay-core/tests/world.spec.ts) cover chronology, audience isolation, historical recognition, disguise and departure, recall, pins, archive replay and forged attribution. The [context tests](../../../../packages/story/roleplay-core/tests/context-cache-order.spec.ts) cover recent selection followed by chronological rendering. The [real execution test](../../../../packages/experimental/actor/tests/narrative-executor.real.spec.ts) sends another character's attributed speech and action through SQLite, the Loader and the Harness model request, while snapshots pin actor and director guidance. These checks establish delivery and validation behavior, not a guarantee of literary quality or perfect director consistency.
