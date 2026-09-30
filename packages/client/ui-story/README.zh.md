---
description: "不暴露路径的浏览器故事书库与独立故事运行导航。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-story

[English](README.md) | 中文

## 概述

故事书与独立 Story 运行的浏览器展示层。它提供故事库、嵌套运行导航和空白页故事选择器，并且不会向浏览器暴露托管文件路径。

该包协调 `ctx.stories` 与 `ctx.sessions`：每个子项都是一个独立 Story 聚合，并按 `templateId` 归组。故事书上的加号会请求 Host 只复制玩家创作的基础设定到全新 StoryId，再为该次运行建立第一个场景 Session。删除最后一次运行后，故事书会作为空的 `templateOnly` 分组继续显示，并提供明确的新建入口；只有删除故事书才会移除整个分组。两种故事操作都不调用旧归档命令。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

在提供 `stories`、`sessions`、`slots` 与 `locale` 的 Web composition 中，把本包安装为 Story 展示 row。Storyweaver 通过实验性角色扮演 Web profile 使用它。

<a id="understand-the-implementation"></a>
## 理解实现

侧栏把独立 Story 运行组织在共同基础设定下，空 Session 的 Hero 选择器则创建或选择 Story。玩家切换当前 Session 时，故事书与运行项继续保持创建时间顺序。运行标签使用当前公开 Session 标题；如果标题来自受管 `.runtime` 目录，则改用本地化故事回退文案，绝不把内部目录名显示成产品内容。删除创造任务、单次故事或整本故事书都必须明确确认，并使用删除图标而非归档图标。

创造任务始终由 Story 的控制会话登记托管。创建任务时会先通过宿主目录选择器明确授权本地 `cwd`；该选择器只是授权 seam，不要求恢复 coding Workspace 归属。发布会清除场景与 Actor 运行态，但会让模板继续保留有效的控制登记。删除草稿任务会删除草稿 Story；删除已发布任务只归档控制登记并保留已发布故事书。侧栏仅渲染仍由 Story 控制登记托管的创造 Session，因此删除后立即消失、重连后也不会复现，同时无需挂载 coding workspace 服务。

<a id="dev-note"></a>
## 开发备注

归属决策见[故事聚合存储与导航](../../../.agents/notes/implemented/feature/2026-08-29-story-aggregate-storage-and-navigation.zh.md)与[独立故事运行与角色扮演删除语义](../../../.agents/notes/implemented/feature/2026-08-31-independent-story-runs-and-deletion.zh.md)。

<a id="model-experience"></a>
## 模型体验

无，因为本包只渲染浏览器中的故事状态。

#### KV Cache 影响

无。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 已删除的托管 Story 聚合会进入 Host 回收区，浏览器暂不支持恢复。
- 角色私有 Session 刻意不进入普通场景列表。
