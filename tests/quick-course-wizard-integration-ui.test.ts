import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  FreeDateCalendarDialog,
  ReviewStep,
  ScheduleStep,
} from '../src/renderer/quick-course-wizard-full'
import {
  applyUnscheduledLessons,
  buildEmptyLessons,
  clearLessonSchedule,
  createInitialQuickCourseWizardState,
  generateRegularSchedule,
  type QuickCourseWizardState,
} from '../src/renderer/quick-course-wizard-model'

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

function localIso(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  return new Date(year!, month! - 1, day!, hour!, minute!).toISOString()
}

function scheduledState(): QuickCourseWizardState {
  const lessons = generateRegularSchedule(buildEmptyLessons(3), {
    firstDate: '2026-09-05',
    time: '14:00',
    repeat: 'weekly',
    durationMinutes: 90,
  })
  return {
    ...createInitialQuickCourseWizardState(new Date(2026, 7, 24)),
    currentStep: 3,
    courseTitle: '初二数学秋季班',
    periodTitle: '2026 秋季',
    lessons,
    scheduleMode: 'regular',
  }
}

const noop = vi.fn()

describe('V13-04 quick course scheduling and integration UI', () => {
  it('renders exactly the three frozen schedule modes and explicit lesson dates', () => {
    const state = scheduledState()
    const markup = renderToStaticMarkup(createElement(ScheduleStep, {
      state,
      firstDate: '2026-09-05',
      regularTime: '14:00',
      repeat: 'weekly',
      excludedDates: [],
      exceptionDate: '',
      durationText: '90',
      freeDateTime: '14:00',
      busy: false,
      onModeChange: noop,
      onFirstDateChange: noop,
      onRegularTimeChange: noop,
      onRepeatChange: noop,
      onExceptionDateChange: noop,
      onAddException: noop,
      onRemoveException: noop,
      onDurationChange: noop,
      onFreeDateTimeChange: noop,
      onOpenCalendar: noop,
      onEditLesson: noop,
      onClearLesson: noop,
    }))

    expect(markup).toContain('按规律排课')
    expect(markup).toContain('自由选择日期')
    expect(markup).toContain('暂不排课')
    expect(markup).not.toContain('不重复')
    expect(markup).toContain('3/3 节已排')
    expect(markup).toContain('09/05 周六 14:00')
    expect(markup).toContain('90 分钟')
    expect(markup).toContain('清空')
  })

  it('renders a multi-select month calendar with an explicit add count', () => {
    const markup = renderToStaticMarkup(createElement(FreeDateCalendarDialog, {
      initialDates: ['2026-09-05', '2026-09-08'],
      initialMonth: '2026-09',
      busy: false,
      onClose: noop,
      onApply: () => true,
    }))

    expect(markup).toContain('自由选择上课日期')
    expect(markup).toContain('2026 年 9 月')
    expect(markup).toContain('已选 2 天')
    expect(markup).toContain('添加 2 节课')
    expect(markup.match(/aria-pressed="true"/gu)).toHaveLength(2)
  })

  it('shows partial and completely unscheduled review states without losing duration', () => {
    const scheduled = scheduledState()
    const partial = {
      ...scheduled,
      currentStep: 4 as const,
      lessons: clearLessonSchedule(scheduled.lessons, 'lesson-3'),
    }
    const partialMarkup = renderToStaticMarkup(createElement(ReviewStep, {
      state: partial,
      submissionError: null,
      onEdit: noop,
    }))
    expect(partialMarkup).toContain('2/3 节已排 · 1 节未排')
    expect(partialMarkup).toContain('每节 90 分钟')

    const unscheduled = {
      ...partial,
      scheduleMode: 'unscheduled' as const,
      lessons: applyUnscheduledLessons(partial.lessons, 90),
    }
    const unscheduledMarkup = renderToStaticMarkup(createElement(ReviewStep, {
      state: unscheduled,
      submissionError: null,
      onEdit: noop,
    }))
    expect(unscheduledMarkup).toContain('暂未安排上课时间')
    expect(unscheduledMarkup).toContain('0/3 节已排 · 3 节未排')
    expect(unscheduled.lessons.every((lesson) => lesson.scheduledAt === null && lesson.durationMinutes === 90)).toBe(true)
  })

  it('keeps local dates explicit in the setup request path', () => {
    const state = scheduledState()
    expect(state.lessons.map((lesson) => lesson.scheduledAt)).toEqual([
      localIso('2026-09-05', '14:00'),
      localIso('2026-09-12', '14:00'),
      localIso('2026-09-19', '14:00'),
    ])
  })

  it('uses the single atomic setup API and preserves the maintenance entry points', () => {
    const wizardSource = readSource('../src/renderer/quick-course-wizard-full.tsx')
    const orchestrationSource = readSource('../src/renderer/quick-course-wizard-orchestration.ts')
    const dashboardSource = readSource('../src/renderer/course-dashboard.tsx')
    const detailSource = readSource('../src/renderer/course-detail.tsx')

    expect(wizardSource.match(/\.createCourseSetup\(/gu)).toHaveLength(1)
    expect(wizardSource).not.toContain('.createStudent(')
    expect(wizardSource).not.toContain('.createLesson(')
    // V156-D：步骤 1–2 编排（含 goToLessons 的 lessonMode 保留逻辑）收敛到共享 hook（意图不变）
    expect(orchestrationSource).toContain("lessonMode: hadLessons ? state.lessonMode : 'empty'")
    expect(wizardSource).toContain("state.scheduleMode !== 'free_dates' || state.selectedFreeDates.length === 0")
    expect(wizardSource).toContain('onFreeDateTimeChange={updateFreeDateTime}')
    expect(dashboardSource).toContain('+ 快速建课')
    expect(dashboardSource).toContain('仅创建课程')
    expect(dashboardSource).toContain('进入第 1 课备课')
    expect(dashboardSource).toContain('.createCourse({ title, mode, studentIds })')
    expect(detailSource).toContain('durationMinutes: duration')
    expect(detailSource).toContain('清除时间不会自动清除课程时长')
  })
})
