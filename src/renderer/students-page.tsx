import { useEffect, useMemo, useState, type FormEvent } from 'react'

import type { CoreOverview, NoteRecord } from '../shared/core-contracts'
import Modal from './modal'
import {
  buildStudentSummaries,
  listStudentLessonOptions,
  type StudentCourseSummary,
  type StudentSummary,
} from './students-view-model'

export default function StudentsPage({
  selectedStudentId,
  onSelectStudent,
  onOpenCourse,
}: {
  readonly selectedStudentId: string
  readonly onSelectStudent: (studentId: string) => void
  readonly onOpenCourse: (courseId: string, originStudentId?: string) => void
}): React.JSX.Element {
  const [overview, setOverview] = useState<CoreOverview | null>(null)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [recordOpen, setRecordOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const summaries = useMemo(
    () => overview === null ? [] : buildStudentSummaries(overview),
    [overview],
  )
  const visibleSummaries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('zh-CN')
    return summaries.filter((summary) =>
      query === '' || summary.student.name.toLocaleLowerCase('zh-CN').includes(query),
    )
  }, [search, summaries])
  const selectedSummary = summaries.find(
    (summary) => summary.student.id === selectedStudentId,
  ) ?? null

  useEffect(() => { void reload() }, [])

  useEffect(() => {
    if (!visibleSummaries.some((summary) => summary.student.id === selectedStudentId)) {
      onSelectStudent(visibleSummaries[0]?.student.id ?? '')
    }
  }, [onSelectStudent, selectedStudentId, visibleSummaries])

  async function reload(): Promise<void> {
    setLoading(true)
    try {
      setOverview(await window.teacherWorkbench.core.getOverview())
      setError('')
    } catch (loadError) {
      setError(toErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }

  async function runAction(
    action: () => Promise<void>,
    successMessage: string,
  ): Promise<boolean> {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      await reload()
      setNotice(successMessage)
      return true
    } catch (actionError) {
      setError(toErrorMessage(actionError))
      return false
    } finally {
      setBusy(false)
    }
  }

  if (loading && overview === null) {
    return <section className="workspace-card">正在读取学生数据…</section>
  }

  return (
    <div className="students-page" aria-live="polite">
      {error !== '' && <div className="inline-error" role="alert">{error}</div>}
      {notice !== '' && <div className="inline-notice" role="status">{notice}</div>}
      <header className="students-page-header">
        <div><strong>全部学生 {summaries.length}</strong><span>只展示课程关系与人工学习记录</span></div>
        <button className="primary-button" type="button" disabled={busy} onClick={() => setCreateOpen(true)}>+ 新建学生</button>
      </header>
      <div className="students-workspace-layout">
        <aside className="student-list-column" aria-label="学生列表">
          <div className="student-list-search">
            <input aria-label="搜索学生" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索学生" />
          </div>
          <div className="student-summary-list">
            {visibleSummaries.map((summary) => (
              <button
                className={`student-summary-card${summary.student.id === selectedStudentId ? ' is-selected' : ''}`}
                type="button"
                key={summary.student.id}
                onClick={() => onSelectStudent(summary.student.id)}
              >
                <strong>{summary.student.name}</strong>
                <span>{activeCourseLine(summary)}</span>
                <small>{summary.latestManualNote?.bodyMd ?? '还没有人工学习记录'}</small>
              </button>
            ))}
            {visibleSummaries.length === 0 && <p className="student-list-empty">没有匹配的学生。</p>}
          </div>
        </aside>
        <StudentDetail
          overview={overview}
          summary={selectedSummary}
          busy={busy}
          onOpenCourse={onOpenCourse}
          onCreateRecord={() => setRecordOpen(true)}
        />
      </div>

      {createOpen && (
        <CreateStudentModal
          busy={busy}
          onClose={() => setCreateOpen(false)}
          onCreated={onSelectStudent}
          onAction={runAction}
        />
      )}
      {recordOpen && overview !== null && selectedSummary !== null && (
        <LearningRecordModal
          overview={overview}
          summary={selectedSummary}
          busy={busy}
          onClose={() => setRecordOpen(false)}
          onAction={runAction}
        />
      )}
    </div>
  )
}

function StudentDetail({ overview, summary, busy, onOpenCourse, onCreateRecord }: {
  readonly overview: CoreOverview | null
  readonly summary: StudentSummary | null
  readonly busy: boolean
  readonly onOpenCourse: (courseId: string, originStudentId?: string) => void
  readonly onCreateRecord: () => void
}): React.JSX.Element {
  if (summary === null || overview === null) {
    return <section className="student-detail-pane student-detail-empty"><div><h2>选择一位学生</h2><p>查看长期课程关系与人工学习记录。</p></div></section>
  }
  const nodeById = new Map(overview.nodes.map((node) => [node.id, node]))
  return (
    <section className="student-detail-pane" aria-label="学生详情">
      <header className="student-detail-header">
        <div><span>学生</span><h2>{summary.student.name}</h2></div>
        <button className="primary-button" type="button" disabled={busy} onClick={onCreateRecord}>+ 新增学习记录</button>
      </header>
      <section className="student-detail-section">
        <div className="section-toolbar"><div><h3>关联课程</h3><p>课程是否在读与历史关系按实际状态分开。</p></div></div>
        <h4>在读课程</h4>
        <div className="student-course-list">
          {summary.activeCourses.map((item) => <StudentCourseRow key={item.course.id} item={item} onOpenCourse={onOpenCourse} />)}
          {summary.activeCourses.length === 0 && <p className="empty-state">当前没有在读课程。</p>}
        </div>
        {summary.historicalCourses.length > 0 && (
          <>
            <h4>已退出 / 已结束</h4>
            <div className="student-course-list">
              {summary.historicalCourses.map((item) => <StudentCourseRow key={item.course.id} item={item} onOpenCourse={onOpenCourse} />)}
            </div>
          </>
        )}
      </section>
      <section className="student-detail-section">
        <div className="section-toolbar"><div><h3>最近学习记录</h3><p>只显示老师创建的 manual 记录，不混入讲义、例题或作业草稿。</p></div></div>
        <div className="learning-record-list">
          {summary.manualNotes.map((note) => (
            <article className="learning-record-card" key={note.id}>
              <p>{note.bodyMd}</p>
              <small>{formatRecordContext(note.lessonId, nodeById)} · {formatRecordDate(note)}</small>
            </article>
          ))}
          {summary.manualNotes.length === 0 && <p className="empty-state">还没有人工学习记录。</p>}
        </div>
      </section>
    </section>
  )
}

function StudentCourseRow({ item, onOpenCourse }: {
  readonly item: StudentCourseSummary
  readonly onOpenCourse: (courseId: string, originStudentId?: string) => void
}): React.JSX.Element {
  return (
    <div className="student-course-row">
      <div><strong>{item.course.title}</strong><span>{item.course.courseMode === 'one_to_one' ? '一对一' : '班课'}{item.historyReason === 'student_ended' ? ' · 已退出' : item.historyReason === 'course_ended' ? ' · 课程已结束' : ' · 在读'}</span></div>
      <button className="link-button" type="button" onClick={() => onOpenCourse(item.course.id, item.link.studentId)}>进入课程</button>
    </div>
  )
}

function CreateStudentModal({ busy, onClose, onCreated, onAction }: {
  readonly busy: boolean
  readonly onClose: () => void
  readonly onCreated: (studentId: string) => void
  readonly onAction: (action: () => Promise<void>, successMessage: string) => Promise<boolean>
}): React.JSX.Element {
  const [name, setName] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    let createdId = ''
    const success = await onAction(async () => {
      const student = await window.teacherWorkbench.core.createStudent({ name })
      createdId = student.id
    }, '学生已创建，可从课程学生区关联课程。')
    if (success) { onCreated(createdId); onClose() }
  }
  return (
    <Modal title="新建学生" description="V1.2 只创建学生姓名，不增加画像、成绩或联系方式。" onClose={onClose}>
      <form className="modal-form" onSubmit={(event) => void submit(event)}>
        <label className="modal-field">学生姓名 *<input autoFocus value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
        <footer className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={busy || name.trim() === ''}>创建学生</button></footer>
      </form>
    </Modal>
  )
}

function LearningRecordModal({ overview, summary, busy, onClose, onAction }: {
  readonly overview: CoreOverview
  readonly summary: StudentSummary
  readonly busy: boolean
  readonly onClose: () => void
  readonly onAction: (action: () => Promise<void>, successMessage: string) => Promise<boolean>
}): React.JSX.Element {
  const [bodyMd, setBodyMd] = useState('')
  const [lessonId, setLessonId] = useState('')
  const lessonOptions = listStudentLessonOptions(overview, summary)
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const success = await onAction(async () => {
      await window.teacherWorkbench.core.createNote({
        studentId: summary.student.id,
        bodyMd,
        ...(lessonId === '' ? {} : { lessonId }),
      })
    }, '人工学习记录已保存。')
    if (success) onClose()
  }
  return (
    <Modal title="新增学习记录" description={summary.student.name} onClose={onClose}>
      <form className="modal-form" onSubmit={(event) => void submit(event)}>
        <label className="modal-field">记录内容 *<textarea autoFocus rows={6} value={bodyMd} disabled={busy} onChange={(event) => setBodyMd(event.target.value)} placeholder="记录课堂表现、掌握情况或后续重点" /></label>
        <label className="modal-field">关联课次（可选）<select value={lessonId} disabled={busy} onChange={(event) => setLessonId(event.target.value)}><option value="">不关联课次</option>{lessonOptions.map((option) => <option key={option.lesson.id} value={option.lesson.id}>{option.label}</option>)}</select></label>
        <p className="modal-hint">只列出该学生当前或历史关联课程中的有效课次；Main 会再次校验。</p>
        <footer className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={busy || bodyMd.trim() === ''}>保存记录</button></footer>
      </form>
    </Modal>
  )
}

function activeCourseLine(summary: StudentSummary): string {
  if (summary.activeCourses.length === 0) return '当前无在读课程'
  return summary.activeCourses.map((item) => item.course.title).join('、')
}

function formatRecordContext(lessonId: string | null, nodes: ReadonlyMap<string, CoreOverview['nodes'][number]>): string {
  if (lessonId === null) return '未关联课次'
  const lesson = nodes.get(lessonId)
  const period = lesson?.parentId === null || lesson === undefined ? undefined : nodes.get(lesson.parentId)
  const course = period?.parentId === null || period === undefined ? undefined : nodes.get(period.parentId)
  return course === undefined || lesson === undefined ? '关联课次不可用' : `${course.title} · ${lesson.title}`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

function formatRecordDate(note: NoteRecord): string {
  if (note.occurredOn !== undefined) return note.occurredOn
  return formatDate(note.updatedAt)
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : '操作失败，请稍后重试。'
}
