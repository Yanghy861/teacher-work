import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { runMigrations } from '../src/main/db/migrations'
import { isCoreOverview, isCourseStudentLink } from '../src/shared/core-contracts'

function createService(): { database: Database.Database; service: CoreDataService } {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  runMigrations(database)
  let nextId = 0
  const service = new CoreDataService(database, {
    idFactory: () => `test-id-${nextId++}`,
    now: () => '2026-08-20T00:00:00.000Z',
  })
  return { database, service }
}

describe('L01 core data tree', () => {
  it('moves nested nodes without losing children and rejects cycles', () => {
    const { database, service } = createService()
    try {
      const firstCourse = service.nodes.createCourse('班课 A', 'class')
      const secondCourse = service.nodes.createCourse('班课 B', 'class')
      const firstPeriod = service.nodes.createPeriod(firstCourse.id, '2026 春')
      const secondPeriod = service.nodes.createPeriod(firstCourse.id, '2028 秋')
      const lesson = service.nodes.createLesson(firstPeriod.id, '第一课')

      const moved = service.nodes.moveNode(firstPeriod.id, secondCourse.id)
      expect(moved.parentId).toBe(secondCourse.id)
      expect(service.nodes.getNode(lesson.id)?.parentId).toBe(firstPeriod.id)
      expect(service.nodes.getNode(secondPeriod.id)?.parentId).toBe(firstCourse.id)

      expect(() => service.nodes.moveNode(firstPeriod.id, lesson.id)).toThrowError(
        expect.objectContaining({ code: 'NODE_CYCLE' }),
      )
    } finally {
      database.close()
    }
  })

  it('soft deletes and restores a subtree while preserving its hierarchy', () => {
    const { database, service } = createService()
    try {
      const course = service.nodes.createCourse('一对一', 'one_to_one')
      const period = service.nodes.createPeriod(course.id, '六下')
      const lesson = service.nodes.createLesson(period.id, '有理数')

      const deleted = service.nodes.softDeleteNode(period.id)
      expect(deleted.deletedAt).toBe('2026-08-20T00:00:00.000Z')
      expect(service.nodes.getNode(period.id)).toBeUndefined()
      expect(service.nodes.getNode(lesson.id)).toBeUndefined()
      expect(service.nodes.getNode(lesson.id, true)?.parentId).toBe(period.id)

      const restored = service.nodes.restoreNode(period.id)
      expect(restored.deletedAt).toBeNull()
      expect(service.nodes.getNode(lesson.id)?.parentId).toBe(period.id)
    } finally {
      database.close()
    }
  })

  it('supports discontinuous one-to-one periods, course links and student notes', () => {
    const { database, service } = createService()
    try {
      const course = service.nodes.createCourse('张三一对一', 'one_to_one')
      const spring = service.nodes.createPeriod(course.id, '2026 春·六下')
      const autumn = service.nodes.createPeriod(course.id, '2028 秋·八上')
      const lesson = service.nodes.createLesson(autumn.id, '二次函数')
      const student = service.createStudentForCourse(course.id, '张三')
      const note = service.createNote(student.id, '本次记录：能独立完成基础题。', lesson.id)

      const overview = service.getOverview()
      expect(overview.nodes.filter((node) => node.kind === 'period').map((node) => node.title)).toEqual([
        '2026 春·六下',
        '2028 秋·八上',
      ])
      expect(overview.courseStudentLinks).toEqual([
        {
          courseId: course.id,
          studentId: student.id,
          createdAt: '2026-08-20T00:00:00.000Z',
          endedAt: null,
        },
      ])
      expect(overview.notes).toEqual([note])
      expect(service.listStudentsForCourse(course.id)).toEqual([student])
      expect(spring.parentId).toBe(course.id)
    } finally {
      database.close()
    }
  })

  it('allows manual records for current or historical course relations and rejects unrelated lessons', () => {
    const { database, service } = createService()
    try {
      const student = service.createStudent('学生甲')
      const relatedCourse = service.createCourse({ title: '关联课程', mode: 'class', studentIds: [student.id] })
      const relatedPeriod = service.nodes.createPeriod(relatedCourse.id, '关联阶段')
      const relatedLesson = service.nodes.createLesson(relatedPeriod.id, '关联课次')
      const unrelatedCourse = service.createCourse({ title: '无关课程', mode: 'class' })
      const unrelatedPeriod = service.nodes.createPeriod(unrelatedCourse.id, '无关阶段')
      const unrelatedLesson = service.nodes.createLesson(unrelatedPeriod.id, '无关课次')

      service.endCourseStudentLink(relatedCourse.id, student.id)
      expect(service.createNote(student.id, '历史课程记录', relatedLesson.id)).toMatchObject({
        lessonId: relatedLesson.id,
      })
      expect(() => service.createNote(student.id, '不应保存', unrelatedLesson.id)).toThrowError(
        expect.objectContaining({ code: 'STUDENT_NOT_LINKED' }),
      )
      expect(service.getOverview().notes.map((note) => note.bodyMd)).toEqual(['历史课程记录'])
    } finally {
      database.close()
    }
  })

  it('renames and reorders siblings through transactional writes', () => {
    const { database, service } = createService()
    try {
      const course = service.nodes.createCourse('课程', 'class')
      const first = service.nodes.createPeriod(course.id, '第一阶段')
      const second = service.nodes.createPeriod(course.id, '第二阶段')
      service.nodes.renameNode(first.id, '已重命名阶段')
      service.nodes.reorderNode(second.id, 0)

      const periods = service.nodes
        .listNodes()
        .filter((node) => node.parentId === course.id)
      expect(periods.map((period) => period.title)).toEqual(['第二阶段', '已重命名阶段'])
      expect(periods.map((period) => period.sortOrder)).toEqual([0, 1])
    } finally {
      database.close()
    }
  })

  it('accepts lesson drafts without students without weakening course-student links', () => {
    const { database, service } = createService()
    try {
      const course = service.nodes.createCourse('班课', 'class')
      const period = service.nodes.createPeriod(course.id, '阶段')
      const lesson = service.nodes.createLesson(period.id, '无学生课次')
      const note = service.createLessonDraft(lesson.id, '# 班课讲义', {
        noteKind: 'lecture',
        aiMetadata: {
          kind: 'lecture',
          promptVersion: 'l09-v1',
          provider: 'openai-compatible',
          model: 'fake-model',
          sources: [],
          inputChars: 0,
          maxChars: 100,
          maxTokens: 100,
        },
      })

      expect(note).toMatchObject({ studentId: null, draftStatus: 'draft' })
      const saved = service.saveDraftToLesson(note.id, '# 老师修改后的班课讲义')
      expect(saved).toMatchObject({
        id: note.id,
        bodyMd: '# 老师修改后的班课讲义',
        draftStatus: 'saved',
      })
      expect(() => service.softDeleteDraft(saved.id)).toThrowError(
        expect.objectContaining({ code: 'INVALID_DRAFT' }),
      )

      const disposable = service.createLessonDraft(lesson.id, '# 可删除草稿', {
        noteKind: 'homework',
        aiMetadata: {
          ...note.aiMetadata!,
          kind: 'homework',
        },
      })
      const deleted = service.softDeleteDraft(disposable.id)
      expect(deleted.deletedAt).not.toBeNull()
      expect(service.getOverview().notes.some((item) => item.id === disposable.id)).toBe(false)
      expect(isCoreOverview(service.getOverview())).toBe(true)
      expect(isCourseStudentLink({
        courseId: course.id,
        studentId: null,
        createdAt: '2026-08-20T00:00:00.000Z',
      })).toBe(false)
    } finally {
      database.close()
    }
  })
})
