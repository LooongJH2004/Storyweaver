---
description: "固定且仅 Host 可见的 Storyweaver 存储根目录与故事目录结构。"
kind: "package-reference"
---

# @deepseek-ai/dsh-story-home

[English](README.md) | 中文

## 概要

`dsh-story-home` 用固定的 Storyweaver 数据根目录取代进程工作目录所有权。Windows 默认路径为 `%LOCALAPPDATA%/Storyweaver`，可由 `STORYWEAVER_HOME` 或插件 `root` 覆盖。Host 会在根目录下创建 `stories`、`sessions`、`storages`、`attachments` 与 `trash`。每个故事拥有 `assets`、`exports`、`world` 和 `.runtime`，浏览器 API 只能看到不透明的 StoryId。

## 开发约束

该存储重构刻意不导入 Workspace 或历史 Session。`copyBaseline` 只把 `assets` 与 `world` 复制到新的 Story；`.runtime`、`exports` 和 Session 运行态绝不会跨越新故事边界。`trashStory` 会先把托管聚合放进 `trash`，当规范注册表写入失败时可安全回滚。

## 模型体验

无，因为本包只负责 Host 存储路径。

#### KV Cache 影响

无。

## 已知限制与后续工作

- 便于阅读的 `story.json` 是派生清单，不是注册表真相源。
- 浏览器删除会移除规范 Story，并把托管目录暂存到 `trash`；当前没有浏览器恢复入口。
