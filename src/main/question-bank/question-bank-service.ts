import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { extname, isAbsolute, join } from 'node:path'

import type { ManagedFileRecord } from '../../shared/file-contracts'
import type {
  QuestionBankAsset,
  QuestionBankDetail,
  QuestionBankFacetValue,
  QuestionBankOption,
  QuestionBankSearchItem,
  QuestionBankSearchRequest,
  QuestionBankSearchResult,
  QuestionBankSummary,
} from '../../shared/question-bank-contracts'
import type { SqliteDatabase } from '../db/migrations'
import type { ManagedFileService } from '../files/managed-file-service'
import type { WorkspacePaths } from '../workspace/workspace-paths'

const FORMAT_VERSION = '1'
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const MAX_PACKAGE_BYTES = 2 * 1024 * 1024 * 1024
const MAX_DETAIL_ASSET_BYTES = 12 * 1024 * 1024
const DISPLAYABLE_IMAGE_MIME_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

const REQUIRED_TABLES = [
  'meta',
  'source_papers',
  'questions',
  'question_tags',
  'assets',
  'question_assets',
  'question_search',
] as const

export type QuestionBankErrorCode =
  | 'QUESTION_BANK_NOT_INSTALLED'
  | 'QUESTION_BANK_SOURCE_INVALID'
  | 'QUESTION_BANK_PACKAGE_INVALID'
  | 'QUESTION_BANK_IMPORT_BUSY'
  | 'QUESTION_BANK_IMPORT_FAILED'
  | 'QUESTION_BANK_QUESTION_NOT_FOUND'
  | 'QUESTION_BANK_ASSETS_TOO_LARGE'
  | 'QUESTION_BANK_COPY_FAILED'

export class QuestionBankError extends Error {
  readonly code: QuestionBankErrorCode

  constructor(code: QuestionBankErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'QuestionBankError'
    this.code = code
  }
}
interface QuestionRow {
  readonly source_uid: string
  readonly question_no: string | null
  readonly type: string
  readonly type_label: string
  readonly subject: string
  readonly grade: string | null
  readonly section: string | null
  readonly content: string
  readonly options_json: string | null
  readonly answer: string
  readonly analysis: string
  readonly difficulty: number | null
  readonly score: number | null
  readonly content_hash: string | null
  readonly paper_title: string | null
  readonly year: number | null
  readonly month: number | null
  readonly region: string | null
  readonly exam_type: string | null
  readonly semester: string | null
  readonly has_assets: number
}

interface AssetRow {
  readonly id: number
  readonly role: string
  readonly mime_type: string
  readonly size_bytes: number
  readonly content: Buffer
}

export class QuestionBankService {
  private readonly bankDirectory: string
  private readonly currentPath: string
  private connection: SqliteDatabase | null = null
  private importing = false

  constructor(
    private readonly paths: WorkspacePaths,
    private readonly managedFiles: ManagedFileService,
  ) {
    this.bankDirectory = join(paths.dataDirectory, 'question-bank')
    this.currentPath = join(this.bankDirectory, 'current.tqbank')
  }

  close(): void {
    if (this.connection?.open) this.connection.close()
    this.connection = null
  }

  getSummary(): QuestionBankSummary {
    if (!existsSync(this.currentPath)) return emptySummary()
    const database = this.getConnection()
    return this.readSummary(database)
  }

  async importSnapshot(sourcePath: string): Promise<QuestionBankSummary> {
    if (this.importing) {
      throw new QuestionBankError('QUESTION_BANK_IMPORT_BUSY', '题库正在导入，请稍候。')
    }
    this.importing = true
    const stagingPath = join(this.bankDirectory, `.import-${randomUUID()}.tqbank`)
    const previousPath = join(this.bankDirectory, `.previous-${randomUUID()}.tqbank`)
    let movedPrevious = false
    try {
      await validateSnapshotSource(sourcePath)
      await mkdir(this.bankDirectory, { recursive: true })
      await copyFile(sourcePath, stagingPath)
      const stagingSummary = this.validatePackage(stagingPath)

      this.close()
      if (existsSync(this.currentPath)) {
        await rename(this.currentPath, previousPath)
        movedPrevious = true
      }
      try {
        await rename(stagingPath, this.currentPath)
      } catch (error) {
        if (movedPrevious && existsSync(previousPath)) {
          await rename(previousPath, this.currentPath)
          movedPrevious = false
        }
        throw error
      }
      if (movedPrevious) {
        await rm(previousPath, { force: true }).catch(() => undefined)
        movedPrevious = false
      }
      return this.readSummary(this.getConnection(), stagingSummary)
    } catch (error) {
      await rm(stagingPath, { force: true }).catch(() => undefined)
      if (movedPrevious && !existsSync(this.currentPath) && existsSync(previousPath)) {
        await rename(previousPath, this.currentPath).catch(() => undefined)
      }
      if (error instanceof QuestionBankError) throw error
      throw new QuestionBankError(
        'QUESTION_BANK_IMPORT_FAILED',
        '题库导入失败，原有题库未被替换。',
        { cause: error },
      )
    } finally {
      this.importing = false
    }
  }

  search(request: QuestionBankSearchRequest): QuestionBankSearchResult {
    const database = this.requireConnection()
    const limit = Math.min(Math.max(request.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
    const offset = Math.max(request.offset ?? 0, 0)
    const parameters: Record<string, string | number> = { limit, offset }
    const joins: string[] = []
    const conditions: string[] = []
    const text = request.text?.trim() ?? ''

    if (text !== '') {
      if (searchTermsSupportTrigram(text)) {
        joins.push('JOIN question_search ON question_search.question_uid = q.source_uid')
        conditions.push('question_search MATCH @match')
        parameters.match = toFtsMatch(text)
      } else {
        conditions.push(`(
          q.content LIKE @like ESCAPE '\\' OR q.answer LIKE @like ESCAPE '\\' OR
          q.analysis LIKE @like ESCAPE '\\' OR p.title LIKE @like ESCAPE '\\' OR
          EXISTS (
            SELECT 1 FROM question_tags AS text_tag
             WHERE text_tag.question_uid = q.source_uid
               AND text_tag.tag LIKE @like ESCAPE '\\'
          )
        )`)
        parameters.like = `%${escapeLike(text)}%`
      }
    }
    addTextFilter(conditions, parameters, 'q.grade', 'grade', request.grade)
    addTextFilter(conditions, parameters, 'q.type', 'type', request.type)
    if (request.year !== undefined) {
      conditions.push('p.year = @year')
      parameters.year = request.year
    }
    if (request.month !== undefined) {
      conditions.push('p.month = @month')
      parameters.month = request.month
    }
    if (request.difficultyMin !== undefined) {
      conditions.push('q.difficulty >= @difficultyMin')
      parameters.difficultyMin = request.difficultyMin
    }
    if (request.difficultyMax !== undefined) {
      conditions.push('q.difficulty <= @difficultyMax')
      parameters.difficultyMax = request.difficultyMax
    }
    if (request.tag?.trim()) {
      conditions.push(`EXISTS (
        SELECT 1 FROM question_tags AS selected_tag
         WHERE selected_tag.question_uid = q.source_uid AND selected_tag.tag = @tag
      )`)
      parameters.tag = request.tag.trim()
    }

    const from = `
      FROM questions AS q
      LEFT JOIN source_papers AS p ON p.source_uid = q.paper_uid
      ${joins.join('\n')}
    `
    const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`
    const total = (database.prepare(`SELECT COUNT(*) AS count ${from} ${where}`).get(parameters) as { count: number }).count
    const rows = database.prepare(`
      SELECT q.source_uid, q.question_no, q.type, q.type_label, q.subject, q.grade,
             q.content, q.difficulty, q.score, p.title AS paper_title, p.year, p.month,
             p.exam_type,
             EXISTS(SELECT 1 FROM question_assets qa WHERE qa.question_uid = q.source_uid) AS has_assets
        ${from}
        ${where}
       ORDER BY p.year DESC, p.title, CAST(q.question_no AS INTEGER), q.question_no, q.source_uid
       LIMIT @limit OFFSET @offset
    `).all(parameters) as QuestionRow[]
    const tagsByQuestion = this.readTags(database, rows.map((row) => row.source_uid))
    const items = rows.map((row): QuestionBankSearchItem => ({
      id: row.source_uid,
      questionNo: row.question_no,
      type: row.type,
      typeLabel: row.type_label,
      subject: row.subject,
      grade: row.grade,
      contentPreview: previewText(row.content),
      difficulty: row.difficulty,
      score: row.score,
      paperTitle: row.paper_title,
      year: row.year,
      month: row.month,
      examType: row.exam_type,
      tags: tagsByQuestion.get(row.source_uid) ?? [],
      hasAssets: row.has_assets === 1,
    }))
    return { total, limit, offset, items }
  }

  getQuestion(questionId: string): QuestionBankDetail {
    const database = this.requireConnection()
    const row = database.prepare(`
      SELECT q.source_uid, q.question_no, q.type, q.type_label, q.subject, q.grade,
             q.section, q.content, q.options_json, q.answer, q.analysis, q.difficulty,
             q.score, q.content_hash, p.title AS paper_title, p.year, p.month,
             p.region, p.exam_type, p.semester,
             EXISTS(SELECT 1 FROM question_assets qa WHERE qa.question_uid = q.source_uid) AS has_assets
        FROM questions AS q
        LEFT JOIN source_papers AS p ON p.source_uid = q.paper_uid
       WHERE q.source_uid = ?
    `).get(questionId) as QuestionRow | undefined
    if (row === undefined) {
      throw new QuestionBankError('QUESTION_BANK_QUESTION_NOT_FOUND', '题目不存在或题库已经更换。')
    }
    const tags = this.readTags(database, [questionId]).get(questionId) ?? []
    const assets = this.readAssets(database, questionId)
    return {
      id: row.source_uid,
      questionNo: row.question_no,
      type: row.type,
      typeLabel: row.type_label,
      subject: row.subject,
      grade: row.grade,
      section: row.section,
      content: stripLegacyAssetLinks(row.content),
      options: parseOptions(row.options_json),
      answer: stripLegacyAssetLinks(row.answer),
      analysis: stripLegacyAssetLinks(row.analysis),
      difficulty: row.difficulty,
      score: row.score,
      contentHash: row.content_hash,
      paperTitle: row.paper_title,
      year: row.year,
      month: row.month,
      region: row.region,
      examType: row.exam_type,
      semester: row.semester,
      tags,
      assets,
    }
  }

  copyToLibrary(questionId: string): ManagedFileRecord {
    return this.copyQuestion(questionId, null)
  }

  copyToLesson(questionId: string, lessonId: string): ManagedFileRecord {
    return this.copyQuestion(questionId, lessonId)
  }

  private getConnection(): SqliteDatabase {
    if (this.connection?.open) return this.connection
    const database = new Database(this.currentPath, {
      readonly: true,
      fileMustExist: true,
      timeout: 5_000,
    }) as SqliteDatabase
    try {
      database.pragma('query_only = ON')
      this.validateOpenDatabase(database)
      this.connection = database
      return database
    } catch (error) {
      database.close()
      throw error
    }
  }

  private requireConnection(): SqliteDatabase {
    if (!existsSync(this.currentPath)) {
      throw new QuestionBankError('QUESTION_BANK_NOT_INSTALLED', '请先导入题库快照。')
    }
    return this.getConnection()
  }

  private validatePackage(path: string): QuestionBankSummary {
    let database: SqliteDatabase | null = null
    try {
      database = new Database(path, {
        readonly: true,
        fileMustExist: true,
        timeout: 5_000,
      }) as SqliteDatabase
      database.pragma('query_only = ON')
      this.validateOpenDatabase(database)
      return this.readSummary(database)
    } catch (error) {
      if (error instanceof QuestionBankError) throw error
      throw new QuestionBankError(
        'QUESTION_BANK_PACKAGE_INVALID',
        '所选文件不是有效的教师题库快照。',
        { cause: error },
      )
    } finally {
      if (database?.open) database.close()
    }
  }

  private validateOpenDatabase(database: SqliteDatabase): void {
    const tables = new Set(
      (database.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").all() as { name: string }[])
        .map((row) => row.name),
    )
    if (!REQUIRED_TABLES.every((table) => tables.has(table))) {
      throw new QuestionBankError('QUESTION_BANK_PACKAGE_INVALID', '题库快照缺少必需的数据表。')
    }
    const metadata = readMetadata(database)
    if (metadata.format_version !== FORMAT_VERSION) {
      throw new QuestionBankError('QUESTION_BANK_PACKAGE_INVALID', '题库快照版本不受支持。')
    }
    if (!metadata.package_id?.trim() || !metadata.exported_at?.trim() || !metadata.source_name?.trim()) {
      throw new QuestionBankError('QUESTION_BANK_PACKAGE_INVALID', '题库快照元数据不完整。')
    }
    const questionCount = count(database, 'questions')
    if (questionCount < 1 || metadata.question_count !== String(questionCount)) {
      throw new QuestionBankError('QUESTION_BANK_PACKAGE_INVALID', '题库题目数量校验失败。')
    }
    if (
      metadata.paper_count !== String(count(database, 'source_papers')) ||
      metadata.asset_count !== String(count(database, 'assets'))
    ) {
      throw new QuestionBankError('QUESTION_BANK_PACKAGE_INVALID', '题库来源或图片数量校验失败。')
    }
    const searchCount = (database.prepare('SELECT COUNT(*) AS count FROM question_search').get() as { count: number }).count
    if (searchCount !== questionCount) {
      throw new QuestionBankError('QUESTION_BANK_PACKAGE_INVALID', '题库搜索索引数量校验失败。')
    }
    const invalidAsset = database.prepare(
      'SELECT 1 FROM assets WHERE size_bytes < 0 OR LENGTH(content) <> size_bytes LIMIT 1',
    ).get()
    if (invalidAsset !== undefined) {
      throw new QuestionBankError('QUESTION_BANK_PACKAGE_INVALID', '题库图片数据校验失败。')
    }
    const invalidIdentity = database.prepare(`
      SELECT 1 FROM questions
       WHERE source_uid IS NULL OR TRIM(source_uid) = ''
       LIMIT 1
    `).get()
    if (invalidIdentity !== undefined) {
      throw new QuestionBankError('QUESTION_BANK_PACKAGE_INVALID', '题库包含无稳定身份的题目。')
    }
  }

  private readSummary(database: SqliteDatabase, cached?: QuestionBankSummary): QuestionBankSummary {
    if (cached !== undefined) return cached
    const metadata = readMetadata(database)
    const range = database.prepare(
      'SELECT MIN(difficulty) AS minimum, MAX(difficulty) AS maximum FROM questions WHERE difficulty IS NOT NULL',
    ).get() as { minimum: number | null; maximum: number | null }
    return {
      installed: true,
      packageId: metadata.package_id ?? null,
      sourceName: metadata.source_name ?? null,
      exportedAt: metadata.exported_at ?? null,
      questionCount: count(database, 'questions'),
      paperCount: count(database, 'source_papers'),
      assetCount: count(database, 'assets'),
      grades: readFacets(database, `
        SELECT grade AS value, grade AS label, COUNT(*) AS count
          FROM questions WHERE grade IS NOT NULL AND TRIM(grade) <> ''
         GROUP BY grade ORDER BY count DESC, grade
      `),
      years: readFacets(database, `
        SELECT CAST(p.year AS TEXT) AS value, CAST(p.year AS TEXT) AS label, COUNT(*) AS count
          FROM questions q JOIN source_papers p ON p.source_uid = q.paper_uid
         WHERE p.year IS NOT NULL GROUP BY p.year ORDER BY p.year DESC
      `),
      months: readFacets(database, `
        SELECT CAST(p.month AS TEXT) AS value, CAST(p.month AS TEXT) || '月' AS label, COUNT(*) AS count
          FROM questions q JOIN source_papers p ON p.source_uid = q.paper_uid
         WHERE p.month IS NOT NULL GROUP BY p.month ORDER BY p.month
      `),
      types: readFacets(database, `
        SELECT type AS value, type_label AS label, COUNT(*) AS count
          FROM questions GROUP BY type, type_label ORDER BY count DESC, type
      `),
      tags: readFacets(database, `
        SELECT tag AS value, tag AS label, COUNT(*) AS count
          FROM question_tags GROUP BY tag ORDER BY count DESC, tag
      `),
      difficultyMin: range.minimum,
      difficultyMax: range.maximum,
    }
  }

  private readTags(database: SqliteDatabase, questionIds: readonly string[]): Map<string, string[]> {
    if (questionIds.length === 0) return new Map()
    const placeholders = questionIds.map(() => '?').join(', ')
    const rows = database.prepare(`
      SELECT question_uid, tag FROM question_tags
       WHERE question_uid IN (${placeholders})
       ORDER BY tag
    `).all(...questionIds) as { question_uid: string; tag: string }[]
    const result = new Map<string, string[]>()
    for (const row of rows) {
      const tags = result.get(row.question_uid) ?? []
      tags.push(row.tag)
      result.set(row.question_uid, tags)
    }
    return result
  }

  private readAssets(database: SqliteDatabase, questionId: string): QuestionBankAsset[] {
    const rows = database.prepare(`
      SELECT a.id, qa.role, a.mime_type, a.size_bytes, a.content
        FROM question_assets qa JOIN assets a ON a.id = qa.asset_id
       WHERE qa.question_uid = ?
       ORDER BY qa.order_num, a.id
    `).all(questionId) as AssetRow[]
    const total = rows.reduce((sum, row) => sum + row.size_bytes, 0)
    if (total > MAX_DETAIL_ASSET_BYTES) {
      throw new QuestionBankError('QUESTION_BANK_ASSETS_TOO_LARGE', '这道题的图片总量过大，无法安全显示。')
    }
    return rows.flatMap((row) => DISPLAYABLE_IMAGE_MIME_TYPES.has(row.mime_type.toLowerCase()) ? [{
      id: row.id,
      role: row.role,
      mimeType: row.mime_type.toLowerCase(),
      dataUrl: `data:${row.mime_type.toLowerCase()};base64,${row.content.toString('base64')}`,
    }] : [])
  }

  private copyQuestion(questionId: string, lessonId: string | null): ManagedFileRecord {
    const question = this.getQuestion(questionId)
    const temporaryDirectory = join(this.paths.cacheDirectory, `question-${randomUUID()}`)
    mkdirSync(temporaryDirectory, { recursive: false })
    const name = buildQuestionFileName(question)
    const temporaryPath = join(temporaryDirectory, name)
    try {
      writeFileSync(temporaryPath, buildQuestionMarkdown(question), { encoding: 'utf8', flag: 'wx' })
      return lessonId === null
        ? this.managedFiles.importFile(temporaryPath)
        : this.managedFiles.importToLesson(temporaryPath, lessonId)
    } catch (error) {
      if (error instanceof QuestionBankError) throw error
      throw new QuestionBankError(
        'QUESTION_BANK_COPY_FAILED',
        lessonId === null ? '题目未能导入素材库。' : '题目未能加入所选课次。',
        { cause: error },
      )
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true })
    }
  }
}

async function validateSnapshotSource(sourcePath: string): Promise<void> {
  if (typeof sourcePath !== 'string' || !isAbsolute(sourcePath) || extname(sourcePath).toLowerCase() !== '.tqbank') {
    throw new QuestionBankError('QUESTION_BANK_SOURCE_INVALID', '请选择扩展名为 .tqbank 的本地题库快照。')
  }
  try {
    const file = await stat(sourcePath)
    if (!file.isFile() || file.size <= 0 || file.size > MAX_PACKAGE_BYTES) throw new Error('invalid size')
    if (!lstatSync(sourcePath).isFile()) throw new Error('not regular file')
  } catch (error) {
    throw new QuestionBankError('QUESTION_BANK_SOURCE_INVALID', '所选题库文件不存在、不可读或过大。', { cause: error })
  }
}

function emptySummary(): QuestionBankSummary {
  return {
    installed: false,
    packageId: null,
    sourceName: null,
    exportedAt: null,
    questionCount: 0,
    paperCount: 0,
    assetCount: 0,
    grades: [],
    years: [],
    months: [],
    types: [],
    tags: [],
    difficultyMin: null,
    difficultyMax: null,
  }
}

function readMetadata(database: SqliteDatabase): Record<string, string> {
  return Object.fromEntries(
    (database.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[])
      .map((row) => [row.key, row.value]),
  )
}

function count(database: SqliteDatabase, table: 'questions' | 'source_papers' | 'assets'): number {
  return (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count
}

function readFacets(database: SqliteDatabase, sql: string): QuestionBankFacetValue[] {
  return (database.prepare(sql).all() as { value: string; label: string; count: number }[])
    .map((row) => ({ value: row.value, label: row.label, count: row.count }))
}

function addTextFilter(
  conditions: string[],
  parameters: Record<string, string | number>,
  column: string,
  parameter: string,
  value: string | undefined,
): void {
  if (value?.trim()) {
    conditions.push(`${column} = @${parameter}`)
    parameters[parameter] = value.trim()
  }
}

function searchTermsSupportTrigram(text: string): boolean {
  return text.split(/\s+/u).filter(Boolean).every((term) => [...term].length >= 3)
}

function toFtsMatch(text: string): string {
  return text.split(/\s+/u).filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(' AND ')
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

function previewText(content: string): string {
  const text = stripLegacyAssetLinks(content)
    .replace(/\s+/gu, ' ')
    .trim()
  return text.length <= 280 ? text : `${text.slice(0, 279)}…`
}

function stripLegacyAssetLinks(content: string): string {
  return content
    .replace(/!\[[^\]]*\]\(\/assets\/[^)]+\)/giu, '')
    .replace(/<img\b[^>]*\bsrc=["']\/assets\/[^"']+["'][^>]*>/giu, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function parseOptions(value: string | null): QuestionBankOption[] {
  if (value === null) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.flatMap((item, index) => typeof item === 'string'
        ? [{ key: String.fromCharCode(65 + index), text: item }]
        : [])
    }
    if (parsed !== null && typeof parsed === 'object') {
      return Object.entries(parsed).flatMap(([key, text]) =>
        typeof text === 'string' && key !== 'raw' ? [{ key, text }] : [],
      )
    }
  } catch {
    return []
  }
  return []
}

function buildQuestionFileName(question: QuestionBankDetail): string {
  const parts = [
    question.grade,
    question.paperTitle,
    question.questionNo === null ? '题目' : `第${question.questionNo}题`,
  ].filter((part): part is string => part !== null && part.trim() !== '')
  const safe = parts.join('_')
    .split('')
    .map((character) => character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '_' : character)
    .join('')
    .replace(/[. ]+$/gu, '')
    .slice(0, 120)
  return `${safe || '题库题目'}.md`
}

function buildQuestionMarkdown(question: QuestionBankDetail): string {
  const lines = [
    `# ${question.questionNo === null ? '题库题目' : `第 ${question.questionNo} 题`}`,
    '',
    question.content,
  ]
  if (question.options.length > 0 && !hasInlineOptionMarkers(question.content, question.options)) {
    lines.push('', ...question.options.map((option) => `${option.key}. ${option.text}`))
  }
  const stemAssets = question.assets.filter((asset) => !isSolutionAssetRole(asset.role))
  const solutionAssets = question.assets.filter((asset) => isSolutionAssetRole(asset.role))
  if (stemAssets.length > 0) {
    lines.push('', '## 题目图片', '')
    for (const [index, asset] of stemAssets.entries()) {
      lines.push(`<img src="${asset.dataUrl}" alt="题目图片 ${index + 1}" />`, '')
    }
  }
  lines.push('', '## 答案', '', question.answer || '（原题库未提供）')
  lines.push('', '## 解析', '', question.analysis || '（原题库未提供）')
  for (const [index, asset] of solutionAssets.entries()) {
    lines.push('', `<img src="${asset.dataUrl}" alt="解析图片 ${index + 1}" />`)
  }
  lines.push('', '## 来源信息', '')
  lines.push(`- 试卷：${question.paperTitle ?? '未注明'}`)
  lines.push(`- 年级：${question.grade ?? '未注明'}`)
  lines.push(`- 年份：${question.year ?? '未注明'}`)
  lines.push(`- 题型：${question.typeLabel}`)
  lines.push(`- 难度：${question.difficulty ?? '未标注'}`)
  lines.push(`- 标签：${question.tags.length > 0 ? question.tags.join('、') : '无'}`)
  lines.push(`- 题库 ID：${question.id}`)
  return `${lines.join('\n').trim()}\n`
}

function isSolutionAssetRole(role: string): boolean {
  return /solution|answer|analysis|解析|答案/iu.test(role)
}

function hasInlineOptionMarkers(
  content: string,
  options: readonly QuestionBankOption[],
): boolean {
  return options.slice(0, 2).every((option) => {
    const key = option.key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    return new RegExp(`(?:^|\\s)${key}[.．、)]\\s*`, 'iu').test(content)
  })
}
