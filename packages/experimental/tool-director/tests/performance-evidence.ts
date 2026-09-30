/** Measured runtime evidence for human review of Moonshadow Ledger performances. */
import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** Derive model-step counters and end-to-response step times; absent provider accounting stays unavailable. */
export function performanceMetrics(logs: readonly (readonly SessionEvent[])[], elapsedMs: number) {
  let steps = 0
  let modelResponses = 0
  let toolCalls = 0
  let toolResults = 0
  let toolFailures = 0
  let usageReports = 0
  let inputTokens = 0
  let outputTokens = 0
  const stepResponseMs: number[] = []
  for (const events of logs) {
    let requestAt: number | undefined
    for (const event of events) {
      if (event.type === 'step/start') { steps++; requestAt = event.time }
      if (event.type === 'tool/call') toolCalls++
      if (event.type === 'tool/result') {
        toolResults++
        if (event.data.error !== undefined) toolFailures++
      }
      if (event.type !== 'assistant/message') continue
      modelResponses++
      if (requestAt !== undefined) {
        stepResponseMs.push(event.time - requestAt)
        requestAt = undefined
      }
      if (event.data.usage === undefined) continue
      usageReports++
      inputTokens += event.data.usage.inputTokens
      outputTokens += event.data.usage.outputTokens
    }
  }
  return {
    version: 2, elapsedMs, steps, modelResponses, stepResponseMs, toolCalls, toolResults, toolFailures,
    unfinishedToolCalls: toolCalls - toolResults,
    toolFailureRate: toolResults === 0 ? null : toolFailures / toolResults,
    tokenAccounting: {
      reportedResponses: usageReports, complete: usageReports === modelResponses && modelResponses === steps && steps > 0,
      inputTokens: usageReports === 0 ? null : inputTokens,
      outputTokens: usageReports === 0 ? null : outputTokens,
    },
  }
}

/** Evaluation criteria intentionally left for human judgments, with quotes and log references. */
export function performanceReview() {
  return {
    reviewer: null, reviewedAt: null,
    cognitionCounts: {
      nameLeaks: null, unsupportedKnowledge: null, duplicatePeople: null,
      reviewedUtterances: null, reviewedJudgments: null, reviewedCreations: null,
      evidence: [] as string[],
    },
    criteria: [
      '人物表达是否可区分', '是否机械重复设定、动机或措辞', '是否尊重人物欲望、关系和当下刺激',
      '是否代写玩家未提交的后续行动', '是否泄漏其他角色秘密或未感知世界事实',
      '陌生人姓名或身份对应是否提前泄漏', '新建人物是否重复、是否有创建依据', '推断是否超出所引证据',
      '是否把风格示例当作经历', '沉默、拒绝、误解及改变主意是否自然',
    ].map(criterion => ({ criterion, result: null, evidence: [] as string[], notes: '' })),
  }
}
