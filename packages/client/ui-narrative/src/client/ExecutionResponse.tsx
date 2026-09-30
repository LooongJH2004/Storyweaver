/** Model drafts and private reasoning are explicitly author diagnostics. */
import type { ExecutionResponseView } from '@deepseek-ai/dsh-roleplay-core/types'
import type { NarrativeProps } from './contract.ts'
import { ReasoningDisclosure } from '@deepseek-ai/dsh-client-ui-primitives'

/** Display recorded output without inferring that any proposed tool operation was accepted. */
export function ExecutionResponse(props: { response: ExecutionResponseView; t: NarrativeProps['t'] }) {
  const { response, t } = props
  return <section>
    <p>{t('diagnosticOnly')}</p><strong>{t(`response-${response.state}`)}</strong>
    {response.text !== '' && <pre>{response.text}</pre>}
    {response.reasoning !== '' && <ReasoningDisclosure text={response.reasoning} running={response.state === 'streaming'}
      title={t('recordedReasoning')} runningLabel={t('submitting')} />}
    {response.toolCalls.map(call => <details key={call.id}><summary>{call.name}</summary><pre>{call.arguments}</pre></details>)}
  </section>
}
