import type {
  AttendanceStatus,
  LessonAttendanceRecord,
} from '../../shared/core-contracts'
import { isAttendanceStatus, isUtcIsoString } from '../../shared/core-contracts'
import type { SqliteDatabase } from '../db/migrations'

export type AttendanceErrorCode =
  | 'INVALID_LESSON'
  | 'INVALID_SCHEDULE'
  | 'INVALID_ATTENDANCE'
  | 'EMPTY_ATTENDANCE'
  | 'ATTENDANCE_ROSTER_CHANGED'

export class AttendanceError extends Error {
  readonly code: AttendanceErrorCode

  constructor(code: AttendanceErrorCode, message: string) {
    super(message)
    this.name = 'AttendanceError'
    this.code = code
  }
}

export interface AttendanceServiceOptions {
  readonly now?: () => string
}

interface LessonContextRow {
  readonly lesson_id: string
  readonly course_id: string
}

interface SessionStateRow {
  readonly scheduled_at: string | null
  readonly scheduled_on: string | null
  readonly duration_minutes: number | null
  readonly taught_confirmed_at: string | null
  readonly attendance_recorded_at: string | null
}

interface AttendanceStudentRow {
  readonly student_id: string
  readonly student_name: string
  readonly status: AttendanceStatus | null
}

export class AttendanceService {
  private readonly now: () => string

  constructor(
    private readonly database: SqliteDatabase,
    options: AttendanceServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  updateLessonSchedule(
    lessonId: string,
    scheduledAt: string | null,
    durationMinutes?: number | null,
  ): LessonAttendanceRecord {
    if (scheduledAt !== null && !isUtcIsoString(scheduledAt)) {
      throw new AttendanceError('INVALID_SCHEDULE', '上课时间必须是 UTC ISO 8601 时间。')
    }
    if (
      durationMinutes !== undefined &&
      durationMinutes !== null &&
      (!Number.isInteger(durationMinutes) || durationMinutes <= 0)
    ) {
      throw new AttendanceError('INVALID_SCHEDULE', '课程时长必须是正整数分钟。')
    }
    return this.transaction(() => {
      this.requireLessonContext(lessonId)
      const updatedAt = this.now()
      this.ensureSession(lessonId, updatedAt)
      this.database
        .prepare(
          `UPDATE lesson_sessions
              SET scheduled_at = ?,
                  duration_minutes = CASE WHEN ? = 1 THEN ? ELSE duration_minutes END,
                  updated_at = ?
            WHERE lesson_id = ?`,
        )
        .run(scheduledAt, durationMinutes === undefined ? 0 : 1, durationMinutes ?? null, updatedAt, lessonId)
      return this.getLessonAttendance(lessonId)
    })
  }

  getLessonAttendance(lessonId: string): LessonAttendanceRecord {
    const context = this.requireLessonContext(lessonId)
    const session = this.findSession(lessonId)
    const rows = session?.attendance_recorded_at === null || session === undefined
      ? this.listActiveCourseStudents(context.course_id)
      : this.listSnapshotStudents(lessonId)
    return {
      lessonId,
      scheduledAt: session?.scheduled_at ?? null,
      ...(session?.scheduled_on === null || session === undefined ? {} : { scheduledOn: session.scheduled_on }),
      durationMinutes: session?.duration_minutes ?? null,
      taughtConfirmedAt: session?.taught_confirmed_at ?? null,
      attendanceRecordedAt: session?.attendance_recorded_at ?? null,
      students: rows.map((row) => ({
        studentId: row.student_id,
        studentName: row.student_name,
        status: row.status,
      })),
    }
  }

  saveLessonAttendance(
    lessonId: string,
    entries: readonly { readonly studentId: string; readonly status: AttendanceStatus }[],
  ): LessonAttendanceRecord {
    if (entries.length === 0) {
      throw new AttendanceError('EMPTY_ATTENDANCE', '课程没有可保存点名的学生。')
    }
    if (
      entries.some((entry) => !entry.studentId.trim() || !isAttendanceStatus(entry.status)) ||
      new Set(entries.map((entry) => entry.studentId)).size !== entries.length
    ) {
      throw new AttendanceError('INVALID_ATTENDANCE', '点名名单或状态无效。')
    }

    return this.transaction(() => {
      const context = this.requireLessonContext(lessonId)
      const session = this.findSession(lessonId)
      const expectedIds = session?.attendance_recorded_at === null || session === undefined
        ? this.listActiveCourseStudents(context.course_id).map((row) => row.student_id)
        : this.listSnapshotStudents(lessonId).map((row) => row.student_id)
      const submittedIds = entries.map((entry) => entry.studentId)
      if (!sameStringSet(expectedIds, submittedIds)) {
        throw new AttendanceError(
          'ATTENDANCE_ROSTER_CHANGED',
          '课程学生名单已经变化，请重新打开点名。',
        )
      }

      const updatedAt = this.now()
      this.ensureSession(lessonId, updatedAt)
      this.database
        .prepare('DELETE FROM lesson_attendance WHERE lesson_id = ?')
        .run(lessonId)
      const insert = this.database.prepare(
        `INSERT INTO lesson_attendance (lesson_id, student_id, status, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      entries.forEach((entry) => {
        insert.run(lessonId, entry.studentId, entry.status, updatedAt)
      })
      this.database
        .prepare(
          `UPDATE lesson_sessions
              SET attendance_recorded_at = ?, updated_at = ?
            WHERE lesson_id = ?`,
        )
        .run(updatedAt, updatedAt, lessonId)
      return this.getLessonAttendance(lessonId)
    })
  }

  private requireLessonContext(lessonId: string): LessonContextRow {
    const row = this.database
      .prepare(
        `SELECT lesson.id AS lesson_id, course.id AS course_id
           FROM nodes AS lesson
           JOIN nodes AS period
             ON period.id = lesson.parent_id
            AND period.kind = 'period'
            AND period.deleted_at IS NULL
           JOIN nodes AS course
             ON course.id = period.parent_id
            AND course.kind = 'course'
            AND course.deleted_at IS NULL
          WHERE lesson.id = ?
            AND lesson.kind = 'lesson'
            AND lesson.deleted_at IS NULL`,
      )
      .get(lessonId) as LessonContextRow | undefined
    if (row === undefined) {
      throw new AttendanceError('INVALID_LESSON', '课次不存在或缺少有效课程上下文。')
    }
    return row
  }

  private listActiveCourseStudents(courseId: string): AttendanceStudentRow[] {
    return this.database
      .prepare(
        `SELECT student.id AS student_id, student.name AS student_name, NULL AS status
           FROM course_students AS link
           JOIN students AS student
             ON student.id = link.student_id
            AND student.deleted_at IS NULL
          WHERE link.course_id = ?
            AND link.ended_at IS NULL
          ORDER BY link.created_at, student.id`,
      )
      .all(courseId) as AttendanceStudentRow[]
  }

  private listSnapshotStudents(lessonId: string): AttendanceStudentRow[] {
    return this.database
      .prepare(
        `SELECT student.id AS student_id, student.name AS student_name, attendance.status
           FROM lesson_attendance AS attendance
           JOIN students AS student ON student.id = attendance.student_id
          WHERE attendance.lesson_id = ?
          ORDER BY attendance.updated_at, student.id`,
      )
      .all(lessonId) as AttendanceStudentRow[]
  }

  private findSession(lessonId: string): SessionStateRow | undefined {
    return this.database
      .prepare(
        `SELECT scheduled_at, scheduled_on, duration_minutes, taught_confirmed_at, attendance_recorded_at
           FROM lesson_sessions WHERE lesson_id = ?`,
      )
      .get(lessonId) as SessionStateRow | undefined
  }

  private ensureSession(lessonId: string, updatedAt: string): void {
    this.database
      .prepare(
        `INSERT INTO lesson_sessions
           (lesson_id, scheduled_at, taught_confirmed_at, attendance_recorded_at, updated_at)
         VALUES (?, NULL, NULL, NULL, ?)
         ON CONFLICT(lesson_id) DO NOTHING`,
      )
      .run(lessonId, updatedAt)
  }

  private transaction<T>(callback: () => T): T {
    return this.database.transaction(callback).immediate()
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((value) => rightSet.has(value))
}
