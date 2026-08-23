import { useEffect, useState, type FormEvent } from 'react'

import type { CoreOverview, NodeRecord } from '../shared/core-contracts'
import {
  formatLocalDateTime,
  getLessonNumber,
  listValidCurrentLessons,
  localDateTimeToUtc,
  toDateTimeLocalValue,
  type CourseSummary,
} from './course-view-model'
import { createLessonPrepContext, type LessonPrepContext } from './lesson-prep-context'
import Modal from './modal'

type CourseTab = 'lessons' | 'students' | 'materials'

export default function CourseDetail({
  overview,
  summary,
  viewedLessonId,
  busy,
  onViewLesson,
  onStartPrep,
  onOpenAttendance,
  onConfirmTaught,
  onAction,
}: {
  readonly overview: CoreOverview
  readonly summary: CourseSummary | null
  readonly viewedLessonId: string
  readonly busy: boolean
  readonly onViewLesson: (lessonId: string) => void
  readonly onStartPrep: (context: LessonPrepContext) => void
  readonly onOpenAttendance: (lessonId: string) => void
  readonly onConfirmTaught: (lessonId: string) => void
  readonly onAction: (action: () => Promise<void>, successMessage: string) => Promise<boolean>
}): React.JSX.Element {
  const [tab, setTab] = useState<CourseTab>('lessons')
  const [createPeriodOpen, setCreatePeriodOpen] = useState(false)
  const [createLessonPeriodId, setCreateLessonPeriodId] = useState<string | null>(null)
  const [scheduleLessonId, setScheduleLessonId] = useState<string | null>(null)
  const [progressOpen, setProgressOpen] = useState(false)

  useEffect(() => {
    if (summary === null) return
    if (!summary.lessons.some((lesson) => lesson.id === viewedLessonId)) {
      onViewLesson(summary.currentLesson?.id ?? summary.lessons[0]?.id ?? '')
    }
  }, [onViewLesson, summary, viewedLessonId])

  if (summary === null) {
    return (
      <section className="course-detail-pane course-detail-empty">
        <div>
          <h2>选择一门课程</h2>
          <p>在左侧课程列表中选择课程，右侧会显示阶段、课次、学生和资料入口。</p>
        </div>
      </section>
    )
  }

  const viewedLesson = summary.lessons.find((lesson) => lesson.id === viewedLessonId) ?? null
  const viewedPeriod = summary.periods.find((period) => period.id === viewedLesson?.parentId) ?? null

  return (
    <section className="course-detail-pane" aria-label="课程详情">
      <header className="course-detail-header">
        <div>
          <span className="course-detail-mode">{summary.course.courseMode === 'one_to_one' ? '一对一' : '班课'}</span>
          <h2>{summary.course.title}</h2>
          <p>{courseStudentsLine(summary)}</p>
          <p>{currentLessonLine(summary)}</p>
        </div>
        <div className="course-detail-actions">
          {!summary.ended && summary.lessons.length > 0 && (
            <button className="secondary-button" type="button" disabled={busy} onClick={() => setProgressOpen(true)}>
              调整当前课次
            </button>
          )}
          {summary.ended ? (
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => void onAction(
                async () => window.teacherWorkbench.core.reopenCourse({ courseId: summary.course.id }).then(() => undefined),
                '课程已重新开启，原有效进度位置已保留。',
              )}
            >
              重新开启课程
            </button>
          ) : (
            <details className="course-more-menu">
              <summary>更多</summary>
              <button className="danger-button" type="button" disabled={busy} onClick={() => void onAction(
                async () => window.teacherWorkbench.core.endCourse({ courseId: summary.course.id }).then(() => undefined),
                '课程已结束，课程树和历史记录均已保留。',
              )}>结束课程</button>
            </details>
          )}
        </div>
      </header>

      <nav className="course-detail-tabs" aria-label="课程详情分区">
        {([
          ['lessons', '课次'],
          ['students', '学生'],
          ['materials', '资料'],
        ] as const).map(([value, label]) => (
          <button
            className={tab === value ? 'is-active' : ''}
            type="button"
            key={value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'lessons' ? (
        <LessonsSection
          overview={overview}
          summary={summary}
          viewedLesson={viewedLesson}
          busy={busy}
          onViewLesson={onViewLesson}
          onCreatePeriod={() => setCreatePeriodOpen(true)}
          onCreateLesson={setCreateLessonPeriodId}
          onSchedule={setScheduleLessonId}
          onOpenAttendance={onOpenAttendance}
          onConfirmTaught={onConfirmTaught}
          onStartPrep={onStartPrep}
          onAction={onAction}
        />
      ) : tab === 'students' ? (
        <CourseStudentsSection overview={overview} summary={summary} busy={busy} onAction={onAction} />
      ) : (
        <div className="course-materials-placeholder">
          <h3>{viewedLesson === null ? '课次资料' : `${viewedPeriod?.title ?? ''} · ${viewedLesson.title}`}</h3>
          <p>{viewedLesson === null
            ? '请先选择一个课次查看资料。'
            : '当前 Viewed Lesson 已明确；课次资料的复用视图将在 V12-04 接入，不显示学生文件。'}</p>
          {viewedLesson !== null && (
            <button className="primary-button" type="button" onClick={() => onStartPrep(
              createLessonPrepContext(summary.course, viewedLesson, summary.activeStudents),
            )}>
              开始备课
            </button>
          )}
        </div>
      )}

      {createPeriodOpen && (
        <CreatePeriodModal
          summary={summary}
          busy={busy}
          onClose={() => setCreatePeriodOpen(false)}
          onAction={onAction}
        />
      )}
      {createLessonPeriodId !== null && (
        <CreateLessonModal
          summary={summary}
          periodId={createLessonPeriodId}
          busy={busy}
          onViewLesson={onViewLesson}
          onClose={() => setCreateLessonPeriodId(null)}
          onAction={onAction}
        />
      )}
      {scheduleLessonId !== null && (
        <ScheduleLessonModal
          overview={overview}
          lessonId={scheduleLessonId}
          busy={busy}
          onClose={() => setScheduleLessonId(null)}
          onAction={onAction}
        />
      )}
      {progressOpen && (
        <ProgressModal
          overview={overview}
          summary={summary}
          viewedLessonId={viewedLessonId}
          busy={busy}
          onClose={() => setProgressOpen(false)}
          onAction={onAction}
        />
      )}
    </section>
  )
}

function LessonsSection({
  overview,
  summary,
  viewedLesson,
  busy,
  onViewLesson,
  onCreatePeriod,
  onCreateLesson,
  onSchedule,
  onOpenAttendance,
  onConfirmTaught,
  onStartPrep,
  onAction,
}: {
  readonly overview: CoreOverview
  readonly summary: CourseSummary
  readonly viewedLesson: NodeRecord | null
  readonly busy: boolean
  readonly onViewLesson: (lessonId: string) => void
  readonly onCreatePeriod: () => void
  readonly onCreateLesson: (periodId: string) => void
  readonly onSchedule: (lessonId: string) => void
  readonly onOpenAttendance: (lessonId: string) => void
  readonly onConfirmTaught: (lessonId: string) => void
  readonly onStartPrep: (context: LessonPrepContext) => void
  readonly onAction: (action: () => Promise<void>, successMessage: string) => Promise<boolean>
}): React.JSX.Element {
  const sessionByLesson = new Map(overview.lessonSessions.map((session) => [session.lessonId, session]))
  const viewedSession = viewedLesson === null ? undefined : sessionByLesson.get(viewedLesson.id)
  return (
    <div className="course-lessons-section">
      <div className="section-toolbar">
        <div><h3>阶段与课次</h3><p>点击课次只改变 Viewed Lesson，不会改变 Current Lesson。</p></div>
        <button className="secondary-button" type="button" disabled={busy || summary.ended} onClick={onCreatePeriod}>+ 新建阶段</button>
      </div>
      <div className="period-list">
        {summary.periods.map((period) => {
          const lessons = summary.lessons.filter((lesson) => lesson.parentId === period.id)
          return (
            <section className="period-block" key={period.id}>
              <header>
                <strong>{period.title}</strong>
                <button className="link-button" type="button" disabled={busy || summary.ended} onClick={() => onCreateLesson(period.id)}>+ 新建课次</button>
              </header>
              <div className="lesson-row-list">
                {lessons.map((lesson, index) => {
                  const session = sessionByLesson.get(lesson.id)
                  return (
                    <button
                      className={`lesson-row${viewedLesson?.id === lesson.id ? ' is-viewed' : ''}`}
                      type="button"
                      key={lesson.id}
                      onClick={() => onViewLesson(lesson.id)}
                    >
                      <span className="lesson-number">第 {index + 1} 课</span>
                      <strong>{lesson.title}</strong>
                      <span className="lesson-row-status">
                        {session?.taughtConfirmedAt !== null && session?.taughtConfirmedAt !== undefined && <em>已上</em>}
                        {summary.currentLesson?.id === lesson.id && <em className="is-current">Current</em>}
                        {session?.attendanceRecordedAt !== null && session?.attendanceRecordedAt !== undefined && <em>已点名</em>}
                        {session?.scheduledAt !== null && session?.scheduledAt !== undefined && <small>{formatLocalDateTime(session.scheduledAt)}</small>}
                      </span>
                    </button>
                  )
                })}
                {lessons.length === 0 && <p className="empty-state">该阶段还没有课次。</p>}
              </div>
            </section>
          )
        })}
        {summary.periods.length === 0 && (
          <div className="course-zero-state">
            <h3>先创建第一个阶段</h3>
            <p>课程创建成功后，阶段与课次分开建立；第一课创建后会初始化为 Current Lesson。</p>
            <button className="primary-button" type="button" disabled={busy || summary.ended} onClick={onCreatePeriod}>创建阶段</button>
          </div>
        )}
      </div>

      {viewedLesson !== null && (
        <aside className="viewed-lesson-panel">
          <div>
            <span className="viewed-label">Viewed Lesson</span>
            <h3>{viewedLesson.title}</h3>
            <p>排课：{formatLocalDateTime(viewedSession?.scheduledAt ?? null)} · 点名：{viewedSession?.attendanceRecordedAt === null || viewedSession === undefined ? '未保存' : `已记录 ${viewedSession.totalCount} 人`}</p>
          </div>
          <div className="viewed-lesson-actions">
            <button className="primary-button" type="button" onClick={() => onStartPrep(
              createLessonPrepContext(summary.course, viewedLesson, summary.activeStudents),
            )}>开始备课</button>
            <button className="secondary-button" type="button" disabled={busy || summary.ended} onClick={() => onSchedule(viewedLesson.id)}>设置时间</button>
            <button className="secondary-button" type="button" disabled={busy || summary.ended} onClick={() => onOpenAttendance(viewedLesson.id)}>
              {viewedSession?.attendanceRecordedAt === null || viewedSession === undefined ? '点名' : '修改点名'}
            </button>
            {viewedSession?.taughtConfirmedAt === null || viewedSession === undefined ? (
              <button className="secondary-button" type="button" disabled={busy || summary.ended} onClick={() => onConfirmTaught(viewedLesson.id)}>确认本课已上</button>
            ) : (
              <details className="lesson-more-menu">
                <summary>更多</summary>
                <button className="danger-button" type="button" disabled={busy} onClick={() => void onAction(
                  async () => window.teacherWorkbench.core.undoLessonTaught({
                    courseId: summary.course.id,
                    lessonId: viewedLesson.id,
                  }),
                  '已撤销本课已上；Current Lesson 未自动回退。',
                )}>撤销本课已上</button>
              </details>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

function CourseStudentsSection({ overview, summary, busy, onAction }: {
  readonly overview: CoreOverview
  readonly summary: CourseSummary
  readonly busy: boolean
  readonly onAction: (action: () => Promise<void>, successMessage: string) => Promise<boolean>
}): React.JSX.Element {
  const [studentId, setStudentId] = useState('')
  const linkedIds = new Set(summary.links.map((link) => link.studentId))
  const candidates = overview.students.filter((student) => !linkedIds.has(student.id))
  return (
    <div className="course-students-section">
      <div className="section-toolbar">
        <div><h3>在读学生</h3><p>退出与重新加入只改变课程关系，不删除历史点名或学习记录。</p></div>
      </div>
      <div className="student-link-row">
        <select aria-label="关联已有学生" value={studentId} disabled={busy || candidates.length === 0 || summary.ended} onChange={(event) => setStudentId(event.target.value)}>
          <option value="">选择已有学生</option>
          {candidates.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
        </select>
        <button className="primary-button" type="button" disabled={busy || studentId === '' || summary.ended} onClick={() => void onAction(
          async () => {
            await window.teacherWorkbench.core.linkStudentToCourse({ courseId: summary.course.id, studentId })
            setStudentId('')
          },
          '学生已关联到课程。',
        )}>关联学生</button>
      </div>
      <div className="course-student-list">
        {summary.activeStudents.map((student) => (
          <div className="course-student-row" key={student.id}>
            <strong>{student.name}</strong><span>在读</span>
            <button className="danger-button" type="button" disabled={busy || summary.ended} onClick={() => void onAction(
              async () => {
                await window.teacherWorkbench.core.endCourseStudentLink({
                  courseId: summary.course.id,
                  studentId: student.id,
                })
              },
              '学生已退出课程，历史记录保持不变。',
            )}>标记退出</button>
          </div>
        ))}
        {summary.activeStudents.length === 0 && <p className="empty-state">当前没有在读学生。</p>}
      </div>
      {summary.historicalStudents.length > 0 && (
        <details className="historical-students">
          <summary>已退出学生（{summary.historicalStudents.length}）</summary>
          {summary.historicalStudents.map((student) => (
            <div className="course-student-row" key={student.id}>
              <strong>{student.name}</strong><span>已退出</span>
              <button className="link-button" type="button" disabled={busy || summary.ended} onClick={() => void onAction(
                async () => {
                  await window.teacherWorkbench.core.reactivateCourseStudentLink({
                    courseId: summary.course.id,
                    studentId: student.id,
                  })
                },
                '学生已重新加入课程；旧点名快照未改变。',
              )}>重新加入</button>
            </div>
          ))}
        </details>
      )}
    </div>
  )
}

function CreatePeriodModal({ summary, busy, onClose, onAction }: {
  readonly summary: CourseSummary
  readonly busy: boolean
  readonly onClose: () => void
  readonly onAction: (action: () => Promise<void>, successMessage: string) => Promise<boolean>
}): React.JSX.Element {
  const [title, setTitle] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const success = await onAction(async () => {
      await window.teacherWorkbench.core.createPeriod({ courseId: summary.course.id, title })
    }, '阶段已创建。')
    if (success) onClose()
  }
  return (
    <Modal title="新建阶段" description={summary.course.title} onClose={onClose}>
      <form className="modal-form" onSubmit={(event) => void submit(event)}>
        <label className="modal-field">阶段名称 *<input autoFocus value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} placeholder="例如：2026 秋季" /></label>
        <footer className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={busy || title.trim() === ''}>创建阶段</button></footer>
      </form>
    </Modal>
  )
}

function CreateLessonModal({ summary, periodId, busy, onViewLesson, onClose, onAction }: {
  readonly summary: CourseSummary
  readonly periodId: string
  readonly busy: boolean
  readonly onViewLesson: (lessonId: string) => void
  readonly onClose: () => void
  readonly onAction: (action: () => Promise<void>, successMessage: string) => Promise<boolean>
}): React.JSX.Element {
  const [title, setTitle] = useState('')
  const period = summary.periods.find((candidate) => candidate.id === periodId)
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const success = await onAction(async () => {
      const lesson = await window.teacherWorkbench.core.createLesson({ periodId, title })
      if (summary.progress === null && summary.lessons.length === 0) {
        await window.teacherWorkbench.core.startPeriod({
          courseId: summary.course.id,
          periodId,
          initialLessonId: lesson.id,
        })
      }
      onViewLesson(lesson.id)
    }, summary.progress === null && summary.lessons.length === 0
      ? '第一课已创建并设为 Current Lesson。'
      : '课次已创建；Current Lesson 未自动改变。')
    if (success) onClose()
  }
  return (
    <Modal title="新建课次" description={`${summary.course.title} · ${period?.title ?? ''}`} onClose={onClose}>
      <form className="modal-form" onSubmit={(event) => void submit(event)}>
        <label className="modal-field">课次名称 *<input autoFocus value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} placeholder="例如：有理数混合运算" /></label>
        <footer className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={busy || title.trim() === ''}>创建课次</button></footer>
      </form>
    </Modal>
  )
}

function ScheduleLessonModal({ overview, lessonId, busy, onClose, onAction }: {
  readonly overview: CoreOverview
  readonly lessonId: string
  readonly busy: boolean
  readonly onClose: () => void
  readonly onAction: (action: () => Promise<void>, successMessage: string) => Promise<boolean>
}): React.JSX.Element {
  const session = overview.lessonSessions.find((candidate) => candidate.lessonId === lessonId)
  const lesson = overview.nodes.find((candidate) => candidate.id === lessonId)
  const [value, setValue] = useState(toDateTimeLocalValue(session?.scheduledAt ?? null))
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const scheduledAt = localDateTimeToUtc(value)
    const success = await onAction(async () => {
      await window.teacherWorkbench.attendance.updateSchedule({ lessonId, scheduledAt })
    }, scheduledAt === null ? '已清除上课时间。' : '上课时间已按本地时间保存。')
    if (success) onClose()
  }
  return (
    <Modal title="设置上课时间" description={lesson?.title} onClose={onClose}>
      <form className="modal-form" onSubmit={(event) => void submit(event)}>
        <label className="modal-field">Windows 本地日期与时间<input type="datetime-local" value={value} disabled={busy} onChange={(event) => setValue(event.target.value)} /></label>
        <p className="modal-hint">保存时转换为 UTC ISO 8601；“今日待点名”再按本地日界显示。</p>
        <footer className="modal-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setValue('')}>清除时间</button><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={busy}>保存</button></footer>
      </form>
    </Modal>
  )
}

function ProgressModal({ overview, summary, viewedLessonId, busy, onClose, onAction }: {
  readonly overview: CoreOverview
  readonly summary: CourseSummary
  readonly viewedLessonId: string
  readonly busy: boolean
  readonly onClose: () => void
  readonly onAction: (action: () => Promise<void>, successMessage: string) => Promise<boolean>
}): React.JSX.Element {
  const validLessons = listValidCurrentLessons(overview, summary)
  const initial = validLessons.find((lesson) => lesson.id === viewedLessonId)?.id ?? summary.currentLesson?.id ?? validLessons[0]?.id ?? 'clear'
  const [choice, setChoice] = useState(initial)
  async function apply(): Promise<void> {
    const success = await onAction(async () => {
      if (choice === 'clear') {
        await window.teacherWorkbench.core.clearCurrentLesson({
          courseId: summary.course.id,
          expectedCurrentLessonId: summary.progress?.currentLessonId ?? null,
        })
        return
      }
      const lesson = validLessons.find((candidate) => candidate.id === choice)
      if (lesson?.parentId === null || lesson === undefined) throw new Error('所选课次无效。')
      if (summary.progress?.activePeriodId === lesson.parentId) {
        await window.teacherWorkbench.core.setCurrentLesson({
          courseId: summary.course.id,
          lessonId: lesson.id,
          expectedCurrentLessonId: summary.progress.currentLessonId,
        })
      } else {
        await window.teacherWorkbench.core.startPeriod({
          courseId: summary.course.id,
          periodId: lesson.parentId,
          initialLessonId: lesson.id,
        })
      }
    }, choice === 'clear' ? 'Current Lesson 已清空，课程保持活动。' : 'Current Lesson 已按老师选择更新。')
    if (success) onClose()
  }
  return (
    <Modal title="调整当前课次" description="选择其他阶段时会明确开始该阶段；不会按编号自动推进。" onClose={onClose}>
      <label className="modal-field">下一次默认处理<select value={choice} disabled={busy} onChange={(event) => setChoice(event.target.value)}>
        <option value="clear">暂不设置下一课</option>
        {validLessons.map((lesson) => {
          const period = summary.periods.find((candidate) => candidate.id === lesson.parentId)
          const number = lesson.parentId === null ? 0 : getLessonNumber(summary.lessons, lesson.parentId, lesson.id)
          return <option key={lesson.id} value={lesson.id}>{period?.title} · 第 {number} 课 {lesson.title}</option>
        })}
      </select></label>
      <footer className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="button" disabled={busy} onClick={() => void apply()}>保存选择</button></footer>
    </Modal>
  )
}

function courseStudentsLine(summary: CourseSummary): string {
  if (summary.activeStudents.length === 0) return '学生：未关联在读学生'
  return `学生：${summary.activeStudents.map((student) => student.name).join('、')}`
}

function currentLessonLine(summary: CourseSummary): string {
  if (summary.ended) return '状态：已结束'
  if (summary.currentLesson === null) return summary.lessons.length === 0 ? '当前：尚未创建课次' : '当前：等待老师选择下一课'
  return `当前：${summary.currentPeriod?.title ?? '未命名阶段'} / ${summary.currentLesson.title}`
}
