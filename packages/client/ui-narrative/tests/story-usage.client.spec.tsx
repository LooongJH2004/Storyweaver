// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { InstanceId, ExecutionUsageTotals } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from '../src/client/contract.ts'
import { StoryUsage } from '../src/client/StoryUsage.tsx'
import { en } from '../src/client/locales.ts'
import { en as chat } from '../../ui-chat/src/client/locale.ts'

afterEach(cleanup)
const t: NarrativeProps['t'] = key => (en as Record<string, string>)[key] ?? key
const usageT: NarrativeProps['usageT'] = (key, params) => Object.entries(params ?? {})
  .reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), (chat as Record<string, string>)[key] ?? key)
const value: ExecutionUsageTotals = { stats: { turns: 3, steps: 5, llmMs: 8000, toolMs: 0,
  ttftMs: 1000, ttftSteps: 2, decodeMs: 4000, decodeTokens: 100 },
usage: { uncachedInputTokens: 40, cacheReadTokens: 140, cacheWriteTokens: 20, outputTokens: 100 } }

it('uses native formatting and refreshes after execution without leaking totals to another story', async () => {
  const read = vi.fn().mockResolvedValue(value)
  const props = { instanceId: 'a' as InstanceId, revision: 2, running: true, executionUsage: read, t, usageT }
  const view = render(<StoryUsage {...props} />)
  await screen.findByText('TTFT avg 0.5s · 25 tok/s')
  expect(screen.getByText('Cache hit 70%')).toBeTruthy()
  expect(screen.getByText('Input 200 tok · Output 100 tok')).toBeTruthy()
  view.rerender(<StoryUsage {...props} running={false} />)
  await waitFor(() => { expect(read).toHaveBeenCalledTimes(2) })
  read.mockImplementation(() => new Promise(() => {}))
  view.rerender(<StoryUsage {...props} instanceId={'b' as InstanceId} />)
  expect(screen.queryByText('Input 200 tok · Output 100 tok')).toBeNull()
})
