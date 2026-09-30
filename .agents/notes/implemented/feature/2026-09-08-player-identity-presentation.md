# Agent Note: Player identity annotations and review presentation

Status: implemented

English | [中文](2026-09-08-player-identity-presentation.zh.md)

## Problem

Long appearance labels make speakers hard for players to distinguish. Raw JSON in people, cognition and retention reviews obscures the content and differs from narrative reading cards. The user explicitly requested true names in parentheses for players and consistent presentation across these views.

## Decision

The player query annotates visible people, historical speakers and embodiment choices with a separate trueName field. It uses records from the selected instance and narrative revision. Published labels, actual dialogue, cognition, model-safe references and model context remain unchanged. Equal labels and true names render once; missing annotations retain the original label. The UI never joins an author roster to build a player label.

Shared cards, status pills and evidence disclosures display character summaries, judgments and retention proposals. The UI localizes protocol statuses and preserves original natural-language content. Advanced records and JSON editing remain accessible. This extends the player presentation boundary of the [independent narrative architecture](../architecture/2026-09-07-independent-narrative-instances.md); actor privacy continues to use separate perspective queries.

## Alternatives considered

**Replace all names in rendered prose.** This would rewrite actual speech and historical labels and could confuse mistaken identities with canonical identity.

**Add true names to shared model perspective records.** This would leak unknown identities to actors. The annotation belongs only to the authorized player query.

**Keep raw JSON as the main review content.** This preserves exact structure but makes ordinary reading and approval unnecessarily difficult. Details retain that structure for advanced inspection.

## Consequences

Players can identify strangers and disguised people even when their selected character cannot. This is intentional player information, not an in-world revelation. Current views use current canonical names; historical revision queries use names from that revision. No event or archive migration is needed. Core tests verify player annotations, historical labels, private audiences and unchanged model contexts; keyless browser acceptance covers review approval, cards, archive reload and narrow layouts. Real-model performance is not measured by these tests.
