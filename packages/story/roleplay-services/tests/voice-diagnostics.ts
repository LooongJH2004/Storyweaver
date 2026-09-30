/** A public play row retained in an archived roleplay review. */
export interface VoiceRow {
  id: string
  revision: number
  kind: string
  text: string
  speaker?: { actorId?: string; trueName?: string }
}

/** A lexical topic chosen by a reviewer for a specific scene. */
export interface VoiceTopic {
  id: string
  terms: readonly string[]
}

/** A candidate requiring a human reading of its quoted rows. */
export interface VoiceSignal {
  kind: 'shared-topic' | 'repeated-rhetoric' | 'narrated-silence-after-speech'
  label: string
  rowIds: string[]
  actorIds: string[]
  excerpts: string[]
}

const rhetoricPatterns = [
  { label: '不是……而是……', expression: /不是[^。！？\n]{1,80}而是/u },
  { label: '先……再……', expression: /先[^。！？\n]{1,80}再/u },
] as const

/** Extract the final visible play projection from a saved review. */
export function reviewVoiceRows(review: {
  cases?: readonly { play?: { rows?: readonly VoiceRow[] } }[]
  director?: { play?: { rows?: readonly VoiceRow[] } }
}): VoiceRow[] {
  const lastCase = review.cases?.at(-1)
  return [...(lastCase?.play?.rows ?? review.director?.play?.rows ?? [])]
}

/** Locate inspectable surface patterns; no signal is a literary-quality verdict. */
export function findVoiceSignals(rows: readonly VoiceRow[], topics: readonly VoiceTopic[]): VoiceSignal[] {
  const speech = rows.filter(row => row.kind === 'speech' && row.speaker?.actorId)
  const signals: VoiceSignal[] = []

  for (const topic of topics) {
    if (topic.terms.length === 0 || topic.terms.some(term => term.length === 0)) {
      throw new Error(`Voice topic ${topic.id} needs nonempty terms`)
    }
    const matching = speech.filter(row => topic.terms.some(term => row.text.includes(term)))
    if (new Set(matching.map(row => row.speaker?.actorId)).size > 1) {
      signals.push(signal('shared-topic', topic.id, matching))
    }
  }

  for (const pattern of rhetoricPatterns) {
    const matching = speech.filter(row => pattern.expression.test(row.text))
    if (new Set(matching.map(row => row.speaker?.actorId)).size > 1) {
      signals.push(signal('repeated-rhetoric', pattern.label, matching))
    }
  }

  let speechesSinceNarration: VoiceRow[] = []
  for (const row of rows) {
    if (row.kind === 'speech' && row.speaker?.actorId) speechesSinceNarration.push(row)
    if (row.kind !== 'narration') continue
    if (/没有说什么|没说什么|一直没说话/u.test(row.text)) {
      for (const prior of speechesSinceNarration) {
        const name = prior.speaker?.trueName
        if (name && row.text.includes(name)) {
          signals.push(signal('narrated-silence-after-speech', name, [prior, row]))
        }
      }
    }
    speechesSinceNarration = []
  }

  return signals
}

function signal(kind: VoiceSignal['kind'], label: string, rows: readonly VoiceRow[]): VoiceSignal {
  return {
    kind,
    label,
    rowIds: rows.map(row => row.id),
    actorIds: [...new Set(rows.flatMap(row => row.speaker?.actorId ? [row.speaker.actorId] : []))],
    excerpts: rows.map(row => row.text),
  }
}
