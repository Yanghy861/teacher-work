import Database from 'better-sqlite3'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rename } from 'node:fs/promises'
import { setTimeout as wait } from 'node:timers/promises'

import { getSchemaVersion, type SqliteDatabase } from '../db/migrations'
import { openSearchDatabase } from '../search/search-database'
import { SearchService } from '../search/search-service'
import { DocumentIndexWorker } from '../parser/document-parser'
import { WorkspaceActivityGate } from '../workspace/activity-gate'
import { assertPathOutside } from '../workspace/workspace-paths'
import type { WorkspaceHandle } from '../workspace/workspace-service'
import { initializeWorkspace } from '../workspace/workspace-service'

export const BACKUP_MANIFEST_VERSION = 1
export const BACKUP_DIRECTORY_NAME = 'teacher-workbench-backup'
export const DEFAULT_MAX_BACKUP_FILES = 10_000
export const DEFAULT_MAX_BACKUP_BYTES = 10 * 1024 * 1024 * 1024

export interface BackupManifestFile {
  readonly fileId: string
  readonly originalName: string
  readonly sizeBytes: number
  readonly relativePath: string
  readonly mtimeMs: number
  readonly mode: number
}

export interface BackupManifest {
  readonly manifestVersion: number
  readonly backupVersion: number
  readonly createdAt: string
  readonly workspaceId: string
  readonly schemaVersion: number
  readonly fileCount: number
  readonly totalFileSize: number
  readonly files: readonly BackupManifestFile[]
}

export interface BackupResult {
  readonly backupPath: string
  readonly manifest: BackupManifest
}

export interface RestoreResult {
  readonly workspacePath: string
  readonly manifest: BackupManifest
  readonly indexedFiles: number
  readonly failedFiles: number
}

export interface BackupRestoreOptions {
  readonly now?: () => string
  readonly idFactory?: () => string
  readonly maxFiles?: number
  readonly maxTotalBytes?: number
  readonly copyFile?: (source: string, destination: string) => void
  readonly backupDatabase?: (destination: string) => Promise<unknown>
  readonly pauseIndexing?: () => Promise<void>
  readonly resumeIndexing?: () => void | Promise<void>
}

export type BackupRestoreErrorCode =
  | 'BACKUP_DESTINATION_INVALID'
  | 'BACKUP_FAILED'
  | 'BACKUP_MANIFEST_INVALID'
  | 'BACKUP_LIMIT_EXCEEDED'
  | 'BACKUP_PATH_INVALID'
  | 'RESTORE_TARGET_INVALID'
  | 'RESTORE_VALIDATION_FAILED'

export class BackupRestoreError extends Error {
  readonly code: BackupRestoreErrorCode

  constructor(code: BackupRestoreErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'BackupRestoreError'
    this.code = code
  }
}

interface FileRow {
  readonly id: string
  readonly original_name: string
}

export class BackupRestoreService {
  private readonly now: () => string
  private readonly idFactory: () => string
  private readonly maxFiles: number
  private readonly maxTotalBytes: number
  private readonly copyFile: (source: string, destination: string) => void
  private readonly backupDatabase: (destination: string) => Promise<unknown>

  constructor(
    private readonly workspace: WorkspaceHandle,
    private readonly appInstallPath: string,
    private readonly activityGate: WorkspaceActivityGate,
    options: BackupRestoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString())
    this.idFactory = options.idFactory ?? randomUUID
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_BACKUP_FILES
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_BACKUP_BYTES
    this.copyFile = options.copyFile ?? copyFileSync
    this.backupDatabase = options.backupDatabase ?? ((destination) => this.workspace.database.backup(destination))
    this.pauseIndexing = options.pauseIndexing
    this.resumeIndexing = options.resumeIndexing
  }

  private readonly pauseIndexing?: () => Promise<void>
  private readonly resumeIndexing?: () => void | Promise<void>

  async createBackup(destinationPath: string): Promise<BackupResult> {
    return this.activityGate.pause(async () => {
      try {
        await this.pauseIndexing?.()
        const target = validateBackupDestination(destinationPath, this.workspace.paths.root, this.appInstallPath)
        const staging = `${target}.staging-${this.idFactory()}`
        rmSync(staging, { recursive: true, force: true })
        mkdirSync(staging, { recursive: true })
        try {
          const manifest = await this.writeBackupStaging(staging)
          validateBackupStaging(staging, manifest, this.maxFiles, this.maxTotalBytes)
          await publishStaging(staging, target)
          return { backupPath: target, manifest }
        } catch (error) {
          rmSync(staging, { recursive: true, force: true })
          if (error instanceof BackupRestoreError) throw error
          throw new BackupRestoreError('BACKUP_FAILED', '备份失败，未发布正式备份目录。', { cause: error })
        }
      } finally {
        await this.resumeIndexing?.()
      }
    })
  }

  async restoreBackup(backupPath: string, targetPath: string): Promise<RestoreResult> {
    const manifest = readAndValidateManifest(backupPath, this.maxFiles, this.maxTotalBytes)
    validateBackupDatabase(join(resolve(backupPath), 'workspace.db'), manifest, getSchemaVersion(this.workspace.database.raw))
    validateRestoreTarget(targetPath, this.workspace.paths.root, this.appInstallPath)
    const target = resolve(targetPath)
    const staging = `${target}.restore-staging-${this.idFactory()}`
    rmSync(staging, { recursive: true, force: true })
    mkdirSync(staging, { recursive: true })
    try {
      await this.copyBackupIntoStaging(backupPath, staging, manifest)
      const restoredWorkspace = initializeWorkspace(staging, this.appInstallPath)
      try {
        validateRestoredDatabase(restoredWorkspace.database.raw, manifest)
        const indexResult = await rebuildRestoredSearch(restoredWorkspace)
        restoredWorkspace.close()
        await publishStaging(staging, target)
        return {
          workspacePath: target,
          manifest,
          indexedFiles: indexResult.indexedFiles,
          failedFiles: indexResult.failedFiles,
        }
      } catch (error) {
        restoredWorkspace.close()
        throw error
      }
    } catch (error) {
      rmSync(staging, { recursive: true, force: true })
      if (error instanceof BackupRestoreError) throw error
      throw new BackupRestoreError('RESTORE_VALIDATION_FAILED', '恢复失败，目标工作区未发布。', { cause: error })
    }
  }

  private async writeBackupStaging(staging: string): Promise<BackupManifest> {
    const databasePath = join(staging, 'workspace.db')
    await this.backupDatabase(databasePath)
    const filesDirectory = join(staging, 'files', 'objects')
    mkdirSync(filesDirectory, { recursive: true })
    const rows = this.workspace.database.raw
      .prepare('SELECT id, original_name FROM files ORDER BY created_at, id')
      .all() as FileRow[]
    if (rows.length > this.maxFiles) {
      throw new BackupRestoreError('BACKUP_LIMIT_EXCEEDED', '托管文件数量超过备份上限。')
    }
    const manifestFiles: BackupManifestFile[] = []
    let totalFileSize = 0
    for (const row of rows) {
      if (!isValidFileId(row.id)) {
        throw new BackupRestoreError('BACKUP_FAILED', `托管文件 ID 无效：${row.id}。`)
      }
      const source = join(this.workspace.paths.objectsDirectory, row.id, 'content')
      const sourceStats = lstatSync(source)
      if (!sourceStats.isFile()) {
        throw new BackupRestoreError('BACKUP_FAILED', `托管文件不可读：${row.id}。`)
      }
      totalFileSize += sourceStats.size
      if (totalFileSize > this.maxTotalBytes) {
        throw new BackupRestoreError('BACKUP_LIMIT_EXCEEDED', '托管文件总大小超过备份上限。')
      }
      const relativePath = join('files', 'objects', row.id, 'content')
      const destination = join(staging, relativePath)
      mkdirSync(dirname(destination), { recursive: true })
      this.copyFile(source, destination)
      chmodSync(destination, sourceStats.mode)
      utimesSync(destination, sourceStats.atime, sourceStats.mtime)
      manifestFiles.push({
        fileId: row.id,
        originalName: row.original_name,
        sizeBytes: sourceStats.size,
        relativePath: relativePath.split(sep).join('/'),
        mtimeMs: sourceStats.mtimeMs,
        mode: sourceStats.mode,
      })
    }
    const manifest: BackupManifest = {
      manifestVersion: BACKUP_MANIFEST_VERSION,
      backupVersion: BACKUP_MANIFEST_VERSION,
      createdAt: this.now(),
      workspaceId: this.workspace.identity.workspaceId,
      schemaVersion: this.workspace.identity.schemaVersion,
      fileCount: manifestFiles.length,
      totalFileSize,
      files: manifestFiles,
    }
    writeJsonAtomic(join(staging, 'backup_manifest.json'), manifest)
    return manifest
  }

  private async copyBackupIntoStaging(
    backupPath: string,
    staging: string,
    manifest: BackupManifest,
  ): Promise<void> {
    const sourceDatabase = join(resolve(backupPath), 'workspace.db')
    const databaseDestination = join(staging, 'data', 'workspace.db')
    mkdirSync(dirname(databaseDestination), { recursive: true })
    copyFileSync(sourceDatabase, databaseDestination)
    for (const file of manifest.files) {
      const source = resolveInside(backupPath, file.relativePath)
      const destination = resolveInside(staging, file.relativePath)
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(source, destination)
      chmodSync(destination, file.mode)
      const timestamp = new Date(file.mtimeMs)
      utimesSync(destination, timestamp, timestamp)
    }
  }
}

function validateBackupDestination(destinationPath: string, workspaceRoot: string, appInstallPath: string): string {
  if (typeof destinationPath !== 'string' || !isAbsolute(destinationPath)) {
    throw new BackupRestoreError('BACKUP_DESTINATION_INVALID', '备份目标必须是绝对路径。')
  }
  const target = resolve(destinationPath)
  const relativeToWorkspace = relative(resolve(workspaceRoot), target)
  if (relativeToWorkspace === '' || (!relativeToWorkspace.startsWith('..') && !isAbsolute(relativeToWorkspace))) {
    throw new BackupRestoreError('BACKUP_DESTINATION_INVALID', '备份目标不能位于当前工作区内。')
  }
  const relativeToInstall = relative(resolve(appInstallPath), target)
  if (relativeToInstall === '' || (!relativeToInstall.startsWith('..') && !isAbsolute(relativeToInstall))) {
    throw new BackupRestoreError('BACKUP_DESTINATION_INVALID', '备份目标不能位于应用安装目录内。')
  }
  if (existsSync(target)) {
    throw new BackupRestoreError('BACKUP_DESTINATION_INVALID', '备份目标已存在。')
  }
  return target
}

function validateRestoreTarget(targetPath: string, currentWorkspaceRoot: string, appInstallPath: string): void {
  if (typeof targetPath !== 'string' || !isAbsolute(targetPath)) {
    throw new BackupRestoreError('RESTORE_TARGET_INVALID', '恢复目标必须是绝对路径。')
  }
  const target = resolve(targetPath)
  if (existsSync(target) && !lstatSync(target).isDirectory()) {
    throw new BackupRestoreError('RESTORE_TARGET_INVALID', '恢复目标必须是目录。')
  }
  assertPathOutside(target, appInstallPath)
  const currentRelative = relative(resolve(currentWorkspaceRoot), target)
  if (currentRelative === '' || (!currentRelative.startsWith('..') && !isAbsolute(currentRelative))) {
    throw new BackupRestoreError('RESTORE_TARGET_INVALID', '恢复目标不能覆盖当前工作区。')
  }
  if (existsSync(target) && (!statSync(target).isDirectory() || readdirSync(target).length > 0)) {
    throw new BackupRestoreError('RESTORE_TARGET_INVALID', '恢复目标必须是新的空目录。')
  }
}

function readAndValidateManifest(
  backupPath: string,
  maxFiles: number,
  maxTotalBytes: number,
): BackupManifest {
  if (typeof backupPath !== 'string' || !isAbsolute(backupPath) || !existsSync(backupPath)) {
    throw new BackupRestoreError('BACKUP_MANIFEST_INVALID', '备份目录不存在。')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(join(resolve(backupPath), 'backup_manifest.json'), 'utf8'))
  } catch (error) {
    throw new BackupRestoreError('BACKUP_MANIFEST_INVALID', '备份 manifest 无法读取。', { cause: error })
  }
  if (!isBackupManifest(parsed)) {
    throw new BackupRestoreError('BACKUP_MANIFEST_INVALID', '备份 manifest 格式或版本无效。')
  }
  validateManifest(parsed, maxFiles, maxTotalBytes)
  if (!existsSync(join(resolve(backupPath), 'workspace.db'))) {
    throw new BackupRestoreError('BACKUP_MANIFEST_INVALID', '备份缺少 workspace.db。')
  }
  for (const file of parsed.files) {
    const path = resolveInside(backupPath, file.relativePath)
    if (!existsSync(path) || !lstatSync(path).isFile()) {
      throw new BackupRestoreError('BACKUP_MANIFEST_INVALID', `备份文件缺失：${file.relativePath}。`)
    }
    if (statSync(path).size !== file.sizeBytes) {
      throw new BackupRestoreError('BACKUP_MANIFEST_INVALID', `备份文件大小不一致：${file.relativePath}。`)
    }
  }
  return parsed
}

function validateManifest(manifest: BackupManifest, maxFiles: number, maxTotalBytes: number): void {
  if (!Number.isInteger(manifest.manifestVersion) || !Number.isInteger(manifest.backupVersion) ||
    manifest.manifestVersion !== BACKUP_MANIFEST_VERSION || manifest.backupVersion !== BACKUP_MANIFEST_VERSION) {
    throw new BackupRestoreError('BACKUP_MANIFEST_INVALID', '备份 manifest 版本不受支持。')
  }
  if (manifest.createdAt.trim() === '' || Number.isNaN(Date.parse(manifest.createdAt)) || manifest.workspaceId.trim() === '') {
    throw new BackupRestoreError('BACKUP_MANIFEST_INVALID', '备份 manifest 身份信息无效。')
  }
  if (!Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion <= 0) {
    throw new BackupRestoreError('BACKUP_MANIFEST_INVALID', '备份 schema 版本无效。')
  }
  if (!Number.isInteger(manifest.fileCount) || manifest.fileCount < 0 || manifest.fileCount !== manifest.files.length || manifest.fileCount > maxFiles) {
    throw new BackupRestoreError('BACKUP_LIMIT_EXCEEDED', '备份文件数量超过上限或 manifest 不一致。')
  }
  if (!Number.isSafeInteger(manifest.totalFileSize) || manifest.totalFileSize < 0 || manifest.totalFileSize > maxTotalBytes) {
    throw new BackupRestoreError('BACKUP_LIMIT_EXCEEDED', '备份文件总大小超过上限。')
  }
  let total = 0
  const ids = new Set<string>()
  for (const file of manifest.files) {
    if (ids.has(file.fileId)) {
      throw new BackupRestoreError('BACKUP_MANIFEST_INVALID', '备份 manifest 包含重复文件。')
    }
    ids.add(file.fileId)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(file.fileId)) {
      throw new BackupRestoreError('BACKUP_MANIFEST_INVALID', '备份 manifest 包含无效文件 ID。')
    }
    if (file.originalName.trim() === '' || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0 ||
      !Number.isFinite(file.mtimeMs) || !Number.isInteger(file.mode) || file.mode < 0) {
      throw new BackupRestoreError('BACKUP_MANIFEST_INVALID', '备份 manifest 文件元数据无效。')
    }
    const expectedPath = `files/objects/${file.fileId}/content`
    if (file.relativePath.replaceAll('\\', '/') !== expectedPath) {
      throw new BackupRestoreError('BACKUP_PATH_INVALID', '托管文件相对路径无效。')
    }
    resolveInside('backup', file.relativePath)
    total += file.sizeBytes
  }
  if (total !== manifest.totalFileSize) {
    throw new BackupRestoreError('BACKUP_MANIFEST_INVALID', '备份文件总大小与 manifest 不一致。')
  }
}

function validateBackupStaging(
  staging: string,
  manifest: BackupManifest,
  maxFiles: number,
  maxTotalBytes: number,
): void {
  validateManifest(manifest, maxFiles, maxTotalBytes)
  const databasePath = join(staging, 'workspace.db')
  let database: Database.Database | null = null
  try {
    if (!lstatSync(databasePath).isFile()) {
      throw new BackupRestoreError('BACKUP_FAILED', '备份 workspace.db 不是普通文件。')
    }
    database = new Database(databasePath, { readonly: true })
    const integrity = database.pragma('integrity_check') as Array<{ integrity_check: string }>
    if (integrity[0]?.integrity_check !== 'ok') {
      throw new BackupRestoreError('BACKUP_FAILED', '备份 workspace.db 完整性校验失败。')
    }
    validateDatabaseIdentity(database, manifest, maxSupportedSchemaVersion(database))
    validateDatabaseFiles(database, manifest, 'BACKUP_FAILED')
    for (const file of manifest.files) {
      const path = resolveInside(staging, file.relativePath)
      const stats = lstatSync(path)
      if (!stats.isFile() || stats.size !== file.sizeBytes) {
        throw new BackupRestoreError('BACKUP_FAILED', `备份文件校验失败：${file.relativePath}。`)
      }
    }
  } catch (error) {
    if (error instanceof BackupRestoreError) throw error
    throw new BackupRestoreError('BACKUP_FAILED', '备份 staging 校验失败。', { cause: error })
  } finally {
    database?.close()
    removeSqliteSidecars(databasePath)
  }
}

function validateBackupDatabase(databasePath: string, manifest: BackupManifest, maxSupportedSchemaVersion: number): void {
  let database: Database.Database | null = null
  try {
    if (!lstatSync(databasePath).isFile()) {
      throw new BackupRestoreError('RESTORE_VALIDATION_FAILED', '备份 workspace.db 不是普通文件。')
    }
    database = new Database(databasePath, { readonly: true })
    const integrity = database.pragma('integrity_check') as Array<{ integrity_check: string }>
    if (integrity[0]?.integrity_check !== 'ok') {
      throw new BackupRestoreError('RESTORE_VALIDATION_FAILED', '备份 workspace.db 完整性校验失败。')
    }
    validateDatabaseIdentity(database, manifest, maxSupportedSchemaVersion)
    validateDatabaseFiles(database, manifest, 'RESTORE_VALIDATION_FAILED')
  } catch (error) {
    if (error instanceof BackupRestoreError) throw error
    throw new BackupRestoreError('RESTORE_VALIDATION_FAILED', '备份 workspace.db 无法打开。', { cause: error })
  } finally {
    database?.close()
  }
}

function removeSqliteSidecars(databasePath: string): void {
  rmSync(`${databasePath}-wal`, { force: true })
  rmSync(`${databasePath}-shm`, { force: true })
  rmSync(`${databasePath}-journal`, { force: true })
}

function maxSupportedSchemaVersion(database: Database.Database): number {
  const result = database
    .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
    .get() as { version: number }
  return result.version
}

function validateDatabaseIdentity(
  database: Database.Database,
  manifest: BackupManifest,
  maxSupportedSchemaVersion: number,
): void {
  const workspaceId = database.prepare('SELECT value FROM workspace_meta WHERE key = ?').get('workspaceId') as { value: string } | undefined
  const schemaVersion = database.prepare('SELECT value FROM workspace_meta WHERE key = ?').get('schemaVersion') as { value: string } | undefined
  const parsedSchemaVersion = Number(schemaVersion?.value)
  if (workspaceId?.value !== manifest.workspaceId || parsedSchemaVersion !== manifest.schemaVersion || parsedSchemaVersion <= 0) {
    throw new BackupRestoreError('RESTORE_VALIDATION_FAILED', '备份工作区身份或 schema 版本无效。')
  }
  if (parsedSchemaVersion > maxSupportedSchemaVersion) {
    throw new BackupRestoreError('RESTORE_VALIDATION_FAILED', '备份 schema 版本高于当前应用支持版本。')
  }
}

function validateRestoredDatabase(database: SqliteDatabase, manifest: BackupManifest): void {
  const integrity = database.pragma('integrity_check') as Array<{ integrity_check: string }>
  if (integrity[0]?.integrity_check !== 'ok') {
    throw new BackupRestoreError('RESTORE_VALIDATION_FAILED', '恢复的 workspace.db 完整性校验失败。')
  }
  const workspaceId = database.prepare('SELECT value FROM workspace_meta WHERE key = ?').get('workspaceId') as { value: string } | undefined
  const schemaVersion = database.prepare('SELECT value FROM workspace_meta WHERE key = ?').get('schemaVersion') as { value: string } | undefined
  const parsedSchemaVersion = Number(schemaVersion?.value)
  const currentSchemaVersion = getSchemaVersion(database)
  if (workspaceId?.value !== manifest.workspaceId || !Number.isInteger(parsedSchemaVersion) || parsedSchemaVersion < manifest.schemaVersion || parsedSchemaVersion !== currentSchemaVersion) {
    throw new BackupRestoreError('RESTORE_VALIDATION_FAILED', '恢复的工作区身份或 schema 版本无效。')
  }
  validateDatabaseFiles(database, manifest, 'RESTORE_VALIDATION_FAILED')
}

function validateDatabaseFiles(
  database: Database.Database,
  manifest: BackupManifest,
  errorCode: 'BACKUP_FAILED' | 'RESTORE_VALIDATION_FAILED',
): void {
  const rows = database
    .prepare('SELECT id, original_name, size_bytes FROM files ORDER BY id')
    .all() as Array<{ id: string; original_name: string; size_bytes: number }>
  if (rows.length !== manifest.fileCount) {
    throw new BackupRestoreError(errorCode, '备份 manifest 与数据库文件数量不一致。')
  }
  const byId = new Map(rows.map((row) => [row.id, row]))
  for (const file of manifest.files) {
    const row = byId.get(file.fileId)
    if (row === undefined || row.original_name !== file.originalName || row.size_bytes !== file.sizeBytes) {
      throw new BackupRestoreError(errorCode, `备份 manifest 与数据库文件记录不一致：${file.fileId}。`)
    }
  }
}

async function rebuildRestoredSearch(workspace: WorkspaceHandle): Promise<{ indexedFiles: number; failedFiles: number }> {
    const searchDatabase = openSearchDatabase(workspace.paths)
    const service = new SearchService(workspace.database.raw, searchDatabase.raw, workspace.paths)
    const worker = new DocumentIndexWorker(workspace.database.raw, service, workspace.paths)
    try {
    service.clearDerivedIndex()
    service.rebuildCoreSources()
    const results = await worker.rebuildPending()
    return {
      indexedFiles: results.filter((result) => result.status === 'indexed').length,
      failedFiles: results.filter((result) => result.status === 'parse_failed').length,
    }
  } finally {
    await worker.close()
    searchDatabase.close()
  }
}

function resolveInside(root: string, relativePath: string): string {
  if (typeof relativePath !== 'string' || relativePath.trim() === '' || isAbsolute(relativePath)) {
    throw new BackupRestoreError('BACKUP_PATH_INVALID', '备份路径必须是非空相对路径。')
  }
  const normalized = relativePath.replaceAll('\\', '/')
  if (normalized.split('/').some((part) => part === '..')) {
    throw new BackupRestoreError('BACKUP_PATH_INVALID', '备份路径不能穿越目标目录。')
  }
  const resolved = resolve(root, normalized)
  const relativeResolved = relative(resolve(root), resolved)
  if (relativeResolved === '' || relativeResolved.startsWith(`..${sep}`) || relativeResolved === '..' || isAbsolute(relativeResolved)) {
    throw new BackupRestoreError('BACKUP_PATH_INVALID', '备份路径不能穿越目标目录。')
  }
  return resolved
}

async function publishStaging(staging: string, target: string): Promise<void> {
  if (existsSync(target)) {
    if (readdirSync(target).length > 0) {
      throw new BackupRestoreError('RESTORE_TARGET_INVALID', '发布目标必须为空。')
    }
    rmSync(target, { recursive: true, force: true })
  }
  await renameWithTransientLockRetry(staging, target)
}

async function renameWithTransientLockRetry(source: string, target: string): Promise<void> {
  const maxAttempts = 5
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await rename(source, target)
      return
    } catch (error) {
      if (!isTransientFileLock(error) || attempt === maxAttempts) throw error
      await wait(attempt * 50)
    }
  }
}

function isTransientFileLock(error: unknown): boolean {
  if (error === null || typeof error !== 'object' || !('code' in error)) return false
  return error.code === 'EPERM' || error.code === 'EBUSY' || error.code === 'EACCES'
}

function writeJsonAtomic(path: string, value: unknown): void {
  const temporary = `${path}.tmp-${randomUUID()}`
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', flag: 'wx' })
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

function isBackupManifest(value: unknown): value is BackupManifest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.manifestVersion !== 'number' ||
    typeof candidate.backupVersion !== 'number' ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.workspaceId !== 'string' ||
    typeof candidate.schemaVersion !== 'number' ||
    typeof candidate.fileCount !== 'number' ||
    typeof candidate.totalFileSize !== 'number' ||
    !Array.isArray(candidate.files)
  ) return false
  return candidate.files.every((file) => {
    if (file === null || typeof file !== 'object' || Array.isArray(file)) return false
    const item = file as Record<string, unknown>
    return (
      typeof item.fileId === 'string' &&
      typeof item.originalName === 'string' &&
      typeof item.sizeBytes === 'number' &&
      typeof item.relativePath === 'string' &&
      typeof item.mtimeMs === 'number' &&
      typeof item.mode === 'number'
    )
  })
}

function isValidFileId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
