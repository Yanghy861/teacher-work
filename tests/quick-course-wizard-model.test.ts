import { describe, expect, it } from 'vitest'

import type { StudentRecord } from '../src/shared/core-contracts'
import {
  applyFreeDateSchedule,
  applyLessonDuration,
  applyUnscheduledLessons,
  buildCreateCourseSetupRequest,
  buildEmptyLessons,
  buildScheduleReview,
  clearLessonSchedule,
  createInitialQuickCourseWizardState,
  formatLessonPreviewTitle,
  generateRegularSchedule,
  getFreeDateMismatch,
  localDateTimeToUtcIso,
  parseStudentRoster,
  parseTeachingPlan,
  QUICK_COURSE_LESSON_LIMIT_MESSAGE,
  recommendPeriodTitle,
  resolveRosterDuplicate,
  rosterToSetupStudents,
  setLessonLocalSchedule,
  syncEmptyLessonsToDateCount,
  toggleSelectedDate,
  validateQuickCourseStep,
  type QuickCourseWizardState,
} from '../src/renderer/quick-course-wizard-model'

const stamp = '2026-08-24T00:00:00.000Z'

function student(id: string, name: string, deletedAt: string | null = null): StudentRecord {
  return { id, name, createdAt: stamp, updatedAt: stamp, deletedAt }
}

function localIso(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  return new Date(year!, month! - 1, day!, hour!, minute!, 0, 0).toISOString()
}

function state(overrides: Partial<QuickCourseWizardState> = {}): QuickCourseWizardState {
  return {
    ...createInitialQuickCourseWizardState(new Date(2026, 7, 24, 12, 0, 0)),
    currentStep: 4,
    courseTitle: ' 初二数学秋季班 ',
    roster: parseStudentRoster('新学生', []),
    periodTitle: ' 2026 秋季 ',
    lessons: buildEmptyLessons(2, 90),
    scheduleMode: 'unscheduled',
    ...overrides,
  }
}

describe('V13-02 quick course wizard model', () => {
  it('recommends a soft period title from the current local month', () => {
    expect(recommendPeriodTitle(new Date(2026, 0, 15))).toBe('2025 秋季')
    expect(recommendPeriodTitle(new Date(2026, 1, 1))).toBe('2026 春季')
    expect(recommendPeriodTitle(new Date(2026, 6, 31))).toBe('2026 春季')
    expect(recommendPeriodTitle(new Date(2026, 7, 1))).toBe('2026 秋季')
    expect(recommendPeriodTitle(new Date(2026, 11, 31))).toBe('2026 秋季')
  })

  it('parses roster lines, deduplicates input and excludes soft-deleted matches', () => {
    const roster = parseStudentRoster(
      ' 张三 \n李四\n李四\n王五\n赵六\n\n',
      [
        student('zhang', '张三'),
        student('li-a', '李四'),
        student('li-b', '李四'),
        student('deleted-wang', '王五', stamp),
      ],
    )
    expect(roster.duplicateInputNames).toEqual(['李四'])
    expect(roster.entries).toEqual([
      expect.objectContaining({
        name: '张三',
        sourceLineNumbers: [1],
        resolution: { type: 'existing', studentId: 'zhang' },
      }),
      expect.objectContaining({
        name: '李四',
        sourceLineNumbers: [2, 3],
        candidates: [expect.objectContaining({ id: 'li-a' }), expect.objectContaining({ id: 'li-b' })],
        resolution: null,
      }),
      expect.objectContaining({ name: '王五', resolution: { type: 'new' } }),
      expect.objectContaining({ name: '赵六', resolution: { type: 'new' } }),
    ])
    expect(validateQuickCourseStep(state({ roster }), 1)).toMatchObject({
      valid: false,
      issues: ['请先处理重名学生。'],
    })

    const resolved = resolveRosterDuplicate(roster, '李四', {
      type: 'existing',
      studentId: 'li-b',
    })
    expect(rosterToSetupStudents(resolved)).toEqual([
      { type: 'existing', studentId: 'zhang' },
      { type: 'existing', studentId: 'li-b' },
      { type: 'new', name: '王五' },
      { type: 'new', name: '赵六' },
    ])
    expect(resolveRosterDuplicate(roster, '李四', { type: 'new' }).entries[1]?.resolution)
      .toEqual({ type: 'new' })
    expect(() => resolveRosterDuplicate(roster, '李四', {
      type: 'existing',
      studentId: 'not-a-candidate',
    })).toThrow('所选学生不在重名候选中。')
  })

  it('allows empty class or one-to-one rosters and blocks a second one-to-one student', () => {
    const emptyRoster = parseStudentRoster('', [])
    expect(validateQuickCourseStep(state({ roster: emptyRoster, mode: 'class' }), 1).valid).toBe(true)
    expect(validateQuickCourseStep(state({ roster: emptyRoster, mode: 'one_to_one' }), 1).valid).toBe(true)
    const twoStudents = parseStudentRoster('甲\n乙', [])
    expect(validateQuickCourseStep(state({ roster: twoStudents, mode: 'one_to_one' }), 1))
      .toMatchObject({ valid: false, issues: ['一对一课程最多关联一位在读学生。'] })
    expect(validateQuickCourseStep(state({
      roster: parseStudentRoster('学'.repeat(101), []),
    }), 1)).toMatchObject({ valid: false, issues: ['学生姓名最多 100 个字符。'] })
  })

  it('generates empty lessons and parses teaching plans at the exact 1–100 boundary', () => {
    expect(buildEmptyLessons(1)).toEqual([{
      key: 'lesson-1',
      title: '未命名',
      scheduledAt: null,
      durationMinutes: null,
    }])
    expect(buildEmptyLessons(100)).toHaveLength(100)
    expect(formatLessonPreviewTitle(buildEmptyLessons(1)[0]!, 0)).toBe('第 1 课 · 未命名')
    expect(() => buildEmptyLessons(0)).toThrow('课次数量必须是 1–100。')
    expect(() => buildEmptyLessons(101)).toThrow(QUICK_COURSE_LESSON_LIMIT_MESSAGE)

    expect(parseTeachingPlan(' 有理数 \n\n整式\r\n 一元一次方程 ')
      .map((lesson) => lesson.title)).toEqual(['有理数', '整式', '一元一次方程'])
    expect(() => parseTeachingPlan('\n\n')).toThrow('课次数量必须是 1–100。')
    expect(() => parseTeachingPlan(
      Array.from({ length: 101 }, (_, index) => `主题 ${index + 1}`).join('\n'),
    )).toThrow(QUICK_COURSE_LESSON_LIMIT_MESSAGE)
  })

  it('generates weekly schedules in local calendar order and skips exclusions without deleting lessons', () => {
    const lessons = buildEmptyLessons(4)
    const scheduled = generateRegularSchedule(lessons, {
      firstDate: '2026-09-05',
      time: '14:00',
      repeat: 'weekly',
      excludedDates: ['2026-09-12'],
      durationMinutes: 90,
    })
    expect(scheduled.map((lesson) => lesson.scheduledAt)).toEqual([
      localIso('2026-09-05', '14:00'),
      localIso('2026-09-19', '14:00'),
      localIso('2026-09-26', '14:00'),
      localIso('2026-10-03', '14:00'),
    ])
    expect(scheduled.every((lesson) => lesson.durationMinutes === 90)).toBe(true)
    expect(scheduled).toHaveLength(4)
  })

  it('generates biweekly schedules across year boundaries without changing local wall time', () => {
    const scheduled = generateRegularSchedule(buildEmptyLessons(3), {
      firstDate: '2026-12-26',
      time: '09:30',
      repeat: 'biweekly',
      durationMinutes: 120,
    })
    expect(scheduled.map((lesson) => lesson.scheduledAt)).toEqual([
      localIso('2026-12-26', '09:30'),
      localIso('2027-01-09', '09:30'),
      localIso('2027-01-23', '09:30'),
    ])
    scheduled.forEach((lesson) => {
      const local = new Date(lesson.scheduledAt!)
      expect([local.getHours(), local.getMinutes()]).toEqual([9, 30])
    })
  })

  it('advances local calendar weeks across daylight saving changes instead of adding UTC hours', () => {
    const originalTimezone = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      const scheduled = generateRegularSchedule(buildEmptyLessons(3), {
        firstDate: '2026-03-01',
        time: '09:00',
        repeat: 'weekly',
        durationMinutes: 90,
      })
      expect(scheduled.map((lesson) => lesson.scheduledAt)).toEqual([
        '2026-03-01T14:00:00.000Z',
        '2026-03-08T13:00:00.000Z',
        '2026-03-15T13:00:00.000Z',
      ])
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ
      else process.env.TZ = originalTimezone
    }
  })

  it('sorts free dates, exposes mismatch choices and never drops teaching-plan lessons', () => {
    expect(getFreeDateMismatch('empty', 16, 6)).toEqual({
      type: 'sync_empty_lessons',
      lessonCount: 16,
      dateCount: 6,
    })
    expect(getFreeDateMismatch('plan', 16, 10)).toEqual({
      type: 'choose_more_or_keep_unscheduled',
      missingCount: 6,
    })
    expect(getFreeDateMismatch('plan', 3, 5)).toEqual({
      type: 'too_many_dates',
      extraCount: 2,
    })
    expect(getFreeDateMismatch('plan', 3, 3)).toEqual({ type: 'none' })

    let dates: string[] = []
    dates = toggleSelectedDate(dates, '2026-08-10')
    dates = toggleSelectedDate(dates, '2026-08-03')
    dates = toggleSelectedDate(dates, '2026-08-06')
    expect(dates).toEqual(['2026-08-03', '2026-08-06', '2026-08-10'])
    expect(toggleSelectedDate(dates, '2026-08-06')).toEqual(['2026-08-03', '2026-08-10'])

    const plan = parseTeachingPlan('主题一\n主题二\n主题三\n主题四')
    const scheduled = applyFreeDateSchedule(plan, {
      dates: ['2026-08-10', '2026-08-03'],
      time: '09:00',
      durationMinutes: 90,
    })
    expect(scheduled.map((lesson) => lesson.title)).toEqual(['主题一', '主题二', '主题三', '主题四'])
    expect(scheduled.map((lesson) => lesson.scheduledAt)).toEqual([
      localIso('2026-08-03', '09:00'),
      localIso('2026-08-10', '09:00'),
      null,
      null,
    ])
    expect(scheduled.every((lesson) => lesson.durationMinutes === 90)).toBe(true)
    expect(syncEmptyLessonsToDateCount(6, 60)).toHaveLength(6)
    expect(() => applyFreeDateSchedule(buildEmptyLessons(1), {
      dates: ['2026-08-01', '2026-08-02'],
      time: '09:00',
      durationMinutes: 90,
    })).toThrow('上课日期比课次多 1 天，请取消多余日期。')
  })

  it('keeps duration while clearing all or one lesson schedule', () => {
    const scheduled = generateRegularSchedule(buildEmptyLessons(2), {
      firstDate: '2026-09-05',
      time: '14:00',
      repeat: 'weekly',
      durationMinutes: 90,
    })
    const adjusted = setLessonLocalSchedule(scheduled, 'lesson-2', '2026-09-20', '15:30')
    expect(adjusted[1]).toMatchObject({
      scheduledAt: localIso('2026-09-20', '15:30'),
      durationMinutes: 90,
    })
    expect(clearLessonSchedule(adjusted, 'lesson-2')[1]).toMatchObject({
      scheduledAt: null,
      durationMinutes: 90,
    })
    expect(applyUnscheduledLessons(adjusted, 90).every((lesson) =>
      lesson.scheduledAt === null && lesson.durationMinutes === 90,
    )).toBe(true)
    expect(applyLessonDuration(adjusted, 120).every((lesson) =>
      lesson.durationMinutes === 120,
    )).toBe(true)
  })

  it('builds fixed all, partial and unscheduled review states', () => {
    const all = generateRegularSchedule(buildEmptyLessons(2), {
      firstDate: '2026-09-05',
      time: '14:00',
      repeat: 'weekly',
      durationMinutes: 90,
    })
    expect(buildScheduleReview(all)).toMatchObject({
      status: 'all',
      headline: '2/2 节已排',
      countText: '2/2 节已排',
      scheduledCount: 2,
      unscheduledCount: 0,
      durationMinutes: 90,
      firstScheduledAt: localIso('2026-09-05', '14:00'),
      lastScheduledAt: localIso('2026-09-12', '14:00'),
    })
    const partial = clearLessonSchedule(all, 'lesson-2')
    expect(buildScheduleReview(partial)).toMatchObject({
      status: 'partial',
      headline: '1/2 节已排 · 1 节未排',
      countText: '1/2 节已排 · 1 节未排',
    })
    expect(buildScheduleReview(applyUnscheduledLessons(all, 90))).toMatchObject({
      status: 'none',
      headline: '暂未安排上课时间',
      countText: '0/2 节已排 · 2 节未排',
      durationMinutes: 90,
    })
  })

  it('validates free-date remainder confirmation before allowing the final request', () => {
    const plan = applyFreeDateSchedule(parseTeachingPlan('主题一\n主题二\n主题三'), {
      dates: ['2026-08-03', '2026-08-10'],
      time: '09:00',
      durationMinutes: 90,
    })
    const pending = state({
      lessonMode: 'plan',
      lessons: plan,
      scheduleMode: 'free_dates',
      selectedFreeDates: ['2026-08-03', '2026-08-10'],
      freeDateRemainderAccepted: false,
    })
    expect(validateQuickCourseStep(pending, 3)).toMatchObject({
      valid: false,
      issues: ['请继续选择日期，或确认保留剩余未排课课次。'],
    })
    expect(validateQuickCourseStep({
      ...pending,
      lessons: applyUnscheduledLessons(plan, 90),
      freeDateRemainderAccepted: true,
    }, 3)).toMatchObject({ valid: false, issues: ['请重新生成自由日期排课。'] })
    const accepted = { ...pending, freeDateRemainderAccepted: true }
    expect(validateQuickCourseStep(accepted, 4).valid).toBe(true)
    expect(buildCreateCourseSetupRequest(accepted)).toEqual({
      title: '初二数学秋季班',
      mode: 'class',
      students: [{ type: 'new', name: '新学生' }],
      periodTitle: '2026 秋季',
      lessons: [
        { title: '主题一', scheduledAt: localIso('2026-08-03', '09:00'), durationMinutes: 90 },
        { title: '主题二', scheduledAt: localIso('2026-08-10', '09:00'), durationMinutes: 90 },
        { title: '主题三', scheduledAt: null, durationMinutes: 90 },
      ],
    })
  })

  it('converts strict local date/time and rejects invalid calendar or duration values', () => {
    expect(localDateTimeToUtcIso('2026-09-05', '14:00')).toBe(localIso('2026-09-05', '14:00'))
    expect(() => localDateTimeToUtcIso('2026-02-30', '14:00')).toThrow('上课日期无效。')
    expect(() => localDateTimeToUtcIso('2026-09-05', '24:00')).toThrow('上课时间无效。')
    expect(() => applyUnscheduledLessons(buildEmptyLessons(1), 0)).toThrow(
      '课程时长必须是正整数分钟。',
    )
  })
})
