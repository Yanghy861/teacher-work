import { randomUUID } from 'node:crypto'

import type {
  CourseStudentLink,
  CoreOverview,
  NoteRecord,
  StudentRecord,
} from '../../shared/core-contracts'
import { isDraftNoteMetadata, type DraftKind, type DraftNoteMetadata } from '../../shared/draft-contracts'
import type { SqliteDatabase } from '../db/migrations'
import { NodeService } from './node-service'

export type CoreDataErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_NOTE'
  | 'STUDENT_NOT_FOUND'
  | 'STUDENT_DELETED'
  | 'COURSE_NOT_FOUND'
  | 'COURSE_DELETED'
  | 'STUDENT_ALREADY_LINKED'
  | 'STUDENT_NOT_LINKED'
  | 'LESSON_NOT_FOUND'
  | 'LESSON_DELETED'
  | 'INVALID_LESSON'

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
}

interface NoteRow {
  readonly id: string
  readonly student_id: string
  readonly lesson_id: string | null
  readonly body_md: string
  readonly created_at: string
  readonly updated_at: string
  readonly deleted_at: string | null
  readonly note_kind: 'manual' | DraftKind
  readonly ai_metadata_json: string | null
}

export class CoreDataService {
  readonly nodes: NodeService
  private readonly idFactory: () => string
  private readonly now: () => string

  constructor(
    private readonly database: SqliteDatabase,
    options: CoreDataServiceOptions = {},
  ) {
    this.idFactory = options.idFactory ?? randomUUID
    this.now = options.now ?? (() => new Date().toISOString())
    this.nodes = new NodeService(database, options)
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
          `INSERT INTO course_students (course_id, student_id, created_at)
           VALUES (?, ?, ?)`,
        )
        .run(courseId, studentId, now)
      return this.requireStudent(studentId)
    })
  }

  linkStudentToCourse(courseId: string, studentId: string): CourseStudentLink {
    this.requireActiveCourse(courseId)
    this.requireActiveStudent(studentId)
    return this.transaction(() => {
      const now = this.now()
      try {
        this.database
          .prepare(
            `INSERT INTO course_students (course_id, student_id, created_at)
             VALUES (?, ?, ?)`,
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
    const result = this.database
      .prepare('DELETE FROM course_students WHERE course_id = ? AND student_id = ?')
      .run(courseId, studentId)
    if (result.changes === 0) {
      throw new CoreDataError('STUDENT_NOT_LINKED', '学生尚未关联到该课程。')
    }
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
             (id, student_id, lesson_id, body_md, created_at, updated_at, deleted_at, note_kind, ai_metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
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
        )
      return this.requireNote(id)
    })
  }

  updateNote(noteId: string, bodyMd: string): NoteRecord {
    if (typeof bodyMd !== 'string' || bodyMd.trim().length === 0) {
      throw new CoreDataError('INVALID_NOTE', '记录内容不能为空。')
    }
    return this.transaction(() => {
      const existing = this.requireNote(noteId)
      this.database
        .prepare('UPDATE notes SET body_md = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
        .run(bodyMd.trim(), this.now(), existing.id)
      return this.requireNote(noteId)
    })
  }

  getOverview(): CoreOverview {
    return {
      nodes: this.nodes.listNodes(),
      students: this.listStudents(),
      courseStudentLinks: this.listLinks(),
      notes: this.listNotes(),
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

  listStudentsForCourse(courseId: string): StudentRecord[] {
    this.requireActiveCourse(courseId)
    const rows = this.database
      .prepare(
        `SELECT s.id, s.name, s.created_at, s.updated_at, s.deleted_at
           FROM students AS s
           JOIN course_students AS cs ON cs.student_id = s.id
          WHERE cs.course_id = ?
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
                note_kind, ai_metadata_json
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
        `SELECT course_id, student_id, created_at
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
        `SELECT course_id, student_id, created_at
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
                note_kind, ai_metadata_json
           FROM notes
          WHERE id = ?`,
      )
      .get(noteId) as NoteRow | undefined
    if (row === undefined) {
      throw new CoreDataError('INVALID_NOTE', '记录创建失败。')
    }
    return mapNote(row)
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
  return {
    id: row.id,
    studentId: row.student_id,
    lessonId: row.lesson_id,
    bodyMd: row.body_md,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    ...(row.note_kind === 'manual' ? {} : { noteKind: row.note_kind }),
    ...(aiMetadata === undefined ? {} : { aiMetadata }),
  }
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed')
}
