---
description: "独立故事命令、按受众区分的查询与浏览器 Remote 命名空间。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-roleplay-controller

[English](README.md) | 中文

## 概述

本入口适配器提供独立的 `roleplay` Remote 命名空间。它认证玩家命令，将操作委托给独立应用服务，并返回明确的游玩、作者和历史视图。它不打开 Agent、不解析 Session 日志，也不直接写存储。

公共请求使用具名且不依赖框架的数据契约。宿主与客户端声明均经过检查，客户端检查关闭了 `skipLibCheck`。作者工作区、实例设置、大纲审阅、版本查看与故事书入口删除分别委托应用方法。`followPlay` 在剧情提交后发送最新的有限游玩视图，合并修订通知，并在取消或释放时解除订阅。该流包含已发布剧情与真实执行阶段，不包含虚构进度或模型草稿。

不依赖 React 的 `roleplayBrowser` 模型拥有故事库基线、实时游玩订阅和作者查询镜像。切换视角会立即清空旧视图；代次检查拒绝迟到的普通或流式响应。历史页与实时订阅分离，作者人物查询绑定工作区捕获的修订。重连由 Gateway 流管理；模型在失败时保留可用数据，并报告订阅释放错误。

创作 Remote 将目录选择委托给宿主选择器，将任务设置委托给创作所有者。移除故事书保留发布版本和实例。实例移除与玩家要求重写委托给恢复应用，并携带明确实例身份、修订和重试命令 ID。叙事上下文预览可接受待发送要求，已记录请求仍是历史证据。

参与者结束后，手动推进讨论会等待导演收尾。重试复用收尾回执及其已校验修订。执行诊断携带精确的原生回合用量、请求次数和先前实时步骤，不暴露技术会话的归属控制。

## 目录

- [开发契约](#development-contract)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

<a id="development-contract"></a>
## 开发契约

通过 dsh 配置与 `roleplay-services` 及 Typert 网关共同挂载。生成的 `/remote` 导出和 `/client` 适配器提供 `ctx.roleplay`；浏览器消费者不依赖 StoryController 或 Story 聚合。宿主与客户端编译面保持分离。

写入请求保留命令 ID 和预期剧情修订号，玩家权限由宿主构造。查询区分已发布游玩条目、完整作者记录、当前上下文预览和已保存历史。`advance` 将导演指令与独立提供的可选 `actorFacingBeat` 委托给运行服务，不把导演指令复制到角色可见字段。导演推进与暂停委托给运行服务；检查点和恢复委托给恢复服务。导出按精确剧情修订收集完整关联执行证据，导入创建新的独立实例。

应用错误保留稳定的 `roleplay-` 错误码。修订冲突需要刷新后重新审阅；不变命令的重试保留原身份。导入导出使用由存档应用验证的 JSON 文件内容。既有导入执行日志保持为证据，不成为运行会话。

`retention`、`reviewRetention` 与 `recall` 委托给记忆保留应用。作者查询明确选择 `director` 或 `actor:<id>`，并可绑定历史剧情修订；模型工具没有此类所有者选择参数。审核写入使用统一的玩家命令标识与预期修订。生成的客户端开放具名领域输入与视图，不引入 Actor、Session 或存储依赖。

`executionRequests` 和 `executionRequest` 接收剧情作用域及适配器签发的请求坐标；可选证据 ID 标识该实例存档内的导入请求。它们委派应用查询，此 API 不接受任意 Session ID，也不解析执行事件。实例、人物或修订变化时，Client 检查镜像清除过期私密数据。`commandStatus` 查询剧情回执和执行结果，使浏览器能区分不确定响应、确认拒绝和已结束执行。

<a id="model-experience"></a>
## 模型体验

### 上下文检查

#### 模型看到什么

本浏览器适配器不增加模型指令。`executionRequest` 读取已记录的请求；上下文预览委托给执行使用的同一应用渲染器。历史重建由 Harness 读取器负责。

#### Token 影响

检查不执行模型，也不增加请求 token。后续故事执行使用应用上下文与选定的提供方。

#### KV Cache effect

无。本包不组装模型请求，也不声称测得缓存收益。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

embodimentChoices 分别返回用于控制选择的运行人物 controlEntries，以及用于即时场景代演的 entries。浏览器镜像仅接纳与当前显示修订相符的两组列表，并丢弃其他运行的迟到结果。控制候选不依赖旁观视角是否已遇见此人。

controlPlayer 将带修订校验的玩家接管或解除操作交给 PlayerApplication；passPlayer 明确让出玩家拥有的讨论发言权。两者通过现有变更及错误镜像返回命令效果回执。PlayView 提供 playerActorId 与 playerTurn，浏览器不再从阅读视角或故事书主角推断控制权。这些操作不编辑故事书元数据。

- 高级结构化字段使用 JSON 编辑器。上下文预览显示剧情片段，执行后可查看完整的提供方请求。独立模型诊断不代表长期表演质量或信息泄漏表现已通过验收。

<a id="dev-note"></a>
### 开发备注

参阅[独立剧情实例提案](../../../.agents/notes/implemented/architecture/2026-09-07-independent-narrative-instances.zh.md)。新产品组合通过验收前保留旧数据，不引入双写。

流式 `followExecution` 查询先授权剧情视角，再由 Harness 适配器读取技术事件。回应镜像在视角变化时清除迟到私密帧。`executionModel` 与 `selectExecutionModel` 将模型路由校验和带修订检查的持久化委托给 Harness 设置所有者；浏览器代码不配置 Agent 或直接写入存储。

浏览器检查镜像提供专门的 inspectRecorded 路径，读取精确的执行分页和选中请求，不查询当前认知、记忆保留、上下文预览或检查点。切换视角后用 generation 检查拒绝晚到结果，并保留归属范围校验。
