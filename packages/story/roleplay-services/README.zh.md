---
description: "独立剧情应用与 Harness 执行的 Cordis 装配。"
kind: "package-reference"
---

# @deepseek-ai/dsh-roleplay-services

[English](README.md) | 中文

## 概述

记忆整理使用持久化后台队列和独立 Harness 会话，前台入队后即可返回。仅在前台空闲且历史、个人记忆校验仍匹配时接入结果。失败、恢复与审核语义见[后台记忆](../../../.agents/notes/implemented/feature/2026-09-13-background-memory-queue.zh.md)。memoryQueueIntervalMs 默认 1000 毫秒，后台模型调用仍进入原生用量统计。

本插件通过 SQLite 和 Harness Actor 执行器装配独立扮演应用，分别提供故事书、实例、人物、认知、世界、查询、历史、导出包、素材提取、通知和运行能力。应用代码只接收显式接口，不接收 Cordis Context。

`consolidationThreshold` 控制演员入队阈值与每批来源数，零表示禁用。Web 配置选择 16；入队不等待模型完成，仍保留个人审核策略。

`directorConsolidationThreshold` 控制导演在调度与反馈结束后的整理阈值，零表示禁用，Web 配置选择 16。尚有讨论或待结算行动时推迟导演任务。

`consolidationBatchLimit` 限制每次触发的批次数，默认 1，Web 配置选择 2。讨论收尾在不同入口间共用同一人物、讨论和历史世代的持久批次额度，优先整理本次交流及关联反馈，再处理积压。排除已派发与已处理来源，剩余原文仍可读取。

`roleplayConfiguration` 记录复制后的风格覆盖与场景指导。`roleplayDiscussions` 拥有讨论命令；`roleplayDiscussionRuntime` 通过角色执行器推进发言权，并受 `discussionTurnLimit` 限制。`roleplayPlay` 提供过滤后的游玩与历史条目，`queryPageLimit` 限制游玩和作者分页。`roleplayRequests` 是读取真实历史请求的 Harness 适配器。

`roleplayDirector` 协调导演准备、有预算的工具命令、演员回应和讨论推进。`roleplayDirectorViews` 提供共用预览渲染器，`directorCommandLimit` 限制准备阶段操作数。`reactiveDirectorLimit` 限制单个角色回应后追加的导演选择次数；零表示禁用，Web 配置选择一次。导演与演员适配器共享技术会话生命周期代码，但使用不同的会话身份、规则和工具。恢复同时捕获并取消两类执行。`roleplayTransfer` 导出固定剧情修订及完整 Harness 日志，导入时创建独立实例；导入日志保留为证据，不成为运行会话。

`roleplayAuthor` 解析作者配置和原版本名称；`roleplayPlanning` 拥有大纲编辑及建议审阅。实例设置由演员与导演上下文共用的解析函数生效。`roleplayPlayer` 拥有代演与世界干预。`roleplayChanges` 按 `notificationIntervalMs` 从持久通知队列发送仅含修订坐标的通知；消费失败保留待发送工作，不重放剧情。

`roleplayExecutionHistory` 先校验实例、人物和修订，再委派 Harness 请求读取器。没有响应证据的请求保持已准备状态。`roleplayBooks` 发布未修改的内置上下文规则时采用独立工具指导；自定义指令保持原样。

`roleplayCreation` 在故事文档之外保存按修订检查的创作默认值和逐书任务设置。creator 入口将工具绑定到专用原生 Session 和一本草稿；本地工具要求明确选择且不可改变的目录，并保留原生权限检查。`roleplayRecovery` 支持同实例玩家要求重写和实例移除，保留历史提交并隔离迟到执行。参见[创作恢复决策](../../../.agents/notes/implemented/feature/2026-09-08-independent-authoring-recovery.zh.md)。

## 目录

- [开发契约](#development-contract)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="development-contract"></a>
## 开发契约

通过 dsh 配置挂载，并提供 Agent Registry、Session 存储、Session 持久化及 LLM 服务。配置必须指定绝对路径 `databasePath`、SQLite 的 `journalMode` 与 `busyTimeoutMs`、模型的 `provider` 与 `model`、`characterLimits`、`recallCharacterLimit` 、`maxContextUpdateUnits`、`notificationIntervalMs`、`directorCommandLimit`、`discussionTurnLimit` 及 `queryPageLimit`。`recallCharacterLimit` 与 `queryPageLimit` 仅限制显式工具返回；演员和导演的自动上下文不设配置的字符或历史条数上限。路径和基础设定不会从其他运行故事推断。独立应用应选择新数据库；当前产品的旧 Story 文件不会被转换。

`roleplayBooks` 拥有草稿和不可变版本。`roleplayInstances.createStory({ templateVersionId, commandId })` 实例化指定版本；`restart` 使用来源实例的原版本。创建或编辑剧情不需要启动 Agent。`roleplayPeople`、`roleplayCognition` 与 `roleplayWorld` 保留各自的命令权限。调用方构造宿主身份，并在重试间保留命令 ID。

`roleplayRuntime` 调用 Harness 执行器，其会话同时按实例和人物隔离。工具在剧情提交完成后才返回接受；执行日志记录冻结的视角、提交回执和诊断。释放时先等待运行取消收敛，再释放执行会话并关闭 SQLite。注册的应用能力随 Cordis 作用域一同移除。

`roleplayViews` 提供视角查询。`roleplayHistory` 提供回放、回执、检查点和补偿式恢复。`roleplayArchives` 与 `roleplayExtraction` 保持导入和作者素材选择为显式操作。`roleplayDeliveries` 为传输消费者保留待发送通知；消费通知不会再次执行剧情。

`roleplayRecovery` 协调 Harness 历史读取、检查点坐标采集、补偿式恢复与执行取消。真实 HTTP 测试覆盖创建检查点、恢复及保留旧日志的同一技术 Session 重发。

`roleplayRetention` 与 `roleplayRetentionViews` 在剧情事务存储上提供玩家审核及限定视角的原文回查。演员 Harness 通过宿主绑定的回调开放 `narrative_recall`，模型参数不能选择实例或所有者。导演命令支持 `recall` 与 `context-update`。工具结果保留在执行证据中，摘要与批准记录归剧情历史。隔离的真实 Loader/HTTP 测试覆盖不创建新演员的玩家审核、冷启动重载、实际模型工具原文回查、导入重建及同 Session 恢复。

<a id="model-experience"></a>
## 模型体验

### 执行请求

#### 模型看到的内容

执行器为当前工具事务使用共享 `npc_commit_turn` 格式与绑定版本的视角，此前技术对话保留在执行历史中。导入实例开启独立执行会话。

#### Token 影响

普通表演、私有整理和回忆消耗提供方 token，并计入原生用量。失败或中断响应可能缺少计时或用量样本，缺失值不等于零。本装配不保证总输入或输出减少。

#### KV Cache effect

每个角色回合开启请求序列，投影历史记录在请求头中。前缀复用取决于选定配方与提供方，不保证固定缓存收益或延迟改善。

## 已知限制与延期工作

[玩家讨论反馈装配](tests/player-discussion-feedback.real.spec.ts) 使用发布的演员／导演工具、受控响应和 SQLite。在显式均衡策略下，验证角色尝试结算后保留下一玩家席位，拒绝自动扮演该玩家角色且不发起模型调用，并在存档导入后保留等待状态。它覆盖执行与持久化，不代表原生模型质量或浏览器交互覆盖。

[经历修订探针](tests/episode-revision-performance.e2e.ts) 通过受控工具提交预置一条未决角色经历，再投递明确答复，运行一次原生普通角色回合。对于这个问题已全部回答的夹具，要求同一记忆产生修订、详情更新且不再保存未决问题。断言前将原记忆、修订记忆、按用途归属的原生用量及存档保存到 `.artifacts/episode-revision`。预置用量保留在存档中，但不计入报告中的原生回合。与其他原生探针一样，它需要最新构建和提供方凭据。文字保真及实际回忆使用须审阅存档，结构通过本身不能证明这两点。自动生效仅限隔离夹具。

<a id="known-limitations-and-deferred-work"></a>

- 默认组合使用独立产品，并接入可选实时执行诊断、大纲审阅和模型设置。无密钥浏览器验收通过。下文记录了隔离的真实模型测量，扮演质量、信息隔离与性能仍需更广泛验收。结构化高级字段使用 JSON 编辑器。

独立版[讨论对照入口](tests/discussion-performance.e2e.ts)使用神器争执、安静承诺、传闻反证与初识涨潮场景，对照积极性调度和均衡调度。评测角色允许发言、行动、反思、记忆、管理目标与记录后续意图；导出的配置和故事书哈希保留这些授权，供对照核验。它使用隔离实例，保存发布配置、请求存档、事件结果、记忆与原生用量，供人工评审。报告在后续事件引入前的修订分界保存 initialMemories，并保留最终记忆；null 表示初始阶段未到达该分界，不表示角色没有记忆。构建后从仓库根目录运行 `pnpm exec vitest run --config vitest.e2e.config.ts packages/story/roleplay-services/tests/discussion-performance.e2e.ts`。缺少 `DEEPSEEK_API_KEY` 时跳过；场景解析及跳过结果不证明提供方或扮演质量。`DSH_ROLEPLAY_EVAL_MODEL` 选择模型，`DSH_ROLEPLAY_EVAL_REASONING_EFFORT` 选择推理强度（默认 `low`），`DSH_ROLEPLAY_EVAL_TIMEOUT_MS` 控制单场执行时限。初始讨论须经至多六次导演反馈结束，再发送后续场景指令；报告记录修订分界并要求后续演员回应。A2、A5 和 A7 还记录每名演员首次后续执行的实际上下文中呈现的新世界观察，不用其他角色的行为代替；缺少投递会使场景失败。这些结构检查不评价回应质量，也不证明观察确实说明了新时间或支持信念修订。A5 对照有来源的告示和后续亲眼观察；评审检查演员能否保留转述来源、重新判断可信度并调整选择，而不编造解释。A7 为穿越者、幼童与原生角色配置不同的个人常识，检查首次请求包含本人的设定知识且不包含他人的完整私有原文。这不能检测所有转述泄露，也不证明长期成长。最终剧情记录在同一冻结修订上分页收集，包括首百条之后的内容。分页失败时保留首页并记录 playPaginationError，继续保存存档，同时使评测失败。讨论统计使用持久化的已接受公开回合，不把台词段落或私有准备算成席位。统计按角色列出席位数、发言／跳过／结束决定、连续席位和发言顺序；这些是描述指标，不自动判定公平性或叙事质量。结果保存在 `.artifacts/independent-discussion`，未评审质量字段保持 null。`usageByPurpose` 根据已记录执行上下文与原生计量，区分演员回合（含准备）、导演回合、整理及未分类调用；重复会话副本只计一次，缺失计时样本保持缺失。报告先于存档和用量采集保存；任一采集失败时保留其他成功证据，并标记采集不完整。采集失败使评测失败，不显示为零用量或完整导出。

独立的[固定经历记忆验证](tests/consolidation-performance.e2e.ts)预置本人观察和另一角色的私有线索，通过原生演员运行时完成整理与后续选择。它保存后续场景前的记忆，检查按完整引用回忆和归属隔离，并按执行用途区分原生用量。产物含失败记录，保存在 `.artifacts/independent-memory`。构建和提供方凭据要求与讨论对照相同。结构检查通过不证明理解简洁、主动调用工具或记忆对后续选择的因果影响。 验证要求后续场景前已有有效记忆，并报告仍未被摘要代表的来源。摘要可来自普通回合或私有整理。该小规模历史在证据预算内，未被代表且未归档的原文必须仍出现在后续请求中；只有已覆盖原文预期消失。混合请求不能证明记忆独立产生的因果作用。报告区分已处理摘要覆盖与佐证引用；佐证事件原文若未另行处理，仍应参与后续上下文。报告记录 historySourceIds、supportingSourceIds 与 privateConsolidationRequests；已覆盖的经历无需重复私有整理。完整引用回忆、归属隔离和后续证据排除已覆盖原文的检查仍然必须通过。 DSH_ROLEPLAY_EVAL_HISTORY_FORMAT 选择 narrated（默认，保留历史四条观察）或 attributed。后者用 MockAdapter 经普通演员运行时预置店主发言，再单独投递学徒承诺和三条观察；五条来源采用对应整理阈值，报告保留格式及来源编号。这是不同的输入表示，不是严格单变量质量对照。按用途和逐次执行用量从 initialRevision 开始，排除受控预置；全实例用量和存档仍保留预置过程。

[感知反馈组合测试](tests/perception-feedback.real.spec.ts) 使用预置模型输出，经已发布配置执行隐蔽调查、共同与私人结果投递、角色回应、指令重试及存档导入。测试检查实际提供方请求的可见性与重复投递，以及待处理尝试的持久结算。这是传输和运行时证据，不是实际模型判断能力的证据。

[真实感知评测](tests/perception-performance.e2e.ts) 通过预置演员提交一个隐蔽尝试，再由所选原生模型执行导演结算与角色回应。检查实际请求中的新观察、尝试结算及旁观者完整上下文中的私人编号隔离，包含同伴动作通道。为隔离感知，本测试关闭整理并记录运行限制与模型设置。报告与完整原生用量保留在 .artifacts/independent-perception。按用途成本排除预置过程，实例总用量仍包含准备。语义重复、虚构细节和人物口吻须另行评审。

A7-decade-growth 将间隔学习序列延伸到十年后，儿童届时十八岁。人物描述把初始年龄和初次抵达明确为故事起点，不永久宣称角色八岁或刚刚抵达。导演须投递后续时间与年龄，不补写受教育、职业或中间冒险经历。存档保留各阶段请求和记忆供评审；仅有设定的时间跳跃，不算学习或符合年龄的行为证据。

<a id="dev-note"></a>

固定经历夹具还接受 `DSH_ROLEPLAY_EVAL_HISTORY_FORMAT=interrupted`：预置演员伸手接住材料的尝试，再明确结算为没接住、材料自行落水。五条来源保留尝试与结果的区别，供回忆和整理使用。受控预置不衡量主动探索，真实输出仍需评审归属和压缩质量。

### 开发备注

[原生邀请测试](tests/invitation-performance.e2e.ts) 给演员一个与两名在场同伴商议的动机，不指定工具调用。记录普通回应与待处理邀请，再由测试作为玩家明确接受申请。断言要求接受前没有讨论，接受后参与者正确。本测试不运行后续交流，也不证明普通场景中主动邀请的频率；仅说台词的失败回应保存在 `.artifacts/independent-invitation`。

[条件性记忆测试](tests/conditional-memory.e2e.ts) 在两个隔离实例中预置相同的有效保管承诺，然后分别提供亲见归还和到期仍未归还的情况。真实演员自行选择下一步行为，不强制更新记忆；关闭阈值整理，以区分理解与改写旧记忆。报告在 `.artifacts/conditional-memory` 保留预置来源、请求、动作、摘要和准备之后的原生用量。执行检查通过不代表选择正确：仍需审阅兜底条件是否适用，并区分尝试与已结算结果。本测试不验证自行生成摘要、长期修订或完整群组讨论。

参阅[独立剧情提案](../../../.agents/notes/implemented/architecture/2026-09-07-independent-narrative-instances.zh.md)。完成产品切换期间保留既有数据，并避免双写。

评测报告另含 executionUsage：按实际执行列出原生总量、所属角色、执行编号、冻结修订及指定整理来源数，以区分演员和导演的具体高成本批次，并对重复会话去重。请求前的用量保留为未分类，不补猜缺失计时。这是评测证据，不增加模型调用或产品统计接口。

讨论关闭时，剩余讨论来源可以使用不足一批的整理；若剩下的全是无关旧见闻，须达到 consolidationThreshold 才使用剩余批次。延后的来源仍作为原文可用，不修改已保存的批次预算和激活策略。

A7-spaced-tide 使用同一批穿越者、儿童与原住民，依次经历三天后的相似观察、灯被当面罩住而水位不涨的反例，以及两个月后另一座码头。growthPlan 记录全部计划阶段；growthPhases 记录已进入阶段的起止修订、执行完成情况、前后个人记忆，以及各角色首次回应的修订与新感知。失败或未进入阶段不能算学习证据。每阶段必须先投递新感知再回应，并保留初始知识隔离检查。此测试不修改年龄、不授予世界知识，也不能证明童年到成年成长，仍需真实执行与质量评审。

[精确回忆测试](tests/recall-performance.e2e.ts) 通过模拟演员提交预置经历，后续模型实际请求只保留概述，不包含操作步骤。无需凭据的模拟读取验证原生工具先读后行动链路，并拒绝读取他人私有引用。真实模型变体需要提供方凭据，检查演员是否在提交前读取详情，不预先指定其工具调用。报告区分模拟与真实模式，注明预置记忆来源，按用途和逐次执行统计时排除预置成本；完整归档用量仍包含准备过程。两个变体均已通过；记录的真实样本主动选择关键词回忆，并按正确顺序提交尝试，耗时 4,677 毫秒、输出 744 token。这不验证角色自行总结、世界结果成功结算或长期成长。产物保存在 `.artifacts/independent-recall`。

将 `DSH_ROLEPLAY_EVAL_RESUME_REPORT` 指向采集完整的 A7 报告，可在新建的隔离导入实例中续跑一个未完成阶段。辅助程序核验采集状态、预置场景、模型、设置、阶段边界与新观察，再保留已完成阶段。原生恢复回到记录边界，并将保留记忆与历史回放核对。中断阶段从本阶段开头重跑，已完成阶段不重复。报告记录父报告来源及全部阶段是否完成。按用途和逐次执行统计只计算新运行，存档总量包含导入历史。失败分支保留为证据，不计作当前学习。完成只验证投递与执行，不代表记忆准确或叙事质量通过。

`DSH_ROLEPLAY_EVAL_ACTOR_LENGTH` 可选地为评测角色设置已有的 lengthPreference 字段，留空或不设置时沿用预置默认值。报告保留完整偏好与发布文档哈希，并要求各角色的普通请求实际包含该偏好。此评测选项不修改产品已保存配置。

`DSH_ROLEPLAY_EVAL_MEMORY_POLICY` 为全部预置演员和导演选择 `automatic` 或 `review`。新评测默认自动生效，以便与历史样本比较；产品仍默认审核。续跑未显式设置时继承报告策略，与恢复后的所有者策略不一致时拒绝运行。报告同时保留策略及初始、最终记忆记录。审核场景没有玩家批准操作，要求所有提案仍待审核且没有生效摘要。该模式成功说明保留原文时的连续性，不证明摘要有效压缩或依靠摘要完成回忆。

[待结算动作探针](tests/pending-attempt-performance.e2e.ts) 通过模拟角色回合固定一个未完成动作，在自动私有整理前切换为原生提供方。它检查原文旁的待结算状态、记忆保存及未变更的待结算动作。语义审阅检查保存的摘要和详情，不以结构断言代替。`.artifacts/pending-attempt` 下的记录将模拟种子的用量保留在角色用途分类中，整理用途的用量来自原生模型。自动启用记忆仅用于测试。
