import { useEffect, useState } from 'react'

import type { TeacherWorkbenchError } from '../shared/ipc-contracts'
import CourseDashboard from './course-dashboard'
import ManagedFilesPanel from './managed-files-panel'
import SearchPanel from './search-panel'
import SettingsPanel from './settings-panel'
import ExternalLibraryPanel from './external-library-panel'
import MaterialPickerPanel from './material-picker-panel'
import type { LessonPrepContext } from './lesson-prep-context'
import StudentsPage from './students-page'
import QuestionBankPage from './question-bank-page'
import TeachingContentPage from './teaching-content-page'
import { AppDialogProvider } from './app-confirm-dialog'
import { CoreOverviewProvider } from './core-overview-provider'
import {
  createDraftInboxTarget,
  createTeachingContentTarget,
  type TeachingContentTarget,
} from './teaching-content-context'

const navigationItems = [
  { label: '课程', icon: 'courses' },
  { label: '搜索', icon: 'search' },
  { label: '题库', icon: 'questionBank' },
  { label: '外部资料', icon: 'external' },
  { label: '素材库', icon: 'materials' },
  { label: '学生', icon: 'students' },
  { label: '教学内容', icon: 'prep' },
  { label: '设置', icon: 'settings' },
] as const

type NavigationItem = (typeof navigationItems)[number]
type NavigationLabel = NavigationItem['label']
type NavigationIconName = NavigationItem['icon']

export default function App(): React.JSX.Element {
  return (
    <AppDialogProvider>
      <CoreOverviewProvider>
        <AppContent />
      </CoreOverviewProvider>
    </AppDialogProvider>
  )
}

function AppContent(): React.JSX.Element {
  const [activeItem, setActiveItem] = useState<NavigationLabel>('课程')
  const [workspaceError, setWorkspaceError] = useState('')
  const [prepContext, setPrepContext] = useState<LessonPrepContext | null>(null)
  const [prepDraftId, setPrepDraftId] = useState<string | null>(null)
  const [externalPickerOpen, setExternalPickerOpen] = useState(false)
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false)
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [selectedLessonId, setSelectedLessonId] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [teachingContentTarget, setTeachingContentTarget] = useState<TeachingContentTarget | null>(null)
  const [courseOriginStudentId, setCourseOriginStudentId] = useState('')

  useEffect(() => {
    void window.teacherWorkbench.workspace.getInfo()
      .then(() => {
        setWorkspaceError('')
      })
      .catch((error: unknown) => {
        const code = isTeacherWorkbenchError(error) ? error.code : 'INTERNAL_ERROR'
        setWorkspaceError(`工作区不可用 · ${code}`)
      })
  }, [])

  function navigate(item: NavigationLabel): void {
    setExternalPickerOpen(false)
    setMaterialPickerOpen(false)
    if (item !== '教学内容') {
      setExternalPickerOpen(false)
      setMaterialPickerOpen(false)
    }
    setActiveItem(item)
  }

  // V1.2 contract migrated: onOpenDraftInbox now opens 教学内容 / 修改记录.

  function startPrep(context: LessonPrepContext): void {
    const originStudentId = courseOriginStudentId === '' ? undefined : courseOriginStudentId
    setTeachingContentTarget(createTeachingContentTarget(context, 'prep', originStudentId))
    setSelectedCourseId(context.courseId)
    setSelectedLessonId(context.lessonId)
    setPrepContext(context)
    setPrepDraftId(null)
    setExternalPickerOpen(false)
    setMaterialPickerOpen(false)
    setActiveItem('教学内容')
  }

  function openDraft(context: LessonPrepContext, noteId: string): void {
    const originStudentId = courseOriginStudentId === '' ? undefined : courseOriginStudentId
    setTeachingContentTarget(createTeachingContentTarget(context, 'prep', originStudentId))
    setSelectedCourseId(context.courseId)
    setSelectedLessonId(context.lessonId)
    setPrepContext(context)
    setPrepDraftId(noteId)
    setExternalPickerOpen(false)
    setMaterialPickerOpen(false)
    setActiveItem('教学内容')
  }

  function returnToPrep(): void {
    setExternalPickerOpen(false)
    setMaterialPickerOpen(false)
    setActiveItem('教学内容')
    setTeachingContentTarget((current) => current === null ? null : { ...current, section: 'prep' })
  }

  function openCourse(courseId: string): void
  function openCourse(courseId: string, originStudentId?: string): void
  function openCourse(courseId: string, originStudentId?: string): void {
    setSelectedCourseId(courseId)
    setSelectedLessonId('')
    setCourseOriginStudentId(originStudentId ?? '')
    setActiveItem('课程')
  }

  function openStudent(studentId: string): void {
    setSelectedStudentId(studentId)
    setActiveItem('学生')
  }

  function openTeachingContent(target?: TeachingContentTarget): void {
    if (target !== undefined) {
      setTeachingContentTarget(target)
      if (target.courseId !== null) setSelectedCourseId(target.courseId)
      if (target.lessonId !== null) setSelectedLessonId(target.lessonId)
    }
    setActiveItem('教学内容')
  }

  function returnToCourses(target: TeachingContentTarget): void {
    if (target.courseId !== null) setSelectedCourseId(target.courseId)
    if (target.lessonId !== null) setSelectedLessonId(target.lessonId)
    setActiveItem('课程')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <nav>
          {navigationItems.map((item) => (
            <button
              className={`nav-item${activeItem === item.label ? ' is-active' : ''}`}
              key={item.label}
              type="button"
              aria-current={activeItem === item.label ? 'page' : undefined}
              onClick={() => navigate(item.label)}
            >
              <NavigationIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="content-area">
        {workspaceError !== '' && (
          <div className="workspace-error-badge" role="alert">{workspaceError}</div>
        )}
        {activeItem === '搜索' ? (
          <SearchPanel />
        ) : activeItem === '题库' ? (
          <QuestionBankPage />
        ) : activeItem === '课程' ? (
          <CourseDashboard
            selectedCourseId={selectedCourseId}
            initialViewedLessonId={selectedLessonId}
            onStartPrep={startPrep}
            onOpenDraft={openDraft}
            onOpenDraftInbox={() => openTeachingContent(createDraftInboxTarget())}
            onSelectCourse={setSelectedCourseId}
            onOpenStudent={openStudent}
            onOpenTeachingContent={(context) => openTeachingContent(openTeachingContentForContext(context, courseOriginStudentId))}
          />
        ) : activeItem === '素材库' ? (
          materialPickerOpen && prepContext !== null ? (
            <MaterialPickerPanel
              context={prepContext}
              onAdded={returnToPrep}
              onCancel={returnToPrep}
            />
          ) : (
            <ManagedFilesPanel />
          )
        ) : activeItem === '外部资料' ? (
          <ExternalLibraryPanel
            prepContext={externalPickerOpen ? prepContext : null}
            onAddedToLesson={returnToPrep}
          />
        ) : activeItem === '学生' ? (
          <StudentsPage
            selectedStudentId={selectedStudentId}
            onSelectStudent={setSelectedStudentId}
            onOpenCourse={openCourse}
          />
        ) : activeItem === '设置' ? (
          <SettingsPanel />
        ) : activeItem === '教学内容' ? (
          <TeachingContentPage
            target={teachingContentTarget}
            initialDraftId={prepDraftId}
            onTargetChange={(nextTarget) => {
              setTeachingContentTarget(nextTarget)
              setPrepContext(null)
              setPrepDraftId(null)
            }}
            onBackToCourses={returnToCourses}
            onBackToStudent={(studentId) => openStudent(studentId)}
            onOpenExternal={(context) => {
              setPrepContext(context)
              setExternalPickerOpen(true)
              setActiveItem('外部资料')
            }}
            onOpenMaterials={(context) => {
              setPrepContext(context)
              setMaterialPickerOpen(true)
              setActiveItem('素材库')
            }}
          />
        ) : (
          <section className="placeholder-card" aria-live="polite">
            <div className="placeholder-icon" aria-hidden="true">✦</div>
            <h2>{activeItem}功能将在后续里程碑接入</h2>
            <p>当前先完成课程、阶段、课次和学生记录的核心管理流程。</p>
          </section>
        )}
      </main>
    </div>
  )
}

function openTeachingContentForContext(
  context: LessonPrepContext,
  originStudentId?: string,
): TeachingContentTarget {
  return createTeachingContentTarget(context, 'courseware', originStudentId)
}

function isTeacherWorkbenchError(error: unknown): error is TeacherWorkbenchError {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
}

function NavigationIcon({ name }: { readonly name: NavigationIconName }): React.JSX.Element {
  const commonProps = {
    className: 'nav-icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (name) {
    case 'courses':
      return <svg {...commonProps}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22V5.5Z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22V5.5Z" /></svg>
    case 'search':
      return <svg {...commonProps}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4 4" /></svg>
    case 'questionBank':
      return <svg {...commonProps}><path d="M5 3.5h12a2 2 0 0 1 2 2v15H7a2 2 0 0 1-2-2v-15Z" /><path d="M8 7h8M8 11h5" /><path d="M10 16.2c.35-1.5 1.25-2.2 2.6-2.2 1.25 0 2.4.7 2.4 2 0 1.7-2 1.9-2 3" /></svg>
    case 'external':
      return <svg {...commonProps}><path d="M3.5 7.5h6l2-2h9v13h-17v-11Z" /><path d="M3.5 9.5h17" /></svg>
    case 'materials':
      return <svg {...commonProps}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
    case 'students':
      return <svg {...commonProps}><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-3.5 2.3-5.5 5.5-5.5s5 2 5.5 5.5" /><path d="M15.5 5.5a3 3 0 0 1 0 5.5M16 13.5c2.6.4 4 2.2 4.5 5" /></svg>
    case 'prep':
      return <svg {...commonProps}><path d="M5 3.5h11l3 3V20.5H5v-17Z" /><path d="M15.5 3.5v4h3.5M8 12h8M8 16h5" /><path d="m7.5 8 1 1 2-2" /></svg>
    case 'settings':
      return <svg {...commonProps}><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.7-1.7l.9-1.9-2.1-2.1-1.9.9a7 7 0 0 0-1.7-.7L10.5 2h-3l-.7 2a7 7 0 0 0-1.7.7l-1.9-.9-2.1 2.1L2 7.8a7 7 0 0 0-.7 1.7L0 10.5v3l2 .7a7 7 0 0 0 .7 1.7l-.9 1.9 2.1 2.1 1.9-.9a7 7 0 0 0 1.7.7l1 2.3h3l.7-2a7 7 0 0 0 1.7-.7l1.9.9 2.1-2.1-.9-1.9a7 7 0 0 0 .7-1.7l2.3-1Z" transform="translate(2 -1) scale(.83)" /></svg>
  }
}
