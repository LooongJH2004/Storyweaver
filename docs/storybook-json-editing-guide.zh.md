---
description: "供 AI 创作可游玩故事书 JSON 的说明，涵盖可选叙事主角、角色认知与检查后交付。"
kind: "reference"
---

# Storyweaver 故事书配置说明：供 AI 创作使用

[English](storybook-json-editing-guide.md) | 中文

## 概述

将本说明与创作要求一起交给 AI，并说明需要交付外部 JSON 文件、应用内已保存草稿，还是已发布故事书。输出可游玩的初始配置，使用数值 schemaVersion: 6。叙事主角可不指定。本说明配置故事及其起始条件，不授予文件访问权、工具权限，也不替玩家选择受控角色。以实际可用工具的参数与宿主校验为准。

## 目录

- [创作任务约定](#task)
- [角色、可选主角与玩家控制](#people-control)
- [可编辑模板](#template)
- [字段与信息归属](#fields)
- [认知与动态状态](#state)
- [风格与上下文](#guidance)
- [交付与校验](#delivery)
- [开发备注](#dev-note)

<a id="task"></a>
## 创作任务约定

你正在编写起始配置，不是在运行故事。保留用户的题材、人物关系、限制和已有有效内容，保持 actorId 稳定。开局应提供可观察的情境与选择空间，不预写玩家未来的决定，不把计划中的场景当成已发生事件。

1. 确认交付形式并检查已有材料。只询问影响创作的重要缺项；没有指定叙事主角本身是合法选择，不必因此追问。
2. 有原生工具时，用 storybook_read 读取草稿，用 storybook_schema 查看格式。通过 storybook_save 修改托管草稿：expected_revision 使用最近读取的修订；storybook_json 是包含完整 JSON 文档的字符串，不是对象或局部补丁。
3. 检查工具回执。遇到修订冲突，重新读取并整合；遇到校验错误，按返回的字段路径修正。不得猜修订号、修改校验器，或把失败的保存当成已接受。
4. 保存草稿不等于发布。只有用户要求发布时，先检查 storybook_preview，再用当前 expected_revision 调用 storybook_publish。返回不明确时先读取状态，再决定是否重试。普通创作对话不需要发布，也不需要调用实际不存在的 creator_complete 工具。
5. 外部交付输出一个 UTF-8 JSON 对象；用户只要 JSON 时，不加代码围栏或解说。仅在实际执行后声明已校验、已保存或已发布。仅在用户授权的工作区操作本地文件；本地写文件不更新托管草稿。

创作任务提示词、启用状态、消息角色和本地目录属于独立设置。「编辑创作提示词」及「保存任务设置」影响后续创作请求，不要将 prompt、enabled、role、cwd 或任务修订号写入故事书根对象。directorPrompt 指导运行中的导演，角色的 rolePrompt 指导该角色；两者都不授予当前创作助手运行权限。

<a id="people-control"></a>
## 角色、可选主角与玩家控制

需要独立身份、认知、状态或交互的持久人物都属于 characters，包括玩家主角。只在 premise 或 directorPrompt 提到姓名，不会创建角色。同一人物只保留一份角色定义，通过 actorId 引用，不要在主角对象里再复制一份设定。

| 配置 | 含义 | 创作时如何填写 |
| --- | --- | --- |
| characters | 登记的角色列表及每个人的初始配置。 | 提供完整角色定义；确实不需要持久角色时才使用空数组。 |
| protagonistActorId | 可选的叙事关注人物，与控制权无关。 | 群像故事可省略或填 null；需要指定时填写一个已存在角色的 actorId。 |
| 玩家控制 | 玩家在某个运行中控制哪个角色。 | 在游玩界面选择，不写入故事书 JSON。 |

即使 characters 非空，主角也可为 null。缺省、null 和空白字符串统一为 null，编写 JSON 时建议明确使用 null。宿主不会自动选择第一名角色，非空但不存在的 ID 会被拒绝。编辑器清空选择后，保存、导出与发布均保留 null。「添加角色」不改变已有主角选择；「添加主角」才会明确创建并选中一个新角色。

没有指定叙事主角的故事仍可由玩家控制某个角色；指定叙事主角也不会自动停止 AI 演绎。玩家在「玩家控制」中接管人物后，该人物不参加自动回合或群组私下准备。公开讨论轮到他时，系统等待玩家发言或明确保持沉默。阅读视角和临时代演不会解除控制；解除「玩家控制」后才允许 AI 再次演绎。

性格、经历、目标与习惯描述角色基础，不是替玩家作决定的授权。导演负责外部变化和行动结果，不编造受控角色的发言、同意、决定或内心反应。AI 角色保留自己的动机与认知，行动尝试也不保证成功。不要写入「所有人必须赞同玩家」或「玩家已经作出某个回应」之类预定结果的剧情规则。

<a id="template"></a>
## 可编辑模板

下例包含两名角色，不指定叙事主角。如需以守塔人为叙事焦点，只把 protagonistActorId 改成 "keeper"；玩家控制仍需单独选择。没有定制需求时省略 contextRules 与 contextRecipe，由宿主提供当前默认值。候选节拍只是可能的发展，不是既定历史。

```json
{
  "schemaVersion": 6,
  "id": "lighthouse-letter",
  "title": "灯塔来信",
  "premise": "停用的灯塔再次亮起，守塔人与信使必须决定是否打开匿名来信。",
  "setting": { "place": "雨夜旧港", "openingSituation": "信使将未拆封的信放在桌上。" },
  "worldTruth": { "signal": "灯光来自地下仍在运转的机械。" },
  "commonKnowledge": ["旧灯塔已停用三年。"],
  "protagonistActorId": null,
  "discussionSettings": { "maxRounds": 4 },
  "directorPrompt": "用可观察的变化引出选择，不替角色决定是否拆信。",
  "reasoningLanguage": "简体中文",
  "directorGuidance": { "narrativeStyle": "克制、具体。", "avoid": ["提前揭示机械的秘密"] },
  "characters": [
    {
      "actorId": "keeper", "displayName": "林岚", "appearance": "披着旧油衣的守塔人",
      "publicPersona": "熟悉潮汐，独自照看停用灯塔。", "rolePrompt": "按自己的认知行动，不知道灯光的真正来源。",
      "capabilities": ["speak", "act", "reflect", "memory", "goals", "schedule"],
      "initialKnowledge": [
        { "text": "来人是信使周砚。", "kind": "identity", "attitude": "believed", "targetActorId": "courier", "label": "周砚" },
        { "text": "灯塔复明可能与失踪的父亲有关。", "kind": "belief", "attitude": "undecided" }
      ],
      "privateContext": {
        "perspective": ["小时候见过父亲半夜进入地下室。"],
        "coreMemories": [{ "content": "父亲嘱咐我不要独自下楼。", "importance": 4, "meaning": "既想追查，又怕失去家人。" }],
        "goals": [{ "description": "查清灯光为何复明。", "priority": 4 }],
        "intentions": [{ "description": "检查入口。", "trigger": "有人提议进入灯塔时", "commitment": 3 }]
      },
      "state": [{
        "definition": {
          "id": "keeper-caution", "name": "戒备", "description": "面对陌生线索时的主观警觉。",
          "group": "情绪", "type": "number", "owner": "actor", "actorId": "keeper",
          "minimum": 0, "maximum": 5, "guidance": "仅在有意义的变化发生时调整。"
        },
        "value": 3
      }],
      "actingGuidance": { "speechStyle": "短句，熟人面前偶尔犹疑。", "underPressure": "先确认同行者安全。" }
    },
    {
      "actorId": "courier", "displayName": "周砚", "appearance": "提着防水邮袋的年轻信使",
      "publicPersona": "替港务所递送急件。", "rolePrompt": "只知道递送任务，不知道信件内容。",
      "capabilities": ["speak", "act"], "initialKnowledge": [], "state": [],
      "privateContext": { "perspective": ["雇主要求午夜前送达，却没有留下姓名。"] },
      "actingGuidance": { "speechStyle": "礼貌，但急于完成差事。" }
    }
  ],
  "beats": [{ "id": "letter-at-the-door", "purpose": "让两人决定如何处理来信。" }],
  "directorRules": ["线索须经实际呈现才能进入角色认知。"]
}
```

<a id="fields"></a>
## 字段与信息归属

结构化对象拒绝未知字段。自由键只用于 setting、worldTruth 和 beats 中的对象；角色 state 已是严格数组。schema 管理的字符串会修剪空白，自由 JSON 内的文本不会因此统一重写。

| 字段 | 当前规则与用途 |
| --- | --- |
| schemaVersion、id、title | 必需；版本为 6，id 长度 1–160，title 长度 1–300。文档 id、内部书稿 ID、运行实例 ID 不混用。 |
| premise、setting、worldTruth | 默认空字符串、空对象、空对象；隐藏客观真相放 worldTruth，不自动授予角色。 |
| commonKnowledge | 默认空的非空字符串数组；仅放全体角色都应知道的常识。 |
| protagonistActorId | 可选：省略或填 null 表示不指定叙事主角，角色列表非空也合法。非空值必须引用已有 actorId，不决定玩家控制权。 |
| characters | 必需，最多 100 个，actorId 唯一；空数组合法但没有持久角色可自主回应。 |
| directorPrompt、directorGuidance | 两者必需，分别可为 "" 和 {}。 |
| discussionSettings | 只含整数 maxRounds，范围 1–20，缺省为 4。不要把普通群像反应强行升级为讨论。 |
| reasoningLanguage、contextRules、contextRecipe | 前两项支持默认物化；recipe 可省略，显式填写时须完整校验。 |
| beats、directorRules | 默认空数组；分别为对象（最多 1000 项）与非空字符串（最多 500 项），不等于已发生事实。 |

角色必需 actorId、displayName、publicPersona、rolePrompt、capabilities、actingGuidance。前两项长度 1–160，publicPersona 非空，rolePrompt 可空，actingGuidance 可为 {}。appearance 缺省为“未具名的人物”，建议明确填写不泄露隐藏身份的外观。玩家界面展示真名不代表其他人物已经认识此人。

capabilities 至少一项，只用 speak、act、reflect、memory、goals、schedule，创作时去重。privateContext 只接受 perspective、coreMemories、goals、intentions，各数组最多 200 项且默认空。后三者分别使用 content/importance/meaning、description/priority/reason、description/trigger/commitment；importance、priority、commitment 为 1–5 整数，默认 3，可选 meaning/reason 存在时非空。其余必填文本也非空。

<a id="state"></a>
## 认知与动态状态

initialKnowledge 表达初始判断，privateContext.perspective 表达主观经历，都可能片面或错误，不添加“客观真假”“秘密答案”标签。相识按方向分别声明：A 认识 B 不自动意味着 B 认识 A。

- initialKnowledge 每项 text 必需非空；kind 为 identity/belief（默认 belief）；attitude 为 believed/doubted/undecided/rejected（默认 believed）。targetActorId 若填写必须引用书中人物；identity 必需非空 label，表达已认识某人时同时提供 targetActorId。不要使用旧 stance/confidence 或运行时 sourceRefs。
- state 每项只有 definition 和 value。definition 必需 id、name、description、group、type、owner、actorId、guidance；guidance 可空，其余这些文本 ID/名称非空。actorId 必须等于所在角色，字段 ID 应在整本书内唯一。
- type 为 text/number/boolean/choice/tags，对应字符串/数字/布尔/选项字符串/无重复非空字符串数组。minimum/maximum 仅用于 number；choice 必需非空且无重复 options，tags 可选 options；数值与选项必须匹配。
- owner=actor 是角色私有主观状态，audience 必须为空或省略；owner=world 是客观状态，audience 可列出获知该字段的有效 actorId。关系指向可填有效 targetActorId，不编造运行时 targetPersonRef。
- 情绪、信任、伤势、体力按需定义字段。不要使用 state 对象、privateContext.beliefs、privateContext.relationships 或 initialEmotion。关系判断放 initialKnowledge，动态数值可用带 targetActorId 的状态字段。

初始值不携带 expectedRevision、reason、origin、active 等运行修订包装。定义与值不匹配、无效引用或重复字段会被拒绝。不要仅改旧文档版本号而保留不兼容结构。

<a id="guidance"></a>
## 风格与上下文

风格描述表达和选择倾向，不替代身份、经历或授权。字符串默认空，列表默认空且各项必须非空；只使用下列字段。

| 对象 | 字符串字段 | 字符串数组字段 |
| --- | --- | --- |
| directorGuidance | narrativeStyle、atmosphereAndPacing、viewpoint、lengthPreference、sensoryDetail、additionalInstructions | focus、avoid、examples |
| actingGuidance | speechStyle、relationshipVoices、underPressure、lengthPreference、additionalInstructions | habitualActions、decisionPrinciples、emotionalTendencies、taboos、examples |

contextRules 包含 director/actor，两侧各有 policy/tools 字符串。缺失或空值采用默认指导，独立发布预览会将未修改的内置工具指导转换为当前协议。自定义文本会保留，因此不要复制旧 director_stage_scene、director_dispatch_actors、roleplay_recall 指令。导演用 director_observe 的单层 summary/content/narration/deliveries/state 字段结算客观事件与旁白，用 director_command 管理场景和调度；演员提交为 npc_commit_turn，回查为 narrative_recall。旁白不得代写人物发言、决定或情绪；人物检查线索后，只向真正感知结果的受众投递证据，不替人物宣布发现。以运行时实际工具为准。

reasoningLanguage 默认“简体中文”。contextRecipe 控制来源顺序、开关和消息角色，包含 revision、actor、director；不能只填单个自定义片段。新建时无特殊要求就省略；修改既有编排时保留必需来源和用户自定义内容，按 [当前编排校验器](../packages/story/roleplay-core/src/context-recipe.ts) 校验。内置 policy/tools/reasoning-language 不携带 title/content；custom: 模块与 reasoning-mode 必需这两项。提示词和消息角色不能扩大人物的信息可见范围。

需要程序校验旁白长度时，在完整 contextRecipe 内添加 narrationLength：{"enabled":true,"minimum":1000,"target":1500}。两个数值必须是 1 至 10000 的整数，目标不得低于最低值。启用数值优先于文字篇幅建议。宿主统计呈现旁白中的文字和数字，排除格式、标点与空白；英文每个字母单独计数。公开短稿在发布前最多修订两次；次数耗尽时保留未发布草稿并报告失败。目标不是上限。省略此字段或设置 enabled=false 时只使用文字建议，不自动补足。故事书编辑器在导演上下文下提供这些输入框；已有运行独立保存设置。

<a id="delivery"></a>
## 交付与校验

按用户要求选择交付路径，如实说明完成到哪一步。有效文件不自动成为应用草稿，草稿也不等于已发布版本。

| 交付目标 | 必要操作 | 得到的结果 |
| --- | --- | --- |
| 外部故事书 | 提供纯 v6 JSON，或导出的 storyweaver-book 包。 | 用户可导入的文件，不声称自动保存或发布。 |
| 应用内草稿 | 使用 storybook_save，或侧栏、故事书库、编辑器中的「导入已有作品」。 | 校验成功后的已保存草稿；导入不覆盖另一部故事书。 |
| 已发布故事书 | 检查已保存内容，按用户要求发布。 | 一个不可变版本，可据此开始新的运行。 |
| 故事进度 | 在「历史与恢复」中导出或导入运行存档。 | 独立运行的进度，不是故事书模板。 |

故事书便携包使用 `{ "format": "storyweaver-book", "version": 1, "document": ..., "resources": [] }`，其中 document 是 v6 配置。资源路径、摘要与 base64 数据必须来自真实导出，不得编造。导出下载的是已保存文档与资源，修改后须先保存。修改草稿不改写已发布版本或已有运行；要使用修改后的故事书，须发布新版本并开始新运行。

单角色文件是一个 characters 数组项，不带 schemaVersion 包装。合并时核对 ID、认知目标、状态归属与主角引用。运行中新建的人物不会自动进入原故事书；作者工作区的素材收录会生成单独草稿，供检查和发布。

| 问题 | 修正方式 |
| --- | --- |
| 未指定叙事主角 | 保留 null，无需补救，也不自动选择首个角色。 |
| 主角或认知目标不存在 | 引用现有 actorId、补充缺失角色，或清空可选主角。显示姓名不是 ID。 |
| 状态被拒绝 | 检查 state 是否为数组、definition 与 value 类型是否匹配、数值是否越界，以及归属与目标是否存在。 |
| 根字段未知或格式版本过旧 | 按当前 schema 重新组织数据，只修改版本号不足以完成转换。 |
| 修订冲突或工具结果不明 | 先读取权威草稿或发布状态，再整合或重试。 |

有仓库访问权限时，以下只读命令可校验纯 JSON 并输出规范化文档。最后一个参数替换为实际文件路径；校验便携包时先提取 document。JSON.parse 本身不校验故事书，该命令也不保存或发布。

```powershell
pnpm exec tsx -e "import { readFileSync } from 'node:fs'; import { parseStorybookDocument } from './packages/story/roleplay-core/src/storybook.ts'; const path = process.argv.at(-1); if (!path) throw new Error('missing path'); console.log(JSON.stringify(parseStorybookDocument(JSON.parse(readFileSync(path, 'utf8'))), null, 2));" .\path\to\book.storybook.json
```

交付前核对用户意图、引用、信息隔离、字段取值与实际交付状态；未执行的校验或发布步骤须明确说明。

<a id="dev-note"></a>
## Dev Note

格式：[storybook.ts](../packages/story/roleplay-core/src/storybook.ts)、[knowledge.ts](../packages/story/roleplay-core/src/knowledge.ts)、[dynamic-state.ts](../packages/story/roleplay-core/src/dynamic-state.ts)。创作工具与任务设置：[creator.ts](../packages/story/roleplay-services/src/creator.ts)、[creation-workspace.ts](../packages/story/roleplay-services/src/creation-workspace.ts)。发布转换：[independent-book.ts](../packages/story/roleplay-core/src/independent-book.ts)。工作流决策：[独立创作恢复](../.agents/notes/implemented/feature/2026-09-08-independent-authoring-recovery.zh.md)。
