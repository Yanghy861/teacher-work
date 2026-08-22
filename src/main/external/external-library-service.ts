import { randomUUID } from 'node:crypto'
import { accessSync, constants, lstatSync, readdirSync, realpathSync, statSync } from 'node:fs'
import type { Stats } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import type {
  ExternalDirectoryListing,
  ExternalEntry,
  ExternalRootSummary,
} from '../../shared/external-library-contracts'
import type { SqliteDatabase } from '../db/migrations'

export type ExternalLibraryErrorCode =
  | 'EXTERNAL_ROOT_INVALID'
  | 'EXTERNAL_ROOT_NOT_CONFIGURED'
  | 'EXTERNAL_ROOT_UNAVAILABLE'
  | 'EXTERNAL_PATH_INVALID'
  | 'EXTERNAL_PATH_OUTSIDE_ROOT'
  | 'EXTERNAL_ENTRY_NOT_FOUND'
  | 'EXTERNAL_ENTRY_NOT_DIRECTORY'
  | 'EXTERNAL_ENTRY_NOT_FILE'

export class ExternalLibraryError extends Error {
  readonly code: ExternalLibraryErrorCode

  constructor(code: ExternalLibraryErrorCode, message: string) {
    super(message)
    this.name = 'ExternalLibraryError'
    this.code = code
  }
}

interface ExternalRootRow {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly created_at: string
  readonly updated_at: string
}

export interface ExternalLibraryServiceOptions {
  readonly idFactory?: () => string
  readonly now?: () => string
}

export class ExternalLibraryService {
  private readonly idFactory: () => string
  private readonly now: () => string

  constructor(
    private readonly database: SqliteDatabase,
    options: ExternalLibraryServiceOptions = {},
  ) {
    this.idFactory = options.idFactory ?? randomUUID
    this.now = options.now ?? (() => new Date().toISOString())
  }

  getRoot(): ExternalRootSummary | null {
    const row = this.findRoot()
    return row === undefined ? null : this.mapRoot(row)
  }

  setRoot(selectedPath: string): ExternalRootSummary {
    const canonicalPath = validateRootPath(selectedPath)
    const now = this.now()
    const id = this.idFactory()
    const name = basename(canonicalPath) || '外部资料'

    this.database.transaction(() => {
      this.database.prepare('DELETE FROM external_roots').run()
      this.database
        .prepare(
          `INSERT INTO external_roots
             (singleton_id, id, name, path, created_at, updated_at)
           VALUES (1, ?, ?, ?, ?, ?)`,
        )
        .run(id, name, canonicalPath, now, now)
    }).immediate()

    return this.requireRootSummary(id)
  }

  listChildren(rootId: string, relativePath: string): ExternalDirectoryListing {
    const row = this.requireRoot(rootId)
    const resolved = this.resolveEntry(row, relativePath)
    if (!resolved.stats.isDirectory()) {
      throw new ExternalLibraryError(
        'EXTERNAL_ENTRY_NOT_DIRECTORY',
        '所选外部资料位置不是文件夹。',
      )
    }

    let entries: ExternalEntry[]
    try {
      entries = readdirSync(resolved.path, { withFileTypes: true }).flatMap((entry) => {
        const childRelativePath = resolved.relativePath === ''
          ? entry.name
          : join(resolved.relativePath, entry.name)
        try {
          const child = this.resolveEntry(row, childRelativePath)
          if (!child.stats.isDirectory() && !child.stats.isFile()) {
            return []
          }
          return [{
            rootId: row.id,
            relativePath: child.relativePath,
            name: entry.name,
            kind: child.stats.isDirectory() ? 'folder' : 'file',
            extension: child.stats.isFile() ? normalizeExtension(entry.name) : null,
            sizeBytes: child.stats.isFile() ? child.stats.size : null,
            modifiedAt: new Date(child.stats.mtimeMs).toISOString(),
          } satisfies ExternalEntry]
        } catch (error) {
          if (error instanceof ExternalLibraryError) {
            return []
          }
          throw error
        }
      })
    } catch (error) {
      if (error instanceof ExternalLibraryError) throw error
      throw new ExternalLibraryError(
        'EXTERNAL_ROOT_UNAVAILABLE',
        '无法读取外部资料目录，请检查文件夹权限。',
      )
    }

    entries.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1
      return left.name.localeCompare(right.name, 'zh-CN', { numeric: true })
    })

    return {
      root: this.mapRoot(row),
      directoryRelativePath: resolved.relativePath,
      entries,
    }
  }

  getFilePath(rootId: string, relativePath: string): string {
    const row = this.requireRoot(rootId)
    const resolved = this.resolveEntry(row, relativePath)
    if (!resolved.stats.isFile()) {
      throw new ExternalLibraryError(
        'EXTERNAL_ENTRY_NOT_FILE',
        '只能打开外部资料中的文件。',
      )
    }
    return resolved.path
  }

  private findRoot(): ExternalRootRow | undefined {
    return this.database
      .prepare(
        `SELECT id, name, path, created_at, updated_at
           FROM external_roots
          WHERE singleton_id = 1`,
      )
      .get() as ExternalRootRow | undefined
  }

  private requireRoot(rootId: string): ExternalRootRow {
    const row = this.findRoot()
    if (row === undefined) {
      throw new ExternalLibraryError(
        'EXTERNAL_ROOT_NOT_CONFIGURED',
        '请先选择外部资料目录。',
      )
    }
    if (row.id !== rootId) {
      throw new ExternalLibraryError(
        'EXTERNAL_ROOT_NOT_CONFIGURED',
        '外部资料目录已经更改，请刷新后重试。',
      )
    }
    return row
  }

  private requireRootSummary(rootId: string): ExternalRootSummary {
    return this.mapRoot(this.requireRoot(rootId))
  }

  private mapRoot(row: ExternalRootRow): ExternalRootSummary {
    return {
      id: row.id,
      name: row.name,
      available: isReadableDirectory(row.path),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private resolveEntry(
    row: ExternalRootRow,
    requestedRelativePath: string,
  ): { readonly path: string; readonly relativePath: string; readonly stats: Stats } {
    const normalizedRelativePath = normalizeRelativePath(requestedRelativePath)
    let canonicalRoot: string
    try {
      canonicalRoot = realpathSync(row.path)
      const rootStats = lstatSync(canonicalRoot)
      if (!rootStats.isDirectory()) throw new Error('root is not a directory')
      accessSync(canonicalRoot, constants.R_OK)
    } catch {
      throw new ExternalLibraryError(
        'EXTERNAL_ROOT_UNAVAILABLE',
        '外部资料目录不可用，请在设置中重新选择。',
      )
    }

    const candidate = normalizedRelativePath === ''
      ? canonicalRoot
      : resolve(canonicalRoot, normalizedRelativePath)
    assertWithinRoot(canonicalRoot, candidate)

    let canonicalEntry: string
    try {
      canonicalEntry = realpathSync(candidate)
    } catch {
      throw new ExternalLibraryError(
        'EXTERNAL_ENTRY_NOT_FOUND',
        '外部资料已经移动或不存在，请刷新后重试。',
      )
    }
    assertWithinRoot(canonicalRoot, canonicalEntry)

    try {
      const stats = statSync(canonicalEntry)
      accessSync(canonicalEntry, constants.R_OK)
      return { path: canonicalEntry, relativePath: normalizedRelativePath, stats }
    } catch {
      throw new ExternalLibraryError(
        'EXTERNAL_ENTRY_NOT_FOUND',
        '外部资料不可读取，请检查文件权限。',
      )
    }
  }
}

function validateRootPath(selectedPath: string): string {
  if (typeof selectedPath !== 'string' || !isAbsolute(selectedPath)) {
    throw new ExternalLibraryError(
      'EXTERNAL_ROOT_INVALID',
      '请选择有效的本地资料文件夹。',
    )
  }
  try {
    const canonicalPath = realpathSync(selectedPath)
    const stats = lstatSync(canonicalPath)
    if (!stats.isDirectory()) throw new Error('not a directory')
    accessSync(canonicalPath, constants.R_OK)
    return canonicalPath
  } catch {
    throw new ExternalLibraryError(
      'EXTERNAL_ROOT_INVALID',
      '所选外部资料目录不存在、不是文件夹或无法读取。',
    )
  }
}

function normalizeRelativePath(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length > 4_096 ||
    value.includes('\0') ||
    isAbsolute(value) ||
    value.startsWith('\\') ||
    value.split(/[\\/]+/).some((segment) => segment === '..' || segment.includes(':'))
  ) {
    throw new ExternalLibraryError(
      'EXTERNAL_PATH_INVALID',
      '外部资料相对路径无效。',
    )
  }
  return value === '' ? '' : value.replace(/[\\/]+/g, sep)
}

function assertWithinRoot(root: string, candidate: string): void {
  const relativePath = relative(root, candidate)
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new ExternalLibraryError(
      'EXTERNAL_PATH_OUTSIDE_ROOT',
      '外部资料路径超出已选择的资料目录。',
    )
  }
}

function isReadableDirectory(path: string): boolean {
  try {
    const canonicalPath = realpathSync(path)
    const stats = lstatSync(canonicalPath)
    accessSync(canonicalPath, constants.R_OK)
    return stats.isDirectory()
  } catch {
    return false
  }
}

function normalizeExtension(name: string): string | null {
  const extension = extname(name).toLowerCase()
  return extension === '' ? null : extension
}
