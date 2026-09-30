---
description: "启动使用事务剧情存储的独立 Storyweaver 实例。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-roleplay-web-profile

[English](README.md) | 中文

## 概述

此私有产品层叠加在 `@deepseek-ai/dsh-web-app` 之后。默认组合安装独立剧情应用、SQLite、有类型的浏览器 API 和 `ui-narrative`。故事书发布版本、实例与 Harness 会话分别拥有身份和数据。产品组合不再安装原 Story Registry、Story API、Actor 业务服务与 Director 工具。

AI 创作在原生对话、工具、权限和请求历史界面中使用独立的 `storyweaver-author` 预设。创作页使用宿主目录浏览后端，不依赖通用工作区注册表。导演和演员执行保留各自受限工具作用域，恢复创作界面不会启用旧 Story 写入器。

## 目录

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Use this package

使用 `pnpm dsh plugin --profile web add ./packages/experimental/roleplay-web-profile` 安装，或通过支持的 profile 启动一次：

```sh
pnpm dsh web --patch ./packages/experimental/roleplay-web-profile/cordis.patch.yml
```

默认 Home 是平台数据目录下的 `Storyweaver-independent-v1`；`STORYWEAVER_INDEPENDENT_HOME` 可指定其他独立目录。既有目录保持原样，不自动转换旧运行存档。作者故事书先导入为草稿，审阅发布后再创建实例。独立剧情存档导入为新实例。

## Understand the implementation

[`cordis.patch.yml`](cordis.patch.yml) 安装 Story Home、`roleplay-services` 和 `api-roleplay-controller`，启用 Web bundle 提供的剧情界面。Session 证据、附件和通用存储使用选定 Home。专用 SQLite 负责剧情提交、投影、修订、幂等和通知；Harness 负责实际请求日志与执行恢复。

游玩保留四种输入模式、已接受的旁白与行为、讨论、打断、检查点和补偿恢复。作者工作区包含设定、人物、风格、状态、上下文、大纲审核、素材收录与可选实时诊断。执行模型使用宿主设置，已有演员会话也会在下一次执行时读取新选择。密钥仍由通用模型设置管理。

旧组合仅保留在 `tests/fixtures/legacy-profile` 中用于基线回归，不再作为包导出或支持的启动 profile。新旧数据权威之间没有双写或自动同步。

导演与演员工具委托给独立应用命令。导演结算世界变化；演员拥有主观认知与已接受行为。单个角色回应后，配置的导演续步可依据已接受的回应选择下一位发言者。当前预览与实际上下文共用视角查询。历史请求读取当时证据及模型回应。草稿正文与推理不会自行成为剧情。

## Model Experience

通过安装的剧情应用与演员执行器间接影响模型；这些模块负责模型指令、工具和视角投影。

#### KV Cache effect

没有测量时，不声称缓存、token 或延迟改善。

## Known Limitations and Deferred Work

无密钥 Loader／浏览器验收覆盖隐私、配角、状态、风格、设定冲突、大纲审核、讨论、恢复、存档、素材收录、实时草稿、模型选择与窄屏。领域和 SQLite 测试覆盖隔离、回滚、重试身份、资源字节与大量离场人物查询。原生场景测量及其质量限制见[讨论与记忆计划](../../../.agents/notes/implemented/feature/2026-09-12-discussion-perception-memory.zh.md#execution-evidence)，不代表普遍表演质量或长期泄漏率已经得到证明。

- 本轮不含离场自主调度、运行中分叉、实例合并或旧数据隐式迁移。结构化高级设定使用 JSON 编辑器。实时诊断合并更新但仍扫描执行历史；超长日志的性能需要单独测量。

### 开发备注

参见[独立剧情架构说明](../../../.agents/notes/implemented/architecture/2026-09-07-independent-narrative-instances.zh.md)。旧文件保留为原始证据。
