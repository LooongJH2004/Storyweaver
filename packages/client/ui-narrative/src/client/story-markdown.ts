/** Presentation-only compatibility for escaped paragraph separators in story prose. */
export function storyMarkdown(source: string): string {
  const text = source.replace(/\r\n?/g, '\n')
  let result = ''
  let index = 0
  while (index < text.length) {
    const tail = text.slice(index)
    const lineStart = index === 0 || text[index - 1] === '\n'
    const fence = lineStart ? /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/.exec(tail) : null
    if (fence !== null) {
      const marker = fence[1] ?? ''
      const closing = new RegExp(`^ {0,3}${marker[0]}{${marker.length},}[ \\t]*(?:\\n|$)`, 'm')
        .exec(tail.slice(fence[0].length))
      const length = closing === null ? tail.length : fence[0].length + closing.index + closing[0].length
      result += tail.slice(0, length); index += length; continue
    }
    const indented = lineStart ? /^(?: {4}|\t)[^\n]*(?:\n|$)/.exec(tail) : null
    const location = /^(?:https?:\/\/|[A-Za-z]:[\\/])[^\s<>]+/.exec(tail)
    const protectedText = indented?.[0] ?? location?.[0]
    if (protectedText !== undefined) {
      result += protectedText; index += protectedText.length; continue
    }
    if (text[index] === '`' && text[index - 1] !== '\\') {
      const opening = /^`+/.exec(tail)?.[0] ?? '`'
      const rest = tail.slice(opening.length)
      const closing = [...rest.matchAll(/`+/g)].find(match => match[0].length === opening.length)
      const length = closing === undefined ? tail.length : opening.length + closing.index + closing[0].length
      result += tail.slice(0, length); index += length; continue
    }
    // A lone escaped newline is ambiguous with paths and notation; only repair repeated separators.
    const paragraphs = text[index - 1] !== '\\' ? /^(?:\\r\\n|\\n){2,}/.exec(tail) : null
    if (paragraphs !== null) {
      result += paragraphs[0].replace(/\\r\\n|\\n/g, '\n')
      index += paragraphs[0].length; continue
    }
    const lineBreak = /^<br\s*\/?>/i.exec(tail)
    if (lineBreak !== null) {
      result += '\n'; index += lineBreak[0].length; continue
    }
    result += text[index]; index++
  }
  return result
}
