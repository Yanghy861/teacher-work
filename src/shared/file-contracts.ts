export interface ManagedFileRecord {
  readonly id: string
  readonly originalName: string
  readonly sizeBytes: number
  readonly mimeType: string
  readonly originFileId: string | null
  readonly mtimeMs: number | null
  readonly contentHash: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly deletedAt: string | null
}

export type FileLinkTarget = 'lesson' | 'student'

export interface ManagedFileLink {
  readonly fileId: string
  readonly targetType: FileLinkTarget
  readonly targetId: string
  readonly createdAt: string
}

export interface ManagedFileOverview {
  readonly files: readonly ManagedFileRecord[]
  readonly links: readonly ManagedFileLink[]
}

export interface ManagedFileRefreshResult {
  readonly file: ManagedFileRecord
  readonly contentChanged: boolean
  readonly hashComputed: boolean
}

export interface ManagedFileContentChanged {
  readonly fileId: string
  readonly contentChanged: true
  readonly file: ManagedFileRecord
}

export interface FileIdRequest {
  readonly fileId: string
}

export interface CopyFileToLessonRequest {
  readonly fileId: string
  readonly lessonId: string
}

export interface CopyFileToStudentRequest {
  readonly fileId: string
  readonly studentId: string
}

export interface FileActionResult {
  readonly accepted: true
}

export function isManagedFileRecord(value: unknown): value is ManagedFileRecord {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.originalName) &&
    isNonNegativeNumber(value.sizeBytes) &&
    isNonEmptyString(value.mimeType) &&
    (value.originFileId === null || isNonEmptyString(value.originFileId)) &&
    (value.mtimeMs === null || isFiniteNumber(value.mtimeMs)) &&
    (value.contentHash === null || isNonEmptyString(value.contentHash)) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt) &&
    (value.deletedAt === null || isNonEmptyString(value.deletedAt))
  )
}

export function isManagedFileLink(value: unknown): value is ManagedFileLink {
  return (
    isRecord(value) &&
    isNonEmptyString(value.fileId) &&
    (value.targetType === 'lesson' || value.targetType === 'student') &&
    isNonEmptyString(value.targetId) &&
    isNonEmptyString(value.createdAt)
  )
}

export function isManagedFileOverview(value: unknown): value is ManagedFileOverview {
  return (
    isRecord(value) &&
    Array.isArray(value.files) &&
    value.files.every(isManagedFileRecord) &&
    Array.isArray(value.links) &&
    value.links.every(isManagedFileLink)
  )
}

export function isFileIdRequest(value: unknown): value is FileIdRequest {
  return hasOnlyKeys(value, ['fileId']) && isNonEmptyString(value.fileId)
}

export function isCopyFileToLessonRequest(value: unknown): value is CopyFileToLessonRequest {
  return (
    hasOnlyKeys(value, ['fileId', 'lessonId']) &&
    isNonEmptyString(value.fileId) &&
    isNonEmptyString(value.lessonId)
  )
}

export function isCopyFileToStudentRequest(value: unknown): value is CopyFileToStudentRequest {
  return (
    hasOnlyKeys(value, ['fileId', 'studentId']) &&
    isNonEmptyString(value.fileId) &&
    isNonEmptyString(value.studentId)
  )
}

export function isFileActionResult(value: unknown): value is FileActionResult {
  return isRecord(value) && value.accepted === true
}

export function isNullableManagedFileRecord(value: unknown): value is ManagedFileRecord | null {
  return value === null || isManagedFileRecord(value)
}

export function isManagedFileRefreshResult(value: unknown): value is ManagedFileRefreshResult {
  return (
    isRecord(value) &&
    isManagedFileRecord(value.file) &&
    typeof value.contentChanged === 'boolean' &&
    typeof value.hashComputed === 'boolean'
  )
}

export function isManagedFileContentChanged(value: unknown): value is ManagedFileContentChanged {
  return (
    isRecord(value) &&
    isNonEmptyString(value.fileId) &&
    value.contentChanged === true &&
    isManagedFileRecord(value.file)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasOnlyKeys(
  value: unknown,
  requiredKeys: readonly string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false
  }
  const keys = Object.keys(value)
  return requiredKeys.every((key) => keys.includes(key)) && keys.every((key) => requiredKeys.includes(key))
}
