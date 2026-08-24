import type {
  CourseMode,
  CreateCourseSetupRequest,
  CreateCourseSetupStudent,
  StudentRecord,
} from '../shared/core-contracts'
import { isUtcIsoString } from '../shared/core-contracts'

export const MAX_QUICK_COURSE_LESSONS = 100
export const QUICK_COURSE_LESSON_LIMIT_MESSAGE = '一次最多创建 100 节课，请拆分阶段。'

export type QuickCourseWizardStep = 1 | 2 | 3 | 4
export type QuickLessonMode = 'empty' | 'plan'
export type QuickScheduleMode = 'regular' | 'free_dates' | 'unscheduled'
export type RegularRepeat = 'weekly' | 'biweekly'

export type RosterResolution =
  | { readonly type: 'existing'; readonly studentId: string }
  | { readonly type: 'new' }

export interface QuickRosterEntry {
  readonly name: string
  readonly sourceLineNumbers: readonly number[]
  readonly candidates: readonly StudentRecord[]
  readonly resolution: RosterResolution | null
}

export interface QuickRoster {
  readonly entries: readonly QuickRosterEntry[]
  readonly duplicateInputNames: readonly string[]
}

export interface QuickLessonDraft {
  readonly key: string
  readonly title: string
  readonly scheduledAt: string | null
  readonly durationMinutes: number | null
}

export interface QuickCourseWizardState {
  readonly currentStep: QuickCourseWizardStep
  readonly courseTitle: string
  readonly mode: CourseMode
  readonly roster: QuickRoster
  readonly periodTitle: string
  readonly lessonMode: QuickLessonMode
  readonly lessons: readonly QuickLessonDraft[]
  readonly scheduleMode: QuickScheduleMode
  readonly selectedFreeDates: readonly string[]
  readonly freeDateRemainderAccepted: boolean
}

export interface QuickStepValidation {
  readonly valid: boolean
  readonly issues: readonly string[]
}

export type FreeDateMismatch =
  | { readonly type: 'none' }
  | { readonly type: 'sync_empty_lessons'; readonly lessonCount: number; readonly dateCount: number }
  | { readonly type: 'choose_more_or_keep_unscheduled'; readonly missingCount: number }
  | { readonly type: 'too_many_dates'; readonly extraCount: number }

export interface ScheduleReviewSummary {
  readonly status: 'all' | 'partial' | 'none'
  readonly scheduledCount: number
  readonly unscheduledCount: number
  readonly totalCount: number
  readonly headline: string
  readonly countText: string
  readonly firstScheduledAt: string | null
  readonly lastScheduledAt: string | null
  readonly durationMinutes: number | null
}

export type QuickCourseWizardErrorCode =
  | 'INVALID_ROSTER'
  | 'UNRESOLVED_DUPLICATE'
  | 'INVALID_LESSON_COUNT'
  | 'LESSON_LIMIT'
  | 'INVALID_LOCAL_DATE'
  | 'INVALID_LOCAL_TIME'
  | 'INVALID_DURATION'
  | 'INVALID_SCHEDULE'
  | 'FREE_DATE_MISMATCH'
  | 'INVALID_WIZARD_STATE'

export class QuickCourseWizardError extends Error {
  constructor(
    readonly code: QuickCourseWizardErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'QuickCourseWizardError'
  }
}

export function createInitialQuickCourseWizardState(
  now = new Date(),
): QuickCourseWizardState {
  return {
    currentStep: 1,
    courseTitle: '',
    mode: 'class',
    roster: { entries: [], duplicateInputNames: [] },
    periodTitle: recommendPeriodTitle(now),
    lessonMode: 'empty',
    lessons: [],
    scheduleMode: 'regular',
    selectedFreeDates: [],
    freeDateRemainderAccepted: false,
  }
}

export function parseStudentRoster(
  text: string,
  students: readonly StudentRecord[],
): QuickRoster {
  if (typeof text !== 'string') {
    throw new QuickCourseWizardError('INVALID_ROSTER', '学生名单无效。')
  }
  const lineNumbersByName = new Map<string, number[]>()
  text.split(/\r?\n/u).forEach((line, index) => {
    const name = line.trim()
    if (name === '') return
    const lineNumbers = lineNumbersByName.get(name) ?? []
    lineNumbers.push(index + 1)
    lineNumbersByName.set(name, lineNumbers)
  })
  const activeByName = new Map<string, StudentRecord[]>()
  students.filter((student) => student.deletedAt === null).forEach((student) => {
    const matches = activeByName.get(student.name) ?? []
    matches.push(student)
    activeByName.set(student.name, matches)
  })
  const entries = [...lineNumbersByName.entries()].map(([name, sourceLineNumbers]) => {
    const candidates = activeByName.get(name) ?? []
    const resolution: RosterResolution | null = candidates.length === 0
      ? { type: 'new' }
      : candidates.length === 1
        ? { type: 'existing', studentId: candidates[0]!.id }
        : null
    return { name, sourceLineNumbers, candidates, resolution }
  })
  return {
    entries,
    duplicateInputNames: entries
      .filter((entry) => entry.sourceLineNumbers.length > 1)
      .map((entry) => entry.name),
  }
}

export function resolveRosterDuplicate(
  roster: QuickRoster,
  name: string,
  resolution: RosterResolution,
): QuickRoster {
  let found = false
  const entries = roster.entries.map((entry) => {
    if (entry.name !== name) return entry
    found = true
    if (entry.candidates.length < 2) {
      throw new QuickCourseWizardError('INVALID_ROSTER', '该学生不需要重名确认。')
    }
    if (
      resolution.type === 'existing' &&
      !entry.candidates.some((candidate) => candidate.id === resolution.studentId)
    ) {
      throw new QuickCourseWizardError('INVALID_ROSTER', '所选学生不在重名候选中。')
    }
    return { ...entry, resolution }
  })
  if (!found) {
    throw new QuickCourseWizardError('INVALID_ROSTER', '没有找到需要处理的重名学生。')
  }
  return { ...roster, entries }
}

export function rosterToSetupStudents(
  roster: QuickRoster,
): CreateCourseSetupStudent[] {
  return roster.entries.map((entry) => {
    if (entry.resolution === null) {
      throw new QuickCourseWizardError('UNRESOLVED_DUPLICATE', '请先处理重名学生。')
    }
    return entry.resolution.type === 'existing'
      ? { type: 'existing', studentId: entry.resolution.studentId }
      : { type: 'new', name: entry.name }
  })
}

export function recommendPeriodTitle(now: Date): string {
  if (Number.isNaN(now.getTime())) {
    throw new QuickCourseWizardError('INVALID_WIZARD_STATE', '当前日期无效。')
  }
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  if (month === 1) return `${year - 1} 秋季`
  if (month <= 7) return `${year} 春季`
  return `${year} 秋季`
}

export function buildEmptyLessons(
  count: number,
  durationMinutes: number | null = null,
): QuickLessonDraft[] {
  assertLessonCount(count)
  const duration = normalizeDuration(durationMinutes)
  return Array.from({ length: count }, (_, index) => ({
    key: `lesson-${index + 1}`,
    title: '未命名',
    scheduledAt: null,
    durationMinutes: duration,
  }))
}

export function parseTeachingPlan(
  text: string,
  durationMinutes: number | null = null,
): QuickLessonDraft[] {
  if (typeof text !== 'string') {
    throw new QuickCourseWizardError('INVALID_LESSON_COUNT', '教学计划无效。')
  }
  const titles = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
  assertLessonCount(titles.length)
  const duration = normalizeDuration(durationMinutes)
  return titles.map((title, index) => ({
    key: `lesson-${index + 1}`,
    title,
    scheduledAt: null,
    durationMinutes: duration,
  }))
}

export function formatLessonPreviewTitle(lesson: QuickLessonDraft, index: number): string {
  return `第 ${index + 1} 课 · ${lesson.title}`
}

export function generateRegularSchedule(
  lessons: readonly QuickLessonDraft[],
  input: {
    readonly firstDate: string
    readonly time: string
    readonly repeat: RegularRepeat
    readonly excludedDates?: readonly string[]
    readonly durationMinutes: number | null
  },
): QuickLessonDraft[] {
  assertLessonCount(lessons.length)
  parseLocalDate(input.firstDate)
  parseLocalTime(input.time)
  const intervalDays = input.repeat === 'weekly' ? 7 : input.repeat === 'biweekly' ? 14 : 0
  if (intervalDays === 0) {
    throw new QuickCourseWizardError('INVALID_SCHEDULE', '规律排课只支持每周或每两周。')
  }
  const duration = normalizeDuration(input.durationMinutes)
  const excluded = new Set((input.excludedDates ?? []).map(normalizeLocalDateKey))
  const scheduledDates: string[] = []
  let candidate = input.firstDate
  let attempts = 0
  while (scheduledDates.length < lessons.length) {
    if (!excluded.has(candidate)) scheduledDates.push(candidate)
    candidate = addLocalDays(candidate, intervalDays)
    attempts += 1
    if (attempts > 50_000) {
      throw new QuickCourseWizardError('INVALID_SCHEDULE', '排除日期过多，无法生成排课。')
    }
  }
  return lessons.map((lesson, index) => ({
    ...lesson,
    scheduledAt: localDateTimeToUtcIso(scheduledDates[index]!, input.time),
    durationMinutes: duration,
  }))
}

export function getFreeDateMismatch(
  lessonMode: QuickLessonMode,
  lessonCount: number,
  dateCount: number,
): FreeDateMismatch {
  if (!Number.isInteger(lessonCount) || lessonCount < 1 || lessonCount > MAX_QUICK_COURSE_LESSONS) {
    throw new QuickCourseWizardError('INVALID_LESSON_COUNT', '课次数量无效。')
  }
  if (!Number.isInteger(dateCount) || dateCount < 0 || dateCount > MAX_QUICK_COURSE_LESSONS) {
    throw new QuickCourseWizardError('INVALID_SCHEDULE', '上课日期数量无效。')
  }
  if (lessonCount === dateCount) return { type: 'none' }
  if (lessonMode === 'empty') {
    return { type: 'sync_empty_lessons', lessonCount, dateCount }
  }
  if (dateCount < lessonCount) {
    return { type: 'choose_more_or_keep_unscheduled', missingCount: lessonCount - dateCount }
  }
  return { type: 'too_many_dates', extraCount: dateCount - lessonCount }
}

export function syncEmptyLessonsToDateCount(
  dateCount: number,
  durationMinutes: number | null,
): QuickLessonDraft[] {
  return buildEmptyLessons(dateCount, durationMinutes)
}

export function applyFreeDateSchedule(
  lessons: readonly QuickLessonDraft[],
  input: {
    readonly dates: readonly string[]
    readonly time: string
    readonly durationMinutes: number | null
  },
): QuickLessonDraft[] {
  assertLessonCount(lessons.length)
  parseLocalTime(input.time)
  const dates = normalizeSelectedDates(input.dates)
  if (dates.length < 1) {
    throw new QuickCourseWizardError('INVALID_SCHEDULE', '请至少选择一个上课日期。')
  }
  if (dates.length > lessons.length) {
    throw new QuickCourseWizardError(
      'FREE_DATE_MISMATCH',
      `上课日期比课次多 ${dates.length - lessons.length} 天，请取消多余日期。`,
    )
  }
  const duration = normalizeDuration(input.durationMinutes)
  return lessons.map((lesson, index) => ({
    ...lesson,
    scheduledAt: index < dates.length
      ? localDateTimeToUtcIso(dates[index]!, input.time)
      : null,
    durationMinutes: duration,
  }))
}

export function applyUnscheduledLessons(
  lessons: readonly QuickLessonDraft[],
  durationMinutes: number | null,
): QuickLessonDraft[] {
  assertLessonCount(lessons.length)
  const duration = normalizeDuration(durationMinutes)
  return lessons.map((lesson) => ({
    ...lesson,
    scheduledAt: null,
    durationMinutes: duration,
  }))
}

export function setLessonLocalSchedule(
  lessons: readonly QuickLessonDraft[],
  lessonKey: string,
  date: string,
  time: string,
): QuickLessonDraft[] {
  return updateLessonByKey(lessons, lessonKey, (lesson) => ({
    ...lesson,
    scheduledAt: localDateTimeToUtcIso(date, time),
  }))
}

export function clearLessonSchedule(
  lessons: readonly QuickLessonDraft[],
  lessonKey: string,
): QuickLessonDraft[] {
  return updateLessonByKey(lessons, lessonKey, (lesson) => ({
    ...lesson,
    scheduledAt: null,
  }))
}

export function applyLessonDuration(
  lessons: readonly QuickLessonDraft[],
  durationMinutes: number | null,
): QuickLessonDraft[] {
  const duration = normalizeDuration(durationMinutes)
  return lessons.map((lesson) => ({ ...lesson, durationMinutes: duration }))
}

export function toggleSelectedDate(
  dates: readonly string[],
  date: string,
): string[] {
  const normalizedDate = normalizeLocalDateKey(date)
  const normalized = normalizeSelectedDates(dates)
  return normalized.includes(normalizedDate)
    ? normalized.filter((candidate) => candidate !== normalizedDate)
    : [...normalized, normalizedDate].sort()
}

export function normalizeSelectedDates(dates: readonly string[]): string[] {
  return [...new Set(dates.map(normalizeLocalDateKey))].sort()
}

export function localDateTimeToUtcIso(date: string, time: string): string {
  const { year, month, day } = parseLocalDate(date)
  const { hour, minute } = parseLocalTime(time)
  const local = new Date(year, month - 1, day, hour, minute, 0, 0)
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day ||
    local.getHours() !== hour ||
    local.getMinutes() !== minute
  ) {
    throw new QuickCourseWizardError('INVALID_LOCAL_TIME', '所选本地上课时间无效。')
  }
  return local.toISOString()
}

export function buildScheduleReview(
  lessons: readonly QuickLessonDraft[],
): ScheduleReviewSummary {
  assertLessonCount(lessons.length)
  const scheduled = lessons
    .flatMap((lesson) => lesson.scheduledAt === null ? [] : [lesson.scheduledAt])
    .sort()
  const scheduledCount = scheduled.length
  const totalCount = lessons.length
  const unscheduledCount = totalCount - scheduledCount
  const status = scheduledCount === 0 ? 'none' : scheduledCount === totalCount ? 'all' : 'partial'
  const countText = status === 'all'
    ? `${totalCount}/${totalCount} 节已排`
    : `${scheduledCount}/${totalCount} 节已排 · ${unscheduledCount} 节未排`
  const durations = [...new Set(lessons.map((lesson) => lesson.durationMinutes))]
  return {
    status,
    scheduledCount,
    unscheduledCount,
    totalCount,
    headline: status === 'none' ? '暂未安排上课时间' : countText,
    countText,
    firstScheduledAt: scheduled[0] ?? null,
    lastScheduledAt: scheduled.at(-1) ?? null,
    durationMinutes: durations.length === 1 ? durations[0]! : null,
  }
}

export function validateQuickCourseStep(
  state: QuickCourseWizardState,
  step: QuickCourseWizardStep,
): QuickStepValidation {
  const issues: string[] = []
  if (state.courseTitle.trim() === '') issues.push('请输入课程名称。')
  if (state.roster.entries.some((entry) => entry.resolution === null)) {
    issues.push('请先处理重名学生。')
  }
  if (state.roster.entries.some((entry) => Array.from(entry.name).length > 100)) {
    issues.push('学生姓名最多 100 个字符。')
  }
  if (state.mode === 'one_to_one' && state.roster.entries.length > 1) {
    issues.push('一对一课程最多关联一位在读学生。')
  }
  if (step >= 2) {
    if (state.periodTitle.trim() === '') issues.push('请输入阶段名称。')
    if (state.lessons.length < 1) issues.push('请至少创建一节课。')
    if (state.lessons.length > MAX_QUICK_COURSE_LESSONS) {
      issues.push(QUICK_COURSE_LESSON_LIMIT_MESSAGE)
    }
    if (state.lessons.some((lesson) => lesson.title.trim() === '')) {
      issues.push('课次名称不能为空。')
    }
  }
  if (step >= 3) {
    const scheduledCount = state.lessons.filter((lesson) => lesson.scheduledAt !== null).length
    if (state.scheduleMode === 'regular' && scheduledCount !== state.lessons.length) {
      issues.push('请先生成完整的规律排课。')
    }
    if (state.scheduleMode === 'free_dates') {
      let selectedDateCount = state.selectedFreeDates.length
      try {
        selectedDateCount = normalizeSelectedDates(state.selectedFreeDates).length
      } catch {
        issues.push('上课日期无效。')
      }
      if (selectedDateCount === 0) issues.push('请至少选择一个上课日期。')
      if (selectedDateCount > state.lessons.length) {
        issues.push('上课日期不能多于课次数。')
      }
      if (scheduledCount !== selectedDateCount) {
        issues.push('请重新生成自由日期排课。')
      }
      if (
        state.lessonMode === 'plan' &&
        selectedDateCount < state.lessons.length &&
        !state.freeDateRemainderAccepted
      ) {
        issues.push('请继续选择日期，或确认保留剩余未排课课次。')
      }
    }
    if (state.scheduleMode === 'unscheduled' && scheduledCount !== 0) {
      issues.push('暂不排课时不能保留上课日期。')
    }
  }
  return { valid: issues.length === 0, issues }
}

export function buildCreateCourseSetupRequest(
  state: QuickCourseWizardState,
): CreateCourseSetupRequest {
  const validation = validateQuickCourseStep(state, 4)
  if (!validation.valid) {
    throw new QuickCourseWizardError('INVALID_WIZARD_STATE', validation.issues[0]!)
  }
  const lessons = state.lessons.map((lesson) => {
    if (lesson.scheduledAt !== null && !isUtcIsoString(lesson.scheduledAt)) {
      throw new QuickCourseWizardError('INVALID_SCHEDULE', '上课时间必须是 UTC ISO 8601 时间。')
    }
    normalizeDuration(lesson.durationMinutes)
    return {
      title: lesson.title.trim(),
      scheduledAt: lesson.scheduledAt,
      durationMinutes: lesson.durationMinutes,
    }
  })
  return {
    title: state.courseTitle.trim(),
    mode: state.mode,
    students: rosterToSetupStudents(state.roster),
    periodTitle: state.periodTitle.trim(),
    lessons,
  }
}

function assertLessonCount(count: number): void {
  if (!Number.isInteger(count) || count < 1) {
    throw new QuickCourseWizardError('INVALID_LESSON_COUNT', '课次数量必须是 1–100。')
  }
  if (count > MAX_QUICK_COURSE_LESSONS) {
    throw new QuickCourseWizardError('LESSON_LIMIT', QUICK_COURSE_LESSON_LIMIT_MESSAGE)
  }
}

function normalizeDuration(value: number | null): number | null {
  if (value !== null && (!Number.isInteger(value) || value <= 0)) {
    throw new QuickCourseWizardError('INVALID_DURATION', '课程时长必须是正整数分钟。')
  }
  return value
}

function updateLessonByKey(
  lessons: readonly QuickLessonDraft[],
  lessonKey: string,
  update: (lesson: QuickLessonDraft) => QuickLessonDraft,
): QuickLessonDraft[] {
  let found = false
  const result = lessons.map((lesson) => {
    if (lesson.key !== lessonKey) return lesson
    found = true
    return update(lesson)
  })
  if (!found) {
    throw new QuickCourseWizardError('INVALID_SCHEDULE', '没有找到要调整的课次。')
  }
  return result
}

function normalizeLocalDateKey(value: string): string {
  const { year, month, day } = parseLocalDate(value)
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function parseLocalDate(value: string): { readonly year: number; readonly month: number; readonly day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  if (match === null) {
    throw new QuickCourseWizardError('INVALID_LOCAL_DATE', '上课日期无效。')
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const local = new Date(year, month - 1, day, 12, 0, 0, 0)
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day
  ) {
    throw new QuickCourseWizardError('INVALID_LOCAL_DATE', '上课日期无效。')
  }
  return { year, month, day }
}

function parseLocalTime(value: string): { readonly hour: number; readonly minute: number } {
  const match = /^(\d{2}):(\d{2})$/u.exec(value)
  if (match === null) {
    throw new QuickCourseWizardError('INVALID_LOCAL_TIME', '上课时间无效。')
  }
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) {
    throw new QuickCourseWizardError('INVALID_LOCAL_TIME', '上课时间无效。')
  }
  return { hour, minute }
}

function addLocalDays(value: string, days: number): string {
  const { year, month, day } = parseLocalDate(value)
  const next = new Date(year, month - 1, day + days, 12, 0, 0, 0)
  return `${next.getFullYear().toString().padStart(4, '0')}-${(next.getMonth() + 1).toString().padStart(2, '0')}-${next.getDate().toString().padStart(2, '0')}`
}
