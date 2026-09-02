import { DRAFT_MAX_REFERENCE_FILES } from './draft-contracts'

export interface DraftBudgetEntry {
  readonly fileId: string
  readonly title: string
  readonly chars: number
}

export interface DraftBudgetPlan {
  /** 基线按现状语义优先占用预算（允许在文件内被截断），参考只分配剩余预算。 */
  readonly baselineTruncated: boolean
  readonly includedReferences: readonly DraftBudgetEntry[]
  /** 未纳入（预算耗尽时 0 字）或未完整纳入（被截断）的参考，按选择顺序排列。 */
  readonly excludedReferences: readonly DraftBudgetEntry[]
  readonly includedChars: number
}

/**
 * D25 参考预算分配纯函数：基线文件优先占用预算，参考按选择顺序分配剩余预算。
 * 预算耗尽时明确给出未纳入/未完整纳入清单，替代既有静默截断。
 */
export function planDraftBudget(
  baseline: readonly DraftBudgetEntry[],
  references: readonly DraftBudgetEntry[],
  maxChars: number,
): DraftBudgetPlan {
  let remaining = Math.max(0, maxChars)
  let includedChars = 0

  for (const entry of baseline) {
    const used = Math.min(Math.max(0, entry.chars), remaining)
    includedChars += used
    remaining -= used
  }
  const baselineTruncated = baseline.some((entry) => entry.chars > maxChars)
    || baseline.reduce((sum, entry) => sum + Math.max(0, entry.chars), 0) > maxChars

  const includedReferences: DraftBudgetEntry[] = []
  const excludedReferences: DraftBudgetEntry[] = []
  for (const entry of references) {
    if (entry.chars <= 0) continue
    if (remaining <= 0) {
      excludedReferences.push(entry)
      continue
    }
    if (entry.chars > remaining) {
      includedReferences.push({ ...entry, chars: remaining })
      includedChars += remaining
      remaining = 0
      excludedReferences.push(entry)
      continue
    }
    includedReferences.push(entry)
    includedChars += entry.chars
    remaining -= entry.chars
  }

  return { baselineTruncated, includedReferences, excludedReferences, includedChars }
}

export function formatExcludedReferenceNames(excluded: readonly DraftBudgetEntry[]): string {
  return excluded.map((entry) => entry.title).join('、')
}

export function canSelectMoreReferences(selectedCount: number): boolean {
  return selectedCount < DRAFT_MAX_REFERENCE_FILES
}
