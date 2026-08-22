import { isDraftKind, isDraftNoteMetadata, type DraftKind, type DraftNoteMetadata } from './draft-contracts'

export type NodeKind = 'course' | 'period' | 'lesson'

export type CourseMode = 'class' | 'one_to_one'

export type DraftStatus = 'draft' | 'saved'

export interface NodeRecord {
  readonly id: string
  readonly parentId: string | null
  readonly kind: NodeKind
  readonly title: string
  readonly courseMode: CourseMode | null
  readonly sortOrder: number
  readonly contentMd: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly deletedAt: string | null
}

export interface StudentRecord {
  readonly id: string
  readonly name: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly deletedAt: string | null
}

export interface CourseStudentLink {
  readonly courseId: string
  readonly studentId: string
  readonly createdAt: string
}

export interface NoteRecord {
  readonly id: string
  readonly studentId: string | null
  readonly lessonId: string | null
  readonly bodyMd: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly deletedAt: string | null
  readonly noteKind?: 'manual' | DraftKind
  readonly draftStatus?: DraftStatus
  readonly aiMetadata?: DraftNoteMetadata
}

export interface CoreOverview {
  readonly nodes: readonly NodeRecord[]
  readonly students: readonly StudentRecord[]
  readonly courseStudentLinks: readonly CourseStudentLink[]
  readonly notes: readonly NoteRecord[]
}

export interface CreateCourseRequest {
  readonly title: string
  readonly mode: CourseMode
}

export interface CreatePeriodRequest {
  readonly courseId: string
  readonly title: string
}

export interface CreateLessonRequest {
  readonly periodId: string
  readonly title: string
}

export interface CreateStudentRequest {
  readonly courseId: string
  readonly name: string
}

export interface CreateNoteRequest {
  readonly studentId: string
  readonly bodyMd: string
  readonly lessonId?: string
}

export interface UpdateNoteRequest {
  readonly noteId: string
  readonly bodyMd: string
}

export interface RenameNodeRequest {
  readonly nodeId: string
  readonly title: string
}

export interface MoveNodeRequest {
  readonly nodeId: string
  readonly parentId: string | null
}

export interface ReorderNodeRequest {
  readonly nodeId: string
  readonly sortOrder: number
}

export interface NodeIdRequest {
  readonly nodeId: string
}

export function isNodeRecord(value: unknown): value is NodeRecord {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    (value.parentId === null || isNonEmptyString(value.parentId)) &&
    isNodeKind(value.kind) &&
    isNonEmptyString(value.title) &&
    (value.courseMode === null || isCourseMode(value.courseMode)) &&
    isNonNegativeInteger(value.sortOrder) &&
    typeof value.contentMd === 'string' &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt) &&
    (value.deletedAt === null || isNonEmptyString(value.deletedAt))
  )
}

export function isStudentRecord(value: unknown): value is StudentRecord {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt) &&
    (value.deletedAt === null || isNonEmptyString(value.deletedAt))
  )
}

export function isCourseStudentLink(value: unknown): value is CourseStudentLink {
  return (
    isRecord(value) &&
    isNonEmptyString(value.courseId) &&
    isNonEmptyString(value.studentId) &&
    isNonEmptyString(value.createdAt)
  )
}

export function isNoteRecord(value: unknown): value is NoteRecord {
  const hasValidLifecycle =
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ('noteKind' in value && isDraftKind(value.noteKind)
      ? 'draftStatus' in value && isDraftStatus(value.draftStatus)
      : !('draftStatus' in value) || value.draftStatus === undefined)
  return (
    isRecord(value) &&
    hasValidLifecycle &&
    isNonEmptyString(value.id) &&
    (value.studentId === null || isNonEmptyString(value.studentId)) &&
    (value.lessonId === null || isNonEmptyString(value.lessonId)) &&
    typeof value.bodyMd === 'string' &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt) &&
    (value.deletedAt === null || isNonEmptyString(value.deletedAt)) &&
    (value.noteKind === undefined || value.noteKind === 'manual' || isDraftKind(value.noteKind)) &&
    (value.aiMetadata === undefined || isDraftNoteMetadata(value.aiMetadata))
  )
}

export function isDraftStatus(value: unknown): value is DraftStatus {
  return value === 'draft' || value === 'saved'
}

export function isCoreOverview(value: unknown): value is CoreOverview {
  return (
    isRecord(value) &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isNodeRecord) &&
    Array.isArray(value.students) &&
    value.students.every(isStudentRecord) &&
    Array.isArray(value.courseStudentLinks) &&
    value.courseStudentLinks.every(isCourseStudentLink) &&
    Array.isArray(value.notes) &&
    value.notes.every(isNoteRecord)
  )
}

export function isCreateCourseRequest(value: unknown): value is CreateCourseRequest {
  return (
    hasOnlyKeys(value, ['title', 'mode']) &&
    isNonEmptyString(value.title) &&
    isCourseMode(value.mode)
  )
}

export function isCreatePeriodRequest(value: unknown): value is CreatePeriodRequest {
  return (
    hasOnlyKeys(value, ['courseId', 'title']) &&
    isNonEmptyString(value.courseId) &&
    isNonEmptyString(value.title)
  )
}

export function isCreateLessonRequest(value: unknown): value is CreateLessonRequest {
  return (
    hasOnlyKeys(value, ['periodId', 'title']) &&
    isNonEmptyString(value.periodId) &&
    isNonEmptyString(value.title)
  )
}

export function isCreateStudentRequest(value: unknown): value is CreateStudentRequest {
  return (
    hasOnlyKeys(value, ['courseId', 'name']) &&
    isNonEmptyString(value.courseId) &&
    isNonEmptyString(value.name)
  )
}

export function isCreateNoteRequest(value: unknown): value is CreateNoteRequest {
  return (
    hasOnlyKeys(value, ['studentId', 'bodyMd'], ['lessonId']) &&
    isNonEmptyString(value.studentId) &&
    typeof value.bodyMd === 'string' &&
    value.bodyMd.trim().length > 0 &&
    (value.lessonId === undefined || isNonEmptyString(value.lessonId))
  )
}

export function isUpdateNoteRequest(value: unknown): value is UpdateNoteRequest {
  return (
    hasOnlyKeys(value, ['noteId', 'bodyMd']) &&
    isNonEmptyString(value.noteId) &&
    typeof value.bodyMd === 'string' &&
    value.bodyMd.trim().length > 0
  )
}

export function isRenameNodeRequest(value: unknown): value is RenameNodeRequest {
  return (
    hasOnlyKeys(value, ['nodeId', 'title']) &&
    isNonEmptyString(value.nodeId) &&
    isNonEmptyString(value.title)
  )
}

export function isMoveNodeRequest(value: unknown): value is MoveNodeRequest {
  return (
    hasOnlyKeys(value, ['nodeId', 'parentId']) &&
    isNonEmptyString(value.nodeId) &&
    (value.parentId === null || isNonEmptyString(value.parentId))
  )
}

export function isReorderNodeRequest(value: unknown): value is ReorderNodeRequest {
  return (
    hasOnlyKeys(value, ['nodeId', 'sortOrder']) &&
    isNonEmptyString(value.nodeId) &&
    isNonNegativeInteger(value.sortOrder)
  )
}

export function isNodeIdRequest(value: unknown): value is NodeIdRequest {
  return hasOnlyKeys(value, ['nodeId']) && isNonEmptyString(value.nodeId)
}

export function isNodeKind(value: unknown): value is NodeKind {
  return value === 'course' || value === 'period' || value === 'lesson'
}

export function isCourseMode(value: unknown): value is CourseMode {
  return value === 'class' || value === 'one_to_one'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function hasOnlyKeys(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false
  }
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  const keys = Object.keys(value)
  return (
    requiredKeys.every((key) => keys.includes(key)) &&
    keys.every((key) => allowed.has(key))
  )
}
