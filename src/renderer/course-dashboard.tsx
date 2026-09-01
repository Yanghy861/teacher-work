import { useEffect, useMemo, useState, type FormEvent } from 'react'

import type { CoreOverview, CourseMode, CreateCourseSetupResult } from '../shared/core-contracts'
import ConfirmLessonTaughtModal from './confirm-lesson-taught-modal'
import CourseDetail from './course-detail'
import CourseList from './course-list'
import {
  buildCourseSummaries,
  formatLocalDateTime,
  listTodayAttendance,
  type CourseSummary,
} from './course-view-model'
import LessonAttendanceModal from './lesson-attendance-modal'
import { createLessonPrepContext, type LessonPrepContext } from './lesson-prep-context'
import { useCoreOverview } from './core-overview-provider'
import Modal from './modal'
import QuickCourseWizard from './quick-course-wizard-full'
import { toErrorMessage } from './ui-utils'

type CourseFilter = 'active' | 'ended'

export default function CourseDashboard({
  selectedCourseId,
  initialViewedLessonId,
  onStartPrep,
  onOpenDraft,
  onOpenDraftInbox,
  onSelectCourse,
  onOpenStudent,
  onOpenTeachingContent,
}: {
  readonly selectedCourseId: string
  readonly initialViewedLessonId: string
  readonly onStartPrep: (context: LessonPrepContext) => void
  readonly onOpenDraft: (context: LessonPrepContext, noteId: string) => void
  readonly onOpenDraftInbox: () => void
  readonly onSelectCourse: (courseId: string) => void
  readonly onOpenStudent: (studentId: string) => void
  readonly onOpenTeachingContent: (context: LessonPrepContext) => void
}): React.JSX.Element {
  const { overview, loading, error: loadError, reload: reloadOverview, clearError } = useCoreOverview()
  const [actionError, setActionError] = useState('')
  const [viewedLessonId, setViewedLessonId] = useState(initialViewedLessonId)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<CourseFilter>('active')
  const [quickCourseOpen, setQuickCourseOpen] = useState(false)
  const [createCourseOpen, setCreateCourseOpen] = useState(false)
  const [attendanceLessonId, setAttendanceLessonId] = useState<string | null>(null)
  const [confirmLessonId, setConfirmLessonId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [quickCourseSuccess, setQuickCourseSuccess] = useState<CreateCourseSetupResult | null>(null)

  const summaries = useMemo(
    () => overview === null ? [] : buildCourseSummaries(overview),
    [overview],
  )
  const visibleSummaries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('zh-CN')
    return summaries.filter((summary) =>
      summary.ended === (filter === 'ended') &&
      (query === '' || summary.course.title.toLocaleLowerCase('zh-CN').includes(query)),
    )
  }, [filter, search, summaries])
  const selectedSummary = summaries.find((summary) => summary.course.id === selectedCourseId) ?? null
  const todayItems = useMemo(
    () => overview === null ? [] : listTodayAttendance(overview),
    [overview],
  )
  const draftCount = overview?.notes.filter(
    (note) => note.deletedAt === null && note.draftStatus === 'draft',
  ).length ?? 0

  useEffect(() => { clearError() }, [clearError])

  useEffect(() => {
    if (initialViewedLessonId === '') return
    const summary = summaries.find((candidate) => candidate.course.id === selectedCourseId)
    if (summary?.lessons.some((lesson) => lesson.id === initialViewedLessonId)) setViewedLessonId(initialViewedLessonId)
  }, [initialViewedLessonId, selectedCourseId, summaries])

  useEffect(() => {
    const target = summaries.find((summary) => summary.course.id === selectedCourseId)
    if (target !== undefined && target.ended !== (filter === 'ended')) {
      setFilter(target.ended ? 'ended' : 'active')
      return
    }
    if (loading) return
    if (!visibleSummaries.some((summary) => summary.course.id === selectedCourseId)) {
      onSelectCourse(visibleSummaries[0]?.course.id ?? '')
    }
  }, [filter, onSelectCourse, selectedCourseId, summaries, visibleSummaries, loading])

  async function reload(): Promise<void> {
    await reloadOverview()
  }

  async function runAction(
    action: () => Promise<void>,
    successMessage: string,
  ): Promise<boolean> {
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      await action()
      await reload()
      setNotice(successMessage)
      return true
    } catch (runError) {
      setActionError(toErrorMessage(runError, '操作失败，请稍后重试。'))
      return false
    } finally {
      setBusy(false)
    }
  }

  function selectCourse(courseId: string): void {
    onSelectCourse(courseId)
    const summary = summaries.find((candidate) => candidate.course.id === courseId)
    setViewedLessonId(summary?.currentLesson?.id ?? summary?.lessons[0]?.id ?? '')
  }

  function primaryAction(summary: CourseSummary): void {
    selectCourse(summary.course.id)
    if (summary.primaryAction === 'continue_prep' && summary.currentLesson !== null && summary.currentDraft !== null) {
      onOpenDraft(
        createLessonPrepContext(summary.course, summary.currentLesson, summary.activeStudents, summary.currentPeriod?.title),
        summary.currentDraft.id,
      )
      return
    }
    if (summary.primaryAction === 'start_prep' && summary.currentLesson !== null) {
      onStartPrep(createLessonPrepContext(summary.course, summary.currentLesson, summary.activeStudents, summary.currentPeriod?.title))
      return
    }
    if (summary.primaryAction === 'reopen') {
      void runAction(async () => {
        await window.teacherWorkbench.core.reopenCourse({ courseId: summary.course.id })
        setFilter('active')
      }, '课程已重新开启。')
    }
  }

  function openTodayAttendance(courseId: string, lessonId: string): void {
    setFilter('active')
    onSelectCourse(courseId)
    setViewedLessonId(lessonId)
    setAttendanceLessonId(lessonId)
  }

  if (loading && overview === null) {
    return <section className="workspace-card">正在读取课程数据…</section>
  }

  const attendanceContext = attendanceLessonId === null
    ? null
    : findLessonContext(summaries, attendanceLessonId)
  const confirmContext = confirmLessonId === null
    ? null
    : findLessonContext(summaries, confirmLessonId)

  return (
    <div className="course-dashboard" aria-live="polite">
      {(actionError !== '' || loadError !== '') && <div className="inline-error" role="alert">{actionError !== '' ? actionError : loadError}</div>}
      {notice !== '' && <div className="inline-notice" role="status">{notice}</div>}
      {quickCourseSuccess !== null && (
        <div className="quick-course-success" role="status">
          <div>
            <strong>“{quickCourseSuccess.course.title}”已创建</strong>
            <span>{quickCourseSuccess.lessons.length} 节课已加入课程，第 1 课已设为 Current Lesson。</span>
          </div>
          <div>
            <button className="primary-button" type="button" onClick={() => {
              const firstLesson = quickCourseSuccess.lessons[0]
              if (firstLesson !== undefined) {
                onStartPrep(createLessonPrepContext(
                  quickCourseSuccess.course,
                  firstLesson,
                  quickCourseSuccess.students,
                  quickCourseSuccess.period.title,
                ))
              }
            }}>进入第 1 课备课</button>
            <button className="modal-close" type="button" aria-label="关闭创建成功提示" onClick={() => setQuickCourseSuccess(null)}>×</button>
          </div>
        </div>
      )}

      <header className="course-page-header">
        <div className="course-page-stats">
          <span><strong>全部课程 {summaries.length}</strong></span>
          <button type="button" onClick={onOpenDraftInbox}>修改记录 {draftCount}</button>
        </div>
        <div className="course-page-actions">
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void reload()}>刷新</button>
          <button className="secondary-button" type="button" disabled={busy} onClick={() => setCreateCourseOpen(true)}>仅创建课程</button>
          <button className="primary-button" type="button" disabled={busy} onClick={() => { setQuickCourseSuccess(null); setQuickCourseOpen(true) }}>+ 快速建课</button>
        </div>
      </header>

      {todayItems.length > 0 && (
        <section className="today-attendance-strip" aria-label="今日待点名">
          <h2>今日待点名</h2>
          <div className="today-attendance-list">
            {todayItems.map((item) => (
              <div className="today-attendance-row" key={item.lesson.id}>
                <time>{formatLocalDateTime(item.session.scheduledAt)}</time>
                <div>
                  <strong>{item.course.title} · {item.period.title} · 第 {item.lessonNumber} 课 {item.lesson.title}</strong>
                  <span>{attendanceSummary(item.session, item.activeStudentCount)}</span>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => openTodayAttendance(item.course.id, item.lesson.id)}
                >
                  {item.session.attendanceRecordedAt === null ? '点名' : '修改点名'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="course-workspace-layout">
        <div className="course-list-column">
          <div className="course-list-tools">
            <input aria-label="搜索课程" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索课程" />
            <div className="segmented-control" aria-label="课程状态筛选">
              <button className={filter === 'active' ? 'is-active' : ''} type="button" onClick={() => setFilter('active')}>活动课程</button>
              <button className={filter === 'ended' ? 'is-active' : ''} type="button" onClick={() => setFilter('ended')}>已结束</button>
            </div>
          </div>
          <CourseList
            courses={visibleSummaries}
            selectedCourseId={selectedCourseId}
            busy={busy}
            onSelect={selectCourse}
            onPrimaryAction={primaryAction}
          />
        </div>
        {overview !== null && (
          <CourseDetail
            overview={overview}
            summary={selectedSummary}
            viewedLessonId={viewedLessonId}
            busy={busy}
            onViewLesson={setViewedLessonId}
            onStartPrep={onStartPrep}
            onOpenDraft={onOpenDraft}
            onOpenAttendance={setAttendanceLessonId}
            onConfirmTaught={setConfirmLessonId}
            onOpenStudent={onOpenStudent}
            onOpenTeachingContent={onOpenTeachingContent}
            onAction={runAction}
          />
        )}
      </div>

      {quickCourseOpen && overview !== null && (
        <QuickCourseWizard
          overview={overview}
          onClose={() => setQuickCourseOpen(false)}
          onCreated={async (result) => {
            setFilter('active')
            setSearch('')
            onSelectCourse(result.course.id)
            setViewedLessonId(result.lessons[0]?.id ?? '')
            await reload()
            setNotice('')
            setQuickCourseSuccess(result)
            setQuickCourseOpen(false)
          }}
        />
      )}
      {createCourseOpen && overview !== null && (
        <CreateCourseModal
          overview={overview}
          busy={busy}
          onClose={() => setCreateCourseOpen(false)}
          onCreated={(courseId) => {
            setFilter('active')
            setSearch('')
            onSelectCourse(courseId)
            setViewedLessonId('')
          }}
          onAction={runAction}
        />
      )}
      {attendanceContext !== null && (
        <LessonAttendanceModal
          lessonId={attendanceContext.lesson.id}
          courseTitle={attendanceContext.summary.course.title}
          lessonTitle={attendanceContext.lesson.title}
          onClose={() => setAttendanceLessonId(null)}
          onSaved={async (message) => {
            await reload()
            setNotice(message)
          }}
        />
      )}
      {confirmContext !== null && overview !== null && (
        <ConfirmLessonTaughtModal
          overview={overview}
          summary={confirmContext.summary}
          lesson={confirmContext.lesson}
          onClose={() => setConfirmLessonId(null)}
          onSaved={async (message) => {
            await reload()
            setNotice(message)
          }}
        />
      )}
    </div>
  )
}

function CreateCourseModal({ overview, busy, onClose, onCreated, onAction }: {
  readonly overview: CoreOverview
  readonly busy: boolean
  readonly onClose: () => void
  readonly onCreated: (courseId: string) => void
  readonly onAction: (action: () => Promise<void>, successMessage: string) => Promise<boolean>
}): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<CourseMode>('one_to_one')
  const [studentIds, setStudentIds] = useState<string[]>([])

  function toggleStudent(studentId: string): void {
    setStudentIds((current) => current.includes(studentId)
      ? current.filter((id) => id !== studentId)
      : mode === 'one_to_one' ? [studentId] : [...current, studentId])
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    let createdId = ''
    const success = await onAction(async () => {
      const created = await window.teacherWorkbench.core.createCourse({ title, mode, studentIds })
      createdId = created.id
    }, '课程已创建，请继续创建第一个阶段。')
    if (success) {
      onCreated(createdId)
      onClose()
    }
  }

  return (
    <Modal title="仅创建课程" description="只建立课程和可选学生关系；阶段、课次与排课稍后逐项添加。" onClose={onClose}>
      <form className="modal-form" onSubmit={(event) => void submit(event)}>
        <label className="modal-field">课程名称 *<input autoFocus value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} placeholder="例如：张三一对一" /></label>
        <fieldset className="course-mode-fieldset" disabled={busy}>
          <legend>课程类型 *</legend>
          <label><input type="radio" name="course-mode" checked={mode === 'one_to_one'} onChange={() => { setMode('one_to_one'); setStudentIds((current) => current.slice(0, 1)) }} />一对一</label>
          <label><input type="radio" name="course-mode" checked={mode === 'class'} onChange={() => setMode('class')} />班课</label>
        </fieldset>
        <fieldset className="course-student-fieldset" disabled={busy}>
          <legend>关联已有学生（可选）</legend>
          {overview.students.map((student) => (
            <label key={student.id}><input type="checkbox" checked={studentIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />{student.name}</label>
          ))}
          {overview.students.length === 0 && <p className="empty-state">还没有学生，可稍后从学生页创建并关联。</p>}
        </fieldset>
        <footer className="modal-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={busy || title.trim() === ''}>创建课程</button></footer>
      </form>
    </Modal>
  )
}

function findLessonContext(summaries: readonly CourseSummary[], lessonId: string): {
  readonly summary: CourseSummary
  readonly lesson: CourseSummary['lessons'][number]
} | null {
  for (const summary of summaries) {
    const lesson = summary.lessons.find((candidate) => candidate.id === lessonId)
    if (lesson !== undefined) return { summary, lesson }
  }
  return null
}

function attendanceSummary(
  session: CoreOverview['lessonSessions'][number],
  activeStudentCount: number,
): string {
  if (session.attendanceRecordedAt === null) {
    return activeStudentCount === 0 ? '未关联学生' : `${activeStudentCount} 位学生 · 待点名`
  }
  return `已到 ${session.presentCount} / ${session.totalCount} · 请假 ${session.leaveCount} · 缺席 ${session.absentCount}`
}
