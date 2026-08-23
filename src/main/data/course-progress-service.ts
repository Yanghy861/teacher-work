import type {
  ConfirmLessonResult,
  CourseProgressRecord,
  CurrentLessonDecision,
  LessonSessionSummary,
} from '../../shared/core-contracts'
import type { SqliteDatabase } from '../db/migrations'

export type CourseProgressErrorCode =
  | 'COURSE_NOT_FOUND'
  | 'COURSE_ENDED'
  | 'INVALID_PERIOD'
  | 'INVALID_LESSON'
  | 'LESSON_ALREADY_TAUGHT'
  | 'PROGRESS_CONFLICT'
  | 'INVALID_DECISION'

export class CourseProgressError extends Error {
  readonly code: CourseProgressErrorCode

  constructor(code: CourseProgressErrorCode, message: string) {
    super(message)
    this.name = 'CourseProgressError'
    this.code = code
  }
}

export interface CourseProgressServiceOptions {
  readonly now?: () => string
}

interface ProgressRow {
  readonly course_id: string
  readonly active_period_id: string | null
  readonly current_lesson_id: string | null
  readonly ended_at: string | null
  readonly updated_at: string
}

interface LessonContextRow {
  readonly lesson_id: string
  readonly period_id: string
}

interface SessionRow {
  readonly lesson_id: string
  readonly scheduled_at: string | null
  readonly taught_confirmed_at: string | null
  readonly attendance_recorded_at: string | null
  readonly present_count: number
  readonly leave_count: number
  readonly absent_count: number
  readonly total_count: number
}

export class CourseProgressService {
  private readonly now: () => string

  constructor(
    private readonly database: SqliteDatabase,
    options: CourseProgressServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  listProgress(): CourseProgressRecord[] {
    const rows = this.database
      .prepare(
        `SELECT progress.course_id, progress.active_period_id, progress.current_lesson_id,
                progress.ended_at, progress.updated_at
           FROM course_progress AS progress
           JOIN nodes AS course
             ON course.id = progress.course_id
            AND course.kind = 'course'
            AND course.deleted_at IS NULL
          ORDER BY course.created_at, course.id`,
      )
      .all() as ProgressRow[]
    return rows.map(mapProgress)
  }

  listLessonSessions(): LessonSessionSummary[] {
    const rows = this.database
      .prepare(
        `SELECT session.lesson_id, session.scheduled_at, session.taught_confirmed_at,
                session.attendance_recorded_at,
                SUM(CASE WHEN attendance.status = 'present' THEN 1 ELSE 0 END) AS present_count,
                SUM(CASE WHEN attendance.status = 'leave' THEN 1 ELSE 0 END) AS leave_count,
                SUM(CASE WHEN attendance.status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
                COUNT(attendance.student_id) AS total_count
           FROM lesson_sessions AS session
           JOIN nodes AS lesson
             ON lesson.id = session.lesson_id
            AND lesson.kind = 'lesson'
            AND lesson.deleted_at IS NULL
           JOIN nodes AS period
             ON period.id = lesson.parent_id
            AND period.kind = 'period'
            AND period.deleted_at IS NULL
           JOIN nodes AS course
             ON course.id = period.parent_id
            AND course.kind = 'course'
            AND course.deleted_at IS NULL
           LEFT JOIN lesson_attendance AS attendance
             ON attendance.lesson_id = session.lesson_id
          GROUP BY session.lesson_id
          ORDER BY session.scheduled_at IS NULL, session.scheduled_at, session.lesson_id`,
      )
      .all() as SessionRow[]
    return rows.map((row) => ({
      lessonId: row.lesson_id,
      scheduledAt: row.scheduled_at,
      taughtConfirmedAt: row.taught_confirmed_at,
      attendanceRecordedAt: row.attendance_recorded_at,
      presentCount: row.present_count,
      leaveCount: row.leave_count,
      absentCount: row.absent_count,
      totalCount: row.total_count,
    }))
  }

  getProgress(courseId: string): CourseProgressRecord | null {
    const row = this.findProgressRow(courseId)
    return row === undefined ? null : mapProgress(row)
  }

  setCurrentLesson(input: {
    readonly courseId: string
    readonly lessonId: string
    readonly expectedCurrentLessonId: string | null
  }): CourseProgressRecord {
    return this.transaction(() => {
      this.requireOpenCourse(input.courseId)
      const context = this.requireLessonInCourse(input.courseId, input.lessonId)
      this.assertLessonNotTaught(input.lessonId)
      const progress = this.ensureProgress(input.courseId)
      this.assertExpectedCurrent(progress, input.expectedCurrentLessonId)
      if (progress.active_period_id !== context.period_id) {
        throw new CourseProgressError(
          'INVALID_PERIOD',
          '调整当前课次不能切换阶段，请使用开始阶段操作。',
        )
      }
      return this.writeProgress(
        input.courseId,
        progress.active_period_id,
        input.lessonId,
        progress.ended_at,
      )
    })
  }

  clearCurrentLesson(input: {
    readonly courseId: string
    readonly expectedCurrentLessonId: string | null
  }): CourseProgressRecord {
    return this.transaction(() => {
      this.requireOpenCourse(input.courseId)
      const progress = this.ensureProgress(input.courseId)
      this.assertExpectedCurrent(progress, input.expectedCurrentLessonId)
      return this.writeProgress(input.courseId, progress.active_period_id, null, progress.ended_at)
    })
  }

  startPeriod(courseId: string, periodId: string, initialLessonId: string): CourseProgressRecord {
    return this.transaction(() => {
      this.requireOpenCourse(courseId)
      this.requirePeriodInCourse(courseId, periodId)
      const lesson = this.requireLessonInCourse(courseId, initialLessonId)
      if (lesson.period_id !== periodId) {
        throw new CourseProgressError('INVALID_LESSON', '所选课次不属于准备开始的阶段。')
      }
      this.assertLessonNotTaught(initialLessonId)
      const progress = this.ensureProgress(courseId)
      return this.writeProgress(courseId, periodId, initialLessonId, progress.ended_at)
    })
  }

  confirmLessonTaught(input: {
    readonly courseId: string
    readonly lessonId: string
    readonly expectedCurrentLessonId: string | null
    readonly decision: CurrentLessonDecision
  }): ConfirmLessonResult {
    return this.transaction(() => {
      this.requireOpenCourse(input.courseId)
      this.requireLessonInCourse(input.courseId, input.lessonId)
      const progress = this.ensureProgress(input.courseId)
      const existing = this.getTaughtConfirmedAt(input.lessonId)
      if (existing !== null) {
        return {
          status: 'already_confirmed',
          lessonId: input.lessonId,
          taughtConfirmedAt: existing,
          progress: mapProgress(progress),
        }
      }

      this.assertExpectedCurrent(progress, input.expectedCurrentLessonId)
      this.assertConfirmedDecisionValid(
        input.courseId,
        input.lessonId,
        progress,
        input.decision,
      )
      const confirmedAt = this.now()
      this.ensureLessonSession(input.lessonId, confirmedAt)
      const result = this.database
        .prepare(
          `UPDATE lesson_sessions
              SET taught_confirmed_at = ?, updated_at = ?
            WHERE lesson_id = ? AND taught_confirmed_at IS NULL`,
        )
        .run(confirmedAt, confirmedAt, input.lessonId)
      if (result.changes === 0) {
        const concurrent = this.getTaughtConfirmedAt(input.lessonId)
        if (concurrent === null) throw new Error('Lesson confirmation was not persisted')
        return {
          status: 'already_confirmed',
          lessonId: input.lessonId,
          taughtConfirmedAt: concurrent,
          progress: mapProgress(progress),
        }
      }
      const nextProgress = this.applyConfirmedDecision(
        input.courseId,
        input.lessonId,
        progress,
        input.decision,
      )
      return {
        status: 'confirmed',
        lessonId: input.lessonId,
        taughtConfirmedAt: confirmedAt,
        progress: nextProgress,
      }
    })
  }

  undoLessonTaught(courseId: string, lessonId: string): void {
    this.transaction(() => {
      this.requireCourse(courseId)
      this.requireLessonInCourse(courseId, lessonId)
      const updatedAt = this.now()
      this.database
        .prepare(
          `UPDATE lesson_sessions
              SET taught_confirmed_at = NULL, updated_at = ?
            WHERE lesson_id = ?`,
        )
        .run(updatedAt, lessonId)
    })
  }

  endCourse(courseId: string): CourseProgressRecord {
    return this.transaction(() => {
      this.requireCourse(courseId)
      const progress = this.ensureProgress(courseId)
      if (progress.ended_at !== null) return mapProgress(progress)
      return this.writeProgress(
        courseId,
        progress.active_period_id,
        progress.current_lesson_id,
        this.now(),
      )
    })
  }

  reopenCourse(courseId: string): CourseProgressRecord {
    return this.transaction(() => {
      this.requireCourse(courseId)
      const progress = this.ensureProgress(courseId)
      if (progress.ended_at === null) return mapProgress(progress)
      return this.writeProgress(
        courseId,
        progress.active_period_id,
        progress.current_lesson_id,
        null,
      )
    })
  }

  private applyConfirmedDecision(
    courseId: string,
    confirmedLessonId: string,
    progress: ProgressRow,
    decision: CurrentLessonDecision,
  ): CourseProgressRecord {
    if (decision.type === 'keep') {
      if (progress.current_lesson_id === confirmedLessonId) {
        throw new CourseProgressError(
          'INVALID_DECISION',
          '已确认的当前课次不能继续保留为下一课。',
        )
      }
      return mapProgress(progress)
    }
    if (decision.type === 'clear') {
      return this.writeProgress(courseId, progress.active_period_id, null, progress.ended_at)
    }
    if (decision.lessonId === confirmedLessonId) {
      throw new CourseProgressError('INVALID_DECISION', '不能把刚确认上过的课次设为下一课。')
    }
    const target = this.requireLessonInCourse(courseId, decision.lessonId)
    this.assertLessonNotTaught(decision.lessonId)
    return this.writeProgress(courseId, target.period_id, decision.lessonId, progress.ended_at)
  }

  private assertConfirmedDecisionValid(
    courseId: string,
    confirmedLessonId: string,
    progress: ProgressRow,
    decision: CurrentLessonDecision,
  ): void {
    if (decision.type === 'keep') {
      if (progress.current_lesson_id === confirmedLessonId) {
        throw new CourseProgressError(
          'INVALID_DECISION',
          '已确认的当前课次不能继续保留为下一课。',
        )
      }
      return
    }
    if (decision.type === 'clear') return
    if (decision.lessonId === confirmedLessonId) {
      throw new CourseProgressError('INVALID_DECISION', '不能把刚确认上过的课次设为下一课。')
    }
    this.requireLessonInCourse(courseId, decision.lessonId)
    this.assertLessonNotTaught(decision.lessonId)
  }

  private requireCourse(courseId: string): void {
    const row = this.database
      .prepare(
        `SELECT 1 FROM nodes
          WHERE id = ? AND kind = 'course' AND deleted_at IS NULL`,
      )
      .get(courseId)
    if (row === undefined) {
      throw new CourseProgressError('COURSE_NOT_FOUND', '课程不存在或已删除。')
    }
  }

  private requireOpenCourse(courseId: string): void {
    this.requireCourse(courseId)
    const progress = this.findProgressRow(courseId)
    if (progress?.ended_at !== null && progress?.ended_at !== undefined) {
      throw new CourseProgressError('COURSE_ENDED', '课程已结束，请先重新开启。')
    }
  }

  private requirePeriodInCourse(courseId: string, periodId: string): void {
    const row = this.database
      .prepare(
        `SELECT 1 FROM nodes AS period
          WHERE period.id = ?
            AND period.kind = 'period'
            AND period.parent_id = ?
            AND period.deleted_at IS NULL`,
      )
      .get(periodId, courseId)
    if (row === undefined) {
      throw new CourseProgressError('INVALID_PERIOD', '阶段不属于该课程或已删除。')
    }
  }

  private requireLessonInCourse(courseId: string, lessonId: string): LessonContextRow {
    const row = this.database
      .prepare(
        `SELECT lesson.id AS lesson_id, period.id AS period_id
           FROM nodes AS lesson
           JOIN nodes AS period
             ON period.id = lesson.parent_id
            AND period.kind = 'period'
            AND period.deleted_at IS NULL
          WHERE lesson.id = ?
            AND lesson.kind = 'lesson'
            AND lesson.deleted_at IS NULL
            AND period.parent_id = ?`,
      )
      .get(lessonId, courseId) as LessonContextRow | undefined
    if (row === undefined) {
      throw new CourseProgressError('INVALID_LESSON', '课次不属于该课程或已删除。')
    }
    return row
  }

  private assertLessonNotTaught(lessonId: string): void {
    if (this.getTaughtConfirmedAt(lessonId) !== null) {
      throw new CourseProgressError('LESSON_ALREADY_TAUGHT', '已确认上过的课次不能设为当前课次。')
    }
  }

  private assertExpectedCurrent(progress: ProgressRow, expected: string | null): void {
    if (progress.current_lesson_id !== expected) {
      throw new CourseProgressError(
        'PROGRESS_CONFLICT',
        '课程当前课次已经变化，请刷新后重试。',
      )
    }
  }

  private ensureProgress(courseId: string): ProgressRow {
    const now = this.now()
    this.database
      .prepare(
        `INSERT INTO course_progress
           (course_id, active_period_id, current_lesson_id, ended_at, updated_at)
         VALUES (?, NULL, NULL, NULL, ?)
         ON CONFLICT(course_id) DO NOTHING`,
      )
      .run(courseId, now)
    return this.requireProgressRow(courseId)
  }

  private writeProgress(
    courseId: string,
    activePeriodId: string | null,
    currentLessonId: string | null,
    endedAt: string | null,
  ): CourseProgressRecord {
    const updatedAt = this.now()
    this.database
      .prepare(
        `INSERT INTO course_progress
           (course_id, active_period_id, current_lesson_id, ended_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(course_id) DO UPDATE SET
           active_period_id = excluded.active_period_id,
           current_lesson_id = excluded.current_lesson_id,
           ended_at = excluded.ended_at,
           updated_at = excluded.updated_at`,
      )
      .run(courseId, activePeriodId, currentLessonId, endedAt, updatedAt)
    return mapProgress(this.requireProgressRow(courseId))
  }

  private getTaughtConfirmedAt(lessonId: string): string | null {
    const row = this.database
      .prepare('SELECT taught_confirmed_at FROM lesson_sessions WHERE lesson_id = ?')
      .get(lessonId) as { taught_confirmed_at: string | null } | undefined
    return row?.taught_confirmed_at ?? null
  }

  private ensureLessonSession(lessonId: string, now: string): void {
    this.database
      .prepare(
        `INSERT INTO lesson_sessions
           (lesson_id, scheduled_at, taught_confirmed_at, attendance_recorded_at, updated_at)
         VALUES (?, NULL, NULL, NULL, ?)
         ON CONFLICT(lesson_id) DO NOTHING`,
      )
      .run(lessonId, now)
  }

  private findProgressRow(courseId: string): ProgressRow | undefined {
    return this.database
      .prepare(
        `SELECT course_id, active_period_id, current_lesson_id, ended_at, updated_at
           FROM course_progress WHERE course_id = ?`,
      )
      .get(courseId) as ProgressRow | undefined
  }

  private requireProgressRow(courseId: string): ProgressRow {
    const row = this.findProgressRow(courseId)
    if (row === undefined) throw new Error('Course progress was not persisted')
    return row
  }

  private transaction<T>(callback: () => T): T {
    return this.database.transaction(callback).immediate()
  }
}

export function reconcileCourseProgressPointers(
  database: SqliteDatabase,
  updatedAt: string,
): void {
  const table = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'course_progress'")
    .get()
  if (table === undefined) return

  database
    .prepare(
      `UPDATE course_progress
          SET active_period_id = NULL, current_lesson_id = NULL, updated_at = ?
        WHERE active_period_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM nodes AS period
             WHERE period.id = course_progress.active_period_id
               AND period.kind = 'period'
               AND period.deleted_at IS NULL
               AND period.parent_id = course_progress.course_id
          )`,
    )
    .run(updatedAt)

  database
    .prepare(
      `UPDATE course_progress
          SET current_lesson_id = NULL, updated_at = ?
        WHERE current_lesson_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM nodes AS lesson
             WHERE lesson.id = course_progress.current_lesson_id
               AND lesson.kind = 'lesson'
               AND lesson.deleted_at IS NULL
               AND lesson.parent_id = course_progress.active_period_id
          )`,
    )
    .run(updatedAt)
}

function mapProgress(row: ProgressRow): CourseProgressRecord {
  return {
    courseId: row.course_id,
    activePeriodId: row.active_period_id,
    currentLessonId: row.current_lesson_id,
    endedAt: row.ended_at,
    updatedAt: row.updated_at,
  }
}
