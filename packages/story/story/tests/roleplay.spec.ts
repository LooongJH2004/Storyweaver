import { describe, expect, it } from 'vitest'
import {
  actAsPlayer,
  activeStoryMemories,
  choosePlayerDirection,
  clearDiscussionIntervention,
  closeStoryDiscussion,
  currentStorySceneCast,
  defaultStoryContextRecipe,
  emptyStoryDiscussions,
  emptyStoryMemory,
  emptyStoryWorld,
  intervenePlayerWorld,
  narrateDirectorWorld,
  proposeStoryMemory,
  recordDiscussionTurn,
  requestDiscussionIntervention,
  reviewStoryMemory,
  settleActorWorldEvent,
  stageDirectorScene,
  startStoryDiscussion,
  storyContextRecipeSchema,
  StoryRoleplayError,
  updateDiscussionParticipantIntent,
  updateStoryContextRecipe,
} from '../src/index.ts'

describe('roleplay world settlement and perception delivery', () => {
  it('establishes Director narration idempotently and delivers only declared perceptions', () => {
    const input = {
      expectedWorldRevision: 0,
      sourceEventRef: 'director-narration:run-1:1',
      summary: 'The station clock reaches midnight and the final train approaches.',
      audience: ['keeper'],
      patch: [{ op: 'set' as const, path: ['station', 'clock'], value: 'midnight' }],
    }
    const narrated = narrateDirectorWorld(emptyStoryWorld(), input)
    expect(narrated).toMatchObject({
      revision: 1,
      facts: { station: { clock: 'midnight' } },
      events: [{ kind: 'director-narration', source: 'director', sourceEventRef: input.sourceEventRef }],
      perceptions: [{ actorId: 'keeper', content: input.summary }],
    })
    expect(narrateDirectorWorld(narrated, input)).toBe(narrated)
  })

  it('stores one typed scene cast and reserves its world-fact namespace', () => {
    const staged = stageDirectorScene(emptyStoryWorld(), {
      expectedWorldRevision: 0,
      sceneId: 'moonshadow-private-room',
      location: 'Elfsong Tavern private room',
      summary: 'Shadowheart and Gale are together in the private room.',
      presentActorIds: ['shadowheart', 'gale'],
    })
    expect(currentStorySceneCast(staged)).toEqual({
      schemaVersion: 1,
      sceneId: 'moonshadow-private-room',
      location: 'Elfsong Tavern private room',
      presentActorIds: ['shadowheart', 'gale'],
    })
    expect(staged.perceptions.map(item => item.actorId)).toEqual(['shadowheart', 'gale'])
    expect(() => intervenePlayerWorld(staged, {
      expectedWorldRevision: 1,
      summary: 'Attempt to bypass the typed scene boundary.',
      patch: [{ op: 'set', path: ['storyweaver', 'scene', 'location'], value: 'elsewhere' }],
      audience: [],
    })).toThrow(/reserved world path/)
  })

  it('applies typed patches, scopes perceptions, and rejects stale or duplicate settlement', () => {
    const intervened = intervenePlayerWorld(emptyStoryWorld(), {
      expectedWorldRevision: 0,
      summary: 'Lightning cuts the song and extinguishes every lamp in the Elfsong Tavern.',
      patch: [{ op: 'set', path: ['elfsong', 'lights'], value: 'extinguished' }],
      audience: ['shadowheart', 'astarion', 'gale', 'mira-courier'],
    })
    expect(intervened.facts).toEqual({ elfsong: { lights: 'extinguished' } })
    expect(intervened.perceptions.map(item => item.actorId)).toEqual([
      'shadowheart', 'astarion', 'gale', 'mira-courier',
    ])
    expect(() => choosePlayerDirection(intervened, {
      expectedWorldRevision: 0,
      direction: 'Move the Moonshadow Ledger to the old cellar.',
      audience: [],
    })).toThrow(StoryRoleplayError)

    const settled = settleActorWorldEvent(intervened, {
      expectedWorldRevision: 1,
      sourceEventRef: 'actor-session:17',
      accepted: true,
      summary: 'Gale raises an isolation ward around the private room.',
      audience: ['shadowheart', 'astarion', 'gale', 'mira-courier'],
      patch: [{ op: 'set', path: ['elfsong', 'privateRoom', 'isolationWard'], value: 'active' }],
    }, { kind: 'action-intent', actorId: 'gale' })
    expect(settled.events.at(-1)).toMatchObject({ kind: 'actor-action', sourceEventRef: 'actor-session:17' })
    expect(() => settleActorWorldEvent(settled, {
      expectedWorldRevision: 2,
      sourceEventRef: 'actor-session:17',
      accepted: true,
      summary: 'duplicate',
      audience: [],
      patch: [],
    }, { kind: 'action-intent', actorId: 'gale' })).toThrow(/already settled/)
  })

  it('records embodied actions without permitting unsafe world paths', () => {
    expect(() => actAsPlayer(emptyStoryWorld(), {
      expectedWorldRevision: 0,
      actorId: 'shadowheart',
      description: 'tamper',
      audience: [],
      patch: [{ op: 'set', path: ['__proto__', 'polluted'], value: true }],
    })).toThrow(/unsafe world path segment/)
  })
})

describe('reviewed memory, durable discussion, and safe recipes', () => {
  it('keeps proposals out of context and retains unrelated approved summaries', () => {
    const first = proposeStoryMemory(emptyStoryMemory(), {
      expectedRevision: 0,
      kind: 'arc',
      title: 'The song and the signature',
      directorSummary: 'The party confirmed that the refrain intensifies Mira’s urge to sign.',
      publicSummary: 'The refrain visibly intensifies Mira’s urge to sign.',
      actorMemories: { shadowheart: 'Shadowheart recognizes the coercive shape of the ritual.' },
      eventRefs: ['scene:4'],
      proposedBy: 'director',
    })
    expect(activeStoryMemories(first)).toEqual([])
    const approved = reviewStoryMemory(first, 1, first.entries[0]!.id, true)
    expect(activeStoryMemories(approved, 'shadowheart').join('\n')).toContain('Shadowheart recognizes')
    const second = proposeStoryMemory(approved, {
      expectedRevision: 2,
      kind: 'arc',
      title: 'The ward interrupts the refrain',
      directorSummary: 'Gale’s isolation ward separates the room from Sister Veil’s song.',
      publicSummary: 'Gale’s isolation ward separates the room from the song.',
      actorMemories: {},
      eventRefs: ['scene:9'],
      proposedBy: 'player',
    })
    const replaced = reviewStoryMemory(second, 3, second.entries.at(-1)!.id, true)
    expect(replaced.entries.map(entry => entry.status)).toEqual(['approved', 'approved'])
  })

  it('persists exact floor ownership and enters Director summarization at the round budget', () => {
    const started = startStoryDiscussion(emptyStoryDiscussions(), {
      expectedRevision: 0,
      topic: 'Should the Moonshadow Ledger be moved?',
      participantIds: ['shadowheart', 'gale'],
      maxRounds: 1,
    })
    const discussionId = started.discussions[0]!.id
    expect(() => recordDiscussionTurn(started, {
      expectedRevision: 1,
      discussionId,
      speakerId: 'gale',
      text: 'I can ward the ledger before we move it.',
    })).toThrow(/before every participant declares/)
    expect(() => recordDiscussionTurn(started, {
      expectedRevision: 1,
      discussionId,
      speakerId: 'shadowheart',
      text: 'Too early.',
    })).toThrow(/before every participant declares/)
    expect(() => updateDiscussionParticipantIntent(
      started, 1, discussionId, 'shadowheart', {
        stance: 'Speak immediately.', eagerness: 'high', action: 'speak',
      },
    )).toThrow(/preparation requires action=pass/)
    const shadowheartPrepared = updateDiscussionParticipantIntent(
      started, 1, discussionId, 'shadowheart', {
        stance: 'Protect Mira before moving the ledger.', eagerness: 'high', action: 'pass',
      },
    )
    const prepared = updateDiscussionParticipantIntent(
      shadowheartPrepared, 2, discussionId, 'gale', {
        stance: 'Ward the ledger before transport.', eagerness: 'medium', action: 'pass',
      },
    )
    expect(prepared.discussions[0]).toMatchObject({
      currentSpeakerId: 'shadowheart',
    })
    expect(prepared.discussions[0]?.preparationPendingIds).toBeUndefined()
    const shadowheart = recordDiscussionTurn(prepared, {
      expectedRevision: 3,
      discussionId,
      speakerId: 'shadowheart',
      text: 'No one touches it until Mira understands the price.',
    })
    const gale = recordDiscussionTurn(shadowheart, {
      expectedRevision: 4,
      discussionId,
      speakerId: 'gale',
      text: 'Agreed. An isolation ward first.',
    })
    expect(gale.discussions[0]).toMatchObject({ status: 'summarizing' })
    expect(gale.discussions[0]?.currentSpeakerId).toBeUndefined()
    expect(closeStoryDiscussion(gale, 5, discussionId, 'completed').discussions[0]?.status).toBe('completed')
  })

  it('accepts a participant conclusion without imposing a minimum discussion length', () => {
    const started = startStoryDiscussion(emptyStoryDiscussions(), {
      expectedRevision: 0,
      topic: 'Should the Moonshadow Ledger be moved?',
      participantIds: ['shadowheart', 'gale'],
      maxRounds: 3,
    })
    const discussionId = started.discussions[0]!.id
    const firstPrepared = updateDiscussionParticipantIntent(started, 1, discussionId, 'shadowheart', {
      stance: 'Do not move it.', eagerness: 'high', action: 'pass',
    })
    const prepared = updateDiscussionParticipantIntent(firstPrepared, 2, discussionId, 'gale', {
      stance: 'Ward it first.', eagerness: 'medium', action: 'pass',
    })
    const proposed = updateDiscussionParticipantIntent(prepared, 3, discussionId, 'shadowheart', {
      stance: 'Do not move it.', eagerness: 'high', action: 'conclude',
    })
    const firstTurn = recordDiscussionTurn(proposed, {
      expectedRevision: 4,
      discussionId,
      speakerId: 'shadowheart',
      text: 'Then it stays where it is.',
    })

    expect(firstTurn.discussions[0]).toMatchObject({ status: 'summarizing' })
    expect(firstTurn.discussions[0]?.currentSpeakerId).toBeUndefined()
    expect(firstTurn.discussions[0]?.turns[0]).toMatchObject({ action: 'conclude' })
  })

  it('cancels a pending player floor request and resumes automatic discussion', () => {
    const started = startStoryDiscussion(emptyStoryDiscussions(), {
      expectedRevision: 0,
      topic: 'Should the Moonshadow Ledger be moved?',
      participantIds: ['shadowheart', 'gale'],
      maxRounds: 3,
    })
    const discussionId = started.discussions[0]!.id
    const requested = requestDiscussionIntervention(started, 1, discussionId, 'speak')
    expect(requested.discussions[0]).toMatchObject({
      status: 'awaiting-player',
      playerIntervention: 'speak',
    })

    const resumed = clearDiscussionIntervention(requested, 2, discussionId)
    expect(resumed.discussions[0]?.status).toBe('active')
    expect(resumed.discussions[0]).not.toHaveProperty('playerIntervention')
    expect(() => clearDiscussionIntervention(requested, 1, discussionId)).toThrow(/revision 1 is stale/)
  })

  it('allows ordering but never disables locked context sections', () => {
    const recipe = defaultStoryContextRecipe()
    expect(recipe.director.at(-1)).toMatchObject({ id: 'director-reasoning-mode', role: 'user' })
    expect(recipe.director.at(-1)?.content).toContain('director_narrate')
    expect(recipe.director.at(-1)?.content).toContain('一至三个短句')
    expect(recipe.director.at(-1)?.content).toContain('不要复述上下文、展开长篇分析或预写旁白正文')
    expect(recipe.director.at(-1)?.content).toContain('后续工具步骤不要重述计划')
    expect(recipe.director.at(-1)?.content).toContain('多名角色需要围绕同一问题追问、回应、争执、协商或共同决策')
    expect(recipe.actor.at(-1)).toMatchObject({ id: 'actor-reasoning-mode', role: 'user' })
    expect(recipe.actor.at(-1)?.content).toContain('不要把思考改写或复制成普通 assistant 文本')
    expect(recipe.actor.at(-1)?.content).toContain('每条 behavior 都明确填写 kind=speech 或 kind=action')
    expect(() => updateStoryContextRecipe(recipe, 0, {
      director: recipe.director.map(section => section.id === 'policy' ? { ...section, enabled: false } : section),
      actor: recipe.actor,
    })).toThrow(/Locked section/)
    const updated = updateStoryContextRecipe(recipe, 0, {
      director: [...recipe.director.slice(0, 2), ...recipe.director.slice(2).reverse()],
      actor: recipe.actor,
    })
    expect(updated.revision).toBe(1)
    expect(updated.director[2]?.id).toBe('director-reasoning-mode')
  })

  it('upgrades the verbose immersive Director rule to concise planning', () => {
    const recipe = defaultStoryContextRecipe()
    const current = recipe.director.at(-1)?.content
    expect(current).toBeDefined()
    const previous = `【导演沉浸式幕后思考要求】使用私有推理通道，像置身现场但不被角色看见的世界导演一样构思；不要在玩家可见正文中泄露这段幕后思考。
1. 可以用“我”指代导演自己，并用“（导演思考：……）”式的沉浸独白进入场景。先感受此刻的光线、声音、距离、动作停顿与未说出口的压力，再决定下一拍发生什么；不要从接口、修订号或状态机开始思考。
2. 我掌管客观环境、时间、外部人物、偶发事件、信息显露与场景转换。每个新 Brief 都要让导演旁白至少推动其中一项，使世界主动回应角色，而不是把全部推进责任交给 Actor 对话。
3. “我”永远只是幕后导演，不是任何持久角色。不得替 Actor 说话、宣告其私密心理或替其作自愿选择；只能观察其已经表现出的言行，为其制造压力、机会与后果，再把选择交还角色本人。
4. 先按戏剧关系判断单次聚光或持续讨论。彼此独立的反应可用普通 director_dispatch_actors；多名角色围绕同一问题追问、回应、争执、协商或共同决策时，先用 director_start_discussion，再调度自动往返，不等待玩家追加“继续”。
5. 思考重点是本场的情绪温度、悬念、节奏、镜头焦点和下一处可感知变化。除非工具刚刚返回错误，不要在私有思考中长篇讨论代码、缓存、schema、revision、Brief 生命周期或猜测宿主实现。
6. 工具只是幕后舞台机械。先决定故事下一拍，再选择最短可行操作顺序：必要时更新大纲或场景 → 提交 Brief → director_narrate → 发起讨论或调度 Actor。遇到工具错误时，只依据原样错误纠正一次必要参数；不要反复推测系统内部，也不要用技术分析替代叙事推进。中断恢复同一 Brief 时复用已有旁白。`
    const migrated = storyContextRecipeSchema.parse({
      ...recipe,
      director: recipe.director.map(section => section.id === 'director-reasoning-mode'
        ? { ...section, content: previous }
        : section),
    })

    expect(migrated.revision).toBe(recipe.revision + 1)
    expect(migrated.director.at(-1)?.content).toBe(current)
    expect(migrated.director.at(-1)?.title).toBe('导演简短思维链')
  })

  it('adds the transaction hand-off to the legacy Actor reasoning rule', () => {
    const recipe = defaultStoryContextRecipe()
    const previous = `【角色沉浸要求】在你的思考过程（<think>标签内）中，请遵守以下规则：
1. 请以角色第一人称进行内心独白，用括号包裹内心活动，例如"（心想：……）"或"(内心OS：……)"
2. 用第一人称描写角色的内心感受，例如"我心想""我觉得""我暗自"等
3. 思考内容应沉浸在角色中，通过内心独白分析剧情和规划回复`
    const migrated = storyContextRecipeSchema.parse({
      ...recipe,
      actor: recipe.actor.map(section => section.id === 'actor-reasoning-mode'
        ? { ...section, content: previous }
        : section),
    })

    expect(migrated.revision).toBe(recipe.revision + 1)
    expect(migrated.actor.at(-1)?.content).toContain('立即调用一次 npc_commit_turn')
    expect(migrated.actor.at(-1)?.content).toContain('严格执行 discussion.instruction')
  })
})
