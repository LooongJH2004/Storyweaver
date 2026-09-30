# Agent Note：同会话重写与可操作的鉴权恢复

Status: implemented

[English](2026-08-30-same-session-rewrite-and-auth-recovery.md) | 中文

## 问题

Chat 中标为「撤回并重写」的操作实际调用了 Session fork，打开子会话，并在子会话中恢复所选文本。这会改变 Session 身份和 Story 导航，与“编辑当前对话”的动作语义不符。「月影账簿」夹具也固化了同样错误的分支语义。第一次同会话实现还只更新了 TypeScript 源码契约：自动生成的 Typert 请求 codec 仍是旧结构，会在 Host 接纳前剥掉 `rewriteBeforeSeq`，导致真实重写静默退化为 append。另一方面，角色扮演轮次错误 renderer 只专门处理额度失败，导致模型返回的 `AUTH` 被降级为泛化的“模型请求未完成”卡片。

## 决策

重写采用同会话 prompt 接纳。Client 标记一个 `rewriteBeforeSeq` 目标，并在当前输入框恢复原文本。接纳被拒绝时保留该意图，只有 Host 接纳后才清除。Host 仅在 queue 模式、能够独占空闲 Agent、inbox 为空、且目标是当前模型表层中的人工 user message 时接纳。

已接纳的 user message 在持久 source 中携带重写边界。进入步骤时，agent loop 把该消息追加为位置型 replacement：从目标覆盖到旧表层末尾，并引用每个被遮蔽节点。旧事件留在追加式审计日志中，replacement 成为当前模型历史；不会创建或改变任何 Session 与 Story 归属。显式 fork 仍是独立操作。

Chat 会为每个 replacement 派生可安全展示的版本组。被取代的人工输入与 Assistant 回答节点按从旧到新的顺序折叠在 replacement 气泡下方；隐藏工具轨迹、导航条目、当前 transcript 顺序与模型历史仍只使用 replacement 表层。

生成后的 Host 与 remote-client Typert 产物属于传输契约；请求类型变化时必须同步再生成。随后还必须重建浏览器交付的 `api/remotes` 聚合包，因为它会内嵌这些生成 schema。回归测试会让真实 prompt 同时穿过生成后的 strict codec 与最终浏览器 bundle，并断言重写边界能够跨过每一道 wire boundary。

角色扮演错误 renderer 现在把 `AUTH` 显示为带“设置 → 模型”恢复路径的 alert；额度恢复仍使用带 checkpoint 的专用卡片。

## 曾考虑的替代方案

**继续使用子 Session，只隐藏分支导航。** 不采用，因为即使 UI 隐藏，身份和 Story 归属仍会变化。

**删除或截断旧事件。** 不采用，因为 Session 历史是追加式的，审计与回放必须保留原轮次。

**只改浏览器投影状态。** 不采用，因为重连或刷新后，下一次模型请求仍会派生旧历史。

## 后果

同一个 Session 日志同时保存原始审计轮次和替换轮次，但后续模型请求只派生 replacement 表层。Chat 会把 replacement user event 展示为新提交的轮次，把旧人工输入与回答作为明确的折叠版本历史挂在其下，并从 transcript、导航和 legacy 展示投影中遮蔽被取代 Turn 的其余范围，同时保留全部审计节点。Host 会拒绝过期目标、steering 尝试、忙碌 Agent 和非空 queue，同时不清除 Client 的重试意图。

该机制重写的是模型可见 Session 历史；各领域仍必须明确参与，才能回滚自己已经提交的状态。Storyweaver 通过回合前检查点接入该边界，其他无关外部工具仍需自己的补偿操作。测试覆盖生成后的 RPC codec 与最终浏览器 Remote 聚合包、Client 重试保留、Host 接纳、loop 表层替换、Chat 增量与重放遮蔽及版本分组、无 fork wiring、「月影账簿」契约与可操作的 `AUTH` 呈现。
