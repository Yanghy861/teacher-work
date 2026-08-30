import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('V12-04 lesson files and prep renderer contract', () => {
  it('renders only Viewed Lesson links and has an explicit no-selection state', () => {
    const detail = source('../src/renderer/course-detail.tsx')
    const files = source('../src/renderer/lesson-files-section.tsx')
    expect(detail).toContain('<LessonFilesSection')
    expect(detail).toContain('lesson={viewedLesson}')
    expect(files).toContain('listLessonPrepFiles(overview, lesson.id)')
    expect(files).toContain('请先选择一个课次查看资料。')
    expect(files).toContain('不包含整门课程资料或学生文件')
    expect(files).not.toContain('targetType === \'student\'')
  })

  it('continues the latest Viewed Lesson draft without changing course progress', () => {
    const dashboard = source('../src/renderer/course-dashboard.tsx')
    const detail = source('../src/renderer/course-detail.tsx')
    const files = source('../src/renderer/lesson-files-section.tsx')
    expect(dashboard).toContain('onOpenDraft={onOpenDraft}')
    expect(detail).toContain('latestLessonDraft(overview, viewedLesson.id)')
    expect(detail).toContain("viewedDraft === null ? '开始备课' : '继续备课'")
    expect(files).toContain("hasCourseware ? '✦ AI 修改' : 'AI 新建备课'")
    expect(files).not.toContain('setCurrentLesson')
    expect(files).not.toContain('startPeriod')
    expect(files).not.toContain('confirmLessonTaught')
  })

  it('names the immutable Prep Lesson consistently and removes student file targets from the UI', () => {
    const draft = source('../src/renderer/draft-panel.tsx')
    const managed = source('../src/renderer/managed-files-panel.tsx')
    const service = source('../src/main/files/managed-file-service.ts')
    expect(draft).toContain('本次备课课次')
    expect(draft).toContain('保存到本次课次')
    expect(draft).toContain('lessonId: context.lessonId')
    expect(managed).not.toContain('copyToStudent')
    expect(managed).not.toContain('学生附件')
    expect(service).toContain('copyToStudent(fileId: string, studentId: string)')
    expect(service).toContain("targetType: 'student'")
  })
})
