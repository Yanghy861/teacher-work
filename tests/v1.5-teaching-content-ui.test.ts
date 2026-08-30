import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('V15 teaching content workspace contract', () => {
  it('uses the renamed navigation and one shared workspace target', () => {
    const app = source('../src/renderer/App.tsx')
    const target = source('../src/renderer/teaching-content-context.ts')
    const page = source('../src/renderer/teaching-content-page.tsx')
    expect(app).toContain("{ label: '课程', icon: 'courses' }")
    expect(app).toContain("{ label: '教学内容', icon: 'prep' }")
    expect(app).not.toContain("{ label: '我的课程', icon: 'courses' }")
    expect(app).not.toContain("{ label: '备课', icon: 'prep' }")
    expect(target).toContain('courseId: string | null')
    expect(target).toContain('section: TeachingContentSection')
    expect(page).toContain("['courseware', '课件']")
    expect(page).toContain("target?.section === 'prep' ? 'AI 修改' : '教学内容'")
    expect(page).toContain("['courseware', '课件'], ['drafts', '修改记录']")
    expect(page).not.toContain("'prep', 'AI 备课'")
    expect(page).not.toContain('草稿箱')
  })

  it('keeps courseware navigation temporary and preserves the lesson semantics', () => {
    const detail = source('../src/renderer/course-detail.tsx')
    const page = source('../src/renderer/teaching-content-page.tsx')
    const files = source('../src/renderer/lesson-files-section.tsx')
    expect(detail).toContain('onDoubleClick={() => onOpenTeachingContent')
    expect(detail).toContain('查看教学内容')
    expect(page).toContain('切换课程 / 课次')
    expect(page).toContain('上一课')
    expect(page).toContain('下一课')
    expect(page).toContain('setDrawerOpen(false)')
    expect(files).toContain('沉浸阅读')
    expect(files).toContain('hideTree={immersive}')
    expect(files).not.toContain('setCurrentLesson')
    expect(files).not.toContain('CourseDetail')
    expect(source('../src/renderer/styles.css')).toContain('.lesson-files-section.is-immersive .material-reader.is-single { grid-template-columns: minmax(0, 1fr); }')
    expect(source('../src/renderer/styles.css')).toContain('.lesson-files-section .material-reader { grid-template-columns: minmax(220px, 250px) minmax(0, 1fr); }')
  })

  it('keeps student origin and historical course read-only paths visible', () => {
    const app = source('../src/renderer/App.tsx')
    const students = source('../src/renderer/students-page.tsx')
    const page = source('../src/renderer/teaching-content-page.tsx')
    expect(app).toContain('courseOriginStudentId')
    expect(students).toContain('onOpenCourse(item.course.id, item.link.studentId)')
    expect(page).toContain('返回学生')
    expect(page).toContain('历史课程只读')
  })

  it('keeps the prep controls inside the narrow AI card', () => {
    const styles = source('../src/renderer/styles.css')
    const contentArea = styles.match(/\.content-area\s*\{([^}]*)\}/u)?.[1] ?? ''
    const prepGrid = styles.match(/\.prep-input-grid\s*\{([^}]*)\}/u)?.[1] ?? ''
    expect(contentArea).toContain('overflow-x: hidden')
    expect(prepGrid).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(prepGrid).toContain('min-width: 0')
  })

  it('offers a courseware return after saving a lesson result', () => {
    const page = source('../src/renderer/teaching-content-page.tsx')
    const draft = source('../src/renderer/draft-panel.tsx')
    expect(page).toContain("onOpenCourseware={() => { void setSection('courseware') }}")
    expect(draft).toContain('onOpenCourseware?: () => void')
    expect(draft).toContain('查看课件')
  })

  it('keeps narrow teaching content readable without page-level horizontal overflow', () => {
    const styles = source('../src/renderer/styles.css')
    expect(styles).toContain('@media (max-width: 760px)')
    expect(styles).toContain('.lesson-files-section .material-reader {\n    grid-template-columns: minmax(0, 1fr);')
    expect(styles).toContain('.lesson-files-section .material-reader-tree {\n    max-height: 210px;')
  })
})

  it('restores the latest work copy and guards unsaved prep edits (V152-B)', () => {
    const page = source('../src/renderer/teaching-content-page.tsx')
    const draft = source('../src/renderer/draft-panel.tsx')
    expect(draft).toContain('onDirtyChange?: (dirty: boolean) => void')
    expect(draft).toContain("find((note) => note.draftStatus === 'draft')")
    expect(draft).toContain('已恢复最近的工作副本：修改尚未发布，不会改变正式课件与已确认成果。')
    expect(page).toContain('prepDirtyRef.current = value')
    expect(page).toContain("title: '离开 AI 修改？'")
    expect(page).toContain('AI 修改中有未保存的编辑，离开后将丢失本次编辑。')
    expect(page).toContain('onDirtyChange={handlePrepDirtyChange}')
  })
