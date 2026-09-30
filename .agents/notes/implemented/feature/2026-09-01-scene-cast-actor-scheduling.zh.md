# Agent Note：群像故事的场景在场调度

Status: implemented

[English](2026-09-01-scene-cast-actor-scheduling.md) | 中文

## 问题

Storybook 可以登记十位以上角色，但“已有持久 Actor Session”曾被误当成“当前物理在场”。Director 因此可能把不在场角色写入 Brief、讨论或调度，也可能为了选择少数角色而唤醒整个群像。

## 决策

世界事实的保留路径 `storyweaver.scene` 保存唯一的 Host 管理场景帧：schema 版本、稳定场景 id、位置与完整 `presentActorIds`。Director 只在换场或阵容变化时调用 `director_stage_scene`；普通回合复用现有场景帧。通用世界 patch 不得写入 `storyweaver` 保留命名空间。

场景帧描述“谁在这里”，Director Brief 描述“本轮谁需要反应”。Brief、讨论参与者和实际 dispatch 都必须是当前在场名单的子集。只有进入 Brief 的聚光角色才按需建立或恢复私有 Actor Session，因此 Storybook 规模不会直接增加每轮模型请求。公共角色发言与玩家受众空列表解析为当前在场名单，而不是所有曾建立的 Actor Session。

场景切换只能发生在 Director Run 已完成或取消、且没有活跃或等待玩家的讨论时。这样旧场景拥有的 attempt、讨论发言权和受众不会漂移到新场景。

## 参考与取舍

参考 MVP 的 `scene_groups`、spotlight subset 与顺序调度思路，但不复制位置字段和分组字段双写、展示名身份或由模型逐轮维护重复状态的做法。正式实现只保留一个稳定 Actor id 的权威场景帧，并继续使用既有 Director Run 的顺序、generation 和恢复检查点。

## 后果

十位以上登记角色可以长期休眠；Director 决定场景后，只调度在场且本轮相关的少数角色。错误选择会在建立 Actor Session 前被 Host 拒绝。新 Brief 在没有场景帧时关闭式失败，并明确要求先建立场景。
