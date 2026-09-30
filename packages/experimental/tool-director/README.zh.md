---
description: "严格的 Storyweaver Director 上下文、大纲与 Brief 工具，以及隔离自主 Actor 调度。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-tool-director

[English](README.md) | 中文

## 概述

`dsh-experimental-tool-director` 向故事导演提供十个编排工具和一个只读历史回查工具。每位角色使用各自固定的提交与回查工具。讨论前的私有准备可并发运行，公开回复则遵循持久发言权。玩家可以恢复、重试、暂停、取消或跳过执行。

本包还导出两个 preset 级边界。`@deepseek-ai/dsh-experimental-tool-director/director` 会屏蔽除八个日常 `director_*` 操作和 `roleplay_recall` 外的全部继承 Host 工具，使 Story Session 看不到 coding、文件系统、Shell、workflow、委派或手工世界结算工具。`@deepseek-ai/dsh-experimental-tool-director/creator` 则是独立的 Story 控制能力：它隔离继承工具，只暴露严格故事书操作、受限受管草稿操作，以及玩家明确授权的本地工作区工具。

本包绝不会把 Director prose 转换为角色行为。Director 上下文先固定产品策略与工具协议，再加入其余有序 Story 上下文，并默认以 `user` 消息身份把可创作的导演思维链限制放在配方末尾。调度会为每个实例 Actor 创建或恢复独立私有 Agent Session，只发送该 Actor 有权读取的数据，并同样默认以 `user` 身份把可创作的演员思维链限制放在 Actor 配方末尾。玩家仍可手动调整两套配方的顺序和消息身份。Actor 运行期间，其推理块以及生成中的 `npc_speak` / `npc_act` 参数会增量映射到同一个仅玩家可见的 attempt 投影；结算后，临时内容由 Plot Ledger 已接受、带来源的只读事件替换。推理与流式草稿都不写入 Ledger；它们只在同一次进行中的工具事务内保留，并从后续轮次与其他 agent 请求中排除。

每次 Actor 请求前，运行时通过准确修订的配置事件应用当前作者姓名、设定和能力。已有 Actor 按持久化稳定身份恢复。修改开局值只影响未来初始化；当前状态和记忆保持原有记录。

运行时从原始 Session 输入强制执行代演控制：Brief 创建、讨论私有准备、公开发言和恢复调度均拒绝自动执行玩家控制的人物。重试指令保留控制权，新的普通玩家回合释放控制权。旧指令中的显示名必须准确且唯一。

导演先查询并创建故事实例人物，再安排入场；普通背景人群不需要 Actor。每个接收者得到独立的可感知内容，必要时包含未绑定真人的传闻线索。Actor 名单与结构化目标使用观察者私有引用；显式 `[[person:actorId]]` 标注按视角呈现，已接受对白保持原话。来源投影和表演标签保留当时的认识。`npc_recall_knowledge` 只检索调用者保留的判断和线索，条目与字符预算可配置；超长判断仍可分段回查。

## 目录

- [使用本包](#use-this-package)
- [理解边界](#understand-the-boundary)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

在 Story、Actor、Actor tools 与 Agent presets 之后挂载：

```ts
import type { Context } from '@deepseek-ai/cordis'
import * as ToolDirector from '@deepseek-ai/dsh-experimental-tool-director'

declare const ctx: Context

await ctx.plugin(ToolDirector, {
  actorPreset: 'storyweaver-actor',
  directorRecentEventLimit: 64,
  actorRecentPerceptionLimit: 32,
  discussionRecentTurnLimit: 12,
  storyTurnCheckpointLimit: 128,
  preparationConcurrency: 4,
  contextBatchSize: 12,
  contextDeltaCharacterLimit: 24_000,
  recallEventLimit: 8,
  recallCharacterLimit: 12_000,
})
```

每个 Story 可提供 `world/storybook.json` 与 `world/opening.md`。故事书缺失会在 Director 上下文中明确显示，并使 Brief Actor 建立或调度失败。故事书使用 `dsh-story` 归属的严格 schema，因此浏览器编辑、Director 载入、Actor 建立与角色投影接受同一份文档；文件存在但 JSON 无效时，模型 step 会明确失败，而不是静默忽略故事。

请在 Host 编排插件注册完工具之后，于普通 `storyweaver` preset 内挂载 director 子路径；creator 子路径则只挂载在专用 `storyweaver-creator` preset 内。创造 Agent 只能看到逻辑路径，永远看不到 `StoryHome` 物理路径；它不能运行 Shell、删除文件、访问其他 Story、推进世界，也不能调用 Director/Actor 工具。通用 `write`、`edit` 会拒绝 `world/storybook.json`；`storybook_save` 必须携带 `storybook_read` 返回的修订，校验完整严格 v4 文档后，再委托 Story Controller 原子替换。

<a id="understand-the-boundary"></a>
## 理解边界

- `director_stage_scene` 仅在物理场景或在场阵容变化时，以准确 World 修订写入唯一的 Host 管理场景帧。完整在场名单使用故事书稳定 Actor id，但不会因此唤醒或建立全部 Actor Session。
- `director_commit_brief` 针对准确 Ledger 修订存储态势、既定事实、未决线索，以及本轮聚光 Actor 的可感知信息和不确定项。Brief Actor 必须是当前在场名单的子集，每项只接受 `actor_id`、`perceptions` 与 `uncertainties`。空大纲时 Host 会拒绝 Brief，Director 必须先通过 `director_update_outline` 创建有内容的长期初稿。Director 可在调用 `director_narrate` 前替换刚提交的 Brief；权威旁白会关闭修正窗口，调度开始后则必须恢复尚未完成的运行。
- `director_update_outline` 针对准确 Outline 修订替换指定的未锁定计划分类。Director 上下文把当前计划投影成采用工具 snake-case 字段名、可安全复制的 `tool_input_base`，并与只读审核及锁定元数据分开。首次修订可以保持精简：只写 premise，以及开局需要的 arc、一至三个 beat 或其他必要区段。Brief 提交绝不会更新 Outline，玩家锁定与审核模式仍由 Story domain 强制执行。
- `director_narrate` 是每份新 Brief 调度前的必需步骤，Director 策略还要求每个普通玩家回合都产生客观旁白。它把玩家可见的文学旁白投影到场景，同时以 Director 来源的 World Event 保存客观摘要、受众感知和可选世界 patch。若 Director 只输出 prose 而未旁白，Host 最多追加两次有界纠正；恢复控制与讨论暂停不会重复生成旁白。旁白的规范格式是 Markdown：用空行分段，并支持常规 Markdown 强调。Host 会兼容转换旧式裸 `<p>`/`<br>` 片段，并拒绝其余所有 HTML 或 XML 构造。浏览器会对历史旁白执行同一窄转换，再交给共享的不可信 Markdown 渲染器；原始 HTML 与不安全链接仍不可执行。旁白可以推动环境、时间、外部压力、玩家行动结果与转场，但不能替 Actor 说话、写私密心理或作出自愿决定。同一 Brief 中断恢复时复用既有旁白。
- 通过 attempt 归属校验后，已接受的 Actor 发言与行动尝试由 Host 自动确立。发言保留解析后的受众；行动只记录为“尝试”，向当前在场角色投递，不推断成功，也不自动写入任意世界事实 patch。恢复用结算原语保留在 Host 内部，不暴露给普通 Director。
- `director_propose_memory` 创建带导演连续性、公共知识和逐角色主观记忆三层内容的待审核场景/篇章记忆；玩家批准前，它不会进入模型上下文。Director 指导只要求在有意义的场景或篇章转折后提出，不按每轮机械生成。
- `director_start_discussion` 只在当前剧情拍必须依靠在场 Brief Actor 互相回应才能得出结果时，才让 Director 创建持久化、受发言权控制的讨论。开局或单纯旁观请求默认使用普通调度。公开发言前，每个参与者都会获得一个私有准备席位；随后每个玩家设定轮次都可能再次调用全部参与者，因此 Director 不会把环境对白或独立反应升级为讨论。
- `director_resolve_discussion` 在导演明确处理玩家请求后恢复暂停的讨论；只有讨论进入持久总结阶段，且导演已在同一回合投影具体结果总结后，才能标记完成。成功执行 `complete` 会结束当前玩家回合。已完成的交流及其总结已经满足旁观推进；Host 不会再强制建立第二份 Brief 或无关的讨论后剧情拍。
- `director_dispatch_actors` 使用当前场景最新 Brief，并由 Host 拒绝尚未完成 `director_narrate` 的新 Brief；Actor id 必须同时属于该 Brief、故事书与当前在场名单。普通模式下，每名所选 Actor 只获得一个自治回合，并且是开局、单纯旁观推进与独立反应的默认选择。当前剧情拍需要问答、争执、协商或共同决策时，Director 才先调用 `director_start_discussion`；Host 随后沿持久发言权推进，不等待玩家再次输入。多个 Actor 按 Brief 顺序逐个唤醒、等待、结算，后一 Actor 会收到此前已经接受且对自己可见的角色发言，不会与前一 Actor 并发生成互不知情的回复。 仅私有准备采用有界并发（默认 4），每位 Actor 各自持有 attempt，全部准备完成后才开放发言；准备不消耗公开回合。失败者保留在屏障中，直到重试成功或被明确跳过。

讨论运行时，一次 Director 调度会先完成私有准备，再持续沿持久公开发言权推进，直到玩家明确介入、Actor 失败、Actor 自主结束，或耗尽玩家设定的轮次预算。Actor 上下文会把当前提交契约明确标为 `PRIVATE PREPARATION MODE` 或 `PUBLIC FLOOR MODE`：私有准备直接给出唯一合法的空行为/pass 形状，公开席位则要求携带 `discussion` 并为每条发言/行动显式填写 `kind`。临时 Host 守卫会在 Actor 事件写入前按该阶段校验每次 `npc_commit_turn`；无效提交会在同一回合获得纠正，而不会先部分落账发言或行动。每个 Actor 只能看到自己的已声明意图，绝不会看到其他参与者的私有立场或积极度；公开回合仍通过有来源的发言相互可见。系统鼓励发言者回应并明确交棒给具体参与者，避免彼此孤立的轮流陈述。已具备调度条件的活跃讨论若在调度前停止，Host 会给出专用续步，明确禁止重建 Outline、场景、Brief 或旁白；若较早的无效序列在 Brief 或旁白之前开启了讨论，同一条分阶段续步只补齐缺失前置条件，不会替换 Outline、场景或讨论。自然结束或耗尽预算后会进入持久总结阶段，另一条续步携带准确 World 与讨论修订以完成旁白和关闭。普通推进、活跃讨论与讨论总结纠正各自有独立上限，成功关闭就是当前玩家回合的终态。玩家申请发言或要求收束会暂停自动推进，直到导演处理；中断讨论仍是明确的玩家控制。

每次唤醒 Actor 前，运行时会在准确的当前 Run 修订中写入新的 attempt id、generation、Actor Session 与事件下界。取消会同时传播到 `AbortSignal` 和 `Agent.cancel()`。结算会先验证 Actor 仍拥有同一 attempt，再以持久化的 `actor/turn-closed` 事件判断角色回合是否闭合，最后才持久化结果并投影已接受事件。无论实际行动还是主动沉默，都必须通过一次已接受的 `npc_commit_turn` 闭合；沉默使用空 `behavior`。仅输出普通文本会先获得一次同回合纠正机会，再次漏调则以 `ACTOR_DID_NOT_COMMIT` 失败，而不会被记录成成功沉默。已暂停或已取消的 attempt 会拒绝迟到 Actor 事件；已完成 Actor 及其已接受引用不会被重试替换。Actor 请求若被判定为额度不足，会先执行一次有界延迟重试以吸收供应商瞬时漂移；若仍失败，调度会在请求后续 Actor 前停止，Run 保留 `awaiting_retry` 检查点，恢复只调度未完成 Actor。

Actor 提示永远不包含 Story Bible、世界真相、Director Outline、Director 指导、其他 Actor 的私有上下文或表演指导，也不包含期望回应。Actor assistant 文本没有世界权限；只有已接受 NPC 工具才能创建说话或行动。场景投影保留 Actor Session id 与来源事件序号，因此渲染结果不会被误认为 Director 创作。

`roleplay_recall` 按当前来源索引读取完整玩家输入、导演旁白、已接受角色行为与实际投递感知。关键词、来源 id 和场景 id 选择结果，每页最多 8 条来源、12,000 文本字符，并返回续读偏移。演员仅能读取自己的输出及实际收到的内容。`director_commit_brief`、`director_narrate` 和 `npc_commit_turn` 通过固定字段 `context_update` 在正常工作中提出短记，不另行调用总结模型。

<a id="dev-note"></a>
## 开发备注

归属决策见 [Storyweaver Director 职责边界与 Plot Ledger](../../../.agents/notes/implemented/feature/2026-08-29-storyweaver-director-ledger.zh.md)。

<a id="model-experience"></a>
## Model Experience

### Director 上下文与编排工具

#### What the model sees

导演依次接收固定规则与设定、基线、顺序追加的变化及当前轮交互；保存的配方保留区段身份与顺序。演员只读取自己的已接受行为及实际投递感知，世界与讨论记录按来源 id 去重。近期最低保留为导演 64 条、演员 32 条、讨论 12 条；更早原文只有经该读取者对应的玩家审批且未被固定，才允许退出请求。已批准短记保存事实、说法、承诺、条件、问题、线索、玩家走向及已解决结果。Brief 只改变调度和当前局势，不替换这些记录。玩家控制解释仅作用于当前轮，原始输入完整保留。

#### Token effect

每个 Director step 都会重新读取最新设定并应用已保存的区段顺序、启停状态和消息身份，不按字符数截断；上下文预览报告相同的实际请求组合和字符/token 统计。请求历史只保留当前轮次的玩家输入，以及 assistant 推理／工具调用／结果／纠错事务；已完成旧轮次的推理与工具轨迹继续留在 Session/UI，但不会再次发送。Actor 回合只包含一个角色定义与其有权读取的语义切片，World 与 Brief 之间的完全重复项会去重。已批准长篇记忆持续完整保留，直到明确替换或归档。默认 Director 指导会把首次 Outline 更新限制为开局所需的最小有效计划，以普通调度作为开局默认动作，并只在当前剧情拍必须互相回应时采用可能触发多次调用的讨论。思考区段每次只用一至三个短句选择当前戏剧压力、下一拍客观推进与立即动作，后续工具步骤不重述计划；只有工具确实报错时才用一句话纠正参数，不展开技术分析。思考过程语言会生成强制模型指令，要求私有分析、计划、工具选择和一致性检查始终使用指定语言；每条助手响应开始时只自检一次，不在每个工具调用前重新开始，也不要求模型展示隐藏思维链。

#### KV Cache effect

前导系统区段构成每个 Agent 独立的基线，精确变化追加在当前轮事务之前。每到 12 条可见新增来源的批次边界、累计增量达到 24,000 字符，或场景、静态提示词、配方变化时重建。其他演员的私有来源不推进当前角色计数。符合条件的原文只在重建时移出，未批准或已固定原文持续保留。撤回恢复权威检查点并丢弃派生批次，重启仅重建投影。这些是字符及来源阈值，不是 token 估计，也不保证缓存命中率。

### 创造工作区

#### What the model sees

创造 Agent 接收任务可编辑的创作提示词，随后是锁定的纯创作策略，以及专用的 `storybook_schema`、`storybook_read`、`storybook_save`、`storybook_publish`、`creator_complete`、`storybook_list_files`、`story_file_read`、`story_file_write` 和 `story_file_edit` 工具。它的 preset 另外挂载本地 `read`、`read_image`、`write`、`edit`、`glob`、`grep` 和当前平台 Shell，其访问根目录是玩家新建任务时明确选择的文件夹。创建链路会把该目录保留为 Creator 控制 Session 的 `cwd`；普通 Story 与 Actor Session 继续使用 Story `.runtime`。导演大纲、世界状态、剧情账本、讨论以及导演/演员思维链模块绝不会投影进 Creator 请求。正式故事书读取会返回规范化 JSON 及其内容修订；schema 工具返回当前 v5 的准确 JSON Schema。

#### Token effect

模型只读取自己请求的文件。受管 Story 辅助文件按行窗口返回且单文件限制为 2 MiB。本地工具使用 Session 权限 preset：只读禁止本地修改；工作区读写把修改限制在所选 `cwd` 内（拒绝后可申请单次升级）；经明确风险确认的完全访问允许现有本地工具修改其他本地路径。故事书保存只返回简短校验结果，不会把完整文档再次回显进上下文；模型在工具输入中已经提供了该文档。

#### KV Cache effect

创造 persona、工作区策略和工具 schema 在多个轮次间保持稳定。文件内容只通过显式读取进入上下文，因此编辑一项素材不会重写无关的固定提示词前缀。固定创造工作区中的每个持久控制会话对应一次独立的新故事书任务，并保留该任务的讨论与工具结果。`storybook_publish` 会原子结束受管故事书任务；`creator_complete` 会验证并结束明确只生成外部文件的任务。只输出正文的停止会得到一次有界纠正，第二次仍未调用终止工具则以 `CREATOR_DID_NOT_COMPLETE` 失败，不再被记录为成功工作。

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- 每次工具或玩家控制请求中的调度仍为同步执行；叙事时钟与未来意图尚无独立 scheduler。
- Host 会自动确立已接受的 Actor 发言或行动尝试确实发生，但不会推断行动成功，也不会把后果自动应用到世界事实。更丰富的确定性后果解算仍待后续实现。
- 待审核原文、固定原文及有效短记可超出近期最低保留范围持续增长。提供方容量错误会停止请求，不自动截断；玩家须审核或明确归档。来源与修订检查不验证语义完整性。
- 若当前场景 Session 不在线，已接受事件仍会保留在 Plot Ledger，但无法立即写入可选公开场景投影。
- 本包私有且处于实验阶段，由 Storyweaver 角色扮演 profile 挂载。
- 创造模式的受管 Story 素材只支持 UTF-8 `.json`、`.md`、`.txt`、`.yaml` 和 `.yml`。独立授权的本地工作区可使用通用文本与图片读取、文本编辑、检索和平台 Shell，并受所选权限 preset 约束。系统不挂载专用网络或委派工具，Creator 权限也永远不包含其他 Story、Director 编排或 Actor 工具。
