import type { QuestionBankSearchRequest, QuestionBankDetail } from './question-bank-contracts'
import type { DraftBankPlan } from './draft-contracts'

/** D30：候选检索量 = 目标题数 × 3（Renderer 过目步与 Main 候选检索一致）。 */
export const DRAFT_BANK_CANDIDATE_MULTIPLIER = 3

/**
 * D30/V17-D：DraftBankPlan → QuestionBankSearchRequest（Renderer 过目步与 Main
 * 候选检索共用，保证所见即所发）。tagMode 固定 include。
 */
export function bankPlanToSearchRequest(plan: DraftBankPlan): QuestionBankSearchRequest {
  return {
    ...(plan.text === undefined ? {} : { text: plan.text }),
    ...(plan.tags === undefined ? {} : { tags: plan.tags, tagMode: 'include' as const }),
    ...(plan.grade === undefined ? {} : { grade: plan.grade }),
    ...(plan.type === undefined ? {} : { type: plan.type }),
    ...(plan.difficultyMin === undefined ? {} : { difficultyMin: plan.difficultyMin }),
    ...(plan.difficultyMax === undefined ? {} : { difficultyMax: plan.difficultyMax }),
  }
}

/** D30：题库候选渲染为上下文文本块（题干 + 选项 + 答案 + 解析 + 元数据行 + 含图标记）。 */
export function renderQuestionForContext(question: QuestionBankDetail): string {
  const hasAssets = question.assets.length > 0
  const lines: string[] = []
  lines.push(question.questionNo === null ? question.content : `第 ${question.questionNo} 题 ${question.content}`)
  if (question.options.length > 0) {
    lines.push(question.options.map((option) => `${option.key}. ${option.text}`).join('\n'))
  }
  lines.push(`答案：${question.answer === '' ? '（未提供）' : question.answer}`)
  lines.push(`解析：${question.analysis === '' ? '（未提供）' : question.analysis}`)
  lines.push(
    [
      `tag：${question.tags.length > 0 ? question.tags.join('、') : '无'}`,
      `难度：${question.difficulty === null ? '未标注' : String(question.difficulty)}`,
      `年级：${question.grade ?? '未注明'}`,
      `题型：${question.typeLabel}`,
      hasAssets ? '含图' : '',
    ]
      .filter((part) => part !== '')
      .join(' / '),
  )
  if (hasAssets) {
    lines.push('（本题含图片，图片不随文本提供，仅标注“含图”）')
  }
  return lines.join('\n')
}

/** D30/V17-D：候选块文本（块头 + 候选编号 + 渲染行）；Main 注入与 Renderer 预算显示共用。 */
export function buildBankCandidateBlock(rendereds: readonly string[], count: number): string {
  return [
    `【题库候选题（共 ${count} 道，含答案解析；只能从中选择使用，不得杜撰或改编题目）】`,
    ...rendereds.slice(0, count).map((rendered, index) => `（候选 ${index + 1}）\n${rendered}`),
  ].join('\n\n')
}

/**
 * D30/V17-D：候选块预算截减——先全量，超预算退到 targetCount，再逐道递减到 1。
 * 返回能放进 budgetChars 的候选数（0 = 一道也放不下）。
 */
export function fitBankCandidateCount(
  rendereds: readonly string[],
  targetCount: number,
  budgetChars: number,
): number {
  let count = rendereds.length
  if (buildBankCandidateBlock(rendereds, count).length > budgetChars) {
    count = Math.min(count, targetCount)
  }
  while (count > 1 && buildBankCandidateBlock(rendereds, count).length > budgetChars) {
    count -= 1
  }
  return buildBankCandidateBlock(rendereds, count).length > budgetChars ? 0 : count
}
