import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('V12-02 course renderer contract', () => {
  it('uses the course list/detail architecture and keeps the global draft entry', () => {
    const dashboard = source('../src/renderer/course-dashboard.tsx')
    const app = source('../src/renderer/App.tsx')
    const styles = source('../src/renderer/styles.css')
    expect(dashboard).toContain('<CourseList')
    expect(dashboard).toContain('<CourseDetail')
    expect(dashboard).toContain('今日待点名')
    expect(dashboard).toContain('修改记录 {draftCount}')
    expect(app).toContain('onOpenDraft={openDraft}')
    expect(app).toContain('onOpenDraftInbox={() => openTeachingContent(createDraftInboxTarget())}')
    expect(styles).toMatch(/\.course-workspace-layout\s*\{[^}]*grid-template-columns:\s*minmax\(280px, 320px\) minmax\(0, 1fr\)/s)
  })

  it('separates Viewed Lesson, Current Lesson, attendance and taught confirmation', () => {
    const detail = source('../src/renderer/course-detail.tsx')
    const attendance = source('../src/renderer/lesson-attendance-modal.tsx')
    const confirmation = source('../src/renderer/confirm-lesson-taught-modal.tsx')
    expect(detail).toContain('Viewed Lesson')
    expect(detail).toContain('调整当前课次')
    expect(detail).toContain('className="course-more-menu"')
    expect(detail).toContain('className="lesson-more-menu"')
    expect(detail).toContain("['lessons', '课次']")
    expect(detail).toContain("['students', '学生']")
    expect(detail).toContain("['materials', '资料']")
    expect(detail).toContain('expandedPeriodIds')
    expect(detail).toContain('className="period-toggle"')
    expect(detail).toContain('aria-expanded={expanded}')
    expect(detail).toContain('setExpandedPeriodIds(new Set())')
    expect(detail).not.toContain('createNote')
    expect(detail).not.toContain('copyToStudent')
    expect(attendance).toContain('window.teacherWorkbench.attendance.getLesson')
    expect(attendance).toContain('window.teacherWorkbench.attendance.saveLesson')
    expect(confirmation).toContain('expectedCurrentLessonId')
    expect(confirmation).toContain('suggestConfirmedDecision')
  })

  it('keeps first-lesson initialization explicit and later lesson creation non-advancing', () => {
    const detail = source('../src/renderer/course-detail.tsx')
    expect(detail).toContain('summary.progress === null && summary.lessons.length === 0')
    expect(detail).toContain('window.teacherWorkbench.core.startPeriod')
    expect(detail).toContain('课次已创建；Current Lesson 未自动改变。')
  })

  it('keeps the entered course selection while the dashboard overview is loading', () => {
    const dashboard = source('../src/renderer/course-dashboard.tsx')
    const selectionEffect = dashboard.slice(
      dashboard.indexOf('const target = summaries.find((summary) => summary.course.id === selectedCourseId)'),
      dashboard.indexOf('async function reload'),
    )
    expect(selectionEffect).toContain('if (loading) return')
    expect(selectionEffect).toContain('visibleSummaries, loading]')
  })
})
