import { useEffect, useMemo, useState, type DragEvent, type MouseEvent } from 'react'

import type { CoreOverview } from '../shared/core-contracts'
import type { ManagedFileRecord } from '../shared/file-contracts'
import type { MaterialFolder, MaterialLibraryOverview, ReorderMaterialFolderRequest } from '../shared/material-library-contracts'
import { useAppDialog } from './app-confirm-dialog'
import { materialKind } from './material-library'
import { buildFolderMoveRequest, buildFolderRootMoveRequest, listMaterialFolderChildren, materialFolderPath, type FolderDropPosition } from './material-tree'
import { formatBytes, toErrorMessage } from './ui-utils'

interface ManagedFilesPanelProps { readonly compact?: boolean; readonly heading?: string; readonly lessonId?: string; readonly lessonLabel?: string }
type LibraryView = 'all' | 'recent' | 'unfiled' | `folder:${string}`
type TypeFilter = 'all' | 'documents' | 'images' | 'other'
type DraggedMaterial = { readonly kind: 'file' | 'folder'; readonly id: string }
type MaterialDropTarget = { readonly kind: 'folder'; readonly folderId: string; readonly position: FolderDropPosition } | { readonly kind: 'unfiled' | 'root' } | null
type MaterialContextMenu = { readonly kind: 'root'; readonly x: number; readonly y: number } | { readonly kind: 'folder'; readonly folderId: string; readonly x: number; readonly y: number } | { readonly kind: 'file'; readonly fileId: string; readonly x: number; readonly y: number } | null
type MaterialContextTarget = { readonly kind: 'root' } | { readonly kind: 'folder'; readonly folderId: string } | { readonly kind: 'file'; readonly fileId: string }

export default function ManagedFilesPanel({ compact = false, heading = '素材库', lessonId, lessonLabel }: ManagedFilesPanelProps): React.JSX.Element {
  const { confirm, requestText } = useAppDialog()
  const [overview, setOverview] = useState<MaterialLibraryOverview | null>(null)
  const [coreOverview, setCoreOverview] = useState<CoreOverview | null>(null)
  const [view, setView] = useState<LibraryView>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedLessonId, setSelectedLessonId] = useState(lessonId ?? '')
  const [expandedFolderIds, setExpandedFolderIds] = useState<ReadonlySet<string>>(new Set())
  const [expansionInitialized, setExpansionInitialized] = useState(false)
  const [draggedMaterial, setDraggedMaterial] = useState<DraggedMaterial | null>(null)
  const [dropTarget, setDropTarget] = useState<MaterialDropTarget>(null)
  const [contextMenu, setContextMenu] = useState<MaterialContextMenu>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const lessons = useMemo(() => coreOverview?.nodes.filter((node) => node.kind === 'lesson') ?? [], [coreOverview])
  const activeLessonId = lessonId ?? selectedLessonId
  const activeFolderId = view.startsWith('folder:') ? view.slice('folder:'.length) : null
  const activeFolder = overview?.folders.find((folder) => folder.id === activeFolderId) ?? null
  const standaloneFiles = overview?.files ?? []
  const folders = overview?.folders ?? []
  const fileFolder = useMemo(() => new Map((overview?.items ?? []).map((item) => [item.fileId, item.folderId])), [overview])
  const folderOptions = useMemo(() => folders.map((folder) => ({ folder, path: materialFolderPath(folders, folder.id) })).sort((left, right) => left.path.localeCompare(right.path, 'zh-CN', { numeric: true })), [folders])
  const visibleFiles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('zh-CN')
    return standaloneFiles.filter((file) => file.deletedAt === null)
      .filter((file) => view === 'recent' || view === 'unfiled' ? view === 'recent' || fileFolder.get(file.id) === null : activeFolderId === null || fileFolder.get(file.id) === activeFolderId)
      .filter((file) => typeFilter === 'all' || materialKind(file) === typeFilter)
      .filter((file) => query === '' || file.originalName.toLocaleLowerCase('zh-CN').includes(query))
      .sort((left, right) => view === 'recent' ? right.updatedAt.localeCompare(left.updatedAt) : left.originalName.localeCompare(right.originalName, 'zh-CN', { numeric: true }))
  }, [activeFolderId, fileFolder, search, standaloneFiles, typeFilter, view])
  const removedFiles = standaloneFiles.filter((file) => file.deletedAt !== null)
  const contextFolder = contextMenu?.kind === 'folder' ? folders.find((folder) => folder.id === contextMenu.folderId) ?? null : null
  const contextFile = contextMenu?.kind === 'file' ? standaloneFiles.find((file) => file.id === contextMenu.fileId) ?? null : null

  useEffect(() => { void reload() }, [])
  useEffect(() => { if (lessonId === undefined && selectedLessonId === '' && lessons[0] !== undefined) setSelectedLessonId(lessons[0].id) }, [lessonId, lessons, selectedLessonId])
  useEffect(() => {
    if (overview === null || expansionInitialized) return
    const parentIds = new Set(overview.folders.filter((folder) => folder.parentId !== null).map((folder) => folder.parentId as string))
    setExpandedFolderIds(new Set(overview.folders.filter((folder) => folder.parentId === null && parentIds.has(folder.id)).map((folder) => folder.id)))
    setExpansionInitialized(true)
  }, [expansionInitialized, overview])
  useEffect(() => {
    if (contextMenu === null) return
    const close = (): void => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
    window.addEventListener('pointerdown', close)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    document.addEventListener('scroll', close, true)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [contextMenu])

  async function reload(): Promise<void> {
    setLoading(true)
    try {
      const [nextOverview, nextCore] = await Promise.all([window.teacherWorkbench.materialLibrary.getOverview(), compact ? Promise.resolve(null) : window.teacherWorkbench.core.getOverview()])
      setOverview(nextOverview)
      setView((current) => current.startsWith('folder:') && !nextOverview.folders.some((folder) => `folder:${folder.id}` === current) ? 'all' : current)
      if (nextOverview.folders.length === 0) setExpandedFolderIds(new Set())
      if (nextCore !== null) setCoreOverview(nextCore)
      setError('')
    } catch (loadError) { setError(toErrorMessage(loadError, '素材库操作失败，请稍后重试。')) } finally { setLoading(false) }
  }

  async function runAction<T>(action: () => Promise<T>, message?: string): Promise<T | undefined> {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await action()
      if (message !== undefined) setNotice(message)
      await reload()
      return result
    } catch (actionError) { setError(toErrorMessage(actionError, '素材库操作失败，请稍后重试。')); return undefined } finally { setBusy(false) }
  }

  function importFile(): void { void runAction(async () => { const imported = await window.teacherWorkbench.files.importFromPicker(); if (imported !== null) await window.teacherWorkbench.materialLibrary.moveFile({ fileId: imported.id, folderId: activeFolderId }) }, activeFolder === null ? '资料已保存到待整理。' : `资料已保存到「${activeFolder.name}」。`) }

  async function requestCreateFolder(parentId: string | null): Promise<void> {
    setContextMenu(null)
    const parent = parentId === null ? null : folders.find((folder) => folder.id === parentId) ?? null
    const name = await requestText({ title: parent === null ? '新建素材文件夹' : `在“${parent.name}”中新建文件夹`, label: '文件夹名称', placeholder: '例如：三角形', submitLabel: '创建文件夹' })
    if (name === null) return
    const created = await runAction(() => window.teacherWorkbench.materialLibrary.createFolder({ parentId, name }), '文件夹已创建。')
    if (created === undefined) return
    if (parentId !== null) setExpandedFolderIds((current) => new Set(current).add(parentId))
    setView(`folder:${created.id}`)
  }

  async function requestRename(folder: MaterialFolder): Promise<void> {
    setContextMenu(null)
    const name = await requestText({ title: '重命名文件夹', label: '文件夹名称', initialValue: folder.name, submitLabel: '保存名称' })
    if (name !== null && name !== folder.name) await runAction(() => window.teacherWorkbench.materialLibrary.renameFolder({ folderId: folder.id, name }), '文件夹已重命名。')
  }

  async function requestDelete(folder: MaterialFolder): Promise<void> {
    setContextMenu(null)
    const confirmed = await confirm({ title: '删除文件夹？', description: `将删除文件夹“${folder.name}”。仅空文件夹可以删除。`, confirmLabel: '删除文件夹', destructive: true })
    if (confirmed) await runAction(() => window.teacherWorkbench.materialLibrary.deleteFolder({ folderId: folder.id }), '文件夹已删除。')
  }

  async function moveFolder(request: ReorderMaterialFolderRequest | null): Promise<void> {
    if (request === null) { setError('文件夹不能移动到自身或自己的子文件夹中。'); return }
    const moved = await runAction(() => window.teacherWorkbench.materialLibrary.reorderFolder(request), '文件夹位置已更新。')
    if (moved !== undefined && request.parentId !== null) setExpandedFolderIds((current) => new Set(current).add(request.parentId as string))
  }

  function toggleFolder(folderId: string): void { setExpandedFolderIds((current) => { const next = new Set(current); if (next.has(folderId)) next.delete(folderId); else next.add(folderId); return next }) }
  function startDrag(event: DragEvent<HTMLElement>, material: DraggedMaterial): void { if (busy) { event.preventDefault(); return }; event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', `${material.kind}:${material.id}`); setDraggedMaterial(material); setContextMenu(null) }
  function finishDrag(): void { setDraggedMaterial(null); setDropTarget(null) }

  function dragOverFolder(event: DragEvent<HTMLElement>, folderId: string): void {
    if (draggedMaterial === null) return
    event.preventDefault(); event.stopPropagation()
    const position = draggedMaterial.kind === 'file' ? 'inside' : getFolderDropPosition(event)
    const valid = draggedMaterial.kind === 'file' || buildFolderMoveRequest(folders, draggedMaterial.id, folderId, position) !== null
    event.dataTransfer.dropEffect = valid ? 'move' : 'none'
    setDropTarget(valid ? { kind: 'folder', folderId, position } : null)
  }

  function dropOnFolder(event: DragEvent<HTMLElement>, folderId: string): void {
    event.preventDefault(); event.stopPropagation()
    const material = draggedMaterial
    const position = material?.kind === 'folder' ? getFolderDropPosition(event) : 'inside'
    finishDrag()
    if (material === null) return
    if (material.kind === 'file') { void runAction(() => window.teacherWorkbench.materialLibrary.moveFile({ fileId: material.id, folderId }), '素材已移动到文件夹。'); return }
    void moveFolder(buildFolderMoveRequest(folders, material.id, folderId, position))
  }

  function dragOverSpecial(event: DragEvent<HTMLElement>, target: 'unfiled' | 'root'): void { if (draggedMaterial === null || (target === 'unfiled' && draggedMaterial.kind !== 'file') || (target === 'root' && draggedMaterial.kind !== 'folder')) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; setDropTarget({ kind: target }) }
  function dropOnSpecial(event: DragEvent<HTMLElement>, target: 'unfiled' | 'root'): void {
    event.preventDefault(); event.stopPropagation()
    const material = draggedMaterial
    finishDrag()
    if (material === null) return
    if (target === 'unfiled' && material.kind === 'file') void runAction(() => window.teacherWorkbench.materialLibrary.moveFile({ fileId: material.id, folderId: null }), '素材已移到待整理。')
    if (target === 'root' && material.kind === 'folder') void moveFolder(buildFolderRootMoveRequest(folders, material.id))
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, target: MaterialContextTarget): void { event.preventDefault(); event.stopPropagation(); setContextMenu({ ...target, ...menuPosition(event.clientX, event.clientY) } as MaterialContextMenu) }
  function openButtonMenu(event: MouseEvent<HTMLButtonElement>, target: MaterialContextTarget): void { event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setContextMenu({ ...target, ...menuPosition(rect.right - 220, rect.bottom + 4) } as MaterialContextMenu) }

  if (loading && overview === null) return <section className="workspace-card">正在读取素材库…</section>

  return <div className={`managed-files-panel${compact ? ' is-compact' : ''}`} aria-live="polite">
    {error !== '' && <div className="inline-error" role="alert">{error}</div>}{notice !== '' && <div className="inline-notice" role="status">{notice}</div>}
    <section className="workspace-card"><div className="card-heading"><div><p className="section-kicker">资料管理</p><h2>{heading}</h2></div><div className="file-toolbar"><button className="secondary-button" type="button" onClick={() => void reload()} disabled={busy}>刷新</button><button className="secondary-button" type="button" onClick={() => void requestCreateFolder(activeFolderId)} disabled={busy}>新建文件夹</button><button className="primary-button" type="button" onClick={importFile} disabled={busy}>导入资料</button></div></div>
      {!compact && <div className="file-target-grid"><label className="select-field">复制素材到课次<select aria-label="复制素材到课次" value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)} disabled={busy || lessons.length === 0}><option value="">请选择课次</option>{lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label></div>}
      {compact && <p className="file-context">当前课次：{lessonLabel ?? (activeLessonId === '' ? '未选择' : '已选择')}</p>}
      <p className="material-library-intro">素材库是老师自己维护的逻辑目录。拖动只会调整目录归属，不会移动或覆盖底层文件；已经加入课程或学生的独立副本不会自动出现在这里。外部资料仍然只读。</p>
      <div className="material-library-toolbar"><label className="material-library-search"><span>查找素材</span><input aria-label="查找素材" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="按文件名查找" /></label></div>
      <div className="material-library-layout"><aside className="material-library-tree" aria-label="素材库逻辑目录"><div className="material-library-tree-heading"><strong>素材库目录</strong><small>{standaloneFiles.filter((file) => file.deletedAt === null).length} 项</small></div><nav className="material-library-tree-list"><LibraryButton label="全部素材" active={view === 'all'} count={standaloneFiles.filter((file) => file.deletedAt === null).length} onClick={() => setView('all')} /><LibraryButton label="最近使用" active={view === 'recent'} count={standaloneFiles.filter((file) => file.deletedAt === null).length} onClick={() => setView('recent')} /><LibraryButton label="待整理" active={view === 'unfiled'} count={standaloneFiles.filter((file) => file.deletedAt === null && fileFolder.get(file.id) === null).length} onClick={() => setView('unfiled')} dropActive={dropTarget?.kind === 'unfiled'} onDragOver={(event) => dragOverSpecial(event, 'unfiled')} onDrop={(event) => dropOnSpecial(event, 'unfiled')} /><div className={`material-library-custom-heading${dropTarget?.kind === 'root' ? ' is-drop-target' : ''}`} onContextMenu={(event) => openContextMenu(event, { kind: 'root' })} onDragOver={(event) => dragOverSpecial(event, 'root')} onDrop={(event) => dropOnSpecial(event, 'root')}><span>我的文件夹</span><button className="material-tree-add" type="button" title="新建顶层文件夹" aria-label="新建顶层文件夹" onClick={() => void requestCreateFolder(null)} disabled={busy}>+</button></div>{listMaterialFolderChildren(folders, null).map((folder) => <FolderBranch key={folder.id} folder={folder} folders={folders} fileFolder={fileFolder} view={view} expandedFolderIds={expandedFolderIds} draggedMaterial={draggedMaterial} dropTarget={dropTarget} busy={busy} onSelect={setView} onToggle={toggleFolder} onContextMenu={openContextMenu} onButtonMenu={openButtonMenu} onDragStart={startDrag} onDragEnd={finishDrag} onDragOver={dragOverFolder} onDrop={dropOnFolder} />)}</nav></aside>
        <section className="material-library-results"><div className="material-library-results-heading"><strong>{view === 'all' ? '素材库 / 全部素材' : view === 'recent' ? '素材库 / 最近使用' : view === 'unfiled' ? '素材库 / 待整理' : `素材库 / ${activeFolder === null ? '文件夹' : materialFolderPath(folders, activeFolder.id)}`}</strong><span>{visibleFiles.length} 项</span></div><div className="material-type-filter" role="group" aria-label="类型筛选">{(['all', 'documents', 'images', 'other'] as const).map((filter) => <button key={filter} className={typeFilter === filter ? 'is-active' : ''} type="button" onClick={() => setTypeFilter(filter)}>{filter === 'all' ? '全部类型' : filter === 'documents' ? '文档' : filter === 'images' ? '图片' : '其他'}</button>)}</div><FileList files={visibleFiles} busy={busy} lessonId={activeLessonId} onAction={runAction} onContextMenu={openContextMenu} onDragStart={startDrag} onDragEnd={finishDrag} draggedMaterial={draggedMaterial} />{removedFiles.length > 0 && <details className="deleted-files"><summary>已移除素材（{removedFiles.length}）</summary><ul className="file-list">{removedFiles.map((file) => <li className="file-row is-deleted" key={file.id}><FileSummary file={file} /><button className="link-button" type="button" onClick={() => void runAction(() => window.teacherWorkbench.files.restoreFile({ fileId: file.id }), '素材已恢复。')} disabled={busy}>恢复</button></li>)}</ul></details>}</section></div>
    </section>
    {contextMenu !== null && <div className="material-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
      {contextMenu.kind === 'root' && <button type="button" role="menuitem" onClick={() => void requestCreateFolder(null)}>新建顶层文件夹</button>}
      {contextFolder !== null && <><button type="button" role="menuitem" onClick={() => void requestCreateFolder(contextFolder.id)}>新建子文件夹</button><button type="button" role="menuitem" onClick={() => void requestRename(contextFolder)}>重命名</button>{contextFolder.parentId !== null && <button type="button" role="menuitem" onClick={() => { setContextMenu(null); void moveFolder(buildFolderRootMoveRequest(folders, contextFolder.id)) }}>移到顶层</button>}<span className="material-context-separator" /><button className="is-danger" type="button" role="menuitem" onClick={() => void requestDelete(contextFolder)}>删除文件夹</button></>}
      {contextFile !== null && <><button type="button" role="menuitem" onClick={() => { setContextMenu(null); void runAction(() => window.teacherWorkbench.files.openFile({ fileId: contextFile.id })) }}>打开</button><button type="button" role="menuitem" onClick={() => { setContextMenu(null); void runAction(() => window.teacherWorkbench.files.showFileInFolder({ fileId: contextFile.id })) }}>在资源管理器中显示</button><button type="button" role="menuitem" disabled={activeLessonId === ''} onClick={() => { setContextMenu(null); void runAction(() => window.teacherWorkbench.files.copyToLesson({ fileId: contextFile.id, lessonId: activeLessonId }), '素材已复制到指定课次。') }}>复制到当前课次</button><span className="material-context-label">移动到</span><button type="button" role="menuitem" disabled={fileFolder.get(contextFile.id) === null} onClick={() => { setContextMenu(null); void runAction(() => window.teacherWorkbench.materialLibrary.moveFile({ fileId: contextFile.id, folderId: null }), '素材已移到待整理。') }}>待整理</button><div className="material-context-folder-list">{folderOptions.map(({ folder, path }) => <button key={folder.id} type="button" role="menuitem" title={path} disabled={fileFolder.get(contextFile.id) === folder.id} onClick={() => { setContextMenu(null); void runAction(() => window.teacherWorkbench.materialLibrary.moveFile({ fileId: contextFile.id, folderId: folder.id }), `素材已移动到「${path}」。`) }}>{path}</button>)}</div><span className="material-context-separator" /><button className="is-danger" type="button" role="menuitem" onClick={() => { setContextMenu(null); void runAction(() => window.teacherWorkbench.files.softDeleteFile({ fileId: contextFile.id }), '素材已移除。') }}>移除素材</button></>}
    </div>}
  </div>
}

interface FolderBranchProps {
  readonly folder: MaterialFolder
  readonly folders: readonly MaterialFolder[]
  readonly fileFolder: ReadonlyMap<string, string | null>
  readonly view: LibraryView
  readonly expandedFolderIds: ReadonlySet<string>
  readonly draggedMaterial: DraggedMaterial | null
  readonly dropTarget: MaterialDropTarget
  readonly busy: boolean
  readonly onSelect: (view: LibraryView) => void
  readonly onToggle: (folderId: string) => void
  readonly onContextMenu: (event: MouseEvent<HTMLElement>, target: MaterialContextTarget) => void
  readonly onButtonMenu: (event: MouseEvent<HTMLButtonElement>, target: MaterialContextTarget) => void
  readonly onDragStart: (event: DragEvent<HTMLElement>, material: DraggedMaterial) => void
  readonly onDragEnd: () => void
  readonly onDragOver: (event: DragEvent<HTMLElement>, folderId: string) => void
  readonly onDrop: (event: DragEvent<HTMLElement>, folderId: string) => void
}

function FolderBranch(props: FolderBranchProps): React.JSX.Element {
  const { folder, folders, fileFolder, view, expandedFolderIds, draggedMaterial, dropTarget, busy, onSelect, onToggle, onContextMenu, onButtonMenu, onDragStart, onDragEnd, onDragOver, onDrop } = props
  const children = listMaterialFolderChildren(folders, folder.id)
  const count = [...fileFolder.values()].filter((id) => id === folder.id).length
  const expanded = expandedFolderIds.has(folder.id)
  const targetPosition = dropTarget?.kind === 'folder' && dropTarget.folderId === folder.id ? dropTarget.position : null
  const rowClass = ['material-library-tree-row', 'is-folder-row', view === `folder:${folder.id}` ? 'is-selected' : '', draggedMaterial?.kind === 'folder' && draggedMaterial.id === folder.id ? 'is-dragging' : '', targetPosition === null ? '' : `is-drop-${targetPosition}`].filter(Boolean).join(' ')
  return <div className="material-folder-branch">
    <div className={rowClass} draggable={!busy} onDragStart={(event) => onDragStart(event, { kind: 'folder', id: folder.id })} onDragEnd={onDragEnd} onDragOver={(event) => onDragOver(event, folder.id)} onDrop={(event) => onDrop(event, folder.id)} onContextMenu={(event) => onContextMenu(event, { kind: 'folder', folderId: folder.id })} onDoubleClick={() => { if (children.length > 0) onToggle(folder.id) }}>
      <button className="material-folder-toggle" type="button" aria-label={children.length === 0 ? '没有子文件夹' : expanded ? `收起 ${folder.name}` : `展开 ${folder.name}`} aria-expanded={children.length === 0 ? undefined : expanded} disabled={children.length === 0} onClick={(event) => { event.stopPropagation(); onToggle(folder.id) }}><span aria-hidden="true">{children.length === 0 ? '' : expanded ? '▾' : '▸'}</span></button>
      <button className="material-folder-select" type="button" onClick={() => onSelect(`folder:${folder.id}`)}><span title={folder.name}>{folder.name}</span><small>{count}</small></button>
      <button className="folder-more" type="button" title="文件夹操作" aria-label={`操作文件夹 ${folder.name}`} onClick={(event) => onButtonMenu(event, { kind: 'folder', folderId: folder.id })}>⋯</button>
    </div>
    {expanded && children.length > 0 && <div className="material-folder-children">{children.map((child) => <FolderBranch key={child.id} {...props} folder={child} />)}</div>}
  </div>
}

interface LibraryButtonProps { readonly label: string; readonly count: number; readonly active: boolean; readonly onClick: () => void; readonly dropActive?: boolean; readonly onDragOver?: (event: DragEvent<HTMLButtonElement>) => void; readonly onDrop?: (event: DragEvent<HTMLButtonElement>) => void }
function LibraryButton({ label, count, active, onClick, dropActive = false, onDragOver, onDrop }: LibraryButtonProps): React.JSX.Element { return <button className={`material-library-tree-row${active ? ' is-selected' : ''}${dropActive ? ' is-drop-inside' : ''}`} type="button" aria-current={active ? 'page' : undefined} onClick={onClick} onDragOver={onDragOver} onDrop={onDrop}><span className="material-library-tree-icon">{active ? '●' : '○'}</span><span>{label}</span><small>{count}</small></button> }

interface FileListProps { readonly files: readonly ManagedFileRecord[]; readonly busy: boolean; readonly lessonId: string; readonly onAction: <T>(action: () => Promise<T>, successMessage?: string) => Promise<T | undefined>; readonly onContextMenu: (event: MouseEvent<HTMLElement>, target: MaterialContextTarget) => void; readonly onDragStart: (event: DragEvent<HTMLElement>, material: DraggedMaterial) => void; readonly onDragEnd: () => void; readonly draggedMaterial: DraggedMaterial | null }
function FileList({ files, busy, lessonId, onAction, onContextMenu, onDragStart, onDragEnd, draggedMaterial }: FileListProps): React.JSX.Element { return <ul className="file-list">{files.map((file) => <li className={`file-row is-draggable${draggedMaterial?.kind === 'file' && draggedMaterial.id === file.id ? ' is-dragging' : ''}`} key={file.id} draggable={!busy} onDragStart={(event) => onDragStart(event, { kind: 'file', id: file.id })} onDragEnd={onDragEnd} onContextMenu={(event) => onContextMenu(event, { kind: 'file', fileId: file.id })}><FileSummary file={file} /><div className="file-actions"><button className="link-button" type="button" draggable={false} onClick={() => void onAction(() => window.teacherWorkbench.files.openFile({ fileId: file.id }))} disabled={busy}>打开</button><button className="link-button" type="button" draggable={false} onClick={() => void onAction(() => window.teacherWorkbench.files.showFileInFolder({ fileId: file.id }))} disabled={busy}>所在文件夹</button><button className="link-button" type="button" draggable={false} onClick={() => void onAction(() => window.teacherWorkbench.files.copyToLesson({ fileId: file.id, lessonId }), '素材已复制到指定课次。')} disabled={busy || lessonId === ''}>复制到课次</button><button className="danger-button" type="button" draggable={false} onClick={() => void onAction(() => window.teacherWorkbench.files.softDeleteFile({ fileId: file.id }), '素材已移除。')} disabled={busy}>移除</button></div></li>)}{files.length === 0 && <li className="empty-state">这里还没有符合条件的素材。</li>}</ul> }
function FileSummary({ file }: { readonly file: ManagedFileRecord }): React.JSX.Element { const kind = materialKind(file); return <div className="file-summary"><strong title={file.originalName}>{file.originalName}</strong><small>{formatBytes(file.sizeBytes)} · {kind === 'documents' ? '文档' : kind === 'images' ? '图片' : '其他'} · {file.originFileId === null ? '素材原件' : '保存自副本'}</small></div> }
function getFolderDropPosition(event: DragEvent<HTMLElement>): FolderDropPosition { const rect = event.currentTarget.getBoundingClientRect(); const ratio = rect.height === 0 ? 0.5 : (event.clientY - rect.top) / rect.height; return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside' }
function menuPosition(x: number, y: number): { readonly x: number; readonly y: number } { return { x: Math.max(8, Math.min(x, window.innerWidth - 252)), y: Math.max(8, Math.min(y, window.innerHeight - 360)) } }
