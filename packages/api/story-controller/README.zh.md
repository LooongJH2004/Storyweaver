---
description: "不暴露路径的 Story Remote 命令与可重连浏览器状态。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-story-controller

[English](README.md) | 中文

## 概述

Story Controller 向浏览器投影活跃故事，并负责创建、重命名、简介、归档、当前场景与场景归档命令。`StoryView` 只包含 StoryId 和有类型的 Session 身份，绝不包含 Host 路径。每次 follow 都以完整基线开始。

`createFromTemplate` 是角色扮演的新运行边界。它读取现有运行的规范故事书身份，只复制玩家创作的 `world` 与 `assets` 资料，并创建具有独立人物库和作者初始认知的新 Story 聚合。事件历史、记忆、讨论、Director Outline、Plot Ledger、演员会话和场景会话从空开始。浏览器通过 `StoryView.templateId` 把这些独立聚合归在同一本故事书下。删除单次运行时，`delete` 会把最后一条记录保留为 `templateOnly`：运行态与 Session 所有权全部清空，但基础设定仍可用于下一次运行。删除整本故事书仍会移除全部聚合，并把托管文件暂存到 Host 回收区。两种角色扮演操作都不再调用归档。

`StoryView` 包含持久 Plot Ledger。`commitDirectorBrief` 命令要求使用 Story 自有的场景或控制 Session，并且只转发严格 Director Brief 字段；过期修订、非活跃 Actor、非当前场景及额外角色行为字段都会明确失败。

`StoryView` 也包含完整 Director Outline。`updateDirectorOutline` 接受带锁定状态与更新策略的准确修订玩家替换；`resolveDirectorOutlineSuggestion` 记录玩家对待审核 Director patch 的明确接受或拒绝。大纲失败使用稳定的过期、锁定、无效与建议不存在错误码。

同一投影还携带持久 Director Run 的修订、状态、Actor 队列、attempt ownership、失败与已接受事件引用。六个准确修订命令在不暴露 Actor 提示的前提下提供可信玩家控制：恢复未完成 Actor、重试单个失败或已取消 Actor、暂停 Run、终局取消 Run、跳过一个未完成 Actor，或取消一个运行中的 Actor attempt。Host 会把执行与取消委托给 `DirectorRunExecutor`；缺少该 provider 时，Remote 返回稳定的 `director-run-unavailable` 失败。

玩家角色状态投影读取已登记的实时或持久 Actor 日志，以及当前世界持有字段。作者值只在每次运行初始化一次；运行值为空或停用时不会回退到开局值。`updateState` 检查所有权与精确修订号，必要时通过 Session 控制器恢复已登记但未运行的 Actor，并拒绝非法类型或范围。`updateStyle` 共用故事书保存入口或 Story 提示词修订号，也支持面向指定对象的当前场景指导。

`storybook` 返回完整规范的玩家可编辑 JSON 与内容修订，不暴露受管路径。`updateStorybook` 只接受准确修订的完整替换，应用 Story 共享 schema，按 Story 串行写入，并原子替换文件。`prompts` 同时返回 Director/Actor 设定、运行规则、能力调用规则和思考过程语言的故事书基础值、当前 Story 覆盖值、最终生效值与来源；对应更新命令通过准确修订分别写入这些独立模块。`contextPreview` 委托运行时 `storyContextRenderer` 返回请求分批前的当前完整区段，并标明 `system`、`user` 或 `assistant` 身份、来源、权限、可见性和纳入原因。Actor 预览只包含所选 Actor 的私有设定和数据；世界真相、Director Outline 和其他 Actor 私有数据不会出现。预览读取在线或持久日志，不挂载 Agent 或初始化状态。未初始化 Actor 没有当前状态区段，并返回 `pendingActorInitialization: true`；运行时提供者缺失时明确失败。这些区段不是分批后的线端请求；`requestContextPreview` 才重建指定的已发送请求。

Remote 还提供有类型的 PlayerAuthority、世界结算、审核记忆、持久讨论、玩家讨论干预与上下文配方命令。每个变更操作都会检查准确的当前修订，并返回完整的最新 `StoryView`。上下文预览应用已保存的配方，完整纳入每个启用区段并报告字符数与估算 token；所有可见区段都可重排、启停和选择消息身份。创作配方区段会暴露标题和完整正文，包括带稳定 `custom:*` 身份的玩家自建模块，因此编辑器与预览共用实际请求渲染器。运行规则与能力调用规则是可编辑的模型指导，不能扩大 Host 实际注册的工具、数据可见性或结算权限。Story Package 导出生成严格的版本 5 包，包含版本 12 Story 记录、版本 6 故事书、已注册 Session 日志、带 Actor 撤回边界的版本 3 回合检查点，以及 `world/` 下的可移植文件；导入先校验大小限制、路径、角色和每份 Session 日志，再签发全新的 Story 与 Session 身份。

`reviewContext` 按来源处理单元原子审批，同时检查提案与目标短记修订；`editContext` 编辑待审核单元，`pinContext` 控制某个读取者的原文保留，`contextSource` 通过当前故事来源索引读取完整原文，包括离线日志。这些是玩家权限操作，不是模型工具。`requestContextPreview.retention` 来自所选历史请求，而非当前故事状态。

人物工作区把旁观或 Actor 称呼与显式作者编辑区分开。人物查询使用 Story Controller 的 `characterPageSize` 配置，默认 40。玩家认知修订保留历史；收录故事书先预览基础设定，可选当前认知、状态和记忆，确认时同时校验预览全文、人物修订与模板修订。收录保留所引用的模板身份，并拒绝缺失依赖；它不安排出场，也不改变已有故事。

独立实例的 Remote 入口现位于 [`api-roleplay-controller`](../roleplay-controller/README.zh.md)，其客户端导出只提供应用命令与明确的查询视图。本包在产品切换前保留当前产品的 Story API。

## 目录

- [开发约束](#development-contract)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

分阶段接入的 `./roleplay` 入口在独立应用服务上提供 `roleplay` Remote 命名空间，覆盖版本发布与创建、人物和认知命令、风格与出入场修改、讨论控制与执行、素材提取，以及明确区分的游玩和上下文查询。浏览器载荷提供修订号与命令 ID，入口生成玩家权限。它不访问存储，也不恢复 Agent。隔离 Loader 测试通过真实 HTTP 网关创建实例并读取游玩视图。现有浏览器仍使用旧 Story 入口，等待 UI 与产品切换。

<a id="development-contract"></a>
## 开发约束

该 wire API 刻意不提供 Workspace 导航或迁移分支。

`requestContextPreview` 校验 Story 所有权后，委托 `HarnessRequestHistory` 读取执行日志。事件坐标选定记录中的上下文与已解析设置，不使用当前 Story 设置。它通过 [LLM 请求重建](../../llm/llm/README.zh.md#historical-request-inspection) 返回 `requestJson`，保留发送方的序列化结果。

历史缺失、坐标无效或不支持重建时返回 `story-request-context-unavailable`，不使用替代内容。检查不会启动 Actor、发送模型请求或写入完整请求副本。

<a id="dev-note"></a>
## 开发备注

Director 约定见 [Storyweaver Director 职责边界与 Plot Ledger](../../../.agents/notes/implemented/feature/2026-08-29-storyweaver-director-ledger.zh.md)；浏览器写入归属[带修订控制的故事书编辑](../../../.agents/notes/implemented/feature/2026-08-29-storybook-authoring.zh.md)与[角色扮演世界操作和可移植故事](../../../.agents/notes/implemented/feature/2026-08-30-roleplay-world-operations.zh.md)。

<a id="model-experience"></a>
## 模型体验

无，因为本包只传输不含路径的故事状态。

#### KV Cache 影响

无。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 已删除 Story 暂无浏览器恢复入口；其托管聚合会暂存于 Host 回收区。
- Actor 状态读取包含已持久化的非活跃 Session；编辑非活跃 Actor 时，由 Session Controller 恢复其已注册 Agent。
- Actor 执行仍在 Host 内。检查点控制不返回提示词；历史请求检查单独向玩家展示选定的 Story 所属请求。
- Story Package 导入始终创建新聚合，不会覆盖已有 Story，也不会保留导入包中的 Story 与 Session 身份。人物身份及观察者专属引用在导入的故事中保持稳定。
