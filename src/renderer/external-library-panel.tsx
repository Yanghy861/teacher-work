import { useEffect, useState } from 'react'

import type {
  ExternalEntry,
  ExternalRootSummary,
} from '../shared/external-library-contracts'

type EntryMap = Record<string, readonly ExternalEntry[]>

export default function ExternalLibraryPanel(): React.JSX.Element {
  const [root, setRoot] = useState<ExternalRootSummary | null>(null)
  const [entriesByFolder, setEntriesByFolder] = useState<EntryMap>({})
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [selectedEntry, setSelectedEntry] = useState<ExternalEntry | null>(null)
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    void loadConfiguredRoot()
  }, [])

  async function loadConfiguredRoot(): Promise<void> {
    setLoading(true)
    setError('')
    try {
      const nextRoot = await window.teacherWorkbench.externalLibrary.getRoot()
      setRoot(nextRoot)
      setEntriesByFolder({})
      setExpandedFolders(new Set())
      setSelectedEntry(null)
      if (nextRoot?.available) {
        const listing = await window.teacherWorkbench.externalLibrary.listChildren({
          rootId: nextRoot.id,
          relativePath: '',
        })
        setEntriesByFolder({ '': listing.entries })
      }
    } catch (loadError) {
      setError(toErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }

  async function chooseRoot(): Promise<void> {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const selectedRoot = await window.teacherWorkbench.externalLibrary.chooseRoot()
      if (selectedRoot === null) {
        setNotice('已取消选择。')
        return
      }
      const listing = await window.teacherWorkbench.externalLibrary.listChildren({
        rootId: selectedRoot.id,
        relativePath: '',
      })
      setRoot(selectedRoot)
      setEntriesByFolder({ '': listing.entries })
      setExpandedFolders(new Set())
      setSelectedEntry(null)
      setNotice(`已连接「${selectedRoot.name}」。`)
    } catch (chooseError) {
      setError(toErrorMessage(chooseError))
    } finally {
      setBusy(false)
    }
  }

  async function toggleFolder(entry: ExternalEntry): Promise<void> {
    setSelectedEntry(entry)
    if (expandedFolders.has(entry.relativePath)) {
      setExpandedFolders((current) => {
        const next = new Set(current)
        next.delete(entry.relativePath)
        return next
      })
      return
    }

    setBusy(true)
    setError('')
    try {
      let children = entriesByFolder[entry.relativePath]
      if (children === undefined) {
        const listing = await window.teacherWorkbench.externalLibrary.listChildren({
          rootId: entry.rootId,
          relativePath: entry.relativePath,
        })
        children = listing.entries
        setEntriesByFolder((current) => ({
          ...current,
          [entry.relativePath]: listing.entries,
        }))
      }
      setExpandedFolders((current) => new Set(current).add(entry.relativePath))
    } catch (folderError) {
      setError(toErrorMessage(folderError))
    } finally {
      setBusy(false)
    }
  }

  async function refreshTree(): Promise<void> {
    if (root === null) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const latestRoot = await window.teacherWorkbench.externalLibrary.getRoot()
      if (latestRoot === null || latestRoot.id !== root.id) {
        await loadConfiguredRoot()
        setNotice('外部资料目录已经更改，资料树已重新载入。')
        return
      }
      if (!latestRoot.available) {
        setRoot(latestRoot)
        setEntriesByFolder({})
        setExpandedFolders(new Set())
        setSelectedEntry(null)
        setError('外部资料目录不可用，请重新选择。')
        return
      }

      const visibleFolders = ['', ...expandedFolders]
      const nextEntries: EntryMap = {}
      const nextExpanded = new Set(expandedFolders)
      for (const folderPath of visibleFolders) {
        try {
          const listing = await window.teacherWorkbench.externalLibrary.listChildren({
            rootId: latestRoot.id,
            relativePath: folderPath,
          })
          nextEntries[folderPath] = listing.entries
        } catch (refreshError) {
          if (folderPath === '') throw refreshError
          nextExpanded.delete(folderPath)
        }
      }
      setRoot(latestRoot)
      setEntriesByFolder(nextEntries)
      setExpandedFolders(nextExpanded)
      if (selectedEntry !== null && !entryStillExists(nextEntries, selectedEntry.relativePath)) {
        setSelectedEntry(null)
      }
      setNotice('资料树已刷新。')
    } catch (refreshError) {
      setError(toErrorMessage(refreshError))
    } finally {
      setBusy(false)
    }
  }

  async function runFileAction(
    action: () => Promise<unknown>,
    successMessage: string,
  ): Promise<void> {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(successMessage)
    } catch (actionError) {
      setError(toErrorMessage(actionError))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <section className="workspace-card external-library-loading">正在读取外部资料设置…</section>
  }

  if (root === null) {
    return (
      <section className="workspace-card external-library-empty" aria-live="polite">
        {error !== '' && <div className="inline-error" role="alert">{error}</div>}
        {notice !== '' && <div className="inline-notice" role="status">{notice}</div>}
        <div className="placeholder-icon" aria-hidden="true">▤</div>
        <h2>选择你的外部资料目录</h2>
        <p>工作台只按需浏览这个文件夹，不会扫描整台电脑，也不会修改其中的原文件。</p>
        <button className="primary-button" type="button" onClick={() => void chooseRoot()} disabled={busy}>
          选择资料目录
        </button>
      </section>
    )
  }

  if (!root.available) {
    return (
      <section className="workspace-card external-library-empty" aria-live="polite">
        <div className="inline-error" role="alert">外部资料目录「{root.name}」当前不可用。</div>
        <p>目录可能已经移动、断开或没有读取权限，请重新选择。</p>
        <button className="primary-button" type="button" onClick={() => void chooseRoot()} disabled={busy}>
          重新选择目录
        </button>
      </section>
    )
  }

  return (
    <section className="external-library-panel" aria-label="外部资料">
      {error !== '' && <div className="inline-error" role="alert">{error}</div>}
      {notice !== '' && <div className="inline-notice" role="status">{notice}</div>}
      <div className={`external-library-layout${treeCollapsed ? ' is-tree-collapsed' : ''}`}>
        {!treeCollapsed && (
          <aside className="external-tree-panel" aria-label="外部资料树">
            <div className="external-panel-heading">
              <div>
                <p className="section-kicker">只读资料</p>
                <h2>{root.name}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="隐藏资料树"
                title="隐藏资料树"
                onClick={() => setTreeCollapsed(true)}
              >
                ‹
              </button>
            </div>
            <div className="external-tree-toolbar">
              <button className="link-button" type="button" onClick={() => void refreshTree()} disabled={busy}>
                {busy ? '读取中…' : '刷新'}
              </button>
              <button className="link-button" type="button" onClick={() => void chooseRoot()} disabled={busy}>
                更改目录
              </button>
            </div>
            <ExternalTreeBranch
              parentPath=""
              depth={0}
              entriesByFolder={entriesByFolder}
              expandedFolders={expandedFolders}
              selectedPath={selectedEntry?.relativePath ?? ''}
              busy={busy}
              onSelect={setSelectedEntry}
              onToggleFolder={toggleFolder}
            />
          </aside>
        )}

        <article className="external-content-panel">
          <div className="external-content-toolbar">
            {treeCollapsed && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => setTreeCollapsed(false)}
              >
                打开资料树
              </button>
            )}
            <span className="selection-label">外部资料只读</span>
          </div>
          {selectedEntry === null ? (
            <div className="external-content-placeholder">
              <div className="placeholder-icon" aria-hidden="true">⌁</div>
              <h2>从资料树选择文件</h2>
              <p>文件夹按需展开；选择文件后可查看信息、打开文件或显示所在位置。</p>
            </div>
          ) : (
            <ExternalEntryDetails
              entry={selectedEntry}
              busy={busy}
              onOpen={() => runFileAction(
                () => window.teacherWorkbench.externalLibrary.openFile({
                  rootId: selectedEntry.rootId,
                  relativePath: selectedEntry.relativePath,
                }),
                '已交给系统应用打开。',
              )}
              onShowInFolder={() => runFileAction(
                () => window.teacherWorkbench.externalLibrary.showInFolder({
                  rootId: selectedEntry.rootId,
                  relativePath: selectedEntry.relativePath,
                }),
                '已在资源管理器中定位。',
              )}
            />
          )}
        </article>
      </div>
    </section>
  )
}

function ExternalTreeBranch({
  parentPath,
  depth,
  entriesByFolder,
  expandedFolders,
  selectedPath,
  busy,
  onSelect,
  onToggleFolder,
}: {
  readonly parentPath: string
  readonly depth: number
  readonly entriesByFolder: EntryMap
  readonly expandedFolders: ReadonlySet<string>
  readonly selectedPath: string
  readonly busy: boolean
  readonly onSelect: (entry: ExternalEntry) => void
  readonly onToggleFolder: (entry: ExternalEntry) => Promise<void>
}): React.JSX.Element {
  const entries = entriesByFolder[parentPath] ?? []
  if (entries.length === 0) {
    return <p className="external-tree-empty" style={{ paddingLeft: `${12 + depth * 16}px` }}>空文件夹</p>
  }

  return (
    <ul className="external-tree-list">
      {entries.map((entry) => {
        const expanded = entry.kind === 'folder' && expandedFolders.has(entry.relativePath)
        return (
          <li key={entry.relativePath}>
            <button
              className={`external-tree-row${selectedPath === entry.relativePath ? ' is-selected' : ''}`}
              style={{ paddingLeft: `${12 + depth * 16}px` }}
              type="button"
              aria-expanded={entry.kind === 'folder' ? expanded : undefined}
              disabled={busy}
              onClick={() => entry.kind === 'folder'
                ? void onToggleFolder(entry)
                : onSelect(entry)}
            >
              <span className="external-tree-chevron" aria-hidden="true">
                {entry.kind === 'folder' ? (expanded ? '⌄' : '›') : ''}
              </span>
              <span className="external-tree-icon" aria-hidden="true">
                {entry.kind === 'folder' ? '▰' : fileIcon(entry.extension)}
              </span>
              <span className="external-tree-name">{entry.name}</span>
            </button>
            {expanded && (
              <ExternalTreeBranch
                parentPath={entry.relativePath}
                depth={depth + 1}
                entriesByFolder={entriesByFolder}
                expandedFolders={expandedFolders}
                selectedPath={selectedPath}
                busy={busy}
                onSelect={onSelect}
                onToggleFolder={onToggleFolder}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function ExternalEntryDetails({
  entry,
  busy,
  onOpen,
  onShowInFolder,
}: {
  readonly entry: ExternalEntry
  readonly busy: boolean
  readonly onOpen: () => Promise<void>
  readonly onShowInFolder: () => Promise<void>
}): React.JSX.Element {
  const isFile = entry.kind === 'file'
  return (
    <div className="external-entry-details">
      <p className="external-breadcrumb">{formatBreadcrumb(entry.relativePath)}</p>
      <div className="external-entry-title">
        <span className="external-entry-large-icon" aria-hidden="true">
          {entry.kind === 'folder' ? '▰' : fileIcon(entry.extension)}
        </span>
        <div>
          <p className="section-kicker">{isFile ? '文件信息' : '文件夹信息'}</p>
          <h2>{entry.name}</h2>
        </div>
      </div>
      <dl className="external-metadata">
        <div><dt>类型</dt><dd>{formatFileType(entry)}</dd></div>
        <div><dt>大小</dt><dd>{entry.sizeBytes === null ? '—' : formatBytes(entry.sizeBytes)}</dd></div>
        <div><dt>修改时间</dt><dd>{formatModifiedAt(entry.modifiedAt)}</dd></div>
      </dl>
      {isFile ? (
        <>
          <div className="file-toolbar external-entry-actions">
            <button className="primary-button" type="button" onClick={() => void onOpen()} disabled={busy}>
              打开文件
            </button>
            <button className="secondary-button" type="button" onClick={() => void onShowInFolder()} disabled={busy}>
              所在文件夹
            </button>
          </div>
          <div className="external-preview-note">
            <strong>使用系统应用查看内容</strong>
            <p>V1.1 不模拟 Word、PowerPoint 或 PDF 的高保真显示，避免生成与原文件不一致的预览。</p>
          </div>
        </>
      ) : (
        <div className="external-preview-note">
          <strong>点击文件夹可展开或收起</strong>
          <p>目录内容按需读取，不会在后台递归扫描整个资料库。</p>
        </div>
      )}
    </div>
  )
}

function entryStillExists(entriesByFolder: EntryMap, relativePath: string): boolean {
  return Object.values(entriesByFolder).some((entries) =>
    entries.some((entry) => entry.relativePath === relativePath),
  )
}

function formatBreadcrumb(relativePath: string): string {
  return ['外部资料', ...relativePath.split(/[\\/]+/)].join(' / ')
}

function fileIcon(extension: string | null): string {
  if (extension === '.pdf') return 'P'
  if (extension === '.doc' || extension === '.docx') return 'W'
  if (extension === '.ppt' || extension === '.pptx') return 'S'
  if (extension === '.xls' || extension === '.xlsx') return 'X'
  if (extension === '.md') return 'M'
  return 'F'
}

function formatFileType(entry: ExternalEntry): string {
  if (entry.kind === 'folder') return '文件夹'
  return entry.extension === null ? '普通文件' : `${entry.extension.slice(1).toUpperCase()} 文件`
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatModifiedAt(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== ''
    ? error.message
    : '外部资料操作失败，请稍后重试。'
}
