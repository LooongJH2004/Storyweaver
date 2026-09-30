/**
 * Request-header reconstruction utilities over full `request/header` session
 * events. Anyone holding a session log reconstructs the {@link EpochHeader}
 * any request was built under by taking the latest canonical snapshot; the
 * loop uses the same equality helper to avoid logging unchanged headers.
 *
 * @module dsh-session/request-header
 */

import { callConfigEquals } from '@deepseek-ai/dsh-llm'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import type { EpochHeader, SessionEvent } from './types.ts'
import { deriveEventMessage, foldSurface } from './surface.ts'

/** Exact request input reconstructed at one event boundary. */
export interface MaterializedRequestHeader {
  /** Sequence of the header snapshot in force for this request. */
  readonly headerSeq: number
  readonly turn: number
  readonly step: number
  /** Canonical header with `historyMessages` always materialized. */
  readonly header: EpochHeader & { readonly historyMessages: NonNullable<EpochHeader['historyMessages']> }
}

/**
 * Normalize a header to canonical form: an empty system prompt and empty tool
 * list become absent fields, matching how requests are built. Logging, folding,
 * and comparison use this one representation.
 * @param header - the header to normalize (not mutated).
 * @returns the canonical header.
 */
export function canonicalHeader(header: EpochHeader): EpochHeader {
  const adapterDefaults = header.adapterDefaults
  return {
    config: header.config,
    ...adapterDefaults?.reasoningEffort === true || adapterDefaults?.maxTokens === true
      ? { adapterDefaults }
      : {},
    ...header.system !== undefined && header.system.length > 0 ? { system: header.system } : {},
    ...header.tools !== undefined && header.tools.length > 0 ? { tools: header.tools } : {},
    ...header.prefixContextMessages !== undefined && header.prefixContextMessages.length > 0
      ? { prefixContextMessages: header.prefixContextMessages }
      : {},
    ...header.historyMessages !== undefined
      ? { historyMessages: header.historyMessages }
      : {},
    ...header.contextMessages !== undefined && header.contextMessages.length > 0
      ? { contextMessages: header.contextMessages }
      : {},
  }
}

/** Canonical JSON equality for tool schemas assembled through the same path. */
function sameSchema(a: ToolSchema, b: ToolSchema): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Field-wise equality over canonical headers. Tool schemas compare in order.
 * @param a - one canonical header.
 * @param b - the other.
 * @returns whether config, system, and tools all match.
 */
export function headerEquals(a: EpochHeader, b: EpochHeader): boolean {
  if (
    !callConfigEquals(a.config, b.config)
    || a.adapterDefaults?.reasoningEffort !== b.adapterDefaults?.reasoningEffort
    || a.adapterDefaults?.maxTokens !== b.adapterDefaults?.maxTokens
    || a.system !== b.system
    || JSON.stringify(a.prefixContextMessages ?? []) !== JSON.stringify(b.prefixContextMessages ?? [])
    || JSON.stringify(a.historyMessages) !== JSON.stringify(b.historyMessages)
    || JSON.stringify(a.contextMessages ?? []) !== JSON.stringify(b.contextMessages ?? [])
  ) return false
  const at = a.tools ?? []
  const bt = b.tools ?? []
  return at.length === bt.length && at.every((tool, i) => sameSchema(tool, bt[i] as ToolSchema))
}

/**
 * Fold the header events of a log (or any prefix) into the
 * {@link EpochHeader} in force after the last snapshot. Non-header events are
 * skipped. This is the pure offline reconstruction path; the live session
 * tracks the same fold incrementally.
 * @param events - session events in log order.
 * @param from - a previously folded state to continue from.
 * @returns the latest canonical header, or undefined when none exists yet.
 */
export function foldRequestHeader(events: readonly SessionEvent[], from?: EpochHeader): EpochHeader | undefined {
  let state = from
  for (const event of events) {
    if (event.type === 'request/header') state = canonicalHeader(event.data.header)
  }
  return state
}

/**
 * Reconstruct the exact model-visible header for the request that produced an
 * event. Request headers may omit ordinary history, so this uses the same
 * canonical surface fold as the Agent loop and materializes history at the
 * owning step after entered user messages and before the first response event.
 * Request-level prefix and suffix context remain in
 * their original partitions and order.
 * @param events - complete contiguous Session log.
 * @param beforeEventSeq - event produced by the request; that event itself is excluded.
 * @returns the request coordinates and a header with exact history.
 */
export function materializeRequestHeaderAt(
  events: readonly SessionEvent[],
  beforeEventSeq: number,
): MaterializedRequestHeader {
  if (!Number.isSafeInteger(beforeEventSeq) || beforeEventSeq < 0 || beforeEventSeq > events.length) {
    throw new Error(`request context boundary ${String(beforeEventSeq)} is outside the Session log`)
  }
  const prefix = events.slice(0, beforeEventSeq)
  const headerEvent = prefix.findLast(event => event.type === 'request/header')
  if (headerEvent?.type !== 'request/header') {
    throw new Error(`request context before event ${String(beforeEventSeq)} has no request/header`)
  }
  const stepStart = prefix.findLast(event => event.type === 'step/start')
  if (stepStart?.type !== 'step/start') {
    throw new Error(`request context before event ${String(beforeEventSeq)} has no step/start`)
  }
  const folded = foldRequestHeader(prefix)
  if (folded === undefined) {
    throw new Error(`request context before event ${String(beforeEventSeq)} has no effective header`)
  }
  const historyMessages = folded.historyMessages ?? (() => {
    const responseStart = prefix.find(event => event.seq > stepStart.seq && (
      event.type === 'assistant/chunk' || event.type === 'assistant/message' || event.type === 'tool/call'
    ))
    const historyEvents = events.slice(0, responseStart?.seq ?? beforeEventSeq)
    const surface = foldSurface(historyEvents)
    return surface.nodes.flatMap((seq) => {
      const event = historyEvents[seq]
      if (event === undefined) return []
      const message = deriveEventMessage(event)
      return message === null ? [] : [message]
    })
  })()
  return {
    headerSeq: headerEvent.seq,
    turn: stepStart.data.turn,
    step: stepStart.data.step,
    header: {
      ...folded,
      historyMessages,
    },
  }
}
