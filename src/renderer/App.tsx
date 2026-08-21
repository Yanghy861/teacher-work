import { useEffect, useState } from 'react'

import type { TeacherWorkbenchError } from '../shared/ipc-contracts'
import CourseDashboard from './course-dashboard'
import ManagedFilesPanel from './managed-files-panel'
import SearchPanel from './search-panel'

const navigationItems = ['我的课程', '搜索', '素材库', '学生', '设置'] as const

export default function App(): React.JSX.Element {
  const [activeItem, setActiveItem] = useState<(typeof navigationItems)[number]>('我的课程')
  const [appVersion, setAppVersion] = useState('读取中…')
  const [workspaceStatus, setWorkspaceStatus] = useState('工作区读取中…')

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
              onClick={() => setActiveItem(item)}
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
            <p className="eyebrow">教师工作台 V1</p>
            <h1>{activeItem}</h1>
          </div>
          <div className="status-pill">{workspaceStatus}</div>
        </header>
        {activeItem === '搜索' ? (
          <SearchPanel />
        ) : activeItem === '我的课程' ? (
          <CourseDashboard />
        ) : activeItem === '素材库' ? (
          <ManagedFilesPanel />
        ) : activeItem === '学生' ? (
          <ManagedFilesPanel heading="学生资料" />
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
