---
description: "Story 包组地图：不透明 Story 身份、受管存储与持久编排边界。"
kind: "package-group"
---

# packages/story

[English](README.md) | 中文

## 概述

Story 组为 Storyweaver 提供不依赖工作目录的单一产品聚合。`story-home` 负责固定且仅 Host 可见的文件系统根目录与各 Story 受管布局。`story` 负责不透明身份、有类型的 Session 角色、持久 Plot Ledger 与严格 Director Brief 提交。两者共同确保浏览器和模型约定不包含路径，同时继续以 Actor Session 日志作为持久角色行为的权威来源。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`story-home`](story-home/README.zh.md) | 固定且仅 Host 可见的 Storyweaver 根目录与各 Story 受管目录 | `ctx.storyHome` |
| [`story`](story/README.zh.md) | 持久 Story 注册表、Session 所有权、Plot Ledger 与 Director 边界 | `ctx.storyRegistry` |
| [`roleplay-core`](roleplay-core/README.zh.md) | 纯剧情规则、独立应用服务与内存测试存储 | 显式构造 |
| [`roleplay-store-sqlite`](roleplay-store-sqlite/README.zh.md) | 专用剧情事务存储与资源验证 | 显式构造 |

-----

<a id="related-documentation"></a>
## 相关文档

- [Story 子系统](../../docs/subsystems/story.zh.md)——Story 词汇、持久化、Remote 投影与生成的 Cordis API。
- [Actor 子系统](../../docs/subsystems/actor.zh.md)——Plot Ledger 所消费的自主角色状态与 NPC 行为事件。
- [Storyweaver Director 职责边界与 Plot Ledger](../../.agents/notes/implemented/feature/2026-08-29-storyweaver-director-ledger.zh.md)——权限与来源设计理由。

-----

<a id="dev-note"></a>
## 开发备注

无。
