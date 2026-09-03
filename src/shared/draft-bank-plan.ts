import {
  DRAFT_BANK_PLAN_DEFAULT_TARGET_COUNT,
  isDraftBankPlan,
  type DraftBankPlan,
} from './draft-contracts'
import type { QuestionBankSummary } from './question-bank-contracts'

/** D30 阶段一：AI 输出检索计划的短请求 token 上限（计划 JSON 极小，非流式）。 */
export const DRAFT_BANK_PLAN_MAX_TOKENS = 4_000

export interface BankPlanPromptInput {
  readonly lessonTitle: string
  readonly periodTitle?: string
  readonly requirement?: string
  readonly summary: QuestionBankSummary
  readonly targetCount: number
}

export interface BankPlanFallbackInput {
  readonly lessonTitle: string
  readonly requirement?: string
  readonly summary: QuestionBankSummary
  readonly targetCount: number
}

/** D30 阶段一：含课次信息 + 题库 facet 摘要的检索计划 prompt（Renderer/Main 共用，纯函数）。 */
export function buildBankPlanPrompt(input: BankPlanPromptInput): string {
  const targetCount = normalizeTargetCount(input.targetCount)
  return [
    '# 题库检索计划任务',
    '你是备课助手的检索规划器。请根据课次信息和老师要求，规划一次题库检索，用于后续从题库候选题中选题写作。',
    '# 课次信息',
    [
      `课次：${input.lessonTitle}`,
      ...(input.periodTitle === undefined || input.periodTitle.trim() === ''
        ? []
        : [`阶段：${input.periodTitle}`]),
    ].join('\n'),
    '# 老师要求',
    input.requirement === undefined || input.requirement.trim() === ''
      ? '（老师未提供额外要求，请依据课次内容规划检索。）'
      : input.requirement.trim(),
    '# 题库概览',
    renderSummaryFacets(input.summary),
    '# 输出格式',
    '只输出一个 JSON 对象，不要输出任何解释文字。',
    `{"text": "检索关键词，可为空", "tags": ["从题库现有标签中选择"], "grade": "年级，可为空", "type": "single/fill/essay/raw，可为空", "difficultyMin": 0, "difficultyMax": 100, "targetCount": ${targetCount}}`,
    `除 targetCount 固定为 ${targetCount} 外，其余字段都可省略；条件越少检索越宽，不要同时堆叠过多条件导致候选为空。`,
  ].join('\n\n')
}

/** D30 阶段一容错：解析失败时回退为“仅 text 检索 + 默认难度（题库全范围）”。 */
export function buildFallbackBankPlan(input: BankPlanFallbackInput): DraftBankPlan {
  const searchText = (input.requirement?.trim() || input.lessonTitle.trim()).slice(0, 256)
  return {
    text: searchText,
    ...(input.summary.difficultyMin === null ? {} : { difficultyMin: input.summary.difficultyMin }),
    ...(input.summary.difficultyMax === null ? {} : { difficultyMax: input.summary.difficultyMax }),
    targetCount: normalizeTargetCount(input.targetCount),
  }
}

/**
 * D30 阶段一：从 AI 文本响应中提取检索计划 JSON。
 * 容错：截取首个 `{` 到最后一个 `}`（兼容 markdown fence/说明文字包裹），
 * 解析失败或整体非法时回退 fallback；合法计划中的非法字段逐项丢弃。
 */
export function parseBankPlanText(text: string, fallback: DraftBankPlan): DraftBankPlan {
  const candidate = extractJsonObject(text)
  if (candidate === undefined) return fallback
  const plan = sanitizeBankPlan(candidate, fallback)
  return isDraftBankPlan(plan) ? plan : fallback
}

function extractJsonObject(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return undefined
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}

function sanitizeBankPlan(candidate: Record<string, unknown>, fallback: DraftBankPlan): DraftBankPlan {
  const plan: Record<string, unknown> = {}
  if (typeof candidate.text === 'string' && candidate.text.trim() !== '' && candidate.text.length <= 256) {
    plan.text = candidate.text.trim()
  }
  if (typeof candidate.grade === 'string' && candidate.grade.trim() !== '' && candidate.grade.length <= 64) {
    plan.grade = candidate.grade.trim()
  }
  if (typeof candidate.type === 'string' && candidate.type.trim() !== '' && candidate.type.length <= 64) {
    plan.type = candidate.type.trim()
  }
  if (Array.isArray(candidate.tags)) {
    const tags = [...new Set(
      candidate.tags
        .filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '' && tag.length <= 128)
        .map((tag) => tag.trim()),
    )]
    if (tags.length > 0 && tags.length <= 20) plan.tags = tags
  }
  const min = candidate.difficultyMin
  const max = candidate.difficultyMax
  if (isDifficulty(min) && isDifficulty(max) && min > max) {
    // 非法字段丢弃（D30）：区间颠倒时两个难度界都放弃，走题库默认范围
  } else {
    if (isDifficulty(min)) plan.difficultyMin = min
    if (isDifficulty(max)) plan.difficultyMax = max
  }
  const targetCount = isFallbackTargetCount(candidate.targetCount)
    ? candidate.targetCount
    : fallback.targetCount
  return { ...plan, targetCount } as DraftBankPlan
}

function isFallbackTargetCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 20
}

function isDifficulty(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100
}

function normalizeTargetCount(value: number): number {
  return Number.isInteger(value) && value >= 1 && value <= 20 ? value : DRAFT_BANK_PLAN_DEFAULT_TARGET_COUNT
}

function renderSummaryFacets(summary: QuestionBankSummary): string {
  const lines = [`题目总数：${summary.questionCount}`]
  lines.push(`年级：${renderFacet(summary.grades)}`)
  lines.push(`题型：${renderFacet(summary.types)}`)
  lines.push(`标签：${renderFacet(summary.tags)}`)
  lines.push(
    `难度范围：${summary.difficultyMin === null || summary.difficultyMax === null ? '未标注' : `${summary.difficultyMin}–${summary.difficultyMax}`}`,
  )
  return lines.join('\n')
}

function renderFacet(values: readonly { readonly label: string; readonly count: number }[]): string {
  if (values.length === 0) return '无'
  const rendered = values.slice(0, 50).map((value) => `${value.label}(${value.count})`).join('、')
  return values.length > 50 ? `${rendered} 等 ${values.length} 项` : rendered
}
