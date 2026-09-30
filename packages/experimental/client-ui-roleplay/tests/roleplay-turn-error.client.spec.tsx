// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { RoleplayTurnErrorView } from '../src/client/RoleplayTurnErrorView.tsx'
import { zh, type RoleplayKey } from '../src/client/locales.ts'

function t(key: RoleplayKey, params?: Record<string, unknown>): string {
  let value: string = zh[key]
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

describe('roleplay quota interruption', () => {
  it('turns AUTH into an actionable alert instead of a generic failure', () => {
    const props = {
      node: { data: { code: 'AUTH', message: '', kind: 'turn-error' } },
      sessionId: SessionId('scene-auth'),
      useInput: (selector: (value: { draft: string }) => unknown) => selector({ draft: '' }),
      inputActions: { setIntent: () => {}, setDraft: vi.fn() },
      t,
    } as unknown as ComponentProps<typeof RoleplayTurnErrorView>
    const view = render(<RoleplayTurnErrorView {...props} />)

    expect(view.getByRole('alert')).toBeTruthy()
    expect(view.getByText('DeepSeek 凭据无效')).toBeTruthy()
    expect(view.getByText('请在“设置 → 模型”中更新 API 密钥，然后重新发送本轮。')).toBeTruthy()
  })

  it('shows durable progress and seeds a safe resume instruction', () => {
    const setDraft = vi.fn()
    const sceneSessionId = SessionId('scene-quota')
    const snapshot = {
      phase: 'ready', error: null,
      items: [{
        storyId: 'story-quota', title: '额度恢复', premise: '',
        sceneSessionIds: [sceneSessionId], currentSceneSessionId: sceneSessionId,
        actors: [], createdAt: '', updatedAt: '', directorOutline: {},
        plotLedger: {
          revision: 3, situation: '', establishedFacts: [], openThreads: [], pendingNpcEvents: [],
          directorRun: {
            id: 'run:scene-quota:1', revision: 3, briefLedgerRevision: 1,
            directorSessionId: sceneSessionId, sceneSessionId,
            status: 'awaiting_retry', createdAt: '', updatedAt: '',
            actors: [
              { actorId: 'shadowheart', status: 'completed', attempts: 1, generation: 1, eventRefs: ['actor:1'] },
              { actorId: 'astarion', status: 'failed', attempts: 1, generation: 1, eventRefs: [] },
            ],
          },
        },
      }],
    }
    const props = {
      node: { data: { code: 'QUOTA', message: '', kind: 'turn-error' } },
      sessionId: sceneSessionId,
      useInput: (selector: (value: { draft: string }) => unknown) => selector({ draft: '保留这段草稿' }),
      inputActions: { setDraft },
      useStories: (selector: (value: typeof snapshot) => unknown) => selector(snapshot),
      t,
    } as unknown as ComponentProps<typeof RoleplayTurnErrorView>
    const view = render(<RoleplayTurnErrorView {...props} />)

    expect(view.getByText('推进进度：1/2')).toBeTruthy()
    expect(view.getByText('待恢复角色：astarion')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: '写入恢复推进指令' }))
    expect(setDraft).toHaveBeenCalledWith(expect.stringContaining('run:scene-quota:1'))
    expect(setDraft).toHaveBeenCalledWith(expect.stringContaining('保留这段草稿'))
  })
})
