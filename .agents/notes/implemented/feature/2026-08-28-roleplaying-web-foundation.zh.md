# Agent Note: 角色扮演优先 Web 基础

Status: implemented

[English](2026-08-28-roleplaying-web-foundation.md) | 中文

## Problem

稳定版 dsh 浏览器是一套有效的 coding agent 外壳。它的可见语言和控件强调任务、工作区、计划、文件、Skills、Tools、Agent preset 与执行诊断。如果原样用于角色扮演，虚构世界会像另一项编码任务，本应隐藏在角色行为之后的机制也会直接暴露。

此前的 Actor 基础已经建立真正的行为概念——说话、行动、内心活动、主动记忆、遗忘、目标、意图，以及独立 PlayerAuthority——但它们没有角色扮演表层。玩家在界面中的位置也需要明确：玩家并非永久等同于某个角色，而是可以观察、指定方向、介入世界，或临时代演任意角色的存在。

## Decision

由可复用 Story 包与私有实验 Actor／表层包组合角色扮演产品，而不是 fork 稳定 Web 实现：

- `@deepseek-ai/dsh-experimental-client-ui-roleplay` 通过现有 Client definition、keyed renderer、slot、locale 与 theme 服务贡献角色扮演表层。
- `@deepseek-ai/dsh-experimental-roleplay-web-profile` 应用在 `dsh-web-app` 之后，把持久数据重定向进 Storyweaver Home，要求 Session 归属于 Story，选择 `storyweaver` preset，禁用 coding 导向的 Host 与 Client row，并挂载 Story、Actor 和角色扮演包。

稳定的 Session、流式传输、重放、持久化、Conversation assembly、composer、本地化与设置架构全部保留。[故事聚合存储与导航决策](2026-08-29-story-aggregate-storage-and-navigation.zh.md)归属本组合新增的固定存储根、Story 身份、Session 归属与浏览器导航。

## Player authority surface

输入 dock 提供四种可编辑草稿快捷方式：旁观、指定走向、介入世界和代演角色。快捷方式不会自动发送，也不会丢弃已有草稿。第一切片中，标记作为普通持久 user message 传递；这样在可信 PlayerAuthority Remote API 尚未出现时也能使用，同时让临时协议保持明确。

这个草稿边界是刻意诚实的。界面不会声称点击 chip 就已经改变世界状态。后续 Remote 层可以用已提交的 `playerChooseDirection`、`playerInterveneWorld`、`playerSpeakAs` 与 `playerActAs` 调用替换标记协议，而无需改变四种玩家概念。

## Information-difference presentation

Actor 事件直接从持久 Session 日志投影到专用 Chat node kind。说话、行动、角色登场、故事走向和世界介入显示为可见剧情卡片；内心、核心记忆、遗忘、目标和未来意图默认折叠，并带有明确上帝视角标记。这样玩家可以检查私有状态，又不会误把它呈现成其他角色共同知道的信息。

PlayerAuthority 代演不会显示两次。当配对 expression 或 action 已携带 `origin: 'player'` 时，transcript 省略 intervention 审计事件；可见卡片仍会明确标识玩家代演，而不会把决定归因于 Actor。

## Visual and composition policy

角色扮演插件拥有 Storyweaver 品牌、profile 专属 hero/composer 文案和可释放的 theme token 覆盖层，使用羊皮纸中性色、紫罗兰强调色与 serif 故事标题。一个很小的 Conversation presentation registry 允许 profile 替换 placeholder，而不污染通用 dsh 字典。组件只消费语义 token，并同时适配亮色与暗色模式。实现借用了 AIAgentRolePlay 中有价值的信息架构——玩家模式与独立私有角色状态——但不搬运其应用状态，也不让 demo 成为架构依赖。

Web profile 禁用 Workspace 发现与浏览、本地文件 reference、代码执行、技术 Tool 卡片、通用权限 preset 及 Access 选择器、命令与 input trigger、Cordis UI、workflow、deliverable、reference、Skills、通用 Goal/Plan 表层、Subagent 与 Job 控件、Agent preset 管理、插件 inventory/configuration，以及 Trajectory 视图。`storyweaver` preset 还会应用只含八个 Host 自有 `director_*` 操作的作用域白名单，因此隐藏 coding UI 不会掩盖仍可执行的 coding 能力；Creator 与 Actor preset 分别拥有独立的作用域工具注册。模型选择、附件、设置、历史和核心对话继续保留；sandbox policy 继续作为 Host 强制边界，不会显示成故事模式可选权限。

## Alternatives considered

**围绕 AIAgentRolePlay 前端重写 Web 应用。** 这样最快获得视觉相似性，却会重复 Session 重放、流式传输、持久化、本地化、composer 状态和插件组合。保留 dsh 外壳并通过 slot 贡献，可以继续使用这些可靠边界。

**只改现有 coding 控件名称，但保留所有 row。** 仅修改文案仍会暴露文件、技术 Tool call、Plan 状态、Trajectory 视图和 preset 创作概念。可移除的 profile 层让角色扮演表层拥有明确的信息层级，同时保留下层包。

**完成完整角色仪表盘后再交付任何 UI。** 仪表盘需要目前尚不存在的权威世界、关系和调度投影。类型化事件卡片与玩家位置可以先建立交互词汇，又不必伪造状态。

**第一版 UI 就直接调用 PlayerAuthority。** Host API 已存在，但还没有带认证的 Client Remote 约定与 Actor 选择器。如果假装 chip 已经提交权限会误导用户，因此本切片使用可见、可编辑的草稿标记，并把 RPC 迁移记录为延期工作。

## Consequences

源码 checkout 拥有一套可作为单独 profile 层应用或移除的完整角色扮演优先 Web 基础。玩家权限清晰可见，自主 Actor 事件具有不同的世界／私有／玩家语义，每段可见对话都是 Story 场景，普通 Story Session 既不会显示 coding 外壳，也不会获得 coding 工具。

玩家快捷方式仍提交协议文本，而非可信权限 RPC。新场景 Session 使用 Actor-aware `storyweaver` preset，但角色定义尚不会自动创建或唤醒隔离 Actor Agent；也没有聚合实时状态、记忆、心理和关系的侧面板，世界结算器与调度器仍未把意图变为后果。这些仍是后续层，而不是推迟可用角色扮演外壳的理由。
