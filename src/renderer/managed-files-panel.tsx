import { useEffect, useMemo, useState } from 'react'

import type { CoreOverview } from '../shared/core-contracts'
import type { ManagedFileRecord } from '../shared/file-contracts'
import type { MaterialFolder, MaterialLibraryOverview } from '../shared/material-library-contracts'
import { useAppDialog } from './app-confirm-dialog'
import { materialKind } from './material-library'

// 旧的 listReusableMaterialFiles 语义已由 Main 侧逻辑目录查询承接；课程/学生副本仍不会进入素材库。

interface ManagedFilesPanelProps { readonly compact?: boolean; readonly heading?: string; readonly lessonId?: string; readonly lessonLabel?: string }
type LibraryView = 'all' | 'recent' | 'unfiled' | `folder:${string}`
type TypeFilter = 'all' | 'documents' | 'images' | 'other'

export default function ManagedFilesPanel({ compact = false, heading = '素材库', lessonId, lessonLabel }: ManagedFilesPanelProps): React.JSX.Element {
  const { requestText } = useAppDialog()
  const [overview, setOverview] = useState<MaterialLibraryOverview | null>(null)
  const [coreOverview, setCoreOverview] = useState<CoreOverview | null>(null)
  const [view, setView] = useState<LibraryView>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedLessonId, setSelectedLessonId] = useState(lessonId ?? '')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const lessons = useMemo(() => coreOverview?.nodes.filter((node) => node.kind === 'lesson') ?? [], [coreOverview])
  const activeLessonId = lessonId ?? selectedLessonId
  const activeFolderId = view.startsWith('folder:') ? view.slice('folder:'.length) : null
  const activeFolder = overview?.folders.find((folder) => folder.id === activeFolderId) ?? null
  const standaloneFiles = overview?.files ?? []
  const fileFolder = useMemo(() => new Map((overview?.items ?? []).map((item) => [item.fileId, item.folderId])), [overview])
  const visibleFiles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('zh-CN')
    return standaloneFiles.filter((file) => file.deletedAt === null)
      .filter((file) => view === 'recent' || view === 'unfiled' ? view === 'recent' || fileFolder.get(file.id) === null : activeFolderId === null || fileFolder.get(file.id) === activeFolderId)
      .filter((file) => typeFilter === 'all' || materialKind(file) === typeFilter)
      .filter((file) => query === '' || file.originalName.toLocaleLowerCase('zh-CN').includes(query))
      .sort((left, right) => view === 'recent' ? right.updatedAt.localeCompare(left.updatedAt) : left.originalName.localeCompare(right.originalName, 'zh-CN', { numeric: true }))
  }, [activeFolderId, fileFolder, search, standaloneFiles, typeFilter, view])
  const removedFiles = standaloneFiles.filter((file) => file.deletedAt !== null)

  useEffect(() => { void reload() }, [])
  useEffect(() => { if (lessonId === undefined && selectedLessonId === '' && lessons[0] !== undefined) setSelectedLessonId(lessons[0].id) }, [lessonId, lessons, selectedLessonId])

  async function reload(): Promise<void> {
    setLoading(true)
    try {
      const [nextOverview, nextCore] = await Promise.all([window.teacherWorkbench.materialLibrary.getOverview(), compact ? Promise.resolve(null) : window.teacherWorkbench.core.getOverview()])
      setOverview(nextOverview); if (nextCore !== null) setCoreOverview(nextCore); setError('')
    } catch (loadError) { setError(toErrorMessage(loadError)) } finally { setLoading(false) }
  }
  async function runAction(action: () => Promise<unknown>, message?: string): Promise<void> {
    setBusy(true); setError(''); setNotice('')
    try { await action(); if (message !== undefined) setNotice(message); await reload() } catch (actionError) { setError(toErrorMessage(actionError)) } finally { setBusy(false) }
  }
  function importFile(): void { void runAction(async () => { const imported = await window.teacherWorkbench.files.importFromPicker(); if (imported !== null) await window.teacherWorkbench.materialLibrary.moveFile({ fileId: imported.id, folderId: activeFolderId }) }, activeFolder === null ? '资料已保存到待整理。' : `资料已保存到「${activeFolder.name}」。`) }
  async function createFolder(): Promise<void> {
    const name = await requestText({
      title: '新建素材文件夹',
      label: '文件夹名称',
      placeholder: '例如：三角形',
      submitLabel: '创建文件夹',
    })
    if (name === null) return
    void runAction(() => window.teacherWorkbench.materialLibrary.createFolder({ parentId: activeFolderId, name }), '文件夹已创建。')
  }
  if (loading && overview === null) return <section className="workspace-card">正在读取素材库…</section>

  return <div className={`managed-files-panel${compact ? ' is-compact' : ''}`} aria-live="polite">
    {error !== '' && <div className="inline-error" role="alert">{error}</div>}{notice !== '' && <div className="inline-notice" role="status">{notice}</div>}
    <section className="workspace-card"><div className="card-heading"><div><p className="section-kicker">资料管理</p><h2>{heading}</h2></div><div className="file-toolbar"><button className="secondary-button" type="button" onClick={() => void reload()} disabled={busy}>刷新</button><button className="secondary-button" type="button" onClick={() => void createFolder()} disabled={busy}>新建文件夹</button><button className="primary-button" type="button" onClick={importFile} disabled={busy}>导入资料</button></div></div>
      {!compact && <div className="file-target-grid"><label className="select-field">复制素材到课次<select aria-label="复制素材到课次" value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)} disabled={busy || lessons.length === 0}><option value="">请选择课次</option>{lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label></div>}
      {compact && <p className="file-context">当前课次：{lessonLabel ?? (activeLessonId === '' ? '未选择' : '已选择')}</p>}
      <p className="material-library-intro">素材库是老师自己维护的逻辑目录。已经加入课程或学生的独立副本不会自动出现在这里；外部资料仍然只读。这里的“待整理”表示尚未放入自建目录的素材。</p>
      <div className="material-library-toolbar"><label className="material-library-search"><span>查找素材</span><input aria-label="查找素材" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="按文件名查找" /></label></div>
      <div className="material-library-layout"><aside className="material-library-tree" aria-label="素材库逻辑目录"><div className="material-library-tree-heading"><strong>素材库目录</strong><small>{standaloneFiles.filter((file) => file.deletedAt === null).length} 项</small></div><nav className="material-library-tree-list"><LibraryButton label="全部素材" active={view === 'all'} count={standaloneFiles.filter((file) => file.deletedAt === null).length} onClick={() => setView('all')} /><LibraryButton label="最近使用" active={view === 'recent'} count={standaloneFiles.filter((file) => file.deletedAt === null).length} onClick={() => setView('recent')} /><LibraryButton label="待整理" active={view === 'unfiled'} count={standaloneFiles.filter((file) => file.deletedAt === null && fileFolder.get(file.id) === null).length} onClick={() => setView('unfiled')} /><div className="material-library-custom-heading">我的文件夹</div>{(overview?.folders ?? []).filter((folder) => folder.parentId === null).map((folder) => <FolderBranch key={folder.id} folder={folder} folders={overview?.folders ?? []} fileFolder={fileFolder} view={view} onSelect={setView} onRename={(id, name) => void runAction(() => window.teacherWorkbench.materialLibrary.renameFolder({ folderId: id, name }), '文件夹已重命名。')} onDelete={(id) => void runAction(() => window.teacherWorkbench.materialLibrary.deleteFolder({ folderId: id }), '文件夹已删除。')} />)}</nav></aside>
        <section className="material-library-results"><div className="material-library-results-heading"><strong>素材库 / {view === 'all' ? '全部素材' : view === 'recent' ? '最近使用' : view === 'unfiled' ? '待整理' : activeFolder?.name ?? '文件夹'}</strong><span>{visibleFiles.length} 项</span></div><div className="material-type-filter" role="group" aria-label="类型筛选">{(['all', 'documents', 'images', 'other'] as const).map((filter) => <button key={filter} className={typeFilter === filter ? 'is-active' : ''} type="button" onClick={() => setTypeFilter(filter)}>{filter === 'all' ? '全部类型' : filter === 'documents' ? '文档' : filter === 'images' ? '图片' : '其他'}</button>)}</div><FileList files={visibleFiles} busy={busy} lessonId={activeLessonId} onAction={runAction} />{removedFiles.length > 0 && <details className="deleted-files"><summary>已移除素材（{removedFiles.length}）</summary><ul className="file-list">{removedFiles.map((file) => <li className="file-row is-deleted" key={file.id}><FileSummary file={file} /><button className="link-button" type="button" onClick={() => void runAction(() => window.teacherWorkbench.files.restoreFile({ fileId: file.id }), '素材已恢复。')} disabled={busy}>恢复</button></li>)}</ul></details>}</section></div>
    </section></div>
}

function FolderBranch({ folder, folders, fileFolder, view, onSelect, onRename, onDelete }: { readonly folder: MaterialFolder; readonly folders: readonly MaterialFolder[]; readonly fileFolder: ReadonlyMap<string, string | null>; readonly view: LibraryView; readonly onSelect: (view: LibraryView) => void; readonly onRename: (id: string, name: string) => void; readonly onDelete: (id: string) => void }): React.JSX.Element {
  const { confirm, requestText } = useAppDialog()
  const [menuOpen, setMenuOpen] = useState(false)
  const children = folders.filter((item) => item.parentId === folder.id)
  const count = [...fileFolder.values()].filter((id) => id === folder.id).length

  async function requestRename(): Promise<void> {
    setMenuOpen(false)
    const name = await requestText({
      title: '重命名文件夹',
      label: '文件夹名称',
      initialValue: folder.name,
      submitLabel: '保存名称',
    })
    if (name !== null && name !== folder.name) onRename(folder.id, name)
  }

  async function requestDelete(): Promise<void> {
    setMenuOpen(false)
    const confirmed = await confirm({
      title: '删除文件夹？',
      description: `将删除文件夹“${folder.name}”。仅空文件夹可以删除。`,
      confirmLabel: '删除文件夹',
      destructive: true,
    })
    if (confirmed) onDelete(folder.id)
  }

  return (
    <div className="material-folder-branch">
      <div className={`material-library-tree-row${view === `folder:${folder.id}` ? ' is-selected' : ''}`}>
        <button className="material-folder-select" type="button" onClick={() => onSelect(`folder:${folder.id}`)}>
          <span className="material-library-tree-icon">▸</span>
          <span title={folder.name}>{folder.name}</span>
          <small>{count}</small>
        </button>
        <span className="folder-action-control">
          <button className="folder-more" type="button" title="文件夹操作" aria-label={`操作文件夹 ${folder.name}`} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>⋯</button>
          {menuOpen && (
            <span className="folder-action-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => void requestRename()}>重命名</button>
              <button className="is-danger" type="button" role="menuitem" onClick={() => void requestDelete()}>删除</button>
            </span>
          )}
        </span>
      </div>
      {children.map((child) => <FolderBranch key={child.id} folder={child} folders={folders} fileFolder={fileFolder} view={view} onSelect={onSelect} onRename={onRename} onDelete={onDelete} />)}
    </div>
  )
}
function LibraryButton({ label, count, active, onClick }: { readonly label: string; readonly count: number; readonly active: boolean; readonly onClick: () => void }): React.JSX.Element { return <button className={`material-library-tree-row${active ? ' is-selected' : ''}`} type="button" aria-current={active ? 'page' : undefined} onClick={onClick}><span className="material-library-tree-icon">{active ? '●' : '○'}</span><span>{label}</span><small>{count}</small></button> }
function FileList({ files, busy, lessonId, onAction }: { readonly files: readonly ManagedFileRecord[]; readonly busy: boolean; readonly lessonId: string; readonly onAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void> }): React.JSX.Element { return <ul className="file-list">{files.map((file) => <li className="file-row" key={file.id}><FileSummary file={file} /><div className="file-actions"><button className="link-button" type="button" onClick={() => void onAction(() => window.teacherWorkbench.files.openFile({ fileId: file.id }))} disabled={busy}>打开</button><button className="link-button" type="button" onClick={() => void onAction(() => window.teacherWorkbench.files.showFileInFolder({ fileId: file.id }))} disabled={busy}>所在文件夹</button><button className="link-button" type="button" onClick={() => void onAction(() => window.teacherWorkbench.files.copyToLesson({ fileId: file.id, lessonId }), '素材已复制到指定课次。')} disabled={busy || lessonId === ''}>复制到课次</button><button className="danger-button" type="button" onClick={() => void onAction(() => window.teacherWorkbench.files.softDeleteFile({ fileId: file.id }), '素材已移除。')} disabled={busy}>移除</button></div></li>)}{files.length === 0 && <li className="empty-state">这里还没有符合条件的素材。</li>}</ul> }
function FileSummary({ file }: { readonly file: ManagedFileRecord }): React.JSX.Element { const kind = materialKind(file); return <div className="file-summary"><strong title={file.originalName}>{file.originalName}</strong><small>{formatBytes(file.sizeBytes)} · {kind === 'documents' ? '文档' : kind === 'images' ? '图片' : '其他'} · {file.originFileId === null ? '素材原件' : '保存自副本'}</small></div> }
function formatBytes(size: number): string { if (size < 1024) return `${size} B`; if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`; return `${(size / (1024 * 1024)).toFixed(1)} MB` }
function toErrorMessage(error: unknown): string { return error instanceof Error && error.message.trim() !== '' ? error.message : '素材库操作失败，请稍后重试。' }
