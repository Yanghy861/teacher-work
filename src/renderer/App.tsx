import { useEffect, useState } from 'react'

const navigationItems = ['我的课程', '素材库', '学生', '设置'] as const

export default function App(): React.JSX.Element {
  const [activeItem, setActiveItem] = useState<(typeof navigationItems)[number]>('我的课程')
  const [appVersion, setAppVersion] = useState('读取中…')

  useEffect(() => {
    void window.teacherWorkbench.app
      .getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion('开发模式'))
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
          <div className="status-pill">骨架已启动</div>
        </header>
        <section className="placeholder-card" aria-live="polite">
          <div className="placeholder-icon" aria-hidden="true">✦</div>
          <h2>{activeItem}功能即将就绪</h2>
          <p>当前任务只建立安全的桌面应用骨架，业务功能将在后续任务中按顺序实现。</p>
        </section>
      </main>
    </div>
  )
}
