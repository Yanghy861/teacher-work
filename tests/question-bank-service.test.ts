import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { QuestionBankService } from '../src/main/question-bank/question-bank-service'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'
import {
  isQuestionBankLessonCopyRequest,
  isQuestionBankSearchRequest,
  isQuestionBankSummary,
} from '../src/shared/question-bank-contracts'

interface Fixture {
  readonly root: string
  readonly workspace: WorkspaceHandle
  readonly managedFiles: ManagedFileService
  readonly service: QuestionBankService
  readonly snapshotPath: string
  readonly lessonId: string
}
const fixtures: Fixture[] = []

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.service.close()
    fixture.workspace.close()
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

function createFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-question-bank-'))
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  const managedFiles = new ManagedFileService(workspace.database.raw, workspace.paths)
  const core = new CoreDataService(workspace.database.raw)
  const course = core.nodes.createCourse('张同学数学', 'one_to_one')
  const period = core.nodes.createPeriod(course.id, '九年级上')
  const lesson = core.nodes.createLesson(period.id, '二次函数')
  const snapshotPath = join(root, 'fixture.tqbank')
  createQuestionBankSnapshot(snapshotPath)
  const fixture = {
    root,
    workspace,
    managedFiles,
    service: new QuestionBankService(workspace.paths, managedFiles),
    snapshotPath,
    lessonId: lesson.id,
  }
  fixtures.push(fixture)
  return fixture
}

describe('question bank snapshot service', () => {
  it('imports a snapshot without changing the source and exposes reusable filters', async () => {
    const fixture = createFixture()
    const before = {
      hash: sha256(fixture.snapshotPath),
      mtimeMs: statSync(fixture.snapshotPath).mtimeMs,
      size: statSync(fixture.snapshotPath).size,
    }

    const summary = await fixture.service.importSnapshot(fixture.snapshotPath)

    expect(summary).toMatchObject({
      installed: true,
      packageId: 'fixture-package',
      questionCount: 2,
      paperCount: 2,
      assetCount: 1,
      difficultyMin: 15,
      difficultyMax: 35,
    })
    expect(summary.grades.map((facet) => facet.value)).toEqual(['七年级', '九年级'])
    expect(summary.tags.map((facet) => facet.value)).toEqual(['二次函数', '有理数'])
    expect(isQuestionBankSummary(summary)).toBe(true)
    expect({
      hash: sha256(fixture.snapshotPath),
      mtimeMs: statSync(fixture.snapshotPath).mtimeMs,
      size: statSync(fixture.snapshotPath).size,
    }).toEqual(before)
    expect(existsSync(join(fixture.workspace.paths.dataDirectory, 'question-bank', 'current.tqbank'))).toBe(true)

    expect(fixture.service.search({ text: '二次函数' })).toMatchObject({
      total: 1,
      items: [{ id: 'question-1', grade: '九年级', difficulty: 35 }],
    })
    expect(fixture.service.search({ text: '函数', grade: '九年级', year: 2024, tag: '二次函数' }).total).toBe(1)
    expect(fixture.service.search({ type: 'fill', difficultyMax: 20 }).items.map((item) => item.id)).toEqual(['question-2'])
    expect(fixture.service.search({ month: 6 }).items.map((item) => item.id)).toEqual(['question-2'])
  })

  it('returns normal question detail with options and embedded images', async () => {
    const fixture = createFixture()
    await fixture.service.importSnapshot(fixture.snapshotPath)

    const detail = fixture.service.getQuestion('question-1')

    expect(detail).toMatchObject({
      id: 'question-1',
      typeLabel: '选择题',
      paperTitle: '2024 年九年级期末卷',
      tags: ['二次函数'],
      options: [{ key: 'A', text: '(0, 1)' }, { key: 'B', text: '(1, 0)' }],
      assets: [{ id: 1, role: 'stem', mimeType: 'image/png' }],
    })
    expect(detail.content).not.toContain('/assets/')
    expect(detail.assets[0]?.dataUrl).toMatch(/^data:image\/png;base64,/)
  })

  it('copies a self-contained Markdown question to the library or a lesson', async () => {
    const fixture = createFixture()
    await fixture.service.importSnapshot(fixture.snapshotPath)

    const libraryCopy = fixture.service.copyToLibrary('question-1')
    const lessonCopy = fixture.service.copyToLesson('question-1', fixture.lessonId)
    const overview = fixture.managedFiles.getOverview()

    expect(overview.files).toHaveLength(2)
    expect(overview.links).toEqual([
      expect.objectContaining({ fileId: lessonCopy.id, targetType: 'lesson', targetId: fixture.lessonId }),
    ])
    const libraryMarkdown = readFileSync(fixture.managedFiles.getObjectContentPath(libraryCopy.id), 'utf8')
    expect(libraryMarkdown).toContain('二次函数')
    expect(libraryMarkdown).toContain('data:image/png;base64,')
    expect(libraryMarkdown).toContain('题库 ID：question-1')
  })

  it('keeps the previous valid snapshot when replacement validation fails', async () => {
    const fixture = createFixture()
    await fixture.service.importSnapshot(fixture.snapshotPath)
    const invalidPath = join(fixture.root, 'invalid.tqbank')
    writeFileSync(invalidPath, 'not sqlite', 'utf8')

    await expect(fixture.service.importSnapshot(invalidPath)).rejects.toMatchObject({
      code: 'QUESTION_BANK_PACKAGE_INVALID',
    })
    expect(fixture.service.getSummary()).toMatchObject({ packageId: 'fixture-package', questionCount: 2 })
    expect(fixture.service.search({ text: '有理数' }).items.map((item) => item.id)).toEqual(['question-2'])
  })

  it('strictly validates search and copy requests', () => {
    expect(isQuestionBankSearchRequest({ text: '函数', limit: 50, offset: 0 })).toBe(true)
    expect(isQuestionBankSearchRequest({ text: '函数', path: 'E:\\Wss_Tiku' })).toBe(false)
    expect(isQuestionBankSearchRequest({ difficultyMin: -1 })).toBe(false)
    expect(isQuestionBankLessonCopyRequest({ questionId: 'question-1', lessonId: 'lesson-1' })).toBe(true)
    expect(isQuestionBankLessonCopyRequest({ questionId: 'question-1', lessonId: 'lesson-1', sourcePath: 'x' })).toBe(false)
  })
})

function createQuestionBankSnapshot(path: string): void {
  const database = new Database(path)
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE TABLE source_papers (
      source_uid TEXT PRIMARY KEY, source_paper_id INTEGER NOT NULL, title TEXT NOT NULL,
      subject TEXT NOT NULL, grade TEXT, year INTEGER, month INTEGER, region TEXT,
      exam_type TEXT, paper_kind TEXT, semester TEXT
    ) STRICT;
    CREATE TABLE questions (
      source_uid TEXT PRIMARY KEY, source_question_id INTEGER NOT NULL UNIQUE,
      paper_uid TEXT, question_no TEXT, type TEXT NOT NULL, type_label TEXT NOT NULL,
      subject TEXT NOT NULL, grade TEXT, section TEXT, content TEXT NOT NULL,
      options_json TEXT, answer TEXT NOT NULL, analysis TEXT NOT NULL, difficulty INTEGER,
      score REAL, content_hash TEXT, created_at TEXT, updated_at TEXT
    ) STRICT;
    CREATE TABLE question_tags (
      question_uid TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (question_uid, tag)
    ) STRICT;
    CREATE TABLE assets (
      id INTEGER PRIMARY KEY, sha256 TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL,
      original_name TEXT, size_bytes INTEGER NOT NULL, content BLOB NOT NULL
    ) STRICT;
    CREATE TABLE question_assets (
      question_uid TEXT NOT NULL, asset_id INTEGER NOT NULL, role TEXT NOT NULL,
      order_num INTEGER NOT NULL, PRIMARY KEY (question_uid, asset_id, role, order_num)
    ) STRICT;
    CREATE VIRTUAL TABLE question_search USING fts5(question_uid UNINDEXED, searchable, tokenize='trigram');
  `)
  const insertMeta = database.prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
  database.transaction(() => {
    for (const [key, value] of Object.entries({
      format_version: '1',
      package_id: 'fixture-package',
      exported_at: '2026-08-24T00:00:00.000Z',
      source_name: '测试题库',
      question_count: '2',
      paper_count: '2',
      asset_count: '1',
    })) insertMeta.run(key, value)
    database.prepare('INSERT INTO source_papers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('paper-1', 1, '2024 年九年级期末卷', '数学', '九年级', 2024, 12, '上海', '期末', 'complete_paper', '上学期')
    database.prepare('INSERT INTO source_papers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('paper-2', 2, '2023 年七年级月考卷', '数学', '七年级', 2023, 6, '上海', '月考', 'complete_paper', '下学期')
    const insertQuestion = database.prepare('INSERT INTO questions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    insertQuestion.run(
      'question-1', 1, 'paper-1', '1', 'single', '选择题', '数学', '九年级', '选择题',
      '二次函数 y=x²+1 的顶点坐标是？\n![](/assets/legacy.png)',
      JSON.stringify({ A: '(0, 1)', B: '(1, 0)' }), 'A', '由顶点式可得。', 35, 4, 'hash-1',
      '2026-08-24', '2026-08-24',
    )
    insertQuestion.run(
      'question-2', 2, 'paper-2', '2', 'fill', '填空题', '数学', '七年级', '填空题',
      '计算有理数 1+2。', null, '3', '直接计算。', 15, 3, 'hash-2',
      '2026-08-24', '2026-08-24',
    )
    database.prepare('INSERT INTO question_tags VALUES (?, ?)').run('question-1', '二次函数')
    database.prepare('INSERT INTO question_tags VALUES (?, ?)').run('question-2', '有理数')
    const image = Buffer.from('89504e470d0a1a0a', 'hex')
    database.prepare('INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?)')
      .run(1, createHash('sha256').update(image).digest('hex'), 'image/png', 'figure.png', image.length, image)
    database.prepare('INSERT INTO question_assets VALUES (?, ?, ?, ?)').run('question-1', 1, 'stem', 0)
    database.prepare('INSERT INTO question_search VALUES (?, ?)').run(
      'question-1',
      '二次函数 y=x²+1 顶点坐标 由顶点式可得 2024 年九年级期末卷 二次函数',
    )
    database.prepare('INSERT INTO question_search VALUES (?, ?)').run(
      'question-2',
      '计算有理数 1+2 直接计算 2023 年七年级月考卷 有理数',
    )
  })()
  database.close()
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}
