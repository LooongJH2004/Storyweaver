import { ContextAssembly, recipeOf } from './context-recipe.ts'
import { playerActor } from './player-control.ts'
import { reasoningLanguageInstruction } from './reasoning-mode.ts'
import { directorOutlineSchema } from './outline-rules.ts'
import { appendRetention } from './retention-records.ts'
import { RetentionQueries } from './retention.ts'
import type { NarrativeRecallInput } from './command-inputs.ts'
import type { NarrativeRecallView } from './types.ts'
/** Director context reads pinned settings and instance facts without exposing private minds as world truth. */
import { z } from 'zod'
import { resolveInstanceSettings } from './settings.ts'
import { parseStorybookDocument } from './storybook.ts'
import { renderStyle, resolveStyle, styleOverridesSchema } from './style.ts'
import { entity, compareRecordKeys } from './records.ts'
import { sceneOf, personOf, stateOf, publishedBehaviorSchema, discussionsOf } from './world.ts'
import { currentDiscussion } from './discussions.ts'
import { pendingWorldAttempts } from './world-attempts.ts'
import type { DirectorContextView, InstanceId, NarrativeReader } from './types.ts'

/** Frozen director inputs use the same renderer for previews and real execution. */
export class DirectorQueries {
  constructor(private readonly narrative: NarrativeReader, private readonly recallCharacterLimit: number,
    private readonly pageLimit: number) {}

  /** Director recall has no access to personal evidence, knowledge, or private lifecycle records. */
  recall(instanceId: InstanceId, input: NarrativeRecallInput, revision: number): NarrativeRecallView {
    return new RetentionQueries(this.narrative, this.pageLimit, this.recallCharacterLimit)
      .recall(instanceId, 'director', input, revision)
  }

  /** Read one explicit story revision; user guidance is not fact, and consolidation omits the performance-direction directory. */
  context(input: { instanceId: InstanceId; revision?: number; instruction: string; purpose?: 'consolidation' }): DirectorContextView {
    const snapshot = input.revision === undefined ? this.narrative.snapshot(input.instanceId)
      : this.narrative.replay(input.instanceId, input.revision)
    const book = parseStorybookDocument(entity(snapshot, { collection: 'setting', id: 'book' }))
    const settings = resolveInstanceSettings(snapshot).effective
    const scene = sceneOf(snapshot)
    const directions = styleOverridesSchema.parse(entity(snapshot, { collection: 'style', id: 'current' }))
    const style = resolveStyle({ kind: 'director', guidance: book.directorGuidance }, directions, 'director', scene.id)
    const outline = directorOutlineSchema.parse(entity(snapshot, { collection: 'planning', id: 'current' }))
    const discussion = currentDiscussion(snapshot)
    const configured = recipeOf(snapshot)
    const recipe = configured.director
    let narrationLengthContent = ''
    if (configured.narrationLength?.enabled) {
      const { minimum, target } = configured.narrationLength
      narrationLengthContent = `[旁白字数校验 — 已保存的数值设置，优先于其他文字中的篇幅建议]\n最低 ${minimum} 字，目标 ${target} 字。程序统计面向读者的旁白中的文字与数字（英文每个字母计一字），不计标点、空白、Markdown 标记、链接地址和内部人物 ID。每条公开旁白单独校验；最多补写两次。director_observe 返回 narrationDraft.status=pending 时尚未提交事件，使用 director_revise_narration 补充或展开原稿；published 才能继续调度。目标不是硬性上限。纯内部结算可以省略 narration，但不得借此省略用户要求的旁白。`
    }
    const assembly = new ContextAssembly(recipe)
    const add = (id: string, label: string, source: string, value: unknown): boolean =>
      assembly.add(id, `[${label}]\n${JSON.stringify(value)}`, source)
    const separate = (id: string) => recipe.some(section => section.id === id)
    add('author-setting', 'DIRECTOR — private author information; never forward this context to actors', 'setting:book', {
      setting: settings.setting, premise: settings.premise, worldTruth: settings.worldTruth,
      ...(!separate('director-prompt') ? { directorPrompt: settings.directorPrompt } : {}),
    })
    if (separate('director-prompt')) assembly.add('director-prompt', settings.directorPrompt, 'setting:directorPrompt')
    for (const [id, value] of [['policy', settings.contextRules.director.policy], ['tools', settings.contextRules.director.tools]] as const)
      if (separate(id)) assembly.add(id, value, 'setting:overrides')
    const language = reasoningLanguageInstruction(settings.reasoningLanguage)
    if (separate('reasoning-language')) assembly.add('reasoning-language', language, 'setting:overrides')
    add('guidance', 'AUTHOR GUIDANCE', 'setting:overrides', {
      ...(!separate('policy') || !separate('tools') ? { authorGuidance: {
        ...(!separate('policy') ? { policy: settings.contextRules.director.policy } : {}),
        ...(!separate('tools') ? { tools: settings.contextRules.director.tools } : {}),
      } } : {}),
      ...(!separate('reasoning-language') ? { reasoningLanguage: language } : {}),
      directorRules: settings.directorRules, discussionSettings: settings.discussionSettings })
    add('planning', 'DIRECTOR PLAN — candidates, not world facts', 'planning:current', { authoredBeatCandidates: book.beats,
      outline: { ...outline, history: [],
        pendingSuggestions: outline.pendingSuggestions.map(item => ({ id: item.id, reason: item.reason })) } })
    const registered = snapshot.entities.filter(item => item.key.collection === 'people').map(item => personOf(snapshot, item.key.id))
      .filter(person => !person.archived).sort((a, b) => compareRecordKeys(a.definition.actorId, b.definition.actorId))
    add('people', 'REGISTERED PEOPLE — reuse these IDs; use find to read details', 'people:directory', {
      total: registered.length, entries: registered.map(person => ({
        actorId: person.definition.actorId, name: person.definition.displayName, appearance: person.definition.appearance,
        persona: person.definition.publicPersona,
      })),
    })
    const controlled = playerActor(snapshot)
    add('people', 'CURRENT SCENE', 'scene:current', { scene, protagonistActorId: book.protagonistActorId,
      playerControlledActorId: controlled,
      aiControlledPresentActorIds: scene.present.filter(id => id !== controlled && !personOf(snapshot, id).archived),
      ...(input.purpose === 'consolidation' ? {} : {
        activePerformanceDirections: directions.scene?.sceneId === scene.id ? directions.scene.instructions : {},
      }),
      playerControlRule: 'playerControlledActorId is the authoritative live ownership setting. null means observer mode: all available characters, including the protagonist, act through their own AI executor. Authored labels such as player character or protagonist do not reserve a character for the player. A non-null ID reserves only that character: do not dispatch it or narrate its choices; relevant discussions wait on its player floor. The director never writes character choices, even in observer mode: schedule the character executor instead.',
      present: scene.present.map((id) => {
        const person = personOf(snapshot, id)
        return { actorId: id, name: person.definition.displayName, appearance: person.definition.appearance,
          persona: person.definition.publicPersona }
      }) })
    if (discussion !== undefined) add('discussion', 'DISCUSSION FLOOR', 'discussion:current', {
      id: discussion.id, topic: discussion.topic, status: discussion.status, participantIds: discussion.participantIds,
      currentSpeakerId: discussion.currentSpeakerId,
    })
    if (discussion?.status === 'summarizing') add('discussion', 'DISCUSSION CONSOLIDATION', 'discussion:consolidation', {
      topic: discussion.topic,
      instruction: 'Consolidate this exchange before closing it. Use context-update to retain the established events, explicit commitments, conditions and unresolved consequences that matter later. Cite original source IDs from accepted behavior or settled facts; use recall for earlier contributions missing from this request. Distinguish what someone claimed from what happened, and an intended action from its result. Record disagreement or deadlock without forcing agreement. Keep text brief; episode details may describe the public event and its consequences, not actors\' private interpretations. Do not infer or request private actor memories. If no meaningful durable change occurred, close without inventing one. Existing activation policy governs the notes; do not resubmit unchanged summaries.',
    })
    const requests = (discussionsOf(snapshot).requests ?? []).filter(item => ['pending', 'deferred'].includes(item.status))
    if (requests.length > 0) add('discussion', 'DISCUSSION REQUESTS — invitations, not established dialogue', 'discussion:requests', requests)
    const waiting = pendingWorldAttempts(snapshot)
    if (waiting.length > 0) add('behavior', 'PENDING WORLD ATTEMPTS — settle IDs and deliver actor feedback', 'world:pending',
      waiting.map(item => ({ id: item.id, actorId: item.actorId, sceneId: item.sceneId, behavior: item.behavior })))
    assembly.add('style', renderStyle(style.profile), 'style:current')
    if (style.sceneInstruction !== '') assembly.add('scene-style', `[CURRENT SCENE GUIDANCE]\n${style.sceneInstruction}`, 'style:scene')
    assembly.add('player-guidance', `[PLAYER GUIDANCE — not established facts]\n${input.instruction}`, 'player-guidance')
    const archived = appendRetention(snapshot, 'director', (label, value, source) => add('retention', label, source, value))
    for (const item of stateOf(snapshot, 'world').entries.filter(entry => entry.active)) {
      add('objective-state', 'OBJECTIVE STATE', `state:${item.definition.id}`, item)
    }
    for (const fact of snapshot.entities.filter(item => item.key.collection === 'facts')
      .map(item => z.object({ id: z.string(), summary: z.string(), content: z.string(),
        revision: z.number() }).parse(item.value))
      .filter(fact => !archived.has(fact.id))
      .sort((a, b) => a.revision - b.revision || compareRecordKeys(a.id, b.id))) {
      add('evidence', 'SETTLED FACT', fact.id, fact)
    }
    for (const behavior of snapshot.entities.filter(item => item.key.collection === 'behavior')
      .map(item => publishedBehaviorSchema.parse(item.value))
      .filter(behavior => !archived.has(behavior.id))
      .sort((a, b) => a.revision - b.revision || a.order - b.order || compareRecordKeys(a.id, b.id))) {
      add('behavior', 'ACCEPTED BEHAVIOR — action attempts require world settlement; dialogue claims need not be true', behavior.id,
        { id: behavior.id, actorId: behavior.actorId, behavior: behavior.behavior, revision: behavior.revision })
    }
    const rendered = assembly.finish()
    if (narrationLengthContent !== '') {
      rendered.sections.push({ id: 'narration-length', role: 'system', content: narrationLengthContent, sources: ['recipe:narrationLength'] })
      rendered.sources.push('recipe:narrationLength'); rendered.text += `\n\n${narrationLengthContent}`
    }
    return { instanceId: snapshot.instance.id, revision: snapshot.instance.revision, templateVersionId: snapshot.instance.templateVersionId,
      configurationRevision: z.number().int().nonnegative().parse(entity(snapshot, { collection: 'configuration', id: 'revision' })),
      role: 'director', ...rendered }
  }
}
