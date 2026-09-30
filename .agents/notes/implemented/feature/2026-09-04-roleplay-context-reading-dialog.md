# Agent Note: Roleplay context reading dialog

Status: implemented

English | [中文](2026-09-04-roleplay-context-reading-dialog.zh.md)

## Problem

A request preview anchored to a conversation message can lose its dismissal control when scrolling. Uniform collapsed JSON fields hide the text the player needs to understand a reply and give transport settings the same prominence as story context.

## Decision

The event preview uses the shared Modal with a fixed header and a single scrolling body. The default view preserves message order and renders text directly, with measured six-line previews and explicit expansion. Tools and parameters have a separate view. The original serialized request and per-message JSON remain available to inspect fields that the readable view does not interpret. Loading stays lazy and event-local; dismissal does not cancel a successful cache fill or reopen the dialog.

## Alternatives considered

**Right-side drawer.** Keeping the transcript visible helps comparison, but the user selected the wider centered dialog for long context.

**Semantic regrouping.** Grouping messages into character settings, rules, and plot would require interpreting message content. Preserving sender order and literal text provides a reliable view of what the model received.

## Consequences

Players can scan context without opening every message and can close it at any scroll position. The modal temporarily covers the conversation. It shares existing focus and dismissal behavior, while this preview owns background scroll locking. Display truncation never changes stored context or model input. Component tests cover dismissal, focus, retry, caching, and field preservation. Browser appearance is reserved for the user's manual verification.
