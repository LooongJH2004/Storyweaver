# Storyweaver 下一窗口交接：长期需求、实现边界与创造模式当前任务

> 更新时间：2026-09-01
> 工作区：`D:\projects\dsh-roleplay`
> 参考 MVP：`D:\projects\AIAgentRolePlay`
> 当前分支：`master`
> 当前 HEAD：`48fcb82 feat(storyweaver): stream grouped actor attempts`

## 1. 项目目标

Storyweaver 不是一个由玩家逐项填写底层表单才能推进的 API 控制台，而是一个能够自动运行的多角色故事世界：导演负责世界编排，NPC 依据自己的有限认知、目标、关系、情绪和经历自主行动；玩家默认观察世界，也可以在必要时介入。

提示词、长期记忆、心路历程和模型实际上下文本质上都属于“上下文定义与编排”，产品上应进入统一工作台。玩家应该能够理解模型实际收到了什么，并编辑所有允许玩家控制的内容；系统安全边界仍需明确分层。

## 2. 用户长期确认的产品需求

### 2.1 故事书、故事与数据

- 故事书保存基础导演设定、角色独立设定和上下文默认值。
- 从故事书新建故事时复制基础设定；当前故事可以独立覆盖，不反向污染故事书或其他故事。
- 导入、导出、重新加载后必须保留提示词、上下文配方和角色数据。
- 新建故事书使用当前默认上下文字段；导入当前格式故事书时，字段存在但值为空时填入当前默认值。
- 不建立旧格式兼容层。旧数据应一次性重写为当前新格式，而不是在运行时叠加兼容补丁。
- 活跃数据中应存在当前格式的《月影账簿》默认演示故事书。
- 角色界面显示中文展示名，不应退化为 `gale`、`mira-courier` 等内部英文 ID。
- 一键导入/导出的完整性仍需最终审计，不能仅因为存在底层 API 就标记为功能完成。

### 2.2 上下文构建

- 将提示词、导演设定、角色设定、长期记忆、心路历程和上下文预览整合进“上下文构建”。
- 导演设定必须是可单独排布和编辑的模块，不能被模糊合并进其他模块。
- 每个角色的私有设定只进入该角色上下文，不能泄露给其他角色。
- 上下文模块支持拖动排序、启用/停用和真实消息身份（System/User/Assistant）选择。
- 编排与编辑应整合。点击模块后打开独立编辑界面，不长期占用左右同步编辑区；模块多时仍应易用。
- 支持预览最终发送给模型的完整上下文，并尽量复用真实上下文装配接口，避免预览与运行不一致。
- 所见内容原则上应可编辑；系统真正不可变的权限边界需清楚标为系统层，不能用含混术语。
- 取消生硬字符上限和超限截断，保留字符数、token 估算等统计。
- 模型内部分析/规划所使用的语言可以自定义，并用更强、明确的指令约束。

### 2.3 导演、NPC 与讨论

- 导演提示词进入导演系统上下文；角色设定只进入对应角色上下文。
- 系统强制规则与玩家自定义设定分层，不能互相伪装。
- 导演对 NPC 的传唤默认线性执行，因为后一位角色的反应可能依赖前一位结果。
- 单个 NPC 在一轮内应先形成一次整体计划，再按计划发起多个可并行的工具调用，避免每次调用工具前重复“让我整理当前状态”。
- 群组讨论由导演依据剧情自动发起，自动选择参与角色、顺序和轮次；玩家入口主要用于申请发言、中断和要求收束。
- 手工发起讨论保留为折叠的高级干预，而不是默认必填表单。
- NPC 不应成为导演提线木偶。导演提供感知与局势，而不是强制台词和动作；角色可根据自身认知、目标和情绪拒绝、误解或偏离导演预期。
- 不要向角色列出“你不知道 X”式认知盲区，这会泄露 X。只提供角色实际拥有的信息，并在角色通用提示中简要说明其认知可能不完整或不准确。

### 2.4 记忆与心路历程

- 参考 `D:\projects\AIAgentRolePlay` 的记忆总结与心路历程机制，但需适配当前 DSH 架构。
- 长期记忆应进入日常运行，而不是只作为手工维护页面。
- 角色记忆、信念、关系和目标应支持随事件演进，但不能把世界真相直接泄露给角色。
- 心路历程用于形成连续人格和主观变化，不应退化成每轮重复状态盘点。
- 角色面板需要清楚展示位置、身体、姿态、情绪、目标、关系、记忆与心路历程，不能遮挡正文或出现在不合理位置。

### 2.5 运行台与事件展示

- 世界运行台默认展示系统正在自动做什么、当前讨论、待处理事项以及玩家此刻能干预什么。
- 底层操作表单收进高级操作区。
- NPC 回复和行动应流式进入前端，不等整个角色调用结束后一次性显示。
- 同一角色的多次思考默认做两级折叠：角色级折叠、单条思考级折叠。
- 只折叠思考过程；角色的行动意图和具体发言始终作为独立气泡直接展示，不放在一个笨重的大容器中。
- 超长单段思考在折叠和单条展开时都不能横向溢出。

## 3. 创造模式的最终产品语义

### 3.1 固定工作区与任务

- “创造模式”是固定工作区，不属于某一本既有故事书。
- 工作区下每个新会话对应一次独立的新故事书创建任务。
- AI 根据用户要求创建严格符合当前 JSON schema 的故事书，并在完成时发布到故事列表。
- 可以复用普通 Agent 的部分编码能力，但面向的是故事书与创作素材，而不是角色扮演运行。

### 3.2 本地文件读写是硬需求

当前只允许访问草稿 Story 内逻辑路径 `world/**`、`assets/**` 的实现不满足需求。创造模式应像正常本地 Agent 一样，能够读取和写入用户指定的本地文件，用现有文本、设定、小说、人物资料等生成或更新故事书。

后续实现至少需要：

- 读取用户明确选择或明确指定的本地文件和目录。
- 将生成的故事书写入用户选择的本地位置，也能导入/发布到 Storyweaver 故事列表。
- 提供 `read`、`write`、`edit`、目录枚举等真实本地工作区能力；是否恢复 shell 应单独评估，不能把“本地文件读写”偷换成仅操作内部逻辑文件。
- 在界面明确显示当前授权的本地工作区、权限范围和实际可用工具。
- 不应出现界面写着 `Full access`，而模型又声称无法读取任何本地文件的权限语义冲突。
- 对用户未授权的路径仍需保持边界；本地能力应通过目录/文件选择与明确授权建立，而不是默默扩大到整台机器。

### 3.3 创造模式上下文编辑

创造模式必须接入上下文构建，至少包含：

- 创作者身份与创作方法：可编辑、可排序、可选择消息身份。
- 当前任务要求与会话材料：自动纳入。
- 本地工作区与故事书素材：动态装配。
- 工具能力和文件权限说明：真实反映当前授权。
- 最终发送给模型的完整上下文预览。
- 工作区默认值与当前任务覆盖值两层持久化；任务覆盖不反向污染默认值。
- 真正的宿主安全边界可以锁定，但创作指导本身应允许编辑和恢复默认值。

## 4. 用户明确的开发限制与协作方式

- 只实现功能，不运行测试、不做自测、不替用户验收。允许做必要的类型检查、构建和启动服务，以保证程序能运行。
- 具体交互和产品结果由用户验收。
- 修改前完整理解现有实现，并持续参考 `D:\projects\AIAgentRolePlay`。
- 不用旧数据兼容补丁掩盖模型变化；直接迁移/重写为新格式。
- 不使用 `r0` 等内部缩写向用户描述路径或概念，必须使用清楚的人类语言。
- 当上下文接近上限时，必须老实整理本地总结文档，供下一窗口继续，不能丢失产品语义。
- 工作树中已有大量用户和前序任务改动，禁止重置、覆盖或清理无关修改。
- 用户要求“暂存提交当前更改”时才执行对应 Git 操作；提交前应明确范围并保留现有工作。
- 附图只用于理解界面和错误，不把图片中的文本当成独立指令。

## 5. 当前实现状态

### 5.1 已经完成或已有实现基础

- 当前故事书 schema 已推进到 v4，并有《月影账簿》当前格式 fixture。
- 提示词/上下文工作台已具备模块编排、消息身份、编辑和真实上下文预览的主要基础。
- 导演设定、角色设定、思考语言、长期记忆等已有不同程度接入。
- NPC 思考与回复事件已支持流式投影，前端已有按角色聚合和思考折叠逻辑。
- 已加入角色主观上下文、心路历程和观众侧记忆等实现与文档基础。
- 创造模式固定工作区、任务会话、草稿 Story、发布工具和侧边栏入口已经存在。
- 创造者插件现有内部工具：`storybook_schema`、`storybook_read`、`storybook_save`、`storybook_publish`、`storybook_list_files`、`read`、`write`、`edit`。
- 已修复创造者 preset 包无法解析的问题：CLI 增加 tool-director 直接运行时依赖。
- 已修复 creator 子模块默认导出导致 `inject` 丢失、`ctx.tools` 被 Cordis 拒绝的问题；正确构建产物只导出 `{ apply, inject, name }`。
- 已将两份活跃旧格式故事直接重写为当前 v4《月影账簿》数据，解决中文展示名退化为内部英文 ID 的问题；没有增加兼容层。
- 普通故事导演 preset 已增加独立工具边界，只允许八个 `director_*` 工具；宿主的 `gitbash`、文件读写等编码工具不再继承进故事模式。
- Storyweaver 运行界面不再挂载通用权限选择器，因此故事输入区不会再出现 `Workspace Write` 等编码工作区权限入口；宿主 sandbox 与审批策略仍独立生效。
- Actor ID 的唯一性已经收紧为 Story 作用域：不同独立故事可以同时实例化同名角色，运行时通过 Story Session 注册关系定位具体 Agent，不再因进程级同名冲突阻止新故事唤起角色。

### 5.2 当前运行状态

- 服务监听：`127.0.0.1:3080`
- 当前进程：PID `30828`
- 最近启动地址：`http://127.0.0.1:3080/?token=H3Akho5pVb8R8puI0-CyVQCX7XcBw4Gb30egpSOjbAw`
- 当前工作树包含大量未提交、未暂存修改和新增文件。不要假定 HEAD 包含上述功能，也不要执行 reset/checkout 清理。

## 6. 当前已知 Bug 与缺口

### P1：创造模式上下文不可编辑

当前创作者身份写在 `storyweaver-creator/agent.cordis.yml`，工作区规则写在 creator 插件代码中，尚未进入上下文构建工作台。需要实现工作区默认值、任务覆盖值、模块编辑/排序/消息身份和最终上下文预览。

### P2：导入/导出完成度需要审计

项目已有 story package、authoring 与导入导出代码，但需要按当前 v4 字段、上下文配方、提示词、记忆与素材文件验证功能边界。不要仅凭 API 存在宣称“一键导入导出已完成”。

## 7. 下一窗口建议执行顺序

1. 先阅读本文、`docs/001-storyweaver-project-understanding.zh.md`、`docs/002-actor-agency-roleplay-optimization.zh.md` 和创造模式 Agent Note。
2. 检查当前 Git 工作树，保留所有已有修改；不要从 HEAD 重做或清理。
3. 将创造模式接入统一上下文构建，支持默认值、任务覆盖、模块编辑、拖动和最终上下文预览。
4. 审计一键导入导出是否完整保存当前 v4 故事书及相关素材。
5. 继续核对故事/创造两种 preset 的工具投影，后续新增宿主工具时也不能绕过各自的硬边界。
6. 按用户限制只做类型检查、构建、启动；不要运行测试或自行验收。

## 8. 关键代码入口

- 创造 preset：`packages/preset/agent-presets/presets/storyweaver-creator/agent.cordis.yml`
- 创造工具：`packages/experimental/tool-director/src/creator.ts`
- 创造模式侧边栏与任务导航：
  - `packages/client/ui-story/src/client/StoryBrowser.tsx`
  - `packages/client/ui-story/src/client/navigation.ts`
- 创造模式顶栏/运行台/工具展示：
  - `packages/experimental/client-ui-roleplay/src/client/RoleplayChrome.tsx`
  - `packages/experimental/client-ui-roleplay/src/client/RoleplayStoryDock.tsx`
  - `packages/experimental/client-ui-roleplay/src/client/CreatorToolCallView.tsx`
- 上下文构建：`packages/experimental/client-ui-roleplay/src/client/ContextBuilderPanel.tsx`
- 故事书 authoring、package 与状态：`packages/api/story-controller/src/`
- Session 创建、投影与队列相关入口：
  - `packages/api/session-controller/src/client/sessions/manager.ts`
  - `packages/api/session-controller/src/client/sessions/service.ts`
  - 继续全局搜索 `rewrite-unavailable`、`same-session history rewrite`、`reroll`、`rewrite`。
- Story schema、默认值和上下文：`packages/story/story/src/`
- 创造模式设计记录：`.agents/notes/implemented/feature/2026-08-31-storybook-creation-mode.zh.md`

## 8.1 本窗口续作记录（2026-08-31）

- 已修复创造模式重 Roll 的可用性语义：当前 Agent 仍在运行或权威队列非空时，“撤回并重写”保持可见但不可触发，并显示对应原因；Host 的 maintenance 锁与空队列检查继续处理竞态。
- 历史重写的提示现在明确说明只改模型可见对话历史，已经执行的工具操作和本地文件改动不会自动回滚。
- 新建创造任务会先调用宿主目录选择器；只有玩家明确选择目录后，才以该目录作为 Session `cwd` 创建草稿 Story 和创造控制会话。取消选择不会产生空草稿。
- 创造 preset 已加入受授权 `cwd` 约束的本地 `read`、`read_image`、`write`、`edit`、`glob` 和 `grep`，不加入 Shell、网络、删除或委派。
- 原先内部 Story 草稿的 `read` / `write` / `edit` 已改名为 `story_file_read` / `story_file_write` / `story_file_edit`，与真实本地工作区明确分层；`world/storybook.json` 仍只能通过严格校验的 `storybook_read` / `storybook_save` 修改。
- 没有 `cwd` 的旧创造任务会被工具守卫拒绝本地文件调用，避免隐式退回宿主进程目录。界面状态条会显示实际授权路径或明确提示未授权。
- 已完成四个相关 TypeScript 项目的 `--noEmit` 检查，并成功构建 ui-story、ui-chat、client-ui-roleplay 和 tool-director；按用户限制没有运行测试或产品自测。

当前下一优先级变为：创造模式上下文构建（默认值 + 任务覆盖 + 模块编排与真实预览），随后审计导入导出完整性。

## 8.2 故事/创造模式隔离与 Actor 唤起修复（2026-09-01）

- 已从最新实际 Session 日志解压确认：普通故事导演在合法的 `director_*` 调用后曾继承并调用宿主 `gitbash`，执行了环境变量与目录查询。这证明问题不是单纯的 UI 文案，而是 Agent 工具投影确实泄漏。
- `storyweaver` 导演 preset 现在挂载专用的 per-Agent 工具边界，硬限制为 `director_commit_brief`、`director_update_outline`、`director_settle_world_event`、`director_propose_memory`、`director_start_discussion`、`director_resolve_discussion`、`director_dispatch_actors`。创造模式继续使用自己的 creator 工具边界，两者不再共享宿主编码工具面。
- Roleplay Web Profile 已禁用通用 `permission` 行。只读加载现有故事后，输入区不再显示 `Workspace Write`，页面正常恢复，浏览器错误/警告为空；宿主服务错误日志也为空。
- 角色唤起失败的根因是 `ActorService` 用进程级 `Map<ActorId, Agent>` 强制所有故事共享 Actor ID 命名空间。新故事复用故事书中的 `astarion` 等稳定 ID 时，会被旧故事仍存活的 Agent 以 `already live` 拒绝。
- Actor 运行成员关系已改为同一 ID 可对应多个 Agent；唯一性语义归属每个 Story。发布和释放按具体 Agent 处理，`find(actorId)` 只在进程内恰好存在一个匹配时返回，歧义场景必须沿用 Story Session 注册关系定位。
- 已完成 actor、tool-director、agent-presets 的 TypeScript 检查，重建 actor 与 tool-director，并重启服务。按用户限制没有运行测试，也没有发送新故事模型回合或替用户验证一次新的角色调度；这里只确认了根因修复、构建启动和只读界面加载。

## 8.3 创建、创造任务删除与稳定导航顺序（2026-09-01）

- 普通故事创建曾因 Director 子入口未导出 Cordis `tools` 注入声明而失败。`director.ts` 已导出 `inject = ['tools']`；声明产物生成后再打包，最终 `lib/director.js` 同时导出 `apply`、`name` 与 `inject`，满足 Loader 的实际插件形状。
- 创造模式任务列表中的每个会话都有独立删除按钮、可访问名称和确认文案。删除操作通过任务自有的草稿 Story 回收该隔离聚合及受管运行态；删除当前任务后优先打开另一创造任务，否则回到现有故事或空白页。
- Story Controller 继续维护 `updatedAt` 最近使用元数据，但侧栏不再用它决定故事书与运行项顺序。`groupStories` 按不可变 `createdAt` 排列，选择 C 只改变当前项高亮，不会把 `A、B、C` 改排成 `C、A、B`。
- 已更新 ui-story 的行为覆盖与双语包说明、创造模式和独立 Story 运行 Agent Note。按用户限制没有运行测试；已完成 tool-director 与 ui-story 类型检查、声明生成、构建和服务重启。只读界面检查确认已有创造任务显示删除按钮，未实际执行创建或删除。

## 8.4 故事撤销与可创作上下文模块（2026-09-01）

- 同会话撤回不再只替换 Chat 表层。每个新玩家回合会在模型请求前保存 Story 运行态快照和活跃 Actor Session 表层边界；撤回时先遮蔽检查点后的 Actor 私有历史，再恢复世界、剧情账本、导演大纲、记忆与讨论。没有检查点的旧回合会在改变 Session 前明确拒绝，不再出现 UI 成功而领域状态未回退。
- 新增 `agent/history-rewrite` 作用域串行准备边界；其它领域可以在替换输入入队前参与回滚或关闭式拒绝。外部文件和未接入该边界的工具操作仍保持不变。
- Director 与 Actor 上下文配方分别增加“导演思维链限制”和“演员思维链”模块，正文使用用户指定规则，进入有效预览与真实模型请求；二者均可编辑、排序、启停和选择消息身份。
- 上下文工作台支持新增带稳定 `custom:*` id 的用户模块，持久保存标题、正文、顺序、启停和消息身份，并支持删除。名称或正文为空时显示行内错误并禁止保存。
- 当前三个版本 8 Story 规范记录已直接加入两个新模块，没有增加旧格式兼容分支。
- 主机端与客户端 TypeScript 项目构建已通过；按用户限制没有运行测试或产品验收。

## 8.5 严格前缀匹配与默认上下文排布（2026-09-01）

- Agent 请求头新增 `prefixContextMessages`，真实请求顺序为“稳定前置上下文 → 持久会话历史 → 回合尾部上下文”；原有 `contextMessages` 继续表示历史后的尾部。Session 规范化、回放不变量、压缩输入、token 估算与客户端统计已经同步识别前置上下文。
- Storyweaver 不再把所有 Story 模块放在历史之后。保存配方开头连续的 `system` 模块进入稳定前缀；从第一个 `user` / `assistant` 模块开始的其余内容进入动态尾部，仍保留玩家保存的真实身份和顺序。
- 默认 Director/Actor 配方按“固定策略与能力 → 身份/设定/故事书 → 记忆与当前运行态 → 本轮 Brief → 思维模式限制”排列。导演和 Actor 的思维模式限制均保持最后一个 `user` 模块，满足强化当前回合约束的产品要求。
- 消息装配会在记忆、世界、剧情账本、导演大纲、讨论和 Brief 等首个易变模块处主动断开消息块，避免与稳定 `system` 内容合并后因小改动失去整段缓存。Actor 当前在场角色清单从固定能力规则移入本轮 Brief。
- 方案依据供应商严格公共前缀缓存语义以及 Claude Code、OpenClaw 等开源实现的稳定前缀/动态后缀分层方式，不依赖 MVP 的手工字符串拼接。
- 已成功完成宿主库构建和 Cordis API/目录生成；按用户限制没有运行测试或产品自测。

## 8.6 Actor 显式沉默与漏调纠正（2026-09-01）

- 实际 Session 日志确认弥菈与阿斯代伦虽然在 reasoning 和普通 assistant text 中计划回应，却没有发出 `npc_commit_turn`；旧逻辑在 `agent/turn-stopping` 阶段自动写入 `implicit-silence`，Director 因此把空 `eventRefs` 错当成成功完成。工具没有执行失败，模型根本没有生成工具调用。
- Actor 现在无论回应、行动还是主动沉默，都必须显式调用一次 `npc_commit_turn`。主动沉默使用空 `behavior` 和对应 posture；普通 assistant 文本仍没有世界权限。
- 第一次漏调会在同一 Actor 回合注入一条 Host 纠正消息，要求立即提交唯一一次事务。第二次仍漏调时不再伪造 `actor/turn-closed`；Director 将其归类为 `ACTOR_DID_NOT_COMMIT`，保留 Run 的可恢复失败语义。
- 历史 `implicit-silence` 事件仍可被 Session 读取，但不能再作为新 Director dispatch 的成功结果。相关行为规格已同步改为“纠正后显式空事务”和“二次漏调保持未闭合”。

## 8.7 已发布创造任务的删除语义（2026-09-01）

- 删除失败 `Creation task ... has no managed Story draft` 的根因不是旧会话损坏。发布流程曾清空所有 Session 归属，导致已发布创造 Session 脱离 Story 生命周期；随后若让 ui-story 依赖 coding `workspaces` 服务，又会使隔离的 roleplay Web profile 无法激活插件。
- `retainAsTemplate` 现在清除场景与 Actor 运行态，但保留有效控制 Session 登记。删除草稿任务会删除草稿 Story；删除已发布任务只归档其 Story 控制登记，不删除已经发布的故事书。
- ui-story 仅依赖 `stories` 与 `sessions`，侧栏只显示仍受 Story 控制登记管理的创造 Session；删除结果会立即消失并在重连后保持隐藏，无需重新挂载 coding workspace 服务。
- 删除当前任务后，若存在另一条未归档创造任务则继续打开它，否则转到可用故事或空白页。相关行为规格已补充，但按用户限制不运行测试。

## 8.8 群组讨论、严格前缀与创作提示词（2026-09-01）

- 每名 Actor 仍由独立 Agent、独立 Session 与独立持久状态承载。普通多 Actor 调度按顺序等待这些隔离运行；讨论模式由 Host 自动连续推进至多一轮参与者。
- 当前发言 Actor 可在 `npc_commit_turn.discussion` 中声明立场、积极度、`speak`/`pass`/`conclude` 和下一发言者。Host 按明确交棒、玩家排队、积极度和发言次数公平性自动排麦；讨论期间传入错误 `actor_ids` 不再报“只授予某 Actor 发言权”，而是自动归一到当前席位。无发言的显式 pass 也会推进，不再卡死。
- tool-actor 的固定系统策略不再拼接实时自我状态。动态记忆、情绪、目标与近期行为统一进入易变的 `actor-state` 后缀；Actor 配方末尾的 `user` 思维链限制保持不变。
- 创造 Agent 提示词新增 Story-local 覆盖层和标题栏编辑入口，支持保存、取消与恢复工作区默认值。可编辑创作指令与锁定的工作区权限边界分离；shell、网络、删除、跨 Story 和导演权限不能通过提示词开启。

## 8.9 创造任务目录授权恢复（2026-09-01）

- 新建创造任务报 `directoryPicker/pick` HTTP 404 的根因是 Roleplay Web Profile 在禁用通用 Workspace 功能时，误把独立的 `directory-picker` 授权 seam 一并禁用；前端流程本身仍然正确要求先授权目录再创建草稿 Story 和控制 Session。
- 直接恢复 Web App 自适应选择器会连带挂载 `ui-directory-picker-native`，而该通用表层依赖已禁用的 `uiWorkspace`，会使整个浏览器启动停在 pending。最终实现继续禁用这条双面选择器，改由 Roleplay Profile 只挂载原生 Host 后端和收窄的 `directoryPicker` Remote 控制器，为创造 Session 明确选择本地 `cwd`。
- `workspace`、`workspace-controller`、`ui-workspace`、通用权限选择器和故事模式编码工具继续保持禁用；Roleplay 浏览器不再加载任何 Workspace 目录选择表层，因此不会重新引入故事/创造模式工具泄漏或插件 pending。
- 该修复不创建兼容层，也不绕过授权选择：取消目录选择仍不会生成空草稿。

## 9. 可直接发送给新窗口的任务提示

```text
请先完整阅读 D:\projects\dsh-roleplay\docs\003-next-window-handoff-creation-mode.zh.md，并结合 D:\projects\AIAgentRolePlay 理解项目。不要清理或重置当前工作树，也不要添加旧数据兼容层。

当前优先任务：
1. 将创造模式上下文接入统一上下文构建：工作区默认值 + 当前任务覆盖值，模块可编辑、排序、选择消息身份，并预览最终发送给模型的完整上下文。
2. 审计一键导入导出是否完整保留当前 v4 故事书、上下文配方、提示词、记忆和素材文件。
3. 继续保持故事导演与创造 Agent 的 per-Agent 工具硬隔离；本地工作区与重 Roll 实现见 8.1 节，故事工具隔离和 Actor Story 作用域修复见 8.2 节，不要从旧方案重做。

只实现功能；不要运行测试、自测或替我验收。可以做必要的类型检查、构建和服务启动。持续记录实现文档，接近上下文上限时更新本地交接文档。
```
