import { describe, expect, it } from 'vitest'

import { DRAFT_MAX_REFERENCE_FILES, DRAFT_MAX_SOURCE_FILES, isGenerateDraftRequest } from '../src/shared/draft-contracts'
import {
  canSelectMoreReferences,
  formatExcludedReferenceNames,
  planDraftBudget,
  type DraftBudgetEntry,
} from '../src/shared/draft-reference-budget'

function entry(fileId: string, title: string, chars: number): DraftBudgetEntry {
  return { fileId, title, chars }
}

describe('V16-B reference budget and source limits', () => {
  it('exposes the D25 budget constants', () => {
    expect(DRAFT_MAX_REFERENCE_FILES).toBe(10)
    expect(DRAFT_MAX_SOURCE_FILES).toBe(32)
  })

  it('lets the baseline occupy the budget first and lists overflow references by name', () => {
    const result = planDraftBudget(
      [entry('b1', '课件 · 第 1 版.md', 1_000)],
      [
        entry('f1', '概念清单.md', 100),
        entry('f2', '易错题集.md', 100),
        entry('f3', '拓展阅读.md', 150),
      ],
      1_200,
    )

    expect(result.baselineTruncated).toBe(false)
    expect(result.includedReferences.map((item) => item.fileId)).toEqual(['f1', 'f2'])
    expect(result.excludedReferences.map((item) => item.fileId)).toEqual(['f3'])
    expect(formatExcludedReferenceNames(result.excludedReferences)).toBe('拓展阅读.md')
    expect(result.includedChars).toBe(1_200)
  })

  it('marks a partially fitting reference as excluded and stops allocation afterwards', () => {
    const result = planDraftBudget(
      [entry('b1', '基线.md', 50)],
      [
        entry('f1', '讲义.md', 200),
        entry('f2', '长参考.md', 120),
        entry('f3', '最后参考.md', 30),
      ],
      300,
    )

    expect(result.includedReferences).toEqual([entry('f1', '讲义.md', 200), entry('f2', '长参考.md', 50)])
    expect(result.excludedReferences.map((item) => item.fileId)).toEqual(['f2', 'f3'])
    expect(result.includedChars).toBe(300)
  })

  it('reports baseline truncation and excludes every reference when the baseline alone exhausts the budget', () => {
    const result = planDraftBudget(
      [entry('b1', '巨大基线.md', 40_000)],
      [entry('f1', '参考.md', 50)],
      30_000,
    )

    expect(result.baselineTruncated).toBe(true)
    expect(result.includedReferences).toEqual([])
    expect(result.excludedReferences.map((item) => item.title)).toEqual(['参考.md'])
  })

  it('skips empty references and supports the 10-file selection cap', () => {
    const result = planDraftBudget([entry('b1', '基线.md', 10)], [entry('f1', '空文件.md', 0)], 30_000)
    expect(result.includedReferences).toEqual([])
    expect(result.excludedReferences).toEqual([])

    expect(canSelectMoreReferences(9)).toBe(true)
    expect(canSelectMoreReferences(10)).toBe(false)
  })

  it('accepts 32 sources but rejects 33 in the generate request contract', () => {
    const base = {
      requestId: 'req-1',
      kind: 'lecture' as const,
      lessonId: 'lesson-1',
      maxChars: 30_000,
      maxTokens: 16_000,
    }
    const sources = (count: number) => Array.from({ length: count }, (_unused, index) => ({
      fileId: `file-${index}`,
    }))

    expect(isGenerateDraftRequest({ ...base, sources: sources(32) })).toBe(true)
    expect(isGenerateDraftRequest({ ...base, sources: sources(33) })).toBe(false)
  })
})
