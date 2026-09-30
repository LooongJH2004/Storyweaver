/** Copy selected shared values into the existing book draft without publishing it. */
import { useState } from 'react'
import { applyCreativeValue, creativeModules, type CreativeModule, type GlobalCreativeSettings } from '@deepseek-ai/dsh-roleplay-core/creative-modules'
import { contextRecipeSchema, legacyContextRecipe } from '@deepseek-ai/dsh-roleplay-core/context-recipe'
import type { BookId, Document } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import { creativeLabels } from './CreativeControls.tsx'
import { CreativePreview } from './CreativePreview.tsx'
import css from './CreativeSync.module.css'

export function CreativeBookCopy(props: NarrativeProps & { bookId: BookId; saved: GlobalCreativeSettings }) {
  const { t, bookId, saved } = props
  const book = props.useLibrary(value => value.books.find(book => book.id === bookId))
  const edit = props.useStore(value => value.bookEdits[bookId])
  const [selected, setSelected] = useState<CreativeModule[]>([])
  const [error, setError] = useState('')
  const available = creativeModules.filter(key => Object.hasOwn(saved.modules, key))
  return <section><h2>{t('syncDraftTab')}</h2><p>{t('syncBookCopyEffect')}</p>
    {edit !== undefined && <p>{t('syncPreserveBookDraft')}</p>}
    {available.length === 0 && <p>{t('syncSetSharedFirst')}</p>}
    <div className={css.checklist}>{available.map(key => <div key={key}>
      <label><input type="checkbox" checked={selected.includes(key)} onChange={(event) => {
        setSelected(event.target.checked ? [...selected, key] : selected.filter(value => value !== key))
      }} />{t(creativeLabels[key])}</label>
      <details><summary>{t('syncPreviewNext')}</summary><CreativePreview t={t} value={saved.modules[key]} /></details>
    </div>)}</div>
    <button disabled={selected.length === 0 || book === undefined} onClick={() => {
      if (book === undefined) return
      try {
        const input: unknown = edit === undefined ? structuredClone(book.document) : JSON.parse(edit.document)
        if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error(t('bookInvalid'))
        const document = input as Document
        let recipe = document.contextRecipe === undefined ? legacyContextRecipe() : contextRecipeSchema.parse(document.contextRecipe)
        for (const key of selected) { const value = saved.modules[key]
          if (value !== undefined) recipe = applyCreativeValue(recipe, key, value)
        }
        const next = { ...document, contextRecipe: recipe }
        props.actions.editBook({ draft: edit?.draft ?? book, title: edit?.title ?? book.title, document: JSON.stringify(next, null, 2) })
        props.actions.panel('books')
      } catch (error) { setError(String(error)) }
    }}>{t('syncCopyToDraft', { count: selected.length })}</button>
    {error && <p role="alert">{error}</p>}
  </section>
}
