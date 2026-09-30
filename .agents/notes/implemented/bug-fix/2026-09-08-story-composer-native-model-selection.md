# Agent Note: Story composer native model selection

Status: implemented

English | [中文](2026-09-08-story-composer-native-model-selection.zh.md)

## Problem

Independent story execution samples a global execution preference. The session-scoped native model selector cannot write that preference, and a text-only settings form does not expose the provider catalog or supported reasoning levels.

## Decision

The story composer declares `model.selection.control`. The model-selection plugin renders its native menu with the shared Host catalog and an owner-supplied selection callback. The narrative owner reads its execution-settings mirror and writes the reviewed settings revision. The next execution samples the saved provider, model and reasoning effort.

## Alternatives considered

Attaching the session selector to a technical actor session would update the wrong owner. Copying the menu would duplicate keyboard behavior and provider metadata handling. A root-scoped presentation slot reuses the menu while preserving the execution setting as the write destination.

## Consequences

The model-selection plugin supports a second selection owner without importing narrative code. The story composer depends on that plugin through a typed slot. Selection failures retain the previous saved value. Browser coverage switches both model and effort and checks the subsequent mock execution request.
