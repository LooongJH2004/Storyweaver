# Agent Note: Storyweaver 动态状态与表演指导

Status: implemented

[English](2026-09-05-storyweaver-dynamic-state-and-style.md) | 中文

## Problem

固定心理量表限制作者表达人物特有状态，独立渲染的开局值还可能与进行中的故事冲突。依赖前缀的输入和不区分对象的风格指导，也让玩家难以判断谁在行动、哪些设置生效，以及人物究竟知道什么。

## Decision

故事书 v5 通过稳定字段 ID 定义初始状态。Story 格式 11 保存动态世界状态和按对象隔离的风格覆盖。文本、数值、布尔、单选和标签值共用定义、校验、投影、上下文渲染和浏览器表单。关系字段指向具体人物。Actor 持有的状态保持私有；世界持有字段明确列出能够感知的对象。已有记忆、目标、意图和心路历程保留自身生命周期。

Actor 在 `npc_commit_turn` 中提交定义新增与值变更。同步事务暂存全部操作，校验通过后才发布一条 `actor/commit` 事件。多条对外行为保留物理事件中的操作索引，使导演接收和原始来源查询定位到具体对白或动作。模型不能重新定义字段或改变所有权。玩家编辑检查精确修订号；范围或类型编辑还会校验现存值。停用字段保留历史，撤销创建补偿修订。

初值在每个有效分支只实例化一次，也包括空基线。当前状态读取实时或持久 Actor 日志，不复活开局值。修订已登记但未运行的 Actor 时，通过已有 Session 控制器恢复。Story Package v4 包含当前状态、风格、保留的 Session 日志和版本 2 的回合检查点。导入同时重映射 Session 引用和检查点字典键。不支持的格式明确失败；用户已明确免除开发阶段旧运行实例的迁移。

导演与演员风格扩展各自已有指导。预设以复制方式应用，浏览器个人预设保存经过校验的副本。示例只是表演参考，不是事件或记忆。上下文配方为风格和场景指导提供独立有序来源。本次故事覆盖先于场景指导解析。转场清除临时指导，返回相同地点也不会重新激活。实际注入内容仍可从请求记录重建。

输入框随原始正文捕获结构化意图。模式按钮填入空草稿，并在同一 Session 内替换尚未修改的引导文字；玩家编辑过的正文会保留。提示只含可编辑正文，不附加控制前缀，代演明确指定角色。旧文本指令仍可读取。执行反馈来自真实 Session、Actor、讨论和 Director Run 状态。桌面状态使用可收起侧栏，窄屏使用模态抽屉。五个配置入口共用已有的带修订检查保存链路。将当前状态复制到故事书时，先生成可编辑草稿，再使用原有保存操作。

运行时拥有 `storyContextRenderer`：实际请求与配置预览复用完整区段正文、生效范围、可见性和标题。预览只读取日志并构造脱离持久数据的来源索引，不创建 Actor 或实例化开局状态；待初始化状态会明确提示。当前区段预览与历史请求分开，后者按发送器重建，同时包含分批封装和当前回合事务。

作者配置拥有独立的准确修订和 `actor/configuration` 事件。每次有效 Actor 请求前，运行时应用当前故事书姓名、设定与能力，不重新绑定人物身份或替换状态。已有 Session 通过持久化身份恢复。作者设置与已保存提示词一样在剧情撤回时保留；NPC 提交不能包含配置更新。

玩家控制权从日志中的结构化意图或准确旧角色名推导。Brief 创建与全部自动调度路径均拒绝执行受控人物，包括讨论准备和公开发言。恢复保留控制权，新的普通输入释放控制权，避免沉默输入被自动补成对白。导演旁白通过同一事务中的 state_changes 更新受影响的客观字段；纯文字不会改变字段值。

## Community references

[SillyTavern 角色设计](https://docs.sillytavern.app/usage/core-concepts/characterdesign/)区分人格、场景和对白示例。[作者注](https://docs.sillytavern.app/usage/core-concepts/authors-note/)提供临时对话指导。这些资料只用于组织设计，不代表兼容承诺或已测得的质量提升。六个内置中文预设为项目原创文本。[社区提示词讨论](https://www.reddit.com/r/SillyTavernAI/comments/1te7bx4/the_best_part_of_your_prompt_preset/)提供评测思路，其效果不作预设。

## Alternatives considered

**另建配置存储。** 这会重复已有故事书指导和状态，产生冲突来源。实现扩展原有数据所有者和上下文配方。

**不校验的自由状态。** 这允许任意改变量表或跨人物写入。实现将模型的叙事判断与 Host 强制执行的所有权、类型、引用和修订规则分开。

**一次 NPC 提交写入多条物理事件。** 后续失败可能留下已经提交的私有或对外变更。单条聚合事件保证发布原子性，同时保留操作级来源。

**完整角色卡或宏兼容。** 获准的首版需要可编辑指导与示例，无须引入另一套提示词运行时。

## Consequences

作者获得灵活量表和叙事指导，不引入公式、衰减或属性依赖引擎。模型新增定义只影响当前运行，直到玩家复制回模板。个人预设只保存在一个浏览器内。来源引用保留出处，但不确立叙事事实，也不证明语义完整。底层 Actor 基础仍保留旧心理记录 API，Storyweaver 模型工具和当前状态界面使用动态定义。

## Testing

归属测试包括[动态状态](../../../../packages/story/story/tests/dynamic-state.spec.ts)、[风格](../../../../packages/story/story/tests/style.spec.ts)、[Actor 原子事务](../../../../packages/experimental/actor/tests/actor.spec.ts)、[真实插件组合](../../../../packages/experimental/tool-director/tests/state-style.real.spec.ts)、[输入意图捕获](../../../../packages/client/ui-conversation/tests/input-reference-submit.client.spec.ts)和[完整浏览器交互](../../../../apps/web/tests/roleplay-discussion-console.e2e.ts)。真实组合测试使用发布插件和持久存储，模型输出采用脚本化响应；这不是在线模型质量评测。

《月影账簿》夹具包含开局、质疑、欺骗、沉默、受伤和多人讨论表演情境。[在线对比](../../../../packages/experimental/tool-director/tests/moonshadow-performance.e2e.ts) 对每个情境运行故事书基础风格及三组预设，保存完整日志与可移植 Story Package，记录实测耗时、工具结果和模型返回的 token 用量。缺失用量保持未知，人工判断在评审前保持留空。[夹具指南](../../../../packages/experimental/roleplay-web-profile/tests/fixtures/storybooks/moonshadow-ledger/README.zh.md#performance-comparison) 归属运行和评审说明。真实模型质量与人工游玩验收仍是独立证据；缺少 `DEEPSEEK_API_KEY` 时，测试明确跳过。
