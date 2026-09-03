import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import type { AiGateway } from '../src/main/ai/ai-gateway'
import { AiSettingsService } from '../src/main/ai/ai-settings-service'
import type { SecureStoragePort } from '../src/main/ai/secure-storage'
import { CoreDataService } from '../src/main/data/core-data-service'
import { DraftService, type QuestionBankDraftPort } from '../src/main/draft/draft-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { openSearchDatabase } from '../src/main/search/search-database'
import { SearchService } from '../src/main/search/search-service'
import { SkillService } from '../src/main/skills/skill-service'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'
import type { DraftBankPlan } from '../src/shared/draft-contracts'
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

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

function questionDetail(id: string, overrides: Partial<QuestionBankDetail> = {}): QuestionBankDetail {
  return {
    id,
    questionNo: null,
    type: 'essay',
    typeLabel: '解答题',
    subject: '数学',
    grade: '八年级',
    section: null,
    content: `题目 ${id}：已知一次函数 $y=kx+b$，求其图象与坐标轴交点。`,
    options: [],
    answer: `答案 ${id}`,
    analysis: `解析 ${id}：令 x=0 与 y=0 分别求解。`,
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

function fakeBank(questions: QuestionBankDetail[], calls: string[]): QuestionBankDraftPort {
  const summary: QuestionBankSummary = {
    installed: true,
    packageId: 'pkg-v17d',
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
    difficultyMin: 0,
    difficultyMax: 100,
  }
  return {
    getSummary: () => {
      calls.push('getSummary')
      return summary
    },
    search: (request: QuestionBankSearchRequest) => {
      calls.push(`search:${request.tags?.join('+') ?? 'all'}`)
      const items = questions.map((question) => ({
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
      }))
      const result: QuestionBankSearchResult = {
        total: items.length,
        limit: Math.min(request.limit ?? 50, 100),
        offset: request.offset ?? 0,
        items: items.slice(request.offset ?? 0, (request.offset ?? 0) + Math.min(request.limit ?? 50, 100)),
      }
      return result
    },
    getQuestion: (questionId: string) => {
      calls.push(`getQuestion:${questionId}`)
      const found = questions.find((question) => question.id === questionId)
      if (found === undefined) throw new Error(`fake bank: missing question ${questionId}`)
      return found
    },
  }
}

interface Fixture {
  readonly core: CoreDataService
  readonly files: ManagedFileService
  readonly service: (respond: (prompt: string) => string) => DraftService
  readonly lessonId: string
  readonly sourceFileId: string
  readonly bankCalls: string[]
  readonly gatewayCalls: Array<{ readonly requestId: string; readonly prompt: string; readonly maxTokens?: number }>
}

function fixture(questions: QuestionBankDetail[]): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-v17d-'))
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
  const course = core.nodes.createCourse('V17-D 课程', 'one_to_one')
  const period = core.nodes.createPeriod(course.id, '第一阶段')
  const lesson = core.nodes.createLesson(period.id, '一次函数图象')
  const sourcePath = join(root, 'source.txt')
  writeFileSync(sourcePath, '基线资料正文', 'utf8')
  const file = files.importToLesson(sourcePath, lesson.id)
  search.indexFile({ id: file.id, originalName: file.originalName, chunks: [{ text: '基线资料正文' }], status: 'indexed', contentHash: 'hash' })

  const bankCalls: string[] = []
  const gatewayCalls: Array<{ readonly requestId: string; readonly prompt: string; readonly maxTokens?: number }> = []
  const bank = fakeBank(questions, bankCalls)
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

  return {
    core,
    files,
    service: (respond) => new DraftService(core, search, makeGateway(respond), settings, skills, bank),
    lessonId: lesson.id,
    sourceFileId: file.id,
    bankCalls,
    gatewayCalls,
  }
}

const PLAN: DraftBankPlan = { tags: ['一次函数'], difficultyMin: 20, difficultyMax: 80, targetCount: 2 }

describe('V17-D 编排：bankQuestionIds 剔除集 + variant 留痕 + 双版', () => {
  it('honors the confirmed candidate set: excluded questions never reach the AI prompt', async () => {
    const { service, lessonId, sourceFileId, gatewayCalls, bankCalls } = fixture([
      questionDetail('q-1'),
      questionDetail('q-2'),
      questionDetail('q-3'),
    ])
    const result = await service(() => '# 讲义\n内容').generate({
      requestId: 'v17d-req',
      kind: 'lecture',
      lessonId,
      sources: [{ fileId: sourceFileId }],
      maxChars: 30_000,
      maxTokens: 4_000,
      bankPlan: PLAN,
      bankQuestionIds: ['q-1', 'q-3'],
    })

    // 剔除集直接取代检索：零 search 调用，getQuestion 恰好取确认的两道
    expect(bankCalls.filter((call) => call.startsWith('search'))).toHaveLength(0)
    expect(bankCalls.filter((call) => call === 'getQuestion:q-2')).toHaveLength(0)
    const prompt = gatewayCalls[0]!.prompt
    expect(prompt).toContain('q-1')
    expect(prompt).toContain('q-3')
    expect(prompt).not.toContain('q-2')
    // 选题规则随候选块注入
    expect(prompt).toContain('不得杜撰或改编题目')
    // bankSelection 留痕：检索数 = 确认集大小
    expect(result.metadata.bankSelection).toBeDefined()
    expect(result.metadata.bankSelection!.sentCount).toBe(2)
    expect(result.metadata.bankSelection!.candidateIds).toEqual(['q-1', 'q-3'])
  })

  it('rejects an empty confirmed set instead of silently dropping the bank', async () => {
    const { service, lessonId, sourceFileId } = fixture([questionDetail('q-1')])
    await expect(service(() => '# 讲义').generate({
      requestId: 'v17d-empty',
      kind: 'lecture',
      lessonId,
      sources: [{ fileId: sourceFileId }],
      maxChars: 30_000,
      maxTokens: 4_000,
      bankPlan: PLAN,
      bankQuestionIds: [],
    })).rejects.toThrow('候选题已被全部剔除')
  })

  it('orchestrates dual version: teacher note + student note linked by studentNoteId', async () => {
    const { core, service, lessonId, sourceFileId, gatewayCalls } = fixture([
      questionDetail('q-1'),
      questionDetail('q-2'),
    ])
    const result = await service((prompt) =>
      prompt.includes('学生版生成任务') ? '# 学生版\n纯题面' : '# 讲义\n教师版含答案',
    ).generate({
      requestId: 'v17d-dual',
      kind: 'lecture',
      lessonId,
      sources: [{ fileId: sourceFileId }],
      maxChars: 30_000,
      maxTokens: 4_000,
      bankPlan: PLAN,
      dualVersion: true,
    })

    // 两次生成请求：主（教师版）+ 学生版（requestId 后缀 -student、maxTokens 减半）
    expect(gatewayCalls.map((call) => call.requestId)).toEqual(['v17d-dual', 'v17d-dual-student'])
    expect(gatewayCalls[1]!.prompt).toContain('去掉答案解析区块')
    expect(gatewayCalls[1]!.maxTokens).toBe(2_000)
    expect(result.studentNoteId).toBeDefined()

    const teacher = core.getOverview().notes.find((note) => note.id === result.noteId)
    const student = core.getOverview().notes.find((note) => note.id === result.studentNoteId)
    expect(teacher?.aiMetadata?.variant).toBe('teacher')
    expect(student?.aiMetadata?.variant).toBe('student')
    expect(student?.bodyMd).toContain('纯题面')
  })

  it('keeps single-version behavior identical when dualVersion is absent (variant stays undefined)', async () => {
    const { core, service, lessonId, sourceFileId, gatewayCalls } = fixture([])
    const result = await service(() => '# 讲义').generate({
      requestId: 'v17d-single',
      kind: 'lecture',
      lessonId,
      sources: [{ fileId: sourceFileId }],
      maxChars: 30_000,
      maxTokens: 4_000,
    })
    expect(result.studentNoteId).toBeUndefined()
    expect(gatewayCalls).toHaveLength(1)
    const note = core.getOverview().notes.find((record) => record.id === result.noteId)
    expect(note?.aiMetadata?.variant).toBeUndefined()
  })
})

describe('V17-D 发布命名：学生版独立版本链', () => {
  it('publishes student notes as 讲义 · 第 N 版 · 学生版.md alongside teacher chains', async () => {
    const { files, service, lessonId, sourceFileId } = fixture([
      questionDetail('q-1'),
      questionDetail('q-2'),
    ])
    const result = await service((prompt) =>
      prompt.includes('学生版生成任务') ? '# 学生版' : '# 教师版',
    ).generate({
      requestId: 'v17d-publish',
      kind: 'lecture',
      lessonId,
      sources: [{ fileId: sourceFileId }],
      maxChars: 30_000,
      maxTokens: 4_000,
      bankPlan: PLAN,
      dualVersion: true,
    })

    const teacherFile = files.publishLessonDraftVersion(result.noteId)
    const studentFile = files.publishLessonDraftVersion(result.studentNoteId!)

    expect(teacherFile.file.originalName).toBe('一次函数图象 · 第 1 版.md')
    expect(studentFile.file.originalName).toBe('一次函数图象 · 第 1 版 · 学生版.md')
    expect(studentFile.version).toBe(1)

    // 各自独立版本链：教师版与学生版互不干扰对方计数
    const teacherSecond = files.publishLessonDraftVersion(result.noteId)
    const studentSecond = files.publishLessonDraftVersion(result.studentNoteId!)
    expect(teacherSecond.file.originalName).toBe('一次函数图象 · 第 2 版.md')
    expect(studentSecond.file.originalName).toBe('一次函数图象 · 第 2 版 · 学生版.md')
  })
})

describe('V17-D Renderer 钉测：开关 / 过目卡 / 徽标 / 预算列名', () => {
  it('renders the bank toggle with grayed-out hint when uninstalled and target/dual options', () => {
    const panel = source('../src/renderer/draft-panel.tsx')
    expect(panel).toContain('参考题库（AI 自动选题）')
    expect(panel).toContain('先在题库页导入 .tqbank')
    expect(panel).toContain('目标题数')
    expect(panel).toContain('同时生成学生版')
    expect(panel).toContain('bankSummary?.installed ?? false')
  })

  it('renders the review-card bank section: plan, candidates, exclusion, adjust-and-reselect', () => {
    const panel = source('../src/renderer/draft-panel.tsx')
    expect(panel).toContain('AI 检索计划：')
    expect(panel).toContain('调整后重新选题')
    expect(panel).toContain('toggleBankCandidate')
    expect(panel).toContain('候选已全部剔除，请保留至少一道或关闭参考题库')
  })

  it('wires confirm generation with bankPlan + bankQuestionIds + dualVersion', () => {
    const panel = source('../src/renderer/draft-panel.tsx')
    expect(panel).toContain('bankPlan: bankPlan')
    expect(panel).toContain('bankQuestionIds: keptBankCandidates.map((item) => item.id)')
    expect(panel).toContain('{ dualVersion: true }')
    expect(panel).toContain('学生版已一并生成，见修改记录。')
  })

  it('extends the D25 budget dialog with the bank candidate line and shows inline usage', () => {
    const panel = source('../src/renderer/draft-panel.tsx')
    expect(panel).toContain('题库候选 ${keptBankCandidates.length} 道（按预算部分纳入 ${bankFitCount} 道）')
    expect(panel).toContain('题库候选 ${keptBankCandidates.length} 题 · ${bankCandidateChars.toLocaleString')
    expect(panel).toContain('fitBankCandidateCount(keptBankRendereds, bankPlan.targetCount, bankRemaining)')
  })

  it('shows teacher/student variant badges in results list, content header and inbox', () => {
    const panel = source('../src/renderer/draft-panel.tsx')
    expect(panel).toContain('draft-variant-badge is-teacher')
    expect(panel).toContain('draft-variant-badge is-student')
    expect(panel).toContain('（教师版）')
    expect(panel).toContain('（学生版）')
    expect(panel).toContain("is-${entry.note.aiMetadata.variant}")
  })

  it('reuses ai.requestText + question-bank channels only (zero new IPC for the preview step)', () => {
    const panel = source('../src/renderer/draft-panel.tsx')
    expect(panel).toContain('questionBank.searchQuestions')
    expect(panel).toContain('questionBank.getQuestion')
    expect(panel).toContain('ai.requestText')
    // 计划渲染/检索映射与 Main 共用 shared 纯函数（所见即所发）
    const preview = source('../src/shared/draft-bank-preview.ts')
    expect(preview).toContain('export function bankPlanToSearchRequest')
    expect(preview).toContain('export function fitBankCandidateCount')
    expect(preview).toContain('export const DRAFT_BANK_CANDIDATE_MULTIPLIER = 3')
    // Main 注入与 Renderer 过目共用同一渲染函数
    const service = source('../src/main/draft/draft-service.ts')
    expect(service).toContain('renderQuestionForContext')
    expect(service).toContain("from '../../shared/draft-bank-preview'")
  })
})
