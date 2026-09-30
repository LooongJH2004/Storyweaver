/** Assistant reasoning disclosure, independent of Tool-call presentation. */
import { ReasoningDisclosure } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'

/** Render the Chat-localized assistant reasoning row. */
export function ReasoningRow({ text, running, t }: { text: string; running: boolean; t: ChatViewSlotProps['t'] }) {
  return <ReasoningDisclosure text={text} running={running} title={t('message.think')} runningLabel={t('row.running')} />
}
