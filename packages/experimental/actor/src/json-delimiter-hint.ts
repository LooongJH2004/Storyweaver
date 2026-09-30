/**
 * Explain delimiter imbalance after JSON.parse rejects; never repair or accept a payload.
 * @param raw - Rejected argument text, scanned with JSON string escaping respected.
 * @returns A delimiter-only hint, or an empty string when no imbalance is found.
 */
export function jsonDelimiterHint(raw: string): string {
  const closing: string[] = []
  let quoted = false
  let escaped = false
  for (let offset = 0; offset < raw.length; offset++) {
    const char = raw[offset]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') quoted = true
    else if (char === '{') closing.push('}')
    else if (char === '[') closing.push(']')
    else if (char === '}' || char === ']') {
      const expected = closing.pop()
      if (expected === undefined) return `Delimiter check: ${char} at offset ${offset} has no matching opening delimiter.`
      if (expected !== char) return `Delimiter check: expected ${expected}, not ${char}, at offset ${offset}.`
    }
  }
  if (quoted) return 'Delimiter check: an opened JSON string is not closed.'
  return closing.length === 0 ? '' : `Delimiter check: remaining closing delimiters, from inside out: ${closing.reverse().join('')}.`
}
