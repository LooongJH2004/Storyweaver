import { CreativeSourceLabel } from './CreativeControls.tsx'
import type { CreativeSettingsView } from '@deepseek-ai/dsh-roleplay-core/creative-application'
import type { CreativeModule } from '@deepseek-ai/dsh-roleplay-core/creative-modules'
/** Ordered context modules use the same persisted definition as actual model requests. */
import { useEffect, useState } from 'react'
import { reasoningSection, performanceSection, resolveContextRecipe, repairContextRecipe, optimizeActorContextRecipe } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { contextRecipeSchema, type ContextSection } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import type { AuthorWorkspaceView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import css from './Narrative.module.css'
import { Settings } from './Settings.tsx'
import { NarrationLengthFields } from './NarrationLengthFields.tsx'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'

/** Show exact roles, source order and author reference text without editing world facts. */
export function Recipe(props: NarrativeProps & { workspace: AuthorWorkspaceView }) {
  const { t, workspace } = props
  const [creative, setCreative] = useState<CreativeSettingsView | null>(null)
  const [creativeError, setCreativeError] = useState('')
  useEffect(() => {
    let active = true
    void props.creativeSettings(workspace.instance.id).then((value) => { if (active) { setCreative(value); setCreativeError('') } },
      (error: unknown) => { if (active) setCreativeError(String(error)) })
    return () => { active = false }
  }, [workspace.instance.id, workspace.instance.revision, props.creativeSettings])
  const savedDraft = props.useStore(value => value.recipeDrafts?.[workspace.instance.id])
  const recipe = resolveContextRecipe(savedDraft ?? workspace.contextRecipe)
  const setRecipe = (value: typeof recipe) => { props.actions.recipeDraft(workspace.instance.id, value) }
  const [side, setSide] = useState<'actor' | 'director'>('director')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const dirty = savedDraft !== undefined
  const setDirty = (value: boolean) => { if (!value) props.actions.recipeDraft(workspace.instance.id, null) }
  const selected = props.useAuthor(value => value.request)
  const people = props.useAuthor(value => value.people)
  const detail = props.useInspection(value => value)
  const [source, setSource] = useState<string | null>(null)
  const [dragged, setDragged] = useState<number | null>(null)
  useEffect(() => { setSide(selected?.actorId === undefined ? 'director' : 'actor') }, [selected?.actorId])
  const change = (index: number, patch: Partial<ContextSection>) => {
    setRecipe({ ...recipe, [side]: recipe[side].map((section, current) => current === index ? { ...section, ...patch } : section) })
    setDirty(true)
    setStatus(t('dirty'))
  }
  const move = (index: number, direction: number) => {
    const sections = [...recipe[side]]
    const [section] = sections.splice(index, 1)
    if (section === undefined) return
    sections.splice(index + direction, 0, section)
    setRecipe({ ...recipe, [side]: sections }); setDirty(true); setStatus(t('dirty'))
  }
  return <section><form onSubmit={(event) => { event.preventDefault(); setBusy(true); setStatus('')
    void (async () => {
      try { await props.recipe(workspace.instance.id, workspace.instance.revision,
        contextRecipeSchema.parse(recipe))
      await props.author(workspace.instance.id, selected?.actorId); setDirty(false); setStatus(t('saved'))
      } catch (error) { setStatus(String(error)) } finally { setBusy(false) }
    })()
  }}>
    <h3>{t('contextRecipe')}</h3>
    <p>{t('syncEditorHint')}</p><button type="button" disabled={creative === null} onClick={() => {
      if (creative !== null) props.actions.openCreative({ bookId: creative.bookId, instanceId: workspace.instance.id, tab: 'stories' })
    }}>{t('syncManage')}</button>
    {creativeError && <p role="alert">{creativeError}</p>}
    <select aria-label={t('contextRecipe')} value={side} onChange={(event) => {
      const target = event.target.value === 'actor' ? people?.entries[0]?.definition.actorId : undefined
      if (event.target.value === 'actor' && target === undefined) { setStatus(t('selectCharacterFirst')); return }
      void props.author(workspace.instance.id, target).catch((error: unknown) => { setStatus(String(error)) })
    }}>
      <option value="director">{t('director')}</option><option value="actor">{t('characters')}</option>
    </select>
    <p>{t('recipeHint')}</p>
    <p>{t('recipeRolesHint')}</p>
    {side === 'director' && <>
      {creative !== null && <CreativeSourceLabel t={t} view={creative} module="narrationLength" />}
      <fieldset className={css.creativeFieldset} disabled={creative === null || creative.bindings.modules.narrationLength.source !== 'local'}><NarrationLengthFields t={t} value={recipe.narrationLength} change={(value) => {
        setRecipe({ ...recipe, narrationLength: value }); setStatus(t('dirty'))
      }} /></fieldset><div className={css.toolbar}><button type="submit" disabled={busy || !dirty}>{t('saveRecipeApply')}</button>
        <span aria-live="polite">{busy ? t('savingRecipe') : dirty ? t('recipeUnsaved') : status || t('recipeActive')}</span></div></>}
    {side === 'actor' && <div className={css.recipeRepair}><p>{t('optimizeActorCacheHint')}</p>
      <button type="button" disabled={busy || JSON.stringify(optimizeActorContextRecipe(recipe)) === JSON.stringify(recipe)} onClick={() => {
        setRecipe(optimizeActorContextRecipe(recipe)); setStatus(t('dirty'))
      }}>{t('optimizeActorCache')}</button></div>}
    {JSON.stringify(repairContextRecipe(recipe)) !== JSON.stringify(recipe) && <div className={css.recipeRepair}>
      <p>{t('repairRecipeHint')}</p><button type="button" disabled={busy} onClick={() => {
        setRecipe(repairContextRecipe(recipe)); setStatus(t('dirty'))
      }}>{t('repairRecipe')}</button></div>}
    {!recipe[side].some(section => section.id === 'reasoning-mode') && <button type="button" onClick={() => {
      setRecipe({ ...recipe, [side]: [...recipe[side], reasoningSection(side)] }); setDirty(true)
    }}>{t('restoreReasoningMode')}</button>}
    {!recipe[side].some(section => section.id === 'policy') && <button type="button" onClick={() => {
      const grouped = recipe[side].find(section => section.id === 'guidance')
      if (grouped === undefined) throw new Error('The recipe has no author guidance source')
      setRecipe({ ...recipe, [side]: [...recipe[side], ...(['policy', 'tools', 'reasoning-language'] as const).map(id => ({ id, role: grouped.role, enabled: grouped.enabled }))] }); setDirty(true)
    }}>{t('splitRules')}</button>}
    {recipe[side].map((section, index) => <details key={section.id} className={css.recipeRow} open={section.id.startsWith('custom:') || section.id === 'performance'} draggable
      onDragStart={() => { setDragged(index) }} onDragEnd={() => { setDragged(null) }}
      onDragOver={(event) => { event.preventDefault() }} onDrop={(event) => { event.preventDefault()
        if (dragged !== null) move(dragged, index - dragged); setDragged(null)
      }}>
      <summary>{index + 1}. {section.title ?? t(`section-${section.id}` as Parameters<typeof t>[0])}<small>{section.role} · {t(section.enabled ? 'enabled' : 'disabled')}</small></summary>
      <button type="button" aria-expanded={source === section.id} onClick={() => { setSource(source === section.id ? null : section.id) }}>
        {section.title ?? t(`section-${section.id}` as Parameters<typeof t>[0])}</button>
      {(section.id === 'performance' || section.id === 'reasoning-mode') && creative !== null && <CreativeSourceLabel t={t} view={creative}
        module={`${side}.${section.id}`} />}
      <fieldset className={css.creativeFieldset} disabled={(section.id === 'performance' || section.id === 'reasoning-mode')
        && (creative === null || creative.bindings.modules[`${side}.${section.id}` as CreativeModule].source !== 'local')}>
        <div className={css.toolbar}>
          <label><input type="checkbox" checked={section.enabled}
            onChange={(event) => { change(index, { enabled: event.target.checked }) }} />{t('enabled')}</label>
          <label>{t('role')}<select value={section.role} onChange={(event) => { change(index, { role: event.target.value as ContextSection['role'] }) }}>
            {(['system', 'user', 'assistant'] as const).map(role => <option key={role} value={role}>{role}</option>)}
          </select></label>
          <button type="button" disabled={index === 0} onClick={() => { move(index, -1) }}>{t('up')}</button>
          <button type="button" disabled={index === recipe[side].length - 1} onClick={() => { move(index, 1) }}>{t('down')}</button>
        </div>
        {(section.id.startsWith('custom:') || section.id === 'reasoning-mode' || section.id === 'performance') && <>
          <label>{t(section.id === 'reasoning-mode' ? 'reasoningTitle' : 'customTitle')}<input value={section.title} onChange={(event) => { change(index, { title: event.target.value }) }} /></label>
          <label>{t(section.id === 'performance' ? 'performanceText' : section.id === 'reasoning-mode' ? 'reasoningText' : 'customText')}<textarea aria-label={t(section.id === 'performance' ? 'performanceText' : section.id === 'reasoning-mode' ? 'reasoningText' : 'customText')} value={section.content} onChange={(event) => { change(index, { content: event.target.value }) }} /></label>
          {section.id === 'performance' ? <><p>{t('performanceHint')}</p><div className={css.toolbar}>
            <button type="submit" disabled={busy || !dirty}>{t('saveRecipeApply')}</button>
            <span aria-live="polite">{busy ? t('savingRecipe') : dirty ? t('recipeUnsaved') : status || t('recipeActive')}</span>
            <button type="button" onClick={() => { change(index, performanceSection(side)) }}>{t('restorePerformance')}</button></div></>
            : <button type="button" onClick={() => { setRecipe({ ...recipe, [side]: recipe[side].filter(item => item.id !== section.id) }); setDirty(true) }}>{t('remove')}</button>}
        </>}
      </fieldset>
    </details>)}
    <button type="button" onClick={() => { setRecipe({ ...recipe, [side]: [...recipe[side],
      { id: `custom:${randomUUID()}`, role: 'user', enabled: true, title: '', content: '' }] }); setDirty(true); setStatus(t('dirty')) }}>{t('custom')}</button>
    <div className={css.recipeSaveBar}><button disabled={busy || !dirty}>{t('save')}</button><button type="button" disabled={busy || !dirty} onClick={() => { setDirty(false); setStatus('') }}>{t('discardDraft')}</button><p role="status">{status || (dirty ? t('recipeUnsaved') : t('recipeActive'))}</p></div>
  </form>
  {source !== null && <Modal open onClose={() => { setSource(null) }} title={t('sourceEditor')} closeLabel={t('closePanel')}
    className={`${css.requestDialog}`} contentClassName={`${css.dialogScroll}`}><section className={`${css.surface} ${css.card}`}>
      <p>{t('savedSourceHint')}</p>
      {detail.context?.sections.filter(section => section.id === source).map((section, index) => <pre key={index}>{section.content}</pre>)}
      {['author-setting', 'director-prompt', 'guidance', 'policy', 'tools', 'reasoning-language'].includes(source) ? <Settings {...props} workspace={workspace}
        fields={source === 'policy' || source === 'tools' ? ['contextRules'] : source === 'reasoning-language' ? ['reasoningLanguage']
          : source === 'director-prompt' ? ['directorPrompt'] : source === 'guidance' ? ['directorRules', 'reasoningLanguage', 'contextRules', 'discussionSettings']
            : recipe.director.some(section => section.id === 'director-prompt') ? ['premise', 'setting', 'worldTruth'] : ['premise', 'setting', 'worldTruth', 'directorPrompt']}
        {...source === 'policy' || source === 'tools' ? { rule: { side, field: source } } : {}} />
        : !source.startsWith('custom:') && source !== 'reasoning-mode' && source !== 'performance' && <button onClick={() => { props.actions.authorTab(
          source === 'style' || source === 'scene-style' ? 'style' : source === 'objective-state' || source === 'subjective-state' ? 'state'
            : ['identity', 'people', 'knowledge', 'lifecycle'].includes(source) ? 'characters' : 'settings') }}>{t('editSource')}</button>}
    </section></Modal>}
  </section>
}
