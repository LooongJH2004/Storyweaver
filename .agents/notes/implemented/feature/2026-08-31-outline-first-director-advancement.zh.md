# Agent Note：Director 先创建大纲再推进

Status: implemented

[English](2026-08-31-outline-first-director-advancement.md) | 中文

## 问题

规范《月影账簿》fixture 包含一份完整 Director Outline 样例，开发导入曾把该样例当成初始运行态。新故事因此会在 Director 尚未观察或推进故事前就显示已经写好的长期计划。Director policy 虽然要求模型先更新空大纲再提交 Brief，但模型跳过这条提示时，Host 仍会接受 Brief。

## 决策

新 Story 使用领域层的修订 0 空 Director Outline。故事书提供玩家创作的世界、角色和场景素材，不会预先创作运行时计划。《月影账簿》的 `director-outline.json` 保留为结构化验收 fixture，不参与默认故事导入。

`director_commit_brief` 会在建立 Actor 或修改 Plot Ledger 前检查已应用的大纲内容。当长期意图和全部规划分区都为空时，它拒绝调用，并要求先通过 `director_update_outline` 创建有内容的长期初稿。固定 Director policy 与工具描述声明相同顺序。若空大纲采用玩家审核模式，进入队列的初稿必须先获玩家接受，才能继续提交 Brief。

## 曾考虑的替代方案

**导入一份玩家编写的种子大纲。** 这会让 fixture 期望看起来像已经发生的故事计划，也让 Director 无法根据真实首次推进创作大纲。

**只依靠 Director 提示。** 模型可以跳过建议顺序，使首份 Brief 在没有长期计划时被提交。

**提交 Brief 时隐式生成大纲。** 这会混合两项独立修订记录，使玩家无法分别审核或锁定长期计划。

## 后果

新故事的 Director Outline 面板以 R0 空状态开始。首次推进时，Director 必须先创建明确的大纲修订，才能提交单轮 Brief 并调度 Actor。故事书 fixture 仍可验证丰富的大纲结构，但不会改变产品初始状态。
