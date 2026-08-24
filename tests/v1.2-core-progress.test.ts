import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { getLocalDayUtcRange } from '../src/shared/core-contracts'
import {
  getAppliedMigrationVersions,
  runMigrations,
  workspaceMigrations,
} from '../src/main/db/migrations'

function createFixture(): { database: Database.Database; core: CoreDataService } {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  runMigrations(database)
  let id = 0
  let tick = 0
  const core = new CoreDataService(database, {
    idFactory: () => `v12-id-${id++}`,
    now: () => new Date(Date.UTC(2026, 7, 23, 0, 0, tick++)).toISOString(),
  })
  return { database, core }
}

function addCourseLessons(core: CoreDataService, title = 'V1.2 班课') {
  const course = core.createCourse({ title, mode: 'class' })
  const period = core.nodes.createPeriod(course.id, '2026 秋季')
  const lesson8 = core.nodes.createLesson(period.id, '第八课')
  const lesson9 = core.nodes.createLesson(period.id, '第九课')
  const lesson10 = core.nodes.createLesson(period.id, '第十课')
  return { course, period, lesson8, lesson9, lesson10 }
}

describe('V12-01 course progress and attendance core', () => {
  it('migrates schema v11 data losslessly and adds nullable active relationships', () => {
    const database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    try {
      runMigrations(database, workspaceMigrations.slice(0, 11))
      database.prepare(
        `INSERT INTO nodes
           (id, parent_id, kind, title, course_mode, sort_order, content_md,
            created_at, updated_at, deleted_at)
         VALUES ('course-old', NULL, 'course', '旧课程', 'class', 0, '',
                 '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z', NULL)`,
      ).run()
      database.prepare(
        `INSERT INTO students (id, name, created_at, updated_at, deleted_at)
         VALUES ('student-old', '旧学生', '2026-08-22T00:00:00.000Z',
                 '2026-08-22T00:00:00.000Z', NULL)`,
      ).run()
      database.prepare(
        `INSERT INTO course_students (course_id, student_id, created_at)
         VALUES ('course-old', 'student-old', '2026-08-22T00:00:00.000Z')`,
      ).run()

      expect(runMigrations(database)).toBe(14)
      expect(getAppliedMigrationVersions(database)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
      expect(database.prepare(
        `SELECT course_id, student_id, ended_at FROM course_students`,
      ).get()).toEqual({ course_id: 'course-old', student_id: 'student-old', ended_at: null })
      expect(database.prepare(
        `SELECT name FROM sqlite_master
          WHERE type = 'table' AND name IN ('course_progress', 'lesson_sessions', 'lesson_attendance')
          ORDER BY name`,
      ).all()).toEqual([
        { name: 'course_progress' },
        { name: 'lesson_attendance' },
        { name: 'lesson_sessions' },
      ])
      expect(database.prepare("SELECT name FROM pragma_table_info('lesson_sessions') WHERE name = 'duration_minutes'").get())
        .toEqual({ name: 'duration_minutes' })
    } finally {
      database.close()
    }
  })

  it('creates a course and optional student links atomically with one-to-one limits', () => {
    const { database, core } = createFixture()
    try {
      const first = core.createStudent('学生甲')
      const second = core.createStudent('学生乙')
      const course = core.createCourse({ title: '甲一对一', mode: 'one_to_one', studentIds: [first.id] })
      expect(core.getOverview().courseStudentLinks).toContainEqual(expect.objectContaining({
        courseId: course.id,
        studentId: first.id,
        endedAt: null,
      }))
      expect(() => core.linkStudentToCourse(course.id, second.id)).toThrowError(
        expect.objectContaining({ code: 'ONE_TO_ONE_ACTIVE_STUDENT' }),
      )
      const before = core.nodes.listNodes().length
      expect(() => core.createCourse({
        title: '无效一对一',
        mode: 'one_to_one',
        studentIds: [first.id, second.id],
      })).toThrowError(expect.objectContaining({ code: 'ONE_TO_ONE_ACTIVE_STUDENT' }))
      expect(core.nodes.listNodes()).toHaveLength(before)
    } finally {
      database.close()
    }
  })

  it('keeps non-current and current lesson confirmations independent and idempotent', () => {
    const { database, core } = createFixture()
    try {
      const { course, period, lesson8, lesson9, lesson10 } = addCourseLessons(core)
      const initial = core.progress.startPeriod(course.id, period.id, lesson8.id)
      expect(initial.currentLessonId).toBe(lesson8.id)

      const ninth = core.progress.confirmLessonTaught({
        courseId: course.id,
        lessonId: lesson9.id,
        expectedCurrentLessonId: lesson8.id,
        decision: { type: 'keep' },
      })
      expect(ninth.progress.currentLessonId).toBe(lesson8.id)

      const eighth = core.progress.confirmLessonTaught({
        courseId: course.id,
        lessonId: lesson8.id,
        expectedCurrentLessonId: lesson8.id,
        decision: { type: 'set', lessonId: lesson10.id },
      })
      expect(eighth.status).toBe('confirmed')
      expect(eighth.progress.currentLessonId).toBe(lesson10.id)

      const repeated = core.progress.confirmLessonTaught({
        courseId: course.id,
        lessonId: lesson8.id,
        expectedCurrentLessonId: null,
        decision: { type: 'clear' },
      })
      expect(repeated).toMatchObject({
        status: 'already_confirmed',
        taughtConfirmedAt: eighth.taughtConfirmedAt,
        progress: { currentLessonId: lesson10.id },
      })
    } finally {
      database.close()
    }
  })

  it('rejects stale and cross-course progress changes and preserves ended course pointers', () => {
    const { database, core } = createFixture()
    try {
      const first = addCourseLessons(core, '第一门课')
      const second = addCourseLessons(core, '第二门课')
      core.progress.startPeriod(first.course.id, first.period.id, first.lesson8.id)
      expect(() => core.progress.setCurrentLesson({
        courseId: first.course.id,
        lessonId: first.lesson9.id,
        expectedCurrentLessonId: null,
      })).toThrowError(expect.objectContaining({ code: 'PROGRESS_CONFLICT' }))
      expect(() => core.progress.setCurrentLesson({
        courseId: first.course.id,
        lessonId: second.lesson8.id,
        expectedCurrentLessonId: first.lesson8.id,
      })).toThrowError(expect.objectContaining({ code: 'INVALID_LESSON' }))

      const otherPeriod = core.nodes.createPeriod(first.course.id, '下一阶段')
      const otherLesson = core.nodes.createLesson(otherPeriod.id, '下一阶段第一课')
      expect(() => core.progress.setCurrentLesson({
        courseId: first.course.id,
        lessonId: otherLesson.id,
        expectedCurrentLessonId: first.lesson8.id,
      })).toThrowError(expect.objectContaining({ code: 'INVALID_PERIOD' }))
      expect(core.progress.getProgress(first.course.id)).toMatchObject({
        activePeriodId: first.period.id,
        currentLessonId: first.lesson8.id,
      })

      const ended = core.progress.endCourse(first.course.id)
      expect(ended).toMatchObject({ currentLessonId: first.lesson8.id, endedAt: expect.any(String) })
      expect(() => core.progress.clearCurrentLesson({
        courseId: first.course.id,
        expectedCurrentLessonId: first.lesson8.id,
      })).toThrowError(expect.objectContaining({ code: 'COURSE_ENDED' }))
      expect(core.progress.reopenCourse(first.course.id)).toMatchObject({
        currentLessonId: first.lesson8.id,
        endedAt: null,
      })
    } finally {
      database.close()
    }
  })

  it('clears invalid progress pointers after lesson moves and period soft deletion', () => {
    const { database, core } = createFixture()
    try {
      const first = addCourseLessons(core, '原课程')
      const second = addCourseLessons(core, '目标课程')
      core.progress.startPeriod(first.course.id, first.period.id, first.lesson8.id)
      core.nodes.moveNode(first.lesson8.id, second.period.id)
      expect(core.progress.getProgress(first.course.id)).toMatchObject({
        activePeriodId: first.period.id,
        currentLessonId: null,
      })

      core.progress.startPeriod(second.course.id, second.period.id, first.lesson8.id)
      core.nodes.softDeleteNode(second.period.id)
      expect(core.progress.getProgress(second.course.id)).toMatchObject({
        activePeriodId: null,
        currentLessonId: null,
      })
    } finally {
      database.close()
    }
  })

  it('saves attendance independently from schedule and course progress', () => {
    const { database, core } = createFixture()
    try {
      const { course, period, lesson8, lesson9 } = addCourseLessons(core)
      const first = core.createStudentForCourse(course.id, '甲')
      const second = core.createStudentForCourse(course.id, '乙')
      core.progress.startPeriod(course.id, period.id, lesson8.id)

      const saved = core.attendance.saveLessonAttendance(lesson9.id, [
        { studentId: first.id, status: 'present' },
        { studentId: second.id, status: 'leave' },
      ])
      expect(saved).toMatchObject({ scheduledAt: null, attendanceRecordedAt: expect.any(String) })
      expect(core.progress.getProgress(course.id)?.currentLessonId).toBe(lesson8.id)
      const ninth = core.progress.confirmLessonTaught({
        courseId: course.id,
        lessonId: lesson9.id,
        expectedCurrentLessonId: lesson8.id,
        decision: { type: 'keep' },
      })
      expect(ninth.progress.currentLessonId).toBe(lesson8.id)
      expect(core.attendance.getLessonAttendance(lesson9.id).students).toEqual([
        { studentId: first.id, studentName: '甲', status: 'present' },
        { studentId: second.id, studentName: '乙', status: 'leave' },
      ])
    } finally {
      database.close()
    }
  })

  it('rejects a stale first-attendance roster and preserves historical snapshots', () => {
    const { database, core } = createFixture()
    try {
      const { course, lesson8 } = addCourseLessons(core)
      const first = core.createStudentForCourse(course.id, '先加入')
      const opened = core.attendance.getLessonAttendance(lesson8.id)
      expect(opened.students.map((student) => student.studentId)).toEqual([first.id])

      const second = core.createStudentForCourse(course.id, '后加入')
      expect(() => core.attendance.saveLessonAttendance(lesson8.id, [
        { studentId: first.id, status: 'present' },
      ])).toThrowError(expect.objectContaining({ code: 'ATTENDANCE_ROSTER_CHANGED' }))
      expect(core.attendance.getLessonAttendance(lesson8.id).attendanceRecordedAt).toBeNull()

      core.attendance.saveLessonAttendance(lesson8.id, [
        { studentId: first.id, status: 'present' },
        { studentId: second.id, status: 'absent' },
      ])
      const note = core.createNote(first.id, '历史学习记录', lesson8.id)
      const ended = core.endCourseStudentLink(course.id, first.id)
      expect(ended.endedAt).not.toBeNull()
      expect(core.listStudentsForCourse(course.id).map((student) => student.id)).toEqual([second.id])
      expect(core.attendance.getLessonAttendance(lesson8.id).students.map((student) => student.studentId)).toEqual([
        first.id,
        second.id,
      ])
      expect(core.getOverview().notes).toContainEqual(note)
      core.reactivateCourseStudentLink(course.id, first.id)
      expect(core.attendance.getLessonAttendance(lesson8.id).students).toHaveLength(2)
    } finally {
      database.close()
    }
  })

  it('stores strict UTC schedule values and derives local calendar-day UTC bounds', () => {
    const { database, core } = createFixture()
    try {
      const { lesson8 } = addCourseLessons(core)
      expect(() => core.attendance.updateLessonSchedule(lesson8.id, '2026-08-23 18:30'))
        .toThrowError(expect.objectContaining({ code: 'INVALID_SCHEDULE' }))
      const scheduledAt = '2026-08-23T10:30:00.000Z'
      expect(core.attendance.updateLessonSchedule(lesson8.id, scheduledAt).scheduledAt).toBe(scheduledAt)
      expect(core.attendance.updateLessonSchedule(lesson8.id, scheduledAt, 90).durationMinutes).toBe(90)
      expect(core.attendance.updateLessonSchedule(lesson8.id, null).durationMinutes).toBe(90)
      expect(core.attendance.updateLessonSchedule(lesson8.id, null, null).durationMinutes).toBeNull()
      const range = getLocalDayUtcRange(2026, 8, 23)
      expect(range).toEqual({
        startUtc: new Date(2026, 7, 23, 0, 0, 0, 0).toISOString(),
        endUtc: new Date(2026, 7, 24, 0, 0, 0, 0).toISOString(),
      })
      expect(() => getLocalDayUtcRange(2026, 2, 30)).toThrow('Local calendar day is invalid')
    } finally {
      database.close()
    }
  })
})
