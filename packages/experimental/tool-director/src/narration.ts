const legacyParagraphBreak = /<\/p>\s*<p>/giu
const legacyParagraphTag = /<\/?p>/giu
const legacyLineBreak = /<br\s*\/?>/giu
const rawHtml = /<!--[\s\S]*?-->|<![A-Za-z][^>]*>|<\?[^>]*\?>|<\/?[A-Za-z][^>\n]*>/u

/**
 * Canonicalize model-authored Director narration as Markdown without accepting raw HTML.
 * @param value - Literary narration from the model tool call.
 * @returns Markdown with normalized paragraph and line breaks.
 * @throws When content still contains an HTML or XML construct after legacy paragraph conversion.
 */
export function normalizeDirectorNarration(value: string): string {
  const normalized = value
    .replace(/\r\n?/gu, '\n')
    .replace(legacyParagraphBreak, '\n\n')
    .replace(legacyParagraphTag, '')
    .replace(legacyLineBreak, '\n')
    .replace(/[\t ]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
  const unsupported = normalized.match(rawHtml)?.[0]
  if (unsupported !== undefined) {
    throw new Error(
      `Director narration must use Markdown without HTML or XML tags; replace '${unsupported}' with plain Markdown`,
    )
  }
  return normalized
}
