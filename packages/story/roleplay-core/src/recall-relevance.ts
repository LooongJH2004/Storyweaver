/** Literal relevance uses only text already authorized for the requesting perspective. */
const segmenter = new Intl.Segmenter('und', { granularity: 'word' })

/**
 * Build a deterministic lexical scorer without fetching or inferring world knowledge.
 * @param query - Explicit search text or the actor's recent perceived content.
 * @returns A scorer counting distinct shared words, including unspaced-language words.
 */
export function recallRelevance(query: string): (text: string) => number {
  const words = (text: string) => new Set([...segmenter.segment(text.toLowerCase())]
    .filter(item => item.isWordLike).map(item => item.segment))
  const requested = words(query)
  return text => [...words(text)].filter(word => requested.has(word)).length
}
