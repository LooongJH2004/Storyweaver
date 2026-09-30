# Agent Note: Scene-cast scheduling for ensemble stories

Status: implemented

English | [中文](2026-09-01-scene-cast-actor-scheduling.zh.md)

## Problem

A Storybook may register ten or more characters, but an existing persistent Actor Session was previously mistaken for physical presence. The Director could therefore Brief, discuss with, or dispatch an absent character, or wake the whole ensemble merely to select a small subset.

## Decision

The reserved world-fact path `storyweaver.scene` stores one Host-managed scene frame: schema version, stable scene id, location, and complete `presentActorIds`. The Director calls `director_stage_scene` only when the location or cast changes and reuses the frame on ordinary turns. Generic world patches cannot write the reserved `storyweaver` namespace.

The scene frame says who is here; the Director Brief says who needs to react this turn. Brief Actors, discussion participants, and actual dispatch ids must be subsets of the current cast. Only spotlight Actors named by the Brief are provisioned or resumed, so Storybook size does not directly increase per-turn model calls. Public Actor speech and empty player audiences resolve to the current cast instead of every Actor Session ever created.

A scene can change only after the Director Run completes or is cancelled and while no active or player-waiting discussion exists. Attempts, floor ownership, and audiences from the old scene therefore cannot drift into the next one.

## Reference and trade-offs

The design borrows the MVP's `scene_groups`, spotlight subset, and sequential dispatch concepts without copying duplicate location/group state, display-name identities, or model-maintained redundant state. The production design keeps one authoritative stable-id scene frame and retains the existing Director Run order, generation, and resume checkpoints.

## Consequences

Ten or more registered characters can remain dormant while the Director selects only present, turn-relevant Actors. Invalid selection fails before an Actor Session is provisioned. A new Brief without a scene frame fails closed and asks the Director to stage the scene first.
