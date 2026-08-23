import { describe, expect, it } from 'vitest'

import type { CoreOverview, NodeRecord } from '../src/shared/core-contracts'
import {
  buildCourseSummaries,
  getLessonNumber,
  listTodayAttendance,
  localDateTimeToUtc,
  suggestConfirmedDecision,
} from '../src/renderer/course-view-model'

const stamp = '2026-08-23T00:00:00.000Z'

function node(
  id: string,
  kind: NodeRecord['kind'],
  parentId: string | null,
  sortOrder: number,
  title = id,
): NodeRecord {
  return {
    id,
    kind,
    parentId,
    sortOrder,
    title,
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
      node('course', 'course', null, 0, '课程'),
      node('period-a', 'period', 'course', 0, '秋季'),
      node('lesson-2', 'lesson', 'period-a', 1, '运算'),
      node('lesson-1', 'lesson', 'period-a', 0, '认识'),
      node('period-b', 'period', 'course', 1, '春季'),
      node('lesson-3', 'lesson', 'period-b', 0, '方程'),
    ],
    students: [{ id: 'student', name: '学生', createdAt: stamp, updatedAt: stamp, deletedAt: null }],
    courseStudentLinks: [{ courseId: 'course', studentId: 'student', createdAt: stamp, endedAt: null }],
    notes: [{
      id: 'draft',
      studentId: null,
      lessonId: 'lesson-1',
      bodyMd: '草稿',
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
      noteKind: 'lecture',
      draftStatus: 'draft',
    }],
    courseProgress: [{
      courseId: 'course',
      activePeriodId: 'period-a',
      currentLessonId: 'lesson-1',
      endedAt: null,
      updatedAt: stamp,
    }],
    lessonSessions: [{
      lessonId: 'lesson-2',
      scheduledAt: null,
      taughtConfirmedAt: null,
      attendanceRecordedAt: null,
      presentCount: 0,
      leaveCount: 0,
      absentCount: 0,
      totalCount: 0,
    }],
  }
}

describe('V12-02 course renderer view model', () => {
  it('separates current lesson from display order and finds the current draft action', () => {
    const overview = fixture()
    const summary = buildCourseSummaries(overview)[0]
    expect(summary.currentLesson?.id).toBe('lesson-1')
    expect(summary.primaryAction).toBe('continue_prep')
    expect(summary.activeStudents.map((student) => student.id)).toEqual(['student'])
    expect(getLessonNumber(overview.nodes, 'period-a', 'lesson-2')).toBe(2)
  })

  it('suggests only a later unconfirmed lesson in the same period and keeps non-current progress', () => {
    const overview = fixture()
    const summary = buildCourseSummaries(overview)[0]
    expect(suggestConfirmedDecision(overview, summary, 'lesson-1')).toEqual({
      type: 'set',
      lessonId: 'lesson-2',
    })
    expect(suggestConfirmedDecision(overview, summary, 'lesson-3')).toEqual({ type: 'keep' })
    const taughtOverview: CoreOverview = { ...overview, lessonSessions: [{
      ...overview.lessonSessions[0],
      taughtConfirmedAt: stamp,
    }] }
    expect(suggestConfirmedDecision(taughtOverview, summary, 'lesson-1')).toEqual({ type: 'clear' })
  })

  it('uses local-day UTC boundaries and hides ended courses from today attendance', () => {
    const overview = fixture()
    const localNow = new Date(2026, 7, 23, 12, 0)
    const todaySchedule = new Date(2026, 7, 23, 18, 30).toISOString()
    const scheduledOverview: CoreOverview = { ...overview, lessonSessions: [{
      ...overview.lessonSessions[0],
      scheduledAt: todaySchedule,
    }] }
    expect(listTodayAttendance(scheduledOverview, localNow)).toMatchObject([
      { lesson: { id: 'lesson-2' }, activeStudentCount: 1, lessonNumber: 2 },
    ])
    const outsideToday: CoreOverview = {
      ...scheduledOverview,
      lessonSessions: [{
        ...scheduledOverview.lessonSessions[0],
        scheduledAt: new Date(2026, 7, 24, 0, 0).toISOString(),
      }],
    }
    expect(listTodayAttendance(outsideToday, localNow)).toEqual([])
    const endedOverview: CoreOverview = {
      ...scheduledOverview,
      courseProgress: [{ ...scheduledOverview.courseProgress[0], endedAt: stamp }],
    }
    expect(listTodayAttendance(endedOverview, localNow)).toEqual([])
  })

  it('converts datetime-local input to strict UTC ISO without guessing a fixed timezone', () => {
    const converted = localDateTimeToUtc('2026-08-23T18:30')
    expect(converted).toBe(new Date(2026, 7, 23, 18, 30).toISOString())
    expect(localDateTimeToUtc('')).toBeNull()
  })
})
