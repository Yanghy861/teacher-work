import { describe, expect, it } from 'vitest'

import type { NodeRecord, StudentRecord } from '../src/shared/core-contracts'
import type { ManagedFileOverview, ManagedFileRecord } from '../src/shared/file-contracts'
import {
  buildLessonMaterialTree,
  createLessonPrepContext,
  filterLessonMaterialFiles,
  isSelectableLessonPrepFile,
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

function file(id: string, name: string, mimeType = 'text/plain'): ManagedFileRecord {
  return {
    id,
    originalName: name,
    sizeBytes: 10,
    mimeType,
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
    const imageCopy = file('image-copy', '讲义图片.png', 'image/png')
    const unrelated = file('other-file', '其他课次.docx')
    const overview: ManagedFileOverview = {
      files: [externalCopy, materialCopy, imageCopy, unrelated],
      links: [
        { fileId: externalCopy.id, targetType: 'lesson', targetId: 'lesson-1', createdAt: '1' },
        { fileId: materialCopy.id, targetType: 'lesson', targetId: 'lesson-1', createdAt: '2' },
        { fileId: imageCopy.id, targetType: 'lesson', targetId: 'lesson-1', createdAt: '3' },
        { fileId: unrelated.id, targetType: 'lesson', targetId: 'lesson-2', createdAt: '4' },
      ],
    }

    const lessonFiles = listLessonPrepFiles(overview, 'lesson-1')
    expect(lessonFiles.map((item) => item.id)).toEqual([externalCopy.id, materialCopy.id, imageCopy.id])
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

  it('keeps markdown files flat and nests referenced assets below their document', () => {
    const lecture = file('lecture', '三角形基础.md', 'text/markdown')
    const definition = file('definition', '课本定义.md', 'text/markdown')
    const lectureImage = file('lecture-image', 'triangle.png', 'image/png')
    const duplicateLectureImage = file('lecture-image-copy', 'triangle.png', 'image/png')
    const definitionImage = file('definition-image', 'definition.png', 'image/png')
    const orphanImage = file('orphan-image', '未引用.png', 'image/png')

    const tree = buildLessonMaterialTree(
      [lecture, definition, lectureImage, duplicateLectureImage, definitionImage, orphanImage],
      new Map([
        [lecture.id, '![图](assets/triangle.png)'],
        [definition.id, '![共享图](assets/triangle.png)\n![图](assets/definition.png)'],
      ]),
    )

    expect(tree.map((node) => node.file.id)).toEqual([
      lecture.id,
      definition.id,
      orphanImage.id,
    ])
    expect(tree.find((node) => node.file.id === lecture.id)?.children.map((child) => child.id)).toEqual([
      lectureImage.id,
      duplicateLectureImage.id,
    ])
    expect(tree.find((node) => node.file.id === definition.id)?.children.map((child) => child.id)).toEqual([
      lectureImage.id,
      duplicateLectureImage.id,
      definitionImage.id,
    ])
    expect(isSelectableLessonPrepFile(lectureImage)).toBe(false)
    expect(isSelectableLessonPrepFile(lecture)).toBe(true)
  })

  it('hides exported folder index markdown while keeping real lesson documents and feedback', () => {
    const stageIndex = file('stage', '七年级春季.md', 'text/markdown')
    const lessonIndex = file('lesson-index', '第二课.md', 'text/markdown')
    const lecture = file('lecture', '三角形基础.md', 'text/markdown')
    const feedback = file('feedback', '课后反馈.md', 'text/markdown')

    expect(filterLessonMaterialFiles(
      [stageIndex, lessonIndex, lecture, feedback],
      { periodTitle: '七年级春季', lessonLabel: '第二课' },
    ).map((item) => item.id)).toEqual([lecture.id, feedback.id])
  })
})
