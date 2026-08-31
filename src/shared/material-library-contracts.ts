import { isManagedFileRecord, type ManagedFileRecord } from './file-contracts'
import { isRecord } from './ipc-contracts'

export interface MaterialFolder {
  readonly id: string
  readonly parentId: string | null
  readonly name: string
  readonly sortOrder: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface MaterialFolderItem {
  readonly fileId: string
  readonly folderId: string | null
  readonly createdAt: string
}

export interface MaterialLibraryOverview {
  readonly folders: readonly MaterialFolder[]
  readonly items: readonly MaterialFolderItem[]
  readonly files: readonly ManagedFileRecord[]
}

export interface MaterialFolderIdRequest { readonly folderId: string }
export interface CreateMaterialFolderRequest { readonly parentId: string | null; readonly name: string }
export interface RenameMaterialFolderRequest { readonly folderId: string; readonly name: string }
export interface ReorderMaterialFolderRequest { readonly folderId: string; readonly parentId: string | null; readonly sortOrder: number }
export interface MoveMaterialRequest { readonly fileId: string; readonly folderId: string | null }
export interface CopyExternalToMaterialRequest { readonly rootId: string; readonly relativePath: string; readonly folderId: string | null }
export interface SaveFileAsMaterialRequest { readonly fileId: string; readonly folderId: string | null }

export function isMaterialFolder(value: unknown): value is MaterialFolder {
  return isRecord(value) && nonEmpty(value.id) && nullableString(value.parentId) && nonEmpty(value.name) && typeof value.sortOrder === 'number' && Number.isSafeInteger(value.sortOrder) && nonEmpty(value.createdAt) && nonEmpty(value.updatedAt)
}
export function isMaterialFolderItem(value: unknown): value is MaterialFolderItem {
  return isRecord(value) && nonEmpty(value.fileId) && nullableString(value.folderId) && nonEmpty(value.createdAt)
}

export function isMaterialLibraryOverview(value: unknown): value is MaterialLibraryOverview {
  return isRecord(value) && Array.isArray(value.folders) && value.folders.every(isMaterialFolder) && Array.isArray(value.items) && value.items.every(isMaterialFolderItem) && Array.isArray(value.files) && value.files.every(isManagedFileRecord)
}

function hasKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => actual.includes(key))
}

function nonEmpty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 }
function nullableString(value: unknown): value is string | null { return value === null || nonEmpty(value) }

export function isMaterialFolderIdRequest(value: unknown): value is MaterialFolderIdRequest {
  return hasKeys(value, ['folderId']) && nonEmpty(value.folderId)
}
export function isCreateMaterialFolderRequest(value: unknown): value is CreateMaterialFolderRequest {
  return hasKeys(value, ['parentId', 'name']) && nullableString(value.parentId) && nonEmpty(value.name)
}
export function isRenameMaterialFolderRequest(value: unknown): value is RenameMaterialFolderRequest {
  return hasKeys(value, ['folderId', 'name']) && nonEmpty(value.folderId) && nonEmpty(value.name)
}
export function isReorderMaterialFolderRequest(value: unknown): value is ReorderMaterialFolderRequest {
  return hasKeys(value, ['folderId', 'parentId', 'sortOrder']) && nonEmpty(value.folderId) && nullableString(value.parentId) && typeof value.sortOrder === 'number' && Number.isSafeInteger(value.sortOrder) && value.sortOrder >= 0
}
export function isMoveMaterialRequest(value: unknown): value is MoveMaterialRequest {
  return hasKeys(value, ['fileId', 'folderId']) && nonEmpty(value.fileId) && nullableString(value.folderId)
}
export function isCopyExternalToMaterialRequest(value: unknown): value is CopyExternalToMaterialRequest {
  return hasKeys(value, ['rootId', 'relativePath', 'folderId']) && nonEmpty(value.rootId) && typeof value.relativePath === 'string' && nullableString(value.folderId)
}
export function isSaveFileAsMaterialRequest(value: unknown): value is SaveFileAsMaterialRequest {
  return isMoveMaterialRequest(value)
}
