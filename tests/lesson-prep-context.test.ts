import { describe, expect, it } from 'vitest'

import type { NodeRecord, StudentRecord } from '../src/shared/core-contracts'
import type { ManagedFileOverview, ManagedFileRecord } from '../src/shared/file-contracts'
import {
  createLessonPrepContext,
  listLessonPrepFiles,
  reconcileSelectedLessonFileIds,
} from '../src/renderer/lesson-prep-context'

function node(
  id: string,
  kind: NodeRecord['kind'],
  title: string,
  courseMode: NodeRecord['courseMode'] = null,
): NodeRecord {
  return {
    id,
    parentId: null,
    kind,
    title,
    courseMode,
    sortOrder: 0,
    contentMd: '',
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T00:00:00.000Z',
    deletedAt: null,
  }
}

function student(id: string, name: string): StudentRecord {
  return {
    id,
    name,
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T00:00:00.000Z',
    deletedAt: null,
  }
}

function file(id: string, name: string): ManagedFileRecord {
  return {
    id,
    originalName: name,
    sizeBytes: 10,
    mimeType: 'text/plain',
    originFileId: null,
    mtimeMs: 1,
    contentHash: null,
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T00:00:00.000Z',
    deletedAt: null,
  }
}

describe('V11-02 lesson prep renderer state', () => {
  it('carries an associated student for one-to-one but never requires one for a class', () => {
    const lesson = node('lesson-1', 'lesson', '圆的面积')
    const linkedStudent = student('student-1', '张同学')

    expect(createLessonPrepContext(
      node('course-1', 'course', '一对一数学', 'one_to_one'),
      lesson,
      [linkedStudent],
    )).toMatchObject({
      lessonId: lesson.id,
      studentId: linkedStudent.id,
      studentNames: ['张同学'],
    })
    expect(createLessonPrepContext(
      node('course-2', 'course', '六年级班课', 'class'),
      lesson,
      [],
    )).toEqual(expect.not.objectContaining({ studentId: expect.anything() }))
  })

  it('lists only persistent lesson copies and selects newly added files by default', () => {
    const externalCopy = file('external-copy', '外部讲义.md')
    const materialCopy = file('material-copy', '素材练习.pdf')
    const unrelated = file('other-file', '其他课次.docx')
    const overview: ManagedFileOverview = {
      files: [externalCopy, materialCopy, unrelated],
      links: [
        { fileId: externalCopy.id, targetType: 'lesson', targetId: 'lesson-1', createdAt: '1' },
        { fileId: materialCopy.id, targetType: 'lesson', targetId: 'lesson-1', createdAt: '2' },
        { fileId: unrelated.id, targetType: 'lesson', targetId: 'lesson-2', createdAt: '3' },
      ],
    }

    const lessonFiles = listLessonPrepFiles(overview, 'lesson-1')
    expect(lessonFiles.map((item) => item.id)).toEqual([externalCopy.id, materialCopy.id])
    expect(reconcileSelectedLessonFileIds([], new Set(), lessonFiles)).toEqual([
      externalCopy.id,
      materialCopy.id,
    ])
    expect(reconcileSelectedLessonFileIds(
      [externalCopy.id],
      new Set([externalCopy.id]),
      lessonFiles,
    )).toEqual([externalCopy.id, materialCopy.id])
  })
})
