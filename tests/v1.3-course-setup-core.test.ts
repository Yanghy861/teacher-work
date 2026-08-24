import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import {
  getAppliedMigrationVersions,
  runMigrations,
  workspaceMigrations,
} from '../src/main/db/migrations'
import {
  isCreateCourseSetupRequest,
  isCreateCourseSetupResult,
  type CreateCourseSetupRequest,
} from '../src/shared/core-contracts'

function createFixture(options: { readonly idFactory?: () => string } = {}) {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  runMigrations(database)
  let id = 0
  let tick = 0
  const core = new CoreDataService(database, {
    idFactory: options.idFactory ?? (() => `v13-id-${id++}`),
    now: () => new Date(Date.UTC(2026, 7, 24, 0, 0, tick++)).toISOString(),
  })
  return { database, core }
}

function setupRequest(
  overrides: Partial<CreateCourseSetupRequest> = {},
): CreateCourseSetupRequest {
  return {
    title: '初二数学秋季班',
    mode: 'class',
    students: [],
    periodTitle: '2026 秋季',
    lessons: [
      { title: '第 1 课 · 未命名', scheduledAt: null, durationMinutes: 90 },
    ],
    ...overrides,
  }
}

describe('V13-01 course setup core', () => {
  it('migrates schema v12 sessions losslessly and enforces positive nullable duration', () => {
    const database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    try {
      runMigrations(database, workspaceMigrations.slice(0, 12))
      const oldCore = new CoreDataService(database)
      const course = oldCore.nodes.createCourse('旧课程', 'class')
      const period = oldCore.nodes.createPeriod(course.id, '旧阶段')
      const lesson = oldCore.nodes.createLesson(period.id, '旧课次')
      database.prepare(
        `INSERT INTO lesson_sessions
           (lesson_id, scheduled_at, taught_confirmed_at, attendance_recorded_at, updated_at)
         VALUES (?, ?, NULL, NULL, ?)`,
      ).run(lesson.id, '2026-08-24T06:00:00.000Z', '2026-08-24T00:00:00.000Z')

      expect(runMigrations(database)).toBe(14)
      expect(getAppliedMigrationVersions(database)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
      ])
      expect(database.prepare(
        'SELECT scheduled_at, duration_minutes FROM lesson_sessions WHERE lesson_id = ?',
      ).get(lesson.id)).toEqual({
        scheduled_at: '2026-08-24T06:00:00.000Z',
        duration_minutes: null,
      })
      expect(() => database.prepare(
        'UPDATE lesson_sessions SET duration_minutes = 0 WHERE lesson_id = ?',
      ).run(lesson.id)).toThrow(/CHECK constraint failed/)
    } finally {
      database.close()
    }
  })

  it('creates mixed students, course, lessons, sessions and current lesson in one setup', () => {
    const { database, core } = createFixture()
    try {
      const existing = core.createStudent('已有学生')
      const request = setupRequest({
        students: [
          { type: 'existing', studentId: existing.id },
          { type: 'new', name: ' 新学生 ' },
          { type: 'new', name: '新学生' },
        ],
        lessons: [
          {
            title: '有理数',
            scheduledAt: '2026-09-05T06:00:00.000Z',
            durationMinutes: 90,
          },
          { title: '整式', scheduledAt: null, durationMinutes: 90 },
          {
            title: '几何图形初步',
            scheduledAt: '2026-09-19T06:00:00.000Z',
            durationMinutes: null,
          },
          { title: '一元一次方程', scheduledAt: null, durationMinutes: null },
        ],
      })

      expect(isCreateCourseSetupRequest(request)).toBe(true)
      const result = core.createCourseSetup(request)
      expect(isCreateCourseSetupResult(result)).toBe(true)
      expect(result.students.map((student) => student.name)).toEqual(['已有学生', '新学生'])
      expect(result.courseStudentLinks).toHaveLength(2)
      expect(result.lessons.map((lesson) => lesson.title)).toEqual([
        '有理数',
        '整式',
        '几何图形初步',
        '一元一次方程',
      ])
      expect(result.lessonSessions).toEqual([
        expect.objectContaining({
          lessonId: result.lessons[0]!.id,
          scheduledAt: '2026-09-05T06:00:00.000Z',
          durationMinutes: 90,
          taughtConfirmedAt: null,
        }),
        expect.objectContaining({
          lessonId: result.lessons[1]!.id,
          scheduledAt: null,
          durationMinutes: 90,
          taughtConfirmedAt: null,
        }),
        expect.objectContaining({
          lessonId: result.lessons[2]!.id,
          scheduledAt: '2026-09-19T06:00:00.000Z',
          durationMinutes: null,
          taughtConfirmedAt: null,
        }),
      ])
      expect(result.progress).toMatchObject({
        courseId: result.course.id,
        activePeriodId: result.period.id,
        currentLessonId: result.lessons[0]!.id,
        endedAt: null,
      })
      expect(database.prepare('SELECT COUNT(*) AS count FROM lesson_sessions').get())
        .toEqual({ count: 3 })
      expect(database.prepare('SELECT COUNT(*) AS count FROM lesson_attendance').get())
        .toEqual({ count: 0 })
    } finally {
      database.close()
    }
  })

  it('allows an empty course and exactly 100 lessons but rejects the 101st lesson', () => {
    const { database, core } = createFixture()
    try {
      const hundredLessons = Array.from({ length: 100 }, (_, index) => ({
        title: `第 ${index + 1} 课 · 未命名`,
        scheduledAt: null,
        durationMinutes: null,
      }))
      const created = core.createCourseSetup(setupRequest({
        mode: 'one_to_one',
        lessons: hundredLessons,
      }))
      expect(created.students).toEqual([])
      expect(created.lessons).toHaveLength(100)
      const nodeCount = core.nodes.listNodes().length

      expect(() => core.createCourseSetup(setupRequest({
        title: '不应创建的课程',
        lessons: [...hundredLessons, {
          title: '第 101 课',
          scheduledAt: null,
          durationMinutes: null,
        }],
      }))).toThrow('一次最多创建 100 节课，请拆分阶段。')
      expect(core.nodes.listNodes()).toHaveLength(nodeCount)
    } finally {
      database.close()
    }
  })

  it('revalidates students, one-to-one limits, names, UTC values and duration in Main', () => {
    const { database, core } = createFixture()
    try {
      const first = core.createStudent('学生甲')
      const second = core.createStudent('学生乙')
      database.prepare('UPDATE students SET deleted_at = ? WHERE id = ?')
        .run('2026-08-24T00:00:00.000Z', second.id)
      const initialNodeCount = core.nodes.listNodes().length

      expect(() => core.createCourseSetup(setupRequest({
        students: [{ type: 'existing', studentId: second.id }],
      }))).toThrowError(expect.objectContaining({ code: 'STUDENT_DELETED' }))
      expect(() => core.createCourseSetup(setupRequest({
        mode: 'one_to_one',
        students: [
          { type: 'existing', studentId: first.id },
          { type: 'new', name: '另一位学生' },
        ],
      }))).toThrowError(expect.objectContaining({ code: 'ONE_TO_ONE_ACTIVE_STUDENT' }))
      expect(() => core.createCourseSetup(setupRequest({
        students: [
          { type: 'existing', studentId: first.id },
          { type: 'existing', studentId: first.id },
        ],
      }))).toThrowError(expect.objectContaining({ code: 'STUDENT_ALREADY_LINKED' }))
      expect(() => core.createCourseSetup(setupRequest({
        students: [{ type: 'new', name: '学'.repeat(101) }],
      }))).toThrowError(expect.objectContaining({ code: 'INVALID_NAME' }))
      expect(() => core.createCourseSetup(setupRequest({
        lessons: [{ title: '课次', scheduledAt: '2026-09-05 14:00', durationMinutes: 90 }],
      }))).toThrow('上课时间必须是 UTC ISO 8601 时间。')
      expect(() => core.createCourseSetup(setupRequest({
        lessons: [{ title: '课次', scheduledAt: null, durationMinutes: 0 }],
      }))).toThrow('课程时长必须是正整数分钟。')
      expect(core.nodes.listNodes()).toHaveLength(initialNodeCount)
    } finally {
      database.close()
    }
  })

  it('rolls back students, nodes, sessions and progress when a middle write fails', () => {
    const ids = ['student', 'course', 'period', 'lesson-duplicate', 'lesson-duplicate']
    let index = 0
    const { database, core } = createFixture({ idFactory: () => ids[index++]! })
    try {
      expect(() => core.createCourseSetup(setupRequest({
        students: [{ type: 'new', name: '回滚学生' }],
        lessons: [
          { title: '第一课', scheduledAt: null, durationMinutes: 90 },
          { title: '第二课', scheduledAt: null, durationMinutes: 90 },
        ],
      }))).toThrow(/UNIQUE constraint failed/)
      expect(database.prepare('SELECT COUNT(*) AS count FROM students').get()).toEqual({ count: 0 })
      expect(database.prepare('SELECT COUNT(*) AS count FROM nodes').get()).toEqual({ count: 0 })
      expect(database.prepare('SELECT COUNT(*) AS count FROM course_students').get()).toEqual({ count: 0 })
      expect(database.prepare('SELECT COUNT(*) AS count FROM lesson_sessions').get()).toEqual({ count: 0 })
      expect(database.prepare('SELECT COUNT(*) AS count FROM course_progress').get()).toEqual({ count: 0 })
    } finally {
      database.close()
    }
  })

  it('rejects oversized or extra-field requests at the shared IPC boundary', () => {
    expect(isCreateCourseSetupRequest({
      ...setupRequest(),
      lessons: Array.from({ length: 101 }, () => ({
        title: '课次',
        scheduledAt: null,
        durationMinutes: null,
      })),
    })).toBe(false)
    expect(isCreateCourseSetupRequest({ ...setupRequest(), sql: 'DROP TABLE nodes' })).toBe(false)
  })
})
