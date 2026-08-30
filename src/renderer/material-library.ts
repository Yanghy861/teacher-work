import type { ManagedFileOverview, ManagedFileRecord } from '../shared/file-contracts'

export type MaterialLibraryView = 'all' | 'recent' | 'documents' | 'images' | 'other'

export function listReusableMaterialFiles(overview: ManagedFileOverview): ManagedFileRecord[] {
  const linkedFileIds = new Set(overview.links.map((link) => link.fileId))
  return overview.files.filter((file) => file.deletedAt === null && !linkedFileIds.has(file.id))
}

export function listRemovedMaterialFiles(overview: ManagedFileOverview): ManagedFileRecord[] {
  const linkedFileIds = new Set(overview.links.map((link) => link.fileId))
  return overview.files.filter((file) => file.deletedAt !== null && !linkedFileIds.has(file.id))
}

export function filterMaterialLibraryFiles(
  files: readonly ManagedFileRecord[],
  view: MaterialLibraryView,
  query: string,
): ManagedFileRecord[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const matching = files.filter((file) => {
    if (normalizedQuery !== '' && !file.originalName.toLocaleLowerCase('zh-CN').includes(normalizedQuery)) {
      return false
    }
    if (view === 'documents') return materialKind(file) === 'documents'
    if (view === 'images') return materialKind(file) === 'images'
    if (view === 'other') return materialKind(file) === 'other'
    return true
  })
  if (view !== 'recent') return matching
  return [...matching].sort((left, right) => {
    const createdAtOrder = right.createdAt.localeCompare(left.createdAt)
    return createdAtOrder !== 0 ? createdAtOrder : right.id.localeCompare(left.id)
  })
}

export function materialKind(file: ManagedFileRecord): 'documents' | 'images' | 'other' {
  if (file.mimeType.startsWith('image/')) return 'images'
  if (
    file.mimeType.startsWith('text/') ||
    file.mimeType.includes('pdf') ||
    file.mimeType.includes('word') ||
    file.mimeType.includes('presentation') ||
    file.mimeType.includes('spreadsheet')
  ) {
    return 'documents'
  }
  return 'other'
}
