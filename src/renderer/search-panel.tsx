import { useEffect, useRef, useState } from 'react'

import type { SearchHit, SearchIndexStatusSummary } from '../shared/preload-api'

const emptyStatus: SearchIndexStatusSummary = {
  total: 0,
  pending: 0,
  indexed: 0,
  noText: 0,
  parseFailed: 0,
  updatedAt: '',
}

export default function SearchPanel(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly SearchHit[]>([])
  const [status, setStatus] = useState(emptyStatus)
  const [message, setMessage] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isRebuilding, setIsRebuilding] = useState(false)
  const requestSequence = useRef(0)

  useEffect(() => {
    void window.teacherWorkbench.search.getStatus().then(setStatus).catch(() => undefined)
  }, [])

  async function runSearch(event?: React.FormEvent): Promise<void> {
    event?.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setMessage('请输入搜索内容。')
      return
    }
    const sequence = ++requestSequence.current
    setIsSearching(true)
    setMessage('')
    try {
      const nextResults = await window.teacherWorkbench.search.query({ text: trimmed, limit: 100 })
      if (sequence === requestSequence.current) {
        setResults(nextResults)
      }
    } catch (error) {
      if (sequence === requestSequence.current) {
        setMessage(error instanceof Error ? error.message : '搜索失败，请稍后重试。')
      }
    } finally {
      if (sequence === requestSequence.current) {
        setIsSearching(false)
      }
    }
  }

  async function rebuild(): Promise<void> {
    setIsRebuilding(true)
    setMessage('正在重建搜索索引，已完成内容仍可继续使用。')
    try {
      const result = await window.teacherWorkbench.search.rebuild()
      setStatus(result.status)
      setMessage(`索引重建完成：处理 ${result.queuedFiles} 个文件，失败 ${result.failedFiles} 个。`)
      if (query.trim()) {
        await runSearch()
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '索引重建失败，请稍后重试。')
    } finally {
      setIsRebuilding(false)
    }
  }

  async function openFile(fileId: string): Promise<void> {
    try {
      await window.teacherWorkbench.files.openFile({ fileId })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法打开资料。')
    }
  }

  return (
    <section className="search-panel" aria-label="搜索资料">
      <div className="workspace-card search-hero">
        <div>
          <p className="section-kicker">找资料</p>
          <h2>搜索课程、记录和资料正文</h2>
          <p>已完成的索引可以立即搜索，后台准备中的文件会显示当前状态。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void rebuild()} disabled={isRebuilding}>
          {isRebuilding ? '重建中…' : '重建搜索索引'}
        </button>
      </div>

      <div className="workspace-card">
        <form className="search-form" onSubmit={(event) => void runSearch(event)}>
          <label htmlFor="global-search">搜索内容</label>
          <div className="search-input-row">
            <input
              id="global-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例如：有理数、x²、课堂记录"
              autoComplete="off"
            />
            <button className="primary-button" type="submit" disabled={isSearching}>
              {isSearching ? '搜索中…' : '搜索'}
            </button>
          </div>
        </form>

        <div className="index-status-grid" aria-label="索引状态">
          <StatusItem label="可用" value={status.indexed} tone="ready" />
          <StatusItem label="准备中" value={status.pending} tone="pending" />
          <StatusItem label="无文本" value={status.noText} tone="muted" />
          <StatusItem label="失败" value={status.parseFailed} tone="failed" />
        </div>

        {message && <p className="inline-notice" role="status">{message}</p>}

        <div className="search-results-heading">
          <h2>搜索结果</h2>
          <span className="count-label">{results.length} 条</span>
        </div>
        {results.length === 0 ? (
          <p className="empty-state">输入关键词后，结果会显示在这里。</p>
        ) : (
          <ol className="search-results">
            {results.map((hit, index) => (
              <li className="search-result" key={`${hit.sourceType}-${hit.sourceId}-${hit.source}-${index}`}>
                <div className="search-result-main">
                  <div className="search-result-title">
                    <strong>{hit.title}</strong>
                    <span className={`result-source result-source-${hit.source}`}>{sourceLabel(hit.source)}</span>
                  </div>
                  {hit.path && <small>{hit.path}</small>}
                  <p>{hit.snippet}</p>
                  <div className="search-result-meta">
                    {hit.position && <span>{positionLabel(hit.position.type, hit.position.value)}</span>}
                    {hit.indexStatus && <span>{indexStatusLabel(hit.indexStatus)}</span>}
                  </div>
                </div>
                {hit.fileId ? (
                  <button className="link-button" type="button" onClick={() => void openFile(hit.fileId!)}>
                    打开资料
                  </button>
                ) : (
                  <span className="search-result-kind">{hit.sourceType === 'note' ? '记录' : '课程节点'}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function StatusItem({ label, value, tone }: { label: string; value: number; tone: string }): React.JSX.Element {
  return <div className={`index-status-item index-status-${tone}`}><strong>{value}</strong><span>{label}</span></div>
}

function sourceLabel(source: SearchHit['source']): string {
  return source === 'body-fts' ? '正文' : source === 'short-word' ? '短词' : source === 'exact-title' ? '标题' : '文件名'
}

function indexStatusLabel(status: NonNullable<SearchHit['indexStatus']>): string {
  return status === 'indexed' ? '可用' : status === 'pending' ? '准备中' : status === 'no_text' ? '无文本' : '解析失败'
}

function positionLabel(type: string, value: string | number | undefined): string {
  const labels: Record<string, string> = { page: '页', slide: '幻灯片', sheet: '工作表', heading: '标题', line: '行' }
  return `${labels[type] ?? type}${value === undefined ? '' : ` ${value}`}`
}
