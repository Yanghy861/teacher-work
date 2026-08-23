import { describe, expect, it } from 'vitest'

import type { CoreOverview, NodeRecord } from '../src/shared/core-contracts'
import {
  buildStudentSummaries,
  listStudentLessonOptions,
} from '../src/renderer/students-view-model'

const stamp = '2026-08-23T00:00:00.000Z'

function node(id: string, kind: NodeRecord['kind'], parentId: string | null, sortOrder = 0): NodeRecord {
  return {
    id,
    kind,
    parentId,
    sortOrder,
    title: id,
    courseMode: kind === 'course' ? 'class' : null,
    contentMd: '',
    createdAt: stamp,
    updatedAt: stamp,
    deletedAt: null,
  }
}

function fixture(): CoreOverview {
  return {
    nodes: [
      node('active-course', 'course', null),
      node('active-period', 'period', 'active-course'),
      node('active-lesson', 'lesson', 'active-period'),
      node('ended-course', 'course', null, 1),
      node('ended-period', 'period', 'ended-course'),
      node('ended-lesson', 'lesson', 'ended-period'),
      node('left-course', 'course', null, 2),
    ],
    students: [{ id: 'student', name: '学生甲', createdAt: stamp, updatedAt: stamp, deletedAt: null }],
    courseStudentLinks: [
      { courseId: 'active-course', studentId: 'student', createdAt: stamp, endedAt: null },
      { courseId: 'ended-course', studentId: 'student', createdAt: stamp, endedAt: null },
      { courseId: 'left-course', studentId: 'student', createdAt: stamp, endedAt: stamp },
    ],
    courseProgress: [{
      courseId: 'ended-course',
      activePeriodId: 'ended-period',
      currentLessonId: 'ended-lesson',
      endedAt: stamp,
      updatedAt: stamp,
    }],
    lessonSessions: [],
    notes: [
      { id: 'manual-old', studentId: 'student', lessonId: null, bodyMd: '旧记录', createdAt: stamp, updatedAt: stamp, deletedAt: null },
      { id: 'manual-new', studentId: 'student', lessonId: 'active-lesson', bodyMd: '新记录', createdAt: stamp, updatedAt: '2026-08-24T00:00:00.000Z', deletedAt: null, noteKind: 'manual' },
      { id: 'draft', studentId: 'student', lessonId: 'active-lesson', bodyMd: 'AI 草稿', createdAt: stamp, updatedAt: '2026-08-25T00:00:00.000Z', deletedAt: null, noteKind: 'lecture', draftStatus: 'draft' },
    ],
  }
}

describe('V12-03 students view model', () => {
  it('separates active courses from student-exited or course-ended history', () => {
    const summary = buildStudentSummaries(fixture())[0]
    expect(summary.activeCourses.map((item) => item.course.id)).toEqual(['active-course'])
    expect(summary.historicalCourses.map((item) => [item.course.id, item.historyReason])).toEqual([
      ['ended-course', 'course_ended'],
      ['left-course', 'student_ended'],
    ])
  })

  it('shows only manual notes and uses the newest manual record in the list', () => {
    const summary = buildStudentSummaries(fixture())[0]
    expect(summary.manualNotes.map((note) => note.id)).toEqual(['manual-new', 'manual-old'])
    expect(summary.latestManualNote?.bodyMd).toBe('新记录')
  })

  it('offers lessons from both current and historical course relations', () => {
    const overview = fixture()
    const summary = buildStudentSummaries(overview)[0]
    expect(listStudentLessonOptions(overview, summary).map((option) => option.lesson.id)).toEqual([
      'active-lesson',
      'ended-lesson',
    ])
  })
})
