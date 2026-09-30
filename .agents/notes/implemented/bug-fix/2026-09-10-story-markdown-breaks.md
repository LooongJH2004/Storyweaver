# Agent Note: Story prose paragraph rendering

Status: implemented

English | [中文](2026-09-10-story-markdown-breaks.zh.md)

## Problem

Model-authored story text can contain literal escaped paragraph separators after JSON decoding. Markdown renders those characters as text. Streamed and accepted prose also used different wrappers, while tight card margins weakened paragraph separation.

## Decision

The narrative client owns a presentation-only normalization step and shares its Markdown wrapper between drafts and accepted rows. It converts repeated escaped newline separators and simple break tags, preserving code and location literals. The existing Markdown renderer continues owning semantic formatting and HTML safety. Story copying follows the normalized source; persistence, exports and request evidence remain unchanged.

## Alternatives

Globally decoding strings or enabling raw HTML would alter technical evidence, code and unrelated DSH messages. Rewriting saved fiction would discard the submitted source. This change stays in narrative presentation.

## Consequences

Single escaped newlines remain literal because paths and notation are ambiguous. Markdown paragraph semantics collapse runs of blank lines into a paragraph boundary. Native Markdown features remain available with responsive typography. Regression fixtures cover escaped paragraphs, code preservation, HTML safety, streaming completion and real browser spacing.
