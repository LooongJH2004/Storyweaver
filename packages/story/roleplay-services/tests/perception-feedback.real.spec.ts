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
import { narrativeOriginals } from '../../roleplay-core/src/retention-records.ts'
import { launchWebScaffold } from '../../../../apps/web/tests/scaffold.ts'
import { MockAdapter, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

it('settles a concealed investigation, delivers shared and private results, then stops after the actors respond', { timeout: 30000 }, async () => {
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
        directorPrompt: '', directorGuidance: {}, characters: ['inspector', 'witness'].map(actorId => ({
          actorId, displayName: actorId, appearance: actorId, publicPersona: 'An observant traveler.',
          rolePrompt: '', actingGuidance: {}, capabilities: ['speak', 'act', 'memory'],
        })) } })
    const version = ctx.roleplayBooks.publish(draft.id, draft.revision)
    const id = ctx.roleplayInstances.createStory({ templateVersionId: version.id, commandId: randomUUID() as CommandId }).instance.id
    const scope = (): CommandScope => ({ instanceId: id, id: randomUUID() as CommandId,
      expectedRevision: ctx.roleplayHistory.snapshot(id).instance.revision, principal: { kind: 'player' } })
    ctx.roleplayPeople.stage(scope(), { id: 'hall', location: 'Hall', present: ['inspector', 'witness'], appearances: [] })
    const concealed = 'PRIVATE-ATTEMPT: inspect the underside of the desk without attracting attention.'
    const privateResult = 'PRIVATE-RESULT: you see a blue wax seal under the desk.'
    const sharedResult = 'The hall bell rings once.'
    const finish = (actors: string[]) => toolCallResponse(`finish-${actors.join('-')}`, 'director_command', {
      command: { operation: 'finish', actors, advanceDiscussion: false },
    })
    const model = new MockAdapter([
      finish(['inspector']),
      toolCallResponse('inspect', 'npc_commit_turn', { posture: 'waiting', behavior: [
        { kind: 'action', attempt: concealed, visibility: 'concealed', await_result: true },
      ] }),
      toolCallResponse('missing-settlement-decision', 'director_observe', {
        summary: 'REJECTED-UNLINKED-RESULT', content: 'REJECTED-UNLINKED-RESULT', state: [], deliveries: [],
      }),
      () => {
        const attempts = pendingWorldAttempts(ctx.roleplayHistory.snapshot(id))
        expect(attempts).toHaveLength(1)
        expect(ctx.roleplayViews.actorContext({ instanceId: id, actorId: 'witness', query: '' }).text).not.toContain(concealed)
        return toolCallResponse('settle', 'director_observe', {
          summary: 'The desk has been inspected.', content: 'The bell echoes through the hall.', state: [],
          settles: attempts.map(item => item.id),
          shared: { actorIds: ['inspector', 'witness'], content: sharedResult, kind: 'observation', sourceRefs: [] },
          deliveries: [{ actorId: 'inspector', mode: 'supplement', content: privateResult, kind: 'observation', sourceRefs: [] }],
        })
      },
      finish(['inspector', 'witness']),
      () => {
        const result = narrativeOriginals(ctx.roleplayHistory.snapshot(id), 'actor:inspector')
          .find(item => item.text.includes(privateResult))!
        return toolCallResponse('recall-settlement', 'narrative_recall', { query: result.id, offset: 0, limit: 1 })
      },
      toolCallResponse('inspector-responds', 'npc_commit_turn', { posture: 'silent', behavior: [] }),
      toolCallResponse('witness-responds', 'npc_commit_turn', { posture: 'silent', behavior: [] }),
    ])
    ctx.llm.registerAdapter(['mock'], model)
    const command = scope()
    expect(await ctx.roleplayDirector.run(command, 'Let the inspector examine the desk.')).toMatchObject({ status: 'completed' })
    expect(model.requests).toHaveLength(8)
    const actorSchema = model.requests[1]!.tools!.find(tool => tool.name === 'npc_commit_turn')!.parameters
    expect(actorSchema).toHaveProperty('properties.memories')
    for (const field of ['thoughts', 'knowledge_changes', 'state_changes', 'goals', 'intentions']) {
      expect(actorSchema).not.toHaveProperty(`properties.${field}`)
    }
    expect(pendingWorldAttempts(ctx.roleplayHistory.snapshot(id))).toEqual([])
    expect(JSON.stringify(ctx.roleplayHistory.snapshot(id))).not.toContain('REJECTED-UNLINKED-RESULT')
    const rendered = (index: number) => JSON.stringify(model.requests[index]?.messages)
    expect(rendered(2)).toContain(concealed)
    expect(rendered(3)).toContain('settles')
    expect(rendered(5)).toContain(privateResult)
    const recallResult = JSON.stringify(model.requests[6]!.messages.at(-1))
    expect(recallResult).toContain(privateResult)
    expect(recallResult).toContain('respondsTo')
    expect(rendered(7)).not.toContain(privateResult)
    expect(rendered(7)).not.toContain(concealed)
    for (const index of [5, 7]) expect(rendered(index).split(sharedResult)).toHaveLength(2)
    // Retrying the accepted player command must not repeat investigation, settlement or reactions.
    await ctx.roleplayDirector.run(command, 'Let the inspector examine the desk.')
    expect(model.requests).toHaveLength(8)
    const archive = await ctx.roleplayTransfer.export(id, ctx.roleplayHistory.snapshot(id).instance.revision)
    const restored = ctx.roleplayTransfer.import(archive, randomUUID() as CommandId)
    expect(pendingWorldAttempts(ctx.roleplayHistory.snapshot(restored.id))).toEqual([])
    for (const actorId of ['inspector', 'witness']) {
      const text = ctx.roleplayViews.actorContext({ instanceId: restored.id, actorId, query: '' }).text
      expect(text).toContain(sharedResult)
      if (actorId === 'inspector') expect(text).toContain(privateResult)
      else {
        expect(text).not.toContain(privateResult)
        expect(text).not.toContain(concealed)
      }
    }
  } finally {
    await scaffold.close()
    await rm(root, { recursive: true, force: true })
  }
})
