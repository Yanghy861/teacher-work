import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { runMigrations } from '../src/main/db/migrations'
import type { DraftKind, DraftNoteMetadata } from '../src/shared/draft-contracts'
import {
  createPrepContextFromOverview,
  listDraftInbox,
  listLessonAiResults,
} from '../src/renderer/draft-view-model'

describe('V11-04 draft inbox view model', () => {
  it('lists only active drafts globally and all AI results for the selected lesson', () => {
    const database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    runMigrations(database)
    let id = 0
    let second = 0
    const core = new CoreDataService(database, {
      idFactory: () => `view-${id++}`,
      now: () => `2026-08-22T00:00:${String(second++).padStart(2, '0')}.000Z`,
    })

    try {
      const course = core.nodes.createCourse('初中数学一对一', 'one_to_one')
      const period = core.nodes.createPeriod(course.id, '八年级上册')
      const firstLesson = core.nodes.createLesson(period.id, '一次函数')
      const secondLesson = core.nodes.createLesson(period.id, '整式乘法')
      const student = core.createStudentForCourse(course.id, '学生甲')

      const savedResult = core.createLessonDraft(
        firstLesson.id,
        '# 已保存讲义',
        metadata('lecture'),
        student.id,
      )
      core.saveDraftToLesson(savedResult.id)
      const inboxDraft = core.createLessonDraft(
        secondLesson.id,
        '# 作业草稿',
        metadata('homework'),
        student.id,
      )
      const deletedDraft = core.createLessonDraft(
        firstLesson.id,
        '# 删除的例题',
        metadata('example'),
        student.id,
      )
      core.softDeleteDraft(deletedDraft.id)
      core.createNote(student.id, '普通课堂记录', firstLesson.id)

      const overview = core.getOverview()
      expect(listDraftInbox(overview)).toEqual([
        expect.objectContaining({
          note: expect.objectContaining({ id: inboxDraft.id, draftStatus: 'draft' }),
          courseTitle: '初中数学一对一',
          lessonTitle: '整式乘法',
          context: expect.objectContaining({ studentId: student.id }),
        }),
      ])
      expect(listLessonAiResults(overview, firstLesson.id)).toEqual([
        expect.objectContaining({ id: savedResult.id, draftStatus: 'saved' }),
      ])
      expect(createPrepContextFromOverview(overview, secondLesson.id, student.id)).toMatchObject({
        courseId: course.id,
        lessonId: secondLesson.id,
        studentId: student.id,
      })
    } finally {
      database.close()
    }
  })
})

function metadata(kind: DraftKind): { readonly noteKind: DraftKind; readonly aiMetadata: DraftNoteMetadata } {
  return {
    noteKind: kind,
    aiMetadata: {
      kind,
      promptVersion: 'v11-03-v1',
      provider: 'openai-compatible',
      model: 'fake-model',
      sources: [{ fileId: 'source-file', charsSent: 4 }],
      inputChars: 4,
      maxChars: 100,
      maxTokens: 100,
    },
  }
}
