import { describe, expect, it } from 'vitest'

import {
  DRAFT_BANK_PLAN_MAX_TARGET_COUNT,
  isDraftBankPlan,
  isDraftBankSelection,
  isDraftNoteMetadata,
  isGenerateDraftRequest,
  isGenerateDraftResult,
  type DraftBankSelection,
  type DraftNoteMetadata,
} from '../src/shared/draft-contracts'
import {
  buildBankPlanPrompt,
  buildFallbackBankPlan,
  DRAFT_BANK_PLAN_MAX_TOKENS,
  parseBankPlanText,
} from '../src/shared/draft-bank-plan'
import type { QuestionBankSummary } from '../src/shared/question-bank-contracts'

const baseRequest = {
  requestId: 'bank-1',
  kind: 'lecture',
  lessonId: 'lesson-1',
  sources: [{ fileId: 'file-1', text: '讲义基线' }],
  maxChars: 30_000,
  maxTokens: 16_000,
} as const

function metadataWithBankSelection(selection: DraftBankSelection): DraftNoteMetadata {
  return {
    kind: 'lecture',
    promptVersion: 'v11-03-v1',
    provider: 'openai-compatible',
    model: 'deepseek-chat',
    sources: [{ fileId: 'file-1', charsSent: 6 }],
    inputChars: 6,
    maxChars: 30_000,
    maxTokens: 16_000,
    bankSelection: selection,
  }
}

const selection: DraftBankSelection = {
  plan: { tags: ['一次函数'], difficultyMin: 30, difficultyMax: 70, targetCount: 5 },
  retrievedCount: 15,
  sentCount: 5,
  candidateIds: ['q-1', 'q-2', 'q-3', 'q-4', 'q-5'],
}

describe('V17-A DraftBankPlan contract guard', () => {
  it('accepts a valid bank plan and full range targetCount 1..20', () => {
    expect(isDraftBankPlan({ targetCount: 1 })).toBe(true)
    expect(isDraftBankPlan({ targetCount: 20 })).toBe(true)
    expect(isDraftBankPlan({
      text: '一次函数', tags: ['一次函数', '待定系数法'], grade: '八年级',
      type: 'essay', difficultyMin: 0, difficultyMax: 100, targetCount: 5,
    })).toBe(true)
  })

  it('rejects invalid plans: targetCount bounds, unknown keys, bad fields', () => {
    expect(isDraftBankPlan({ targetCount: 0 })).toBe(false)
    expect(isDraftBankPlan({ targetCount: 21 })).toBe(false)
    expect(isDraftBankPlan({ targetCount: 5.5 })).toBe(false)
    expect(isDraftBankPlan({ targetCount: '5' })).toBe(false)
    expect(isDraftBankPlan({ targetCount: 5, examType: '月考' })).toBe(false)
    expect(isDraftBankPlan({ targetCount: 5, difficultyMin: 101 })).toBe(false)
    expect(isDraftBankPlan({ targetCount: 5, difficultyMin: -1 })).toBe(false)
    expect(isDraftBankPlan({ targetCount: 5, difficultyMin: 1.5 })).toBe(false)
    expect(isDraftBankPlan({ targetCount: 5, tags: [] })).toBe(true)
    expect(isDraftBankPlan({ targetCount: 5, tags: [''] })).toBe(false)
    expect(isDraftBankPlan({ targetCount: 5, tags: ['重复', '重复'] })).toBe(false)
    expect(isDraftBankPlan({ targetCount: 5, grade: '' })).toBe(false)
    expect(isDraftBankPlan(null)).toBe(false)
    expect(isDraftBankPlan('plan')).toBe(false)
  })

  it('validates bankSelection audit fields', () => {
    expect(isDraftBankSelection(selection)).toBe(true)
    expect(isDraftBankSelection({ ...selection, sentCount: 16 })).toBe(false)
    expect(isDraftBankSelection({ ...selection, candidateIds: ['q-1'] })).toBe(false)
    expect(isDraftBankSelection({ ...selection, retrievedCount: -1 })).toBe(false)
    expect(isDraftBankSelection({ ...selection, plan: { targetCount: 0 } })).toBe(false)
  })

  it('extends isGenerateDraftRequest with bankPlan/dualVersion without breaking the default request', () => {
    expect(isGenerateDraftRequest(baseRequest)).toBe(true)
    expect(isGenerateDraftRequest({ ...baseRequest, bankPlan: selection.plan, dualVersion: true })).toBe(true)
    expect(isGenerateDraftRequest({ ...baseRequest, dualVersion: false })).toBe(false)
    expect(isGenerateDraftRequest({ ...baseRequest, bankPlan: { targetCount: 99 } })).toBe(false)
  })

  it('extends note metadata and result guards with bankSelection/studentNoteId', () => {
    const metadata = metadataWithBankSelection(selection)
    expect(isDraftNoteMetadata(metadata)).toBe(true)
    expect(isDraftNoteMetadata({ ...metadata, bankSelection: { ...selection, sentCount: 'x' } })).toBe(false)
    expect(isDraftNoteMetadata({ ...metadata, bankSelection: { ...selection, plan: { targetCount: 21 } } })).toBe(false)

    const baseResult = {
      noteId: 'note-1',
      kind: 'lecture',
      bodyMd: '# 讲义',
      metadata: metadataWithBankSelection(selection),
    }
    expect(isGenerateDraftResult(baseResult)).toBe(true)
    expect(isGenerateDraftResult({ ...baseResult, studentNoteId: 'note-2' })).toBe(true)
    expect(isGenerateDraftResult({ ...baseResult, studentNoteId: '' })).toBe(false)
    expect(isGenerateDraftResult({ ...baseResult, unknownKey: true })).toBe(false)
  })
})

const summary: QuestionBankSummary = {
  installed: true,
  packageId: 'pkg-1',
  sourceName: '校本题库',
  exportedAt: '2026-09-01T00:00:00.000Z',
  questionCount: 1200,
  paperCount: 30,
  assetCount: 400,
  grades: [{ value: '八年级', label: '八年级', count: 500 }],
  years: [{ value: '2026', label: '2026', count: 300 }],
  months: [],
  types: [{ value: 'essay', label: '解答题', count: 400 }],
  examTypes: [],
  tags: [
    { value: '一次函数', label: '一次函数', count: 120 },
    { value: '全等三角形', label: '全等三角形', count: 80 },
  ],
  difficultyMin: 20,
  difficultyMax: 95,
}

describe('V17-A bank plan prompt and parsing', () => {
  it('builds the phase-one prompt with lesson info and facet summary', () => {
    const prompt = buildBankPlanPrompt({
      lessonTitle: '一次函数图象',
      periodTitle: '第一阶段',
      requirement: '挑两道含图的中档题',
      summary,
      targetCount: 5,
    })
    expect(prompt).toContain('一次函数图象')
    expect(prompt).toContain('第一阶段')
    expect(prompt).toContain('挑两道含图的中档题')
    expect(prompt).toContain('一次函数(120)')
    expect(prompt).toContain('20–95')
    expect(prompt).toContain('"targetCount": 5')
    expect(prompt).toContain('只输出一个 JSON 对象')
  })

  it('parses a plain JSON plan, a fenced plan, and a plan wrapped in prose', () => {
    const fallback = buildFallbackBankPlan({ lessonTitle: '一次函数', summary, targetCount: 5 })
    expect(fallback).toEqual({
      text: '一次函数',
      difficultyMin: 20,
      difficultyMax: 95,
      targetCount: 5,
    })

    const plain = parseBankPlanText(
      '{"text":"一次函数","tags":["一次函数"],"difficultyMin":40,"difficultyMax":80,"targetCount":5}',
      fallback,
    )
    expect(plain).toEqual({
      text: '一次函数',
      tags: ['一次函数'],
      difficultyMin: 40,
      difficultyMax: 80,
      targetCount: 5,
    })

    const fenced = parseBankPlanText('```json\n{"tags":["全等三角形"],"targetCount":3}\n```', fallback)
    expect(fenced).toEqual({ tags: ['全等三角形'], targetCount: 3 })

    const wrapped = parseBankPlanText(
      '好的，检索计划如下：{"grade":"八年级","type":"essay"} 请使用以上条件。',
      fallback,
    )
    expect(wrapped).toEqual({ grade: '八年级', type: 'essay', targetCount: 5 })
  })

  it('falls back on unparseable text and drops invalid fields from a valid JSON envelope', () => {
    const fallback = buildFallbackBankPlan({ lessonTitle: '一次函数', requirement: '中档题', summary, targetCount: 5 })
    expect(parseBankPlanText('抱歉，我无法输出 JSON。', fallback)).toEqual(fallback)
    expect(parseBankPlanText('{"targetCount":99}', fallback)).toEqual({ targetCount: 5 })

    // 区间颠倒：两个难度界都丢弃；非法 tag 元素过滤后去重
    const inverted = parseBankPlanText(
      '{"difficultyMin":80,"difficultyMax":40,"tags":["一次函数","一次函数",""],"targetCount":5}',
      fallback,
    )
    expect(inverted).toEqual({ tags: ['一次函数'], targetCount: 5 })
  })

  it('keeps the phase-one request a short non-streaming budget', () => {
    expect(DRAFT_BANK_PLAN_MAX_TOKENS).toBeLessThan(5_000)
    expect(DRAFT_BANK_PLAN_MAX_TARGET_COUNT).toBe(20)
  })
})
