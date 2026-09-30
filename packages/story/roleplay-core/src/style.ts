/** Editable performance guidance, copied presets, and audience-scoped scene direction. */
import { z } from 'zod'

const text = z.string().trim().default('')
const lines = z.array(z.string().trim().min(1)).default([])

/** Director expression preferences; these do not grant character authority. */
export const directorGuidanceSchema = z.strictObject({
  narrativeStyle: text, atmosphereAndPacing: text, viewpoint: text, lengthPreference: text,
  sensoryDetail: text, focus: lines, avoid: lines, examples: lines, additionalInstructions: text,
})
/** Actor expression preferences, distinct from identity and remembered events. */
export const actingGuidanceSchema = z.strictObject({
  speechStyle: text, habitualActions: lines, decisionPrinciples: lines, emotionalTendencies: lines,
  relationshipVoices: text, underPressure: text, lengthPreference: text,
  taboos: lines, examples: lines, additionalInstructions: text,
})
/** Guidance copied into one storybook or run. */
export const styleProfileSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('director'), guidance: directorGuidanceSchema }),
  z.strictObject({ kind: z.literal('actor'), guidance: actingGuidanceSchema }),
])
/** Director or Actor performance profile. */
export type StyleProfile = z.infer<typeof styleProfileSchema>
/** Browser-personal presets share the same validation as durable profiles. */
export const personalStylePresetsSchema = z.array(z.strictObject({ name: z.string().min(1), profile: styleProfileSchema }))
/** One named private preset copied into an editable profile. */
export type PersonalStylePreset = z.infer<typeof personalStylePresetsSchema>[number]

/** Per-run style overrides and short-lived scene instructions. */
export const styleOverridesSchema = z.strictObject({
  profiles: z.record(z.string().min(1), styleProfileSchema),
  scene: z.strictObject({ sceneId: z.string().min(1), instructions: z.record(z.string().min(1), z.string()) }).optional(),
})
/** Per-run style overrides and scene-specific direction. */
export type StyleOverrides = z.infer<typeof styleOverridesSchema>

/** Shared editable preset without a live link to its copied applications. */
export interface StylePreset { readonly id: string; readonly profile: StyleProfile }

/** Built-in starting points. Applying one copies its content. */
export const STYLE_PRESETS: readonly StylePreset[] = [
  { id: 'director-restrained', profile: styleProfileSchema.parse({ kind: 'director', guidance: {
    narrativeStyle: '克制写实。选择具体可观察的细节，以清晰动词推进；避免解释人物内心。',
    viewpoint: '第三人称客观视角，只叙述当前场景可见的变化。', lengthPreference: '默认简短，关键变化才展开。',
    atmosphereAndPacing: '跟随行动的后果推进，给玩家和人物留出回应空间。',
    avoid: ['代写玩家未提交的行动', '替角色作出决定', '每轮总结剧情'],
    examples: ['门闩从外侧响了一声。桌上的烛火向门缝偏去，雨水正沿着门槛流进来。'],
  } }) },
  { id: 'director-literary', profile: styleProfileSchema.parse({ kind: 'director', guidance: {
    narrativeStyle: '文学细描，以意象和句式变化呈现场景；修辞应来自眼前的事物。',
    sensoryDetail: '每次选择一两个与情境有关的声音、触感或气味。',
    atmosphereAndPacing: '允许停顿；危险发生时减少修辞、缩短句子。',
    avoid: ['全知地揭示角色秘密', '重复比喻和形容词堆叠'],
    examples: ['窗下积着一小片雨，倒映的灯火被脚步踩碎。远处的钟声迟了半拍才穿过雾。'],
  } }) },
  { id: 'director-brisk', profile: styleProfileSchema.parse({ kind: 'director', guidance: {
    narrativeStyle: '轻快、清晰，用简短的环境反应衔接人物对白。', lengthPreference: '短段落，一次推进一个具体变化。',
    atmosphereAndPacing: '保留轻微幽默，让冲突通过可见后果发生。',
    avoid: ['替持久角色编造对白', '为了热闹而强制发起讨论'],
  } }) },
  { id: 'actor-natural', profile: styleProfileSchema.parse({ kind: 'actor', guidance: {
    speechStyle: '自然口语。先回应对方刚刚说的具体内容，允许省略、犹豫和话说一半。',
    relationshipVoices: '对熟人减少解释；对陌生人保留距离；对在意的人会试探或回避。',
    decisionPrinciples: ['按自己的欲望、利害和认知选择；可以拒绝或沉默。'],
    taboos: ['复述完整设定', '把每个动机都说出口', '机械重复口头禅'],
    examples: ['陌生人追问：账簿的事，明日再谈。', '旧友追问：你先走。这回别问。'],
  } }) },
  { id: 'actor-taciturn', profile: styleProfileSchema.parse({ kind: 'actor', guidance: {
    speechStyle: '寡言含蓄，用准确的短句、停顿和必要动作表达立场。',
    underPressure: '回答更短，先处理实际威胁；不自动坦白全部心事。',
    taboos: ['每句配套心理解释', '为了简短而回避有意义的行动'],
    examples: ['对方递来钥匙：放下。我没说会跟你走。'],
  } }) },
  { id: 'actor-distant', profile: styleProfileSchema.parse({ kind: 'actor', guidance: {
    speechStyle: '礼貌疏离，用完整而克制的句子保留边界；礼貌不代表认同。',
    relationshipVoices: '面对可信的人偶尔放松措辞，受到逼迫时更正式。',
    examples: ['被要求交出秘密：感谢您的关心，不过这件事到此为止。'],
  } }) },
]

/**
 * Resolve the selected audience's effective profile and current-scene instruction.
 * @param baseline - authored storybook guidance for this audience.
 * @param overrides - this Story's independent override layer.
 * @param key - director or actor:<stable id>.
 * @param sceneId - actual current scene; expired instructions never apply.
 * @returns detached effective profile and optional current-scene direction.
 */
export function resolveStyle(baseline: StyleProfile, overrides: StyleOverrides, key: string, sceneId?: string): {
  profile: StyleProfile
  source: 'storybook' | 'story'
  sceneInstruction: string
} {
  const override = overrides.profiles[key]
  if (override !== undefined && override.kind !== baseline.kind) throw new Error('Style audience does not match profile kind')
  return { profile: structuredClone(override ?? baseline), source: override === undefined ? 'storybook' : 'story',
    sceneInstruction: overrides.scene !== undefined && overrides.scene.sceneId === sceneId ? overrides.scene.instructions[key] ?? '' : '' }
}

/** One audience's run override or current-scene direction. */
export type StyleUpdate =
  | { readonly key: string; readonly scope: 'story'; readonly profile?: StyleProfile | undefined }
  | { readonly key: string; readonly scope: 'scene'; readonly sceneId: string; readonly instruction: string }

/**
 * Apply an audience-validated update without overwriting another audience's instructions.
 * @param state - current override layer.
 * @param update - requested change.
 * @param actorIds - full authored cast.
 * @param currentSceneId - authoritative scene for temporary guidance.
 * @returns detached replacement; absent profiles inherit the book.
 */
export function updateStyle(
  state: StyleOverrides, update: StyleUpdate, actorIds: readonly string[], currentSceneId?: string,
): StyleOverrides {
  const director = update.key === 'director'
  if (!director && !actorIds.some(id => update.key === `actor:${id}`)) throw new Error('Unknown style audience')
  if (update.scope === 'scene') {
    if (update.sceneId !== currentSceneId) throw new Error('Scene changed; refresh before saving scene guidance')
    return styleOverridesSchema.parse({ ...state, scene: { sceneId: update.sceneId,
      instructions: { ...(state.scene?.sceneId === update.sceneId ? state.scene.instructions : {}), [update.key]: update.instruction } } })
  }
  const profile = update.profile === undefined ? undefined : styleProfileSchema.parse(update.profile)
  if (profile !== undefined && profile.kind !== (director ? 'director' : 'actor')) throw new Error('Style audience does not match profile kind')
  const profiles = Object.fromEntries(Object.entries(state.profiles).filter(([key]) => key !== update.key))
  if (profile !== undefined) profiles[update.key] = profile
  return styleOverridesSchema.parse({ ...state, profiles })
}

/**
 * Render expression guidance with examples explicitly separated from fictional facts.
 * @param profile - effective profile for exactly one audience.
 * @returns model instructions without leaking other profiles or character-private examples.
 */
export function renderStyle(profile: StyleProfile): string {
  const { examples, ...guidance } = profile.guidance
  const populated = Object.fromEntries(Object.entries(guidance).filter(([, value]) => value.length > 0))
  return `[EXPRESSION GUIDANCE — does not change knowledge, identity, or authority]\n${JSON.stringify(populated, undefined, 2)}\n\n`
    + '[STYLE EXAMPLES ONLY — fictional demonstrations, never memories or events; do not repeat their content mechanically]\n'
    + examples.join('\n')
}
