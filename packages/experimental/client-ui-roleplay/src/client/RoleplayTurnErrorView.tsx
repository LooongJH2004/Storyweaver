import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import { seedIntentDraft, storyOwnsSession } from './RoleplayChrome.tsx'
import css from './RoleplayTurnErrorView.module.css'

type RoleplayTurnErrorViewProps =
  PropsRuntime<'conversation.chat.node', 'turn-error'> & PropsLocale<typeof NS>

/** Render quota interruption as a resumable Storyweaver checkpoint. */
export function RoleplayTurnErrorView({
  node, sessionId, useStories, useInput, inputActions, t,
}: RoleplayTurnErrorViewProps) {
  const input = useInput(state => state)
  const story = useStories?.(snapshot => snapshot.items.find(item => storyOwnsSession(item, sessionId)))
  const run = story?.plotLedger.directorRun
  const incompleteRun = run !== undefined && run.status !== 'completed' ? run : undefined
  const completed = incompleteRun?.actors.filter(actor => actor.status === 'completed') ?? []
  const remaining = incompleteRun?.actors.filter(actor => actor.status !== 'completed') ?? []
  const quota = node.data.code === 'QUOTA'
  const auth = node.data.code === 'AUTH'
  const resumeSeed = incompleteRun === undefined
    ? t('draft.retryQuota')
    : t('draft.resume', {
      runId: incompleteRun.id,
      actors: remaining.map(actor => actor.actorId).join('、'),
    })

  if (node.data.code === 'CONTEXT_WINDOW_EXCEEDED') return <div className={css.errorRow} role="alert">
    <div className={css.copy}><strong>{t('retention.capacityTitle')}</strong><span>{t('retention.capacityMessage')}</span></div>
  </div>

  if (!quota) {
    return (
      <div className={css.errorRow} role="alert">
        <span className={css.dot} aria-hidden="true" />
        <div className={css.copy}>
          <strong>{auth ? t('error.authTitle') : t('error.genericTitle')}</strong>
          <span>{auth ? t('error.authMessage') : node.data.message || t('error.genericMessage')}</span>
        </div>
        {node.data.code !== undefined && <code>{node.data.code}</code>}
      </div>
    )
  }

  return (
    <section className={css.quotaCard} role="status" aria-label={t('error.quotaTitle')}>
      <div className={css.quotaIcon} aria-hidden="true">◔</div>
      <div className={css.quotaBody}>
        <strong>{t('error.quotaTitle')}</strong>
        <p>{t('error.quotaHint')}</p>
        {incompleteRun !== undefined && (
          <div className={css.checkpoint}>
            <span>{t('error.checkpoint', {
              completed: completed.length,
              total: incompleteRun.actors.length,
            })}</span>
            <span>{t('error.remaining', {
              actors: remaining.map(actor => actor.actorId).join('、'),
            })}</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => { inputActions.setDraft(seedIntentDraft(input.draft, resumeSeed)) }}
        >
          {incompleteRun === undefined ? t('error.retryDraft') : t('error.resumeDraft')}
        </button>
      </div>
      <code>{t('error.quotaCode')}</code>
    </section>
  )
}
