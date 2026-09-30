# Agent Note: Editable creative and pacing rules

Status: implemented

English | [中文](2026-09-10-editable-creative-rules.zh.md)

## Decision

The performance context module owns editorial length, progression and performance direction for each audience. Story and book editors display its text, enabled state, message role and order, with a restore-default action. Style editors link to these defaults. The fixed NPC and director protocols retain submission, knowledge and ownership instructions without duplicating creative length targets. Disabling the module removes its instructions from subsequent requests; other explicitly authored style or policy modules remain in effect.

## Resolution and scope

resolveContextRecipe projects an absent performance module as an inherited default for existing recipes, without writing storage. Explicit text, including temporary empty drafts, and disabled modules are preserved. Author views, saved previews and execution use this same projection. Saving materializes the visible module through the existing revisioned configuration command. The UI offers disable rather than deletion because absence means inheritance. Book edits remain draft changes for future published runs; instance edits affect only that run. Historical execution logs retain the actual transmitted context; regenerating an old recipe with absent defaults is not a substitute for its recorded request.

## Verification

Core tests cover inherited defaults, exact custom roles and text, disabled modules, instance isolation and replay. Real Harness request snapshots include the creative module; resumed actor requests reflect an edit and a disabled module without stale length rules. Director request snapshots show authored replacement text. Client tests exercise both audience editors and restoration. The browser regression edits, saves, reloads and previews a director rule, disables actor rules and checks both independent context results. These checks establish configuration delivery, not guaranteed literary output length.
