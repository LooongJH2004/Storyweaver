// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { ExecutionRequestSummary } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from '../src/client/contract.ts'
import { UsageSummary } from '../src/client/TurnUsage.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
const messages: Record<string, string> = en
const t: NarrativeProps['t'] = (key, params) => Object.entries(params ?? {})
  .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), messages[key] ?? key)
const usageT: NarrativeProps['usageT'] = key => key
const request: ExecutionRequestSummary = { requestId: 1, attempt: 'one', revision: 1, configurationRevision: 0,
  turn: 1, step: 1, provider: 'mock', model: 'mock', status: 'response-recorded', turnRequestCount: 2,
  turnUsage: { uncachedInputTokens: 100, outputTokens: 40, totalTokens: 140 } }

it('shows whole-turn latency and decode throughput with explicit units beside native token accounting', () => {
  render(<UsageSummary t={t} usageT={usageT} request={{ ...request, turnTiming: { ttftMs: 800, tokensPerSecond: 25.25 } }} />)
  expect(screen.getByText('Turn TTFT: 0.80 s')).toBeTruthy()
  expect(screen.getByText('Turn average generation: 25.3 tok/s')).toBeTruthy()
  expect(screen.getByText('message.turnUsage.title')).toBeTruthy()
})

it('distinguishes zero readings from missing historical timing independently of token availability', () => {
  const view = render(<UsageSummary t={t} usageT={usageT} request={request} />)
  expect(screen.getByText('Turn TTFT: Not recorded')).toBeTruthy()
  expect(screen.getByText('Turn average generation: Not recorded')).toBeTruthy()
  view.rerender(<UsageSummary t={t} usageT={usageT} request={{ ...request, turnTiming: { ttftMs: 0, tokensPerSecond: 0 } }} />)
  expect(screen.getByText('Turn TTFT: 0.00 s')).toBeTruthy()
  expect(screen.getByText('Turn average generation: 0.0 tok/s')).toBeTruthy()
})
