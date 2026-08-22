import { useEffect, useState } from 'react'

import type { TeacherWorkbenchError } from '../shared/ipc-contracts'
import CourseDashboard from './course-dashboard'
import ManagedFilesPanel from './managed-files-panel'
import SearchPanel from './search-panel'
import SettingsPanel from './settings-panel'
import DraftPanel from './draft-panel'
import ExternalLibraryPanel from './external-library-panel'
import MaterialPickerPanel from './material-picker-panel'
import type { LessonPrepContext } from './lesson-prep-context'

const navigationItems = ['我的课程', '搜索', '外部资料', '素材库', '学生', '备课', '设置'] as const

export default function App(): React.JSX.Element {
  const [activeItem, setActiveItem] = useState<(typeof navigationItems)[number]>('我的课程')
  const [appVersion, setAppVersion] = useState('读取中…')
  const [workspaceStatus, setWorkspaceStatus] = useState('工作区读取中…')
  const [prepContext, setPrepContext] = useState<LessonPrepContext | null>(null)
  const [prepDraftId, setPrepDraftId] = useState<string | null>(null)
  const [externalPickerOpen, setExternalPickerOpen] = useState(false)
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false)

  useEffect(() => {
    void Promise.all([
      window.teacherWorkbench.app.getVersion(),
      window.teacherWorkbench.workspace.getInfo(),
    ])
      .then(([version, workspace]) => {
        setAppVersion(version)
        setWorkspaceStatus(`工作区已连接 · schema v${workspace.schemaVersion}`)
      })
      .catch((error: unknown) => {
        setAppVersion('开发模式')
        const code = isTeacherWorkbenchError(error) ? error.code : 'INTERNAL_ERROR'
        setWorkspaceStatus(`工作区不可用 · ${code}`)
      })
  }, [])

  function navigate(item: (typeof navigationItems)[number]): void {
    setExternalPickerOpen(false)
    setMaterialPickerOpen(false)
    if (item === '备课') {
      setPrepContext(null)
      setPrepDraftId(null)
    }
    setActiveItem(item)
  }

  function startPrep(context: LessonPrepContext): void {
    setPrepContext(context)
    setPrepDraftId(null)
    setExternalPickerOpen(false)
    setMaterialPickerOpen(false)
    setActiveItem('备课')
  }

  function openDraft(context: LessonPrepContext, noteId: string): void {
    setPrepContext(context)
    setPrepDraftId(noteId)
    setExternalPickerOpen(false)
    setMaterialPickerOpen(false)
    setActiveItem('备课')
  }

  function returnToPrep(): void {
    setExternalPickerOpen(false)
    setMaterialPickerOpen(false)
    setActiveItem('备课')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand-mark">
          <span className="brand-dot" aria-hidden="true" />
          <span>教师工作台</span>
        </div>
        <nav>
          {navigationItems.map((item) => (
            <button
              className={`nav-item${activeItem === item ? ' is-active' : ''}`}
              key={item}
              type="button"
              aria-current={activeItem === item ? 'page' : undefined}
              onClick={() => navigate(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <p className="sidebar-version">Electron {appVersion}</p>
      </aside>
      <main className="content-area">
        <header className="content-header">
          <div>
            <p className="eyebrow">教师工作台 V1.1</p>
            <h1>{activeItem}</h1>
          </div>
          <div className="status-pill">{workspaceStatus}</div>
        </header>
        {activeItem === '搜索' ? (
          <SearchPanel />
        ) : activeItem === '我的课程' ? (
          <CourseDashboard onStartPrep={startPrep} />
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
          <ManagedFilesPanel heading="学生资料" />
        ) : activeItem === '设置' ? (
          <SettingsPanel />
        ) : activeItem === '备课' ? (
          <DraftPanel
            context={prepContext}
            initialDraftId={prepDraftId}
            onOpenDraft={openDraft}
            onBackToCourses={() => navigate('我的课程')}
            onBrowseExternal={() => {
              setPrepDraftId(null)
              setExternalPickerOpen(true)
              setActiveItem('外部资料')
            }}
            onBrowseMaterials={() => {
              setPrepDraftId(null)
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

function isTeacherWorkbenchError(error: unknown): error is TeacherWorkbenchError {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
}
