---
description: "把实验性 Actor 领域操作转化为模型自主行为的作用域工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-tool-actor

[English](README.md) | 中文

## 概述

`dsh-experimental-tool-actor` 为每个已绑定 NPC 提供按能力筛选的原生角色扮演界面。模型只提交人物含义与文本；ID、检索、匹配、持久化和可见性均由宿主处理。普通 assistant 文本只是私有草稿，不是对白或行动。

`npc_commit_turn.state_changes` 在与有序行为相同的原子提交中新增或更新 Actor 自身主观字段。已有字段使用稳定 ID 与精确修订号。模型不能改变已有定义、写入其他 Actor 的状态或结算客观伤势。每个新增定义都需要说明与剧情原因；类型或范围错误拒绝整个提交。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用此包

在 `@deepseek-ai/dsh-experimental-actor` 之后挂载：

```ts
import type { Context } from '@deepseek-ai/cordis'
import * as ToolActor from '@deepseek-ai/dsh-experimental-tool-actor'

declare const ctx: Context

await ctx.plugin(ToolActor, { isolateGlobalTools: true })
```

`isolateGlobalTools` 默认为 `true`，隐藏继承的全局工具。本包只向模型提供 `npc_commit_turn`，角色能力在执行时约束可提交字段。Story Director 插件另行为每位 Actor 安装固定的只读 `roleplay_recall` 工具。

| 能力 | 提交字段 |
|---|---|
| `speak` / `act` | 有序发言 / 行动 `behavior` |
| `reflect` | 想法、情绪、信念、关系 |
| `memory` | 记忆、释放记忆 |
| `goals` / `schedule` | 目标 / 意图 |

相关记忆与最多六条选定转折进入私有上下文。`npc_commit_turn` 的固定可选字段 `context_update` 默认最多接收 16 个来源处理单元（`maxContextUpdateUnits`），每个单元携带短记修改、原文引用及承接或归档建议。`$behavior:N` 引用本次已接受的零起始行为序号，其他引用必须已经可知。待审核短记未经玩家批准不会生效，也不允许裁剪原文。

自治模型每回合只调用一次 `npc_commit_turn`。该事务是增量：普通反应通常只提交有序言行与姿态，不变的私有状态和不存在的心路转折应省略。其 `behavior` schema 是带显式判别字段的发言/行动二选一结构，因此每一项都必须携带 `kind` 以及对应必需的 `text` 或 `attempt`。Host 在一次工具执行内按顺序落账并结束回合；共享 Actor 状态不会被错误地标记为并发安全。心路转折必须伴随实质信念、关系、目标或记忆变化；与现有变化完全重复的转折会在事务写入前被拒绝。行动上的描述性 intent 可作为非权威模型提示传入但不会持久化；只有规范的发言 intent 会被保存。JSON 参数损坏时，工具会返回可操作的纠正信息，让模型保留原回应、只修复序列化。主动沉默必须显式提交空 `behavior` 和沉默姿态的 `npc_commit_turn`。若模型只输出普通文本后停止，本包会注入一次有界纠正，要求它不要重新开始或改写已经完成的思考，而是立即提交事务；第二次仍漏调则保持未闭合，并成为可重试的 Director Run 失败。普通 assistant 文本永远不会成为虚构对白。

在群组讨论的公开席位上，`discussion.action=speak` 只结束该 Actor 当前这次贡献，并让交流继续。`conclude` 请求结束整场讨论，仅适用于已经形成具体共同结果、陷入不可调和的僵局或确实再无有效回应的情况；仅仅说完自己的答案并不满足条件。该区分既保留角色自主收束的能力，也避免每句完整发言都过早触发全场总结。

<a id="understand-the-implementation"></a>
## 理解实现

`actor/bound` 触发后，工具通过精确 Actor Agent 的作用域 context 注册，并在解绑/销毁时移除。适配器把所有操作委托给 `ctx.actors`，不重复身份、记忆、来源或状态转换规则。

策略明确说明 PlayerAuthority 可以经由角色介入，但来源仍是玩家。这样既维持角色扮演连续性，也不会教 Actor 把玩家覆盖误认为自己的自主选择。

<a id="dev-note"></a>
## 开发备注

决策记录见[自主 Actor 内核基础](../../../.agents/notes/implemented/feature/2026-08-28-autonomous-actor-kernel-foundation.zh.md)与[角色心路历程和受众隔离长期记忆](../../../.agents/notes/implemented/feature/2026-08-31-actor-journey-and-audience-memory.zh.md)。

<a id="model-experience"></a>
## 模型体验

### Actor 策略与能力工具

#### 模型看到什么

模型看到固定的行为约定与一个稳定的 `npc_commit_turn` schema，各种能力配置和讨论阶段使用相同定义。字段表达稀疏的私有状态变化和有序行为。Story 集成提供可见的来源与事项 id，以支持连续性和授权回查；其他私有持久化 id 仍隐藏。普通 assistant 文本没有世界权威。

#### Token 影响

策略会提供当前 persona、活跃记忆、已选心路历程、目标、意图和有界近期活动，以及 `npc_commit_turn` schema。策略要求整个回合只规划一次、提交一次；除非场景造成持久变化，否则应省略 `turning_points`。事务成功后，对应事件已经进入 Actor Session 日志并返回紧凑 JSON。

#### KV Cache 影响

工具 schema 在私有准备与公开发言之间保持不变。Story 集成采用每位 Actor 独立的上下文基线与精确追加变化，并定期重建基线。能力与阶段检查发生在执行时，不会增减工具。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 此包只提供 Actor 工具；不会投递世界观察或其他 Actor 的发言。
- 世界行动结果和受众感知需要后续环境适配器。
- 已安排意图需要后续唤醒调度器。
- 动态状态仍会改变易变请求后缀；目前尚无语义上下文预算策略。
- 全局工具隔离只是进程内组合，不是操作系统或网络沙箱。
- 此包私有且处于实验阶段，由 Storyweaver 角色扮演 profile 挂载。
