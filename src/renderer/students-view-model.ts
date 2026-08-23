import type {
  CoreOverview,
  CourseStudentLink,
  NodeRecord,
  NoteRecord,
  StudentRecord,
} from '../shared/core-contracts'
import { getLessonNumber } from './course-view-model'

export interface StudentCourseSummary {
  readonly course: NodeRecord
  readonly link: CourseStudentLink
  readonly historical: boolean
  readonly historyReason: 'student_ended' | 'course_ended' | null
}

export interface StudentSummary {
  readonly student: StudentRecord
  readonly activeCourses: readonly StudentCourseSummary[]
  readonly historicalCourses: readonly StudentCourseSummary[]
  readonly manualNotes: readonly NoteRecord[]
  readonly latestManualNote: NoteRecord | null
}

export interface StudentLessonOption {
  readonly lesson: NodeRecord
  readonly period: NodeRecord
  readonly course: NodeRecord
  readonly label: string
}

export function buildStudentSummaries(overview: CoreOverview): StudentSummary[] {
  const courseById = new Map(
    overview.nodes.filter((node) => node.kind === 'course').map((course) => [course.id, course]),
  )
  const endedCourseIds = new Set(
    overview.courseProgress
      .filter((progress) => progress.endedAt !== null)
      .map((progress) => progress.courseId),
  )
  return [...overview.students]
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN') || left.id.localeCompare(right.id))
    .map((student) => {
      const courses = overview.courseStudentLinks
        .filter((link) => link.studentId === student.id)
        .flatMap((link): StudentCourseSummary[] => {
          const course = courseById.get(link.courseId)
          if (course === undefined) return []
          const studentEnded = link.endedAt !== null
          const courseEnded = endedCourseIds.has(course.id)
          return [{
            course,
            link,
            historical: studentEnded || courseEnded,
            historyReason: studentEnded ? 'student_ended' : courseEnded ? 'course_ended' : null,
          }]
        })
      const manualNotes = overview.notes
        .filter((note) =>
          note.studentId === student.id &&
          note.deletedAt === null &&
          (note.noteKind === undefined || note.noteKind === 'manual'),
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id))
      return {
        student,
        activeCourses: courses.filter((course) => !course.historical),
        historicalCourses: courses.filter((course) => course.historical),
        manualNotes,
        latestManualNote: manualNotes[0] ?? null,
      }
    })
}

export function listStudentLessonOptions(
  overview: CoreOverview,
  summary: StudentSummary,
): StudentLessonOption[] {
  const relatedCourseIds = new Set([
    ...summary.activeCourses.map((course) => course.course.id),
    ...summary.historicalCourses.map((course) => course.course.id),
  ])
  const periods = overview.nodes
    .filter((node) => node.kind === 'period' && node.parentId !== null && relatedCourseIds.has(node.parentId))
    .sort(compareNodes)
  const courseById = new Map(
    [...summary.activeCourses, ...summary.historicalCourses].map((item) => [item.course.id, item.course]),
  )
  return periods.flatMap((period) => {
    const course = period.parentId === null ? undefined : courseById.get(period.parentId)
    if (course === undefined) return []
    return overview.nodes
      .filter((node) => node.kind === 'lesson' && node.parentId === period.id)
      .sort(compareNodes)
      .map((lesson) => ({
        lesson,
        period,
        course,
        label: `${course.title} · ${period.title} · 第 ${getLessonNumber(overview.nodes, period.id, lesson.id)} 课 ${lesson.title}`,
      }))
  })
}

function compareNodes(left: NodeRecord, right: NodeRecord): number {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
}
