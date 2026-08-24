import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'

const FORMAT_VERSION = 1

function main() {
  const args = parseArgs(process.argv.slice(2))
  const sourceRoot = requireAbsoluteDirectory(args['source-root'], '--source-root')
  const outputPath = requireOutputPath(args.output)
  assertOutputOutsideSource(sourceRoot, outputPath)
  if (existsSync(outputPath)) {
    throw new Error(`输出文件已经存在，请更换文件名：${outputPath}`)
  }

  const sourceDatabasePath = join(sourceRoot, 'data', 'question_bank.db')
  const assetRoot = join(sourceRoot, 'storage', 'assets')
  if (!existsSync(sourceDatabasePath)) {
    throw new Error(`找不到旧题库数据库：${sourceDatabasePath}`)
  }
  if (!existsSync(assetRoot)) {
    throw new Error(`找不到旧题库图片目录：${assetRoot}`)
  }

  mkdirSync(dirname(outputPath), { recursive: true })
  const stagingPath = `${outputPath}.staging-${randomUUID()}`
  const source = new Database(sourceDatabasePath, { readonly: true, fileMustExist: true })
  let target
  try {
    source.pragma('query_only = ON')
    target = new Database(stagingPath)
    target.pragma('journal_mode = DELETE')
    target.pragma('synchronous = FULL')
    target.pragma('foreign_keys = ON')
    createSchema(target)

    const exportedAt = new Date().toISOString()
    const packageId = randomUUID()
    const sourceName = args['source-name']?.trim() || 'Wss_Tiku'
    const tagsByQuestion = readTags(source)
    const paperUidById = exportPapers(source, target)
    const questionUidById = exportQuestions(
      source,
      target,
      tagsByQuestion,
      paperUidById,
    )
    const assetCount = exportAssetsAndLinks(
      source,
      target,
      sourceRoot,
      assetRoot,
      questionUidById,
    )

    const questionCount = countRows(target, 'questions')
    const paperCount = countRows(target, 'source_papers')
    writeMetadata(target, {
      format_version: String(FORMAT_VERSION),
      package_id: packageId,
      exported_at: exportedAt,
      source_name: sourceName,
      question_count: String(questionCount),
      paper_count: String(paperCount),
      asset_count: String(assetCount),
      export_filter: 'questions.status=ready AND questions.review_status=reviewed',
    })
    target.pragma('optimize')
    const integrity = target.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok') throw new Error(`导出快照完整性校验失败：${String(integrity)}`)
    target.close()
    target = undefined
    source.close()
    renameSync(stagingPath, outputPath)
    const size = statSync(outputPath).size
    process.stdout.write(`${JSON.stringify({
      outputPath,
      packageId,
      exportedAt,
      questionCount,
      paperCount,
      assetCount,
      sizeBytes: size,
    })}\n`)
  } catch (error) {
    if (target?.open) target.close()
    if (source.open) source.close()
    rmSync(stagingPath, { force: true })
    throw error
  }
}

function createSchema(database) {
  database.exec(`
    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;

    CREATE TABLE source_papers (
      source_uid TEXT PRIMARY KEY,
      source_paper_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      grade TEXT,
      year INTEGER,
      month INTEGER,
      region TEXT,
      exam_type TEXT,
      paper_kind TEXT,
      semester TEXT
    ) STRICT;

    CREATE TABLE questions (
      source_uid TEXT PRIMARY KEY,
      source_question_id INTEGER NOT NULL UNIQUE,
      paper_uid TEXT REFERENCES source_papers(source_uid),
      question_no TEXT,
      type TEXT NOT NULL,
      type_label TEXT NOT NULL,
      subject TEXT NOT NULL,
      grade TEXT,
      section TEXT,
      content TEXT NOT NULL,
      options_json TEXT,
      answer TEXT NOT NULL,
      analysis TEXT NOT NULL,
      difficulty INTEGER,
      score REAL,
      content_hash TEXT,
      created_at TEXT,
      updated_at TEXT
    ) STRICT;

    CREATE TABLE question_tags (
      question_uid TEXT NOT NULL REFERENCES questions(source_uid) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY (question_uid, tag)
    ) STRICT;

    CREATE TABLE assets (
      id INTEGER PRIMARY KEY,
      sha256 TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      original_name TEXT,
      size_bytes INTEGER NOT NULL,
      content BLOB NOT NULL
    ) STRICT;

    CREATE TABLE question_assets (
      question_uid TEXT NOT NULL REFERENCES questions(source_uid) ON DELETE CASCADE,
      asset_id INTEGER NOT NULL REFERENCES assets(id),
      role TEXT NOT NULL,
      order_num INTEGER NOT NULL,
      PRIMARY KEY (question_uid, asset_id, role, order_num)
    ) STRICT;

    CREATE INDEX idx_questions_grade ON questions(grade);
    CREATE INDEX idx_questions_type ON questions(type);
    CREATE INDEX idx_questions_difficulty ON questions(difficulty);
    CREATE INDEX idx_questions_paper_uid ON questions(paper_uid);
    CREATE INDEX idx_papers_year_month ON source_papers(year, month);
    CREATE INDEX idx_tags_tag_question ON question_tags(tag, question_uid);
    CREATE INDEX idx_question_assets_question ON question_assets(question_uid, order_num);

    CREATE VIRTUAL TABLE question_search USING fts5(
      question_uid UNINDEXED,
      searchable,
      tokenize='trigram'
    );
  `)
}

function readTags(source) {
  const tagsByQuestion = new Map()
  const rows = source.prepare(`
    SELECT qt.question_id, qt.tag
      FROM question_tags AS qt
      JOIN questions AS q ON q.id = qt.question_id
     WHERE q.status = 'ready' AND q.review_status = 'reviewed'
     ORDER BY qt.question_id, qt.tag
  `).iterate()
  for (const row of rows) {
    const tag = cleanNullableText(row.tag)
    if (tag === null) continue
    const tags = tagsByQuestion.get(row.question_id) ?? []
    if (!tags.includes(tag)) tags.push(tag)
    tagsByQuestion.set(row.question_id, tags)
  }
  return tagsByQuestion
}

function exportPapers(source, target) {
  const paperUidById = new Map()
  const insert = target.prepare(`
    INSERT INTO source_papers
      (source_uid, source_paper_id, title, subject, grade, year, month,
       region, exam_type, paper_kind, semester)
    VALUES
      (@source_uid, @source_paper_id, @title, @subject, @grade, @year, @month,
       @region, @exam_type, @paper_kind, @semester)
  `)
  const rows = source.prepare(`
    SELECT DISTINCT sp.id, sp.source_uid, sp.title, sp.subject, sp.grade, sp.year,
           sp.exam_month, COALESCE(NULLIF(sp.district, ''), NULLIF(sp.region, '')) AS region,
           sp.exam_type, sp.paper_kind, sp.semester
      FROM source_papers AS sp
      JOIN questions AS q ON q.source_paper_id = sp.id
     WHERE q.status = 'ready' AND q.review_status = 'reviewed'
     ORDER BY sp.id
  `).all()
  target.transaction(() => {
    for (const row of rows) {
      const sourceUid = cleanNullableText(row.source_uid) ?? `legacy-paper:${row.id}`
      paperUidById.set(row.id, sourceUid)
      insert.run({
        source_uid: sourceUid,
        source_paper_id: row.id,
        title: cleanNullableText(row.title) ?? `试卷 ${row.id}`,
        subject: cleanNullableText(row.subject) ?? '未分类',
        grade: cleanNullableText(row.grade),
        year: safeIntegerOrNull(row.year),
        month: normalizeExamMonth(row.exam_month, row.exam_type),
        region: cleanNullableText(row.region),
        exam_type: cleanNullableText(row.exam_type),
        paper_kind: cleanNullableText(row.paper_kind),
        semester: cleanNullableText(row.semester),
      })
    }
  })()
  return paperUidById
}

function exportQuestions(source, target, tagsByQuestion, paperUidById) {
  const insertQuestion = target.prepare(`
    INSERT INTO questions
      (source_uid, source_question_id, paper_uid, question_no, type, type_label,
       subject, grade, section, content, options_json, answer, analysis, difficulty,
       score, content_hash, created_at, updated_at)
    VALUES
      (@source_uid, @source_question_id, @paper_uid, @question_no, @type, @type_label,
       @subject, @grade, @section, @content, @options_json, @answer, @analysis, @difficulty,
       @score, @content_hash, @created_at, @updated_at)
  `)
  const insertTag = target.prepare(
    'INSERT OR IGNORE INTO question_tags (question_uid, tag) VALUES (?, ?)',
  )
  const insertSearch = target.prepare(
    'INSERT INTO question_search (question_uid, searchable) VALUES (?, ?)',
  )
  const rows = source.prepare(`
    SELECT q.id, q.source_uid, q.source_paper_id, q.question_no, q.type,
           q.subject, q.grade, q.section, q.content, q.options, q.answer, q.analysis,
           COALESCE(
             (SELECT qda.difficulty_score
                FROM question_difficulty_assessments AS qda
               WHERE qda.question_id = q.id AND qda.decision_status = 'scored'
               ORDER BY qda.created_at DESC, qda.id DESC
               LIMIT 1),
             q.difficulty
           ) AS difficulty,
           q.score, q.content_hash, q.created_at, q.updated_at,
           sp.title AS paper_title, sp.exam_type
      FROM questions AS q
      LEFT JOIN source_papers AS sp ON sp.id = q.source_paper_id
     WHERE q.status = 'ready' AND q.review_status = 'reviewed'
     ORDER BY q.id
  `).iterate()
  const questionUidById = new Map()
  const writeQuestion = target.transaction((row) => {
    const sourceUid = cleanNullableText(row.source_uid)
    if (sourceUid === null) throw new Error(`可用题目 ${row.id} 缺少稳定 source_uid`)
    const tags = tagsByQuestion.get(row.id) ?? []
    const type = cleanNullableText(row.type) ?? 'raw'
    const content = textOrEmpty(row.content)
    const answer = textOrEmpty(row.answer)
    const analysis = textOrEmpty(row.analysis)
    insertQuestion.run({
      source_uid: sourceUid,
      source_question_id: row.id,
      paper_uid: paperUidById.get(row.source_paper_id) ?? null,
      question_no: cleanNullableText(row.question_no),
      type,
      type_label: typeLabel(type),
      subject: cleanNullableText(row.subject) ?? '未分类',
      grade: cleanNullableText(row.grade),
      section: cleanNullableText(row.section),
      content,
      options_json: cleanOptions(row.options),
      answer,
      analysis,
      difficulty: safeDifficulty(row.difficulty),
      score: safeNumberOrNull(row.score),
      content_hash: cleanNullableText(row.content_hash),
      created_at: cleanNullableText(row.created_at),
      updated_at: cleanNullableText(row.updated_at),
    })
    for (const tag of tags) insertTag.run(sourceUid, tag)
    insertSearch.run(sourceUid, [
      content,
      textOrEmpty(row.options),
      answer,
      analysis,
      tags.join(' '),
      textOrEmpty(row.paper_title),
      textOrEmpty(row.exam_type),
      textOrEmpty(row.grade),
      textOrEmpty(row.question_no),
    ].join('\n'))
    questionUidById.set(row.id, sourceUid)
  })
  let count = 0
  for (const row of rows) {
    writeQuestion(row)
    count += 1
    if (count % 2_000 === 0) process.stderr.write(`已导出题目 ${count}\n`)
  }
  return questionUidById
}

function exportAssetsAndLinks(source, target, sourceRoot, assetRoot, questionUidById) {
  const rows = source.prepare(`
    SELECT qa.question_id, qa.document_asset_id, qa.role AS link_role,
           qa.order_num AS link_order, da.relative_path, da.original_name,
           da.mime_type, da.file_sha256, da.size_bytes
      FROM question_assets AS qa
      JOIN questions AS q ON q.id = qa.question_id
      JOIN document_assets AS da ON da.id = qa.document_asset_id
     WHERE q.status = 'ready' AND q.review_status = 'reviewed'
     ORDER BY da.id, qa.question_id, qa.order_num, qa.id
  `).all()
  const insertAsset = target.prepare(`
    INSERT INTO assets (id, sha256, mime_type, original_name, size_bytes, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const insertLink = target.prepare(`
    INSERT OR IGNORE INTO question_assets (question_uid, asset_id, role, order_num)
    VALUES (?, ?, ?, ?)
  `)
  const assetIdByHash = new Map()
  const assetIdBySourceId = new Map()
  let nextAssetId = 1
  let processedFiles = 0
  target.transaction(() => {
    for (const row of rows) {
      const questionUid = questionUidById.get(row.question_id)
      if (questionUid === undefined) continue
      const knownAssetId = assetIdBySourceId.get(row.document_asset_id)
      if (knownAssetId !== undefined) {
        insertLink.run(
          questionUid,
          knownAssetId,
          cleanNullableText(row.link_role) ?? 'stem',
          safeIntegerOrNull(row.link_order) ?? 0,
        )
        continue
      }
      const assetPath = resolveAssetPath(sourceRoot, assetRoot, row.relative_path)
      const content = readFileSync(assetPath)
      const actualHash = createHash('sha256').update(content).digest('hex')
      const expectedHash = cleanNullableText(row.file_sha256)?.toLowerCase() ?? null
      if (expectedHash !== null && expectedHash !== actualHash) {
        throw new Error(`图片 SHA-256 不一致：${assetPath}`)
      }
      if (row.size_bytes !== null && Number(row.size_bytes) !== content.length) {
        throw new Error(`图片大小不一致：${assetPath}`)
      }
      let assetId = assetIdByHash.get(actualHash)
      if (assetId === undefined) {
        assetId = nextAssetId
        nextAssetId += 1
        assetIdByHash.set(actualHash, assetId)
        insertAsset.run(
          assetId,
          actualHash,
          cleanNullableText(row.mime_type) ?? mimeTypeForPath(assetPath),
          cleanNullableText(row.original_name),
          content.length,
          content,
        )
        processedFiles += 1
        if (processedFiles % 1_000 === 0) process.stderr.write(`已封装图片 ${processedFiles}\n`)
      }
      assetIdBySourceId.set(row.document_asset_id, assetId)
      insertLink.run(
        questionUid,
        assetId,
        cleanNullableText(row.link_role) ?? 'stem',
        safeIntegerOrNull(row.link_order) ?? 0,
      )
    }
  })()
  return processedFiles
}

function resolveAssetPath(sourceRoot, assetRoot, relativePath) {
  const normalized = String(relativePath ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
  const withoutPrefix = normalized.startsWith('storage/assets/')
    ? normalized.slice('storage/assets/'.length)
    : normalized
  if (withoutPrefix === '' || withoutPrefix.split('/').some((part) => part === '..')) {
    throw new Error(`图片相对路径无效：${String(relativePath)}`)
  }
  const candidate = resolve(assetRoot, ...withoutPrefix.split('/'))
  const relation = relative(assetRoot, candidate)
  if (relation === '' || relation.startsWith('..') || isAbsolute(relation)) {
    throw new Error(`图片路径逃逸题库资产目录：${String(relativePath)}`)
  }
  const rootRelation = relative(sourceRoot, candidate)
  if (rootRelation.startsWith('..') || isAbsolute(rootRelation)) {
    throw new Error(`图片路径逃逸旧题库根目录：${String(relativePath)}`)
  }
  if (!existsSync(candidate) || !statSync(candidate).isFile()) {
    throw new Error(`找不到题目图片：${candidate}`)
  }
  return candidate
}

function writeMetadata(database, metadata) {
  const insert = database.prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
  database.transaction(() => {
    for (const [key, value] of Object.entries(metadata)) insert.run(key, value)
  })()
}

function parseArgs(args) {
  const values = {}
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    const value = args[index + 1]
    if (!key?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error('用法：npm run question-bank:export -- --source-root <旧题库根目录> --output <文件.tqbank> [--source-name <名称>]')
    }
    values[key.slice(2)] = value
  }
  return values
}

function requireAbsoluteDirectory(value, label) {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error(`${label} 必须是绝对路径`)
  const resolved = resolve(value)
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error(`${label} 目录不存在：${resolved}`)
  }
  return resolved
}

function requireOutputPath(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error('--output 必须是绝对路径')
  const output = resolve(value)
  if (extname(output).toLowerCase() !== '.tqbank') throw new Error('输出文件扩展名必须是 .tqbank')
  return output
}

function assertOutputOutsideSource(sourceRoot, outputPath) {
  const relation = relative(sourceRoot, outputPath)
  if (relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))) {
    throw new Error('输出文件不得写入旧题库目录')
  }
}

function countRows(database, table) {
  return database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count
}

function cleanNullableText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

function textOrEmpty(value) {
  return value === null || value === undefined ? '' : String(value)
}

function cleanOptions(value) {
  const text = cleanNullableText(value)
  if (text === null) return null
  try {
    const parsed = JSON.parse(text)
    return parsed !== null && typeof parsed === 'object' ? JSON.stringify(parsed) : null
  } catch {
    return JSON.stringify({ raw: text })
  }
}

function safeIntegerOrNull(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : null
}

function safeNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function safeDifficulty(value) {
  const number = safeIntegerOrNull(value)
  return number !== null && number >= 0 && number <= 100 ? number : null
}

function normalizeExamMonth(value, examType) {
  const month = safeIntegerOrNull(value)
  return cleanNullableText(examType) === '月考' && month !== null && month >= 1 && month <= 12
    ? month
    : null
}

function typeLabel(type) {
  return ({ single: '选择题', fill: '填空题', essay: '解答题', raw: '其他' })[type] ?? type
}

function mimeTypeForPath(path) {
  return ({
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  })[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

main()
