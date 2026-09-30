# Agent Note: Storyweaver Director 职责边界和 Plot Ledger

Status: implemented

[English](2026-08-29-storyweaver-director-ledger.md) | 中文

## 问题

Storyweaver 已经拆分 Story、场景、控制和 Actor Session，但面向场景的模型仍携带宽泛的世界 Director 提示。即使 Actor 子系统已经把 `npc_speak` 与 `npc_act` 定义为 NPC 行为的持久来源，该提示仍可能替持久角色编写对白和自主行动。仅靠提示约定无法阻止 Director 或 Host 调用方绕过 Actor 工具。

Story 聚合也缺少持久编排状态。Director 无法针对准确修订读取并替换当前态势、既定事实集、未决线索集或 Actor 专属上下文，因此并发 Actor 事件与规划 pass 可能静默互相覆盖。长期故事弧与伏笔只存在于临时模型上下文中，没有玩家可见的所有权、锁定、审核策略，也无法用证据关联真实发生的事件。

仅有持久化也没有闭合运行时链路。系统不会把 Story Bible 放进 Director 请求，不会根据 Brief 创建信息隔离的 Actor Agent，也不会把已接受 Actor 行为投影回公开场景。若让 Director 自行即兴完成这座桥，就会重新引入 Ledger 原本要阻止的权限越界。

## 决策

每个 Story 在版本 3 Story domain 中拥有一份带修订号的 Plot Ledger 和一份带修订号的 Director Outline。Ledger 保存当前态势、既定事实、未决线索、等待下一次规划 pass 的 NPC 事件，以及最新结构化 Director Brief。Outline 保存非世界事实的长期意图、主题、硬约束、故事弧、候选节拍、伏笔、悬念与叙事时钟。domain 会拒绝更早记录，不提供迁移或兼容处理。

`StoryRegistry.commitDirectorBrief()` 接受活跃控制 Session 或当前场景 Session。其严格输入包含预期 Ledger 修订、当前场景、态势、事实、线索，以及各 Actor 的可感知信息和不确定项。未知字段会解析失败，重复或非活跃 Actor 会校验失败，过期预期修订不能覆盖更新状态。已提交 Brief 会记录创作 Session、来源修订、新修订及其消费的待处理 NPC 事件。Brief 可针对最新 Ledger 修订替换尚未开始的运行，包括其完整 Actor 名单；首次调度尝试会关闭该修正窗口，此后调用方必须恢复持久运行。

Director Brief 只提供上下文。它没有角色对白、思想、决定、目标或行动字段。Storyweaver 提示也声明同一负面权限规则：Director prose 不会创建持久角色行为；没有已接受 NPC 事件时，角色保持沉默且后续行为未决。

Ledger 还拥有一个采用准确修订控制的 Director Run 检查点。Run 状态机为 `brief_committed -> dispatching -> completed | awaiting_retry`，另有明确的 `paused` 与终局 `cancelled` 控制。单 Actor 状态为 `pending | running | completed | failed | skipped | cancelled`。每次 begin 都会签发唯一 attempt id，增加该 Actor 的 generation 与尝试次数，并记录 Actor Session 及尝试前事件序号下界。只有相同 ownership tuple 的 begin 重放才幂等；只有相同 attempt、generation、结果与已接受引用的结算重放才幂等，其余过期 ownership 均失败。普通恢复不会再次调度已完成或已跳过 Actor，只选择待处理、失败或已取消 Actor。唯一的窄例外是持久 active discussion：当前准确拥有发言权的已完成 Actor 可以在 Run 当前修订上重新入队，保留早先事件引用后再开始一个新的受控 attempt。

每个 Outline 条目都有全局唯一稳定 id、玩家锁与 player/director/system 来源。玩家替换使用乐观修订检查，并可选择让 Director 自动更新未锁定内容，或审核每次 Director patch。审核模式会保存待处理建议，直到玩家接受或拒绝。Director 不能修改或删除锁定内容。Brief 提交绝不会更新 Outline 修订：Outline 继续作为长期计划，每份 Brief 则只为一次 Actor 调度提供上下文。已解决节拍必须携带 Actor 或世界事件引用；已埋设或已回收伏笔必须携带埋设与回收引用，因此计划状态不能静默变成权威历史。

## 运行时编排与信息边界

`@deepseek-ai/dsh-experimental-tool-director` 会用可缓存的前置 Story 上下文、持久 Session 历史和带日志来源的高频状态尾部构建每个 Director 模型请求。前置块包含完整 Story Bible、开场文本、已批准记忆和私有、非世界事实 Outline；World、Plot Ledger、讨论与创作非 system 指令保留在历史之后。故事书缺失会明确显示，文件存在但无效会使 step 失败。Director 只获得提交 Brief、更新 Outline 和调度 Actor 的严格工具，不存在替 NPC 写对白或行动的工具。其固定策略要求 Director 在首份 Brief 前初始化空白的修订 0 Outline，并在长期计划发生实质变化时更新它。

每份新 Brief 在 Actor 调度前都必须拥有一个 Director 旁白 World Event；普通玩家回合还会要求 Director 叙述客观发展，即使不需要 Actor 回应。若 Director 以可见 prose 结束这类回合却没有权威旁白，Host 会提供有界纠正续写；恢复控制和由玩家暂停的讨论不会重复旁白。玩家可见旁白以规范 Markdown 保存：Host 只把旧式裸 `<p>` 与 `<br>` 片段转换成 Markdown 换行，然后拒绝任何仍然存在的 HTML 或 XML 构造。浏览器会对历史旁白执行同一窄转换，再通过共享的不可信 Markdown 路径渲染；原始 HTML、相对链接与不安全协议仍不可执行。该呈现格式不会扩大 Director 权限：旁白可以确立客观环境与转场文本，但不能确立持久角色的对白、私密心理或自愿决定。

持久群组讨论会先为每个参与者提供一个私有准备席位。每个 Actor 只声明自己的立场与积极度，不产生公开行为，也不能读取其他参与者的声明。全部声明完成后，Host 才选择首位发言者，随后通过明确交棒、积极度、排队的玩家请求与发言次数公平性推进公开回合。准备阶段不消耗公开轮次预算；公开发言仍是带来源的 Actor 行为。

提交 Brief 会为其中命名的每个故事书 Actor 建立新的或恢复既有的私有 Session。每个 Actor 挂载独立 `storyweaver-actor` preset，覆盖 Director persona，同时保留按能力筛选的 NPC policy。调度只发送该 Actor 的公开 persona、自己的故事书状态与私有上下文，以及 Brief 中对应的可感知信息和不确定项；绝不发送世界真相、Outline、其他 Actor 上下文或期望回应。

调度会等待这些 Actor 回合。Host 会把请求取消与 Run 自有 `AbortController` 合并，传给模型流，并对受影响的在线 Actor 调用 `Agent.cancel()`。结算先验证准确 attempt id 与 generation，再持久化结果和已接受事件引用，最后才投影已接受事件。暂停、Run 取消、Actor 跳过或 Actor 取消都会在中止执行前关闭 ownership，因此迟到响应不能进入 Ledger 或公开场景。已接受 NPC 行为继续以 Actor Session 和 Plot Ledger 为权威来源，随后携带原 Actor Session 与事件引用，以 `story/npc-event-projected` 进入在线场景。该投影只是呈现数据，不是新的 Director 创作。额度及其他分类失败会保留检查点；后续恢复或单 Actor 重试只运行未完成 Actor，并保留已接受引用。

浏览器会在玩家位置操作区旁同时显示完整 Outline 与 Director Run 控制台，新建空场景也不例外。控制台展示 Brief、准确 Run 修订与状态、Actor 队列、attempt 次数与 generation、失败和已接受事件引用，并提供恢复、重试、暂停、取消、跳过与中止 Actor 操作。视口级固定 Outline 面板会分别显示 Outline 修订、最新 Brief 修订和运行状态。结构化工作台通过带来源标记和玩家锁的卡片编辑总纲与规则、故事弧、可排序 Beats 及其依赖、伏笔、谜团和时钟。状态需要证据的条目会继续显示事件引用。修订历史与 Director 提案队列是只读投影，提案具有明确的接受和拒绝操作。高级 JSON 只包含玩家可写字段；服务端持有的来源、修订历史与建议内部字段绝不会进入该草稿。准确修订保存会保留过期草稿，并要求读取最新修订后才能再次写入。

任意持久 `actor/*` 事件也会推进对应 Actor 的 Story Session 注册上的单调状态修订。Story follow frame 只暴露这个失效信号，绝不包含私有状态内容。修订改变后，角色面板会自动重新读取独立的可信上帝视角投影；私有思想、情绪、记忆与目标仍不会进入公开 Story 投影或 Plot Ledger。

## NPC 事件来源

Story 注册表会监听已提交的 Actor Session 事件。只有当同一 Agent step 中先出现未匹配 `npc_speak` 工具调用时，它才接纳 Actor 来源 `actor/expression`；Actor 来源 `actor/action-intent` 同样必须匹配 `npc_act` 调用。该 Actor 还必须在匹配的持久 attempt 下运行，使用该 attempt 的 Session，且事件序号大于记录的下界。每个 Ledger 条目都会记录 Actor Session id、工具调用事件序号与 Actor 事件序号。玩家来源的代演不适用该 NPC 来源规则。

Story invariant 会在 append 前检查同一关系，并拒绝绕过 NPC 工具的 Story 自有 Actor 行为。提交后的注册表 observer 也会独立拒绝缺少匹配来源的事件，因此 Ledger 投影不依赖 diagnostics 是否启用。Actor Session 日志仍是权威行为历史；Plot Ledger 只保留待处理事件和最新 Brief 的来源事件。

Story Controller 会在 `StoryView` 中投影 Ledger，并通过 Story Remote 与 `IStories` 暴露 `commitDirectorBrief` 以及准确修订的 Run 恢复、单 Actor 重试、暂停、取消、跳过和 Actor 取消操作。它把执行委托给 Host `DirectorRunExecutor`，将 ownership、修订和严格字段失败映射为明确 Remote 失败，同时不暴露物理路径或 Actor 私有提示。

## 备选方案

**让 Director 编写完整场景，再要求 Actor 只维护私有状态。** 这种方案保留流畅 prose，但 Director 仍会选择每条公开对白和行动，使角色自主性只剩表面。它也无法通过事件来源判断持久角色是否真的行动。

**接受任意 ActorService 说话或行动事件。** Actor 服务是 domain provider，可信玩家代演也会直接调用它。要求匹配 NPC 工具调用可以区分模型自主行为与直接 Host 调用，同时不改变玩家来源记录。

**只在控制 Session 中存储 Plot Ledger。** Session 日志能保留时间顺序，却无法提供浏览器基线、乐观修订检查或跨场景所需的 Story 级当前记录。Story domain 拥有当前编排状态，Actor Session 则拥有行为历史。

**在每份 Director Brief 中加入对白和行动建议。** 建议仍会让 Director 以不同字段名选择持久角色行为。因此每个 Actor 的上下文止于可感知信息和不确定项。

**把完整 Story Bible 交给每个 Actor，再要求它忽略私密事实。** 这会把信息隔离降级成提示约定。dispatcher 会构造单一 Actor 专属快照，绝不把世界真相或 Outline 放入该 Agent 请求。

**把长期计划作为 prose 存在 Director Session。** Prose 历史可供一个模型阅读，却无法支持玩家锁、乐观编辑、审核队列、分类投影或事件证据要求。结构化 Outline 在保持非世界事实的同时，使这些所有权规则可强制执行。

**把 Director 输出作为经过清理的原始 HTML 渲染。** 这会保留模型生成的标签，但也扩大可接受语言，并在已有不可信 Markdown 渲染器之外新增一条清理边界。规范 Markdown 保留段落和强调语义，而 Host 会在持久化前拒绝含糊标记。

**把旁白保持为纯文本并只依赖提示约束。** 提示不能可靠阻止字面量 `<p>` 片段，纯文本也会丢失有意的分段与强调结构。Host 规范化让保存格式可预测，同时保留安全的文学排版。

## 测试

真实 AgentLoop 编排测试会读取“月影账簿”Story Bible，通过 Director 工具提交 Brief，建立 Actor Session，调度该 Actor，执行 `npc_speak` 与 `npc_yield`，并观察带来源的 Ledger 事件和公开场景投影。捕获到的 Actor 请求包含自己的私有知识，却不包含 Director 专属世界真相或 Outline。运行时测试还会取消已经运行的模型流，验证 attempt 以 cancelled 收敛且不产生投影；重试测试会保留已接受事件，不重复 Brief 或场景事件。注册表测试覆盖准确 Run 修订、attempt generation、幂等结算、过期 ownership 拒绝、迟到事件拒绝、暂停、恢复、Actor 跳过与取消、终局 Run 取消、严格字段、无效角色、持久化和 Brief 修正边界。Controller 测试覆盖全部六项 Remote 委托与 executor 缺失失败。浏览器组件测试覆盖准确修订控制台操作、队列详情、场景投影、角色状态自动重新读取、玩家编辑、建议审核，以及区分 Outline 和 Brief 状态。

## 结果

Storyweaver 拥有世界方向与角色自主性之间的持久交接点。Director 可以构建场景和维护连续性而不成为持久角色；已接受 NPC 对白与行动可以追溯到准确 Actor 工具事件。乐观修订会保留规划 pass 之间到达的 Actor 输入。

运行时现在会创建或恢复已提交 Brief 命名的 Actor Agent，并在 Director 调度或玩家恢复准确检查点时唤醒它们。玩家可以停止或缩小执行范围而不删除已完成证据，额度中断也不再要求重放已完成 Actor。同步控制请求会保持打开，直到所选 Actor 结算或取消完成展开。后续 Story domain 扩展已经可以结算有来源的结果、应用有类型的共享世界 patch，并投递受众专属感知，同时不削弱来源、ownership 与信息隔离规则。独立定时唤醒与语义压缩仍是后续工作。

Director 旁白现在有唯一明确的保存和渲染契约。新旁白会保留 Markdown 段落与强调，已知旧式段落片段会被规范化，不支持的 HTML/XML 会在工具边界失败，而不是按字面显示或成为浏览器可执行标记。
