import { createReadStream, accessSync, constants, copyFileSync, lstatSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

import type {
  ManagedFileLink,
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
  | 'FILE_OBJECT_MISSING'
  | 'FILE_COPY_FAILED'
  | 'FILE_REGISTRATION_FAILED'
  | 'FILE_OPEN_FAILED'
  | 'FILE_TARGET_INVALID'
  | 'FILE_TARGET_DELETED'

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
    '.md': 'text/markdown',
    '.pdf': 'application/pdf',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  return knownTypes[extension] ?? 'application/octet-stream'
}
