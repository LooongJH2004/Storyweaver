# Agent Note: Actor-visible beat direction

Status: implemented

English | [中文](2026-09-29-actor-facing-beat.zh.md)

## Problem

A player's temporary instruction reached the Director but not the Actors it dispatched. The Director sometimes paraphrased a scene boundary into one actor cue and omitted it for later responses. Sending the entire Director instruction to every Actor would disclose possible author secrets or private plot plans.

## Decision

The Continue composer offers a separate optional `actorFacingBeat` draft with a visible label and privacy hint. Only this explicitly actor-visible text reaches the Director and Actors for the current run. The existing `instruction` stays Director-only. Model requests label the beat as author-side performance direction, not a fact the character has witnessed or a required choice. Empty beat text changes no request. The Director root, world-feedback continuation and reactive response selection carry the same beat through their dispatched Actors; later independent turns do not inherit it.

The root `director.open` and each `execution.open` command input record the beat and its source. Frozen actor requests reconstruct it from their own recorded execution input, preserving exact model-visible provenance on retry. The text is not written into scene style, perception, character knowledge or memory. The composer keeps separate per-instance drafts and clears only the submitted value after success.

## Verification and limits

Core tests cover direct and reactive dispatch, world-feedback continuation, private instruction isolation, independent Actor turns and provenance. API and client tests cover forwarding, the labeled optional field and draft retention. Targeted types, tests and the Host build passed. A single fresh DeepSeek V4 Flash kitchen replay found the exact actor-visible beat and source in three Director and three Actor requests. The characters stayed away from the commission and travel arrangements but still moved from the wet letter to a map question. This establishes delivery and one sample's behavior, not reliable stylistic improvement; the separate field still needs the player to write a precise boundary when one matters.
