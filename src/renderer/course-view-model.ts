import type {
  CoreOverview,
  CourseProgressRecord,
  CourseStudentLink,
  CurrentLessonDecision,
  LessonSessionSummary,
  NodeRecord,
  NoteRecord,
  StudentRecord,
} from '../shared/core-contracts'
import { getLocalDayUtcRange } from '../shared/core-contracts'

export type CoursePrimaryAction =
  | 'continue_prep'
  | 'start_prep'
  | 'create_first'
  | 'select_next'
  | 'decide_next'
  | 'reopen'

export interface CourseSummary {
  readonly course: NodeRecord
  readonly progress: CourseProgressRecord | null
  readonly periods: readonly NodeRecord[]
  readonly lessons: readonly NodeRecord[]
  readonly currentPeriod: NodeRecord | null
  readonly currentLesson: NodeRecord | null
  readonly activeStudents: readonly StudentRecord[]
  readonly historicalStudents: readonly StudentRecord[]
  readonly links: readonly CourseStudentLink[]
  readonly currentDraft: NoteRecord | null
  readonly primaryAction: CoursePrimaryAction
  readonly ended: boolean
}

export interface TodayAttendanceItem {
  readonly course: NodeRecord
  readonly period: NodeRecord
  readonly lesson: NodeRecord
  readonly session: LessonSessionSummary
  readonly activeStudentCount: number
  readonly lessonNumber: number
}

export function buildCourseSummaries(overview: CoreOverview): CourseSummary[] {
  const progressByCourse = new Map(overview.courseProgress.map((progress) => [progress.courseId, progress]))
  const studentById = new Map(overview.students.map((student) => [student.id, student]))
  return sortNodes(overview.nodes.filter((node) => node.kind === 'course')).map((course) => {
    const periods = sortNodes(overview.nodes.filter(
      (node) => node.kind === 'period' && node.parentId === course.id,
    ))
    const lessons = periods.flatMap((period) => sortNodes(overview.nodes.filter(
      (node) => node.kind === 'lesson' && node.parentId === period.id,
    )))
    const links = overview.courseStudentLinks.filter((link) => link.courseId === course.id)
    const activeStudents = links
      .filter((link) => link.endedAt === null)
      .flatMap((link) => studentById.get(link.studentId) ?? [])
    const historicalStudents = links
      .filter((link) => link.endedAt !== null)
      .flatMap((link) => studentById.get(link.studentId) ?? [])
    const progress = progressByCourse.get(course.id) ?? null
    const currentPeriod = periods.find((period) => period.id === progress?.activePeriodId) ?? null
    const currentLesson = lessons.find((lesson) => lesson.id === progress?.currentLessonId) ?? null
    const currentDraft = currentLesson === null
      ? null
      : overview.notes
        .filter((note) =>
          note.lessonId === currentLesson.id &&
          note.deletedAt === null &&
          note.draftStatus === 'draft',
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
    const ended = progress?.endedAt !== null && progress?.endedAt !== undefined
    return {
      course,
      progress,
      periods,
      lessons,
      currentPeriod,
      currentLesson,
      activeStudents,
      historicalStudents,
      links,
      currentDraft,
      primaryAction: getPrimaryAction(ended, lessons, progress, currentLesson, currentDraft),
      ended,
    }
  })
}

export function listTodayAttendance(
  overview: CoreOverview,
  now = new Date(),
): TodayAttendanceItem[] {
  const summaries = buildCourseSummaries(overview)
  const summaryByCourse = new Map(summaries.map((summary) => [summary.course.id, summary]))
  const periodById = new Map(
    overview.nodes.filter((node) => node.kind === 'period').map((period) => [period.id, period]),
  )
  const lessonById = new Map(
    overview.nodes.filter((node) => node.kind === 'lesson').map((lesson) => [lesson.id, lesson]),
  )
  const range = getLocalDayUtcRange(now.getFullYear(), now.getMonth() + 1, now.getDate())
  return overview.lessonSessions.flatMap((session) => {
    if (
      session.scheduledAt === null ||
      session.scheduledAt < range.startUtc ||
      session.scheduledAt >= range.endUtc
    ) return []
    const lesson = lessonById.get(session.lessonId)
    if (lesson?.parentId === null || lesson === undefined) return []
    const period = periodById.get(lesson.parentId)
    if (period?.parentId === null || period === undefined) return []
    const summary = summaryByCourse.get(period.parentId)
    if (summary === undefined || summary.ended) return []
    return [{
      course: summary.course,
      period,
      lesson,
      session,
      activeStudentCount: summary.activeStudents.length,
      lessonNumber: getLessonNumber(overview.nodes, period.id, lesson.id),
    }]
  }).sort((left, right) =>
    (left.session.scheduledAt ?? '').localeCompare(right.session.scheduledAt ?? ''),
  )
}

export function suggestConfirmedDecision(
  overview: CoreOverview,
  summary: CourseSummary,
  lessonId: string,
): CurrentLessonDecision {
  if (summary.currentLesson?.id !== lessonId) return { type: 'keep' }
  const lesson = summary.lessons.find((candidate) => candidate.id === lessonId)
  if (lesson?.parentId === null || lesson === undefined) return { type: 'clear' }
  const taught = new Set(
    overview.lessonSessions
      .filter((session) => session.taughtConfirmedAt !== null)
      .map((session) => session.lessonId),
  )
  const periodLessons = sortNodes(summary.lessons.filter(
    (candidate) => candidate.parentId === lesson.parentId,
  ))
  const lessonIndex = periodLessons.findIndex((candidate) => candidate.id === lessonId)
  const next = periodLessons.slice(lessonIndex + 1).find((candidate) => !taught.has(candidate.id))
  return next === undefined ? { type: 'clear' } : { type: 'set', lessonId: next.id }
}

export function listValidCurrentLessons(
  overview: CoreOverview,
  summary: CourseSummary,
  excludedLessonId?: string,
): NodeRecord[] {
  const taught = new Set(
    overview.lessonSessions
      .filter((session) => session.taughtConfirmedAt !== null)
      .map((session) => session.lessonId),
  )
  return summary.lessons.filter(
    (lesson) => lesson.id !== excludedLessonId && !taught.has(lesson.id),
  )
}

export function getLessonNumber(
  nodes: readonly NodeRecord[],
  periodId: string,
  lessonId: string,
): number {
  return sortNodes(nodes.filter(
    (node) => node.kind === 'lesson' && node.parentId === periodId,
  )).findIndex((lesson) => lesson.id === lessonId) + 1
}

export function formatLocalDateTime(utcIso: string | null): string {
  if (utcIso === null) return '未排时间'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(utcIso))
}

export function formatLocalDateOnly(localDate: string | null | undefined): string {
  if (localDate === null || localDate === undefined) return '未排日期'
  const [year, month, day] = localDate.split('-').map(Number)
  if (![year, month, day].every(Number.isInteger)) return '日期无效'
  return `${year}年${month}月${day}日`
}

export function toDateTimeLocalValue(utcIso: string | null): string {
  if (utcIso === null) return ''
  const value = new Date(utcIso)
  const pad = (part: number): string => part.toString().padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`
}

export function localDateTimeToUtc(value: string): string | null {
  if (value === '') return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error('上课时间无效。')
  return parsed.toISOString()
}

function getPrimaryAction(
  ended: boolean,
  lessons: readonly NodeRecord[],
  progress: CourseProgressRecord | null,
  currentLesson: NodeRecord | null,
  currentDraft: NoteRecord | null,
): CoursePrimaryAction {
  if (ended) return 'reopen'
  if (lessons.length === 0) return 'create_first'
  if (currentLesson !== null) return currentDraft === null ? 'start_prep' : 'continue_prep'
  return progress?.activePeriodId === null || progress === null ? 'select_next' : 'decide_next'
}

function sortNodes(nodes: readonly NodeRecord[]): NodeRecord[] {
  return [...nodes].sort((left, right) =>
    left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
  )
}
