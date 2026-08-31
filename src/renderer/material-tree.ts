import type { MaterialFolder, ReorderMaterialFolderRequest } from '../shared/material-library-contracts'

export type FolderDropPosition = 'before' | 'inside' | 'after'

export function listMaterialFolderChildren(folders: readonly MaterialFolder[], parentId: string | null): MaterialFolder[] {
  return folders.filter((folder) => folder.parentId === parentId).sort(compareFolders)
}

export function materialFolderPath(folders: readonly MaterialFolder[], folderId: string): string {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const parts: string[] = []
  const visited = new Set<string>()
  let current = byId.get(folderId)
  while (current !== undefined && !visited.has(current.id)) {
    visited.add(current.id)
    parts.unshift(current.name)
    current = current.parentId === null ? undefined : byId.get(current.parentId)
  }
  return parts.join(' / ')
}

export function buildFolderMoveRequest(
  folders: readonly MaterialFolder[],
  folderId: string,
  targetFolderId: string,
  position: FolderDropPosition,
): ReorderMaterialFolderRequest | null {
  const folder = folders.find((item) => item.id === folderId)
  const target = folders.find((item) => item.id === targetFolderId)
  if (folder === undefined || target === undefined || folder.id === target.id) return null
  const parentId = position === 'inside' ? target.id : target.parentId
  if (wouldCreateCycle(folders, folder.id, parentId)) return null
  const siblings = listMaterialFolderChildren(folders, parentId).filter((item) => item.id !== folder.id)
  if (position === 'inside') return { folderId: folder.id, parentId, sortOrder: siblings.length }
  const targetIndex = siblings.findIndex((item) => item.id === target.id)
  if (targetIndex < 0) return null
  return { folderId: folder.id, parentId, sortOrder: targetIndex + (position === 'after' ? 1 : 0) }
}

export function buildFolderRootMoveRequest(folders: readonly MaterialFolder[], folderId: string): ReorderMaterialFolderRequest | null {
  if (!folders.some((folder) => folder.id === folderId)) return null
  return {
    folderId,
    parentId: null,
    sortOrder: listMaterialFolderChildren(folders, null).filter((folder) => folder.id !== folderId).length,
  }
}

function wouldCreateCycle(folders: readonly MaterialFolder[], folderId: string, parentId: string | null): boolean {
  if (parentId === null) return false
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const visited = new Set<string>()
  let currentId: string | null = parentId
  while (currentId !== null) {
    if (currentId === folderId || visited.has(currentId)) return true
    visited.add(currentId)
    currentId = byId.get(currentId)?.parentId ?? null
  }
  return false
}

function compareFolders(left: MaterialFolder, right: MaterialFolder): number {
  return left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
}
