---
description: "实验组地图：不进入正式发布的私有原型与内部专用插件，供浏览本组的用户与维护者阅读。"
kind: "package-group"
---

# packages/experimental

[English](README.md) | 中文

## 概述

实验组包含不属于任何正式发布的原型能力：它们运行在真实 harness 上，但约定可能变更，也不提供支持承诺。本组包含自主角色扮演 Actor、Agent Teams、跨 realm Inspector，以及预览部署使用的浏览器 worker 运行时与镜像打包器。用这些包来尝试未发布的能力；它们没有稳定性承诺，已发布产品不得依赖它们。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`actor`](actor/README.zh.md) | 基于事件日志的自主虚构 Actor 与上帝视角 PlayerAuthority | `ctx.actors` |
| [`agent-team-profile`](agent-team-profile/README.zh.md) | Agent Teams 的显式源码 checkout profile 层 | — |
| [`agent-team`](agent-team/README.zh.md) | 具名 teammate，成员之间持久消息与共享任务板 | `ctx.agentTeams` |
| [`agent-team-web-profile`](agent-team-web-profile/README.zh.md) | Agent Teams 的显式源码 checkout Web 层 | — |
| [`client-ui-agent-team`](client-ui-agent-team/README.zh.md) | Web Team roster、任务板与 teammate 导航 | — |
| [`client-ui-roleplay`](client-ui-roleplay/README.zh.md) | Web 玩家权限快捷方式与自主 Actor 事件卡片 | — |
| [`inspector`](inspector/README.zh.md) | 用于 Host 调试、Client Runtime 检查、网络采集与 Cordis 树的跨 realm CDP hub | `ctx.inspector` |
| [`tool-agent-team`](tool-agent-team/README.zh.md) | 让模型创建、发消息与协调 teammate 的十个工具 | 按作用域注册工具到 `ctx.tools` |
| [`tool-actor`](tool-actor/README.zh.md) | 按能力筛选的说话、行动、内心、记忆、目标、安排与 yield 工具 | 按作用域注册工具到 `ctx.tools` |
| [`roleplay-web-profile`](roleplay-web-profile/README.zh.md) | 裁剪 coding 表层的角色扮演优先 Web 层 | — |
| [`webworker-packer`](webworker-packer/README.zh.md) | 构建浏览器 worker 预览所消费的 gzip 压缩 VFS 镜像 | 库与 CLI，不使用 ctx key |
| [`webworker-runtime`](webworker-runtime/README.zh.md) | 在专用浏览器 worker 中运行 harness 插件树 | 库与 worker 入口，不使用 ctx key |

-----

<a id="related-documentation"></a>
## 相关文档

- [实验包决策](../../.agents/notes/implemented/architecture/2026-08-18-experimental-agent-teams-packages.zh.md)——位置、发布排除与依赖隔离。
- [自主 Actor 内核基础](../../.agents/notes/implemented/feature/2026-08-28-autonomous-actor-kernel-foundation.zh.md)——Actor 自主性、信息边界、记忆墓碑与独立 PlayerAuthority。
- [角色扮演优先 Web 基础](../../.agents/notes/implemented/feature/2026-08-28-roleplaying-web-foundation.zh.md)——玩家位置、上帝视角卡片、视觉语言与 Web 组合裁剪。
- [Agent Teams 子系统](../../docs/subsystems/agent-team.zh.md)——持久 Team 类型与 `ctx.agentTeams` 服务 API。
- [实验子树规则](AGENTS.md)——实验状态放宽了什么、不放宽什么。

-----

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
