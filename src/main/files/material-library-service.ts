import { randomUUID } from 'node:crypto'

import type {
  CreateMaterialFolderRequest,
  MaterialFolder,
  MaterialFolderItem,
  MaterialLibraryOverview,
} from '../../shared/material-library-contracts'
import type { ManagedFileRecord } from '../../shared/file-contracts'
import type { SqliteDatabase } from '../db/migrations'
import { ManagedFileService } from './managed-file-service'

export type MaterialLibraryErrorCode =
  | 'MATERIAL_FOLDER_INVALID'
  | 'MATERIAL_FOLDER_NOT_FOUND'
  | 'MATERIAL_FOLDER_NOT_EMPTY'
  | 'MATERIAL_FOLDER_CYCLE'
  | 'MATERIAL_NAME_INVALID'
  | 'MATERIAL_FILE_INVALID'

export class MaterialLibraryError extends Error {
  readonly code: MaterialLibraryErrorCode
  constructor(code: MaterialLibraryErrorCode, message: string) {
    super(message)
    this.name = 'MaterialLibraryError'
    this.code = code
  }
}

interface FolderRow {
  readonly id: string
  readonly parent_id: string | null
  readonly name: string
  readonly sort_order: number
  readonly created_at: string
  readonly updated_at: string
}

interface ItemRow { readonly file_id: string; readonly folder_id: string | null; readonly created_at: string }

export class MaterialLibraryService {
  private readonly idFactory: () => string
  private readonly now: () => string

  constructor(
    private readonly database: SqliteDatabase,
    private readonly managedFiles: ManagedFileService,
    options: { readonly idFactory?: () => string; readonly now?: () => string } = {},
  ) {
    this.idFactory = options.idFactory ?? randomUUID
    this.now = options.now ?? (() => new Date().toISOString())
  }

  getOverview(): MaterialLibraryOverview {
    const files = this.database.prepare(`
      SELECT f.id, f.original_name, f.size_bytes, f.mime_type, f.origin_file_id,
             f.mtime_ms, f.content_hash, f.created_at, f.updated_at, f.deleted_at
        FROM files f
       WHERE NOT EXISTS (SELECT 1 FROM lesson_files lf WHERE lf.file_id = f.id)
         AND NOT EXISTS (SELECT 1 FROM student_files sf WHERE sf.file_id = f.id)
       ORDER BY f.created_at, f.id
    `).all() as Array<Record<string, unknown>>
    const mappedFiles = files.map((row) => ({
      id: row.id as string,
      originalName: row.original_name as string,
      sizeBytes: row.size_bytes as number,
      mimeType: row.mime_type as string,
      originFileId: row.origin_file_id as string | null,
      mtimeMs: row.mtime_ms as number | null,
      contentHash: row.content_hash as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      deletedAt: row.deleted_at as string | null,
    } satisfies ManagedFileRecord))
    const fileIds = new Set(mappedFiles.map((file) => file.id))
    const itemRows = this.database.prepare(`
      SELECT mfi.file_id, mfi.folder_id, mfi.created_at
        FROM material_folder_items mfi
        JOIN files f ON f.id = mfi.file_id
       WHERE f.id IN (SELECT id FROM files WHERE deleted_at IS NULL OR deleted_at IS NOT NULL)
       ORDER BY mfi.created_at, mfi.file_id
    `).all() as ItemRow[]
    const items = itemRows.filter((item) => fileIds.has(item.file_id)).map(mapItem)
    const known = new Set(items.map((item) => item.fileId))
    for (const file of mappedFiles) {
      if (!known.has(file.id)) items.push({ fileId: file.id, folderId: null, createdAt: file.createdAt })
    }
    const folders = this.database.prepare(`
      SELECT id, parent_id, name, sort_order, created_at, updated_at
        FROM material_folders WHERE deleted_at IS NULL
       ORDER BY parent_id, sort_order, created_at, id
    `).all() as FolderRow[]
    return { folders: folders.map(mapFolder), items, files: mappedFiles }
  }

  createFolder(request: CreateMaterialFolderRequest): MaterialFolder {
    const name = normalizeName(request.name)
    if (request.parentId !== null) this.requireFolder(request.parentId)
    const now = this.now()
    const id = this.idFactory()
    const sort = this.database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM material_folders WHERE parent_id IS ? AND deleted_at IS NULL').get(request.parentId) as { next: number }
    this.database.transaction(() => {
      this.database.prepare(`INSERT INTO material_folders (id, parent_id, name, sort_order, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)`).run(id, request.parentId, name, sort.next, now, now)
    }).immediate()
    return this.requireFolder(id)
  }

  renameFolder(folderId: string, name: string): MaterialFolder {
    const folder = this.requireFolder(folderId)
    const normalized = normalizeName(name)
    const now = this.now()
    this.database.prepare('UPDATE material_folders SET name = ?, updated_at = ? WHERE id = ?').run(normalized, now, folder.id)
    return this.requireFolder(folder.id)
  }

  deleteFolder(folderId: string): void {
    const folder = this.requireFolder(folderId)
    const child = this.database.prepare('SELECT 1 FROM material_folders WHERE parent_id = ? AND deleted_at IS NULL LIMIT 1').get(folder.id)
    const item = this.database.prepare('SELECT 1 FROM material_folder_items WHERE folder_id = ? LIMIT 1').get(folder.id)
    if (child !== undefined || item !== undefined) throw new MaterialLibraryError('MATERIAL_FOLDER_NOT_EMPTY', '只能删除空文件夹，请先移出其中的子文件夹和素材。')
    this.database.prepare('UPDATE material_folders SET deleted_at = ?, updated_at = ? WHERE id = ?').run(this.now(), this.now(), folder.id)
  }

  reorderFolder(folderId: string, sortOrder: number): MaterialFolder {
    const folder = this.requireFolder(folderId)
    const siblings = this.database.prepare('SELECT id FROM material_folders WHERE parent_id IS ? AND deleted_at IS NULL ORDER BY sort_order, created_at, id').all(folder.parentId) as Array<{ id: string }>
    const clamped = Math.max(0, Math.min(sortOrder, siblings.length - 1))
    const reordered = siblings.filter((item) => item.id !== folder.id)
    reordered.splice(clamped, 0, { id: folder.id })
    this.database.transaction(() => {
      const update = this.database.prepare('UPDATE material_folders SET sort_order = ?, updated_at = ? WHERE id = ?')
      reordered.forEach((item, index) => update.run(index, this.now(), item.id))
    }).immediate()
    return this.requireFolder(folder.id)
  }

  moveFile(fileId: string, folderId: string | null): MaterialFolderItem {
    const file = this.requireStandaloneFile(fileId)
    if (file.deletedAt !== null) throw new MaterialLibraryError('MATERIAL_FILE_INVALID', '已移除的资料不能放入活动素材目录。')
    if (folderId !== null) this.requireFolder(folderId)
    const createdAt = this.now()
    this.database.transaction(() => {
      this.database.prepare(`INSERT INTO material_folder_items (folder_id, file_id, created_at) VALUES (?, ?, ?) ON CONFLICT(file_id) DO UPDATE SET folder_id = excluded.folder_id`).run(folderId, fileId, createdAt)
    }).immediate()
    return { folderId, fileId, createdAt }
  }

  saveFileAsMaterial(fileId: string, folderId: string | null): ManagedFileRecord {
    const source = this.requireStandaloneOrLinkedFile(fileId)
    const contentPath = this.managedFiles.openFile(source.id)
    const copied = this.managedFiles.importFile(contentPath)
    this.moveFile(copied.id, folderId)
    return copied
  }

  importExternalFile(sourcePath: string, folderId: string | null): ManagedFileRecord {
    const imported = this.managedFiles.importFile(sourcePath)
    this.moveFile(imported.id, folderId)
    return imported
  }

  private requireStandaloneOrLinkedFile(fileId: string): ManagedFileRecord {
    const file = this.database.prepare(`SELECT id, original_name, size_bytes, mime_type, origin_file_id, mtime_ms, content_hash, created_at, updated_at, deleted_at FROM files WHERE id = ?`).get(fileId) as Record<string, unknown> | undefined
    if (file === undefined) throw new MaterialLibraryError('MATERIAL_FILE_INVALID', '资料不存在。')
    return {
      id: file.id as string, originalName: file.original_name as string, sizeBytes: file.size_bytes as number,
      mimeType: file.mime_type as string, originFileId: file.origin_file_id as string | null,
      mtimeMs: file.mtime_ms as number | null, contentHash: file.content_hash as string | null,
      createdAt: file.created_at as string, updatedAt: file.updated_at as string, deletedAt: file.deleted_at as string | null,
    }
  }

  private requireStandaloneFile(fileId: string): ManagedFileRecord {
    const file = this.requireStandaloneOrLinkedFile(fileId)
    const linked = this.database.prepare(`SELECT 1 FROM lesson_files WHERE file_id = ? UNION ALL SELECT 1 FROM student_files WHERE file_id = ? LIMIT 1`).get(fileId, fileId)
    if (linked !== undefined) throw new MaterialLibraryError('MATERIAL_FILE_INVALID', '课程或学生副本不能放入素材库目录。')
    return file
  }

  private requireFolder(folderId: string): MaterialFolder {
    if (!isUuid(folderId)) throw new MaterialLibraryError('MATERIAL_FOLDER_INVALID', '素材文件夹 ID 无效。')
    const row = this.database.prepare('SELECT id, parent_id, name, sort_order, created_at, updated_at FROM material_folders WHERE id = ? AND deleted_at IS NULL').get(folderId) as FolderRow | undefined
    if (row === undefined) throw new MaterialLibraryError('MATERIAL_FOLDER_NOT_FOUND', '素材文件夹不存在。')
    return mapFolder(row)
  }
}

function normalizeName(name: string): string {
  const normalized = name.trim()
  if (normalized.length === 0 || normalized.length > 200) throw new MaterialLibraryError('MATERIAL_NAME_INVALID', '文件夹名称不能为空且不能超过 200 个字符。')
  return normalized
}
function isUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) }
function mapFolder(row: FolderRow): MaterialFolder { return { id: row.id, parentId: row.parent_id, name: row.name, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at } }
function mapItem(row: ItemRow): MaterialFolderItem { return { fileId: row.file_id, folderId: row.folder_id, createdAt: row.created_at } }
