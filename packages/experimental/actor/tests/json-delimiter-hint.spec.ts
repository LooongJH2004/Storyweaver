import { expect, it } from 'vitest'
import { jsonDelimiterHint } from '../src/json-delimiter-hint.ts'

it.each([
  ['{"posture":"silent"', 'Delimiter check: remaining closing delimiters, from inside out: }.'],
  ['{"context_update":[{"changes":[{}]}', 'Delimiter check: remaining closing delimiters, from inside out: ]}.'],
  ['{"text":"[quoted] {braces}","units":[{', 'Delimiter check: remaining closing delimiters, from inside out: }]}.'],
  [String.raw`{"text":"escaped \"quote\" and \\ slash","units":[`,
    'Delimiter check: remaining closing delimiters, from inside out: ]}.'],
  ['{"text":"unfinished', 'Delimiter check: an opened JSON string is not closed.'],
  ['{}]', 'Delimiter check: ] at offset 2 has no matching opening delimiter.'],
  ['{"units":[}', 'Delimiter check: expected ], not }, at offset 10.'],
  ['{"text":"[not a container]"}', ''],
  ['{"broken":,}', ''],
])('explains delimiters in %s without rewriting the input', (raw, expected) => {
  expect(jsonDelimiterHint(raw)).toBe(expected)
})
