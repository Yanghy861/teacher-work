import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import type { AiGateway } from '../src/main/ai/ai-gateway'
import { AiSettingsService } from '../src/main/ai/ai-settings-service'
import type { SecureStoragePort } from '../src/main/ai/secure-storage'
import { CoreDataService } from '../src/main/data/core-data-service'
import {
  DraftService,
  DRAFT_BANK_CANDIDATE_MULTIPLIER,
  type QuestionBankDraftPort,
} from '../src/main/draft/draft-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { openSearchDatabase } from '../src/main/search/search-database'
import { SearchService } from '../src/main/search/search-service'
import { SkillService } from '../src/main/skills/skill-service'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'
import type {
  QuestionBankDetail,
  QuestionBankSearchRequest,
  QuestionBankSearchResult,
  QuestionBankSummary,
} from '../src/shared/question-bank-contracts'

const roots: string[] = []
const workspaces: WorkspaceHandle[] = []
const searchDatabases: Array<{ close(): void }> = []

afterEach(() => {
  for (const database of searchDatabases.splice(0)) database.close()
  for (const workspace of workspaces.splice(0)) workspace.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function questionDetail(id: string, overrides: Partial<QuestionBankDetail> = {}): QuestionBankDetail {
  return {
    id,
    questionNo: null,
    type: 'essay',
    typeLabel: '解答题',
    subject: '数学',
    grade: '八年级',
    section: null,
    content: `题目 ${id}：已知一次函数 $y=kx+b$…`,
    options: [],
    answer: `答案 ${id}`,
    analysis: `解析 ${id}：由题意得…`,
    difficulty: 50,
    score: null,
    contentHash: null,
    paperTitle: '期末试卷',
    year: 2026,
    month: null,
    region: null,
    examType: null,
    semester: null,
    tags: ['一次函数'],
    assets: [],
    ...overrides,
  }
}

interface FakeBankCall {
  readonly method: 'search' | 'getQuestion' | 'getSummary'
  readonly request?: unknown
}

function fakeBank(questions: QuestionBankDetail[], calls: FakeBankCall[]): QuestionBankDraftPort {
  const summary: QuestionBankSummary = {
    installed: true,
    packageId: 'pkg-v17a',
    sourceName: '测试题库',
    exportedAt: '2026-09-01T00:00:00.000Z',
    questionCount: questions.length,
    paperCount: 1,
    assetCount: 0,
    grades: [{ value: '八年级', label: '八年级', count: questions.length }],
    years: [{ value: '2026', label: '2026', count: questions.length }],
    months: [],
    types: [{ value: 'essay', label: '解答题', count: questions.length }],
    examTypes: [],
    tags: [...new Set(questions.flatMap((question) => question.tags))].map((tag) => ({
      value: tag,
      label: tag,
      count: questions.filter((question) => question.tags.includes(tag)).length,
    })),
    difficultyMin: Math.min(...questions.map((question) => question.difficulty ?? 0)),
    difficultyMax: Math.max(...questions.map((question) => question.difficulty ?? 0)),
  }
  return {
    getSummary: () => {
      calls.push({ method: 'getSummary' })
      return summary
    },
    search: (request: QuestionBankSearchRequest) => {
      calls.push({ method: 'search', request })
      const filtered = questions.filter((question) => {
        if (request.tags !== undefined) {
          const wanted = new Set(request.tags)
          if (!question.tags.some((tag) => wanted.has(tag))) return false
        }
        if (request.difficultyMin !== undefined && (question.difficulty ?? 0) < request.difficultyMin) return false
        if (request.difficultyMax !== undefined && (question.difficulty ?? 0) > request.difficultyMax) return false
        return true
      })
      const offset = request.offset ?? 0
      const limit = Math.min(request.limit ?? 50, 100)
      const items = filtered.slice(offset, offset + limit)
      const result: QuestionBankSearchResult = {
        total: filtered.length,
        limit,
        offset,
        items: items.map((question) => ({
          id: question.id,
          questionNo: question.questionNo,
          type: question.type,
          typeLabel: question.typeLabel,
          subject: question.subject,
          grade: question.grade,
          contentPreview: question.content.slice(0, 100),
          difficulty: question.difficulty,
          score: question.score,
          paperTitle: question.paperTitle,
          year: question.year,
          month: question.month,
          examType: question.examType,
          tags: question.tags,
          hasAssets: question.assets.length > 0,
        })),
      }
      return result
    },
    getQuestion: (questionId: string) => {
      calls.push({ method: 'getQuestion', request: questionId })
      const found = questions.find((question) => question.id === questionId)
      if (found === undefined) throw new Error(`fake bank: missing question ${questionId}`)
      return found
    },
  }
}

interface FakeGatewayCall {
  readonly requestId: string
  readonly prompt: string
  readonly maxTokens?: number
}

interface Fixture {
  readonly core: CoreDataService
  readonly service: (respond: (prompt: string) => string) => DraftService
  readonly banklessService: (respond: (prompt: string) => string) => DraftService
  readonly lessonId: string
  readonly studentId: string
  readonly sourceFileId: string
  readonly bankCalls: FakeBankCall[]
  readonly gatewayCalls: FakeGatewayCall[]
}

function fixture(questions: QuestionBankDetail[]): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-v17a-draft-'))
  roots.push(root)
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  workspaces.push(workspace)
  const searchDb = openSearchDatabase(workspace.paths)
  searchDatabases.push(searchDb)
  const core = new CoreDataService(workspace.database.raw)
  const files = new ManagedFileService(workspace.database.raw, workspace.paths)
  const search = new SearchService(workspace.database.raw, searchDb.raw, workspace.paths)
  const secure: SecureStoragePort = {
    isAvailable: () => false,
    encrypt: (value) => Buffer.from(value),
    decrypt: (value) => value.toString(),
    read: () => undefined,
    write: () => undefined,
    clear: () => undefined,
  }
  const settings = new AiSettingsService(workspace.database.raw, { secureStorage: secure })
  settings.updateSettings({ provider: 'openai-compatible', model: 'fake-model', endpoint: 'https://fake.local/v1', apiKey: 'SESSION_KEY' })
  const skills = new SkillService(workspace.database.raw)
  const course = core.nodes.createCourse('V17-A 课程', 'one_to_one')
  const period = core.nodes.createPeriod(course.id, '第一阶段')
  const lesson = core.nodes.createLesson(period.id, '一次函数图象')
  const student = core.createStudentForCourse(course.id, '学生甲')
  const source = join(root, 'source.txt')
  writeFileSync(source, '基线资料正文', 'utf8')
  const file = files.importToLesson(source, lesson.id)
  search.indexFile({ id: file.id, originalName: file.originalName, chunks: [{ text: '基线资料正文' }], status: 'indexed', contentHash: 'hash' })

  const bankCalls: FakeBankCall[] = []
  const gatewayCalls: FakeGatewayCall[] = []
  const bank = questions.length > 0 ? fakeBank(questions, bankCalls) : undefined
  const makeGateway = (respond: (prompt: string) => string): AiGateway => ({
    requestText: async (requestId: string, prompt: string, maxTokens?: number) => {
      gatewayCalls.push({ requestId, prompt, maxTokens })
      return { text: respond(prompt), model: 'fake-model' }
    },
    requestStreamText: async (requestId: string, prompt: string, maxTokens?: number) => {
      gatewayCalls.push({ requestId, prompt, maxTokens })
      return { text: respond(prompt), model: 'fake-model' }
    },
  } as unknown as AiGateway)

  const build = (respond: (prompt: string) => string, withBank: boolean): DraftService => new DraftService(
    core, search, makeGateway(respond), settings, skills, withBank ? bank : undefined,
  )
  return {
    core,
    service: (respond) => build(respond, true),
    banklessService: (respond) => build(respond, false),
    lessonId: lesson.id,
    studentId: student.id,
    sourceFileId: file.id,
    bankCalls,
    gatewayCalls,
  }
}

describe('V17-A draft-service bank context injection', () => {
  it('injects the candidate block into the prompt with header, answers, and metadata lines', async () => {
    const questions = [
      questionDetail('q-1'),
      questionDetail('q-2', {
        questionNo: '5',
        difficulty: 65,
        tags: ['一次函数', '待定系数法'],
        assets: [{ id: 1, role: 'stem', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AAAA' }],
      }),
    ]
    const f = fixture(questions)
    const service = f.service(() => '# 讲义\n含题库候选')

    const result = await service.generate({
      requestId: 'bank-inject',
      kind: 'lecture',
      lessonId: f.lessonId,
      studentId: f.studentId,
      sources: [{ fileId: f.sourceFileId, text: '基线资料正文' }],
      bankPlan: { tags: ['一次函数'], targetCount: 2 },
      maxChars: 30_000,
      maxTokens: 16_000,
    })

    const mainPrompt = f.gatewayCalls[0].prompt
    expect(mainPrompt).toContain('# 题库候选题')
    expect(mainPrompt).toContain('<bank-candidates>')
    expect(mainPrompt).toContain('不得杜撰或改编题目')
    expect(mainPrompt).toContain('题库候选题（共 2 道')
    expect(mainPrompt).toContain('题目 q-1：已知一次函数')
    expect(mainPrompt).toContain('答案：答案 q-1')
    expect(mainPrompt).toContain('解析：解析 q-2')
    expect(mainPrompt).toContain('tag：一次函数、待定系数法 / 难度：65 / 年级：八年级 / 题型：解答题 / 含图')
    expect(mainPrompt).toContain('（本题含图片')
    expect(mainPrompt).toContain('[选自题库：tag/难度]')
    expect(mainPrompt).toContain('答案与解析')

    expect(result.metadata.bankSelection).toEqual({
      plan: { tags: ['一次函数'], targetCount: 2 },
      retrievedCount: 2,
      sentCount: 2,
      candidateIds: ['q-1', 'q-2'],
    })
    expect(result.metadata.inputChars).toBeGreaterThan(6)
    expect(result.studentNoteId).toBeUndefined()
    expect(f.bankCalls[0]).toMatchObject({ method: 'search', request: { limit: 6, offset: 0, tags: ['一次函数'] } })
    expect(f.gatewayCalls).toHaveLength(1)
  })

  it('truncates candidates down to the budget and records sentCount in metadata', async () => {
    const questions = ['q-1', 'q-2', 'q-3', 'q-4', 'q-5', 'q-6', 'q-7', 'q-8', 'q-9']
      .map((id) => questionDetail(id, {
        content: `${'题干很长'.repeat(60)} ${id}`,
        answer: '答案'.repeat(80),
        analysis: '解析'.repeat(100),
      }))
    const f = fixture(questions)
    const service = f.service(() => '# 讲义')

    const result = await service.generate({
      requestId: 'bank-truncate',
      kind: 'example',
      lessonId: f.lessonId,
      sources: [{ fileId: f.sourceFileId, text: '基线资料正文' }],
      bankPlan: { targetCount: 3 },
      maxChars: 2_500,
      maxTokens: 16_000,
    })

    const selection = result.metadata.bankSelection
    expect(selection).toBeDefined()
    if (selection === undefined) throw new Error('selection missing')
    expect(selection.retrievedCount).toBe(9)
    expect(selection.sentCount).toBeLessThan(9)
    expect(selection.sentCount).toBeGreaterThanOrEqual(1)
    expect(selection.candidateIds).toHaveLength(selection.sentCount)
    expect(f.gatewayCalls[0].prompt).toContain(`题库候选题（共 ${selection.sentCount} 道`)
    expect(f.bankCalls[0]).toMatchObject({ method: 'search', request: { limit: 9 } })
    expect(DRAFT_BANK_CANDIDATE_MULTIPLIER).toBe(3)
  })

  it('throws a clear error when the bank has no matching questions or is not installed', async () => {
    const mismatch = fixture([questionDetail('q-only', { tags: ['全等三角形'] })])
    await expect(mismatch.service(() => '# 讲义').generate({
      requestId: 'bank-empty',
      kind: 'lecture',
      lessonId: mismatch.lessonId,
      sources: [{ fileId: mismatch.sourceFileId, text: '基线资料正文' }],
      bankPlan: { tags: ['一次函数'], targetCount: 5 },
      maxChars: 30_000,
      maxTokens: 16_000,
    })).rejects.toThrow('题库中没有符合检索计划的题目')

    const bankless = fixture([])
    await expect(bankless.banklessService(() => '# 讲义').generate({
      requestId: 'bank-missing',
      kind: 'lecture',
      lessonId: bankless.lessonId,
      sources: [{ fileId: bankless.sourceFileId, text: '基线资料正文' }],
      bankPlan: { targetCount: 5 },
      maxChars: 30_000,
      maxTokens: 16_000,
    })).rejects.toThrow('参考题库未安装')
  })

  it('without bankPlan the generation flow is unchanged (single request, no bank calls)', async () => {
    const f = fixture([questionDetail('q-1')])
    const result = await f.service(() => '# 普通讲义').generate({
      requestId: 'no-bank',
      kind: 'lecture',
      lessonId: f.lessonId,
      studentId: f.studentId,
      sources: [{ fileId: f.sourceFileId, text: '基线资料正文' }],
      maxChars: 30_000,
      maxTokens: 16_000,
    })
    expect(f.gatewayCalls).toHaveLength(1)
    expect(f.bankCalls).toEqual([])
    expect(result.metadata.bankSelection).toBeUndefined()
    expect(result.studentNoteId).toBeUndefined()
    expect(result.metadata.sources).toEqual([{ fileId: f.sourceFileId, charsSent: 6 }])
  })
})

describe('V17-A draft-service resolveBankPlan (phase one)', () => {
  it('requests a short non-streaming plan and parses the JSON response', async () => {
    const f = fixture([questionDetail('q-1')])
    const service = f.service(
      () => '{"text":"一次函数","tags":["一次函数"],"difficultyMin":30,"difficultyMax":70,"targetCount":5}',
    )
    const plan = await service.resolveBankPlan({
      requestId: 'plan-1',
      lessonId: f.lessonId,
      requirement: '挑中档题',
      targetCount: 5,
    })
    expect(plan).toEqual({ text: '一次函数', tags: ['一次函数'], difficultyMin: 30, difficultyMax: 70, targetCount: 5 })
    expect(f.gatewayCalls[0].maxTokens).toBeLessThan(5_000)
    expect(f.gatewayCalls[0].prompt).toContain('一次函数图象')
    expect(f.gatewayCalls[0].prompt).toContain('挑中档题')
    expect(f.bankCalls[0]).toMatchObject({ method: 'getSummary' })
  })

  it('falls back to text search with the bank difficulty range when the response is unparseable', async () => {
    const f = fixture([questionDetail('q-1', { difficulty: 40 })])
    const service = f.service(() => '抱歉，无法输出 JSON')
    const plan = await service.resolveBankPlan({
      requestId: 'plan-2',
      lessonId: f.lessonId,
      requirement: '中档题',
      targetCount: 5,
    })
    expect(plan).toEqual({ text: '中档题', difficultyMin: 40, difficultyMax: 40, targetCount: 5 })
  })
})

describe('V17-A draft-service dualVersion orchestration (D31)', () => {
  it('runs a second stripped request after the teacher note and links studentNoteId', async () => {
    const f = fixture([questionDetail('q-1'), questionDetail('q-2')])
    const service = f.service((prompt) => (prompt.includes('# 学生版生成任务') ? '# 学生版讲义' : '# 教师版讲义'))

    const result = await service.generate({
      requestId: 'dual-1',
      kind: 'lecture',
      lessonId: f.lessonId,
      studentId: f.studentId,
      sources: [{ fileId: f.sourceFileId, text: '基线资料正文' }],
      bankPlan: { targetCount: 2 },
      dualVersion: true,
      maxChars: 30_000,
      maxTokens: 16_000,
    })

    expect(result.bodyMd).toBe('# 教师版讲义')
    expect(result.studentNoteId).toBeDefined()
    expect(f.gatewayCalls).toHaveLength(2)
    expect(f.gatewayCalls[0].requestId).toBe('dual-1')
    expect(f.gatewayCalls[1].requestId).toBe('dual-1-student')

    const studentPrompt = f.gatewayCalls[1].prompt
    expect(studentPrompt).toContain('去掉答案解析区块')
    expect(studentPrompt).toContain('# 学生版生成任务')
    expect(studentPrompt).toContain(result.bodyMd)
    expect(f.gatewayCalls[1].maxTokens).toBe(8_000)

    const overview = f.core.getOverview()
    const teacherNote = overview.notes.find((note) => note.id === result.noteId)
    const studentNote = overview.notes.find((note) => note.id === result.studentNoteId)
    expect(teacherNote).toMatchObject({ noteKind: 'lecture', draftStatus: 'draft', lessonId: f.lessonId })
    expect(studentNote).toMatchObject({ noteKind: 'lecture', draftStatus: 'draft', lessonId: f.lessonId, bodyMd: '# 学生版讲义' })
    expect(studentNote?.aiMetadata?.bankSelection).toBeDefined()
  })

  it('dualVersion defaults to absent: single request, no student note', async () => {
    const f = fixture([questionDetail('q-1')])
    const result = await f.service(() => '# 单版讲义').generate({
      requestId: 'single-1',
      kind: 'lecture',
      lessonId: f.lessonId,
      sources: [{ fileId: f.sourceFileId, text: '基线资料正文' }],
      bankPlan: { targetCount: 1 },
      maxChars: 30_000,
      maxTokens: 16_000,
    })
    expect(f.gatewayCalls).toHaveLength(1)
    expect(result.studentNoteId).toBeUndefined()
    expect(f.core.getOverview().notes.filter((note) => note.draftStatus === 'draft')).toHaveLength(1)
  })
})
