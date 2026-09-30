# Agent Note: Rewriting keeps the saved context recipe

Status: implemented

English | [中文](2026-09-10-rewrite-keeps-context-recipe.zh.md)

## Failure and decision

Local command history showed a successful configuration.recipe commit containing the user's 1000–1500 target, followed by a rewrite restoration that replaced the recipe with the pre-direction default. Saving worked; regeneration discarded the saved configuration before assembling its request. A rewrite preserves the current context recipe while restoring fiction. Explicit checkpoint restoration retains its full historical meaning. Other world and scene configuration follows the selected historical state.

## Persistence and interaction

The existing history.restored event carries preserveContextRecipe only for rewriting. Commit projection and historical replay retain the recipe from immediately before that restoration, and advance the configuration revision. This happens atomically with epoch invalidation, before execution cancellation and resumption. Retries use the same receipt; archive validation accepts the recorded option. The creative textarea has a save-and-apply action and explicit unsaved status, and the recipe save bar stays visible while scrolling. Unsaved browser drafts are not silently applied.

## Verification

Core tests save a custom director recipe and disabled actor module after the original direction, rewrite twice using the same command, and verify request configuration, sibling isolation, exact historical replay, archive import and explicit checkpoint restoration. A real Harness snapshot records the rewritten director request with 1000–1500. Browser coverage edits through the local save action, sends a rewritten direction, checks the actual model request and reopens the editor after reload.
