import type { CoreOverview, NoteRecord } from '../shared/core-contracts'
import type { LessonPrepContext } from './lesson-prep-context'

export interface DraftInboxEntry {
  readonly note: NoteRecord
  readonly context: LessonPrepContext | null
  readonly courseTitle: string
  readonly lessonTitle: string
}

export function listLessonAiResults(
  overview: CoreOverview | null,
  lessonId: string,
): NoteRecord[] {
  if (overview === null) return []
  return overview.notes
    .filter((note) =>
      note.deletedAt === null &&
      note.lessonId === lessonId &&
      note.noteKind !== undefined &&
      note.noteKind !== 'manual' &&
      note.draftStatus !== undefined,
    )
    .sort(compareMostRecentlyUpdated)
}

export function listDraftInbox(overview: CoreOverview | null): DraftInboxEntry[] {
  if (overview === null) return []
  return overview.notes
    .filter((note) => note.deletedAt === null && note.draftStatus === 'draft')
    .sort(compareMostRecentlyUpdated)
    .map((note) => {
      const context = note.lessonId === null
        ? null
        : createPrepContextFromOverview(overview, note.lessonId, note.studentId ?? undefined)
      return {
        note,
        context,
        courseTitle: context?.courseTitle ?? note.aiMetadata?.lesson?.courseTitle ?? '课程不可用',
        lessonTitle: context?.lessonTitle ?? note.aiMetadata?.lesson?.lessonTitle ?? '课次不可用',
      }
    })
}

export function createPrepContextFromOverview(
  overview: CoreOverview,
  lessonId: string,
  preferredStudentId?: string,
): LessonPrepContext | null {
  const lesson = overview.nodes.find((node) => node.id === lessonId && node.kind === 'lesson')
  if (lesson === undefined || lesson.parentId === null) return null
  const period = overview.nodes.find((node) => node.id === lesson.parentId && node.kind === 'period')
  if (period === undefined || period.parentId === null) return null
  const course = overview.nodes.find((node) => node.id === period.parentId && node.kind === 'course')
  if (course === undefined) return null

  const linkedStudentIds = new Set(overview.courseStudentLinks
    .filter((link) => link.courseId === course.id)
    .map((link) => link.studentId))
  const students = overview.students.filter((student) => linkedStudentIds.has(student.id))
  const preferredStudent = students.find((student) => student.id === preferredStudentId)
  const selectedStudent = preferredStudent ?? students[0]
  const courseMode = course.courseMode ?? 'class'

  return {
    courseId: course.id,
    courseTitle: course.title,
    courseMode,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    ...(lesson.lessonLabel === undefined ? {} : { lessonLabel: lesson.lessonLabel }),
    periodTitle: period.title,
    ...(courseMode === 'one_to_one' && selectedStudent !== undefined
      ? { studentId: selectedStudent.id }
      : {}),
    studentNames: students.map((student) => student.name),
  }
}

function compareMostRecentlyUpdated(left: NoteRecord, right: NoteRecord): number {
  return right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)
}
