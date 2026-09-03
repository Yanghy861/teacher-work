import { isDraftKind, isDraftNoteMetadata, type DraftKind, type DraftNoteMetadata } from './draft-contracts'

export type NodeKind = 'course' | 'period' | 'lesson'

export type CourseMode = 'class' | 'one_to_one'

export type DraftStatus = 'draft' | 'saved'

export type AttendanceStatus = 'present' | 'leave' | 'absent'

export type CurrentLessonDecision =
  | { readonly type: 'keep' }
  | { readonly type: 'clear' }
  | { readonly type: 'set'; readonly lessonId: string }

export interface NodeRecord {
  readonly id: string
  readonly parentId: string | null
  readonly kind: NodeKind
  readonly title: string
  readonly lessonLabel?: string
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
  readonly endedAt: string | null
}

export interface CourseProgressRecord {
  readonly courseId: string
  readonly activePeriodId: string | null
  readonly currentLessonId: string | null
  readonly endedAt: string | null
  readonly updatedAt: string
}

export interface LessonSessionSummary {
  readonly lessonId: string
  readonly scheduledAt: string | null
  readonly scheduledOn?: string
  readonly durationMinutes: number | null
  readonly taughtConfirmedAt: string | null
  readonly attendanceRecordedAt: string | null
  readonly presentCount: number
  readonly leaveCount: number
  readonly absentCount: number
  readonly totalCount: number
}

export interface AttendanceStudentEntry {
  readonly studentId: string
  readonly studentName: string
  readonly status: AttendanceStatus | null
}

export interface LessonAttendanceRecord {
  readonly lessonId: string
  readonly scheduledAt: string | null
  readonly scheduledOn?: string
  readonly durationMinutes: number | null
  readonly taughtConfirmedAt: string | null
  readonly attendanceRecordedAt: string | null
  readonly students: readonly AttendanceStudentEntry[]
}

export type ConfirmLessonResult =
  | {
      readonly status: 'confirmed'
      readonly lessonId: string
      readonly taughtConfirmedAt: string
      readonly progress: CourseProgressRecord
    }
  | {
      readonly status: 'already_confirmed'
      readonly lessonId: string
      readonly taughtConfirmedAt: string
      readonly progress: CourseProgressRecord
    }

export interface NoteRecord {
  readonly id: string
  readonly studentId: string | null
  readonly lessonId: string | null
  readonly bodyMd: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly deletedAt: string | null
  readonly occurredOn?: string
  readonly noteKind?: 'manual' | 'manual_edit' | DraftKind
  readonly draftStatus?: DraftStatus
  readonly aiMetadata?: DraftNoteMetadata
}

export interface CoreOverview {
  readonly nodes: readonly NodeRecord[]
  readonly students: readonly StudentRecord[]
  readonly courseStudentLinks: readonly CourseStudentLink[]
  readonly notes: readonly NoteRecord[]
  readonly courseProgress: readonly CourseProgressRecord[]
  readonly lessonSessions: readonly LessonSessionSummary[]
}

export interface CreateCourseRequest {
  readonly title: string
  readonly mode: CourseMode
  readonly studentIds?: readonly string[]
}

export type CreateCourseSetupStudent =
  | { readonly type: 'existing'; readonly studentId: string }
  | { readonly type: 'new'; readonly name: string }

export interface CreateCourseSetupLesson {
  readonly title: string
  readonly scheduledAt: string | null
  readonly durationMinutes: number | null
}

export interface CreateCourseSetupRequest {
  readonly title: string
  readonly mode: CourseMode
  readonly students: readonly CreateCourseSetupStudent[]
  readonly periodTitle: string
  readonly lessons: readonly CreateCourseSetupLesson[]
}

export interface CreateCourseSetupResult {
  readonly course: NodeRecord
  readonly students: readonly StudentRecord[]
  readonly courseStudentLinks: readonly CourseStudentLink[]
  readonly period: NodeRecord
  readonly lessons: readonly NodeRecord[]
  readonly lessonSessions: readonly LessonSessionSummary[]
  readonly progress: CourseProgressRecord
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
  readonly name: string
  readonly courseId?: string
}

export interface CourseStudentRequest {
  readonly courseId: string
  readonly studentId: string
}

export interface SetCurrentLessonRequest {
  readonly courseId: string
  readonly lessonId: string
  readonly expectedCurrentLessonId: string | null
}

export interface ClearCurrentLessonRequest {
  readonly courseId: string
  readonly expectedCurrentLessonId: string | null
}

export interface StartPeriodRequest {
  readonly courseId: string
  readonly periodId: string
  readonly initialLessonId: string
}

export interface ConfirmLessonTaughtRequest {
  readonly courseId: string
  readonly lessonId: string
  readonly expectedCurrentLessonId: string | null
  readonly decision: CurrentLessonDecision
}

export interface CourseLessonRequest {
  readonly courseId: string
  readonly lessonId: string
}

export interface CourseIdRequest {
  readonly courseId: string
}

export interface UpdateLessonScheduleRequest {
  readonly lessonId: string
  readonly scheduledAt: string | null
  readonly durationMinutes?: number | null
}

export interface LessonIdRequest {
  readonly lessonId: string
}

export interface SaveLessonAttendanceRequest {
  readonly lessonId: string
  readonly entries: readonly {
    readonly studentId: string
    readonly status: AttendanceStatus
  }[]
}

export interface LocalDayUtcRange {
  readonly startUtc: string
  readonly endUtc: string
}

export interface CreateNoteRequest {
  readonly studentId: string
  readonly bodyMd: string
  readonly lessonId?: string
  readonly occurredOn?: string
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
    (value.lessonLabel === undefined || isNonEmptyString(value.lessonLabel)) &&
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
    isNonEmptyString(value.createdAt) &&
    (value.endedAt === null || isNonEmptyString(value.endedAt))
  )
}

export function isCourseProgressRecord(value: unknown): value is CourseProgressRecord {
  return (
    isRecord(value) &&
    isNonEmptyString(value.courseId) &&
    (value.activePeriodId === null || isNonEmptyString(value.activePeriodId)) &&
    (value.currentLessonId === null || isNonEmptyString(value.currentLessonId)) &&
    (value.endedAt === null || isNonEmptyString(value.endedAt)) &&
    isNonEmptyString(value.updatedAt)
  )
}

export function isLessonSessionSummary(value: unknown): value is LessonSessionSummary {
  return (
    isRecord(value) &&
    isNonEmptyString(value.lessonId) &&
    (value.scheduledAt === null || isUtcIsoString(value.scheduledAt)) &&
    (value.scheduledOn === undefined || isLocalDateString(value.scheduledOn)) &&
    (value.durationMinutes === null || isPositiveInteger(value.durationMinutes)) &&
    (value.taughtConfirmedAt === null || isUtcIsoString(value.taughtConfirmedAt)) &&
    (value.attendanceRecordedAt === null || isUtcIsoString(value.attendanceRecordedAt)) &&
    isNonNegativeInteger(value.presentCount) &&
    isNonNegativeInteger(value.leaveCount) &&
    isNonNegativeInteger(value.absentCount) &&
    isNonNegativeInteger(value.totalCount) &&
    value.presentCount + value.leaveCount + value.absentCount === value.totalCount
  )
}

export function isLessonAttendanceRecord(value: unknown): value is LessonAttendanceRecord {
  return (
    isRecord(value) &&
    isNonEmptyString(value.lessonId) &&
    (value.scheduledAt === null || isUtcIsoString(value.scheduledAt)) &&
    (value.scheduledOn === undefined || isLocalDateString(value.scheduledOn)) &&
    (value.durationMinutes === null || isPositiveInteger(value.durationMinutes)) &&
    (value.taughtConfirmedAt === null || isUtcIsoString(value.taughtConfirmedAt)) &&
    (value.attendanceRecordedAt === null || isUtcIsoString(value.attendanceRecordedAt)) &&
    Array.isArray(value.students) &&
    value.students.every((student) =>
      isRecord(student) &&
      isNonEmptyString(student.studentId) &&
      isNonEmptyString(student.studentName) &&
      (student.status === null || isAttendanceStatus(student.status)),
    )
  )
}

export function isConfirmLessonResult(value: unknown): value is ConfirmLessonResult {
  return (
    isRecord(value) &&
    (value.status === 'confirmed' || value.status === 'already_confirmed') &&
    isNonEmptyString(value.lessonId) &&
    isUtcIsoString(value.taughtConfirmedAt) &&
    isCourseProgressRecord(value.progress)
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
    (value.occurredOn === undefined || isLocalDateString(value.occurredOn)) &&
    (value.noteKind === undefined ||
      value.noteKind === 'manual' ||
      value.noteKind === 'manual_edit' ||
      isDraftKind(value.noteKind)) &&
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
    value.notes.every(isNoteRecord) &&
    Array.isArray(value.courseProgress) &&
    value.courseProgress.every(isCourseProgressRecord) &&
    Array.isArray(value.lessonSessions) &&
    value.lessonSessions.every(isLessonSessionSummary)
  )
}

export function isCreateCourseRequest(value: unknown): value is CreateCourseRequest {
  return (
    hasOnlyKeys(value, ['title', 'mode'], ['studentIds']) &&
    isNonEmptyString(value.title) &&
    isCourseMode(value.mode) &&
    (value.studentIds === undefined || isUniqueStringArray(value.studentIds))
  )
}

export function isCreateCourseSetupRequest(value: unknown): value is CreateCourseSetupRequest {
  return (
    hasOnlyKeys(value, ['title', 'mode', 'students', 'periodTitle', 'lessons']) &&
    isNonEmptyString(value.title) &&
    isCourseMode(value.mode) &&
    Array.isArray(value.students) &&
    value.students.every(isCreateCourseSetupStudent) &&
    isNonEmptyString(value.periodTitle) &&
    Array.isArray(value.lessons) &&
    value.lessons.length >= 1 &&
    value.lessons.length <= 100 &&
    value.lessons.every(isCreateCourseSetupLesson)
  )
}

export function isCreateCourseSetupResult(value: unknown): value is CreateCourseSetupResult {
  return (
    isRecord(value) &&
    isNodeRecord(value.course) &&
    Array.isArray(value.students) &&
    value.students.every(isStudentRecord) &&
    Array.isArray(value.courseStudentLinks) &&
    value.courseStudentLinks.every(isCourseStudentLink) &&
    isNodeRecord(value.period) &&
    Array.isArray(value.lessons) &&
    value.lessons.length >= 1 &&
    value.lessons.length <= 100 &&
    value.lessons.every(isNodeRecord) &&
    Array.isArray(value.lessonSessions) &&
    value.lessonSessions.every(isLessonSessionSummary) &&
    isCourseProgressRecord(value.progress)
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
    hasOnlyKeys(value, ['name'], ['courseId']) &&
    isNonEmptyString(value.name) &&
    (value.courseId === undefined || isNonEmptyString(value.courseId))
  )
}

export function isCourseStudentRequest(value: unknown): value is CourseStudentRequest {
  return hasOnlyKeys(value, ['courseId', 'studentId']) &&
    isNonEmptyString(value.courseId) && isNonEmptyString(value.studentId)
}

export function isSetCurrentLessonRequest(value: unknown): value is SetCurrentLessonRequest {
  return hasOnlyKeys(value, ['courseId', 'lessonId', 'expectedCurrentLessonId']) &&
    isNonEmptyString(value.courseId) && isNonEmptyString(value.lessonId) &&
    (value.expectedCurrentLessonId === null || isNonEmptyString(value.expectedCurrentLessonId))
}

export function isClearCurrentLessonRequest(value: unknown): value is ClearCurrentLessonRequest {
  return hasOnlyKeys(value, ['courseId', 'expectedCurrentLessonId']) &&
    isNonEmptyString(value.courseId) &&
    (value.expectedCurrentLessonId === null || isNonEmptyString(value.expectedCurrentLessonId))
}

export function isStartPeriodRequest(value: unknown): value is StartPeriodRequest {
  return hasOnlyKeys(value, ['courseId', 'periodId', 'initialLessonId']) &&
    isNonEmptyString(value.courseId) && isNonEmptyString(value.periodId) &&
    isNonEmptyString(value.initialLessonId)
}

export function isConfirmLessonTaughtRequest(value: unknown): value is ConfirmLessonTaughtRequest {
  return hasOnlyKeys(value, ['courseId', 'lessonId', 'expectedCurrentLessonId', 'decision']) &&
    isNonEmptyString(value.courseId) && isNonEmptyString(value.lessonId) &&
    (value.expectedCurrentLessonId === null || isNonEmptyString(value.expectedCurrentLessonId)) &&
    isCurrentLessonDecision(value.decision)
}

export function isCourseLessonRequest(value: unknown): value is CourseLessonRequest {
  return hasOnlyKeys(value, ['courseId', 'lessonId']) &&
    isNonEmptyString(value.courseId) && isNonEmptyString(value.lessonId)
}

export function isCourseIdRequest(value: unknown): value is CourseIdRequest {
  return hasOnlyKeys(value, ['courseId']) && isNonEmptyString(value.courseId)
}

export function isUpdateLessonScheduleRequest(value: unknown): value is UpdateLessonScheduleRequest {
  return hasOnlyKeys(value, ['lessonId', 'scheduledAt'], ['durationMinutes']) &&
    isNonEmptyString(value.lessonId) &&
    (value.scheduledAt === null || isUtcIsoString(value.scheduledAt)) &&
    (value.durationMinutes === undefined || value.durationMinutes === null ||
      isPositiveInteger(value.durationMinutes))
}

export function isLessonIdRequest(value: unknown): value is LessonIdRequest {
  return hasOnlyKeys(value, ['lessonId']) && isNonEmptyString(value.lessonId)
}

export function isSaveLessonAttendanceRequest(value: unknown): value is SaveLessonAttendanceRequest {
  return hasOnlyKeys(value, ['lessonId', 'entries']) &&
    isNonEmptyString(value.lessonId) && Array.isArray(value.entries) && value.entries.length > 0 &&
    value.entries.every((entry) => isRecord(entry) && hasOnlyKeys(entry, ['studentId', 'status']) &&
      isNonEmptyString(entry.studentId) && isAttendanceStatus(entry.status)) &&
    new Set(value.entries.map((entry) => entry.studentId)).size === value.entries.length
}

export function isCurrentLessonDecision(value: unknown): value is CurrentLessonDecision {
  return isRecord(value) && (
    (hasOnlyKeys(value, ['type']) && (value.type === 'keep' || value.type === 'clear')) ||
    (hasOnlyKeys(value, ['type', 'lessonId']) && value.type === 'set' && isNonEmptyString(value.lessonId))
  )
}

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return value === 'present' || value === 'leave' || value === 'absent'
}

export function isUtcIsoString(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}

export function isLocalDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
}

export function getLocalDayUtcRange(year: number, month: number, day: number): LocalDayUtcRange {
  if (![year, month, day].every(Number.isInteger) || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error('Local calendar day is invalid')
  }
  const start = new Date(year, month - 1, day, 0, 0, 0, 0)
  if (
    start.getFullYear() !== year ||
    start.getMonth() !== month - 1 ||
    start.getDate() !== day
  ) {
    throw new Error('Local calendar day is invalid')
  }
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0)
  return { startUtc: start.toISOString(), endUtc: end.toISOString() }
}

export function isCreateNoteRequest(value: unknown): value is CreateNoteRequest {
  return (
    hasOnlyKeys(value, ['studentId', 'bodyMd'], ['lessonId', 'occurredOn']) &&
    isNonEmptyString(value.studentId) &&
    typeof value.bodyMd === 'string' &&
    value.bodyMd.trim().length > 0 &&
    (value.lessonId === undefined || isNonEmptyString(value.lessonId)) &&
    (value.occurredOn === undefined || isLocalDateString(value.occurredOn))
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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isCreateCourseSetupStudent(value: unknown): value is CreateCourseSetupStudent {
  return isRecord(value) && (
    (hasOnlyKeys(value, ['type', 'studentId']) && value.type === 'existing' &&
      isNonEmptyString(value.studentId)) ||
    (hasOnlyKeys(value, ['type', 'name']) && value.type === 'new' &&
      isNonEmptyString(value.name) && Array.from(value.name.trim()).length <= 100)
  )
}

function isCreateCourseSetupLesson(value: unknown): value is CreateCourseSetupLesson {
  return isRecord(value) &&
    hasOnlyKeys(value, ['title', 'scheduledAt', 'durationMinutes']) &&
    isNonEmptyString(value.title) &&
    (value.scheduledAt === null || isUtcIsoString(value.scheduledAt)) &&
    (value.durationMinutes === null || isPositiveInteger(value.durationMinutes))
}

function isUniqueStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isNonEmptyString) && new Set(value).size === value.length
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
