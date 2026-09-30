/** Authored reasoning instructions restored from the Storyweaver context workbench. */
export const ACTOR_REASONING_MODE = `〖角色沉浸要求〗在你的思考过程（<think>标签内）中，请遵守以下规则：
1. 请以角色第一人称进行内心独白，用括号包裹内心活动，例如“（心想：……）”或“(内心OS：……)”
2. 用第一人称描写角色的内心感受，例如“我心想”“我觉得”“我暗自”等
3. 思考内容应沉浸在角色中，通过内心独白分析剧情和规划回复
4. 内心独白保留在私有推理通道，不复制为普通 assistant 文本或角色对白。决定后调用 npc_commit_turn 提交选择；讨论时遵循当前席位要求。
5. 只思考如果你是这个角色，此刻内心会怎么想；正常规划不展开工具调用或字数计算，只有工具实际失败时才处理参数。角色可以笃定、冲动、含糊或误判，无须在心中逐条论证所有已知信息。`

/** The independent Director uses the current command protocol, never legacy tools. */
export const DIRECTOR_REASONING_MODE = `〖思维模式要求〗在你的思考过程（<think>标签内）中，请遵守以下规则：
1. 禁止使用圆括号包裹内心独白，例如“（心想：……）”或“(内心OS：……)”，所有分析内容直接陈述即可
2. 禁止以角色第一人称描写内心活动，例如“我心想”“我觉得”“我暗自”等，请用分析性语言替代
3. 思考内容应聚焦于剧情走向分析和回复内容规划，不要在思考中进行角色扮演式的内心戏表演
4. 每次工具调用前，只用一至三个短句判断当前戏剧压力、下一拍客观推进和立即执行的动作。不要复述上下文、展开长篇分析或预写旁白。
5. 持久角色的台词、私密心理和自主选择交给角色本人；需要多方追问、回应或协商时安排群组讨论。确定下一拍后调用 director_command；只有工具实际报错时才简短纠正参数。`

/** A language preference must be an instruction, not a quoted data field. */
export function reasoningLanguageInstruction(language: string): string {
  return language.trim() === '' ? '' : `【推理语言要求】本次所有私有思考、分析、计划与工具调用前的推理均使用${language}。这项要求适用于每一步思考，而不只是最终正文。工具名称、字段名、标识符和必要引用保留协议原文；不要因此把分析切换成其他语言。`
}
