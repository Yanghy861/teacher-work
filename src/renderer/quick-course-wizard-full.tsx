import { useMemo, useState } from 'react'

import type { CoreOverview, CourseMode, CreateCourseSetupResult } from '../shared/core-contracts'
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
  parseStudentRoster,
  parseTeachingPlan,
  resolveRosterDuplicate,
  setLessonLocalSchedule,
  syncEmptyLessonsToDateCount,
  toggleSelectedDate,
  validateQuickCourseStep,
  type QuickCourseWizardState,
  type QuickLessonDraft,
  type QuickLessonMode,
  type QuickRosterEntry,
  type QuickScheduleMode,
  type RegularRepeat,
  type RosterResolution,
} from './quick-course-wizard-model'
import {
  CourseStudentsStep,
  DuplicateStudentDialog,
  PeriodLessonsStep,
} from './quick-course-wizard'

const wizardSteps = ['课程与学生', '阶段与课次', '上课安排', '检查并创建'] as const

export default function QuickCourseWizard({
  overview,
  onClose,
  onCreated,
  confirm = (message) => window.confirm(message),
}: {
  readonly overview: CoreOverview
  readonly onClose: () => void
  readonly onCreated: (result: CreateCourseSetupResult) => Promise<void> | void
  readonly confirm?: (message: string) => boolean
}): React.JSX.Element {
  const initial = useMemo(() => createInitialQuickCourseWizardState(), [])
  const today = useMemo(() => toLocalDateKey(new Date()), [])
  const [state, setState] = useState<QuickCourseWizardState>(initial)
  const [rosterText, setRosterText] = useState('')
  const [emptyCountText, setEmptyCountText] = useState('16')
  const [planText, setPlanText] = useState('')
  const [lessonInputError, setLessonInputError] = useState('')
  const [duplicateEntry, setDuplicateEntry] = useState<QuickRosterEntry | null>(null)
  const [regularFirstDate, setRegularFirstDate] = useState(today)
  const [regularTime, setRegularTime] = useState('14:00')
  const [regularRepeat, setRegularRepeat] = useState<RegularRepeat>('weekly')
  const [excludedDates, setExcludedDates] = useState<string[]>([])
  const [exceptionDate, setExceptionDate] = useState('')
  const [durationText, setDurationText] = useState('90')
  const [freeDateTime, setFreeDateTime] = useState('14:00')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [editingLesson, setEditingLesson] = useState<QuickLessonDraft | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState<{ message: string; step: 1 | 2 | 3 | 4 } | null>(null)
  const validation = useMemo(
    () => validateQuickCourseStep(state, state.currentStep),
    [state],
  )
  const busy = submitting

  function commitState(next: QuickCourseWizardState): void {
    setState(next)
    setSubmissionError(null)
  }

  function updateState(patch: Partial<QuickCourseWizardState>): void {
    commitState({ ...state, ...patch })
  }

  function requestClose(): void {
    const hasContent = state.courseTitle.trim() !== '' || rosterText.trim() !== '' || state.lessons.length > 0
    if (!hasContent || confirm('放弃当前快速建课内容吗？')) onClose()
  }

  function updateRoster(value: string): void {
    setRosterText(value)
    updateState({ roster: parseStudentRoster(value, overview.students) })
  }

  function resolveDuplicate(entry: QuickRosterEntry, resolution: RosterResolution): void {
    updateState({ roster: resolveRosterDuplicate(state.roster, entry.name, resolution) })
    setDuplicateEntry(null)
  }

  function goToLessons(): void {
    if (!validateQuickCourseStep(state, 1).valid) return
    const hadLessons = state.lessons.length > 0
    const lessons = hadLessons ? state.lessons : buildEmptyLessons(16)
    commitState({ ...state, currentStep: 2, lessonMode: hadLessons ? state.lessonMode : 'empty', lessons })
  }

  function selectLessonMode(mode: QuickLessonMode): void {
    setLessonInputError('')
    if (mode === 'empty') updateEmptyLessons(emptyCountText)
    else updateTeachingPlan(planText)
  }

  function updateEmptyLessons(value: string): void {
    setEmptyCountText(value)
    try {
      const lessons = buildEmptyLessons(Number(value), parseDuration(durationText))
      setLessonInputError('')
      updateState({ lessonMode: 'empty', lessons })
    } catch (error) {
      setLessonInputError(toErrorMessage(error))
      updateState({ lessonMode: 'empty', lessons: [] })
    }
  }

  function updateTeachingPlan(value: string): void {
    setPlanText(value)
    try {
      const lessons = parseTeachingPlan(value, parseDuration(durationText))
      setLessonInputError('')
      updateState({ lessonMode: 'plan', lessons })
    } catch (error) {
      setLessonInputError(toErrorMessage(error))
      updateState({ lessonMode: 'plan', lessons: [] })
    }
  }

  function goToSchedule(): void {
    if (!validateQuickCourseStep(state, 2).valid || lessonInputError !== '') return
    try {
      const lessons = generateRegularSchedule(state.lessons, {
        firstDate: regularFirstDate,
        time: regularTime,
        repeat: regularRepeat,
        excludedDates,
        durationMinutes: parseDuration(durationText),
      })
      setScheduleError('')
      commitState({
        ...state,
        currentStep: 3,
        scheduleMode: 'regular',
        lessons,
        selectedFreeDates: [],
        freeDateRemainderAccepted: false,
      })
    } catch (error) {
      setScheduleError(toErrorMessage(error))
      updateState({ currentStep: 3 })
    }
  }

  function regenerateRegular(input: {
    readonly firstDate?: string
    readonly time?: string
    readonly repeat?: RegularRepeat
    readonly excluded?: readonly string[]
  } = {}): void {
    const nextDate = input.firstDate ?? regularFirstDate
    const nextTime = input.time ?? regularTime
    const nextRepeat = input.repeat ?? regularRepeat
    const nextExcluded = input.excluded ?? excludedDates
    try {
      const lessons = generateRegularSchedule(state.lessons, {
        firstDate: nextDate,
        time: nextTime,
        repeat: nextRepeat,
        excludedDates: nextExcluded,
        durationMinutes: parseDuration(durationText),
      })
      setScheduleError('')
      commitState({
        ...state,
        scheduleMode: 'regular',
        lessons,
        selectedFreeDates: [],
        freeDateRemainderAccepted: false,
      })
    } catch (error) {
      setScheduleError(toErrorMessage(error))
    }
  }

  function selectScheduleMode(mode: QuickScheduleMode): void {
    setScheduleError('')
    setEditingLesson(null)
    if (mode === 'regular') {
      regenerateRegular()
      return
    }
    let lessons: QuickLessonDraft[]
    try {
      lessons = applyUnscheduledLessons(state.lessons, parseDuration(durationText))
    } catch (error) {
      setScheduleError(toErrorMessage(error))
      return
    }
    commitState({
      ...state,
      scheduleMode: mode,
      lessons,
      selectedFreeDates: [],
      freeDateRemainderAccepted: false,
    })
    if (mode === 'free_dates') setCalendarOpen(true)
  }

  function updateDuration(value: string): void {
    setDurationText(value)
    try {
      const lessons = applyLessonDuration(state.lessons, parseDuration(value))
      setScheduleError('')
      updateState({ lessons })
    } catch (error) {
      setScheduleError(toErrorMessage(error))
    }
  }

  function updateFreeDateTime(value: string): void {
    setFreeDateTime(value)
    if (state.scheduleMode !== 'free_dates' || state.selectedFreeDates.length === 0) return
    try {
      const lessons = applyFreeDateSchedule(state.lessons, {
        dates: state.selectedFreeDates,
        time: value,
        durationMinutes: parseDuration(durationText),
      })
      setScheduleError('')
      updateState({ lessons })
    } catch (error) {
      setScheduleError(toErrorMessage(error))
    }
  }

  function addException(date = exceptionDate): void {
    if (date === '') return
    const next = [...new Set([...excludedDates, date])].sort()
    setExcludedDates(next)
    setExceptionDate('')
    regenerateRegular({ excluded: next })
  }

  function removeException(date: string): void {
    const next = excludedDates.filter((candidate) => candidate !== date)
    setExcludedDates(next)
    regenerateRegular({ excluded: next })
  }

  function applyFreeDates(dates: readonly string[]): boolean {
    try {
      if (dates.length === 0) throw new Error('请至少选择一个上课日期。')
      const duration = parseDuration(durationText)
      const mismatch = getFreeDateMismatch(state.lessonMode, state.lessons.length, dates.length)
      let lessons = [...state.lessons]
      let remainderAccepted = false
      if (mismatch.type === 'sync_empty_lessons') {
        if (!confirm(`已选 ${dates.length} 个日期，是否把空课次数从 ${mismatch.lessonCount} 节同步为 ${mismatch.dateCount} 节？`)) {
          return false
        }
        lessons = syncEmptyLessonsToDateCount(dates.length, duration)
        setEmptyCountText(dates.length.toString())
      } else if (mismatch.type === 'choose_more_or_keep_unscheduled') {
        if (!confirm(`还有 ${mismatch.missingCount} 节教学计划没有日期，是否保留为未排课课次？`)) return false
        remainderAccepted = true
      } else if (mismatch.type === 'too_many_dates') {
        throw new Error(`上课日期比教学计划多 ${mismatch.extraCount} 天，请取消多余日期。`)
      }
      lessons = applyFreeDateSchedule(lessons, {
        dates,
        time: freeDateTime,
        durationMinutes: duration,
      })
      setScheduleError('')
      commitState({
        ...state,
        scheduleMode: 'free_dates',
        lessons,
        selectedFreeDates: [...dates],
        freeDateRemainderAccepted: remainderAccepted,
      })
      setCalendarOpen(false)
      return true
    } catch (error) {
      setScheduleError(toErrorMessage(error))
      return false
    }
  }

  function updateLessonSchedule(lessonKey: string, date: string, time: string): void {
    try {
      const lessons = setLessonLocalSchedule(state.lessons, lessonKey, date, time)
      setScheduleError('')
      updateState({ lessons })
      setEditingLesson(null)
    } catch (error) {
      setScheduleError(toErrorMessage(error))
    }
  }

  function clearSchedule(lessonKey: string): void {
    const lessons = clearLessonSchedule(state.lessons, lessonKey)
    updateState({ lessons })
    setEditingLesson(null)
  }

  function goToReview(): void {
    if (!validateQuickCourseStep(state, 3).valid || scheduleError !== '') return
    updateState({ currentStep: 4 })
  }

  async function createSetup(): Promise<void> {
    if (submitting) return
    setSubmitting(true)
    setSubmissionError(null)
    try {
      const request = buildCreateCourseSetupRequest(state)
      const result = await window.teacherWorkbench.core.createCourseSetup(request)
      await onCreated(result)
    } catch (error) {
      const message = toErrorMessage(error)
      setSubmissionError({ message, step: locateErrorStep(message) })
    } finally {
      setSubmitting(false)
    }
  }

  const footerIssue = scheduleError !== '' && state.currentStep >= 3
    ? scheduleError
    : validation.issues[0]

  return (
    <div className="modal-backdrop quick-course-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) requestClose()
    }}>
      <section className="quick-course-wizard" role="dialog" aria-modal="true" aria-labelledby="quick-course-full-title">
        <header className="quick-course-heading">
          <h2 id="quick-course-full-title">快速建课</h2>
          <button className="modal-close" type="button" disabled={busy} aria-label="关闭" onClick={requestClose}>×</button>
        </header>

        <ol className="quick-course-steps" aria-label="快速建课步骤">
          {wizardSteps.map((label, index) => {
            const number = (index + 1) as 1 | 2 | 3 | 4
            return (
              <li className={`${number === state.currentStep ? 'is-active' : ''}${number < state.currentStep ? ' is-completed' : ''}`} key={label} aria-current={number === state.currentStep ? 'step' : undefined}>
                <span>{number}</span><strong>{label}</strong>
              </li>
            )
          })}
        </ol>

        <div className="quick-course-body">
          {state.currentStep === 1 && (
            <CourseStudentsStep
              overview={overview}
              state={state}
              rosterText={rosterText}
              busy={busy}
              onCourseTitleChange={(courseTitle) => updateState({ courseTitle })}
              onModeChange={(mode: CourseMode) => updateState({ mode })}
              onRosterTextChange={updateRoster}
              onOpenDuplicate={setDuplicateEntry}
            />
          )}
          {state.currentStep === 2 && (
            <PeriodLessonsStep
              state={state}
              emptyCountText={emptyCountText}
              planText={planText}
              inputError={lessonInputError}
              busy={busy}
              onPeriodTitleChange={(periodTitle) => updateState({ periodTitle })}
              onLessonModeChange={selectLessonMode}
              onEmptyCountChange={updateEmptyLessons}
              onPlanTextChange={updateTeachingPlan}
            />
          )}
          {state.currentStep === 3 && (
            <ScheduleStep
              state={state}
              firstDate={regularFirstDate}
              regularTime={regularTime}
              repeat={regularRepeat}
              excludedDates={excludedDates}
              exceptionDate={exceptionDate}
              durationText={durationText}
              freeDateTime={freeDateTime}
              busy={busy}
              onModeChange={selectScheduleMode}
              onFirstDateChange={(value) => { setRegularFirstDate(value); regenerateRegular({ firstDate: value }) }}
              onRegularTimeChange={(value) => { setRegularTime(value); regenerateRegular({ time: value }) }}
              onRepeatChange={(value) => { setRegularRepeat(value); regenerateRegular({ repeat: value }) }}
              onExceptionDateChange={setExceptionDate}
              onAddException={() => addException()}
              onRemoveException={removeException}
              onDurationChange={updateDuration}
              onFreeDateTimeChange={updateFreeDateTime}
              onOpenCalendar={() => setCalendarOpen(true)}
              onEditLesson={setEditingLesson}
              onClearLesson={clearSchedule}
            />
          )}
          {state.currentStep === 4 && (
            <ReviewStep
              state={state}
              submissionError={submissionError}
              onEdit={(step) => updateState({ currentStep: step })}
            />
          )}
        </div>

        <footer className="quick-course-footer">
          <button className="secondary-button" type="button" disabled={busy} onClick={() => {
            if (state.currentStep === 1) requestClose()
            else updateState({ currentStep: (state.currentStep - 1) as 1 | 2 | 3 })
          }}>{state.currentStep === 1 ? '取消' : '上一步'}</button>
          <div>
            {footerIssue !== undefined && footerIssue !== '' && <span className="quick-course-footer-error" role="status">{footerIssue}</span>}
            {state.currentStep < 4 ? (
              <button className="primary-button" type="button" disabled={busy || !validation.valid || lessonInputError !== '' || (state.currentStep === 3 && scheduleError !== '')} onClick={state.currentStep === 1 ? goToLessons : state.currentStep === 2 ? goToSchedule : goToReview}>下一步</button>
            ) : (
              <button className="primary-button" type="button" disabled={busy || !validation.valid} onClick={() => void createSetup()}>{submitting ? '正在创建…' : '创建课程'}</button>
            )}
          </div>
        </footer>

        {duplicateEntry !== null && (
          <DuplicateStudentDialog overview={overview} entry={duplicateEntry} busy={busy} onCancel={() => setDuplicateEntry(null)} onResolve={(resolution) => resolveDuplicate(duplicateEntry, resolution)} />
        )}
        {calendarOpen && (
          <FreeDateCalendarDialog
            initialDates={state.selectedFreeDates}
            initialMonth={regularFirstDate.slice(0, 7)}
            busy={busy}
            onClose={() => setCalendarOpen(false)}
            onApply={applyFreeDates}
          />
        )}
        {editingLesson !== null && (
          <LessonScheduleEditor
            lesson={editingLesson}
            busy={busy}
            onClose={() => setEditingLesson(null)}
            onSave={(date, time) => updateLessonSchedule(editingLesson.key, date, time)}
          />
        )}
      </section>
    </div>
  )
}

export function ScheduleStep({
  state,
  firstDate,
  regularTime,
  repeat,
  excludedDates,
  exceptionDate,
  durationText,
  freeDateTime,
  busy,
  onModeChange,
  onFirstDateChange,
  onRegularTimeChange,
  onRepeatChange,
  onExceptionDateChange,
  onAddException,
  onRemoveException,
  onDurationChange,
  onFreeDateTimeChange,
  onOpenCalendar,
  onEditLesson,
  onClearLesson,
}: {
  readonly state: QuickCourseWizardState
  readonly firstDate: string
  readonly regularTime: string
  readonly repeat: RegularRepeat
  readonly excludedDates: readonly string[]
  readonly exceptionDate: string
  readonly durationText: string
  readonly freeDateTime: string
  readonly busy: boolean
  readonly onModeChange: (mode: QuickScheduleMode) => void
  readonly onFirstDateChange: (value: string) => void
  readonly onRegularTimeChange: (value: string) => void
  readonly onRepeatChange: (value: RegularRepeat) => void
  readonly onExceptionDateChange: (value: string) => void
  readonly onAddException: () => void
  readonly onRemoveException: (date: string) => void
  readonly onDurationChange: (value: string) => void
  readonly onFreeDateTimeChange: (value: string) => void
  readonly onOpenCalendar: () => void
  readonly onEditLesson: (lesson: QuickLessonDraft) => void
  readonly onClearLesson: (lessonKey: string) => void
}): React.JSX.Element {
  return (
    <div className="quick-course-two-column quick-schedule-layout">
      <section className="quick-course-form-panel">
        <h3>上课安排</h3>
        <div className="quick-schedule-modes" role="radiogroup" aria-label="排课方式">
          {([
            ['regular', '按规律排课'],
            ['free_dates', '自由选择日期'],
            ['unscheduled', '暂不排课'],
          ] as const).map(([mode, label]) => (
            <button className={state.scheduleMode === mode ? 'is-active' : ''} type="button" role="radio" aria-checked={state.scheduleMode === mode} disabled={busy} key={mode} onClick={() => onModeChange(mode)}>{label}</button>
          ))}
        </div>

        {state.scheduleMode === 'regular' && (
          <div className="quick-schedule-fields">
            <label>首次上课<input type="date" value={firstDate} disabled={busy} onChange={(event) => onFirstDateChange(event.target.value)} /></label>
            <label>上课时间<input type="time" value={regularTime} disabled={busy} onChange={(event) => onRegularTimeChange(event.target.value)} /></label>
            <fieldset className="quick-course-segmented" disabled={busy}>
              <legend>重复</legend>
              <label className={repeat === 'weekly' ? 'is-active' : ''}><input type="radio" name="quick-repeat" checked={repeat === 'weekly'} onChange={() => onRepeatChange('weekly')} />每周</label>
              <label className={repeat === 'biweekly' ? 'is-active' : ''}><input type="radio" name="quick-repeat" checked={repeat === 'biweekly'} onChange={() => onRepeatChange('biweekly')} />每两周</label>
            </fieldset>
            <div className="quick-exception-editor">
              <label>不上课日期<input type="date" value={exceptionDate} disabled={busy} onChange={(event) => onExceptionDateChange(event.target.value)} /></label>
              <button className="secondary-button" type="button" disabled={busy || exceptionDate === ''} onClick={onAddException}>添加例外</button>
            </div>
            {excludedDates.length > 0 && <div className="quick-date-chips">{excludedDates.map((date) => <button type="button" disabled={busy} key={date} onClick={() => onRemoveException(date)}>{date} ×</button>)}</div>}
          </div>
        )}

        {state.scheduleMode === 'free_dates' && (
          <div className="quick-schedule-fields">
            <label>统一上课时间<input type="time" value={freeDateTime} disabled={busy} onChange={(event) => onFreeDateTimeChange(event.target.value)} /></label>
            <button className="calendar-launch-button" type="button" disabled={busy} onClick={onOpenCalendar}>打开日历选择日期</button>
            <p className="quick-course-help">已选择 {state.selectedFreeDates.length} 天。教学计划可保留剩余未排课课次；空课次可确认后同步数量。</p>
          </div>
        )}

        {state.scheduleMode === 'unscheduled' && (
          <div className="quick-unscheduled-note"><strong>先建立课程框架，暂不设置日期</strong><p>全部课次都会保留，之后仍可逐节设置时间。</p></div>
        )}

        <label className="quick-duration-field">课程时长（分钟，可选）<input type="number" min="1" step="1" value={durationText} disabled={busy} onChange={(event) => onDurationChange(event.target.value)} placeholder="例如 90" /></label>
        <p className="quick-course-help">时长会写入每节课；即使暂不排课也会保存。</p>
      </section>

      <SchedulePreview
        state={state}
        busy={busy}
        onEditLesson={onEditLesson}
        onClearLesson={onClearLesson}
      />
    </div>
  )
}

export function SchedulePreview({ state, busy, onEditLesson, onClearLesson }: {
  readonly state: QuickCourseWizardState
  readonly busy: boolean
  readonly onEditLesson: (lesson: QuickLessonDraft) => void
  readonly onClearLesson: (lessonKey: string) => void
}): React.JSX.Element {
  const review = buildScheduleReview(state.lessons)
  return (
    <section className="quick-course-preview-panel" aria-label="排课预览">
      <header><div><h3>排课预览</h3><p>{review.countText}</p></div><span className={`quick-status is-${review.status}`}>{review.headline}</span></header>
      <ol className="quick-schedule-preview-list">
        {state.lessons.map((lesson, index) => (
          <li key={lesson.key}>
            <span className="lesson-index">第 {index + 1} 课</span>
            <strong>{lesson.title}</strong>
            <time>{formatUtcAsLocal(lesson.scheduledAt)}</time>
            <small>{lesson.durationMinutes === null ? '未设时长' : `${lesson.durationMinutes} 分钟`}</small>
            <button className="link-button" type="button" disabled={busy || state.scheduleMode === 'unscheduled'} onClick={() => onEditLesson(lesson)}>改时间</button>
            {state.scheduleMode === 'regular' && lesson.scheduledAt !== null && <button className="link-button" type="button" disabled={busy} onClick={() => onClearLesson(lesson.key)}>清空</button>}
          </li>
        ))}
      </ol>
    </section>
  )
}

export function ReviewStep({ state, submissionError, onEdit }: {
  readonly state: QuickCourseWizardState
  readonly submissionError: { readonly message: string; readonly step: 1 | 2 | 3 | 4 } | null
  readonly onEdit: (step: 1 | 2 | 3) => void
}): React.JSX.Element {
  const review = buildScheduleReview(state.lessons)
  const rosterNames = state.roster.entries.map((entry) => entry.name)
  return (
    <div className="quick-review-page">
      {submissionError !== null && (
        <div className="inline-error quick-submit-error" role="alert">
          <span>创建失败：{submissionError.message}</span>
          {submissionError.step < 4 && <button className="link-button" type="button" onClick={() => onEdit(submissionError.step as 1 | 2 | 3)}>返回第 {submissionError.step} 步修改</button>}
        </div>
      )}
      <ReviewCard title="课程与学生" onEdit={() => onEdit(1)}>
        <strong>{state.courseTitle.trim()}</strong>
        <p>{state.mode === 'class' ? '班课' : '一对一'} · {rosterNames.length === 0 ? '暂未关联学生' : `${rosterNames.length} 位学生`}</p>
        {rosterNames.length > 0 && <small>{rosterNames.join('、')}</small>}
      </ReviewCard>
      <ReviewCard title="阶段与课次" onEdit={() => onEdit(2)}>
        <strong>{state.periodTitle.trim()}</strong>
        <p>{state.lessons.length} 节课 · {state.lessonMode === 'empty' ? '空课次' : '教学计划'}</p>
      </ReviewCard>
      <ReviewCard title="上课安排" onEdit={() => onEdit(3)}>
        <strong>{review.headline}</strong>
        <p>{review.countText}{review.durationMinutes === null ? '' : ` · 每节 ${review.durationMinutes} 分钟`}</p>
        {review.firstScheduledAt !== null && <small>首课 {formatUtcAsLocal(review.firstScheduledAt)} · 末课 {formatUtcAsLocal(review.lastScheduledAt)}</small>}
      </ReviewCard>
      <section className="quick-review-lessons">
        <h3>最终课次</h3>
        <ol>{state.lessons.map((lesson, index) => <li key={lesson.key}><span>{formatLessonPreviewTitle(lesson, index)}</span><time>{formatUtcAsLocal(lesson.scheduledAt)}</time></li>)}</ol>
      </section>
    </div>
  )
}

function ReviewCard({ title, onEdit, children }: {
  readonly title: string
  readonly onEdit: () => void
  readonly children: React.ReactNode
}): React.JSX.Element {
  return <section className="quick-review-card"><header><h3>{title}</h3><button className="link-button" type="button" onClick={onEdit}>修改</button></header><div>{children}</div></section>
}

export function FreeDateCalendarDialog({ initialDates, initialMonth, busy, onClose, onApply }: {
  readonly initialDates: readonly string[]
  readonly initialMonth: string
  readonly busy: boolean
  readonly onClose: () => void
  readonly onApply: (dates: readonly string[]) => boolean
}): React.JSX.Element {
  const [selected, setSelected] = useState<string[]>([...initialDates])
  const [month, setMonth] = useState(initialMonth)
  const days = calendarDays(month)
  return (
    <div className="quick-duplicate-backdrop" role="presentation">
      <section className="quick-calendar-dialog" role="dialog" aria-modal="true" aria-label="自由选择上课日期">
        <header><div><h3>自由选择上课日期</h3><p>适合寒暑假、集训和不规律排课；点击日期可多选或取消。</p></div><button className="modal-close" type="button" disabled={busy} aria-label="关闭日历" onClick={onClose}>×</button></header>
        <div className="quick-calendar-toolbar"><button type="button" disabled={busy} aria-label="上个月" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button><strong>{formatMonth(month)}</strong><button type="button" disabled={busy} aria-label="下个月" onClick={() => setMonth(shiftMonth(month, 1))}>›</button></div>
        <div className="quick-calendar-weekdays" aria-hidden="true">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="quick-calendar-grid">{days.map((day, index) => day === null ? <span key={`empty-${index}`} /> : <button className={selected.includes(day) ? 'is-selected' : ''} type="button" disabled={busy} aria-pressed={selected.includes(day)} key={day} onClick={() => setSelected(toggleSelectedDate(selected, day))}>{Number(day.slice(-2))}</button>)}</div>
        <div className="quick-selected-dates"><strong>已选 {selected.length} 天</strong><span>{selected.join('、') || '尚未选择日期'}</span></div>
        <footer className="modal-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>取消</button><button className="primary-button" type="button" disabled={busy || selected.length === 0} onClick={() => onApply(selected)}>添加 {selected.length} 节课</button></footer>
      </section>
    </div>
  )
}

function LessonScheduleEditor({ lesson, busy, onClose, onSave }: {
  readonly lesson: QuickLessonDraft
  readonly busy: boolean
  readonly onClose: () => void
  readonly onSave: (date: string, time: string) => void
}): React.JSX.Element {
  const initial = utcToLocalParts(lesson.scheduledAt)
  const [date, setDate] = useState(initial.date)
  const [time, setTime] = useState(initial.time)
  return (
    <div className="quick-duplicate-backdrop" role="presentation">
      <section className="quick-lesson-editor" role="dialog" aria-modal="true" aria-label={`调整 ${lesson.title} 时间`}>
        <header><div><h3>调整上课时间</h3><p>{lesson.title}</p></div><button className="modal-close" type="button" onClick={onClose}>×</button></header>
        <div className="quick-editor-fields"><label>日期<input type="date" value={date} disabled={busy} onChange={(event) => setDate(event.target.value)} /></label><label>时间<input type="time" value={time} disabled={busy} onChange={(event) => setTime(event.target.value)} /></label></div>
        <footer className="modal-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>取消</button><button className="primary-button" type="button" disabled={busy || date === '' || time === ''} onClick={() => onSave(date, time)}>保存</button></footer>
      </section>
    </div>
  )
}

function parseDuration(value: string): number | null {
  if (value.trim() === '') return null
  const duration = Number(value)
  if (!Number.isInteger(duration) || duration <= 0) throw new Error('课程时长必须是正整数分钟。')
  return duration
}

function toLocalDateKey(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
}

function utcToLocalParts(value: string | null): { readonly date: string; readonly time: string } {
  if (value === null) return { date: '', time: '14:00' }
  const date = new Date(value)
  return { date: toLocalDateKey(date), time: `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}` }
}

function formatUtcAsLocal(value: string | null): string {
  if (value === null) return '未排课'
  const date = new Date(value)
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${weekday} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

function calendarDays(month: string): Array<string | null> {
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(year!, monthNumber! - 1, 1, 12)
  const lastDay = new Date(year!, monthNumber!, 0, 12).getDate()
  const mondayOffset = (first.getDay() + 6) % 7
  return [...Array.from({ length: mondayOffset }, () => null), ...Array.from({ length: lastDay }, (_, index) => `${year!.toString().padStart(4, '0')}-${monthNumber!.toString().padStart(2, '0')}-${(index + 1).toString().padStart(2, '0')}`)]
}

function shiftMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const next = new Date(year!, monthNumber! - 1 + amount, 1, 12)
  return `${next.getFullYear().toString().padStart(4, '0')}-${(next.getMonth() + 1).toString().padStart(2, '0')}`
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-')
  return `${year} 年 ${Number(monthNumber)} 月`
}

function locateErrorStep(message: string): 1 | 2 | 3 | 4 {
  if (/学生|课程名称|一对一/u.test(message)) return 1
  if (/阶段|课次|100 节|标题/u.test(message)) return 2
  if (/时间|日期|时长|session/iu.test(message)) return 3
  return 4
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : '创建失败，请稍后重试。'
}
