# 自主 Actor

[English](actor.md) | 中文

实验性 Actor 子系统让一个虚构角色拥有自己的精确 Agent、全新 Session、主动行为工具和可重放私有状态。[Actor 内核 Agent Note](../../.agents/notes/implemented/feature/2026-08-28-autonomous-actor-kernel-foundation.zh.md)负责自主性与玩家权限决策；[领域包 README](../../packages/experimental/actor/README.zh.md)负责操作限制与示例。

## 身份与信息边界

`ActorDescriptor` 将稳定的品牌化 `ActorId`、显示名、persona 和能力列表绑定到一个精确实时 Agent。Actor Session 拒绝继承 fork 历史。因此，不同 Actor 获得不同日志和模型上下文，而不是同一导演 transcript 的过滤视图。

## 主动自我状态

内心、记忆、目标、意图、表达和行动记录属于不同的只写日志事件族。活跃核心记忆由 Actor 自己选择。遗忘会追加墓碑：回忆和模型上下文不再暴露该记忆，但可信玩家检查与重放仍保留原始记录。目标使用连续快照；未来意图目前携带世界时间标签，并保持 scheduled，直到后续调度器包执行。

说话和行动只是意图，而不是叙述成功。后续环境插件可以结算谁听到表达、行动是否成功，以及哪些观察影响了各个 Actor，同时不改变 Actor 来源。

## PlayerAuthority

玩家是可信的上帝视角宿主权限，而不是另一个 Actor。故事方向与世界介入事件可以保存在控制 Session 中。当玩家经由角色说话或行动时，目标 Actor Session 会同时保存介入事件，以及带 `origin: 'player'` 的匹配表达/行动。这样故事能经由该角色继续，但不会假装 NPC 自主做出了选择。

## 重放与模型上下文

`foldActor()` 严格重建当前状态，并拒绝破损身份、重复 id、无效墓碑、不连续目标转换、不匹配的玩家代演，以及重复 Actor 回合关闭。模型工具包只渲染 persona、活跃记忆、活跃目标、已安排意图和有界的近期表达/行动。私有内心与已遗忘记忆保持在 Actor 模型上下文之外。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxactors--actorservice"></a>

### `ctx.actors` — `ActorService`

Autonomous Actor service backed by each Actor's own exact Session log.

```ts cordis-catalog
/**
 * Bind a fresh, history-isolated Agent to one stable fictional identity.
 * @param agent - exact live Agent that will own this Actor's Session log.
 * @param descriptor - stable identity and initial author configuration; existing bindings must match.
 * @returns the exact live Actor membership.
 */
bind(agent: Agent, descriptor: ActorDescriptor): ActorMembership

/**
 * Resolve one exact live Agent's Actor identity.
 * @param agent - exact live Agent used as the authority credential.
 * @returns the Actor membership.
 */
membership(agent: Agent): ActorMembership

/**
 * Apply an exact-revision author configuration without replacing fictional identity or state.
 * @param agent - Exact live Actor whose author configuration changes.
 * @param expectedRevision - Current configuration revision from its folded Session log.
 * @param descriptor - New name, persona, and host-granted capabilities with the same stable ID.
 * @returns current configuration revision; an identical configuration does not append an event.
 */
configure(agent: Agent, expectedRevision: number, descriptor: ActorDescriptor): number

/**
 * Resolve an Actor without throwing; stale object identities never match.
 * @param agent - candidate exact live Agent.
 * @returns its membership, or undefined when it is not a live Actor.
 */
tryMembership(agent: Agent): ActorMembership | undefined

/**
 * Resolve one unambiguous live Actor by stable fictional identity.
 * Separate Story runs may legitimately keep distinct live Sessions for the
 * same storybook Actor id, in which case callers must resolve through Story
 * ownership and this convenience lookup returns undefined.
 * @param actorId - stable fictional identity.
 * @returns its live membership, or undefined while that Actor is offline.
 */
find(actorId: ActorDescriptor['id']): ActorMembership | undefined

/**
 * Persist one fictional inner reflection chosen by the Actor.
 * @param agent - exact live Actor Agent.
 * @param request - complete fictional inner content.
 * @returns the committed thought record.
 */
reflect(agent: Agent, request: ReflectRequest): ActorThoughtRecord

/**
 * Persist one private emotional occurrence chosen by this Actor.
 * @param agent - exact live Actor Agent.
 * @param request - emotion, intensity, subjects, and optional cause or impulse.
 * @returns the committed emotional occurrence.
 */
feel(agent: Agent, request: FeelRequest): ActorEmotionRecord

/**
 * Add or revise one subjective belief without asserting a world fact.
 * @param agent - exact live Actor Agent.
 * @param request - proposition, stance, confidence, and optional subjects.
 * @returns the committed belief revision.
 */
believe(agent: Agent, request: BelieveRequest): ActorBeliefSnapshot

/**
 * Adjust one private relationship dimension toward a named subject.
 * @param agent - exact live Actor Agent.
 * @param request - target, dimension, bounded shift, and reason.
 * @returns the committed relationship revision.
 */
relate(agent: Agent, request: RelateRequest): ActorRelationshipSnapshot

/**
 * Create one explicit active core memory, archiving the least important
 * oldest active memory first when the configured capacity is full.
 * @param agent - exact live Actor Agent.
 * @param request - content, importance, tags, and optional source references.
 * @returns the committed active memory.
 */
remember(agent: Agent, request: RememberRequest): ActorMemoryRecord

/**
 * Search active memories only; forgotten source records remain outside this view.
 * @param agent - exact live Actor Agent.
 * @param request - optional text/tag query and bounded result count.
 * @returns newest matching active memories first.
 */
recall(agent: Agent, request: RecallRequest = {}): ActorMemoryRecord[]

/**
 * Tombstone one active memory while preserving its raw event for PlayerAuthority audit.
 * @param agent - exact live Actor Agent.
 * @param request - active memory identity and optional fictional reason.
 * @returns the newly forgotten memory view.
 */
forget(agent: Agent, request: ForgetRequest): ActorMemoryView

/**
 * Resolve a model-authored semantic description to at most one active memory and release it.
 * @param agent - exact live Actor Agent.
 * @param request - semantic subject, release mode, and optional reason.
 * @returns the committed release record and its resolved memory identities.
 */
releaseMemory(agent: Agent, request: ReleaseMemoryRequest): ActorMemoryReleaseRecord

/**
 * Persist one meaningful Actor-owned interpretation of material state changes.
 * @param agent - exact live Actor Agent.
 * @param request - trigger, interpretation, consequences, and durable source references.
 * @returns the committed revision-one turning point.
 */
recordTurningPoint(agent: Agent, request: RecordTurningPointRequest): ActorTurningPointSnapshot

/**
 * Replace one visible turning point over its exact current revision.
 * @param agent - exact live target Actor Agent.
 * @param request - complete player-authored replacement and expected revision.
 * @returns the committed next turning-point revision.
 */
updateTurningPoint(agent: Agent, request: UpdateTurningPointRequest): ActorTurningPointSnapshot

/**
 * Create one active Actor-owned goal.
 * @param agent - exact live Actor Agent.
 * @param request - goal description and optional priority.
 * @returns the revision-one active goal.
 */
setGoal(agent: Agent, request: SetGoalRequest): ActorGoalSnapshot

/**
 * Abandon one active goal without rewriting its original motivation.
 * @param agent - exact live Actor Agent.
 * @param request - active goal identity and optional reason.
 * @returns the committed abandoned goal revision.
 */
abandonGoal(agent: Agent, request: AbandonGoalRequest): ActorGoalSnapshot

/**
 * Resolve and revise a goal by natural-language description rather than exposing Goal ids.
 * @param agent - exact live Actor Agent.
 * @param request - goal operation, semantic description, priority, and optional reason.
 * @returns the committed goal snapshot.
 */
changeGoal(agent: Agent, request: ChangeGoalRequest): ActorGoalSnapshot

/**
 * Persist one future intention. The foundation package does not execute it.
 * @param agent - exact live Actor Agent.
 * @param request - intended behavior and world-time trigger.
 * @returns the committed scheduled intention.
 */
schedule(agent: Agent, request: ScheduleIntentionRequest): ActorIntentionRecord

/**
 * Record Actor-authored speech intent. Delivery and perception are environment responsibilities.
 * @param agent - exact live Actor Agent.
 * @param request - exact words, intended audience, and delivery mode.
 * @returns the committed Actor-origin expression.
 */
speak(agent: Agent, request: SpeakRequest): ActorExpressionRecord

/**
 * Record Actor-authored action intent. Resolution is environment-owned and deferred.
 * @param agent - exact live Actor Agent.
 * @param request - attempted behavior and optional target.
 * @returns the committed Actor-origin action intent.
 */
act(agent: Agent, request: ActRequest): ActorActionRecord

/**
 * Append a once-per-turn Actor completion marker.
 * @param agent - exact live Actor Agent.
 * @param reason - explicit or fallback reason the Actor stopped.
 * @param expectedTurn - optional generic turn identity used as a race guard.
 * @param details - optional visible posture and next impulse.
 * @returns true when a marker was appended, false when that turn was already closed.
 */
closeCurrentTurn( agent: Agent, reason: ActorTurnCloseReason, expectedTurn?: number, details: { readonly posture?: ActorTurnPosture readonly nextImpulse?: string readonly discussion?: ActorDiscussionIntent readonly continuity?: readonly ActorContinuityRequest[] } = {}, ): boolean

/**
 * Test whether the current generic Agent turn already has an Actor closure marker.
 * @param agent - exact live Actor Agent.
 * @returns whether its current open turn is Actor-closed.
 */
isCurrentTurnClosed(agent: Agent): boolean

/**
 * Test whether one identified turn already has an Actor closure marker.
 * @param agent - exact live Actor Agent.
 * @param turn - generic Agent turn identity.
 * @returns whether that turn carries an Actor closure.
 */
isTurnClosed(agent: Agent, turn: number): boolean

/**
 * Let the trusted player select a story direction without impersonating an Actor.
 * @param controlSession - Session that owns story-level control history.
 * @param direction - player-authored desired direction.
 * @returns the committed player intervention.
 */
playerChooseDirection(controlSession: Session, direction: string): PlayerInterventionRecord

/**
 * Let the trusted player change world state without impersonating an Actor.
 * @param controlSession - Session that owns world-level control history.
 * @param description - player-authored world intervention.
 * @returns the committed player intervention.
 */
playerInterveneWorld(controlSession: Session, description: string): PlayerInterventionRecord

/**
 * Let the trusted player speak as any bound Actor while preserving player provenance.
 * @param agent - exact live target Actor Agent.
 * @param request - exact words, audience, and delivery mode.
 * @returns matching player intervention and player-origin expression.
 */
playerSpeakAs(agent: Agent, request: SpeakRequest): PlayerSpeechResult

/**
 * Let the trusted player act as any bound Actor while preserving player provenance.
 * @param agent - exact live target Actor Agent.
 * @param request - embodied action and optional target.
 * @returns matching player intervention and player-origin action.
 */
playerActAs(agent: Agent, request: ActRequest): PlayerActionResult

/**
 * Read god-view private state, including thoughts and forgotten-memory tombstones.
 * @param agent - exact live target Actor Agent.
 * @returns complete detached private projection.
 */
playerInspect(agent: Agent): ActorPrivateView

/**
 * Read a persisted Actor without creating or running a model Agent.
 * @param events - exact private Session log including rewind markers.
 * @returns the same complete player projection as a live Actor.
 */
playerInspectEvents(events: readonly SessionEvent[]): ActorPrivateView

/**
 * Read bounded current self-state for the model-facing Actor policy.
 * @param agent - exact live Actor Agent.
 * @returns active self-state without thoughts or forgotten memories.
 */
modelContext(agent: Agent): ActorModelContext

/**
 * Render the same model projection from a durable log without mounting an Agent.
 * @param events - Private Actor log, including active-branch rewind markers.
 * @returns active self-state with the configured relevance and recent-action bounds.
 */
modelContextEvents(events: readonly SessionEvent[]): ActorModelContext

/**
 * Stage all NPC writes before publishing any event. Validation failures publish nothing.
 * @param agent - exact live Actor.
 * @param operation - synchronous complete turn write operation.
 */
transaction(agent: Agent, operation: () => void): void

/**
 * Whether the active branch has instantiated its authored state, including an empty baseline.
 * @param agent - exact live Actor.
 * @returns whether an initialization event survives active-branch rewind.
 */
isStateInitialized(agent: Agent): boolean

/**
 * Initialize this Actor's authored fields once on the active branch.
 * @param agent - exact live Actor.
 * @param initial - authored private definitions and starting values.
 * @param actorIds - complete authored cast used for relationship validation.
 * @param context - initial lifecycle records; model mutation capabilities remain unchanged.
 */
initializeState( agent: Agent, initial: readonly StateInitialValue[], actorIds: readonly string[], context: import('./types.ts').ActorInitialContext = {}, ): void

/**
 * Commit exact-revision state changes authored by the NPC.
 * @param agent - exact live Actor possessing reflection capability.
 * @param changes - requested private-state deltas.
 * @returns the resulting detached state.
 */
changeState(agent: Agent, changes: readonly StateChange[]): DynamicState

/**
 * Apply a player correction or compensating revision to character-private state.
 * @param agent - exact live target Actor.
 * @param changes - revisioned player edits.
 * @returns the resulting detached state.
 */
playerChangeState(agent: Agent, changes: readonly StateChange[]): DynamicState

/**
 * Bind authored cognition once to this Actor's durable branch.
 * @param agent - Registered Actor session.
 */
initializeKnowledge(agent: Agent): void

/**
 * Commit private judgments with evidence permissions derived from the registered owner.
 * @param agent - Exact Actor; ordinary submissions require reflection capability and an open turn.
 * @param input - Whole knowledge batch.
 * @param origin - Trusted player correction or ordinary Actor submission.
 * @returns complete private cognition after validation.
 */
changeKnowledge(agent: Agent, input: readonly KnowledgeChange[], origin: 'actor' | 'player' = 'actor'): KnowledgeState

/**
 * Resolve a model's target before recording world-facing behavior.
 * @param agent - Authenticated speaker.
 * @param ref - Observer-local person reference.
 * @returns canonical host identity; standalone Actors retain their existing addressing contract.
 */
resolvePerson(agent: Agent, ref: string): string
```

Types: [Agent](core.zh.md) · [DynamicState](story.zh.md) · [KnowledgeChange](story.zh.md) · [KnowledgeState](story.zh.md) · [Session](session.zh.md) · [SessionEvent](session.zh.md) · [StateChange](story.zh.md) · [StateInitialValue](story.zh.md)

Source: [`packages/experimental/actor/src/index.ts`](../../packages/experimental/actor/src/index.ts)

<a id="actor-events"></a>

### `actor/*` events

<a id="actorbound--emit"></a>

#### `actor/bound` — emit

An exact live Agent became an Actor after its descriptor was committed.

```ts cordis-catalog
/**
 * An exact live Agent became an Actor after its descriptor was committed.
 * @param payload - exact Agent and immutable live membership.
 * @mode emit
 */
'actor/bound'(payload: { agent: Agent; membership: ActorMembership }): void
```

Types: [Agent](core.zh.md)

Source: [`packages/experimental/actor/src/index.ts`](../../packages/experimental/actor/src/index.ts)

<a id="actorunbound--emit"></a>

#### `actor/unbound` — emit

An exact Actor Agent left the live registry.

```ts cordis-catalog
/**
 * An exact Actor Agent left the live registry.
 * @param payload - exact Agent and stable Actor identity that left.
 * @mode emit
 */
'actor/unbound'(payload: { agent: Agent; actorId: ActorDescriptor['id'] }): void
```

Types: [Agent](core.zh.md)

Source: [`packages/experimental/actor/src/index.ts`](../../packages/experimental/actor/src/index.ts)
<!-- END GENERATED cordis-surface -->
