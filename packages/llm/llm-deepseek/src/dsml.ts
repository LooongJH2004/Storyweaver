/**
 * Strict fallback decoder for DeepSeek V4 DSML tool calls that some endpoints
 * occasionally return in `content` instead of the OpenAI-compatible
 * `tool_calls` field.
 *
 * This parser deliberately accepts only a complete terminal envelope and
 * tool names present in the request. It is not a general XML parser and must
 * never be enabled without an explicit request-scoped tool allow-list.
 * @module dsh-llm-deepseek/dsml
 */

import type { ToolSchema } from '@deepseek-ai/dsh-llm'

/** One decoded call, ready to enter the normal harness tool-call path. */
export interface DsmlToolCall {
  name: string
  arguments: string
}

/** A terminal DSML envelope plus any ordinary assistant text preceding it. */
export interface DsmlToolCallEnvelope {
  text: string
  calls: DsmlToolCall[]
}

interface DsmlDialect {
  openCalls: string
  closeCalls: string
  openInvoke: string
  closeInvoke: string
  openParameter: string
  closeParameter: string
}

function dialect(bars: string): DsmlDialect {
  return {
    openCalls: `<${bars}tool_calls>`,
    closeCalls: `</${bars}tool_calls>`,
    openInvoke: `<${bars}invoke`,
    closeInvoke: `</${bars}invoke>`,
    openParameter: `<${bars}parameter`,
    closeParameter: `</${bars}parameter>`,
  }
}

// Official V4 decoders use one fullwidth bar on each side. The official API
// currently serializes the special token with two on each side, so accept both
// exact dialects while rejecting mixed markers.
const DIALECTS = [dialect('｜｜DSML｜｜'), dialect('｜DSML｜')]

function skipWhitespace(source: string, from: number): number {
  let cursor = from
  while (cursor < source.length && /\s/u.test(source[cursor] ?? '')) cursor += 1
  return cursor
}

function decodeEntity(entity: string): string | undefined {
  switch (entity) {
    case 'amp': return '&'
    case 'lt': return '<'
    case 'gt': return '>'
    case 'quot': return '"'
    case 'apos': return "'"
    default: {
      const hex = /^#x([\da-f]+)$/iu.exec(entity)
      const decimal = /^#(\d+)$/u.exec(entity)
      const codePoint = hex === null
        ? decimal === null ? undefined : Number.parseInt(decimal[1] ?? '', 10)
        : Number.parseInt(hex[1] ?? '', 16)
      if (codePoint === undefined || !Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        return undefined
      }
      try {
        return String.fromCodePoint(codePoint)
      } catch {
        return undefined
      }
    }
  }
}

function decodeEntities(value: string): string | undefined {
  const entities = [...value.matchAll(/&([^;\s]+);/gu)]
  if (entities.some(match => decodeEntity(match[1] ?? '') === undefined)) return undefined
  return value.replace(/&([^;\s]+);/gu, (_whole, entity: string) => decodeEntity(entity) ?? '')
}

function propertyNames(tool: ToolSchema): Set<string> {
  const properties = tool.parameters.properties
  if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) return new Set()
  return new Set(Object.keys(properties))
}

/**
 * Normalize one observed V4 compatibility spelling only when the request
 * schema proves the intended target unambiguously. Unknown arguments remain
 * untouched and are rejected later by the ordinary tool validator.
 */
function normalizeParameterName(name: string, tool: ToolSchema): string {
  const properties = propertyNames(tool)
  if ((name === 'file' || name === 'path')
    && !properties.has(name)
    && properties.has('file_path')) return 'file_path'
  return name
}

function parseParameterValue(raw: string, asString: boolean): unknown {
  const decoded = decodeEntities(raw)
  if (decoded === undefined) return undefined
  if (asString) return decoded
  try {
    return JSON.parse(decoded.trim()) as unknown
  } catch {
    return undefined
  }
}

function parseDialect(
  source: string,
  start: number,
  dialect: DsmlDialect,
  tools: ReadonlyMap<string, ToolSchema>,
): DsmlToolCall[] | undefined {
  let cursor = start + dialect.openCalls.length
  const calls: DsmlToolCall[] = []

  while (true) {
    cursor = skipWhitespace(source, cursor)
    if (source.startsWith(dialect.closeCalls, cursor)) {
      cursor += dialect.closeCalls.length
      if (source.slice(cursor).trim().length !== 0 || calls.length === 0) return undefined
      return calls
    }
    if (!source.startsWith(dialect.openInvoke, cursor)) return undefined

    const invokeEnd = source.indexOf('>', cursor + dialect.openInvoke.length)
    if (invokeEnd < 0) return undefined
    const invokeHeader = source.slice(cursor, invokeEnd + 1)
    const invokeMatch = /^<[^\s>]+invoke\s+name="([^"]+)"\s*>$/u.exec(invokeHeader)
    if (invokeMatch === null) return undefined
    const decodedName = decodeEntities(invokeMatch[1] ?? '')
    if (decodedName === undefined) return undefined
    const tool = tools.get(decodedName)
    if (tool === undefined) return undefined
    cursor = invokeEnd + 1

    const parameters: Record<string, unknown> = {}
    while (true) {
      cursor = skipWhitespace(source, cursor)
      if (source.startsWith(dialect.closeInvoke, cursor)) {
        cursor += dialect.closeInvoke.length
        break
      }
      if (!source.startsWith(dialect.openParameter, cursor)) return undefined

      const parameterEnd = source.indexOf('>', cursor + dialect.openParameter.length)
      if (parameterEnd < 0) return undefined
      const parameterHeader = source.slice(cursor, parameterEnd + 1)
      const parameterMatch = /^<[^\s>]+parameter\s+name="([^"]+)"\s+string="(true|false)"\s*>$/u.exec(parameterHeader)
      if (parameterMatch === null) return undefined
      const decodedParameterName = decodeEntities(parameterMatch[1] ?? '')
      if (decodedParameterName === undefined) return undefined
      const parameterName = normalizeParameterName(decodedParameterName, tool)
      if (Object.hasOwn(parameters, parameterName)) return undefined

      const valueStart = parameterEnd + 1
      const valueEnd = source.indexOf(dialect.closeParameter, valueStart)
      if (valueEnd < 0) return undefined
      const value = parseParameterValue(source.slice(valueStart, valueEnd), parameterMatch[2] === 'true')
      if (value === undefined) return undefined
      parameters[parameterName] = value
      cursor = valueEnd + dialect.closeParameter.length
    }

    calls.push({ name: decodedName, arguments: JSON.stringify(parameters) })
  }
}

/**
 * Decode a complete, terminal DeepSeek V4 DSML tool-call envelope.
 *
 * Ordinary text may precede the envelope. Text after it, fenced examples,
 * malformed markup, unknown tools, and mixed DSML dialects are rejected.
 */
export function parseDsmlToolCalls(
  content: string,
  allowedTools: readonly ToolSchema[],
): DsmlToolCallEnvelope | undefined {
  if (allowedTools.length === 0) return undefined
  const tools = new Map(allowedTools.map(tool => [tool.name, tool]))

  for (const candidate of DIALECTS) {
    const start = content.indexOf(candidate.openCalls)
    if (start < 0) continue
    const text = content.slice(0, start)
    // A fenced sample is documentation, not an executable fallback call.
    if (text.includes('```')) return undefined
    const calls = parseDialect(content, start, candidate, tools)
    if (calls !== undefined) return { text, calls }
  }
  return undefined
}
