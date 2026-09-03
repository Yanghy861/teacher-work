import { createReadStream, accessSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

import type {
  ManagedFileLink,
  ManagedFileContent,
  ManagedFileOverview,
  ManagedFileRefreshResult,
  ManagedFileRecord,
} from '../../shared/file-contracts'
import type { SqliteDatabase } from '../db/migrations'
import type { WorkspacePaths } from '../workspace/workspace-paths'

export type ManagedFileErrorCode =
  | 'FILE_SOURCE_INVALID'
  | 'FILE_ID_INVALID'
  | 'FILE_NOT_FOUND'
  | 'FILE_DELETED'
  | 'FILE_NOT_DELETED'
  | 'FILE_OBJECT_MISSING'
  | 'FILE_CONTENT_TOO_LARGE'
  | 'FILE_COPY_FAILED'
  | 'FILE_REGISTRATION_FAILED'
  | 'FILE_OPEN_FAILED'
  | 'FILE_TARGET_INVALID'
  | 'FILE_TARGET_DELETED'
  | 'FILE_PERMANENT_DELETE_FAILED'

export class ManagedFileError extends Error {
  readonly code: ManagedFileErrorCode

  constructor(code: ManagedFileErrorCode, message: string) {
    super(message)
    this.name = 'ManagedFileError'
    this.code = code
  }
}

export interface ManagedFileServiceOptions {
  readonly idFactory?: () => string
  readonly now?: () => string
  readonly copyFile?: (sourcePath: string, destinationPath: string) => void
  readonly renameFile?: (sourcePath: string, destinationPath: string) => void
  readonly removePath?: (path: string) => void
  readonly hashFile?: (path: string) => Promise<string>
}

interface FileRow {
  readonly id: string
  readonly original_name: string
  readonly size_bytes: number
  readonly mime_type: string
  readonly origin_file_id: string | null
  readonly mtime_ms: number | null
  readonly content_hash: string | null
  readonly created_at: string
  readonly updated_at: string
  readonly deleted_at: string | null
}

interface LinkRow {
  readonly file_id: string
  readonly target_type: 'lesson' | 'student'
  readonly target_id: string
  readonly created_at: string
}

export class ManagedFileService {
  private readonly idFactory: () => string
  private readonly now: () => string
  private readonly copyFile: (sourcePath: string, destinationPath: string) => void
  private readonly renameFile: (sourcePath: string, destinationPath: string) => void
  private readonly removePath: (path: string) => void
  private readonly hashFile: (path: string) => Promise<string>
  private refreshTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly database: SqliteDatabase,
    private readonly paths: WorkspacePaths,
    options: ManagedFileServiceOptions = {},
  ) {
    this.idFactory = options.idFactory ?? randomUUID
    this.now = options.now ?? (() => new Date().toISOString())
    this.copyFile = options.copyFile ?? copyFileSync
    this.renameFile = options.renameFile ?? renameSync
    this.removePath = options.removePath ?? ((path) => rmSync(path, { recursive: true, force: true }))
    this.hashFile = options.hashFile ?? hashManagedFile
  }

  importFile(sourcePath: string): ManagedFileRecord {
    const source = validateSourceFile(sourcePath)
    const originalName = basename(source)
    const mimeType = mimeTypeForName(originalName)
    return this.copyAndRegister(source, originalName, mimeType, null)
  }

  importToLesson(sourcePath: string, lessonId: string): ManagedFileRecord {
    this.requireActiveLesson(lessonId)
    const source = validateSourceFile(sourcePath)
    const originalName = basename(source)
    return this.copyAndRegister(
      source,
      originalName,
      mimeTypeForName(originalName),
      null,
      { targetType: 'lesson', targetId: lessonId },
    )
  }

  getOverview(options: { readonly includeDeleted?: boolean } = {}): ManagedFileOverview {
    const overviewOptions = { includeDeleted: options.includeDeleted ?? true }
    return {
      files: this.listFiles(overviewOptions),
      links: this.listLinks(overviewOptions),
    }
  }

  listFiles(options: { readonly includeDeleted?: boolean } = {}): ManagedFileRecord[] {
    const rows = this.database
      .prepare(
        `SELECT id, original_name, size_bytes, mime_type, origin_file_id,
                mtime_ms, content_hash, created_at, updated_at, deleted_at
           FROM files
          ${options.includeDeleted ? '' : 'WHERE deleted_at IS NULL'}
          ORDER BY created_at, id`,
      )
      .all() as FileRow[]
    return rows.map(mapFile)
  }

  openFile(fileId: string): string {
    const file = this.requireActiveFile(fileId)
    return this.requireReadableObject(file.id)
  }

  showFileInFolder(fileId: string): string {
    return this.openFile(fileId)
  }

  readContent(fileId: string): ManagedFileContent {
    const file = this.requireActiveFile(fileId)
    const contentPath = this.requireReadableObject(file.id)
    const stats = statSync(contentPath)
    if (stats.size > MAX_PREVIEW_BYTES) {
      return {
        file,
        kind: 'unsupported',
        message: `文件较大（${formatFileSize(stats.size)}），请使用系统应用打开。`,
      }
    }
    const content = readFileSync(contentPath)
    if (file.mimeType.startsWith('image/')) {
      return {
        file,
        kind: 'image',
        dataUrl: `data:${file.mimeType};base64,${content.toString('base64')}`,
      }
    }
    if (isPreviewableText(file.mimeType)) {
      return { file, kind: 'text', content: content.toString('utf8') }
    }
    return {
      file,
      kind: 'unsupported',
      message: '这种文件适合交给系统应用打开，工作台暂时不直接渲染。',
    }
  }

  /** V17-C：编辑器读取原始 md 文本（仅 text/*，不截断不转换，渲染层自行 KaTeX）。 */
  readText(fileId: string): { file: ManagedFileRecord; content: string } {
    const file = this.requireActiveFile(fileId)
    if (!isPreviewableText(file.mimeType)) {
      throw new ManagedFileError('FILE_SOURCE_INVALID', '只能读取文本类托管文件。')
    }
    const contentPath = this.requireReadableObject(file.id)
    const stats = statSync(contentPath)
    if (stats.size > MAX_PREVIEW_BYTES) {
      throw new ManagedFileError('FILE_CONTENT_TOO_LARGE', '文件过大，编辑器暂不支持读取。')
    }
    return { file, content: readFileSync(contentPath).toString('utf8') }
  }

  /**
   * V17-C/D29：人工编辑保存为**新文件**（绝不 UPDATE 目标行）：
   * 版本链目标沿用 publishLessonDraftVersion 的课次锚定 MAX+1 版号出 ` · 第 N+1 版.md`；
   * 非版本链目标出 `原名（编辑版）.md` 副本；两者都经临时文件 + 原子重命名 + importToLesson 语义入课次。
   */
  writeVersion(fileId: string, bodyMd: string): { file: ManagedFileRecord; version: number } {
    const source = this.requireActiveFile(fileId)
    if (source.mimeType !== 'text/markdown') {
      throw new ManagedFileError('FILE_SOURCE_INVALID', '只能编辑 Markdown 文件。')
    }
    this.requireReadableObject(source.id)
    if (typeof bodyMd !== 'string' || bodyMd.trim() === '') {
      throw new ManagedFileError('FILE_SOURCE_INVALID', '保存内容不能为空。')
    }
    if (bodyMd.length > MAX_WRITE_BODY_CHARS) {
      throw new ManagedFileError('FILE_CONTENT_TOO_LARGE', '保存内容过大，请精简后重试。')
    }
    const linkedLessonIds = this.database
      .prepare('SELECT lesson_id FROM lesson_files WHERE file_id = ? ORDER BY created_at, lesson_id')
      .all(source.id) as Array<{ readonly lesson_id: string }>
    const lessonId = linkedLessonIds[0]?.lesson_id
    if (lessonId === undefined) {
      throw new ManagedFileError('FILE_SOURCE_INVALID', '该文件未挂接课次，请先复制到课次再编辑。')
    }
    this.requireActiveLesson(lessonId)

    const match = / · 第 (\d+) 版\.md$/u.exec(source.originalName)
    if (match === null) {
      const editedName = `${stripMarkdownExtension(source.originalName)}（编辑版）.md`
      const file = this.createTextObjectAndRegister(bodyMd, editedName, { targetType: 'lesson', targetId: lessonId })
      this.recordManualEditNote(lessonId, source, file)
      return { file, version: 1 }
    }
    const version = this.nextLessonVersionNumber(lessonId)
    const file = this.createTextObjectAndRegister(
      bodyMd,
      `${source.originalName.slice(0, match.index)} · 第 ${version} 版.md`,
      { targetType: 'lesson', targetId: lessonId },
    )
    this.recordManualEditNote(lessonId, source, file)
    return { file, version }
  }

  /**
   * V17-C/D28：人工编辑保存后在课次留一条 note_kind='manual_edit' 的来源标注
   * （不参与 AI 修改流 note 语义，仅作“人工编辑”标识；正文存文件，note 只做标记）。
   */
  private recordManualEditNote(
    lessonId: string,
    source: ManagedFileRecord,
    written: ManagedFileRecord,
  ): void {
    try {
      const now = this.now()
      this.database
        .prepare(
          `INSERT INTO notes
             (id, student_id, lesson_id, body_md, created_at, updated_at, deleted_at,
              occurred_on, note_kind, ai_metadata_json, draft_status)
           VALUES (?, NULL, ?, ?, ?, ?, NULL, NULL, 'manual_edit', NULL, NULL)`,
        )
        .run(
          this.idFactory(),
          lessonId,
          `人工编辑：${source.originalName} → ${written.originalName}`,
          now,
          now,
        )
    } catch {
      // 标注失败不阻塞保存：新文件与登记已成功，来源标注仅为展示信息。
    }
  }

  private nextLessonVersionNumber(lessonId: string): number {
    const rows = this.database
      .prepare(
        `SELECT original_name
           FROM lesson_files lf
           JOIN files f ON f.id = lf.file_id
          WHERE lf.lesson_id = ? AND f.original_name LIKE '% · 第 % 版.md'`,
      )
      .all(lessonId) as Array<{ readonly original_name: string }>
    return rows.reduce((max, row) => {
      const versionMatch = / · 第 (\d+) 版\.md$/u.exec(row.original_name)
      return versionMatch === null ? max : Math.max(max, Number(versionMatch[1]))
    }, 0) + 1
  }

  softDeleteFile(fileId: string): ManagedFileRecord {
    return this.transaction(() => {
      this.requireActiveFile(fileId)
      const deletedAt = this.now()
      this.database
        .prepare('UPDATE files SET deleted_at = ?, updated_at = ? WHERE id = ?')
        .run(deletedAt, deletedAt, fileId)
      return this.requireFile(fileId, true)
    })
  }

  restoreFile(fileId: string): ManagedFileRecord {
    return this.transaction(() => {
      const file = this.requireFile(fileId, true)
      this.requireReadableObject(file.id)
      const updatedAt = this.now()
      this.database
        .prepare('UPDATE files SET deleted_at = NULL, updated_at = ? WHERE id = ?')
        .run(updatedAt, fileId)
      return this.requireFile(fileId)
    })
  }

  permanentlyDeleteFile(fileId: string): void {
    const file = this.requireFile(fileId, true)
    if (file.deletedAt === null) {
      throw new ManagedFileError('FILE_NOT_DELETED', '请先移除资料，再进行彻底删除。')
    }

    const object = resolveManagedObjectPath(this.paths, file.id)
    if (existsSync(object.objectDirectory)) {
      try {
        this.removePath(object.objectDirectory)
      } catch {
        throw new ManagedFileError(
          'FILE_PERMANENT_DELETE_FAILED',
          '无法彻底删除资料，文件可能正被其他程序占用。',
        )
      }
    }

    try {
      this.transaction(() => {
        const result = this.database
          .prepare('DELETE FROM files WHERE id = ? AND deleted_at IS NOT NULL')
          .run(file.id)
        if (result.changes !== 1) {
          throw new ManagedFileError('FILE_NOT_FOUND', '登记的文件不存在。')
        }
      })
    } catch (error) {
      if (error instanceof ManagedFileError) {
        throw error
      }
      throw new ManagedFileError(
        'FILE_PERMANENT_DELETE_FAILED',
        '资料文件已清理，但删除工作台记录失败，请重试。',
      )
    }
  }

  copyToLesson(fileId: string, lessonId: string): ManagedFileRecord {
    this.requireActiveLesson(lessonId)
    const source = this.requireActiveFile(fileId)
    const sourcePath = this.requireReadableObject(source.id)
    return this.copyAndRegister(
      sourcePath,
      source.originalName,
      source.mimeType,
      source.id,
      { targetType: 'lesson', targetId: lessonId },
    )
  }

  copyToStudent(fileId: string, studentId: string): ManagedFileRecord {
    this.requireActiveStudent(studentId)
    const source = this.requireActiveFile(fileId)
    const sourcePath = this.requireReadableObject(source.id)
    return this.copyAndRegister(
      sourcePath,
      source.originalName,
      source.mimeType,
      source.id,
      { targetType: 'student', targetId: studentId },
    )
  }

  refreshFile(fileId: string): Promise<ManagedFileRefreshResult> {
    return this.withRefreshLock(() => this.refreshFileInternal(fileId))
  }

  refreshAll(): Promise<ManagedFileRefreshResult[]> {
    return this.withRefreshLock(async () => {
      const results: ManagedFileRefreshResult[] = []
      for (const file of this.listFiles()) {
        try {
          results.push(await this.refreshFileInternal(file.id))
        } catch (error) {
          if (error instanceof ManagedFileError && error.code === 'FILE_OBJECT_MISSING') {
            continue
          }
          throw error
        }
      }
      return results
    })
  }

  getObjectContentPath(fileId: string): string {
    return resolveManagedObjectPath(this.paths, fileId).contentPath
  }

  publishLessonDraftVersion(noteId: string): { file: ManagedFileRecord; version: number } {
    const note = this.database
      .prepare(
        `SELECT id, lesson_id, body_md, note_kind, draft_status, deleted_at, ai_metadata_json
           FROM notes WHERE id = ?`,
      )
      .get(noteId) as
      | {
          readonly id: string
          readonly lesson_id: string | null
          readonly body_md: string
          readonly note_kind: string
          readonly draft_status: string | null
          readonly deleted_at: string | null
          readonly ai_metadata_json: string | null
        }
      | undefined
    if (note === undefined) {
      throw new ManagedFileError('FILE_ID_INVALID', '要发布的修改节点不存在。')
    }
    if (note.deleted_at !== null) {
      throw new ManagedFileError('FILE_DELETED', '该修改节点已删除，无法发布。')
    }
    if (note.note_kind === 'manual' || note.draft_status === null) {
      throw new ManagedFileError('FILE_SOURCE_INVALID', '只能发布 AI 修改节点。')
    }
    if (note.lesson_id === null) {
      throw new ManagedFileError('FILE_SOURCE_INVALID', '该修改节点未绑定课次，无法发布。')
    }
    const body = note.body_md
    if (body.trim() === '') {
      throw new ManagedFileError('FILE_SOURCE_INVALID', '工作副本内容为空，无法发布。')
    }
    const lessonId = note.lesson_id
    this.requireActiveLesson(lessonId)
    const lessonTitle = this.database
      .prepare('SELECT title FROM nodes WHERE id = ?')
      .get(lessonId) as { readonly title: string }
    const versionRows = this.database
      .prepare(
        `SELECT f.original_name AS original_name
          FROM lesson_files lf
          JOIN files f ON f.id = lf.file_id
         WHERE lf.lesson_id = ?
            AND f.original_name LIKE '% · 第 % 版.md'`,
      )
      .all(lessonId) as Array<{ readonly original_name: string }>
    const version = versionRows.reduce((max, row) => {
      const match = / · 第 (\d+) 版\.md$/u.exec(row.original_name)
      return match === null ? max : Math.max(max, Number(match[1]))
    }, 0) + 1
    // V17-B/D27：修改外部导入 md 时发布产物沿用目标名（`原名 · 第 N 版.md`），
    // 版本链目标与无修改目标的节点维持课次标题命名（既有语义）。
    const publishBase = resolvePublishBaseName(note.ai_metadata_json)
    const originalName = `${publishBase ?? lessonTitle.title} · 第 ${version} 版.md`
    const file = this.createTextObjectAndRegister(body, originalName, { targetType: 'lesson', targetId: lessonId })
    this.transaction(() => {
      this.database
        .prepare(`UPDATE notes SET draft_status = 'saved', updated_at = ? WHERE id = ?`)
        .run(this.now(), noteId)
    })
    return { file, version }
  }

  private createTextObjectAndRegister(
    bodyMd: string,
    originalName: string,
    link: { readonly targetType: 'lesson' | 'student'; readonly targetId: string },
  ): ManagedFileRecord {
    const fileId = this.idFactory()
    const object = resolveManagedObjectPath(this.paths, fileId)
    let objectDirectoryCreated = false
    let registrationStarted = false
    try {
      mkdirSync(object.objectDirectory)
      objectDirectoryCreated = true
      const temporaryPath = join(object.objectDirectory, `.content-${randomUUID()}.tmp`)
      writeFileSync(temporaryPath, Buffer.from(bodyMd, 'utf8'))
      assertReadableFile(temporaryPath)
      this.renameFile(temporaryPath, object.contentPath)
      assertReadableFile(object.contentPath)
      const contentStats = statSync(object.contentPath)
      const createdAt = this.now()
      registrationStarted = true
      const record = this.transaction(() => {
        this.database
          .prepare(
            `INSERT INTO files
               (id, original_name, size_bytes, mime_type, origin_file_id,
                mtime_ms, content_hash, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, 'text/markdown', NULL, ?, NULL, ?, ?, NULL)`,
          )
          .run(fileId, originalName, contentStats.size, contentStats.mtimeMs, createdAt, createdAt)
        this.database
          .prepare(`INSERT INTO lesson_files (file_id, lesson_id, created_at) VALUES (?, ?, ?)`)
          .run(fileId, link.targetId, createdAt)
        return this.requireFile(fileId)
      })
      objectDirectoryCreated = false
      return record
    } catch (error) {
      if (objectDirectoryCreated) {
        try {
          this.removePath(object.objectDirectory)
        } catch {
          // Unregistered leftover object is unreachable through the managed API.
        }
      }
      if (error instanceof ManagedFileError) {
        throw error
      }
      throw new ManagedFileError(
        registrationStarted ? 'FILE_REGISTRATION_FAILED' : 'FILE_COPY_FAILED',
        registrationStarted ? '文件登记失败，未保留半成品。' : '文件写入失败，未保留半成品。',
      )
    }
  }

  private copyAndRegister(
    sourcePath: string,
    originalName: string,
    mimeType: string,
    originFileId: string | null,
    link?: { readonly targetType: 'lesson' | 'student'; readonly targetId: string },
  ): ManagedFileRecord {
    const fileId = this.idFactory()
    const object = resolveManagedObjectPath(this.paths, fileId)
    let objectDirectoryCreated = false
    let registrationStarted = false
    try {
      mkdirSync(object.objectDirectory)
      objectDirectoryCreated = true
      const sourceStats = statSync(sourcePath)
      const temporaryPath = join(object.objectDirectory, `.content-${randomUUID()}.tmp`)
      this.copyFile(sourcePath, temporaryPath)
      assertReadableFile(temporaryPath)
      const temporaryStats = statSync(temporaryPath)
      if (temporaryStats.size !== sourceStats.size) {
        throw new ManagedFileError('FILE_COPY_FAILED', '文件复制校验失败。')
      }
      this.renameFile(temporaryPath, object.contentPath)
      assertReadableFile(object.contentPath)
      const contentStats = statSync(object.contentPath)
      const createdAt = this.now()
      registrationStarted = true
      const record = this.transaction(() => {
        this.database
          .prepare(
            `INSERT INTO files
               (id, original_name, size_bytes, mime_type, origin_file_id,
                mtime_ms, content_hash, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
          )
          .run(
            fileId,
            originalName,
            contentStats.size,
            mimeType,
            originFileId,
            contentStats.mtimeMs,
            createdAt,
            createdAt,
          )
        if (link !== undefined) {
          const table = link.targetType === 'lesson' ? 'lesson_files' : 'student_files'
          const targetColumn = link.targetType === 'lesson' ? 'lesson_id' : 'student_id'
          this.database
            .prepare(
              `INSERT INTO ${table} (file_id, ${targetColumn}, created_at)
               VALUES (?, ?, ?)`,
            )
            .run(fileId, link.targetId, createdAt)
        }
        return this.requireFile(fileId)
      })
      objectDirectoryCreated = false
      return record
    } catch (error) {
      if (objectDirectoryCreated) {
        try {
          this.removePath(object.objectDirectory)
        } catch {
          // The database never received a successful registration, so the
          // leftover object is not available through the managed-file API.
        }
      }
      if (error instanceof ManagedFileError) {
        throw error
      }
      throw new ManagedFileError(
        registrationStarted ? 'FILE_REGISTRATION_FAILED' : 'FILE_COPY_FAILED',
        registrationStarted
          ? '文件登记失败，未保留半成品。'
          : '文件复制失败，未保留半成品。',
      )
    }
  }

  private requireActiveFile(fileId: string): ManagedFileRecord {
    const file = this.requireFile(fileId, true)
    if (file.deletedAt !== null) {
      throw new ManagedFileError('FILE_DELETED', '文件已删除，请先恢复。')
    }
    return file
  }

  private async refreshFileInternal(fileId: string): Promise<ManagedFileRefreshResult> {
    const file = this.requireActiveFile(fileId)
    const contentPath = this.requireReadableObject(file.id)
    const currentStats = statSync(contentPath)
    const needsHash =
      file.contentHash === null ||
      file.sizeBytes !== currentStats.size ||
      file.mtimeMs !== currentStats.mtimeMs
    if (!needsHash) {
      return { file, contentChanged: false, hashComputed: false }
    }

    const contentHash = await this.hashFile(contentPath)
    const contentChanged = file.contentHash !== null && file.contentHash !== contentHash
    const updatedAt = this.now()
    const updatedFile = this.transaction(() => {
      this.database
        .prepare(
          `UPDATE files
              SET size_bytes = ?, mtime_ms = ?, content_hash = ?, updated_at = ?
            WHERE id = ?`,
        )
        .run(currentStats.size, currentStats.mtimeMs, contentHash, updatedAt, file.id)
      return this.requireFile(file.id)
    })
    return { file: updatedFile, contentChanged, hashComputed: true }
  }

  private requireFile(fileId: string, includeDeleted = false): ManagedFileRecord {
    assertFileId(fileId)
    const row = this.database
      .prepare(
        `SELECT id, original_name, size_bytes, mime_type, origin_file_id,
                mtime_ms, content_hash,
                created_at, updated_at, deleted_at
           FROM files
          WHERE id = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`,
      )
      .get(fileId) as FileRow | undefined
    if (row === undefined) {
      throw new ManagedFileError('FILE_NOT_FOUND', '登记的文件不存在。')
    }
    return mapFile(row)
  }

  private requireReadableObject(fileId: string): string {
    const object = resolveManagedObjectPath(this.paths, fileId)
    try {
      assertReadableFile(object.contentPath)
    } catch {
      throw new ManagedFileError('FILE_OBJECT_MISSING', '托管文件实体不存在或不可读。')
    }
    return object.contentPath
  }

  private requireActiveLesson(lessonId: string): void {
    const row = this.database
      .prepare('SELECT kind, deleted_at FROM nodes WHERE id = ?')
      .get(lessonId) as { kind: string; deleted_at: string | null } | undefined
    if (row === undefined || row.kind !== 'lesson') {
      throw new ManagedFileError('FILE_TARGET_INVALID', '目标课次不存在。')
    }
    if (row.deleted_at !== null) {
      throw new ManagedFileError('FILE_TARGET_DELETED', '目标课次已删除。')
    }
  }

  private requireActiveStudent(studentId: string): void {
    const row = this.database
      .prepare('SELECT deleted_at FROM students WHERE id = ?')
      .get(studentId) as { deleted_at: string | null } | undefined
    if (row === undefined) {
      throw new ManagedFileError('FILE_TARGET_INVALID', '目标学生不存在。')
    }
    if (row.deleted_at !== null) {
      throw new ManagedFileError('FILE_TARGET_DELETED', '目标学生已删除。')
    }
  }

  private listLinks(options: { readonly includeDeleted?: boolean }): ManagedFileLink[] {
    const activeFilter = options.includeDeleted ? '' : 'WHERE f.deleted_at IS NULL'
    const rows = this.database
      .prepare(
        `SELECT file_id, target_type, target_id, created_at
           FROM (
             SELECT lf.file_id, 'lesson' AS target_type, lf.lesson_id AS target_id, lf.created_at
               FROM lesson_files AS lf
               JOIN files AS f ON f.id = lf.file_id
              ${activeFilter}
             UNION ALL
             SELECT sf.file_id, 'student' AS target_type, sf.student_id AS target_id, sf.created_at
               FROM student_files AS sf
               JOIN files AS f ON f.id = sf.file_id
              ${activeFilter}
           )
          ORDER BY created_at, file_id, target_type, target_id`,
      )
      .all() as LinkRow[]
    return rows.map(mapLink)
  }

  private transaction<T>(callback: () => T): T {
    return this.database.transaction(callback).immediate()
  }

  private async withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.refreshTail
    let release!: () => void
    this.refreshTail = new Promise<void>((resolveRelease) => {
      release = resolveRelease
    })
    await previous
    try {
      return await task()
    } finally {
      release()
    }
  }
}

export function resolveManagedObjectPath(
  paths: WorkspacePaths,
  fileId: string,
): { readonly objectDirectory: string; readonly contentPath: string } {
  assertFileId(fileId)
  const objectDirectory = resolve(paths.objectsDirectory, fileId)
  const relativeObjectPath = relative(paths.objectsDirectory, objectDirectory)
  if (
    relativeObjectPath === '' ||
    relativeObjectPath.startsWith('..') ||
    isAbsolute(relativeObjectPath)
  ) {
    throw new ManagedFileError('FILE_ID_INVALID', '文件对象路径无效。')
  }
  return { objectDirectory, contentPath: join(objectDirectory, 'content') }
}

function validateSourceFile(sourcePath: string): string {
  if (typeof sourcePath !== 'string' || !isAbsolute(sourcePath)) {
    throw new ManagedFileError('FILE_SOURCE_INVALID', '只能导入绝对路径的本地文件。')
  }
  try {
    const stats = lstatSync(sourcePath)
    if (!stats.isFile()) {
      throw new Error('not a regular file')
    }
    accessSync(sourcePath, constants.R_OK)
  } catch {
    throw new ManagedFileError('FILE_SOURCE_INVALID', '源文件不存在或不可读。')
  }
  const originalName = basename(sourcePath)
  if (originalName === '' || originalName === '.' || originalName === '..') {
    throw new ManagedFileError('FILE_SOURCE_INVALID', '源文件名称无效。')
  }
  return sourcePath
}

function assertReadableFile(path: string): void {
  const stats = lstatSync(path)
  if (!stats.isFile()) {
    throw new Error('not a regular file')
  }
  accessSync(path, constants.R_OK)
}

function assertFileId(fileId: string): void {
  if (
    typeof fileId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fileId)
  ) {
    throw new ManagedFileError('FILE_ID_INVALID', '文件 ID 无效。')
  }
}

function mapFile(row: FileRow): ManagedFileRecord {
  return {
    id: row.id,
    originalName: row.original_name,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type,
    originFileId: row.origin_file_id,
    mtimeMs: row.mtime_ms,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

async function hashManagedFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(path)
  try {
    for await (const chunk of stream) {
      hash.update(chunk)
      await new Promise<void>((resolveYield) => setImmediate(resolveYield))
    }
    return hash.digest('hex')
  } catch (error) {
    stream.destroy()
    throw error
  }
}

function mapLink(row: LinkRow): ManagedFileLink {
  return {
    fileId: row.file_id,
    targetType: row.target_type,
    targetId: row.target_id,
    createdAt: row.created_at,
  }
}

function mimeTypeForName(name: string): string {
  const extension = extname(name).toLowerCase()
  const knownTypes: Record<string, string> = {
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.md': 'text/markdown',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.webp': 'image/webp',
  }
  return knownTypes[extension] ?? 'application/octet-stream'
}

const MAX_PREVIEW_BYTES = 12 * 1024 * 1024
const MAX_WRITE_BODY_CHARS = 200_000

function isPreviewableText(mimeType: string): boolean {
  return mimeType.startsWith('text/') || mimeType === 'application/json'
}

/** V17-B：非版本链修改目标（外部导入 md）发布时以其原名为版本链基名；解析失败或版本链目标回退 null（走课次标题）。 */
function resolvePublishBaseName(aiMetadataJson: string | null): string | null {
  if (aiMetadataJson === null) return null
  try {
    const parsed: unknown = JSON.parse(aiMetadataJson)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const targetName = (parsed as { readonly modification?: { readonly targetName?: unknown } }).modification?.targetName
    if (typeof targetName !== 'string' || targetName.trim() === '') return null
    if (/ · 第 \d+ 版\.md$/u.test(targetName)) return null
    const base = targetName.replace(/\.(?:md|markdown)$/iu, '').trim()
    return base === '' ? null : base
  } catch {
    return null
  }
}

function stripMarkdownExtension(name: string): string {
  return name.toLowerCase().endsWith('.md') ? name.slice(0, -3) : name
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
