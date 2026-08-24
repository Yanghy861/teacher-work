import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'
import { createLessonPrepContext } from '../src/renderer/lesson-prep-context'
import {
  applyFreeDateSchedule,
  applyUnscheduledLessons,
  buildCreateCourseSetupRequest,
  buildEmptyLessons,
  buildScheduleReview,
  clearLessonSchedule,
  createInitialQuickCourseWizardState,
  generateRegularSchedule,
  localDateTimeToUtcIso,
  parseStudentRoster,
  parseTeachingPlan,
  resolveRosterDuplicate,
  setLessonLocalSchedule,
  type QuickCourseWizardState,
} from '../src/renderer/quick-course-wizard-model'

describe('V13-05 V1.3 end-to-end acceptance', () => {
  it('persists all three quick-course modes and keeps V1.2 maintenance flows usable after restart', () => {
    const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-v13-05-'))
    const installPath = join(root, 'install')
    let workspace: WorkspaceHandle | undefined = initializeWorkspace(join(root, 'workspace'), installPath)

    try {
      let core = new CoreDataService(workspace.database.raw)
      const duplicateA = core.createStudent('同名学生')
      const duplicateB = core.createStudent('同名学生')

      const parsedRoster = parseStudentRoster(
        '同名学生\n新学生\n同名学生',
        core.getOverview().students,
      )
      expect(parsedRoster.duplicateInputNames).toEqual(['同名学生'])
      expect(parsedRoster.entries.find((entry) => entry.name === '同名学生')).toMatchObject({
        candidates: [expect.any(Object), expect.any(Object)],
        resolution: null,
      })
      const resolvedRoster = resolveRosterDuplicate(parsedRoster, '同名学生', {
        type: 'existing',
        studentId: duplicateB.id,
      })

      const regularGenerated = generateRegularSchedule(
        parseTeachingPlan('有理数\n整式\n几何图形初步'),
        {
          firstDate: '2026-09-05',
          time: '14:00',
          repeat: 'biweekly',
          excludedDates: ['2026-09-19'],
          durationMinutes: 90,
        },
      )
      expect(buildScheduleReview(regularGenerated)).toMatchObject({
        status: 'all',
        countText: '3/3 节已排',
      })
      const regularAdjusted = clearLessonSchedule(
        setLessonLocalSchedule(regularGenerated, 'lesson-1', '2026-09-06', '15:30'),
        'lesson-2',
      )
      const regularState: QuickCourseWizardState = {
        ...createInitialQuickCourseWizardState(new Date(2026, 7, 24)),
        currentStep: 4,
        courseTitle: 'V1.3 两周规律班',
        roster: resolvedRoster,
        periodTitle: '2026 秋季',
        lessonMode: 'plan',
        lessons: regularAdjusted,
        scheduleMode: 'regular',
      }
      expect(buildScheduleReview(regularState.lessons)).toMatchObject({
        status: 'partial',
        countText: '2/3 节已排 · 1 节未排',
      })
      const regular = core.createCourseSetup(buildCreateCourseSetupRequest(regularState))
      expect(regular.students.map((student) => student.name)).toEqual(['同名学生', '新学生'])
      expect(regular.courseStudentLinks).toHaveLength(2)
      expect(regular.lessons.map((lesson) => lesson.title)).toEqual(['有理数', '整式', '几何图形初步'])

      const freeDates = ['2026-07-06', '2026-07-09', '2026-07-15']
      const freeState: QuickCourseWizardState = {
        ...createInitialQuickCourseWizardState(new Date(2026, 6, 1)),
        currentStep: 4,
        courseTitle: 'V1.3 暑假集训班',
        periodTitle: '2026 暑假',
        lessonMode: 'plan',
        lessons: applyFreeDateSchedule(
          parseTeachingPlan('专题一\n专题二\n专题三\n专题四'),
          { dates: freeDates, time: '09:00', durationMinutes: 120 },
        ),
        scheduleMode: 'free_dates',
        selectedFreeDates: freeDates,
        freeDateRemainderAccepted: true,
      }
      expect(buildScheduleReview(freeState.lessons)).toMatchObject({
        status: 'partial',
        countText: '3/4 节已排 · 1 节未排',
      })
      const free = core.createCourseSetup(buildCreateCourseSetupRequest(freeState))

      const unscheduledState: QuickCourseWizardState = {
        ...createInitialQuickCourseWizardState(new Date(2026, 7, 24)),
        currentStep: 4,
        courseTitle: 'V1.3 暂不排课一对一',
        mode: 'one_to_one',
        periodTitle: '2026 秋季',
        lessons: applyUnscheduledLessons(buildEmptyLessons(2), 90),
        scheduleMode: 'unscheduled',
      }
      expect(buildScheduleReview(unscheduledState.lessons)).toMatchObject({
        status: 'none',
        headline: '暂未安排上课时间',
        countText: '0/2 节已排 · 2 节未排',
        durationMinutes: 90,
      })
      const unscheduled = core.createCourseSetup(buildCreateCourseSetupRequest(unscheduledState))
      expect(unscheduled.students).toEqual([])

      const createdOverview = core.getOverview()
      expect(createdOverview.lessonSessions).toHaveLength(9)
      expect(createdOverview.lessonSessions.every((session) => (
        session.taughtConfirmedAt === null && session.attendanceRecordedAt === null
      ))).toBe(true)
      expect(regular.progress.currentLessonId).toBe(regular.lessons[0]!.id)
      expect(free.progress.currentLessonId).toBe(free.lessons[0]!.id)
      expect(unscheduled.progress.currentLessonId).toBe(unscheduled.lessons[0]!.id)
      expect(duplicateA.id).not.toBe(duplicateB.id)

      workspace.close()
      workspace = undefined
      workspace = initializeWorkspace(join(root, 'workspace'), installPath)
      core = new CoreDataService(workspace.database.raw)

      const restarted = core.getOverview()
      expect(workspace.identity.schemaVersion).toBe(14)
      expect(core.progress.getProgress(regular.course.id)).toMatchObject({
        activePeriodId: regular.period.id,
        currentLessonId: regular.lessons[0]!.id,
        endedAt: null,
      })
      expect(core.progress.getProgress(free.course.id)?.currentLessonId).toBe(free.lessons[0]!.id)
      expect(core.progress.getProgress(unscheduled.course.id)?.currentLessonId).toBe(unscheduled.lessons[0]!.id)

      const unscheduledSessions = restarted.lessonSessions.filter((session) => (
        unscheduled.lessons.some((lesson) => lesson.id === session.lessonId)
      ))
      expect(unscheduledSessions).toHaveLength(2)
      expect(unscheduledSessions.every((session) => (
        session.scheduledAt === null && session.durationMinutes === 90
      ))).toBe(true)

      const maintenanceTime = localDateTimeToUtcIso('2026-10-01', '10:00')
      const maintained = core.attendance.updateLessonSchedule(unscheduled.lessons[0]!.id, maintenanceTime)
      expect(maintained).toMatchObject({ scheduledAt: maintenanceTime, durationMinutes: 90 })
      const cleared = core.attendance.updateLessonSchedule(unscheduled.lessons[0]!.id, null)
      expect(cleared).toMatchObject({ scheduledAt: null, durationMinutes: 90 })

      const laterStudent = core.createStudent('后关联学生')
      core.linkStudentToCourse(unscheduled.course.id, laterStudent.id)
      expect(core.attendance.getLessonAttendance(unscheduled.lessons[0]!.id).students).toEqual([
        expect.objectContaining({ studentId: laterStudent.id, status: null }),
      ])

      const roster = core.attendance.getLessonAttendance(regular.lessons[0]!.id)
      core.attendance.saveLessonAttendance(regular.lessons[0]!.id, roster.students.map((student) => ({
        studentId: student.studentId,
        status: 'present',
      })))
      expect(core.progress.getProgress(regular.course.id)?.currentLessonId).toBe(regular.lessons[0]!.id)
      expect(core.attendance.getLessonAttendance(regular.lessons[0]!.id).taughtConfirmedAt).toBeNull()

      const prepContext = createLessonPrepContext(free.course, free.lessons[2]!, free.students)
      expect(prepContext).toMatchObject({
        courseId: free.course.id,
        lessonId: free.lessons[2]!.id,
        studentNames: [],
      })
      expect(core.progress.getProgress(free.course.id)?.currentLessonId).toBe(free.lessons[0]!.id)

      expect(workspace.database.raw.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(workspace.database.raw.pragma('foreign_key_check')).toEqual([])
    } finally {
      workspace?.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
