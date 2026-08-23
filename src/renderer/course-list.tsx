import type { CourseSummary } from './course-view-model'

const actionLabels = {
  continue_prep: '继续备课',
  start_prep: '开始备课',
  create_first: '创建第一课',
  select_next: '选择下一课',
  decide_next: '决定下一步',
  reopen: '重新开启',
} as const

export default function CourseList({
  courses,
  selectedCourseId,
  busy,
  onSelect,
  onPrimaryAction,
}: {
  readonly courses: readonly CourseSummary[]
  readonly selectedCourseId: string
  readonly busy: boolean
  readonly onSelect: (courseId: string) => void
  readonly onPrimaryAction: (course: CourseSummary) => void
}): React.JSX.Element {
  return (
    <aside className="course-list-pane" aria-label="课程列表">
      {courses.map((summary) => (
        <article
          className={`course-summary-card${summary.course.id === selectedCourseId ? ' is-selected' : ''}`}
          key={summary.course.id}
        >
          <button className="course-card-main" type="button" onClick={() => onSelect(summary.course.id)}>
            <span className="course-card-title">
              <strong>{summary.course.title}</strong>
              <small>{summary.course.courseMode === 'one_to_one' ? '一对一' : '班课'}</small>
            </span>
            <span>{studentSummary(summary)}</span>
            <span>{progressSummary(summary)}</span>
          </button>
          <button
            className="course-card-action"
            type="button"
            disabled={busy}
            onClick={() => onPrimaryAction(summary)}
          >
            {actionLabels[summary.primaryAction]}
          </button>
        </article>
      ))}
      {courses.length === 0 && (
        <div className="course-list-empty">当前筛选下没有课程。</div>
      )}
    </aside>
  )
}

function studentSummary(summary: CourseSummary): string {
  if (summary.activeStudents.length === 0) return '未关联在读学生'
  if (summary.course.courseMode === 'one_to_one') return `学生：${summary.activeStudents[0]?.name ?? ''}`
  return `${summary.activeStudents.length} 位在读学生`
}

function progressSummary(summary: CourseSummary): string {
  if (summary.ended) return '课程已结束'
  if (summary.currentLesson !== null) {
    return `${summary.currentPeriod?.title ?? '未命名阶段'} · ${summary.currentLesson.title}`
  }
  if (summary.lessons.length === 0) return '还没有课次'
  return summary.progress?.activePeriodId === null || summary.progress === null
    ? '尚未选择当前课次'
    : '阶段边界 · 等待决定下一步'
}
