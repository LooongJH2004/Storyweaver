# Agent Note: 已记录的请求历史投影将回放与模型上下文分离

Status: implemented

[English](2026-09-02-request-history-projection.md) | 中文

## Problem

长期存在的 Storyweaver Session 同时服务两类消费方。产品需要完整的仅追加 surface 来支持回放、重写、审计和玩家可见 transcript，而模型请求只需要当前交互事务与权威连续性。若向每次 Director 和 Actor 请求发送完整 surface，就会反复携带旧推理、工具调用、工具错误和已经投影到 World、Plot Ledger、记忆或讨论状态的正文。重复载体会降低模型提供方的 KV Cache 复用率，也让 token 压力随 UI 历史而非模型仍需的信息增长。

直接裁剪 Session surface 不可接受：这会移除玩家可见历史并削弱准确重写。只在模型提供方内部过滤同样不可接受，因为会话日志将无法重建模型实际收到的内容。

## Decision

Agent 请求流水线在前缀上下文组装后暴露 `agent/request-history` waterfall。它接收普通的 `Session.deriveMessages()` 结果；返回同一数组会保留普通行为，返回任何其他数组都会把准确替代值记录为 `EpochHeader.historyMessages`。字段缺失表示“从当前 surface 派生”，显式空数组表示“不发送持久 surface 历史”。请求重建与循环不变式使用这份已记录投影，因此每次请求仍是会话日志的纯函数。

Storyweaver 会在每个 Director 或 Actor 轮次的第一步开启新请求序列，并且只投影当前轮次仍在 surface 上的消息。同一轮次内，assistant 推理、工具调用、匹配的工具结果和 Host 纠正消息会一起保留，使 DeepSeek 工具事务与重试保持协议完整。下一次唤醒时，这些原始消息仍可用于回放和 UI，但不再进入模型请求；持久连续性来自有类型的 Story 状态，而不是旧模型 transcript。

Storyweaver 还为高体量连续性指定唯一规范载体：

- Director World 上下文包含当前场景、事实和最多 64 条近期权威事件，但绝不包含 Actor 感知投递账本。Plot Ledger 上下文省略已结算来源事件副本和传输身份，只保留当前 Brief 与紧凑 Run 状态。
- Actor World 上下文包含当前物理场景与最多 32 条主观已投递感知。最新 Director Brief 只补充该 Actor 当前且尚未出现在 World 上下文中的感知，以及不确定项。重复的先前发言和已接受事件列表会被移除；有界近期自身言语或行动仅在当前 World 与讨论投影尚未携带它们时保留。
- 活跃讨论上下文逐字保留最多 12 个近期公开轮次，并为每名参与者补充更早记录中最后一条非空贡献。Actor 只接收自己的私有讨论意图；Director 可以接收全部意图。已经由活跃讨论表示的 Actor 发言不会再进入平行的 World 事件尾部。
- 已批准长篇记忆保持完整。它具有明确的审核与取代生命周期，按时间截断会丢弃语义权威，而不是仅仅移除重复的传输历史。

三项边界是 Cordis 插件配置键：`directorRecentEventLimit`、`actorRecentPerceptionLimit` 和 `discussionRecentTurnLimit`，随附值分别为 `64`、`32` 与 `12`。Token meter 只为 header 持有的投影历史计价一次；它仍报告物理 `surfaceTokens` 与节点用于诊断，而 `totalTokens` 和 `contextBreakdown.messageTokens` 跟随实际请求历史。

## Alternatives considered

- **每个轮次都替换或压缩 Session surface。** 否决，因为 transcript、审计、重试生成和检查点消费方需要独立于模型上下文的完整 surface。
- **只在模型提供方适配器内过滤消息。** 否决，因为分发出的请求将无法从持久状态重建，而且不同适配器可能看到不同历史。
- **保留完整历史，只依靠前缀排布。** 否决，因为排布能改善缓存局部性，却不会停止重复发送旧推理、工具 JSON 和重复语义载体。
- **用另一次模型调用总结每个旧讨论或轮次。** 默认路径不采用，因为这会增加延迟、成本、不确定性和第二权威来源；确定性的有类型投影已经包含所需连续性。
- **每次唤醒 Director 或 Actor 都创建新 Session。** 否决，因为它会拆散所有权、回放、取消、重试和玩家可见 attempt 历史，却不会比已记录的请求投影提供更多信息。

## Consequences

Storyweaver 请求体量现在随有界权威状态与当前事务增长，而不是随 transcript 总年龄增长。稳定的策略、身份、Storybook、记忆和 Outline 区段仍位于请求前部，因此普通世界更新和新轮次能保留更长的逐字节一致缓存前缀。同轮工具纠正仍能看到准确的失败调用与结果；跨轮推理和工具轨迹不会意外变成叙事记忆。

完整 Session 日志独立增长，并继续作为 UI 与审计真源。由于每次变化的投影都是完整请求 header 快照，多步骤轮次会在 header 事件中重复其有界当前轮次历史；这是实现自包含重建的有意存储成本。在使用已审核的语义取代流程，或未来设计记忆专用总结器之前，已批准记忆仍可能超过模型提供方上下文窗口。
