---
description: "使用角色扮演优先的 Web 外壳、玩家权限草稿快捷方式与自主 Actor 事件卡片。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-roleplay

[English](README.md) | 中文

## 概述

这个私有 Client 插件把通用 dsh 对话外壳转向角色扮演，同时保留原有 Session、流式传输、持久化、本地化与 slot 架构。它提供 Storyweaver 品牌、更温暖的剧场式配色、四种玩家权限草稿快捷方式，以及持久 Actor 事件的类型化剧情卡片。内心、记忆、目标与意图折叠在明确的上帝视角入口之后；说话和行动保持世界可见，玩家代演则保留独立来源。

交互结构有限参考了 AIAgentRolePlay 中的状态、记忆、心理、关系、旁观、打断和视角表层。它不会搬运该 demo 的 Vue 应用，也不会把 demo 页面状态当作权威状态。

配色采用成对方案，而不是彼此替换：**浅色**保留原 Storyweaver 的温暖米白与纸张表层，**深色**使用偏茄紫的夜间配色。浏览器偏好由**设置 → 外观**归属，可选择浅色、深色或跟随系统；选择深色不会删除或改写浅色 token。

世界操作按导演或角色认知显示持续事项，包括状态和可展开的来源原文。讨论控制台在公开发言前显示每位角色的准备进度。记忆审核显示提案将替代哪些已批准条目，未选中的条目继续有效。

故事标题栏的“记忆审核”打开审核侧栏，按玩家回合分组展示可编辑短记、理由、完整原文及固定操作。玩家可批量批准或拒绝来源处理单元，未保存编辑不能进入批量决定。待审核短记不会成为模型记忆，拒绝后保留原文；固定原文保留独立入口以便取消固定。请求预览依据实际请求日志显示近期原文、额外保留原文、有效短记及已归档来源，不推测缓存用量。

输入模式与选中的代演人物随消息提交；点击模式会填入空草稿，或替换尚未修改的引导文字；玩家编辑过的正文会保留，选择模式不会发送消息。“继续”操作直接推进剧情。执行反馈读取真实 Session 与 Director Run 状态。桌面角色状态使用可收起侧栏，窄屏使用模态抽屉。故事、角色、风格、状态和上下文入口共用已有编辑器与带修订检查的保存命令。状态工作区可将当前有效值复制到可审阅的故事书草稿；保存草稿不会改变本次运行状态。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

在稳定 Web bundle 之后，通过 [`@deepseek-ai/dsh-experimental-roleplay-web-profile`](../roleplay-web-profile/README.zh.md) 安装本包。该 profile 会把此表层与无路径故事库组合：侧栏按 Story 标题组织场景 Session，空白 hero 选择或创建 Story，而不是选择文件系统目录。Web Client loader 会挂载本包的 `/client` export；Host 入口不执行行为。

### 选择玩家位置

输入框上方提供四种快捷方式：

- **旁观推进**要求世界继续运转，同时每个角色只依据自己的知识、目标和情绪行动。
- **指定走向**表达期望的叙事方向，但不占据任何角色。
- **介入世界**声明世界中发生一个变化。
- **代演角色**让玩家临时代替任意角色说话或行动。

选择模式会填入空草稿或替换上次尚未修改的引导文字，保留玩家编辑过的正文，不会自动提交。下一条消息会捕获所选模式和代演人物，不受之后的模式切换影响。

跟随输入卡宽度的居中交互台显示执行状态、适用的讨论控件和四种输入模式。Director Run 与世界资料移到始终可见的会话页头，滚动剧情或输入区时仍能直接进入。故事书和导演大纲以模态工作区打开，提供始终可见的关闭入口、Escape 退出、焦点归还和由文档独占的单一滚动区；关闭工作区会为当前会话保留尚未保存的内存草稿。桌面端可从任意边缘或角落调整工作区大小，对边保持锚定，尺寸受视口约束，四条边也支持键盘调整。编辑时，主要的保存与取消命令位于文档上方的上下文工具栏，其后排列可撤销操作和导入/导出命令；紧凑屏幕会使用全部可用工作区、禁用手动缩放，并把主要命令堆叠为适合触控的控件。

### 操作世界

常驻的**世界操作**工作区是轻量草稿快捷方式的权威配套入口。它默认打开实时运行摘要，优先显示系统正在做什么、当前讨论发言者与轮次、待审核记忆和玩家干预。讨论活跃时，输入区讨论台与输入模式同时显示；无需打开其他工作区，就能看到主题、真实阶段、当前发言者、已完成回合、参与者立场与积极度，以及最新公开发言。导演主导的讨论会跨角色自动持续推进，并以导演自动总结收尾；玩家可见控件降为申请发言或要求收束的次级操作。待处理申请会继续显示在讨论台中，并可在 AI 活动仍在结算时取消。手工发起讨论、调整发言权、底层世界结算与记忆提案表单仍保留在折叠的高级操作中。其页签只承担类型化玩家权限、世界结算、群组讨论和完整 Story Package 交换；提示词、长期记忆和上下文配方统一进入“上下文构建”。所有控件保留可见标签、异步状态反馈、执行中禁用、键盘操作与触控尺寸。

### 阅读角色自主状态

页头的角色状态面板会立即显示故事书定义的角色，不要求先创建 Actor Session。角色身份是第一层导航边界：先在名册中选择一名角色，再通过页签查看概览、认知与心理、关系、记忆与意图，避免把多个角色的私有状态混进同一块滚动区域。桌面端面板可在视口范围内拖拽调整大小；窄屏会切换为响应式纵向布局。

每名角色都区分“设定已载入”和“自主运行”：前者来自故事书初值，后者表示同一 ActorId 已绑定运行时 Actor。位置、伤势、装备等扩展状态按故事书 facet 通用显示。运行时 Actor 事件会覆盖对应的初始语义状态，但不会抹掉故事书扩展字段。

### 编辑导演大纲

玩家位置操作区会显示 Story 级 Director Outline，新建空场景也不例外。固定在视口内的面板会分别显示 Outline 修订、最新单轮 Brief 修订和调度状态，因此已保存 Brief 不会被误认为长期 Outline 更新。结构化工作台分为总纲与规则、故事弧、可排序且显式显示依赖的 Beats 时间线、伏笔、谜团和叙事时钟。每张卡片都会显示稳定 id、来源、玩家锁、分类专属字段及事件证据引用。玩家可以拖动卡片或使用支持键盘的移动控件，检查修订历史，逐条接受或拒绝待审核 Director 建议，并可切换到完整玩家可写 JSON 投影。Director 来源、修订历史与待审核内部字段继续由服务端持有，不会变成可编辑 JSON。准确修订保存会阻止过期草稿，并提供明确的最新修订读取入口。

### 控制 Director Run

同一位置操作区还会显示紧凑的 Director Run 检查点，点击后打开默认聚焦队列的模态抽屉。队列行优先显示 Actor 状态、尝试次数、失败和已接受事件数量；Brief、Actor 感知切片、attempt id、generation 与事件引用通过明确页签和折叠区按需展示。准确修订控制可恢复未完成工作、暂停或终局取消 Run，仅在没有已接受事件时重试一个失败或已取消 Actor，跳过未完成工作，或中止一个运行中的 Actor。取消、跳过和中止需要确认；抽屉会约束焦点、支持 Escape 关闭、恢复触发按钮焦点，并在紧凑视口变成底部面板。任何控制都不会把普通 Director 或 Actor prose 变成 NPC 行为。

### 编辑故事书

新 Story 显示空场景 Hero 布局时，故事书工作台仍保留在玩家位置操作区旁。其视口级固定面板在桌面端始终位于输入框上方，在窄屏则成为全宽工作区。它通过不含路径的 Client 命令读取和保存完整受管故事书。编辑默认通过分区导航处理基础信息、世界数据、结构化 Director 指导、Director 规则与角色设定，每名 Actor 都有独立表演指导控件；其中必须标记一名承担连续性与戏剧焦点的主角，但玩家仍可临时代演任意角色。快速粘贴会把带标签的创作笔记解析到所选范围；分区级修改前后对照、单步撤销和恢复默认值让修改可检查；完整文档 JSON 继续作为专家模式。规范故事书 JSON 与单个 Actor JSON 均可导入或导出，也可导出当前未保存文档；导入内容在准确修订保存成功前始终只是草稿。过期保存会保留草稿并提供最新版本读取入口。保存成功后会同步侧栏导航使用的 Story 标题与前提。有效上下文检查器展示经 Host 过滤的 Director 或 Actor 区段及其消息身份、来源、权限、可见性和纳入原因；运行规则与能力调用规则均可在上下文构建器中独立编辑。

### 构建导演与角色上下文

统一的“上下文构建”工作区把内容编辑、实际请求检查和装配编排合并到一起。模块列表负责拖动、启停和系统/用户/助手消息身份；点击模块后打开独立编辑器，显示对应来源与已保存的模型实际内容，下方集中展示下一次请求的完整有序消息。运行规则、能力调用规则、导演设定、所选角色的身份与私有设定、思考过程语言、长期记忆和其他故事上下文均可单独检查全文；可编辑来源明确区分故事书默认值与当前 Story 覆盖值。上移/下移按钮保留为键盘、触控和单指替代。已启用内容不设置字符上限，只保留字符与 token 统计。思考过程语言以更强的强制指令进入模型上下文；Host 实际权限和隐私隔离仍由代码执行。

被调度 Actor 的一次尝试会在场景中形成一张默认折叠的角色卡；展开角色卡后，每个 `reasoning` 块仍分别默认折叠，形成“角色 → 多次思考 → 最终意图与发言”的双层结构。Actor Session 的推理增量与 `npc_speak`/`npc_act` 工具参数增量会实时投影到这张卡中，最终再由已接受的权威事件替换流式草稿。模型 reasoning 仍只供玩家查看，不写入世界事实，也不会泄露到 Director 或其他 Actor 的上下文。

头像下的“上下文”控件通过 [Story Controller](../../api/story-controller/README.zh.md#development-contract) 读取生成回复时的请求。阅读弹窗在消息滚动时保持标题、视图切换和关闭按钮可见。消息保留发送顺序和角色标签；正文保留换行，默认预览六行，可展开完整内容。思考内容、工具调用和工具返回分别标注。工具与参数位于次级视图，消息 JSON 折叠项和原始请求视图保留全部字段。Esc、关闭按钮和遮罩均可关闭弹窗，并将焦点返回入口。加载失败可直接重试，成功结果按事件缓存。

插件认领 [`@deepseek-ai/dsh-experimental-actor`](../actor/README.zh.md) 的 Actor 事件词汇：

- descriptor、expression 与 action 事件变成世界可见剧情卡片；
- thought、memory、forgotten-memory、goal 与 future-intention 事件变成折叠的上帝视角卡片；
- story direction 与 world intervention 变成玩家来源卡片；
- 代演 intervention 记录不单独显示，因为配对的 expression 或 action 已携带 `origin: 'player'`，再次显示会重复。
- `story/npc-event-projected` 会在公开场景显示已接受 Actor 说话或行动，同时在持久 payload 中保留 Actor Session 与事件引用。

<a id="understand-the-implementation"></a>
## 理解实现

插件只通过现有 Client 服务与 slot 做贡献。它注册一个 Conversation definition、一个 keyed Chat renderer、侧边栏与 hero 品牌占位、Session 页头权限与状态工具、带中断 Run 检查点和折叠世界资料菜单的玩家位置操作区、有类型的世界操作工作区、通过 Conversation presentation registry 提供的本地化 hero/composer 文案、本地化字典，以及可释放的主题 token 覆盖层。已接受发言使用主要阅读样式，行动使用紧凑舞台提示样式；这种呈现差异不会改变事件顺序或权限。

| 文件 | 职责 |
|---|---|
| [`src/client/RoleplayChrome.tsx`](src/client/RoleplayChrome.tsx) | Storyweaver 标记、玩家权限提示与草稿快捷方式 |
| [`src/client/RoleplayStoryDock.tsx`](src/client/RoleplayStoryDock.tsx) | 在空场景中仍可用的玩家位置、Run 控制台、上下文构建、故事书工作台与大纲工作台组合入口 |
| [`src/client/DirectorRunConsole.tsx`](src/client/DirectorRunConsole.tsx) | 准确修订的 Run 与单 Actor 检查点控制 |
| [`src/client/StoryOperationsPanel.tsx`](src/client/StoryOperationsPanel.tsx) | PlayerAuthority、世界结算、讨论与 Story Package 操作 |
| [`src/client/CharacterStatePanel.tsx`](src/client/CharacterStatePanel.tsx) | 故事书与运行时 Actor 状态的上帝视角面板 |
| [`src/client/DirectorOutlinePanel.tsx`](src/client/DirectorOutlinePanel.tsx) | Story 大纲的玩家检查、编辑、锁定与建议审核 |
| [`src/client/StorybookStudioPanel.tsx`](src/client/StorybookStudioPanel.tsx) | 指导表单、快速粘贴、上下文预览、导入/导出与准确修订保存 |
| [`src/client/ContextBuilderPanel.tsx`](src/client/ContextBuilderPanel.tsx) | 提示词与长期记忆定义、实际上下文检查和可拖动配方编排 |
| [`src/client/roleplay-event-definition.ts`](src/client/roleplay-event-definition.ts) | 持久 Actor 事件到 Chat node 的投影 |
| [`src/client/RoleplayEventView.tsx`](src/client/RoleplayEventView.tsx) | 世界、玩家与私有事件卡片 |
| [`src/client/index.ts`](src/client/index.ts) | locale、theme、Conversation、renderer 与 slot 注册 |

<a id="dev-note"></a>
## 开发备注

归属决策见[角色扮演优先 Web 基础](../../../.agents/notes/implemented/feature/2026-08-28-roleplaying-web-foundation.zh.md)、[Storyweaver Director 职责边界与 Plot Ledger](../../../.agents/notes/implemented/feature/2026-08-29-storyweaver-director-ledger.zh.md)、[带修订控制的故事书编辑](../../../.agents/notes/implemented/feature/2026-08-29-storybook-authoring.zh.md)与[角色扮演世界操作和可移植故事](../../../.agents/notes/implemented/feature/2026-08-30-roleplay-world-operations.zh.md)。

<a id="model-experience"></a>
## Model Experience

### 玩家意图草稿标记

#### What the model sees

玩家只是选择快捷方式时，模型什么也看不到。如果玩家提交，所选标记（例如 `【旁观推进】`）会和玩家的编辑一起，通过普通持久 user-message 路径进入模型。Actor 事件卡片只负责呈现，不会把私有卡片内容重新插入模型上下文。

#### Token effect

只有提交后的草稿消耗 token，成本与最终文本长度成比例。配色、品牌、权限标记和 transcript 投影都不增加请求 token。

#### KV Cache effect

选择快捷方式或展开卡片不会影响缓存。提交附带结构化意图的消息时，与任何新 user message 具有相同缓存边界；显示 Actor 日志事件不会额外创建模型请求。

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **模式解释**——所选模式作为持久输入元数据交由导演解释；世界操作工作区也保留显式 PlayerAuthority 操作。
- **混合式故事书编辑器**——指导、常用元数据、Director 规则、Actor 能力与角色身份/人设使用专用控件。任意嵌套的设定、世界真相、节拍与私有上下文，在词汇稳定前仍使用分区内局部 JSON。Story Package 交换则独立覆盖聚合、Session 日志、故事书与可移植 `world/` 文件。
- **结算必须显式执行**——自然语言 Director 正文不会自动修改状态。Director 结算工具或可信玩家世界介入必须提交有类型的 patch。
- **后续卡片显示 Actor id**——只有 descriptor 事件携带显示名。加入 Session 级 descriptor 索引前，后续卡片先显示稳定 Actor id。
- **仅源码 checkout**——本包私有且处于实验阶段，不进入正式发布产物。
