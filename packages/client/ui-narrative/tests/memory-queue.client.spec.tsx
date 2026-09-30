// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryQueuePanel } from '../src/client/MemoryQueuePanel.tsx'
import { en } from '../src/client/locales.ts'
import type { NarrativeProps } from '../src/client/contract.ts'

afterEach(cleanup)
it('previews queued results separately from memory activation and retries failed jobs', async () => {
  const messages: Record<string, string> = en
  const t: NarrativeProps['t'] = (key, params) => Object.entries(params ?? {}).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), messages[key] ?? key)
  const result = { id: 'job', owner: 'actor:a', ownerLabel: 'Mira', status: 'superseded',
    revision: 12, sourceIds: ['source'], error: 'Connection interrupted', units: [{ reason: 'A promise.', changes: [{
      text: 'I owe a return visit.', episode: { topic: 'Promise', experience: 'I promised to return.', unresolved: ['When?'] },
    }] }] }
  const memoryJobs = vi.fn().mockResolvedValue([result])
  const memoryJob = vi.fn().mockResolvedValue(result)
  const retryMemoryJob = vi.fn().mockResolvedValue(undefined)
  const author = vi.fn()
  const props = { t, instanceId: 'story', memoryJobs, memoryJob, retryMemoryJob, author } as unknown as Parameters<typeof MemoryQueuePanel>[0]
  render(<MemoryQueuePanel {...props} />)
  await screen.findByText('Mira')
  expect(screen.getByText('Memory changed; regenerate · 1 sources · revision 12')).toBeTruthy()
  fireEvent.click(screen.getByText('Preview result'))
  expect(await screen.findByText('I owe a return visit.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
  await waitFor(() => { expect(retryMemoryJob).toHaveBeenCalledWith('story', 'job') })
  expect(author).not.toHaveBeenCalled()
})
