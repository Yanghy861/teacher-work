import { randomUUID } from 'node:crypto'

import type {
  CourseMode,
  CourseStudentLink,
  CoreOverview,
  DraftStatus,
  NodeRecord,
  NoteRecord,
  StudentRecord,
} from '../../shared/core-contracts'
import { isDraftStatus } from '../../shared/core-contracts'
import {
  isDraftNoteMetadata,
  type DraftKind,
  type DraftLessonSnapshot,
  type DraftNoteMetadata,
} from '../../shared/draft-contracts'
import type { SqliteDatabase } from '../db/migrations'
import { NodeService } from './node-service'
import { CourseProgressService } from './course-progress-service'
import { AttendanceService } from './attendance-service'

export type CoreDataErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_NOTE'
  | 'STUDENT_NOT_FOUND'
  | 'STUDENT_DELETED'
  | 'COURSE_NOT_FOUND'
  | 'COURSE_DELETED'
  | 'STUDENT_ALREADY_LINKED'
  | 'STUDENT_NOT_LINKED'
  | 'ONE_TO_ONE_ACTIVE_STUDENT'
  | 'LESSON_NOT_FOUND'
  | 'LESSON_DELETED'
  | 'INVALID_LESSON'
  | 'INVALID_DRAFT'

export class CoreDataError extends Error {
  readonly code: CoreDataErrorCode

  constructor(code: CoreDataErrorCode, message: string) {
    super(message)
    this.name = 'CoreDataError'
    this.code = code
  }
}

export interface CoreDataServiceOptions {
  readonly idFactory?: () => string
  readonly now?: () => string
}

interface StudentRow {
  readonly id: string
  readonly name: string
  readonly created_at: string
  readonly updated_at: string
  readonly deleted_at: string | null
}

interface LinkRow {
  readonly course_id: string
  readonly student_id: string
  readonly created_at: string
  readonly ended_at: string | null
}

interface NoteRow {
  readonly id: string
  readonly student_id: string | null
  readonly lesson_id: string | null
  readonly body_md: string
  readonly created_at: string
  readonly updated_at: string
  readonly deleted_at: string | null
  readonly note_kind: 'manual' | DraftKind
  readonly ai_metadata_json: string | null
  readonly draft_status: DraftStatus | null
}

interface DraftLessonContextRow {
  readonly course_id: string
  readonly course_title: string
  readonly course_mode: 'class' | 'one_to_one'
  readonly period_title: string
  readonly lesson_id: string
  readonly lesson_title: string
}

export class CoreDataService {
  readonly nodes: NodeService
  readonly progress: CourseProgressService
  readonly attendance: AttendanceService
  private readonly idFactory: () => string
  private readonly now: () => string

  constructor(
    private readonly database: SqliteDatabase,
    options: CoreDataServiceOptions = {},
  ) {
    this.idFactory = options.idFactory ?? randomUUID
    this.now = options.now ?? (() => new Date().toISOString())
    this.nodes = new NodeService(database, options)
    this.progress = new CourseProgressService(database, options)
    this.attendance = new AttendanceService(database, options)
  }

  createCourse(input: {
    readonly title: string
    readonly mode: CourseMode
    readonly studentIds?: readonly string[]
  }): NodeRecord {
    const studentIds = [...(input.studentIds ?? [])]
    if (new Set(studentIds).size !== studentIds.length) {
      throw new CoreDataError('STUDENT_ALREADY_LINKED', '课程关联学生不能重复。')
    }
    if (input.mode === 'one_to_one' && studentIds.length > 1) {
      throw new CoreDataError('ONE_TO_ONE_ACTIVE_STUDENT', '一对一课程最多关联一位在读学生。')
    }
    studentIds.forEach((studentId) => this.requireActiveStudent(studentId))
    return this.transaction(() => {
      const course = this.nodes.createCourse(input.title, input.mode)
      const createdAt = this.now()
      const insert = this.database.prepare(
        `INSERT INTO course_students (course_id, student_id, created_at, ended_at)
         VALUES (?, ?, ?, NULL)`,
      )
      studentIds.forEach((studentId) => insert.run(course.id, studentId, createdAt))
      return course
    })
  }

  createStudent(name: string): StudentRecord {
    const normalizedName = normalizeName(name)
    return this.transaction(() => {
      const id = this.idFactory()
      const now = this.now()
      this.database
        .prepare(
          `INSERT INTO students (id, name, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, NULL)`,
        )
        .run(id, normalizedName, now, now)
      return this.requireStudent(id)
    })
  }

  createStudentForCourse(courseId: string, name: string): StudentRecord {
    this.requireActiveCourse(courseId)
    const normalizedName = normalizeName(name)
    return this.transaction(() => {
      this.assertCourseCanAcceptActiveStudent(courseId)
      const studentId = this.idFactory()
      const now = this.now()
      this.database
        .prepare(
          `INSERT INTO students (id, name, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, NULL)`,
        )
        .run(studentId, normalizedName, now, now)
      this.database
        .prepare(
          `INSERT INTO course_students (course_id, student_id, created_at, ended_at)
           VALUES (?, ?, ?, NULL)`,
        )
        .run(courseId, studentId, now)
      return this.requireStudent(studentId)
    })
  }

  linkStudentToCourse(courseId: string, studentId: string): CourseStudentLink {
    this.requireActiveCourse(courseId)
    this.requireActiveStudent(studentId)
    return this.transaction(() => {
      this.assertCourseCanAcceptActiveStudent(courseId)
      const now = this.now()
      try {
        this.database
          .prepare(
            `INSERT INTO course_students (course_id, student_id, created_at, ended_at)
             VALUES (?, ?, ?, NULL)`,
          )
          .run(courseId, studentId, now)
      } catch (error) {
        if (isConstraintError(error)) {
          throw new CoreDataError('STUDENT_ALREADY_LINKED', '学生已经关联到该课程。')
        }
        throw error
      }
      return this.requireLink(courseId, studentId)
    })
  }

  unlinkStudentFromCourse(courseId: string, studentId: string): void {
    this.endCourseStudentLink(courseId, studentId)
  }

  endCourseStudentLink(courseId: string, studentId: string): CourseStudentLink {
    this.requireActiveCourse(courseId)
    this.requireActiveStudent(studentId)
    return this.transaction(() => {
      const endedAt = this.now()
      const result = this.database
        .prepare(
          `UPDATE course_students SET ended_at = ?
            WHERE course_id = ? AND student_id = ? AND ended_at IS NULL`,
        )
        .run(endedAt, courseId, studentId)
      if (result.changes === 0) {
        throw new CoreDataError('STUDENT_NOT_LINKED', '学生不在该课程的在读名单中。')
      }
      return this.requireLink(courseId, studentId)
    })
  }

  reactivateCourseStudentLink(courseId: string, studentId: string): CourseStudentLink {
    this.requireActiveCourse(courseId)
    this.requireActiveStudent(studentId)
    return this.transaction(() => {
      const existing = this.requireLink(courseId, studentId)
      if (existing.endedAt === null) {
        throw new CoreDataError('STUDENT_ALREADY_LINKED', '学生已经在该课程中。')
      }
      this.assertCourseCanAcceptActiveStudent(courseId)
      this.database
        .prepare(
          `UPDATE course_students SET ended_at = NULL
            WHERE course_id = ? AND student_id = ?`,
        )
        .run(courseId, studentId)
      return this.requireLink(courseId, studentId)
    })
  }

  createNote(
    studentId: string,
    bodyMd: string,
    lessonId?: string,
    metadata?: { readonly noteKind?: 'manual' | DraftKind; readonly aiMetadata?: DraftNoteMetadata },
  ): NoteRecord {
    if (typeof bodyMd !== 'string' || bodyMd.trim().length === 0) {
      throw new CoreDataError('INVALID_NOTE', '记录内容不能为空。')
    }
    this.requireActiveStudent(studentId)
    if (lessonId !== undefined) {
      this.requireActiveLesson(lessonId)
    }
    return this.transaction(() => {
      const id = this.idFactory()
      const now = this.now()
      this.database
        .prepare(
          `INSERT INTO notes
             (id, student_id, lesson_id, body_md, created_at, updated_at, deleted_at,
              note_kind, ai_metadata_json, draft_status)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        )
        .run(
          id,
          studentId,
          lessonId ?? null,
          bodyMd.trim(),
          now,
          now,
          metadata?.noteKind ?? 'manual',
          metadata?.aiMetadata === undefined ? null : JSON.stringify(metadata.aiMetadata),
          metadata?.noteKind === undefined || metadata.noteKind === 'manual' ? null : 'draft',
        )
      return this.requireNote(id)
    })
  }

  createLessonDraft(
    lessonId: string,
    bodyMd: string,
    metadata: { readonly noteKind: DraftKind; readonly aiMetadata: DraftNoteMetadata },
    studentId?: string,
  ): NoteRecord {
    if (typeof bodyMd !== 'string' || bodyMd.trim().length === 0) {
      throw new CoreDataError('INVALID_NOTE', '记录内容不能为空。')
    }
    this.requireActiveLesson(lessonId)
    if (studentId !== undefined) {
      this.requireStudentLinkedToLessonCourse(lessonId, studentId)
    }
    return this.transaction(() => {
      const id = this.idFactory()
      const now = this.now()
      this.database
        .prepare(
          `INSERT INTO notes
             (id, student_id, lesson_id, body_md, created_at, updated_at, deleted_at,
              note_kind, ai_metadata_json, draft_status)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 'draft')`,
        )
        .run(
          id,
          studentId ?? null,
          lessonId,
          bodyMd.trim(),
          now,
          now,
          metadata.noteKind,
          JSON.stringify(metadata.aiMetadata),
        )
      return this.requireNote(id)
    })
  }

  getDraftLessonSnapshot(lessonId: string, studentId?: string): DraftLessonSnapshot {
    this.requireActiveLesson(lessonId)
    const row = this.database
      .prepare(
        `SELECT course.id AS course_id,
                course.title AS course_title,
                course.course_mode AS course_mode,
                period.title AS period_title,
                lesson.id AS lesson_id,
                lesson.title AS lesson_title
           FROM nodes AS lesson
           JOIN nodes AS period ON period.id = lesson.parent_id AND period.kind = 'period'
           JOIN nodes AS course ON course.id = period.parent_id AND course.kind = 'course'
          WHERE lesson.id = ?
            AND lesson.kind = 'lesson'
            AND lesson.deleted_at IS NULL
            AND period.deleted_at IS NULL
            AND course.deleted_at IS NULL`,
      )
      .get(lessonId) as DraftLessonContextRow | undefined
    if (row === undefined) {
      throw new CoreDataError('INVALID_LESSON', '课次缺少有效的课程或阶段上下文。')
    }

    let student: StudentRecord | undefined
    if (studentId !== undefined) {
      this.requireStudentLinkedToLessonCourse(lessonId, studentId)
      student = this.requireActiveStudent(studentId)
    }

    return {
      courseId: row.course_id,
      courseTitle: row.course_title,
      courseMode: row.course_mode,
      periodTitle: row.period_title,
      lessonId: row.lesson_id,
      lessonTitle: row.lesson_title,
      ...(student === undefined ? {} : { studentId: student.id, studentName: student.name }),
    }
  }

  updateNote(noteId: string, bodyMd: string): NoteRecord {
    if (typeof bodyMd !== 'string' || bodyMd.trim().length === 0) {
      throw new CoreDataError('INVALID_NOTE', '记录内容不能为空。')
    }
    return this.transaction(() => {
      const existing = this.requireActiveNote(noteId)
      this.database
        .prepare('UPDATE notes SET body_md = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
        .run(bodyMd.trim(), this.now(), existing.id)
      return this.requireNote(noteId)
    })
  }

  getActiveAiResult(noteId: string): NoteRecord & {
    readonly lessonId: string
    readonly noteKind: DraftKind
    readonly draftStatus: DraftStatus
  } {
    const note = this.requireActiveNote(noteId)
    if (note.noteKind === undefined || note.noteKind === 'manual' || note.draftStatus === undefined) {
      throw new CoreDataError('INVALID_DRAFT', '所选记录不是 AI 生成结果。')
    }
    if (note.lessonId === null) {
      throw new CoreDataError('INVALID_DRAFT', '所选结果缺少当前课次。')
    }
    return note as NoteRecord & {
      readonly lessonId: string
      readonly noteKind: DraftKind
      readonly draftStatus: DraftStatus
    }
  }

  saveDraftToLesson(noteId: string, bodyMd?: string): NoteRecord {
    const normalizedBody = bodyMd === undefined ? undefined : normalizeNoteBody(bodyMd)
    return this.transaction(() => {
      const existing = this.getActiveAiResult(noteId)
      this.requireActiveLesson(existing.lessonId)
      this.database
        .prepare(
          `UPDATE notes
              SET body_md = COALESCE(?, body_md), draft_status = 'saved', updated_at = ?
            WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(normalizedBody ?? null, this.now(), existing.id)
      return this.requireActiveNote(existing.id)
    })
  }

  softDeleteDraft(noteId: string): NoteRecord {
    return this.transaction(() => {
      const existing = this.getActiveAiResult(noteId)
      if (existing.draftStatus !== 'draft') {
        throw new CoreDataError('INVALID_DRAFT', '已保存到课次的结果不能从草稿箱删除。')
      }
      const now = this.now()
      this.database
        .prepare('UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
        .run(now, now, existing.id)
      return this.requireNote(existing.id)
    })
  }

  getOverview(): CoreOverview {
    return {
      nodes: this.nodes.listNodes(),
      students: this.listStudents(),
      courseStudentLinks: this.listLinks(),
      notes: this.listNotes(),
      courseProgress: this.progress.listProgress(),
      lessonSessions: this.progress.listLessonSessions(),
    }
  }

  listStudents(): StudentRecord[] {
    const rows = this.database
      .prepare(
        `SELECT id, name, created_at, updated_at, deleted_at
           FROM students
          WHERE deleted_at IS NULL
          ORDER BY created_at, id`,
      )
      .all() as StudentRow[]
    return rows.map(mapStudent)
  }

  listStudentsForCourse(
    courseId: string,
    options: { readonly includeEnded?: boolean } = {},
  ): StudentRecord[] {
    this.requireActiveCourse(courseId)
    const rows = this.database
      .prepare(
        `SELECT s.id, s.name, s.created_at, s.updated_at, s.deleted_at
           FROM students AS s
           JOIN course_students AS cs ON cs.student_id = s.id
          WHERE cs.course_id = ?
            ${options.includeEnded ? '' : 'AND cs.ended_at IS NULL'}
            AND s.deleted_at IS NULL
          ORDER BY s.created_at, s.id`,
      )
      .all(courseId) as StudentRow[]
    return rows.map(mapStudent)
  }

  listNotesForStudent(studentId: string): NoteRecord[] {
    this.requireActiveStudent(studentId)
    return this.listNotes(studentId)
  }

  private listNotes(studentId?: string): NoteRecord[] {
    const rows = this.database
      .prepare(
        `SELECT id, student_id, lesson_id, body_md, created_at, updated_at, deleted_at,
                note_kind, ai_metadata_json, draft_status
           FROM notes
          WHERE deleted_at IS NULL
            AND (? IS NULL OR student_id = ?)
          ORDER BY created_at, id`,
      )
      .all(studentId ?? null, studentId ?? null) as NoteRow[]
    return rows.map(mapNote)
  }

  private listLinks(): CourseStudentLink[] {
    const rows = this.database
      .prepare(
        `SELECT course_id, student_id, created_at, ended_at
           FROM course_students
          ORDER BY created_at, course_id, student_id`,
      )
      .all() as LinkRow[]
    return rows.map(mapLink)
  }

  private requireActiveCourse(courseId: string): void {
    const node = this.nodes.getNode(courseId, true)
    if (node === undefined || node.kind !== 'course') {
      throw new CoreDataError('COURSE_NOT_FOUND', '课程不存在。')
    }
    if (node.deletedAt !== null) {
      throw new CoreDataError('COURSE_DELETED', '课程已删除，请先恢复。')
    }
  }

  private requireActiveStudent(studentId: string): StudentRecord {
    const student = this.findStudent(studentId)
    if (student === undefined) {
      throw new CoreDataError('STUDENT_NOT_FOUND', '学生不存在。')
    }
    if (student.deletedAt !== null) {
      throw new CoreDataError('STUDENT_DELETED', '学生已删除，请先恢复。')
    }
    return student
  }

  private requireActiveLesson(lessonId: string): void {
    const lesson = this.nodes.getNode(lessonId, true)
    if (lesson === undefined) {
      throw new CoreDataError('LESSON_NOT_FOUND', '课次不存在。')
    }
    if (lesson.kind !== 'lesson') {
      throw new CoreDataError('INVALID_LESSON', '记录只能关联课次节点。')
    }
    if (lesson.deletedAt !== null) {
      throw new CoreDataError('LESSON_DELETED', '课次已删除，请先恢复。')
    }
  }

  private requireStudentLinkedToLessonCourse(lessonId: string, studentId: string): void {
    this.requireActiveStudent(studentId)
    const linked = this.database
      .prepare(
        `SELECT 1
           FROM nodes AS lesson
           JOIN nodes AS period ON period.id = lesson.parent_id
           JOIN nodes AS course ON course.id = period.parent_id
           JOIN course_students AS cs
             ON cs.course_id = course.id AND cs.student_id = ?
          WHERE lesson.id = ?
            AND lesson.kind = 'lesson'
            AND period.kind = 'period'
            AND course.kind = 'course'
            AND lesson.deleted_at IS NULL
            AND period.deleted_at IS NULL
            AND course.deleted_at IS NULL`,
      )
      .get(studentId, lessonId)
    if (linked === undefined) {
      throw new CoreDataError('STUDENT_NOT_LINKED', '所选学生不属于当前课次的课程。')
    }
  }

  private findStudent(studentId: string): StudentRecord | undefined {
    const row = this.database
      .prepare(
        `SELECT id, name, created_at, updated_at, deleted_at
           FROM students
          WHERE id = ?`,
      )
      .get(studentId) as StudentRow | undefined
    return row === undefined ? undefined : mapStudent(row)
  }

  private requireStudent(studentId: string): StudentRecord {
    const student = this.findStudent(studentId)
    if (student === undefined) {
      throw new CoreDataError('STUDENT_NOT_FOUND', '学生不存在。')
    }
    return student
  }

  private requireLink(courseId: string, studentId: string): CourseStudentLink {
    const row = this.database
      .prepare(
        `SELECT course_id, student_id, created_at, ended_at
           FROM course_students
          WHERE course_id = ? AND student_id = ?`,
      )
      .get(courseId, studentId) as LinkRow | undefined
    if (row === undefined) {
      throw new CoreDataError('STUDENT_NOT_LINKED', '学生关联不存在。')
    }
    return mapLink(row)
  }

  private requireNote(noteId: string): NoteRecord {
    const row = this.database
      .prepare(
        `SELECT id, student_id, lesson_id, body_md, created_at, updated_at, deleted_at,
                note_kind, ai_metadata_json, draft_status
           FROM notes
          WHERE id = ?`,
      )
      .get(noteId) as NoteRow | undefined
    if (row === undefined) {
      throw new CoreDataError('INVALID_NOTE', '记录创建失败。')
    }
    return mapNote(row)
  }

  private requireActiveNote(noteId: string): NoteRecord {
    const note = this.requireNote(noteId)
    if (note.deletedAt !== null) {
      throw new CoreDataError('INVALID_NOTE', '记录已删除。')
    }
    return note
  }

  private assertCourseCanAcceptActiveStudent(courseId: string): void {
    const course = this.nodes.getNode(courseId)
    if (course?.kind !== 'course') {
      throw new CoreDataError('COURSE_NOT_FOUND', '课程不存在。')
    }
    if (course.courseMode !== 'one_to_one') return
    const row = this.database
      .prepare(
        `SELECT COUNT(*) AS count
           FROM course_students
          WHERE course_id = ? AND ended_at IS NULL`,
      )
      .get(courseId) as { count: number }
    if (row.count >= 1) {
      throw new CoreDataError('ONE_TO_ONE_ACTIVE_STUDENT', '一对一课程最多关联一位在读学生。')
    }
  }

  private transaction<T>(callback: () => T): T {
    return this.database.transaction(callback).immediate()
  }
}

function normalizeName(name: string): string {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new CoreDataError('INVALID_NAME', '学生姓名不能为空。')
  }
  return name.trim()
}

function normalizeNoteBody(bodyMd: string): string {
  if (typeof bodyMd !== 'string' || bodyMd.trim().length === 0) {
    throw new CoreDataError('INVALID_NOTE', '记录内容不能为空。')
  }
  return bodyMd.trim()
}

function mapStudent(row: StudentRow): StudentRecord {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

function mapLink(row: LinkRow): CourseStudentLink {
  return {
    courseId: row.course_id,
    studentId: row.student_id,
    createdAt: row.created_at,
    endedAt: row.ended_at,
  }
}

function mapNote(row: NoteRow): NoteRecord {
  let aiMetadata: DraftNoteMetadata | undefined
  if (row.ai_metadata_json !== null) {
    try {
      const parsed: unknown = JSON.parse(row.ai_metadata_json)
      if (isDraftNoteMetadata(parsed)) aiMetadata = parsed
    } catch {
      // Optional metadata must not make the editable note unavailable.
    }
  }
  if (row.note_kind !== 'manual' && !isDraftStatus(row.draft_status)) {
    throw new CoreDataError('INVALID_DRAFT', '草稿生命周期状态无效。')
  }
  return {
    id: row.id,
    studentId: row.student_id,
    lessonId: row.lesson_id,
    bodyMd: row.body_md,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    ...(row.note_kind === 'manual' ? {} : { noteKind: row.note_kind }),
    ...(row.note_kind === 'manual' ? {} : { draftStatus: row.draft_status as DraftStatus }),
    ...(aiMetadata === undefined ? {} : { aiMetadata }),
  }
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed')
}
