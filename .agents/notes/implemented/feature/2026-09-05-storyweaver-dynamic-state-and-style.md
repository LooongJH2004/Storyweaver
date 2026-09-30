# Agent Note: Storyweaver dynamic state and performance guidance

Status: implemented

English | [中文](2026-09-05-storyweaver-dynamic-state-and-style.zh.md)

## Problem

Fixed psychological scales prevent authors from expressing character-specific state, while independently rendered opening values can contradict an ongoing story. Prefix-based input and undifferentiated style instructions also obscure who is acting, which settings apply, and what a character actually knows.

## Decision

Storybook v5 defines initial state through stable field IDs. Story schema 11 retains dynamic world state and audience-scoped style overrides. Text, number, boolean, choice, and tag values share definitions, validation, projections, context rendering, and browser forms. Relationship fields reference a specific character. Actor-owned state is private; world-owned fields carry explicit perceptible audiences. Existing memories, goals, intentions, and turning points keep their own lifecycles.

An Actor submits definition additions and value changes inside `npc_commit_turn`. Its synchronous transaction stages all operations and publishes one `actor/commit` event only after validation. Multiple outward behaviors retain their operation index under that physical event, so Director acceptance and original-source lookup identify the exact speech or action. Model attempts cannot redefine fields or change ownership. Player edits check exact revisions; range or type edits also validate the existing value. Inactive fields retain history, and undo creates a compensating revision.

Initial values are instantiated once per active branch, including an empty baseline. Current-state reads use live or persisted Actor logs and never resurrect opening values. Player correction of a dormant registered Actor resumes it through the existing Session controller. Story Package v4 includes current state, styles, retained Session logs, and version-2 turn checkpoints. Import remaps Session references and checkpoint dictionary keys together. Unsupported formats fail explicitly; the development-stage user explicitly waived migration of old runs.

Director and Actor styles extend their existing guidance. Presets are copied, and browser-personal presets store validated copies. Examples are expression references, never events or memories. The context recipe gives style and scene guidance their own ordered sources. Story overrides precede scene guidance. A scene transition clears temporary guidance, so returning to the same location cannot reactivate it. Actual injected content remains reconstructible from recorded requests.

The composer captures a structured input intent alongside its original text. Mode buttons seed empty drafts and replace untouched suggestions within the same Session; player edits remain intact. Suggestions contain editable prose without control prefixes, and explicit embodiment identifies a cast member. Legacy textual envelopes remain readable. Feedback derives from real Session, Actor, discussion, and Director Run state. Desktop state uses a collapsible sidebar; narrow screens use a modal drawer. The five configuration entries reuse existing revisioned save owners. Copying current state into a storybook creates an editable draft before the existing save operation.

The runtime owns `storyContextRenderer`: actual requests and configuration preview share complete section text, effective bounds, visibility, and headings. Preview only reads logs and builds a detached source index. It never provisions an Actor or instantiates opening state; pending initialization is explicit. Current-section preview is separate from the sender-serialized historical request, which also includes batching and the current-turn transaction.

Author configuration has its own exact revision and `actor/configuration` event. Before each valid Actor request, the runtime applies the current storybook name, persona, and capabilities without rebinding fictional identity or replacing state. Existing Sessions resume using their persisted identity. Author settings survive story rewrites, as saved prompt settings do; NPC commits cannot contain configuration updates.

Player ownership is derived from logged structured intent or an exact historical character name. Brief creation and every autonomous dispatch path reject the controlled Actor, including discussion preparation and public floors. Recovery preserves ownership; new ordinary input releases it. This prevents a silence input from becoming autonomous dialogue. Director narration explicitly updates affected objective fields through the same transactional state_changes call; prose alone does not alter their values.

## Community references

[SillyTavern character design](https://docs.sillytavern.app/usage/core-concepts/characterdesign/) separates personality, scenario, and example dialogue. [Author’s Note](https://docs.sillytavern.app/usage/core-concepts/authors-note/) provides temporary conversation guidance. These inform organization, not a claim of compatibility or measured quality. The six bundled Chinese presets are original project text. [Community prompt discussion](https://www.reddit.com/r/SillyTavernAI/comments/1te7bx4/the_best_part_of_your_prompt_preset/) supplies evaluation ideas; its effectiveness is not assumed.

## Alternatives considered

**A second configuration store.** This duplicates existing storybook guidance and state, creating conflicting sources. The implementation extends those owners and the existing context recipe.

**Free-form state without validation.** This permits arbitrary scale changes and cross-character writes. The implementation separates model narrative judgment from host-enforced ownership, type, reference, and revision rules.

**Multiple physical events per NPC submission.** A late failure can leave earlier private or outward writes committed. One aggregate event makes publication atomic while preserving operation-level provenance.

**Full character-card or macro compatibility.** The authorized first version needs editable guidance and examples, without importing a separate prompt runtime.

## Consequences

Authors gain flexible scales and narrative guidance without formulas, decay, or an attribute dependency engine. Model-created definitions affect only the current run until the player copies them into a template. Personal presets are local to one browser. Source references retain provenance; they do not establish narrative truth or prove semantic completeness. The low-level Actor foundation retains its older psychological record APIs, but Storyweaver’s model tool and current-state interface use the dynamic definitions.

## Testing

The owning tests are [dynamic state](../../../../packages/story/story/tests/dynamic-state.spec.ts), [styles](../../../../packages/story/story/tests/style.spec.ts), [atomic Actor transactions](../../../../packages/experimental/actor/tests/actor.spec.ts), [real plugin composition](../../../../packages/experimental/tool-director/tests/state-style.real.spec.ts), [input intent capture](../../../../packages/client/ui-conversation/tests/input-reference-submit.client.spec.ts), and [assembled browser interaction](../../../../apps/web/tests/roleplay-discussion-console.e2e.ts). The real-composition test uses shipped plugins and durable stores with scripted model responses; it is not a live-model quality evaluation.

The Moonshadow Ledger fixture contains opening, questioning, deception, silence, injury, and group-discussion performance cases. Its [live comparison](../../../../packages/experimental/tool-director/tests/moonshadow-performance.e2e.ts) runs an authored baseline and three preset pairs per case, saves complete logs and portable Story Packages, and records measured timings, tool outcomes, and reported token usage. Missing accounting stays unavailable; human judgments remain blank until reviewed. [The fixture guide](../../../../packages/experimental/roleplay-web-profile/tests/fixtures/storybooks/moonshadow-ledger/README.md#performance-comparison) owns execution and review instructions. Live-model quality and human play acceptance remain separate evidence; the suite explicitly skips without `DEEPSEEK_API_KEY`.
