---
description: "以不透明身份持久化故事，并明确场景、控制与角色 Session 所有权。"
kind: "package-reference"
---

# @deepseek-ai/dsh-story

[English](README.md) | 中文

## 概述

`dsh-story` 将 StoryId 作为产品聚合身份。故事拥有元数据以及有类型的 Session 注册：玩家/导演控制、公开场景和角色私有会话。它不会根据 cwd 发现故事，也不会导入旧 Session 历史。物理路径始终留在 `ctx.storyHome` 后方，只有命中已知 StoryId 后，Host 才能解析受管运行目录。

归档只追加持久状态，不删除日志。角色注册必须携带稳定 ActorId；每个故事最多有一个活跃控制 Session；同一 Session 不能属于两个故事。

角色扮演中的新运行与删除不再复用这项旧归档原语。每条当前记录都携带稳定 `templateId`：共享基础设定的运行可以归组，但各自拥有不同 StoryId，以及完全独立的世界、记忆、大纲、账簿、Actor 与 Session 状态。注册表删除会持久移除记录和 Session 所有权索引；Story Home 则把托管目录暂存进回收区，并在规范删除失败时回滚。

每个 Story 保存带修订的 Plot Ledger 与最新 Director Brief。Brief 按准确修订更新当前局势和角色专属感知、不确定性；已确立事实与未决事项从已批准短记派生，新 Brief 的遗漏不会删除它们。Actor 调度开始前可修正 Brief，开始后须恢复持久运行。严格验证拒绝在 Brief 中夹带台词、决定或自主行动。

Ledger 会保留采用准确修订控制的 Director Run 检查点。Run 状态覆盖已提交、调度中、已暂停、可重试、已完成和已取消；Actor 检查点覆盖待处理、运行中、已完成、失败、已跳过和已取消。每次调度都获得 Host 签发的 attempt id、单调 generation、Actor Session id 与尝试前事件下界。结算必须拥有该准确 attempt，才能接受事件引用。已完成 Actor 永远不能再次调度；恢复只选择未完成 Actor，并在额度失败和重试间保留已接受引用。

同一聚合还拥有非世界事实、带修订号的 Director Outline。它分别管理长期意图、主题、硬约束、故事弧、节拍、伏笔、悬念与叙事时钟。每个条目都有稳定身份、玩家锁定状态与作者来源。玩家替换使用准确修订写入；Director patch 会根据玩家选择的模式自动更新未锁定部分，或进入审核队列。已解决节拍、已埋设或已回收伏笔必须携带持久事件引用。

注册表从匹配 `npc_commit_turn` 事务中的 `actor/expression` 与 `actor/action-intent` 操作接收 NPC 对白和行动意图。每个行为来源同时标识物理 `actor/commit` 事件及其操作索引。运行时 invariant 会拒绝绕过回合工具的 Story 自有自主行为。新 Brief 会把待处理 NPC 事件作为明确来源消费掉；Actor Session 日志仍是角色行为的权威记录。

共用的严格 `schemaVersion: 6` 故事书解析器定义可见外观、共同常识与人物初始认知或认识关系。Story 在初始化时把这些种子复制到独立人物库与认知体系；初始 `privateContext.perspective` 也成为作者提供的认知条目，此后 Actor 上下文读取当前认知。未知事实保持缺省。主演仍是叙事锚点，不限制玩家代演。

实例人物共用 Actor 机制，人物登记、在场、聚光与 Session 创建分别管理。准确修订的人物编辑保留身份与经历。认知包含自然语言判断、观察者私有实体引用、可见证据、判断态度和修订历史；Actor 提交在接受状态或行为前校验整批认知，判断可以错误、存疑或相互矛盾。遗忘和玩家恢复都保留历史。见[动态人物与认知](../../../.agents/notes/implemented/feature/2026-09-06-dynamic-characters-and-knowledge.zh.md)。

版本 12 Story 记录还会持久化角色扮演运行状态、本次故事提示词、运行规则、能力调用规则与思考过程语言覆盖值。故事书保存这些可复用基础设定及每名 Actor 的私有角色设定；新运行通过复制故事书获得基线，之后的 Story 覆盖值只影响本次运行。类型化玩家权限命令可记录剧情方向、世界介入、玩家来源发言与玩家来源行动，无需通过自由格式聊天标记转交权限。世界结算使用准确修订的 `set`/`remove` patch，对 Actor 尝试只记录一次接受或拒绝结果，并投递受众专属感知。长篇记忆必须先提案再由玩家明确审核；批准提案只替代显式选中的条目。每条记忆分别保存导演连续性、公共知识和逐角色主观记忆，Actor 绝不会在自己的内容为空时回退读取导演专属内容。持久讨论会保存导演或玩家发起来源、参与者、发言权、队列、记录、轮次预算、玩家干预，以及完成前必经的总结阶段。上下文配方允许玩家排序、启用并为每个区段指定 `system`、`user` 或 `assistant` 身份；所有可见区段完整纳入，不以字符数截断，字符与估算 token 仅作统计。Host 工具授权、Actor 私有数据隔离和世界结算仍由代码强制执行。

上下文配方还包含可分别编辑的导演分析约束和演员沉浸约束。玩家可以新增、排序、停用、编辑或删除带稳定 `custom:*` 身份、标题、完整正文和指定消息角色的静态模块；预览与模型请求使用同一份创作内容。

原文来源、分知情范围的短记、审核提案与原文固定状态共同进入 Story 检查点。短记经玩家审核后生效，已解决结果持续保留，直到明确替换或归档。来源引用保证可追溯，不证明语义完整。详见[经批准的上下文保留](../../../.agents/notes/implemented/architecture/2026-09-04-player-approved-context-retention.zh.md)。

角色状态与表演指导共用故事书和运行态定义，详见[动态状态与风格](../../../.agents/notes/implemented/feature/2026-09-05-storyweaver-dynamic-state-and-style.zh.md)。状态字段包含稳定身份、所有者、类型、可选范围与更新指导。精确修订变更保留历史及停用字段；Actor 只能修改自身主观状态，客观字段及可感知对象由世界结算维护。风格模块先解析本次故事覆盖，再叠加场景指导，并与人物经历分开。

共享的故事书、状态、认知、风格与身份规则由 `roleplay-core` 拥有。本包导出这些定义，并为人物库集成提供宿主时间和标识生成。独立剧情应用仍在集成，当前产品持久化机制见下文。

## 目录

- [开发约束](#development-contract)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="development-contract"></a>
## 开发约束

Story 记录要求持久化版本 12，旧运行记录会被拒绝；可复用故事书保留独立格式。

<a id="dev-note"></a>
## 开发备注

归属决策见 [Storyweaver Director 职责边界与 Plot Ledger](../../../.agents/notes/implemented/feature/2026-08-29-storyweaver-director-ledger.zh.md)、[带修订控制的故事书编辑](../../../.agents/notes/implemented/feature/2026-08-29-storybook-authoring.zh.md)、[角色扮演世界操作和可移植故事](../../../.agents/notes/implemented/feature/2026-08-30-roleplay-world-operations.zh.md)、[独立故事运行与角色扮演删除语义](../../../.agents/notes/implemented/feature/2026-08-31-independent-story-runs-and-deletion.zh.md)与[故事撤销检查点和可创作上下文模块](../../../.agents/notes/implemented/feature/2026-09-01-story-rewrite-checkpoints-and-context-modules.zh.md)。

<a id="model-experience"></a>
## 模型体验

无，因为本包只负责持久故事元数据与 Session 关系。

#### KV Cache 影响

无。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 注册表最近更新时间发生在故事变更时，而不是每个场景事件。
- 故事清单由权威领域数据派生，不支持独立编辑。
- 注册表负责持久化 Brief 与 Outline，但不会自行创建或唤醒 Actor Agent；Host 编排由 `dsh-experimental-tool-director` 负责。
- 结算必须显式使用有类型的命令；Director 正文绝不会通过推断修改世界状态。
- 叙事时钟属于持久规划数据，但目前没有独立 scheduler 在时钟推进时唤醒 Actor。
