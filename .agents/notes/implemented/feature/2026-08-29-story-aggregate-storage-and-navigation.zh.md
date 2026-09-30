# Agent Note: 故事聚合存储与导航

Status: implemented

[English](2026-08-29-story-aggregate-storage-and-navigation.md) | 中文

## Problem

面向 coding 的 Web 产品把文件系统 Workspace 当作可见项目身份，并在其下组织 Session。角色扮演产品需要的是虚构聚合：一个故事横跨多个公开场景、私有角色生命周期、世界资料、资源与导出内容。显示 checkout 路径或要求玩家选择工作目录，会破坏这个模型，并把实现细节暴露为故事体验的一部分。

把一个 Session 当作整个故事也无法表达预期的信息差。公开场景历史、玩家／导演控制，以及每个自主 Actor 的私有 Session，需要各自独立的上下文与持久化，同时在可见层面仍属于同一故事。

## Decision

`StoryId` 是产品级聚合身份。`@deepseek-ai/dsh-story-home` 归属一个操作系统应用数据根目录，`@deepseek-ai/dsh-story` 归属持久 Story 元数据和带类型的 Session 关系，`@deepseek-ai/dsh-api-story-controller` 提供无路径命令与状态，`@deepseek-ai/dsh-client-ui-story` 归属浏览器中的 Story 与场景导航。

角色扮演 profile 要求每个新 Session 指向一个已知 Story，并指定 `scene`、`control` 或 `actor` 角色之一。它不导入 Workspace 记录或历史 Session，也不为此前面向 Workspace 的产品状态提供兼容或迁移路径。

## Storage ownership

Storyweaver Home 的解析不依赖进程工作目录。Windows 默认使用 `%LOCALAPPDATA%/Storyweaver`，macOS 使用 `~/Library/Application Support/Storyweaver`，其他平台使用 `$XDG_DATA_HOME/Storyweaver` 或 `~/.local/share/Storyweaver`。显式插件配置优先于 `STORYWEAVER_HOME`，后者又优先于平台默认值。

根目录归属 `stories`、`sessions`、`storages`、`attachments` 与 `trash`。每个 Story 归属 `assets`、`exports`、`world`、`.runtime` 和派生的 `story.json`。通用 Session persistence、storage domain 与 attachment 都被重定向到同一根目录下。Story 场景使用所属 Story 的 `.runtime` 作为内部 Session 工作目录；该路径从来不是浏览器身份，Story Remote API 也绝不返回它。

Story storage domain 是权威状态。`story.json` 是可重新生成的人类可读投影，不是可独立编辑的事实来源。Story id 与受管路径片段在参与路径构造前都会被校验。

## Story and Session relationships

Story 记录标题、前提、时间戳、归档状态、当前场景和 Session 注册。它可以拥有多个场景 Session、至多一个活跃 control Session，以及多个按稳定 Actor id 标识的 Actor Session。一个 Session 不能属于两个 Story。归档场景或 Story 会增加持久状态，并保留日志与文件。

Session Controller 根据 `StoryId` 解析新 Story-owned Session 的内部目录，在投影中记录 Story 角色，并在返回成功前把 Session 附着到 Story registry。角色扮演 profile 为这些 Session 选择 `storyweaver` Agent preset。

## Browser navigation

浏览器接收的 Story 投影只包含不透明 Story 与 Session id、标题、前提、场景顺序、当前场景选择和 Actor 引用。侧栏显示 Story 与嵌套的公开场景，并省略私有 Actor Session。空白 hero 创建或选择 Story。打开空 Story 会创建首个场景；创建更多场景会把它们注册到同一 Story；归档当前场景会确定性选择下一个活跃场景，或清空对话。

玩家无需选择目录。角色扮演组合会禁用 Workspace UI、本地文件 reference、代码 runtime、命令与权限外壳，以及其他 coding 导向 row。现有 sandbox policy 标识可以保留在 Host 内部投影中，但角色扮演 Client 不会渲染它们。

## Alternatives considered

**继续用 Workspace 作为聚合，只把名称改成 Story。** 改名后的目录仍让物理位置成为权威状态，无法干净表达私有 Actor Session，也会让通用 Workspace 发现把无关项目泄露进故事体验。

**把一个 Session 当作一个完整 Story。** 这样新增的领域代码最少，却会把所有场景和角色压进同一上下文，无法隔离 Actor 记忆，也让场景级导航、归档与续写变得含糊。

**向浏览器暴露受管 Story 目录。** 这样可以复用目录选择器与文件浏览 UI，却会把内部持久化决策变成玩家可见身份，并扩大浏览器对 Host 路径的权限。不透明 id 让存储可替换，也让虚构层级保持一致。

**自动迁移旧 Workspace 与 Session。** 任意 coding Session 无法可靠映射到 Story、场景、control 上下文或 Actor。开发阶段直接替换，比为无关历史数据虚构故事归属更清晰。

## Consequences

角色扮演应用从故事库打开，而不是从工作目录浏览器打开。所有 runtime 数据都位于一个可预测的产品根目录下，每个场景持久附着于一个 Story，私有 Actor Session 拥有明确归属角色，却不会出现在普通场景导航中。代码仓库 checkout 可以移动或消失，而不会改变 Story 身份。

这套基础预留了 `world`、`assets` 与 `exports`，但尚未定义其领域语义。角色创建还不会生成私有 Actor Agent，世界状态还不会结算行动 intent，浏览器也还不能恢复已归档 Story。单元测试覆盖跨平台根目录解析、路径拒绝、目录布局创建、持久化重载、归属冲突和导航竞态；真实组合 profile 启动与带认证 Remote 调用覆盖固定根下的 Story 和场景创建。
