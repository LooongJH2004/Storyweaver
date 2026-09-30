/** Exercise perception and result feedback through the shipped actor/director tools and SQLite. */
import type {} from '../src/index.ts'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import type { BookId, CommandId, CommandScope } from '@deepseek-ai/dsh-roleplay-core'
import { pendingWorldAttempts } from '../../roleplay-core/src/world-attempts.ts'
import { launchWebScaffold } from '../../../../apps/web/tests/scaffold.ts'
import { MockAdapter, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

it('keeps the player floor after shipped-tool feedback and archive restoration', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-perception-feedback-'))
  const scaffold = await launchWebScaffold({
    extraOverlayPath: fileURLToPath(new URL('../../../experimental/roleplay-web-profile/cordis.patch.yml', import.meta.url)),
    extraInstallAnchors: [fileURLToPath(new URL('../../../experimental/roleplay-web-profile/package.json', import.meta.url))],
    directoryPickerMode: 'overlay', extraEntryOverrides: [
      { id: 'story-home', config: { root } },
      { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions') } },
      { id: 'storage-json', config: { root: join(root, 'storages') } },
      { id: 'roleplay-services', config: {
        databasePath: join(root, 'narrative.sqlite'), journalMode: 'wal', busyTimeoutMs: 1000,
        provider: 'mock', model: 'mock', consolidationThreshold: 0, directorConsolidationThreshold: 0,
        worldFeedbackLimit: 2, directorCommandLimit: 12, discussionTurnLimit: 16, maxContextUpdateUnits: 16,
        queryPageLimit: 40, notificationIntervalMs: 10,
        recallCharacterLimit: 6000,
        characterLimits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
          maxActiveGoals: 32, maxScheduledIntentions: 32 },
      } },
    ],
  })
  try {
    const { ctx } = scaffold
    const draft = ctx.roleplayBooks.saveDraft({ id: 'investigation' as BookId, expectedRevision: 0,
      title: 'Investigation', resources: [], document: { schemaVersion: 6, id: 'investigation', title: 'Investigation',
        directorPrompt: '', directorGuidance: {}, discussionSettings: { maxRounds: 2, floorPolicy: 'balanced' }, characters: ['inspector', 'witness'].map(actorId => ({
          actorId, displayName: actorId, appearance: actorId, publicPersona: 'An observant traveler.',
          rolePrompt: '', actingGuidance: {}, capabilities: ['speak', 'act', 'memory'],
        })) } })
    const version = ctx.roleplayBooks.publish(draft.id, draft.revision)
    const id = ctx.roleplayInstances.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId }).instance.id
    const scope = (): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
      expectedRevision: ctx.roleplayHistory.snapshot(id).instance.revision, principal: { kind: 'player' } })
    ctx.roleplayPeople.stage(scope(), { id: 'hall', location: 'Hall', present: ['inspector', 'witness'], appearances: [] })
    await ctx.roleplayPlayer.control(scope(), 'witness')
    const command = (callId: string, value: unknown) => toolCallResponse(callId, 'director_command', { command: value })
    const model = new MockAdapter([
      command('open', { operation: 'discuss', input: { topic: 'Check the exit', participantIds: ['inspector', 'witness'], maxRounds: 2 } }),
      command('start', { operation: 'finish', actors: [], advanceDiscussion: true }),
      toolCallResponse('prepare', 'npc_commit_turn', { posture: 'watching', discussion: { action: 'pass', eagerness: 'high' } }),
      toolCallResponse('try', 'npc_commit_turn', { posture: 'waiting', discussion: { action: 'speak', eagerness: 'high' },
        behavior: [{ kind: 'speech', text: 'I will check the latch.' }, { kind: 'action', attempt: 'Lift the exit latch.', visibility: 'public', await_result: true }] }),
      () => toolCallResponse('settle', 'director_observe', { summary: 'The latch opens', content: 'The latch opens.',
        settles: pendingWorldAttempts(ctx.roleplayHistory.snapshot(id)).map(item => item.id),
        shared: { actorIds: ['inspector', 'witness'], content: 'The latch opens.', kind: 'observation', sourceRefs: [] },
        deliveries: [], state: [] }),
      command('wait-player', { operation: 'finish', actors: [], advanceDiscussion: false }),
    ])
    ctx.llm.registerAdapter(['mock'], model)
    await ctx.roleplayDirector.run(scope(), 'Discuss checking the exit.')
    await ctx.roleplayDirector.summarizeDiscussion(scope())
    expect(model.requests).toHaveLength(6)
    const play = () => ctx.roleplayPlay.read({ instanceId: id, audience: { kind: 'observer' }, offset: 0, limit: 40 })
    expect(play().discussion).toMatchObject({ status: 'active' })
    expect(play().playerTurn).toBe(true)
    expect(pendingWorldAttempts(ctx.roleplayHistory.snapshot(id))).toEqual([])
    expect(JSON.stringify(model.requests[4]?.messages)).toContain('Preserve the player floor')
    const count = model.requests.length
    await expect(ctx.roleplayRuntime.run(scope(), 'witness')).rejects.toThrow()
    expect(model.requests).toHaveLength(count)
    const archive = await ctx.roleplayTransfer.export(id, ctx.roleplayHistory.snapshot(id).instance.revision)
    const restored = ctx.roleplayTransfer.import(archive, randomUUID() as CommandId)
    const imported = ctx.roleplayPlay.read({ instanceId: restored.id, audience: { kind: 'observer' }, offset: 0, limit: 40 })
    expect(imported.playerTurn).toBe(true)
    expect(imported.discussion).toMatchObject({ status: 'active' })
  } finally {
    await scaffold.close()
    await rm(root, { recursive: true, force: true })
  }
})
