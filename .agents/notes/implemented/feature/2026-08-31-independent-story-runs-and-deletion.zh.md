# Agent Note: 独立故事运行与角色扮演删除语义

Status: implemented

[English](2026-08-31-independent-story-runs-and-deletion.md) | 中文

## Problem

侧栏把一个 Story 展示成故事书及其嵌套窗口，但加号实际会在同一 Story 聚合中创建另一个场景 Session。这些窗口因此共享世界、记忆、Director Outline、Plot Ledger、讨论与 Actor。“开始新故事”实际上仍在续写已有运行态。归档交互也与角色扮演语言冲突：玩家期待某次游玩被删除，后端却只写入可恢复墓碑。

## Decision

当前支持的独立创作与重写接线由[创作恢复决策](2026-09-08-independent-authoring-recovery.zh.md)说明。本文保留其余流程和所有权理由。

基础设定与运行中 Story 是不同概念。每个 Story 投影都携带稳定 `templateId`，浏览器据此把不同 StoryId 归在同一本故事书下，并按不可变的创建时间排列故事书与运行项。选择 Session 只会改变当前项标记，即使运行活动更新了最近使用元数据也不会改变展示顺序。`story/createFromTemplate` 会读取规范故事书身份，创建运行态为空的新 Story，只复制 `world` 和 `assets`，随后由客户端建立第一个场景 Session。`.runtime`、导出物、旧 Session、世界修订、记忆、规划、讨论与 Actor 注册绝不会跨越该边界。Actor 身份只在单个 Story 内唯一，而不是在整个 Host 进程中唯一；独立运行可以为同一个创作 `actorId` 保持不同实时 Session，编排始终通过 Story 自有的 Session 注册定位对应 Actor。

角色扮演删除调用 `story/delete`，不再调用归档。同一本故事书仍有其它记录时，Story 注册表会持久删除所选运行并移除全部 Session 所有权索引；删除最后一次运行时，该记录会转为 `templateOnly`：玩家创作的 `world` 与 `assets` 保留，Session 和全部运行投影重置为空。UI 会继续显示这本空故事书，并提供明确的新建入口。只有删除整本故事书才会把全部托管聚合暂存到产品回收区。两种破坏性操作都使用删除图标、明确文案和确认步骤。

## Alternatives considered

**原地重置现有 Story。** 这会擦除仍被其它窗口拥有的状态，也无法提供彼此独立的历史。

**分叉当前 Session。** 分叉本来就会继承对话历史，正好会重复加号必须避免的续写行为。

**只改文案和图标。** 共享运行态与归档墓碑仍会保持权威，产品承诺依旧不真实。

## Consequences

每次点击加号都会从同一基础设定签发全新 StoryId；每次运行独立演化，同时继续归在侧栏的同一本故事书下。一次运行中的实时 Actor 不会阻挡另一运行唤起相同 id 的 Actor。删除运行会从侧栏移除该次运行；删除最后一次运行只留下空故事书锚点，不会让基础设定一并消失。旧归档 RPC 为兼容性继续保留，但角色扮演表层不使用它。
