import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('V12-03 students renderer contract', () => {
  it('replaces the student file surface with one student list/detail page', () => {
    const app = source('../src/renderer/App.tsx')
    const page = source('../src/renderer/students-page.tsx')
    expect(app).toContain('<StudentsPage')
    expect(app).not.toContain('<ManagedFilesPanel heading="学生资料"')
    expect(page).toContain('搜索学生')
    expect(page).toContain('+ 新建学生')
    expect(page).toContain('关联课程')
    expect(page).toContain('最近学习记录')
    expect(page).not.toContain('student_files')
    expect(page).not.toContain('copyToStudent')
    expect(page).not.toContain('ManagedFilesPanel')
  })

  it('lifts only course/student target IDs for bidirectional navigation', () => {
    const app = source('../src/renderer/App.tsx')
    const course = source('../src/renderer/course-detail.tsx')
    expect(app).toContain('selectedCourseId')
    expect(app).toContain('selectedStudentId')
    expect(app).toContain('function openCourse(courseId: string)')
    expect(app).toContain('function openStudent(studentId: string)')
    expect(course).toContain('onOpenStudent(student.id)')
  })

  it('creates only manual records and offers optional related lessons', () => {
    const page = source('../src/renderer/students-page.tsx')
    const model = source('../src/renderer/students-view-model.ts')
    const core = source('../src/main/data/core-data-service.ts')
    expect(page).toContain('window.teacherWorkbench.core.createNote')
    expect(page).toContain('关联课次（可选）')
    expect(model).toContain("note.noteKind === 'manual'")
    expect(model).toContain('listStudentLessonOptions')
    expect(core).toContain('this.requireStudentLinkedToLessonCourse(lessonId, studentId)')
  })
})
