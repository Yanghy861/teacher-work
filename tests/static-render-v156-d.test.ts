import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type {
  CoreOverview,
  CourseProgressRecord,
  LessonSessionSummary,
  NodeRecord,
  StudentRecord,
} from '../src/shared/core-contracts'
import type { ManagedFileRecord } from '../src/shared/file-contracts'
import type { MaterialFolder } from '../src/shared/material-library-contracts'
import App from '../src/renderer/App'
import DraftPanel from '../src/renderer/draft-panel'
import ManagedFilesPanel, {
  FileList,
  FolderBranch,
  LibraryButton,
  MaterialContextMenu,
} from '../src/renderer/managed-files-panel'
import { LessonsSection } from '../src/renderer/course-detail'
import { buildCourseSummaries } from '../src/renderer/course-view-model'
import { createLessonPrepContext } from '../src/renderer/lesson-prep-context'

const stamp = '2026-09-01T00:00:00.000Z'

function node(id: string, parentId: string | null, kind: NodeRecord['kind'], title: string, sortOrder: number, extra: Partial<NodeRecord> = {}): NodeRecord {
  return {
    id,
    parentId,
    kind,
    title,
    courseMode: null,
    sortOrder,
    contentMd: '',
    createdAt: stamp,
    updatedAt: stamp,
    deletedAt: null,
    ...extra,
  }
}

function materialFile(id: string, originalName: string, mimeType: string, originFileId: string | null = null): ManagedFileRecord {
  return {
    id,
    originalName,
    sizeBytes: 2048,
    mimeType,
    originFileId,
    mtimeMs: null,
    contentHash: null,
    createdAt: stamp,
    updatedAt: stamp,
    deletedAt: null,
  }
}

const folders: MaterialFolder[] = [
  { id: 'folder-root', parentId: null, name: '七年级', sortOrder: 0, createdAt: stamp, updatedAt: stamp },
  { id: 'folder-geo', parentId: 'folder-root', name: '几何', sortOrder: 0, createdAt: stamp, updatedAt: stamp },
]

function noops(): Record<string, () => undefined> {
  return { noop: () => undefined }
}

describe('V156-D static render upgrades (additive)', () => {
  describe('managed-files-panel and material tree DOM', () => {
    it('renders the panel loading gate first, keeping the workspace unblocked', () => {
      const markup = renderToStaticMarkup(createElement(ManagedFilesPanel))
      expect(markup).toContain('正在读取素材库…')
      expect(markup).toContain('class="workspace-card"')
    })

    it('keeps folder rows draggable with drop affordance classes and toggle aria', () => {
      const baseProps = {
        folders,
        fileFolder: new Map<string, string | null>([['file-a', 'folder-geo']]),
        view: 'all' as const,
        expandedFolderIds: new Set<string>(),
        draggedMaterial: null,
        dropTarget: null,
        busy: false,
        onSelect: vi.fn(),
        onToggle: vi.fn(),
        onContextMenu: vi.fn(),
        onButtonMenu: vi.fn(),
        onDragStart: vi.fn(),
        onDragEnd: vi.fn(),
        onDragOver: vi.fn(),
        onDrop: vi.fn(),
      }
      const collapsed = renderToStaticMarkup(createElement(FolderBranch, { ...baseProps, folder: folders[0]! }))
      expect(collapsed).toContain('material-library-tree-row is-folder-row')
      expect(collapsed).toContain('draggable="true"')
      expect(collapsed).toContain('aria-label="展开 七年级"')
      expect(collapsed).toContain('aria-expanded="false"')
      expect(collapsed).not.toContain('material-folder-children')

      const expanded = renderToStaticMarkup(createElement(FolderBranch, {
        ...baseProps,
        folder: folders[0]!,
        expandedFolderIds: new Set(['folder-root']),
        draggedMaterial: { kind: 'folder', id: 'folder-root' },
        dropTarget: { kind: 'folder', folderId: 'folder-geo', position: 'inside' },
      }))
      expect(expanded).toContain('material-folder-children')
      expect(expanded).toContain('is-dragging')
      expect(expanded).toContain('is-drop-inside')
      expect(expanded).toContain('aria-label="收起 七年级"')
      expect(expanded).toContain('aria-expanded="true"')
    })

    it('keeps library view buttons accessible and drop-highlighted', () => {
      const markup = renderToStaticMarkup(createElement(LibraryButton, {
        label: '待整理', count: 2, active: false, dropActive: true, onClick: vi.fn(), onDragOver: vi.fn(), onDrop: vi.fn(),
      }))
      expect(markup).not.toContain('aria-current')
      expect(markup).toContain('is-drop-inside')
      const activeMarkup = renderToStaticMarkup(createElement(LibraryButton, { label: '全部素材', count: 5, active: true, onClick: vi.fn() }))
      expect(activeMarkup).toContain('aria-current="page"')
    })

    it('renders file rows with drag affordances and per-row actions', () => {
      const files = [materialFile('file-a', '讲义.md', 'text/markdown'), materialFile('file-b', '保存的副本.md', 'text/markdown', 'origin-1')]
      const markup = renderToStaticMarkup(createElement(FileList, {
        files,
        busy: false,
        lessonId: 'lesson-1',
        onAction: vi.fn(),
        onContextMenu: vi.fn(),
        onDragStart: vi.fn(),
        onDragEnd: vi.fn(),
        draggedMaterial: { kind: 'file', id: 'file-a' },
      }))
      expect(markup).toContain('file-row is-draggable')
      expect(markup).toContain('is-dragging')
      expect(markup).toContain('素材原件')
      expect(markup).toContain('保存自副本')
      expect(markup).toContain('复制到课次')
      expect(markup).not.toContain('disabled=""')

      const noLesson = renderToStaticMarkup(createElement(FileList, {
        files, busy: false, lessonId: '', onAction: vi.fn(), onContextMenu: vi.fn(), onDragStart: vi.fn(), onDragEnd: vi.fn(), draggedMaterial: null,
      }))
      expect(noLesson).toContain('disabled=""')

      const empty = renderToStaticMarkup(createElement(FileList, {
        files: [], busy: false, lessonId: 'lesson-1', onAction: vi.fn(), onContextMenu: vi.fn(), onDragStart: vi.fn(), onDragEnd: vi.fn(), draggedMaterial: null,
      }))
      expect(empty).toContain('这里还没有符合条件的素材。')
    })

    it('renders the context menu skeleton with role/aria wiring and guarded actions', () => {
      const file = materialFile('file-a', '讲义.md', 'text/markdown')
      const folderOptions = folders.map((folder) => ({ folder, path: folder.name }))
      const menuProps = {
        folder: null,
        file,
        folderOptions,
        fileFolder: new Map<string, string | null>([['file-a', 'folder-geo']]),
        activeLessonId: 'lesson-1',
        onCreateFolder: vi.fn(),
        onRename: vi.fn(),
        onMoveToRoot: vi.fn(),
        onDeleteFolder: vi.fn(),
        onOpenFile: vi.fn(),
        onShowInFolder: vi.fn(),
        onCopyToLesson: vi.fn(),
        onMoveFile: vi.fn(),
        onRemoveFile: vi.fn(),
      }
      const fileMenu = renderToStaticMarkup(createElement(MaterialContextMenu, { ...menuProps, menu: { kind: 'file', fileId: 'file-a', x: 8, y: 8 } }))
      expect(fileMenu).toContain('role="menu"')
      expect(fileMenu).toContain('role="menuitem"')
      expect(fileMenu).toContain('在资源管理器中显示')
      expect(fileMenu).toContain('复制到当前课次')
      expect(fileMenu).toContain('移动到')
      expect(fileMenu).toContain('待整理')
      expect(fileMenu).toContain('移除素材')
      expect(fileMenu).toContain('is-danger')
      // 已在文件夹中的目标不可重复移动
      expect(fileMenu).toContain('disabled=""')

      const rootMenu = renderToStaticMarkup(createElement(MaterialContextMenu, { ...menuProps, menu: { kind: 'root', x: 8, y: 8 }, file: null }))
      expect(rootMenu).toContain('新建顶层文件夹')
      expect(rootMenu).not.toContain('移除素材')

      const folderMenu = renderToStaticMarkup(createElement(MaterialContextMenu, { ...menuProps, menu: { kind: 'folder', folderId: 'folder-geo', x: 8, y: 8 }, folder: folders[1], file: null }))
      expect(folderMenu).toContain('新建子文件夹')
      expect(folderMenu).toContain('重命名')
      expect(folderMenu).toContain('移到顶层')
      expect(folderMenu).toContain('删除文件夹')
    })
  })

  describe('course-detail lessons section initial render', () => {
    const course = node('course-1', null, 'course', '初一数学班', 0, { courseMode: 'class' })
    const period = node('period-1', 'course-1', 'period', '第一阶段', 0)
    const lesson = node('lesson-1', 'period-1', 'lesson', '有理数', 0)
    const lesson2 = node('lesson-2', 'period-1', 'lesson', '无理数', 1)
    const student: StudentRecord = { id: 'student-1', name: '张三', createdAt: stamp, updatedAt: stamp, deletedAt: null }
    const progress: CourseProgressRecord = { courseId: 'course-1', activePeriodId: 'period-1', currentLessonId: 'lesson-1', endedAt: null, updatedAt: stamp }
    const session: LessonSessionSummary = {
      lessonId: 'lesson-1', scheduledAt: '2026-09-05T06:00:00.000Z', scheduledOn: '2026-09-05', durationMinutes: 90,
      taughtConfirmedAt: null, attendanceRecordedAt: stamp, presentCount: 1, leaveCount: 0, absentCount: 0, totalCount: 1,
    }
    const overview: CoreOverview = {
      nodes: [course, period, lesson, lesson2],
      students: [student],
      courseStudentLinks: [{ courseId: 'course-1', studentId: 'student-1', createdAt: stamp, endedAt: null }],
      notes: [],
      courseProgress: [progress],
      lessonSessions: [session],
    }
    const summary = buildCourseSummaries(overview).find((item) => item.course.id === 'course-1')!

    function lessonsSectionProps(expandedPeriodIds: ReadonlySet<string>): Record<string, unknown> {
      return {
        overview,
        summary,
        viewedLesson: null,
        busy: false,
        onViewLesson: vi.fn(),
        onCreatePeriod: vi.fn(),
        onCreateLesson: vi.fn(),
        onSchedule: vi.fn(),
        onOpenAttendance: vi.fn(),
        onConfirmTaught: vi.fn(),
        onOpenTeachingContent: vi.fn(),
        onStartPrep: vi.fn(),
        onOpenDraft: vi.fn(),
        viewedDraft: null,
        expandedPeriodIds,
        onTogglePeriod: vi.fn(),
        onAction: vi.fn(),
      }
    }

    it('collapses course periods by default (V154 contract) with toggle aria', () => {
      const markup = renderToStaticMarkup(createElement(LessonsSection, lessonsSectionProps(new Set<string>()) as never))
      expect(markup).toContain('period-toggle')
      expect(markup).toContain('aria-expanded="false"')
      expect(markup).toContain('aria-controls="period-lessons-period-1"')
      expect(markup).not.toContain('lesson-row')
      expect(markup).toContain('单击选择课次；双击查看这节课的教学内容。Current Lesson 不会因此改变。')
    })

    it('shows lesson rows with number, current badge and attendance state once expanded', () => {
      const markup = renderToStaticMarkup(createElement(LessonsSection, lessonsSectionProps(new Set(['period-1'])) as never))
      expect(markup).toContain('aria-expanded="true"')
      expect(markup).toContain('第 1 课')
      expect(markup).toContain('第 2 课')
      expect(markup).toContain('is-current">Current</em>')
      expect(markup).toContain('已点名')
      expect(markup).toContain('90 分钟')
    })
  })

  describe('draft-panel initial states', () => {
    function draftProps(context: ReturnType<typeof createLessonPrepContext> | null): Record<string, unknown> {
      return {
        context,
        initialDraftId: null,
        onOpenDraft: vi.fn(),
        onBackToCourses: noops().noop,
        onBrowseExternal: vi.fn(),
        onBrowseMaterials: vi.fn(),
      }
    }

    it('renders the draft inbox loading state without a prep context', () => {
      const markup = renderToStaticMarkup(createElement(DraftPanel, draftProps(null) as never))
      expect(markup).toContain('draft-inbox-panel')
      expect(markup).toContain('正在读取草稿…')
      expect(markup).toContain('修改记录')
    })

    it('renders the prep workspace initial state with a context while files load', () => {
      const course = node('course-1', null, 'course', '初一数学班', 0, { courseMode: 'class' })
      const lesson = node('lesson-1', null, 'lesson', '有理数', 0)
      const student: StudentRecord = { id: 'student-1', name: '张三', createdAt: stamp, updatedAt: stamp, deletedAt: null }
      const context = createLessonPrepContext(course, lesson, [student], '第一阶段')
      const markup = renderToStaticMarkup(createElement(DraftPanel, draftProps(context) as never))
      expect(markup).toContain('lesson-prep-workspace')
      expect(markup).toContain('新建备课')
      expect(markup).toContain('选择生成依据')
      expect(markup).toContain('正在读取本次资料…')
    })
  })

  describe('app shell navigation', () => {
    it('renders all eight workspace entries with the active course tab', () => {
      const markup = renderToStaticMarkup(createElement(App))
      for (const label of ['课程', '搜索', '题库', '外部资料', '素材库', '学生', '教学内容', '设置']) {
        expect(markup).toContain(`<span>${label}</span>`)
      }
      expect(markup).toContain('aria-label="主导航"')
      expect(markup).toContain('is-active')
      expect(markup).toContain('aria-current="page"')
    })
  })
})
