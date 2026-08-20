import { useEffect, useMemo, useState, type FormEvent } from 'react'

import type {
  CoreOverview,
  CourseMode,
  NodeRecord,
} from '../shared/core-contracts'

export default function CourseDashboard(): React.JSX.Element {
  const [overview, setOverview] = useState<CoreOverview | null>(null)
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [courseTitle, setCourseTitle] = useState('')
  const [courseMode, setCourseMode] = useState<CourseMode>('one_to_one')
  const [periodTitle, setPeriodTitle] = useState('')
  const [lessonTitle, setLessonTitle] = useState('')
  const [studentName, setStudentName] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const courses = useMemo(
    () => overview?.nodes.filter((node) => node.kind === 'course') ?? [],
    [overview],
  )
  const selectedCourse = courses.find((course) => course.id === selectedCourseId)
  const periods = useMemo(
    () =>
      overview?.nodes.filter(
        (node) => node.kind === 'period' && node.parentId === selectedCourseId,
      ) ?? [],
    [overview, selectedCourseId],
  )
  const lessons = useMemo(
    () =>
      overview?.nodes.filter(
        (node) => node.kind === 'lesson' && node.parentId === selectedPeriodId,
      ) ?? [],
    [overview, selectedPeriodId],
  )
  const students = useMemo(
    () =>
      overview?.students.filter((student) =>
        overview.courseStudentLinks.some(
          (link) => link.courseId === selectedCourseId && link.studentId === student.id,
        ),
      ) ?? [],
    [overview, selectedCourseId],
  )
  const selectedStudent = students.find((student) => student.id === selectedStudentId)
  const selectedStudentNotes = overview?.notes.filter(
    (note) => note.studentId === selectedStudentId,
  ) ?? []

  useEffect(() => {
    void reload()
  }, [])

  useEffect(() => {
    if (selectedCourseId === '' || !courses.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId(courses[0]?.id ?? '')
    }
  }, [courses, selectedCourseId])

  useEffect(() => {
    if (selectedPeriodId === '' || !periods.some((period) => period.id === selectedPeriodId)) {
      setSelectedPeriodId(periods[0]?.id ?? '')
    }
  }, [periods, selectedPeriodId])

  useEffect(() => {
    if (selectedStudentId === '' || !students.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId(students[0]?.id ?? '')
    }
  }, [selectedStudentId, students])

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

  async function runAction(action: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError('')
    try {
      await action()
      await reload()
    } catch (actionError) {
      setError(toErrorMessage(actionError))
    } finally {
      setBusy(false)
    }
  }

  function submitCourse(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (courseTitle.trim() === '') {
      return
    }
    void runAction(async () => {
      const created = await window.teacherWorkbench.core.createCourse({
        title: courseTitle,
        mode: courseMode,
      })
      setSelectedCourseId(created.id)
      setCourseTitle('')
    })
  }

  function submitPeriod(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (selectedCourseId === '' || periodTitle.trim() === '') {
      return
    }
    void runAction(async () => {
      const created = await window.teacherWorkbench.core.createPeriod({
        courseId: selectedCourseId,
        title: periodTitle,
      })
      setSelectedPeriodId(created.id)
      setPeriodTitle('')
    })
  }

  function submitLesson(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (selectedPeriodId === '' || lessonTitle.trim() === '') {
      return
    }
    void runAction(async () => {
      setLessonTitle('')
      await window.teacherWorkbench.core.createLesson({
        periodId: selectedPeriodId,
        title: lessonTitle,
      })
    })
  }

  function submitStudent(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (selectedCourseId === '' || studentName.trim() === '') {
      return
    }
    void runAction(async () => {
      const created = await window.teacherWorkbench.core.createStudent({
        courseId: selectedCourseId,
        name: studentName,
      })
      setSelectedStudentId(created.id)
      setStudentName('')
    })
  }

  function submitNote(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (selectedStudentId === '' || noteBody.trim() === '') {
      return
    }
    void runAction(async () => {
      setNoteBody('')
      await window.teacherWorkbench.core.createNote({
        studentId: selectedStudentId,
        bodyMd: noteBody,
      })
    })
  }

  if (loading && overview === null) {
    return <section className="workspace-card">正在读取课程数据…</section>
  }

  return (
    <div className="course-dashboard" aria-live="polite">
      {error !== '' && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}

      <section className="workspace-card introduction-card">
        <div>
          <p className="section-kicker">核心数据</p>
          <h2>课程树</h2>
          <p>先建立课程，再按阶段和课次整理学生记录。资料文件将在后续里程碑接入。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void reload()} disabled={busy}>
          刷新
        </button>
      </section>

      <section className="workspace-card">
        <div className="card-heading">
          <div>
            <p className="section-kicker">第一步</p>
            <h2>建立课程</h2>
          </div>
          <span className="count-label">{courses.length} 门课程</span>
        </div>
        <form className="inline-form" onSubmit={submitCourse}>
          <label>
            课程名称
            <input
              aria-label="课程名称"
              value={courseTitle}
              onChange={(event) => setCourseTitle(event.target.value)}
              placeholder="例如：张三一对一"
              disabled={busy}
            />
          </label>
          <label>
            类型
            <select
              aria-label="课程类型"
              value={courseMode}
              onChange={(event) => setCourseMode(event.target.value as CourseMode)}
              disabled={busy}
            >
              <option value="one_to_one">一对一</option>
              <option value="class">班课</option>
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={busy || courseTitle.trim() === ''}>
            创建课程
          </button>
        </form>
        <div className="tree-list" aria-label="课程树">
          {courses.length === 0 && <p className="empty-state">还没有课程，从上面的表单开始。</p>}
          {courses.map((course) => (
            <CourseTreeItem
              key={course.id}
              course={course}
              nodes={overview?.nodes ?? []}
              selected={course.id === selectedCourseId}
              onSelect={() => setSelectedCourseId(course.id)}
            />
          ))}
        </div>
      </section>

      <div className="two-column-grid">
        <section className="workspace-card">
          <div className="card-heading">
            <div>
              <p className="section-kicker">课程结构</p>
              <h2>阶段与课次</h2>
            </div>
            <span className="selection-label">{selectedCourse?.title ?? '请先选择课程'}</span>
          </div>
          <form className="stacked-form" onSubmit={submitPeriod}>
            <label>
              阶段名称
              <input
                aria-label="阶段名称"
                value={periodTitle}
                onChange={(event) => setPeriodTitle(event.target.value)}
                placeholder="例如：2026 春·六下"
                disabled={busy || selectedCourseId === ''}
              />
            </label>
            <button className="primary-button" type="submit" disabled={busy || selectedCourseId === '' || periodTitle.trim() === ''}>
              创建阶段
            </button>
          </form>
          <label className="select-field">
            当前阶段
            <select
              aria-label="当前阶段"
              value={selectedPeriodId}
              onChange={(event) => setSelectedPeriodId(event.target.value)}
              disabled={busy || periods.length === 0}
            >
              {periods.length === 0 && <option value="">暂无阶段</option>}
              {periods.map((period) => (
                <option key={period.id} value={period.id}>{period.title}</option>
              ))}
            </select>
          </label>
          <form className="stacked-form" onSubmit={submitLesson}>
            <label>
              课次名称
              <input
                aria-label="课次名称"
                value={lessonTitle}
                onChange={(event) => setLessonTitle(event.target.value)}
                placeholder="例如：有理数混合运算"
                disabled={busy || selectedPeriodId === ''}
              />
            </label>
            <button className="secondary-button" type="submit" disabled={busy || selectedPeriodId === '' || lessonTitle.trim() === ''}>
              创建课次
            </button>
          </form>
          <ul className="compact-list">
            {lessons.map((lesson) => <li key={lesson.id}>{lesson.title}</li>)}
            {lessons.length === 0 && <li className="empty-state">当前阶段还没有课次。</li>}
          </ul>
        </section>

        <section className="workspace-card">
          <div className="card-heading">
            <div>
              <p className="section-kicker">学生记录</p>
              <h2>学生与普通记录</h2>
            </div>
            <span className="count-label">{students.length} 位学生</span>
          </div>
          <form className="stacked-form" onSubmit={submitStudent}>
            <label>
              学生姓名
              <input
                aria-label="学生姓名"
                value={studentName}
                onChange={(event) => setStudentName(event.target.value)}
                placeholder="例如：张三"
                disabled={busy || selectedCourseId === ''}
              />
            </label>
            <button className="primary-button" type="submit" disabled={busy || selectedCourseId === '' || studentName.trim() === ''}>
              添加学生到当前课程
            </button>
          </form>
          <label className="select-field">
            当前学生
            <select
              aria-label="当前学生"
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
              disabled={busy || students.length === 0}
            >
              {students.length === 0 && <option value="">暂无学生</option>}
              {students.map((student) => (
                <option key={student.id} value={student.id}>{student.name}</option>
              ))}
            </select>
          </label>
          <form className="stacked-form" onSubmit={submitNote}>
            <label>
              新记录
              <textarea
                aria-label="学生记录"
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                placeholder="记录本次课的表现或后续重点"
                rows={3}
                disabled={busy || selectedStudentId === ''}
              />
            </label>
            <button className="secondary-button" type="submit" disabled={busy || selectedStudentId === '' || noteBody.trim() === ''}>
              保存记录
            </button>
          </form>
          <ul className="compact-list">
            {selectedStudentNotes.map((note) => (
              <li key={note.id}>
                <span>{note.bodyMd}</span>
                <small>{selectedStudent?.name ?? '学生'} · {note.createdAt.slice(0, 10)}</small>
              </li>
            ))}
            {selectedStudentNotes.length === 0 && <li className="empty-state">当前学生还没有记录。</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}

function CourseTreeItem({
  course,
  nodes,
  selected,
  onSelect,
}: {
  readonly course: NodeRecord
  readonly nodes: readonly NodeRecord[]
  readonly selected: boolean
  readonly onSelect: () => void
}): React.JSX.Element {
  const periods = nodes.filter((node) => node.kind === 'period' && node.parentId === course.id)
  return (
    <div className={`tree-course${selected ? ' is-selected' : ''}`}>
      <button className="tree-course-button" type="button" onClick={onSelect}>
        <span>
          <strong>{course.title}</strong>
          <small>{course.courseMode === 'one_to_one' ? '一对一' : '班课'}</small>
        </span>
        <span className="tree-chevron" aria-hidden="true">›</span>
      </button>
      {selected && (
        <ul className="tree-children">
          {periods.map((period) => {
            const lessons = nodes.filter((node) => node.kind === 'lesson' && node.parentId === period.id)
            return (
              <li key={period.id}>
                <span className="tree-period">{period.title}</span>
                {lessons.length > 0 && (
                  <ul>
                    {lessons.map((lesson) => <li key={lesson.id}>{lesson.title}</li>)}
                  </ul>
                )}
              </li>
            )
          })}
          {periods.length === 0 && <li className="empty-state">还没有阶段。</li>}
        </ul>
      )}
    </div>
  )
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : '操作失败，请稍后重试。'
}
