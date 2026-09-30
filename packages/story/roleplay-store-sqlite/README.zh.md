---
description: "用于独立扮演剧情记录的专用 SQLite 事务存储。"
kind: "package-reference"
---

# @deepseek-ai/dsh-roleplay-store-sqlite

[English](README.md) | 中文

## 概述

`SqliteRoleplayStore` 使用 Node 的同步 SQLite 驱动实现剧情事务接口。它在专用数据库中存储发布版本、实例事件、投影、回执、检查点与待发送通知，不扩展 Harness KV 存储，也不读取 Actor Session 日志。

## 目录

- [开发约定](#development-contract)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="development-contract"></a>
## 开发约定

构造时明确指定 `path`、`journalMode` 和 `busyTimeoutMs`；路径可以是 `:memory:`。新数据库使用格式版本 1、专用应用身份和完整同步持久性。无法支持、属于其他应用或未标记版本且非空的数据库会被拒绝。`close` 释放所拥有的连接。构造函数创建缺失的父目录；调用方负责选择隔离的数据目录。

写入回调在 `BEGIN IMMEDIATE` 中运行，失败会回滚全部写入。读取回调使用一致的 SQLite 快照。每条记录的键包含作用域、集合和本地标识。回调必须同步；保留下来的事务视图拒绝后续访问。应用服务在事务外发送通知。`embeddedResourceVerifier` 检查可移植路径、规范 base64 字节和 SHA-256 摘要，不写入资源文件。

<a id="model-experience"></a>
## 模型体验

### 剧情持久化

#### 模型看到什么

提供方不添加模型消息；应用通过 `SqliteRoleplayStore` 记录重建限定视角的上下文。

#### Token 影响

SQLite 写入不消耗模型 token。上下文选择和回忆呈现由剧情应用负责。

#### KV Cache effect

存储不组装或重排模型请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- SQLite 访问期间驱动会阻塞宿主线程。独立产品配置使用本提供方，Loader 与浏览器测试覆盖其事务和恢复。多进程竞争验收仍待完成。既有 Story 文件原样保留；本包不提供自动迁移。

<a id="dev-note"></a>
### 开发备注

内存与 SQLite 测试共用回滚、重试和事务生命周期约定。应用语义与集成状态见[剧情核心模块](../roleplay-core/README.zh.md)。
