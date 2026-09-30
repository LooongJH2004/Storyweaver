# Agent Note: 可重复的 Storyweaver 演化轮次

Status: implemented

[English](2026-09-29-repeatable-storyweaver-evolution.md) | 中文

## 问题

角色扮演的质量变化具有随机性，横跨角色口吻、叙事、导演决策、记忆和上下文拼接。一段精彩文字或一次成功回放，无法证明是哪项改动起效，也无法排除私有信息泄漏、构建版本或配置差异造成的结果。此前探索性运行还可能因复用 stage 名称而覆盖证据。

## 决策

仓库技能 [storyweaver-evolution](../../../skills/storyweaver-evolution/SKILL.md) 定义可复用、每轮只检验一个已登记因子的流程。至少两名 Sol 独立研究同一份冻结证据；另一名 Sol 评审方案并实现一个候选改动；模拟调度 Sol 只向低思考强度的 Luna 提供各角色实际对模型可见的上下文，让它扮演角色。Luna 的输出用于诊断上下文清晰度和角色声音；重复的真实 API 基线与候选回放提供比较证据。独立验收 Sol 给出建议，由根代理核查原始证据并作出决定。

每轮在查看候选输出前冻结情境、模型与生效配置、源码及构建指纹、回放 stage、预算、决策规则和留出集。token 停止条件可以不设（`maxTokens: null`）；仍记录原生用量，并保留正数的时间与费用限制。本地 `run_pack.py` 创建唯一的运行包，校验指纹与回放产物；它不调用模型，也不保存凭据。单个运行包将 A/B 映射到不同的冻结角色指导文本；源码或其他指令改动使用互相配对、并校验只改变一个因子的两个运行包。长篇故事 e2e 测试会独占创建 stage 目录，并记录实际生效的供应商、情境、指导文本指纹和原生用量，供事后比对。导演专用回放可在两个工作树导入同一段已接受的角色历史，经实例配置装载各构建的默认规则，再比较新产生的导演请求和本次原生用量差值。盲审者按八维量表引用场景和事件 ID。结论将质量结果（`accept`、`reject` 或 `inconclusive`）与证据状态（`valid`、`invalid` 或 `incomplete`）分开记录；私有知识泄漏、替玩家做决定、改写既定事实和配置不符均为硬失败。模拟冒烟试运行只验证流程，不能证明质量改善。

离线 Luna 提交先由原构建的 `validateJsonSchemaValue` 和 `ToolArgsError` 校验已记录的工具 schema，再对通过提交历史回放恢复的请求 revision 深拷贝调用 `CognitionApplication.submitTurn`。[原生校验脚本](../../../skills/storyweaver-evolution/scripts/native_npc_validation.mjs) 冻结实际装载模块、源码、schema、packet、report 与 archive 指纹。writer 执行完整准入处理函数，并在发布前以 sentinel 中止；接受计划只证明提交有效，不能证明尝试成功。两臂共用原角色状态和校验器，风格补丁另行冻结。反馈保留原生错误 message 与 violations，并明确诊断文本传输不复现私有 ToolRegistry envelope。聚焦测试保留四次 R31 原始 posture 失败，并检查错误参数、不可见人物和证据引用、不存在的状态更新，以及重复校验时的计划隔离。

表达诊断可登记一个有来源的提示，将角色当前活动接入眼前交流的取舍。评审按具体选择和交流目的评分，道具词汇或手势本身不加分。匿名最终提交的文学评分冻结后，同一评审再查看首次拒绝和修复链，逐字段记录对白、合法行为及私有意图的保留、改写和删除；非法的物理 `posture` 描述不计为已准入动作。进展报告先说明已修复或观察到的具体表现，再附数量证据与已登记的结论。

多角色归档诊断通过[归档 packet 辅助脚本](../../../skills/storyweaver-evolution/scripts/extract_archive_actor_packet.py)提取各角色完整原始 session 与由唯一 receipt 关联的原始 commit.command。原序号、归档及 session 指纹、证据 ID 保留，各角色私有输入独立。历史生产构建无法确认时标为 unknown，兼容性解析、revision 回放和准入注明本次实际使用的冻结运行时。原生回放将命令 epoch 与恢复出的 execution 核对；不兼容归档须重新采集。共享作者表达规则可以追加到原始输入，不改变事实、state、memory、tools 或原始来源记录。自然来源参与允许细微差异与合理相似，包括帮助和同意；缺少相关记忆机会时记为未测到。当前量表解释用于新登记轮次，已冻结历史评分保持原样。

## 曾考虑的替代方案

[Bootstrap 留证脚本](../../../skills/storyweaver-evolution/scripts/bootstrap_capture.py)将一次完整本地读取保存为独占 stdout/stderr 证据，并将同一次实际内层工具返回的结构化暂存记录提升为独占最终文件。当前工具的非 TTY stdin 立即关闭，`apply_patch` Add File 会覆盖已有目标，因此两者都不能直接提供最终文件独占持久化。聚焦检查覆盖大体积 UTF-8 返回、嵌入 CR/LF 与控制字符、非法暂存记录和同名目标拒绝；完整原始 Actor packet 也在采集后逐值递归核对。模型只收到一次原始 `r.output`。外层平台日志保持 unknown，本地保存不证明模型完整接收或文学质量改善。

- **一名代理同时提案、实现和评判：**速度更快，但评判者会知道自己的假设，容易高估随机出现的好样本。
- **把 Luna 的自评当作结果：**比真实回放便宜，但检验的是另一个模型，还让表演者给自己的台词打分。
- **只用固定文本作为基准：**便于重复，却无法覆盖当前运行时、导演决策、角色可见上下文及模型用量。

## 后果

[持久宿主 runner](../../../skills/storyweaver-evolution/scripts/durable_transport.mjs)与[已验证 argv launcher](../../../skills/storyweaver-evolution/scripts/durable_transport.py)将 handler 和序列权威同时移至磁盘，保持原字段视图与角色指令。每个全新进程读取冻结衍生计划及连续独占 checkpoint；固定调用 ACK 仍须在末帧后额外调用一次。永久 bootstrap claim、partial／orphan／tamper 拒绝及外层错误 quarantine 禁止失败会话恢复。一次源字节捕获是 original-capture.bin 中的本地 fs 证据，分别命名于真实宿主 stdout 与 exec 返回；合成 guard 输入仅证明数据有效性。这移除缓存依赖，同时保留未认证接收及人工复制未知。R47 保持已关闭 incomplete；全新 R48 用六个新原始输入和有条件原生回忆通过组件／准备检查，不合并旧回合，也不要求旧轮 PASS。

独立的[原生召回适配器](../../../skills/storyweaver-evolution/scripts/native_narrative_recall.mjs)把原本可用的只读工具作为诊断续接因素恢复。它重放原始已认证请求修订，关闭内存装载存储，仅向原生 PerspectiveQueries 提供该实例／修订的克隆读取。原始模式／解析器、所有者可见性、排序、分页、续读和 JSON 呈现仍为依据；不变的 NPC 适配器继续负责准入。显式夹具查询预算是带源文件指纹的兼容配置，存档生产者的实际历史配置仍未证实。精确参数、原生结果／错误、呈现正文、原始流和实际 exec 返回都在同会话 tool-result-equivalent 续接前保留。不声称生产 ToolRegistry 封装、在线取消租约、世界提交或发布。这放弃了用任意文件读取或重建摘要替代原生召回。聚焦验证覆盖私有／缺失／未来记录、作用域、原生参数错误、精确呈现、快照不变性、续读和来源漂移。R43 因自主回忆未得到结果而保持 incomplete；R44 保持未运行。R45 以 INVALID 派发／INCOMPLETE 证据关闭，严格 R46 草案的 PASS 前提仍未满足。独立登记的 R47 基线保留这些失败，以前瞻组件／准备检查接纳六个全新完整原始回合。回忆按角色自主请求有条件执行，每个实际请求都必须通过原生同会话精确结果续接；无请求时回调覆盖为 untested，与表达充分性分别记录。先评分最终接纳完整参数，再披露初始／修复漂移，保留初始硬失败。[派发意图助手](../../../skills/storyweaver-evolution/scripts/dispatch_payload.mjs) 比较完整预期字段及精确 UTF-8 消息 SHA，并独占保存意图。宿主薄入口路径在构造时使用正斜杠；可取得时审计实际发出参数，最终人工复制认证仍为 unknown。

typed-field运输保留有序容器、unknown/empty/scalar值及原始string，每个tool对象只发送一次。unit与frame都可恢复完整原Actor envelope，并分别记录raw/view指纹及显式unit偏移。此改动仅改变阅读表示，不改内容；exactAssembly指派生payload拼接。两份R43独立提案也建议知识状态澄清，但该独立提示未与阅读视图因子合并。R41保持已关闭incomplete，native准入与source捕获不变。

functions.exec FREEFORM入口直接接收原始JavaScript，不接收JSON对象、引号字符串或Markdown围栏。R41对bootstrap与缓存next统一说明同一提交规则，并保留编译前actual-return落盘。两份独立提案都指出将落盘移入可信程序会留下审计缺口，因此未选择该更大改动。R39保持已关闭incomplete且原因unknown，保留实际可见错误原文而不推断。新运输smoke的bootstrap重试为零，不加文学提示。

R38一份完整分帧链取得初次native有效，第二位演员自报input_incomplete且没有capture目录；全轮保持incomplete，第二份原因unknown。薄入口现在加载校验指纹的冻结控制记录，并将同一可信handler缓存到短loader后。仅执行已登记运输代码并显式传globals，Actor数据永不进入程序源码。代码加载是额外控制访问，不是第二次上下文读取。此改动保留单帧/最后ACK/native链并减少重复生成handler，后续连续性诊断前须先完成两次fresh运输smoke。

R37在首位演员自报input_incomplete后停止；完整local/inner证据没有定位不可见的outer失败层。[分帧运输helper](../../../skills/storyweaver-evolution/scripts/bootstrap_frames.mjs)保留guard后的精确原字符串，每次独立执行交付一个有限Unicode安全envelope。固定next调用确认pending帧，末帧还需额外一次调用确认后才done。独占sender记录先于状态推进，保存失败不得完成交付。buffer只限制单帧序列化envelope，不限制总上下文。这些sender/Actor调用观测支持运输链诊断，不证明outer接收或文学/成长改善。

显式 request/header 序号现在可从多请求 Actor 完整 session 中选择一份完整原始输入。两helper共享唯一性、顺序及所属校验；含糊session缺双序号或与wrapper选择冲突时拒绝。由receipt关联的未来原command仅留协调者及native审计。R36两个fresh guarded transport样本通过collection验收；R37登记六次独立既有记忆连续性观察，没有prompt候选或模拟early到late投递。pending尝试、条件性承诺与已送达结果保持区分，本诊断不能证明稳定成长或从同时可见发言中隔离记忆归因。

可复用的 [bootstrap guard](../../../skills/storyweaver-evolution/scripts/bootstrap_guard.mjs) 在保存返回后、输出正文前检查原进程完成、无运行中 session、完整 JSON 解析及 Actor 输入必需类型；失败即停止扮演，不将正文词语或指纹当作接收证明。

比较轮次需要更多调用和评审时间，已登记的预算和停止规则会约束开销。无效与无法判断的轮次会保留，不会不断重试直到出现有利结果。辅助脚本只校验本地可观测的部分；评审者仍须检查模型可见请求并判断文学质量。接受改动后，每次只将一个经过检验的因子推进为新基线。
