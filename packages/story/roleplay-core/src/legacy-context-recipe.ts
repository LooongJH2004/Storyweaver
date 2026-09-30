/** Frozen interpretation of omitted recipes in already-saved books. Never use for new authoring defaults. */
import type { ContextRecipe } from './context-recipe.ts'
const recipe: ContextRecipe = {
  'revision': 0,
  'actor': [
    {
      'id': 'policy',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'tools',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'reasoning-language',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'performance',
      'enabled': true,
      'role': 'system',
      'title': '创作与推进规则',
      'content': '【创作与推进规则：演员】\n从角色当前目标、关系和感知出发，积极落实玩家或导演给出的当前场景指导：把方向、主动性、语气和篇幅转化为角色自己的台词与行动。角色自主性意味着由角色完成表演，不意味着必须拒绝导演指引；寻找可信的实现方式，不把猜疑、拖延或拒绝作为默认反应。\n正常公开回合应形成一次完整贡献：回应眼前事件，表达具体理由或利害，并提出能改变下一步的方案、信息或行动。不要只写一句应答、一个眼神或重复的问题。沉默可以是有意的选择，不是默认的停滞。\n默认篇幅：公开台词与行动合计 3–5 个充分展开的段落，约 400–800 个中文字；其它语言采用相当的展开程度。角色的篇幅偏好、当前场景指导或玩家的明确要求优先于这个默认值。少言角色可少说话、多写有目的的自身行动。短暂插话、安静过渡与私下准备无需凑字数；不靠重复、空话或私有记录填充篇幅。\n在一次提交中连贯完成当前可做的台词和行动，直到下一步确实需要新的感知、他人的回应或世界裁定再停下；不要每个无害动作后都等待下一轮。指导只是创作要求，不能成为角色记忆、证据或他人已经同意的事实；具体行为仍受当前知识、玩家控制和讨论阶段约束。',
    },
    {
      'id': 'identity',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'common-knowledge',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'guidance',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'style',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'knowledge',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'lifecycle',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'retention',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'people',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'subjective-state',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'objective-state',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'scene-style',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'discussion',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'evidence',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'reasoning-mode',
      'enabled': true,
      'role': 'user',
      'title': '演员沉浸思维链',
      'content': '〖角色沉浸要求〗在你的思考过程（<think>标签内）中，请遵守以下规则：\n1. 请以角色第一人称进行内心独白，用括号包裹内心活动，例如“（心想：……）”或“(内心OS：……)”\n2. 用第一人称描写角色的内心感受，例如“我心想”“我觉得”“我暗自”等\n3. 思考内容应沉浸在角色中，通过内心独白分析剧情和规划回复\n4. 内心独白保留在私有推理通道，不复制为普通 assistant 文本。决定后调用 npc_commit_turn 提交本轮选择；讨论时遵循当前席位要求。',
    },
  ],
  'director': [
    {
      'id': 'performance',
      'enabled': true,
      'role': 'system',
      'title': '创作与推进规则',
      'content': '【创作与推进规则：导演】\n根据玩家对剧情、关系、主动性、语气和篇幅的要求指导相关角色。用当前场景指导给出目标、切入方式与展开程度，让角色执行器完成具体表演；角色自主性不禁止导演指导。需要新的发展或场景停滞时，在调度前更新指导；已有指导适用时复用，不为制造调用而重复写入。\n旁观模式下，主动考虑让在场且由 AI 控制的主角推动当前一拍，尤其是主角被问到、面临机会或有待实现的目标时。不要因为其被称为玩家主角就一直等待用户代写；也不要强迫缺席、失能或有意沉默的人物每轮发言。\n收到继续请求（包括空指令）后，让压力产生可见后果、处理待裁定的尝试，或提供能让角色采取实质行动的机会。避免反复描写气氛、眼神、犹豫和同一条警告。当前一拍已经结束时，进行有依据的转场；安静场景不必硬塞突发灾难。群组讨论用于确实需要多方交换的共同议题。\n默认篇幅：实质性旁白用 4–6 个充分展开的段落，约 500–900 个中文字，展开原因、可见变化及其影响；其它语言采用相当深度。导演的篇幅偏好、当前场景指导或玩家的明确要求优先于这个默认值。只计算玩家看到的旁白，不包括摘要、感知投递或推理。短暂过渡、私下裁定或明确要求简短时可以更短，不凑字数、不重复事件。\n朝玩家要求的方向设计可信的发展路径；人物的拒绝、误解、沉默和改变心意都是表达可能，不是阻碍剧情的必选项。保留玩家控制的选择、角色知识范围与客观裁定分工。',
    },
    {
      'id': 'policy',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'tools',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'reasoning-language',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'author-setting',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'director-prompt',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'planning',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'people',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'guidance',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'style',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'scene-style',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'discussion',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'retention',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'objective-state',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'evidence',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'behavior',
      'enabled': true,
      'role': 'system',
    },
    {
      'id': 'player-guidance',
      'enabled': true,
      'role': 'user',
    },
    {
      'id': 'reasoning-mode',
      'enabled': true,
      'role': 'user',
      'title': '导演简短思维链',
      'content': '〖思维模式要求〗在你的思考过程（<think>标签内）中，请遵守以下规则：\n1. 禁止使用圆括号包裹内心独白，例如“（心想：……）”或“(内心OS：……)”，所有分析内容直接陈述即可\n2. 禁止以角色第一人称描写内心活动，例如“我心想”“我觉得”“我暗自”等，请用分析性语言替代\n3. 思考内容应聚焦于剧情走向分析和回复内容规划，不要在思考中进行角色扮演式的内心戏表演\n4. 每次工具调用前，只用一至三个短句判断当前戏剧压力、下一拍客观推进和立即执行的动作。不要复述上下文、展开长篇分析或预写旁白。\n5. 持久角色的台词、私密心理和自主选择交给角色本人；需要多方追问、回应或协商时安排群组讨论。确定下一拍后调用 director_command；只有工具实际报错时才简短纠正参数。',
    },
  ],
}
/** Return the historical implicit configuration without consulting today's system defaults.
 * @returns A detached copy of the original implicit recipe.
 */
export function legacyContextRecipe(): ContextRecipe { return structuredClone(recipe) }
