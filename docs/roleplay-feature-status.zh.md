# Storyweaver 角色扮演功能现状与回归保护清单

> 最后核对：2026-09-08
>
> 适用范围：`dsh-roleplay` 的 Storyweaver Web profile、Story 领域、Director/Actor 编排与角色扮演 Client UI。

> 注意：本清单最初主要依据当前工作区整理，未完整覆盖 `AIAgentRolePlay` 的历史功能。修改或引用状态前，必须先阅读[000 — Storyweaver 角色扮演项目交接基线](000-storyweaver-roleplay-handoff.zh.md)，并重新核对 MVP、Git 基线及完整前后端链路。

## 群组讨论、感知与记忆专项

专项整理日期：2026-09-12；文档与计划整理后，按完整实现目标继续增量实施与验收。工作区已有增量实现及评测记录，后续先核验再补缺，不把计划条目视为全部尚未实现。需求编号、保护边界和剩余工作的唯一计划入口是[群组讨论、感知与记忆优化计划](../.agents/notes/implemented/feature/2026-09-12-discussion-perception-memory.zh.md)，其中区分源码基线、回归保护、建议策略、分阶段实施与验收。现有已实现决策继续有效，提案不替代它们。

本专项针对独立版 `roleplay-core → roleplay-services → roleplay-controller → ui-narrative`，模型执行由 `experimental/actor` 承接。下文旧 StoryController、Brief 和旧工具组合仅作为历史参照；不得将它们的字段、上限和运行顺序直接套用到独立版。

| 专项能力 | 当前证据与剩余范围 |
|---|---|
| 共同感知、逐角色补充／替换、隐蔽行为和来源顺序。 | 领域及工具协议回归覆盖投递和隔离；实际模型的文学旁白与感知一致性仍需评审。 |
| 演员主动申请、申请处理、可选均衡调度、公开预算、私有准备、交棒及导演收束。 | 领域、实际执行器组合和现有浏览器讨论流程通过。真实 A1 篇幅对照支持新配方采用灵活短贡献，既有篇幅偏好保留；调度默认未改，安静场景及跨题材质量继续验证。 |
| 行动尝试关联结果，有界导演反馈与角色回应。 | 待结果、取消和重试有领域覆盖；复杂玩家介入及长场景组合仍需整体验收。 |
| 相关简述、按需详情、演员节点整理、独立导演整理。 | Loader／SQLite／执行器组合验证讨论到记忆再到后续回忆，新增调用进入原生统计，存档往返保留记录。真实模型已主动按关键词读取详情；自行整理仍出现语义误读和冗长记录，不能视为质量验收完成。 |
| 自动／审核策略、玩家纠正、停用及原文恢复。 | 浏览器验证策略切换不误批准旧提案、不撤销有效记忆，纠正和停用保留历史。鉴于真实摘要仍有误读，新实例沿用替换前审核；显式自动策略继续可选，不改已有实例。 |
| 角色初始常识差异、信念及经历摘要修订。 | 初始知识隔离有领域覆盖；真实模型已完成重复观察、反例与两个月后陌生场景的分段学习验证。角色能保留经历并限制类比；新增三人物单回合口吻探针显示短问答和主动行动可并存，但随机措辞、重复动作及长期口吻同质化仍待验证，不等同于童年到青年的完整成长。 |

既有回归与真实模型记录统一见[专项计划的验证与剩余验收](../.agents/notes/implemented/feature/2026-09-12-discussion-perception-memory.zh.md#已执行验证与剩余验收)，此处不重复维护测试数量或样本次数。模型与浏览器评测按受影响范围开展；已有局部通过不能等同于全仓通过，也不能证明完整叙事质量。

源码核对与玩家反馈不能代替同模型、同场景的真实体验对照。先建立隔离基准，再分阶段修改；保留人物寻址、玩家控制、同实例回退、独立运行、已保存上下文配置和 dsh 原生统计等回归边界。具体需求编号、源码归属及验收场景以专项计划为准。

## 独立创作与功能恢复

上下文同步采用左右分区：本书共享内容 → 目标故事。五项模块紧凑对齐，勾选后批量原子同步，默认复制一次，可选择以后自动跟随。全文和编辑按需展开，书稿导入与新书初始配置收在“更多”。编辑页保留来源提示和统一管理入口。见[同步体验说明](../.agents/notes/implemented/feature/2026-09-11-context-sync-workspace.zh.md)。

独立版的自动上下文不设总字符或近期条数上限，仍按受众隔离并以有效摘要替代其覆盖的原文；显式回忆工具保留分页。回合底部与请求详情兼容 DSH 原生首 token 延迟和平均生成速率，存档保留计时；缺失样本显示“未记录”。见[上下文长度与原生计时](../.agents/notes/implemented/feature/2026-09-11-context-length-and-native-timing.zh.md)。

角色接收的言行携带发出者称呼与引用、发言对象和传递方式或动作人物目标，按发布及同次提交内的顺序呈现。回忆和置顶保留归属，耳语与私人意图保持隔离，历史姓名不随后来认知改写。角色可在交往需要时自然询问姓名。导演旁白仍与个人感知分开投递，仅强化一致性和过时指引的提示词。源码、真实执行请求与回归证据见[带人物归属的角色感知](../.agents/notes/implemented/feature/2026-09-11-attributed-character-perception.zh.md)。

默认上下文已恢复设定/规则的 system 与玩家要求/思维模式的 user 分工。已有错误默认配方通过修复与保存纠正；自定义文本与历史请求不回写。导演使用参考项目分析模式，推理语言明确约束每一步。人物回合按姓名合并动作与对白，思考和上下文在独立窗口按请求步骤阅读。侧栏直接提供故事书和实例删除。真实 DeepSeek V4 Flash 隔离测试观测到中文分析，但短句长度并非硬保证，证据与限制见[配方及回合阅读修复](../.agents/notes/implemented/bug-fix/2026-09-08-recipe-roles-and-turn-reading.zh.md)。

故事书编辑器按世界、角色、风格、上下文分区，书库管理与实例编辑分别进入。私有认知、初始记忆与目标、初始状态归属及可见范围均有表单入口。新实例常驻角色、状态、风格、上下文、模型与记忆工具。演员沉浸和导演简短思考模块进入新实例默认配方；已有缺失模块的实例通过显式恢复与保存启用，读取不改存储。书稿发布到实际模型请求的验证与限制见[编辑器与思维链修复](../.agents/notes/implemented/bug-fix/2026-09-08-storybook-editor-and-reasoning.zh.md)。

AI 创作模式是固定工作区。每个新任务创建独立故事书草稿，使用原生会话、工具展示、权限与请求历史；可选择本地素材目录，任务创建后目录固定。默认提示词与任务覆盖分开保存，支持开关、消息角色和预览。工具保存、审核发布与游玩实例分别执行，不启用旧 Story 写入器。

书库按故事书分组并提供逐书加号；实例按创建时间排序，存档导入实例也有分组与新实例入口。手工故事书表单保留高级配置，导出包保留资源。书稿、设定、上下文编排和未发送正文在刷新后保留。规则、工具指导和推理语言可独立编排；旧分组只通过显式拆分操作改变。来源编辑与待发送导演要求预览均接到实际应用接口。

移除书稿入口不会删除发布版本或现有实例；移除实例先使执行失效，再停止技术运行，历史保留。玩家要求重写在同一实例内追加恢复与新请求，原版本可以按修订读取。历史中的“最近删除”页面仍未实现，不能宣称已有可视化垃圾箱恢复功能。所有写入验收均使用临时测试数据，不向既有《月影账簿》提交测试要求。

验证依据见[独立创作恢复说明](../.agents/notes/implemented/feature/2026-09-08-independent-authoring-recovery.zh.md)及其浏览器和领域测试。全仓文档及 lint 门禁仍有工作区其他问题，不能将定向通过当作全仓通过。

## 动态人物与认知

游玩界面恢复了故事开场、已提交角色回合分组、回合旁原始请求检查、底部输入、人物抽屉和独立记忆审核面板。默认模型路由已与 base profile 对齐，执行失败保留实际原因。玩家要求已支持同实例内编辑重发并保留原版本历史。完整沉默回合历史及连续跨页加载仍使用已有诊断与有界分页，不宣称新旧交互完全等价；范围与验收见[游玩交互恢复说明](../.agents/notes/implemented/feature/2026-09-08-play-interface-recovery.zh.md)。

默认产品组合现已切换到独立剧情应用、专用 SQLite 和 `ui-narrative`，使用新的 `Storyweaver-independent-v1` 数据目录。故事书发布版本、实例和执行 Session 分别管理；旧目录不自动迁移。旧组合仅保留为不导出的回归测试夹具，下文涉及旧 StoryController、Actor 和 Director 工具的清单属于历史基线，不能作为新产品的依赖图。新实现入口与验证范围见[独立剧情架构说明](../.agents/notes/implemented/architecture/2026-09-07-independent-narrative-instances.zh.md)。

新浏览器链路已覆盖四种输入模式、人物与动态状态、个人风格、设定冲突、大纲锁定与提案、自动讨论、原始请求及回应、可选实时诊断、执行模型设置、素材收录和存档恢复。部分高级字段仍使用 JSON 编辑器；超长执行日志的实时诊断性能尚待测量。原真实模型评测器仍对应旧组合，不应据此声称新架构的表演指标已通过。

实例人物库、导演查找与创建、按需 Actor、个人认知原子提交、化名与易容线索、视角来源、玩家修订、模板收录及完整包与检查点已接入主链路。离线插件组合回放覆盖这些持久链路；5,000 名离场人物不进入当前场景名单。当前格式明确拒绝旧数据，不在读取时转换。实现与测试入口见[动态人物与个人认知](../.agents/notes/implemented/feature/2026-09-06-dynamic-characters-and-knowledge.zh.md)。

真实模型的姓名泄漏、无依据推断、配角重复创建、工具失败率、延迟与 token 指标尚未重新测量，表演质量保留人工验收。

## 文档目的

这是一份持续更新的产品契约，不是发布宣传稿。它用于回答四个问题：

1. 当前哪些角色扮演功能已经实现；
2. 哪些功能仍在完善，现阶段能做到什么；
3. 哪些功能尚未实现，不能从局部代码或 UI 文案中臆测为已有；
4. 修改代码时，哪些既有语义绝不能被旧 Harness 行为或局部实现覆盖。

仓库中的实现、领域测试和端到端测试仍是最终证据。本文件负责把分散在多个包中的产品语义汇总到一起。任何改变下列状态或行为的改动，都必须在同一变更中更新本文件。

## 状态定义

| 状态 | 含义 |
|---|---|
| ✅ 已实现 | 已存在完整代码路径，并有领域、API、Client 或组合测试保护；可作为后续改动的兼容边界。 |
| 🟡 完善中 | 主路径已可用，但仍有明确的体验、恢复、自动化或覆盖面缺口。不得回退已有主路径。 |
| ⏳ 未实现 | 只有设计、fixture、字段或预留接口；不能在 UI 或文档中宣称已经可用。 |
| 🚫 有意不提供 | 与角色扮演产品边界冲突的 Harness 能力，当前 profile 明确不挂载。 |

## 当前产品结论

Storyweaver 的 P0 角色扮演闭环与主要 P1 长线能力已经接通：玩家从故事书开始独立故事，Director 维护大纲和单轮 Brief，隔离的 Actor 自主说话或行动，世界通过显式结算形成事实；提示词编辑、长期记忆、导演自动讨论、上下文配方、故事包、角色状态、大纲工作台、创造模式和 Run 恢复控制也已有产品入口。

当前主要缺口不在“是否存在角色扮演闭环”，而在独立调度、删除恢复、语义记忆压缩、离线 Actor 全量投影、自动测试数据播种和正式发布包装。

## 一、已实现功能

### 1. 角色扮演专用 Web 产品层

状态：✅ 已实现

- Storyweaver 使用独立 profile 叠加在通用 Web 应用之后，不复制 Session、流式传输、回放、持久化、附件、设置和模型选择基础。
- Workspace、代码执行、任意文件引用、审批、Skills、Subagent、Job、通用 Goal/Plan、Trajectory、插件管理等 coding 表层在普通 Director/Actor 会话中禁用。创造模式使用独立 Creator preset 恢复本地文件、搜索和平台 Shell 工具，并展示自己的工具状态与本地权限选择；这些工具不会注册到 Director/Actor。
- 浏览器以 Story 和不透明 Session id 导航，不显示托管目录或 checkout 路径。
- 浅色米白纸张方案与深色茄紫夜间方案成对保留；主题选择由通用外观设置管理。
- 角色扮演页面保留响应式布局、键盘页签、Escape 关闭、焦点归还与可调整工作区尺寸。

关键入口：

- [`packages/experimental/roleplay-web-profile/cordis.patch.yml`](../packages/experimental/roleplay-web-profile/cordis.patch.yml)
- [`packages/experimental/roleplay-web-profile/README.zh.md`](../packages/experimental/roleplay-web-profile/README.zh.md)
- [`packages/experimental/client-ui-roleplay/src/client/RoleplayChrome.tsx`](../packages/experimental/client-ui-roleplay/src/client/RoleplayChrome.tsx)
- [`packages/experimental/client-ui-roleplay/tests/roleplay-chrome.client.spec.tsx`](../packages/experimental/client-ui-roleplay/tests/roleplay-chrome.client.spec.tsx)

### 2. Story 聚合、故事书分组与独立运行

状态：✅ 已实现

- `StoryId` 是一次独立故事运行的聚合身份；Story 拥有自己的世界、记忆、大纲、Plot Ledger、讨论、Actor 和 Session。
- `templateId` 是基础故事书身份。多个运行可以共享同一本基础故事书，但不能共享运行态。
- 故事书行内的加号调用 `createFromTemplate`：只复制玩家创作的 `world/` 和 `assets/` 基线，并签发全新 StoryId；不会继承旧场景历史、Actor Session、世界修订、记忆、Ledger、大纲或讨论。
- 顶层“新故事”创建新的空白 Story；故事书内部加号从该故事书的基础设定开始新的独立运行。两个加号的作用域不同。
- 私有 Actor Session 不出现在普通场景树中。
- Storyweaver Home 在操作系统应用数据目录中持久化 `stories`、`sessions`、`storages`、`attachments` 与 `trash`；浏览器不接收物理路径。

关键入口与证据：

- [`packages/client/ui-story/src/client/navigation.ts`](../packages/client/ui-story/src/client/navigation.ts)
- [`packages/client/ui-story/src/client/StoryBrowser.tsx`](../packages/client/ui-story/src/client/StoryBrowser.tsx)
- [`packages/api/story-controller/src/index.ts`](../packages/api/story-controller/src/index.ts)
- [`packages/story/story/src/index.ts`](../packages/story/story/src/index.ts)
- [`packages/client/ui-story/tests/navigation.client.spec.ts`](../packages/client/ui-story/tests/navigation.client.spec.ts)
- [`packages/story/story/tests/story.spec.ts`](../packages/story/story/tests/story.spec.ts)

### 3. 角色扮演删除语义

状态：✅ 已实现

- 删除一次故事运行是真删除，不是归档；角色扮演 UI 不使用旧 archive 语义。
- 删除某故事书下的普通运行会删除 Story 记录、移除全部 Session 所有权，并把托管聚合移入 Host 回收区。
- 删除最后一次运行时，不删除故事书：该记录转为 `templateOnly`，保留 `world/` 和 `assets/`，清空 Session 与全部运行态；侧栏继续显示故事书和“还没有故事，点击开始”。
- 删除整本故事书才会删除该 `templateId` 下所有运行和模板锚点。
- 旧 `archive` Remote 为底层兼容保留，但不是角色扮演产品操作。

回归测试：

- [`packages/api/story-controller/tests/director-run-control.host.spec.ts`](../packages/api/story-controller/tests/director-run-control.host.spec.ts)
- [`packages/client/ui-story/tests/navigation.client.spec.ts`](../packages/client/ui-story/tests/navigation.client.spec.ts)
- [`packages/story/story/tests/story.spec.ts`](../packages/story/story/tests/story.spec.ts)

### 4. 同会话撤回并重写

状态：✅ 已实现

- 消息小铅笔执行同一 Session 内的 replacement，不创建分支、不 fork、不改变 Story 或 Session 身份。
- 旧事件继续留在追加式审计日志中；replacement 从目标 user message 起遮蔽旧模型表层，后续模型只读取替换后的历史。被取代的人工输入与 AI 回答会作为 replacement 气泡下方的折叠版本历史显示，不重新进入当前 transcript 顺序、导航或模型上下文。
- Client 只有在 Host 接纳重写后才清除 `rewriteBeforeSeq`；忙碌、过期、非人工消息或非空队列会明确拒绝。
- 生成的 Host codec、Remote client codec 与浏览器 Remote 聚合包都必须携带重写边界；只改 TypeScript 接口不算完成。
- Storyweaver 在玩家回合前保存权威 Story 运行态与 Actor Session 边界，重编时先恢复准确检查点。每个 Story 缺省保留 128 条、可由部署配置；首个旧回合可回到确定空基线，其他缺少保留检查点的回合会在 replacement 接纳前明确失败。
- 未接入该检查点边界的外部工具状态不会自动回滚，仍需要其所属领域的补偿操作。

关键说明：

- [同会话重写与鉴权恢复](../.agents/notes/implemented/bug-fix/2026-08-30-same-session-rewrite-and-auth-recovery.zh.md)
- [`packages/api/session-controller/tests/prompt-transport-schema.host.spec.ts`](../packages/api/session-controller/tests/prompt-transport-schema.host.spec.ts)

### 5. 故事书创作与导入导出

状态：✅ 已实现

- 故事书使用严格的 `schemaVersion: 4`：除基础信息、世界真相、Director 指导、规则、节拍和角色定义外，必须保存默认思考过程语言、Director 设定、逐角色私有设定，以及 Director/Actor 各自的运行规则与能力调用规则。角色初始认知统一使用无真伪标签的 `privateContext.perspective`。
- 每名角色拥有稳定 ActorId、公开人设、状态、能力、私有上下文和表演指导。
- 叙事主角可不指定，省略或 null 都有效，不自动选择首个角色。指定时须引用已有角色，标记进入 Director 故事设定，不决定玩家控制权，也不限制代演。结构化编辑器可设置或清空主角。
- 未知字段、`systemPrompt` 或工具权限扩展会被拒绝。
- 浏览器工作台支持结构化分区编辑、专家 JSON、快速粘贴、分区 diff、撤销、恢复默认、整本故事书与单 Actor JSON 导入导出。
- Host 保存使用内容修订进行乐观并发控制，按 Story 串行并原子替换 `world/storybook.json`。
- 故事书缺失与无效是不同状态；无效文件会明确失败，不会静默退回空数据。

关键入口与测试：

- [`packages/experimental/client-ui-roleplay/src/client/StorybookStudioPanel.tsx`](../packages/experimental/client-ui-roleplay/src/client/StorybookStudioPanel.tsx)
- [`packages/api/story-controller/src/storybook-authoring.ts`](../packages/api/story-controller/src/storybook-authoring.ts)
- [`packages/story/story/src/storybook.ts`](../packages/story/story/src/storybook.ts)
- [`packages/experimental/client-ui-roleplay/tests/storybook-studio-panel.client.spec.tsx`](../packages/experimental/client-ui-roleplay/tests/storybook-studio-panel.client.spec.tsx)
- [`packages/api/story-controller/tests/storybook-authoring.host.spec.ts`](../packages/api/story-controller/tests/storybook-authoring.host.spec.ts)

### 5A. AI 创造模式与固定创作工作区

状态：✅ 已实现

- 创造模式是与故事列表并列的固定工作区；其中每个持久 Session 都对应一次独立的新故事书创建任务。
- 新建任务会创建隔离草稿，不占用或修改当前运行故事；草稿发布后才进入故事列表。
- 创造 Agent 根据玩家的自然语言要求直接读取和修改当前故事素材。它使用 `storyweaver-creator` 独立 preset，不继承 Director 或 Actor 工具；新建任务明确选择的本地目录会作为 Creator Session 的不可变 `cwd` 保留，不再被 Story `.runtime` 替换。
- `world/storybook.json` 只能通过 `storybook_read`、`storybook_schema` 与 `storybook_save` 操作。保存必须携带准确内容修订，并在原子替换前通过严格 `schemaVersion: 4` 校验。
- 受管 `story_file_read`、`story_file_write` 与 `story_file_edit` 只接受当前 Story 下 `world/`、`assets/` 的逻辑 UTF-8 文本路径。本地 `read`、`read_image`、`write`、`edit`、`glob`、`grep` 与平台 Shell 则遵守 Creator Session 的 Host 权限：只读、所选工作区读写，或经显式风险确认后的完全访问。Creator 没有跨 Story、Director 调度或 Actor 权限。
- 创造工作区直接显示当前本地权限。切换到完全访问必须勾选风险确认；普通故事页面不渲染该控件，且权限状态不会扩大未注册工具的能力。
- 创造模式复用故事书工作台作为人工检查与编辑入口，并在对话中实时显示可展开的读取、写入、编辑和校验状态；普通 Director/Actor 会话继续隐藏底层 Tool 调用。
- 顶部“返回故事”会回到当前场景，创造 Agent 不具备推进世界、代替角色发言或调度 Actor 的权限。

关键入口：

- [`packages/preset/agent-presets/presets/storyweaver-creator/agent.cordis.yml`](../packages/preset/agent-presets/presets/storyweaver-creator/agent.cordis.yml)
- [`packages/experimental/tool-director/src/creator.ts`](../packages/experimental/tool-director/src/creator.ts)
- [`packages/experimental/client-ui-roleplay/src/client/RoleplayStoryDock.tsx`](../packages/experimental/client-ui-roleplay/src/client/RoleplayStoryDock.tsx)
- [`packages/experimental/client-ui-roleplay/src/client/CreatorToolCallView.tsx`](../packages/experimental/client-ui-roleplay/src/client/CreatorToolCallView.tsx)

### 6. Director Outline、Brief 与首次推进顺序

状态：✅ 已实现

- 新故事的 Director Outline 初始必须为空：修订号为 0、长期意图为空、各结构分区为空；玩家界面不得显示内部缩写 `R0`。
- 故事书是基础世界和角色素材；Director Outline 是运行时、非正史、Actor 不可见的长期计划，不能由默认故事导入预填。
- 当 Outline 为空时，Director 的第一次规划操作必须调用 `director_update_outline` 创建有内容的初稿；上下文提供采用准确工具字段名的 `tool_input_base`，首次更新只需包含开局所需的最小计划。`director_commit_brief` 在此之前由 Host 直接拒绝，不能只依赖提示词自觉。
- `director_stage_scene` 维护唯一的 Host 管理物理场景帧：场景 id、位置和完整在场 Actor id。Director 只在换场或阵容变化时更新；登记在 Storybook 但不在场的角色保持休眠，不会因群像规模而建立 Session。
- Outline 包含长期意图、主题、硬约束、故事弧、Beat、伏笔、谜团和叙事时钟；每项具有稳定 id、来源和玩家锁。
- 玩家完整替换和 Director 分类 patch 都要求准确修订。`auto_unlocked` 自动应用未锁定内容，`review_all` 进入玩家审核队列。
- Director Brief 只服务一次 Actor 调度，保存当前态势、既定事实、未决线索，以及本轮聚光 Actor 的感知和不确定项；聚光名单必须是当前在场名单的子集，它不会推进 Outline 修订。
- 首次 Actor 调度前可修正刚提交的 Brief；调度开始后必须恢复现有 Run，不能另建 Brief 覆盖检查点。

关键入口与测试：

- [`packages/experimental/tool-director/src/index.ts`](../packages/experimental/tool-director/src/index.ts)
- [`packages/story/story/src/outline.ts`](../packages/story/story/src/outline.ts)
- [`packages/experimental/client-ui-roleplay/src/client/DirectorOutlinePanel.tsx`](../packages/experimental/client-ui-roleplay/src/client/DirectorOutlinePanel.tsx)
- [`packages/experimental/tool-director/tests/tool-director.spec.ts`](../packages/experimental/tool-director/tests/tool-director.spec.ts)
- [`packages/story/story/tests/outline.spec.ts`](../packages/story/story/tests/outline.spec.ts)

### 7. Director Run 持久检查点与恢复控制

状态：✅ 已实现

- Run 状态包含已提交、调度中、暂停、等待重试、完成和取消；每名 Actor 有待处理、运行中、完成、失败、跳过和取消状态。
- 每次 Actor 尝试由 Host 签发 attempt id、单调 generation、Actor Session id 和事件下界。
- 恢复只调度未完成 Actor；已经接受的事件不会重复。
- 玩家可以准确修订地恢复 Run、重试单个 Actor、暂停、取消整个 Run、跳过 Actor 或中止运行中的 Actor。
- 中止同时传播到 `AbortSignal` 和 `Agent.cancel()`；迟到结果因 attempt ownership 不匹配而被拒绝。
- Director Run 控制台展示队列、Brief、Actor 感知切片、失败、attempt 信息与接受事件引用。

关键入口与测试：

- [`packages/experimental/client-ui-roleplay/src/client/DirectorRunConsole.tsx`](../packages/experimental/client-ui-roleplay/src/client/DirectorRunConsole.tsx)
- [`packages/story/story/src/director.ts`](../packages/story/story/src/director.ts)
- [`packages/story/story/tests/director-run.spec.ts`](../packages/story/story/tests/director-run.spec.ts)
- [`packages/experimental/client-ui-roleplay/tests/director-run-console.client.spec.tsx`](../packages/experimental/client-ui-roleplay/tests/director-run-console.client.spec.tsx)

### 8. 自主 Actor 与信息隔离

状态：✅ 已实现

- 每个持久角色绑定独立 Actor Agent 和私有 Session；ActorId 与显示名、SessionId 分离。
- Actor 只接收自己的公开身份、私有上下文、表演指导、当前状态、默认最新 32 条已投递主观感知、批准记忆、参与中的讨论和最新 Brief；当前物理场景帧会固定保留，World 与 Brief 中完全重复的感知不再重复发送。
- Actor 永远不能看到世界真相、Director Outline、其他角色私密信息或 Director 期望回应。
- `npc_speak` 与 `npc_act` 产生可结算的世界可见意图；`npc_think`、`npc_feel`、信念、关系、记忆、目标和未来意图保持角色私有；`npc_yield` 显式结束回合。
- 核心记忆达到配置容量时，Host 会先为低重要度、同重要度中更早的活跃记忆追加 `core-memory-capacity` 墓碑，再接纳新记忆；容量压力不会直接中断 Actor 回合，完整审计仍保留。
- 普通 assistant prose 没有角色行为权限，也不会自动成为说话、行动或世界事实。
- 玩家代演与 Actor 自主行为分开记录，永久保留 `origin: player`。

关键入口与测试：

- [`packages/experimental/actor`](../packages/experimental/actor)
- [`packages/experimental/tool-actor/src/index.ts`](../packages/experimental/tool-actor/src/index.ts)
- [`packages/experimental/tool-actor/tests/tool-actor.spec.ts`](../packages/experimental/tool-actor/tests/tool-actor.spec.ts)
- [`packages/story/story/tests/director-loop.spec.ts`](../packages/story/story/tests/director-loop.spec.ts)

### 9. 角色状态上帝视角面板

状态：✅ 已实现

- 未启动 Actor Session 时也能显示故事书定义的角色初始状态。
- 面板按角色隔离浏览概览、认知与心理、关系、记忆与意图，以及稀疏的心路历程时间线。
- 心路转折记录触发经历、角色主观解释、重要度与明确前后变化。玩家可基于准确修订编辑、内化、逆转或否定；被否定记录保留审计但不再进入模型上下文。
- 明确区分“设定已载入”和“自主运行”。
- 运行时 Actor 事件覆盖对应语义状态，但保留故事书扩展 facet，例如位置、伤势、装备。
- 私有状态通过可信 Host 投影按需读取，不放入普通 Story feed 或其他 Actor 上下文。

证据：

- [`packages/experimental/client-ui-roleplay/src/client/CharacterStatePanel.tsx`](../packages/experimental/client-ui-roleplay/src/client/CharacterStatePanel.tsx)
- [`packages/api/story-controller/src/storybook-state.ts`](../packages/api/story-controller/src/storybook-state.ts)
- [`packages/experimental/client-ui-roleplay/tests/character-state-panel.client.spec.tsx`](../packages/experimental/client-ui-roleplay/tests/character-state-panel.client.spec.tsx)

### 10. 玩家权限与世界操作

状态：✅ 已实现

- 输入区四种快捷方式——旁观推进、指定走向、介入世界、代演角色——只写入可编辑草稿，不会点击即修改权威状态。
- 世界操作工作区提供有类型的可信命令：选择方向、世界介入、玩家代演说话与行动。
- Actor 行动 intent 必须经显式世界结算才能形成事实；结算可接受或拒绝，并用准确世界修订应用 `set`/`remove` patch。
- 感知按受众 Actor 投递；世界事实、某角色知道的事实和某角色想做的事保持分离。
- 普通 Director 正文和 Actor prose 都不能通过推断修改世界。

关键入口与测试：

- [`packages/experimental/client-ui-roleplay/src/client/StoryOperationsPanel.tsx`](../packages/experimental/client-ui-roleplay/src/client/StoryOperationsPanel.tsx)
- [`packages/story/story/src/roleplay.ts`](../packages/story/story/src/roleplay.ts)
- [`packages/story/story/tests/roleplay.spec.ts`](../packages/story/story/tests/roleplay.spec.ts)

### 11. 长篇记忆、持久讨论与上下文配方

状态：✅ 已实现

- 长篇记忆先由 Director 在有实质进展的场景/篇章边界提案，再由玩家批准或拒绝；未批准内容不进入模型上下文，也不要求每轮机械总结。已批准记忆在独立语义摘要器出现前仍完整保留，不参与事件尾部的数量裁剪。
- 每条长期记忆明确拆为导演摘要、全员公共摘要和逐角色主观记忆。Director 只读取导演摘要；Actor 只读取公共摘要与属于自己的私有记忆，空值绝不回退泄露导演内容。
- 玩家可在统一“上下文构建”工作区直接编辑记忆类型、标题、三层受众内容和事件引用；写入使用 Story 与记忆条目的准确修订，并保留原审核状态。
- 新批准的同类记忆可以取代旧批准记录，同时保留审计历史。
- 普通多 Actor 调度只让每名所选 Actor 各行动一个回合，是开局、单纯旁观推进和独立反应的默认路径，不会自动升级为对话循环。只有当前剧情拍必须通过问答、争执、协商或共同决策才能产生结果时，Director 才先通过工具发起群体讨论；讨论会持久保存参与者、发言权、队列、轮次、完整记录、总结阶段和完成状态，一次 Director 调度会先完成各参与者的私有准备，再按明确交棒、玩家排队、积极度和发言次数持续选择下一席位，直到明确干预、Actor 失败、有效结束提议或轮次预算。模型请求默认读取最新 12 条公开发言，并为每名参与者补一条更早的代表性贡献；完整记录仍供 UI 与审计使用。
- 自动讨论的故事书缺省上限是 4 轮，总公开发言预算为 `maxRounds × participantIds.length`。每场讨论在开始时保存玩家当前设置的快照；已有故事书显式保存的上限不会因缺省值变化而被静默迁移。
- 讨论中的 Actor 发言会以空世界 patch 自动完成来源明确的结算并推进发言权；行动意图仍需 Director 显式结算，不能借讨论绕过世界权威。Actor 请求会把当前提交契约明确标为私有准备或公开席位，`npc_commit_turn.behavior` 使用发言/行动判别联合，要求每项显式携带 `kind` 与对应正文，减少阶段误投和歧义参数重试。
- 参与者可依据自身判断请求结束整场讨论，但 `conclude` 明确不表示“我的本次发言结束”：只有形成共同结果、不可调和僵局或确实再无有效回应时才使用；普通贡献使用 `speak` 并继续自动交棒。已具备 Brief 与旁白的活跃讨论若在 Director 调度前停止，Host 的专用续步只要求继续调度；过早开启的讨论只补齐缺失前置条件，不重建 Outline、场景或讨论。自然结束或轮次预算耗尽后进入持久总结阶段，Host 在同一玩家回合携带准确 World 与讨论修订，要求 Director 旁白总结共识、分歧和场景转场。关闭讨论会结束当前玩家回合；旁观推进不会再追加新 Brief、第二次旁白或无关 Actor 调度。
- 讨论活跃时，输入区直接切换为专用实时讨论控制台，持续展示主题、阶段、当前发言者、轮次进度、参与者立场/积极度和最新公开发言；玩家申请发言和要求收束是次级操作，进入等待后可取消并恢复自动调度，即使当前 Actor 请求仍在收尾也不必被锁死。手工主题、参与者、轮数和发言权表单只保留在折叠的高级干预区。
- Director 与 Actor 使用彼此独立的上下文配方。运行权限规则、能力调用规则、思考过程语言、Director 设定、Actor 身份和所选 Actor 私有设定都是独立的可编辑、可启停、可拖动区段，并可分别指定真实模型消息身份（系统、用户或助手）。
- 可编辑规则只定义模型收到的上下文；Host 仍通过工具注册、Story/Session 所有权、Actor 私有构造、事件结算与输出过滤强制执行真实安全边界，提示词不能扩大权限。
- 上下文工作台列表完成拖动、启停和消息身份选择；点击模块后打开独立编辑器，修改所选来源并显示其已保存实际内容。下方完整预览显示有序消息、来源、权限、可见性、完整字符数和估算 token，统计不参与截断。
- 预览展示下一次请求会真正使用的有序模块，并逐段显示其 `system`、`user` 或 `assistant` 身份；不再把全部内容拼成一条伪用户快照。真实请求把开头连续的 `system` 模块置于准确的当前轮请求历史前方，把首个 `user` / `assistant` 及其后模块置于历史后方；完整 Session surface 继续保留，但不会因此全部回灌给模型。
- 所见上下文区段全部支持拖动排序，也提供上移/下移按钮作为键盘、触控和单指操作替代。

### 12. Story Package 可移植交换

状态：✅ 已实现

- 版本 3 Story Package 包含版本 8 规范 Story 记录、版本 4 故事书、全部已注册 Session 日志和 `world/` 下允许的可移植文件。
- 导出要求每个已注册 Session 都可读取，避免静默缺失历史。
- 导入在写入前校验包大小、路径、故事书、领域状态和 Session 日志。
- 导入永远创建新的 StoryId 与 SessionId，并重写内部引用；不会覆盖已有 Story，也不会恢复外部包中的不透明身份。

证据：

- [`packages/api/story-controller/src/story-package.ts`](../packages/api/story-controller/src/story-package.ts)
- [`packages/api/story-controller/tests/story-package.host.spec.ts`](../packages/api/story-controller/tests/story-package.host.spec.ts)

### 13. 角色扮演事件呈现与错误恢复

状态：✅ 已实现

- Actor 说话、行动、私有心理、记忆、目标、意图和玩家代演使用不同的类型化剧情呈现。
- 被调度 Actor 的一次尝试在公开场景中形成默认折叠的角色组，组内每个 reasoning 块再次独立折叠，最终意图与发言同组展示。Actor 推理增量和 `npc_speak`/`npc_act` 参数会实时流入前端，结算后由已接受事件替换草稿；这些模型 reasoning 只在同一次工具事务中用于完成后续调用，不进入世界事实、后续轮次、Director 上下文或其他 Actor 私有上下文。
- 私有内容默认折叠并带上帝视角标记；不会伪装成所有角色共同知道的公开事实。
- 已接受 Actor 事件在场景中保留 Actor Session 与事件序号来源，不会被误认为 Director prose。
- Director 旁白以规范 Markdown 保存和呈现：Host 会把旧式裸 `<p>`/`<br>` 片段转换为段落与换行，拒绝其余 HTML/XML 构造；前端会对历史旁白执行同一窄转换，再使用不执行原始 HTML 和不安全链接的共享 Markdown 渲染器，因此既保留分段与强调，也不会执行模型输出的标记。
- `AUTH` 错误提供“设置 → 模型”恢复路径；额度中断显示可恢复检查点，并提示只恢复未完成 Actor。
- 深色与浅色模式共享同一套语义状态，而不是两套互相覆盖的页面实现。

证据：

- [`packages/experimental/client-ui-roleplay/src/client/RoleplayEventView.tsx`](../packages/experimental/client-ui-roleplay/src/client/RoleplayEventView.tsx)
- [`packages/experimental/client-ui-roleplay/src/client/RoleplayTurnErrorView.tsx`](../packages/experimental/client-ui-roleplay/src/client/RoleplayTurnErrorView.tsx)
- [`packages/experimental/client-ui-roleplay/tests/roleplay-event-view.client.spec.tsx`](../packages/experimental/client-ui-roleplay/tests/roleplay-event-view.client.spec.tsx)
- [`packages/experimental/client-ui-roleplay/tests/roleplay-turn-error.client.spec.tsx`](../packages/experimental/client-ui-roleplay/tests/roleplay-turn-error.client.spec.tsx)

### 14. 统一上下文构建与导演/角色提示词编辑

状态：✅ 已实现

- 故事书保存一份 Director 基础设定、一份默认推理语言，并为每名角色保存独立私有设定；故事书 JSON、单角色 JSON 和完整 Story Package 的导入导出都会保留这些字段。
- 从故事书创建独立 Story 运行时会复制包含基础提示词的 authored baseline；运行态另存准确修订的 Director 与逐角色覆盖值，不会反向修改故事书默认值或同故事书的其他运行。
- `prompts`、`updatePrompt` 与 `updateReasoningLanguage` Remote 返回并更新故事书默认值、Story 覆盖值、有效值和来源；清除覆盖值会恢复故事书默认值。
- `updateMemory` Remote 直接更新当前 Story 的长期记忆，保存后下一次 Director/Actor 上下文构造读取最新值。
- 模型请求按已保存顺序注入 Director/Actor 的运行规则、能力调用规则与其他上下文模块。默认顺序把稳定规则、身份、故事书、已批准记忆和 Director Outline 留在严格匹配前缀，以“当前轮玩家输入与同轮工具事务”作为准确请求历史，并从 World、Plot Ledger、讨论、Brief 或 Actor state 等首个高频变化模块开始尾部消息块；思维模式限制作为最后一个 `user` 模块保留。Director Outline 投影把采用工具 snake-case 字段的写入基线与只读更新模式、锁定 id、待审核建议摘要和更新元数据分开，不把服务端历史与条目来源暴露成可写字段。Director 世界投影默认保留当前场景与最新 64 条权威事件，Ledger 只保留当前事实、线索、未结算 NPC 事件、最新紧凑 Brief 和逐 Actor 紧凑状态；Actor 默认保留最新 32 条主观感知；讨论默认保留最新 12 条公开发言与逐参与者较早代表性贡献。Director 只接收 Director 设定；一个 Actor 只接收自己的身份和私有角色设定，不能读取其他角色的覆盖值。程序强制权限与隐私边界不依赖这些可编辑文本。
- Actor 自治回合通过单个 `npc_commit_turn` 增量事务提交必要的状态变化、有序发言和行动，并由 Host 在一次工具执行内依次落账和收束；普通反应通常只需 `behavior` 与 `posture`，不变状态和不存在的心路转折应省略。行动上的自由描述 intent 不再导致整笔事务失败，只有规范发言 intent 会被持久化；损坏 JSON 会得到可操作的纠正反馈。主动沉默仍必须显式提交空 `behavior`。普通 assistant 文本结束只获得一次同回合纠正机会，再次漏调以可恢复失败结束，不能冒充成功沉默。底层原子工具不能被自治模型逐个调用。导演按 Brief 顺序逐个传唤角色，后一角色能看到前面角色对自己可见且已接受的发言。思考语言只在回合开始时自检一次，不再诱导模型在每个工具前重新规划。
- Actor 回合卡始终直接展示行动、发言及其流式草稿；只有模型思考过程默认折叠。一次回合含多段思考时使用“思考集合 → 单段思考”两级折叠，避免隐藏玩家真正关心的角色行为。
- 会话页头提供唯一的“上下文构建”入口，把导演/角色设定、思考过程语言、长期记忆和故事书上下文源的编辑、编排与真实请求预览放在同一工作台。模块列表负责拖动、启停和消息身份；点击模块打开独立编辑器进行修改和检查，下方展示完整有序请求；故事书默认值与当前 Story 覆盖值明确分层。
- 世界运行台不再重复提供“长期记忆”和“上下文”页签；该工作区只保留玩家权限、世界结算、群组讨论和 Story Package。

关键入口：

- [`packages/story/story/src/prompts.ts`](../packages/story/story/src/prompts.ts)
- [`packages/api/story-controller/src/index.ts`](../packages/api/story-controller/src/index.ts)
- [`packages/experimental/tool-director/src/index.ts`](../packages/experimental/tool-director/src/index.ts)
- [`packages/experimental/client-ui-roleplay/src/client/ContextBuilderPanel.tsx`](../packages/experimental/client-ui-roleplay/src/client/ContextBuilderPanel.tsx)

## 二、完善中的功能

### 1. 《月影账簿》默认测试故事

状态：✅ 已在当前开发数据中就绪

- 仓库已有规范 fixture：`storybook.json`、`opening.md`、大纲结构参考样例和模拟验收用例。
- 当前活动数据已存在版本 8 的《月影账簿》 Story 记录和版本 4 故事书，不需要再手工导入才能在侧边栏打开。角色认知只保存无真伪标签的主观经历，隐藏事实不会以“认知盲区”形式泄露给 Actor。
- 初始运行不得导入 `director-outline.json`；该文件只用于验证大纲结构和长线规划能力。实际初始 Outline 必须为空，由 Director 首次推进时创建。
- 产品当前要求是“活动数据中存在”，不是在每次清空数据后由启动代码自动重建；因此本轮不增加自动播种兼容分支。
- `simulation-cases.json` 是统一验收目录，但并非每个场景都已有真实模型自动化测试。

Fixture：[`packages/experimental/roleplay-web-profile/tests/fixtures/storybooks/moonshadow-ledger`](../packages/experimental/roleplay-web-profile/tests/fixtures/storybooks/moonshadow-ledger)

### 2. UI 细节与跨尺寸验收

状态：🟡 完善中

- 深浅主题、主要模态工作区、可调整尺寸、窄屏布局和键盘可达性已实现。
- 仍需持续做真实浏览器视觉验收，尤其是超长大纲、Actor 私有状态、多个运行、窄屏底部面板和错误卡片组合。
- 后续 Actor 事件在缺少 descriptor 索引时可能先显示稳定 ActorId，而非始终显示角色名。

### 3. 离线 Actor 状态投影

状态：🟡 完善中

- 故事书初始状态和在线 Actor 事件折叠已可用。
- 完整私有运行态仍依赖 Actor Session 恢复后由可信 Host 折叠；普通 Story feed 只携带状态修订信号，不携带私有内容。

### 4. 开发期数据兼容

状态：🟡 完善中

- 当前 Story 记录 schema 为版本 8、故事书为版本 4、Story Package 为版本 3；开发环境直接重写活动数据，不提供旧格式兼容、兜底解析或正式迁移器。
- 旧版本测试数据可能被拒绝或需要重新导入；这不应被误诊为侧栏功能缺失。
- 正式发布前需要明确迁移策略或明确执行一次不可逆开发数据重置。

### 5. 长篇运行边界治理

状态：🟡 完善中

- Actor 核心记忆、目标、未来意图与近期行为窗口均由插件配置控制；Director 最近世界事件、Actor 最近主观感知、讨论上下文和 Story 回合检查点也已有部署配置，当前上下文组织策略不需要重写。
- Story 权威记录仍对世界事件 2000、主观感知 4000、长期记忆 500、讨论 100 场及单场发言 500 条使用固定 schema 上限，并在部分写入路径静默保留尾部。这些属于运行策略而非包大小或字段长度的安全边界，长篇运行可能在 UI 没有提示时失去较早权威记录。
- 后续应把权威历史改为追加式日志加物化快照，将模型上下文继续保持为独立的有界语义投影；容量接近阈值时提供可观察告警，并把部署策略移入 Config。此改造不得把完整旧 reasoning、工具轨迹或全部历史重新回灌给模型。

## 三、未实现功能

### 1. 独立叙事时钟与 Actor 唤醒调度器

状态：⏳ 未实现

- 大纲可以保存叙事时钟，Actor 可以保存未来意图。
- 当前没有独立 scheduler 根据世界时间或时钟进度主动唤醒 Actor。
- 所有推进仍由玩家输入、Director 工具或可信玩家控制触发。

### 2. 已删除故事的浏览器恢复

状态：⏳ 未实现

- 托管目录会进入 Host `trash`，但浏览器没有“最近删除”或恢复入口。
- 在恢复功能完成前，删除在产品语义上应视为删除，而不是可见归档。

### 3. 长记忆语义压缩

状态：⏳ 未实现

- 已批准记忆在对应区段启用时完整进入上下文，不再受字符上限截断。
- 当前没有自动生成、审核和替换语义摘要的压缩器。

### 4. 自动测试故事播种

状态：⏳ 未实现

- 《月影账簿》是规范 fixture，但不是应用启动代码的一部分。
- 不应把某台开发机已经存在的数据误认为仓库已实现自动导入。

### 5. 角色扮演专用诊断面板

状态：⏳ 未实现

- 技术 Tool、Trajectory 与 coding 诊断已从 profile 隐藏。
- 当前没有替代性的角色扮演健康检查、数据版本、Actor 在线状态和上下文体量趋势面板。

### 6. 正式发行包装

状态：⏳ 未实现

- Storyweaver profile 仍是源码 checkout 中的私有实验层。
- 尚未作为独立正式产品 profile 发布，也没有生产级安装、升级和数据迁移承诺。

## 四、有意不提供的功能

状态：🚫 有意不提供

- 角色扮演 UI 不暴露 Workspace 路径、文件浏览器、终端、Shell、LSP、代码 diff、通用 Tool 卡片或 Trajectory。
- NPC 不继承 Director、父 Agent 或 coding Agent 的工具集合。
- Director 不替持久角色写对白、动作、思想、选择或情绪结论。
- Actor 行动 intent 不自动等同于世界结果。
- 大纲、伏笔、Director 推断和候选 Beat 不自动等同于正史。
- 同会话小铅笔不创建分支；显式 fork 才能创建新 Session。
- 故事书和 Story Package 可以保存、导入可编辑的模型运行规则与能力调用说明，但不能扩展 Host 实际注册的工具、所有权、私有数据可见性或事件结算权限。

系统初始上下文通过独立保存入口为新书提供配方副本；本书共享继续按 BookId 隔离。默认基线已核对月影账簿实际使用实例的保存修订，现有书和实例不因默认更新而迁移。通用创作与执行提示区分角色表达、私有准备和执行规程；测试证明配置和请求链路，实际长期文风仍需玩家验收。详见[初始上下文与角色表达](../.agents/notes/implemented/feature/2026-09-11-context-defaults-and-character-voice.zh.md)。

## 五、不可回退的产品不变量

修改任何相关代码前，必须逐项核对：

1. **小铅笔是同会话 replacement，不是 fork。**
2. **故事书内加号创建独立 Story 运行，只继承基础素材，不继承运行态。**
3. **删除最后一次运行后故事书仍存在，并显示空运行入口。**
4. **删除整本故事书与删除一次运行是两个不同操作。**
5. **新故事首次推进前没有 Director Outline，不从 fixture 预填；界面不显示内部修订缩写。**
6. **空 Outline 时，Director 必须先创建大纲初稿，才能提交 Brief。**
7. **Director prose 永远不能成为持久角色行为。**
8. **Actor 只能看到自己的私有切片，不能看到世界真相、大纲或其他 Actor 私密信息。**
9. **Actor intent、世界事实和 Actor 感知是三种不同记录。**
10. **玩家代演永久保留玩家来源，不能伪装为 NPC 自主决定。**
11. **Story Package 导入签发新身份，不覆盖现有故事。**
12. **浏览器只接收不透明身份，不接收 Story Home 物理路径。**
13. **浅色与深色主题必须同时保留，修改一套不能删除另一套语义 token。**
14. **AUTH 与额度失败必须给出可操作恢复路径，不能退化为泛化错误。**
15. **Remote 请求类型变更必须同步生成 codec 并重建浏览器 Remote 聚合产物。**

## 六、修改前的完整读取顺序

不得只读取出现问题的 React 组件或一个 Remote handler 就开始改动。至少按以下顺序确认：

1. 本文件中的状态、未完成项和产品不变量；
2. 对应的 `.agents/notes/implemented` 决策记录；
3. roleplay profile 的组合与禁用项；
4. Client UI 组件、Client service/model 与导航策略；
5. Story Controller Remote 入口和 wire 类型；
6. Story/Actor 领域 schema、持久化与 invariant；
7. Director/Actor Host 工具和上下文隔离；
8. 同功能的领域、Host、Client 与真实 wire 测试；
9. 若修改 Remote 类型，检查生成产物和最终浏览器 bundle；
10. 更新本文件，明确功能状态是否发生变化。

## 七、建议回归测试矩阵

按改动范围选择，但涉及跨层语义时不得只跑一个组件测试：

```text
packages/story/story/tests/*.spec.ts
packages/api/story-controller/tests/*.spec.ts
packages/experimental/tool-actor/tests/*.spec.ts
packages/experimental/tool-director/tests/*.spec.ts
packages/client/ui-story/tests/*.spec.ts
packages/experimental/client-ui-roleplay/tests/*.spec.tsx
packages/experimental/roleplay-web-profile/tests/*.spec.ts
packages/api/session-controller/tests/prompt-transport-schema.host.spec.ts
```

人工验收统一优先使用《月影账簿》，重点覆盖：

- 首次推进先生成空白大纲的初稿；
- 同会话重写一次遮蔽目标轮次及其后续，而不出现新分支；
- 从同一故事书创建两次运行后，世界、记忆、大纲和 Session 完全独立；
- 删除最后一次运行后故事书仍显示；
- Actor 不泄露其他角色私密上下文或 Director Outline；
- Actor 行动经显式结算后才改变世界并向指定受众投递感知；
- 额度或鉴权失败可以从明确入口恢复。

输入框底部接入 dsh 原生历史累计统计，汇总当前故事的导演与角色执行会话；平均首 token、生成速率、缓存命中率与输入输出总量沿用原生口径。见[累计用量说明](../.agents/notes/implemented/feature/2026-09-11-story-usage-totals.zh.md)。
