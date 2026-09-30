---
description: "AI authoring instructions for playable storybook JSON, optional narrative focus, character knowledge, and reviewed delivery."
kind: "reference"
---

# Storyweaver storybook configuration instructions for AI authors

English | [中文](storybook-json-editing-guide.zh.md)

## Summary

Give this reference to the AI with your creative brief and desired deliverable: an external JSON file, a saved application draft, or a published storybook. Produce a playable starting configuration using numeric schemaVersion: 6. A designated protagonist is optional. This document configures fiction and its starting conditions; it does not authorize file access, grant tools, or select the player's controlled character. Available tool schemas and host validation are authoritative.

## Table of Contents

- [Authoring task protocol](#task)
- [Characters, optional protagonist, and player control](#people-control)
- [Editable template](#template)
- [Fields and information ownership](#fields)
- [Knowledge and dynamic state](#state)
- [Style and context](#guidance)
- [Delivery and validation](#delivery)
- [Dev Note](#dev-note)

<a id="task"></a>
## Authoring task protocol

You are creating a starting configuration, not running the story. Preserve the user's genre, relationships, limits, and existing valid material. Keep actorId values stable. Build an opening with observable circumstances and room for choices; do not prewrite future player decisions or treat planned scenes as completed events.

1. Identify the intended deliverable and inspect supplied material. Ask only about consequential missing requirements. A missing designated protagonist is valid and does not require clarification by itself.
2. With native tools, read the draft using storybook_read and inspect storybook_schema. Change the managed draft through storybook_save: expected_revision comes from the latest read, and storybook_json is a string containing the complete JSON document, not an object or partial patch.
3. Check the returned result. On a revision conflict, reread and reconcile the draft. Fix validation errors at their reported field paths; do not guess revision numbers, change validators, or treat an unsuccessful save as accepted.
4. Saving a draft does not publish it. Publish only when the user requests publication: inspect storybook_preview, then call storybook_publish with the current expected_revision. After an uncertain response, read the state before retrying. Ordinary creation conversations do not require a publication call or a creator_complete tool that is not available.
5. For external delivery, output one UTF-8 JSON object. When the user asks for JSON only, omit fences and commentary. Report validation, saving, and publication only when actually performed. Use local files only within the user's authorized workspace; file writes do not update the managed draft.

Creation-task prompt, enabled state, message role, and local directory are separate settings. Edit creation prompt and Save task settings affect subsequent creation requests. Do not add prompt, enabled, role, cwd, or task revision to the storybook root. directorPrompt guides the running Director; a character's rolePrompt guides that character. Neither grants the current authoring assistant runtime authority.

<a id="people-control"></a>
## Characters, optional protagonist, and player control

Every persistent person who needs independent identity, knowledge, state, or interaction belongs in characters, including a player protagonist. Mentioning a name in premise or directorPrompt does not create a character. Keep one definition per person, and use actorId references instead of duplicating their definition under a protagonist object.

| Setting | Meaning | What to author |
| --- | --- | --- |
| characters | The registered cast and each person's starting configuration. | Supply complete character definitions; use an empty array only when no persistent cast is required. |
| protagonistActorId | An optional narrative focus, independent of control. | Omit it or use null for an ensemble; otherwise supply one existing character's actorId. |
| Player control | Which character the player controls in one running story. | Select it in the play interface; do not encode it in storybook JSON. |

Null is valid even when characters is nonempty. Missing values, null, and blank strings normalize to null; use null in authored JSON for clarity. The host does not select the first character. An unknown nonempty ID is rejected. Clearing the editor selection preserves null through saving, export, and publication. Add character leaves the existing selection unchanged; Add protagonist explicitly creates and selects a new character.

A book without a designated protagonist can still have a player-controlled character. Conversely, selecting a protagonist does not stop AI acting. Claiming Player control excludes that character from autonomous turns and private discussion preparation. On their public discussion floor, the system waits for player speech or explicit silence. Reading perspective and temporary embodiment do not release ownership; releasing Player control permits AI acting again.

Character traits, experiences, goals, and habits describe a baseline, not permission to override the player. The Director describes external changes and adjudicates action outcomes without inventing the controlled character's speech, consent, decisions, or inner reactions. AI characters retain their own motivations and knowledge. An action attempt is not guaranteed success. Do not encode a plot rule that every other character must agree with the player or that a player response has already happened.

<a id="template"></a>
## Editable template

This complete example uses two characters with no designated protagonist. To focus the story on the keeper, change only protagonistActorId to "keeper". Player control remains a separate choice. Omit contextRules and contextRecipe when no customization is required; the host supplies the current defaults. Candidate beats remain possible developments, not established history.

```json
{
  "schemaVersion": 6,
  "id": "lighthouse-letter",
  "title": "灯塔来信",
  "premise": "停用的灯塔再次亮起，守塔人与信使必须决定是否打开匿名来信。",
  "setting": { "place": "雨夜旧港", "openingSituation": "信使将未拆封的信放在桌上。" },
  "worldTruth": { "signal": "灯光来自地下仍在运转的机械。" },
  "commonKnowledge": ["旧灯塔已停用三年。"],
  "protagonistActorId": null,
  "discussionSettings": { "maxRounds": 4 },
  "directorPrompt": "用可观察的变化引出选择，不替角色决定是否拆信。",
  "reasoningLanguage": "简体中文",
  "directorGuidance": { "narrativeStyle": "克制、具体。", "avoid": ["提前揭示机械的秘密"] },
  "characters": [
    {
      "actorId": "keeper", "displayName": "林岚", "appearance": "披着旧油衣的守塔人",
      "publicPersona": "熟悉潮汐，独自照看停用灯塔。", "rolePrompt": "按自己的认知行动，不知道灯光的真正来源。",
      "capabilities": ["speak", "act", "reflect", "memory", "goals", "schedule"],
      "initialKnowledge": [
        { "text": "来人是信使周砚。", "kind": "identity", "attitude": "believed", "targetActorId": "courier", "label": "周砚" },
        { "text": "灯塔复明可能与失踪的父亲有关。", "kind": "belief", "attitude": "undecided" }
      ],
      "privateContext": {
        "perspective": ["小时候见过父亲半夜进入地下室。"],
        "coreMemories": [{ "content": "父亲嘱咐我不要独自下楼。", "importance": 4, "meaning": "既想追查，又怕失去家人。" }],
        "goals": [{ "description": "查清灯光为何复明。", "priority": 4 }],
        "intentions": [{ "description": "检查入口。", "trigger": "有人提议进入灯塔时", "commitment": 3 }]
      },
      "state": [{
        "definition": {
          "id": "keeper-caution", "name": "戒备", "description": "面对陌生线索时的主观警觉。",
          "group": "情绪", "type": "number", "owner": "actor", "actorId": "keeper",
          "minimum": 0, "maximum": 5, "guidance": "仅在有意义的变化发生时调整。"
        },
        "value": 3
      }],
      "actingGuidance": { "speechStyle": "短句，熟人面前偶尔犹疑。", "underPressure": "先确认同行者安全。" }
    },
    {
      "actorId": "courier", "displayName": "周砚", "appearance": "提着防水邮袋的年轻信使",
      "publicPersona": "替港务所递送急件。", "rolePrompt": "只知道递送任务，不知道信件内容。",
      "capabilities": ["speak", "act"], "initialKnowledge": [], "state": [],
      "privateContext": { "perspective": ["雇主要求午夜前送达，却没有留下姓名。"] },
      "actingGuidance": { "speechStyle": "礼貌，但急于完成差事。" }
    }
  ],
  "beats": [{ "id": "letter-at-the-door", "purpose": "让两人决定如何处理来信。" }],
  "directorRules": ["线索须经实际呈现才能进入角色认知。"]
}
```

<a id="fields"></a>
## Fields and information ownership

Structured objects reject unknown fields. Free keys belong only in setting, worldTruth, and beat objects; character state is now a strict array. Schema-managed strings are trimmed, without uniformly rewriting text inside free JSON.

| Field | Current rule and purpose |
| --- | --- |
| schemaVersion, id, title | Required; version 6, id length 1–160, title length 1–300. Document IDs, internal draft IDs, and run IDs are distinct. |
| premise, setting, worldTruth | Default to an empty string, object, and object; hidden objective truth belongs in worldTruth and is not automatically granted to characters. |
| commonKnowledge | An array of nonempty strings, empty by default; only knowledge every character should possess. |
| protagonistActorId | Optional: omit or use null to leave narrative focus unspecified, even with a nonempty cast. Nonempty values must reference an existing actorId. Does not select player control. |
| characters | Required, at most 100 with unique actorIds; an empty array is valid but supplies no persistent autonomous characters. |
| directorPrompt, directorGuidance | Both required; may respectively be "" and {}. |
| discussionSettings | Only integer maxRounds, range 1–20, default 4. Do not force ordinary ensemble reactions into discussions. |
| reasoningLanguage, contextRules, contextRecipe | The first two materialize defaults; recipe may be omitted but must validate completely when supplied. |
| beats, directorRules | Default empty arrays of objects (at most 1000) and nonempty strings (at most 500); neither establishes past events. |

Characters require actorId, displayName, publicPersona, rolePrompt, capabilities, and actingGuidance. The first two have length 1–160; publicPersona is nonempty, rolePrompt may be empty, and actingGuidance may be {}. appearance defaults to “未具名的人物”; supply an appearance that does not disclose hidden identity. A true name shown to the player does not establish acquaintance for other characters.

capabilities has at least one of speak, act, reflect, memory, goals, schedule; deduplicate authored values. privateContext accepts only perspective, coreMemories, goals, intentions, each defaulting to an empty array with at most 200 entries. The last three respectively use content/importance/meaning, description/priority/reason, and description/trigger/commitment; importance, priority, commitment are integers 1–5 defaulting to 3. Optional meaning/reason must be nonempty when present, as must other required text fields.

<a id="state"></a>
## Knowledge and dynamic state

initialKnowledge expresses starting judgments; privateContext.perspective expresses subjective experience. Either can be incomplete or mistaken, without objective-truth or secret-answer labels. Author acquaintance in each direction: A knowing B does not make B know A.

- Each initialKnowledge item requires nonempty text; kind is identity/belief (default belief), attitude is believed/doubted/undecided/rejected (default believed). A supplied targetActorId references a character in the book; identity requires a nonempty label, and explicit acquaintance also supplies targetActorId. Do not use old stance/confidence or runtime sourceRefs.
- Each state item contains only definition and value. definition requires id, name, description, group, type, owner, actorId, guidance; guidance may be empty, while those other text IDs/names are nonempty. actorId matches its containing character; field IDs should be unique across the book.
- type is text/number/boolean/choice/tags, with string/number/boolean/option string/unique nonempty string array values. minimum/maximum apply only to number; choice requires nonempty unique options, tags optionally uses options, and values must meet their bounds and choices.
- owner=actor is private subjective state with empty or omitted audience; owner=world is objective state whose audience may list valid recipient actorIds. A valid targetActorId can identify a relationship target; do not invent runtime targetPersonRef values.
- Define emotion, trust, injury, or stamina fields as needed. Do not use an object for state, privateContext.beliefs, privateContext.relationships, or initialEmotion. Put relationship judgments in initialKnowledge and dynamic measurements in state fields with targetActorId.

Initial values do not contain runtime revision wrappers such as expectedRevision, reason, origin, or active. Mismatched definitions/values, invalid references, and duplicate fields are rejected. Do not merely change an old document's version while retaining incompatible structures.

<a id="guidance"></a>
## Style and context

Style describes expression and choice tendencies without replacing identity, experience, or authorization. Strings default empty; arrays default empty with nonempty entries. Use only these fields.

| Object | String fields | String-array fields |
| --- | --- | --- |
| directorGuidance | narrativeStyle, atmosphereAndPacing, viewpoint, lengthPreference, sensoryDetail, additionalInstructions | focus, avoid, examples |
| actingGuidance | speechStyle, relationshipVoices, underPressure, lengthPreference, additionalInstructions | habitualActions, decisionPrinciples, emotionalTendencies, taboos, examples |

contextRules contains director/actor, each with policy/tools strings. Missing or empty values adopt defaults; independent publication preview converts untouched built-in tool guidance to the current protocol. Custom text remains unchanged, so do not copy old director_stage_scene, director_dispatch_actors, or roleplay_recall instructions. Current entry points are director_command for the Director, npc_commit_turn for Actor submission, and narrative_recall for recall; actual runtime tools are authoritative.

reasoningLanguage defaults to “简体中文”. contextRecipe orders sources, enabled flags, and message roles through revision, actor, and director; a single custom fragment is insufficient. Omit it for new books without special requirements. Preserve required sources and user-authored content when editing an existing recipe, checking the [current validator](../packages/story/roleplay-core/src/context-recipe.ts). Built-in policy/tools/reasoning-language do not carry title/content; custom: modules and reasoning-mode require both. Prompts and message roles cannot widen a character's information access.

For measured narration length, add narrationLength to a complete contextRecipe: {"enabled":true,"minimum":1000,"target":1500}. Both numbers must be integers from 1 to 10000, with target at least minimum. Enabled numbers override textual length suggestions. The host counts letters and digits in rendered narration, excluding formatting, punctuation and whitespace; each Latin letter counts separately. Short public drafts get at most two revisions before publication. Exhaustion retains an unpublished draft and reports failure. The target is not a maximum. Omit this field or set enabled=false to keep advisory prose instructions without automatic expansion. The book editor exposes these fields under Director context; existing runs have separate saved settings.

<a id="delivery"></a>
## Delivery and validation

Use the requested delivery path and report its actual completion state. A valid file is not automatically an application draft, and a draft is not a published version.

| Deliverable | Required action | Result |
| --- | --- | --- |
| External storybook | Provide plain v6 JSON, or an exported storyweaver-book package. | A file the user can import. No automatic saving or publication claim. |
| Application draft | Use storybook_save, or Import your work in the sidebar/library/editor. | A newly saved draft after successful validation. Import does not overwrite another book. |
| Published storybook | Review the saved content, then publish when requested. | An immutable version from which the user can start a new run. |
| Story progress | Use History and recovery to export/import a run archive. | An independent saved run, not a storybook template. |

The portable book envelope is `{ "format": "storyweaver-book", "version": 1, "document": ..., "resources": [] }`; document is the v6 configuration. Use real exported resource paths, digests, and base64 data, never invented values. Export downloads the saved document and resources; save edits first. Published versions and existing runs are not rewritten when a draft changes. A changed book requires a new publication and a new run to use that version.

A character artifact is one characters item without a schemaVersion wrapper. Check IDs, knowledge targets, state owners, and protagonist references when merging it. Runtime-created characters are not automatically added to the original book: author material extraction creates a separate draft for review and publication.

| Problem | Correction |
| --- | --- |
| No designated protagonist | Keep null; no repair or automatic first-character selection is needed. |
| Unknown protagonist or knowledge target | Reference an existing actorId, add the missing character, or clear the optional protagonist. A display name is not an ID. |
| State rejected | Check that state is an array, definition/value types match, numeric limits hold, and the owner/target exists. |
| Unknown root field or old schema version | Use the current schema and restructure the data; changing a version number alone is insufficient. |
| Revision conflict or uncertain tool result | Read the authoritative draft or publication state before reconciling or retrying. |

With repository access, the following read-only command validates plain JSON and prints the normalized document. Replace the last argument with the real file path; extract document first when validating a portable package. JSON.parse alone does not validate the storybook, and this command does not save or publish it.

```powershell
pnpm exec tsx -e "import { readFileSync } from 'node:fs'; import { parseStorybookDocument } from './packages/story/roleplay-core/src/storybook.ts'; const path = process.argv.at(-1); if (!path) throw new Error('missing path'); console.log(JSON.stringify(parseStorybookDocument(JSON.parse(readFileSync(path, 'utf8'))), null, 2));" .\path\to\book.storybook.json
```

Before delivery, check that the user's intent, references, information separation, values, and delivery state agree. Identify any validation or publication step not performed.

<a id="dev-note"></a>
## Dev Note

Format: [storybook.ts](../packages/story/roleplay-core/src/storybook.ts), [knowledge.ts](../packages/story/roleplay-core/src/knowledge.ts), [dynamic-state.ts](../packages/story/roleplay-core/src/dynamic-state.ts). Authoring tools and task settings: [creator.ts](../packages/story/roleplay-services/src/creator.ts), [creation-workspace.ts](../packages/story/roleplay-services/src/creation-workspace.ts). Publication conversion: [independent-book.ts](../packages/story/roleplay-core/src/independent-book.ts). Workflow decision: [independent authoring recovery](../.agents/notes/implemented/feature/2026-09-08-independent-authoring-recovery.md).
