# Agent Note: Director 开局工具调度

Status: implemented

[English](2026-09-03-director-opening-tool-scheduling.md) | 中文

## Problem

连续两次真实 Director 会话暴露了同一类开局故障。模型会在大型首次 Outline 出现 JSON 损坏或混入服务端字段后重试，会给 Brief 增加不支持的字段，还会在自动讨论后复用过期 World 修订。Host 纠偏进一步拉长了序列：活跃讨论收到要求重建场景工作的通用推进指令，而已经完成的讨论在自身总结满足玩家旁观推进后，仍被强制追加无关的 Brief、旁白与调度。

工具 schema 正确拒绝了无效写入，但模型可见的读取投影和生命周期指令与这些 schema 不一致。只修改提示词无法纠正由 Host 续步明确要求的矛盾工作。

## Decision

Director Outline 上下文提供 `tool_input_base`，采用 `director_update_outline` 接受的准确 snake-case 字段；更新模式、锁定 id、待审核建议摘要与更新元数据则放在 `read_only_governance` 下。服务端自有的条目来源与修订历史不会表现成可写字段。首次 Outline 指引只要求 premise 和开局所需的计划区段，并明确用 `candidate` 表示计划中的 Beat。Brief 指引列出 Actor 条目仅接受的三个字段。

开局与单纯旁观推进默认使用普通单回合 Actor 调度。`director_start_discussion` 会说明私有准备和逐轮 Actor 调用成本，并只用于必须互相回应的具体剧情拍。模型若在发起一个已具备调度条件的讨论后停止，专用的有界续步只要求调用 `director_dispatch_actors`，并禁止重建 Outline、场景、Brief 或旁白。若较早的无效序列在这些前置条件之前开启了讨论，同一条分阶段续步只补齐缺失的 Brief 或旁白。失败的调度不会被算作已经完成推进。

讨论调度进入总结阶段后，Host 续步会携带准确的当前 World 与讨论修订。Director 旁白总结结果并关闭讨论；成功关闭就是该玩家回合的终态。Host 不会再追加新 Brief 或无关的讨论后剧情拍。

本决策只取代[角色扮演世界操作与可移植故事](../feature/2026-08-30-roleplay-world-operations.zh.md)中的讨论后续步。持久讨论、玩家自有的轮次上限、自动发言权路由和必需的 Director 总结保持不变。

## Alternatives considered

**只修改可编辑的故事书提示词。** 现有 Story 可以保留玩家创作的规则，而且任何提示词都无法覆盖明确要求重复工作的 Host 续步。固定工具描述、写入投影与分阶段生命周期处理会作用于每个当前 Story。

**接受服务端自有 Outline 字段，或接受 planned Beat 等直觉别名。** 这会模糊玩家锁、审计归属以及 Arc 与 Beat 不同的状态集合。可安全复制的写入投影可以避免错误，而不削弱持久化校验。

**把 Outline、场景、Brief、旁白、讨论与调度合并成一个开局工具。** 隐藏独立修订记录可以减少调用次数，但也会删除有价值的审核、纠正和恢复点。本次改动只移除意外重试，保留有意的操作。

**每场讨论后都强制推进另一个剧情拍。** 额外剧情拍可能制造动势，却会把一次完成的交流变成第二次未请求的推进，并与 `director_resolve_discussion` 的终止语义冲突。玩家可以在下一回合明确请求继续。

## Consequences

开局仍会分别调用首次 Outline、物理场景、Brief、客观旁白与必要的 Actor 唤醒，因为这些记录具有不同的归属与修订。其模型可见输入更小且可安全复制，Host 纠偏会沿当前讨论阶段继续，而不重启整个序列。完成讨论后会在总结处结束，从观察到的长路径中移除三次强制 Director 调用。剧情确实需要交流时，玩家设定的讨论上限仍可能触发多次 Actor 回合；指引会明确暴露这一成本，不再默认为每个多 Actor 开局都创建讨论。

Director 定向测试固定验证 Outline 投影、工具描述、成功调度判定、活跃讨论续步、准确总结修订和讨论关闭终态。真实模型的节奏与戏剧质量仍由玩家执行产品验收。
