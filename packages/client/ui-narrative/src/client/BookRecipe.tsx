/** Storybook recipes are copied into new instances; this editor never writes a live instance. */
import { useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { initialContextRecipe, reasoningSection, performanceSection, resolveContextRecipe, repairContextRecipe, optimizeActorContextRecipe, type ContextRecipe } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { NarrativeKey } from './locales.ts'
import css from './Narrative.module.css'
import { NarrationLengthFields } from './NarrationLengthFields.tsx'

/** Draft text may be temporarily empty; reject malformed JSON shapes without hiding valid edit controls. */
function editableRecipe(value: unknown): value is ContextRecipe {
  if (value === null || typeof value !== 'object') return false
  const recipe = value as Record<string, unknown>
  return ['actor', 'director'].every((side) => {
    const sections: unknown = recipe[side]
    return Array.isArray(sections) && (sections as unknown[]).every((value) => {
      if (value === null || typeof value !== 'object') return false
      const section = value as Record<string, unknown>
      return typeof section.id === 'string' && typeof section.role === 'string' && typeof section.enabled === 'boolean'
        && (section.title === undefined || typeof section.title === 'string') && (section.content === undefined || typeof section.content === 'string')
    })
  })
}

/** Edit order, message roles and optional authored instructions in the book draft. */
export function BookRecipe({ t, recipe: value, change, manageSync, hint }: PropsLocale<'narrative'> & { recipe: unknown; change: (recipe: ContextRecipe) => void; manageSync?: () => void; hint?: string }) {
  const [side, setSide] = useState<'director' | 'actor'>('director')
  const [dragged, setDragged] = useState<number | null>(null)
  if (!editableRecipe(value)) {
    return <p role="alert">{t('bookInvalid')}</p>
  }
  const recipe = resolveContextRecipe(value)
  const sections = recipe[side]
  const update = (next: typeof sections) => { change({ ...recipe, revision: 0, [side]: next }) }
  const move = (from: number, to: number) => {
    const next = [...sections]; const [item] = next.splice(from, 1)
    if (item !== undefined) { next.splice(to, 0, item); update(next) }
  }
  return <section><p>{hint ?? t('bookContextHint')}</p>
    <p>{t('recipeRolesHint')}</p>
    {manageSync !== undefined && <button type="button" onClick={manageSync}>{t('syncManage')}</button>}
    {JSON.stringify(repairContextRecipe(recipe)) !== JSON.stringify(recipe) && <button type="button" onClick={() => { change(repairContextRecipe(recipe)) }}>{t('repairRecipe')}</button>}
    <div className={css.bookTabs}>{(['director', 'actor'] as const).map(value => <button type="button" key={value}
      aria-pressed={side === value} onClick={() => { setSide(value) }}>{t(value === 'actor' ? 'bookActor' : value)}</button>)}</div>
    {side === 'director' && <NarrationLengthFields t={t} value={recipe.narrationLength}
      change={(value) =>{  change({ ...recipe, narrationLength: value }) }} />}
    {side === 'actor' && <div className={css.recipeRepair}><p>{t('optimizeActorCacheHint')}</p>
      <button type="button" disabled={JSON.stringify(optimizeActorContextRecipe(recipe)) === JSON.stringify(recipe)}
        onClick={() => { change(optimizeActorContextRecipe(recipe)) }}>{t('optimizeActorCache')}</button></div>}
    {!sections.some(item => item.id === 'reasoning-mode') && <button type="button" onClick={() => { update([...sections, reasoningSection(side)]) }}>{t('restoreReasoningMode')}</button>}
    {sections.map((section, index) => <details key={section.id} className={css.recipeRow} open={section.id === 'performance'} draggable
      onDragStart={() => { setDragged(index) }} onDragOver={(event) => { event.preventDefault() }}
      onDrop={(event) => { event.preventDefault(); if (dragged !== null) move(dragged, index); setDragged(null) }}
      onDragEnd={() => { setDragged(null) }}>
      <summary><span>{index + 1}. {section.id === 'reasoning-mode' ? t('section-reasoning-mode') : section.title ?? t(`section-${section.id}` as NarrativeKey)}</span>
        <small>{section.role} · {t(section.enabled ? 'enabled' : 'disabled')}</small></summary>
      <div className={css.toolbar}><label><input type="checkbox" checked={section.enabled} onChange={(event) => { update(sections.map((item, i) => i === index ? { ...item, enabled: event.target.checked } : item)) }} />{t('enabled')}</label>
        <label>{t('role')}<select value={section.role} onChange={(event) => { update(sections.map((item, i) => i === index ? { ...item, role: event.target.value as typeof item.role } : item)) }}>
          {(['system', 'user', 'assistant'] as const).map(role => <option key={role} value={role}>{role}</option>)}</select></label>
        <button type="button" disabled={index === 0} onClick={() => { move(index, index - 1) }}>{t('up')}</button>
        <button type="button" disabled={index === sections.length - 1} onClick={() => { move(index, index + 1) }}>{t('down')}</button></div>
      {(section.id === 'reasoning-mode' || section.id === 'performance' || section.id.startsWith('custom:')) && <>
        <label>{t(section.id === 'reasoning-mode' ? 'reasoningTitle' : 'customTitle')}<input value={section.title ?? ''} onChange={(event) => { update(sections.map((item, i) => i === index ? { ...item, title: event.target.value } : item)) }} /></label>
        <label>{t(section.id === 'performance' ? 'performanceText' : section.id === 'reasoning-mode' ? 'reasoningText' : 'customText')}<textarea value={section.content ?? ''} onChange={(event) => { update(sections.map((item, i) => i === index ? { ...item, content: event.target.value } : item)) }} /></label>
        {section.id === 'performance' ? <><p>{t('performanceHint')}</p><button type="button" onClick={() => { update(sections.map((item, i) => i === index ? performanceSection(side) : item)) }}>{t('restorePerformance')}</button></>
          : <button type="button" onClick={() => { update(sections.filter((_, i) => i !== index)) }}>{t('remove')}</button>}
        {section.id === 'reasoning-mode' && <button type="button" onClick={() => { update(sections.map((item, i) => i === index ? reasoningSection(side) : item)) }}>{t('restoreReasoningMode')}</button>}
      </>}
    </details>)}
    <div className={css.toolbar}><button type="button" onClick={() => { update([...sections, { id: `custom:${randomUUID()}`, title: t('custom'), content: '', role: 'user', enabled: true }]) }}>{t('custom')}</button>
      <button type="button" onClick={() => { update(initialContextRecipe()[side]) }}>{t('resetRecipe')}</button></div>
  </section>
}
