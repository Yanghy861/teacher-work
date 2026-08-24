import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { CoreOverview } from '../src/shared/core-contracts'
import QuickCourseWizardBasics, {
  DuplicateStudentDialog,
  PeriodLessonsStep,
} from '../src/renderer/quick-course-wizard'
import {
  buildEmptyLessons,
  createInitialQuickCourseWizardState,
  parseStudentRoster,
} from '../src/renderer/quick-course-wizard-model'

const stamp = '2026-08-24T00:00:00.000Z'

const overview: CoreOverview = {
  nodes: [
    {
      id: 'course-active',
      parentId: null,
      kind: 'course',
      title: '初一数学班',
      courseMode: 'class',
      sortOrder: 0,
      contentMd: '',
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
    },
    {
      id: 'course-history',
      parentId: null,
      kind: 'course',
      title: '小学数学班',
      courseMode: 'class',
      sortOrder: 1,
      contentMd: '',
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
    },
  ],
  students: [
    { id: 'zhang-a', name: '张三', createdAt: stamp, updatedAt: stamp, deletedAt: null },
    { id: 'zhang-b', name: '张三', createdAt: stamp, updatedAt: stamp, deletedAt: null },
  ],
  courseStudentLinks: [
    { courseId: 'course-active', studentId: 'zhang-a', createdAt: stamp, endedAt: null },
    { courseId: 'course-history', studentId: 'zhang-b', createdAt: stamp, endedAt: stamp },
  ],
  notes: [
    {
      id: 'note-a',
      studentId: 'zhang-a',
      lessonId: null,
      bodyMd: '人工记录',
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
      noteKind: 'manual',
    },
  ],
  courseProgress: [],
  lessonSessions: [],
}

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('V13-03 quick course wizard basics UI', () => {
  it('renders the four-step shell and first-step empty-course guidance', () => {
    const markup = renderToStaticMarkup(createElement(QuickCourseWizardBasics, {
      overview,
      onClose: vi.fn(),
      onContinueToSchedule: vi.fn(),
    }))

    expect(markup).toContain('快速建课')
    expect(markup).toContain('课程与学生')
    expect(markup).toContain('阶段与课次')
    expect(markup).toContain('上课安排')
    expect(markup).toContain('检查并创建')
    expect(markup).toContain('学生名单（可选，一行一个）')
    expect(markup).toContain('学生也可以在课程创建后再关联')
  })

  it('keeps the next action disabled while a duplicate student is unresolved', () => {
    const roster = parseStudentRoster('张三', overview.students)
    const initialState = {
      ...createInitialQuickCourseWizardState(new Date(2026, 7, 24)),
      courseTitle: '初二数学班',
      roster,
    }
    const markup = renderToStaticMarkup(createElement(QuickCourseWizardBasics, {
      overview,
      initialState,
      initialRosterText: '张三',
      onClose: vi.fn(),
      onContinueToSchedule: vi.fn(),
    }))

    expect(markup).toContain('重名待确认')
    expect(markup).toContain('请先处理重名学生')
    expect(markup).toMatch(/<button class="primary-button" type="button" disabled="">下一步<\/button>/)
  })

  it('shows candidate context without adding new identity fields', () => {
    const entry = parseStudentRoster('张三', overview.students).entries[0]!
    const markup = renderToStaticMarkup(createElement(DuplicateStudentDialog, {
      overview,
      entry,
      busy: false,
      onCancel: vi.fn(),
      onResolve: vi.fn(),
    }))

    expect(markup).toContain('发现多个“张三”')
    expect(markup).toContain('在读课程：初一数学班')
    expect(markup).toContain('历史课程：小学数学班')
    expect(markup).toContain('最近人工记录：2026-08-24')
    expect(markup).toContain('创建新的同名学生')
  })

  it('renders the second-step count and lesson preview', () => {
    const state = {
      ...createInitialQuickCourseWizardState(new Date(2026, 7, 24)),
      currentStep: 2 as const,
      periodTitle: '2026 秋季',
      lessons: buildEmptyLessons(16),
    }
    const markup = renderToStaticMarkup(createElement(PeriodLessonsStep, {
      state,
      emptyCountText: '16',
      planText: '',
      inputError: '',
      busy: false,
      onPeriodTitleChange: vi.fn(),
      onLessonModeChange: vi.fn(),
      onEmptyCountChange: vi.fn(),
      onPlanTextChange: vi.fn(),
    }))

    expect(markup).toContain('预计课次数（1–100）')
    expect(markup).toContain('共 16 节课')
    expect(markup).toContain('第 1 课 · 未命名')
    expect(markup).toContain('第 16 课 · 未命名')
  })

  it('keeps V13-03 isolated from persistence and fixes the 100-lesson boundary in UI', () => {
    const componentSource = readSource('../src/renderer/quick-course-wizard.tsx')
    const stylesheet = readSource('../src/renderer/styles.css')

    expect(componentSource).toContain('QUICK_COURSE_LESSON_LIMIT_MESSAGE')
    expect(componentSource).toContain('max="100"')
    expect(componentSource).toContain('resolveRosterDuplicate')
    expect(componentSource).toContain('confirmDiscard')
    expect(componentSource).not.toContain('createCourseSetup(')
    expect(stylesheet).toContain('.quick-course-two-column')
    expect(stylesheet).toContain('.quick-duplicate-dialog')
  })
})
