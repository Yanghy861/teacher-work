import { useEffect, useMemo, useState, type ReactNode } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

import type { ManagedFileContent, ManagedFileRecord } from '../shared/file-contracts'
import {
  buildLessonMaterialTree,
  isSelectableLessonPrepFile,
  type LessonMaterialTreeNode,
} from './lesson-prep-context'
import { normalizeMarkdownImageReferences, normalizeRichText } from './rich-text'
import { isMineruEnhanceableFile } from './managed-files-panel'
import { formatBytes, toErrorMessage } from './ui-utils'

export default function LessonMaterialReader({
  files,
  selectedFileId,
  onSelectFile,
  onOpenFile,
  onShowInFolder,
  onRemoveFile,
  onEnhanceFile,
  mineruTokenConfigured = false,
  mineruBusy = false,
  mineruStatus,
  hideTree = false,
  treeTitle = '本课资料',
}: {
  readonly files: readonly ManagedFileRecord[]
  readonly selectedFileId: string
  readonly onSelectFile: (fileId: string) => void
  readonly onOpenFile?: (fileId: string) => void
  readonly onShowInFolder?: (fileId: string) => void
  readonly onRemoveFile?: (fileId: string) => void
  readonly onEnhanceFile?: (fileId: string) => void
  readonly mineruTokenConfigured?: boolean
  readonly mineruBusy?: boolean
  readonly mineruStatus?: { readonly state: 'queued' | 'running' | 'done' | 'failed'; readonly message?: string } | null
  readonly hideTree?: boolean
  readonly treeTitle?: string
}): React.JSX.Element {
  const selectedFile = files.find((file) => file.id === selectedFileId) ?? null
  const preferredFile = useMemo(() => choosePreferredFile(files), [files])
  const [content, setContent] = useState<ManagedFileContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (selectedFile !== null) return
    if (preferredFile !== undefined && preferredFile.id !== selectedFileId) {
      onSelectFile(preferredFile.id)
    }
  }, [onSelectFile, preferredFile, selectedFile, selectedFileId])

  useEffect(() => {
    if (selectedFile === null) {
      setContent(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    void window.teacherWorkbench.files.readContent({ fileId: selectedFile.id })
      .then((nextContent) => {
        if (!cancelled) setContent(nextContent)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setContent(null)
          setError(toErrorMessage(loadError, '资料正文读取失败，请稍后重试。'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedFile?.id])

  return (
    <div className={`material-reader${hideTree ? ' is-single' : ''}`}>
      {!hideTree && (
        <aside className="material-reader-tree" aria-label="本课资料目录">
          <LessonMaterialTree
            files={files}
            selectedFileId={selectedFileId}
            onSelectFile={onSelectFile}
            treeTitle={treeTitle}
          />
        </aside>
      )}
      <section className="material-reader-document" aria-label="资料正文">
        <header className="material-reader-document-header">
          <div>
            <span className="section-kicker">可读资料</span>
            <h3>{selectedFile === null ? '请选择一份资料' : displayFileName(selectedFile.originalName)}</h3>
            {selectedFile !== null && <small>{selectedFile.originalName} · {formatBytes(selectedFile.sizeBytes)}</small>}
          </div>
          {selectedFile !== null && (onOpenFile !== undefined || onShowInFolder !== undefined) && (
            <div className="material-reader-actions">
              {onOpenFile !== undefined && <button className="link-button" type="button" onClick={() => onOpenFile(selectedFile.id)}>系统打开</button>}
              {onShowInFolder !== undefined && <button className="link-button" type="button" onClick={() => onShowInFolder(selectedFile.id)}>所在文件夹</button>}
              {onEnhanceFile !== undefined && isMineruEnhanceableFile(selectedFile) && mineruStatus?.state !== 'done' && (
                <button
                  className="link-button"
                  type="button"
                  disabled={!mineruTokenConfigured || mineruBusy || mineruStatus?.state === 'running' || mineruStatus?.state === 'queued'}
                  title={!mineruTokenConfigured
                    ? '扫描件增强解析需先在设置中配置 MinerU token（会配置后此处即可点击）'
                    : mineruBusy || mineruStatus?.state === 'running' || mineruStatus?.state === 'queued'
                      ? '增强解析进行中'
                      : '上传到 MinerU 云端解析，公式转 LaTeX、扫描件识别'}
                  onClick={() => onEnhanceFile(selectedFile.id)}
                >
                  {!mineruTokenConfigured
                    ? '增强解析（需配置 token）'
                    : mineruBusy || mineruStatus?.state === 'running' || mineruStatus?.state === 'queued'
                      ? '增强解析中…'
                      : '增强解析'}
                </button>
              )}
              {onRemoveFile !== undefined && <button className="danger-button" type="button" onClick={() => onRemoveFile(selectedFile.id)}>从本课移除</button>}
            </div>
          )}
        </header>
        <div className="material-reader-scroll">
          {loading && <div className="material-reader-state">正在打开资料…</div>}
          {!loading && error !== '' && <div className="inline-error" role="alert">{error}</div>}
          {!loading && error === '' && selectedFile === null && <div className="material-reader-state">从左侧选择一份 Markdown、图片或其他资料。</div>}
          {!loading && error === '' && content?.kind === 'text' && <MarkdownDocument body={content.content} files={files} />}
          {!loading && error === '' && content?.kind === 'image' && (
            <div className="material-image-preview"><img src={content.dataUrl} alt={selectedFile?.originalName ?? '资料图片'} /></div>
          )}
          {!loading && error === '' && content?.kind === 'unsupported' && (
            <div className="material-reader-state">
              <p>{content.message}</p>
              {selectedFile !== null && onOpenFile !== undefined && <button className="primary-button" type="button" onClick={() => onOpenFile(selectedFile.id)}>用系统应用打开</button>}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export function LessonMaterialTree({
  files,
  selectedFileId,
  onSelectFile,
  selectedFileIds = [],
  onToggleFile,
  treeTitle = '本课资料',
  showHeading = true,
}: {
  readonly files: readonly ManagedFileRecord[]
  readonly selectedFileId: string
  readonly onSelectFile: (fileId: string) => void
  readonly selectedFileIds?: readonly string[]
  readonly onToggleFile?: (fileId: string) => void
  readonly treeTitle?: string
  readonly showHeading?: boolean
}): React.JSX.Element {
  const markdownFiles = useMemo(
    () => files.filter((file) => file.mimeType === 'text/markdown'),
    [files],
  )
  const markdownSnapshot = markdownFiles
    .map((file) => `${file.id}:${file.contentHash ?? ''}`)
    .join('|')
  const [markdownBodies, setMarkdownBodies] = useState<ReadonlyMap<string, string>>(new Map())
  const [expandedFileIds, setExpandedFileIds] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    if (markdownFiles.length === 0) {
      setMarkdownBodies(new Map())
      return () => { cancelled = true }
    }
    void Promise.all(markdownFiles.map(async (file) => {
      try {
        const content = await window.teacherWorkbench.files.readContent({ fileId: file.id })
        return content.kind === 'text' ? [file.id, content.content] as const : null
      } catch {
        return null
      }
    })).then((entries) => {
      if (cancelled) return
      setMarkdownBodies(new Map(entries.filter((entry): entry is readonly [string, string] => entry !== null)))
    })
    return () => { cancelled = true }
  }, [markdownSnapshot])

  const nodes = useMemo(
    () => buildLessonMaterialTree(files, markdownBodies),
    [files, markdownBodies],
  )
  const treeSnapshot = nodes.map((node) => `${node.file.id}:${node.children.map((child) => child.id).join(',')}`).join('|')

  useEffect(() => {
    setExpandedFileIds((current) => {
      const expandableIds = new Set(
        nodes.filter((node) => node.children.length > 0).map((node) => node.file.id),
      )
      return new Set([...current].filter((fileId) => expandableIds.has(fileId)))
    })
  }, [treeSnapshot])

  function toggleExpanded(fileId: string): void {
    setExpandedFileIds((current) => {
      const next = new Set(current)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }

  return (
    <div className="material-reader-tree-content">
      {showHeading && (
        <div className="material-reader-tree-heading">
          <span className="material-reader-folder-icon" aria-hidden="true">▾</span>
          <strong>{treeTitle}</strong>
          <small>{files.length} 项</small>
        </div>
      )}
      <ul className="material-reader-tree-list">
        {nodes.map((node) => (
          <MaterialTreeNodeRow
            key={node.file.id}
            node={node}
            selectedFileId={selectedFileId}
            selectedFileIds={selectedFileIds}
            expanded={expandedFileIds.has(node.file.id)}
            canSelect={onToggleFile !== undefined && isSelectableLessonPrepFile(node.file)}
            onSelectFile={onSelectFile}
            onToggleFile={onToggleFile}
            onToggleExpanded={toggleExpanded}
          />
        ))}
      </ul>
      {files.length === 0 && <p className="empty-state">本课次还没有资料。</p>}
    </div>
  )
}

function MaterialTreeNodeRow({
  node,
  selectedFileId,
  selectedFileIds,
  expanded,
  canSelect,
  onSelectFile,
  onToggleFile,
  onToggleExpanded,
}: {
  readonly node: LessonMaterialTreeNode
  readonly selectedFileId: string
  readonly selectedFileIds: readonly string[]
  readonly expanded: boolean
  readonly canSelect: boolean
  readonly onSelectFile: (fileId: string) => void
  readonly onToggleFile?: (fileId: string) => void
  readonly onToggleExpanded: (fileId: string) => void
}): React.JSX.Element {
  const hasChildren = node.children.length > 0
  return (
    <li className="material-reader-tree-node">
      <div className="material-reader-tree-row">
        {hasChildren ? (
          <button
            className="material-reader-tree-toggle"
            type="button"
            aria-label={`${expanded ? '收起' : '展开'}${displayFileName(node.file.originalName)}的素材`}
            aria-expanded={expanded}
            onClick={() => onToggleExpanded(node.file.id)}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : <span className="material-reader-tree-toggle-spacer" aria-hidden="true" />}
        {canSelect && (
          <input
            aria-label={`选择${node.file.originalName}作为生成资料`}
            type="checkbox"
            checked={selectedFileIds.includes(node.file.id)}
            onChange={() => onToggleFile?.(node.file.id)}
          />
        )}
        <button
          className={`material-reader-tree-file${selectedFileId === node.file.id ? ' is-selected' : ''}`}
          type="button"
          onClick={() => onSelectFile(node.file.id)}
        >
          <span className="material-file-icon" aria-hidden="true">{fileIcon(node.file)}</span>
          <span>{displayFileName(node.file.originalName)}</span>
          {hasChildren && <small>{node.children.length}</small>}
        </button>
      </div>
      {hasChildren && expanded && (
        <ul className="material-reader-tree-children">
          {node.children.map((child) => (
            <li key={child.id}>
              <button
                className={`material-reader-tree-file material-reader-tree-child${selectedFileId === child.id ? ' is-selected' : ''}`}
                type="button"
                onClick={() => onSelectFile(child.id)}
              >
                <span className="material-file-icon" aria-hidden="true">{fileIcon(child)}</span>
                <span>{displayFileName(child.originalName)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function fileIcon(file: ManagedFileRecord): string {
  if (file.mimeType.startsWith('image/')) return '▧'
  if (file.mimeType === 'text/markdown') return '▤'
  return '▱'
}

export function MarkdownDocument({ body, files }: {
  readonly body: string
  readonly files: readonly ManagedFileRecord[]
}): React.JSX.Element {
  const blocks = parseBlocks(body)
  return (
    <article className="material-markdown">
      {blocks.map((block, index) => renderBlock(block, index, files))}
    </article>
  )
}

type MarkdownBlock =
  | { readonly type: 'heading'; readonly level: number; readonly text: string }
  | { readonly type: 'paragraph'; readonly lines: readonly string[] }
  | { readonly type: 'bullet'; readonly lines: readonly string[] }
  | { readonly type: 'numbered'; readonly lines: readonly string[] }
  | { readonly type: 'quote'; readonly lines: readonly string[] }
  | { readonly type: 'code'; readonly language: string; readonly lines: readonly string[] }
  | { readonly type: 'table'; readonly rows: readonly (readonly string[])[] }
  | { readonly type: 'rule' }

function parseBlocks(body: string): MarkdownBlock[] {
  const lines = normalizeMarkdownImageReferences(body).split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0
  while (index < lines.length) {
    const sourceLine = lines[index]
    const line = sourceLine.trim()
    if (line === '') {
      index += 1
      continue
    }
    const fence = /^```\s*([\w-]*)\s*$/u.exec(line)
    if (fence !== null) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/u.test(lines[index].trim())) {
        codeLines.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push({ type: 'code', language: fence[1], lines: codeLines })
      continue
    }
    const heading = /^(#{1,6})\s+(.+)$/u.exec(line)
    if (heading !== null) {
      blocks.push({ type: 'heading', level: Math.min(heading[1].length, 6), text: heading[2] })
      index += 1
      continue
    }
    if (/^(?:---+|\*\*\*+|___+)$/u.test(line)) {
      blocks.push({ type: 'rule' })
      index += 1
      continue
    }
    if (line.startsWith('>')) {
      const quoteLines: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/u, ''))
        index += 1
      }
      blocks.push({ type: 'quote', lines: quoteLines })
      continue
    }
    if (/^[-*+]\s+/u.test(line)) {
      const listLines: string[] = []
      while (index < lines.length && /^\s*[-*+]\s+/u.test(lines[index])) {
        listLines.push(lines[index].trim().replace(/^[-*+]\s+/u, ''))
        index += 1
      }
      blocks.push({ type: 'bullet', lines: listLines })
      continue
    }
    if (/^\d+[.、)]\s*/u.test(line)) {
      const listLines: string[] = []
      while (index < lines.length && /^\s*\d+[.、)]\s*/u.test(lines[index])) {
        listLines.push(lines[index].trim().replace(/^\d+[.、)]\s*/u, ''))
        index += 1
      }
      blocks.push({ type: 'numbered', lines: listLines })
      continue
    }
    if (isTableHeader(lines, index)) {
      const rows: string[][] = [splitTableRow(lines[index])]
      index += 2
      while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
        rows.push(splitTableRow(lines[index]))
        index += 1
      }
      blocks.push({ type: 'table', rows })
      continue
    }
    const paragraphLines = [sourceLine.trimStart()]
    index += 1
    while (index < lines.length && lines[index].trim() !== '' && !isBlockStart(lines[index].trim())) {
      paragraphLines.push(lines[index].trimStart())
      index += 1
    }
    blocks.push({ type: 'paragraph', lines: paragraphLines })
  }
  return blocks
}

function renderBlock(block: MarkdownBlock, key: number, files: readonly ManagedFileRecord[]): React.JSX.Element {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${Math.max(1, Math.min(block.level, 6))}` as keyof React.JSX.IntrinsicElements
      return <Tag key={key}>{renderInline(block.text, files, `${key}-heading`)}</Tag>
    }
    case 'paragraph':
      return <p key={key}>{renderParagraphLines(block.lines, files, `${key}-paragraph`)}</p>
    case 'bullet':
      return <ul key={key}>{block.lines.map((line, index) => <li key={index}>{renderInline(line, files, `${key}-bullet-${index}`)}</li>)}</ul>
    case 'numbered':
      return <ol key={key}>{block.lines.map((line, index) => <li key={index}>{renderInline(line, files, `${key}-numbered-${index}`)}</li>)}</ol>
    case 'quote':
      return <blockquote key={key}>{block.lines.map((line, index) => <p key={index}>{renderInline(line, files, `${key}-quote-${index}`)}</p>)}</blockquote>
    case 'code':
      return <pre key={key} data-language={block.language}><code>{block.lines.join('\n')}</code></pre>
    case 'table':
      return <table key={key}><thead><tr>{block.rows[0]?.map((cell, index) => <th key={index}>{renderInline(cell, files, `${key}-th-${index}`)}</th>)}</tr></thead><tbody>{block.rows.slice(1).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}>{renderInline(cell, files, `${key}-td-${rowIndex}-${index}`)}</td>)}</tr>)}</tbody></table>
    case 'rule':
      return <hr key={key} />
  }
}

function renderParagraphLines(
  lines: readonly string[],
  files: readonly ManagedFileRecord[],
  keyPrefix: string,
): ReactNode[] {
  const nodes: ReactNode[] = []
  // 显示公式 \[ ... \] 常跨多行（\[ 与 \] 各占一行）；逐行渲染会拆散定界符，
  // 先把跨行公式合并回单行（软换行本就以空格衔接，语义不变）。
  const mergedLines: string[] = []
  let mathBuffer: string | null = null
  for (const line of lines) {
    if (mathBuffer === null) {
      if (/\\\[/u.test(line) && !/\\\]/u.test(line)) {
        mathBuffer = line
      } else {
        mergedLines.push(line)
      }
    } else {
      mathBuffer += ` ${line}`
      if (/\\\]/u.test(line)) {
        mergedLines.push(mathBuffer)
        mathBuffer = null
      }
    }
  }
  if (mathBuffer !== null) mergedLines.push(mathBuffer)
  for (let index = 0; index < mergedLines.length; index += 1) {
    const sourceLine = mergedLines[index]
    const hardBreak = /(?: {2,}|\\)$/u.test(sourceLine)
    const line = hardBreak ? sourceLine.replace(/(?: {2,}|\\)$/u, '') : sourceLine
    nodes.push(...renderInline(line, files, `${keyPrefix}-${index}`))
    if (index < mergedLines.length - 1) {
      nodes.push(hardBreak ? <br key={`${keyPrefix}-break-${index}`} /> : ' ')
    }
  }
  return nodes
}

function renderInline(text: string, files: readonly ManagedFileRecord[], keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const normalizedText = normalizeInlineMarkdownText(text)
  const pattern = /(!\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)]*\)|`[^`]+`|\\\([^\n]+?\\\)|\\\[[^\n]+?\\\]|\$\$[^$]+?\$\$|\$[^$\n]+?\$|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/gu
  let cursor = 0
  let match: RegExpExecArray | null
  let tokenIndex = 0
  while ((match = pattern.exec(normalizedText)) !== null) {
    if (match.index > cursor) nodes.push(normalizedText.slice(cursor, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${tokenIndex}`
    if (token.startsWith('![')) {
      const image = /^!\[([^\]]*)\]\(([^)]+)\)$/u.exec(token)
      const file = image === null ? undefined : findReferencedFile(files, image[2])
      nodes.push(file === undefined ? image?.[1] ?? token : <ManagedMarkdownImage key={key} file={file} alt={image?.[1] ?? ''} />)
    } else if (token.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(token)
      const href = link?.[2].trim()
      nodes.push(href !== undefined && /^https?:\/\//iu.test(href)
        ? <a key={key} href={href} target="_blank" rel="noreferrer">{link?.[1]}</a>
        : link?.[1] ?? token)
    } else if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('$$')) {
      nodes.push(<MathSpan key={key} formula={token.slice(2, -2)} display />)
    } else if (token.startsWith('\\[')) {
      // \[...\] 显示公式：修复前该 token 掉进斜体分支被剥掉首尾字符、以纯文本漏出。
      nodes.push(<MathSpan key={key} formula={token.slice(2, -2)} display />)
    } else if (token.startsWith('$') || token.startsWith('\\(')) {
      nodes.push(<MathSpan key={key} formula={token.startsWith('\\(') ? token.slice(2, -2) : token.slice(1, -1)} />)
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), files, key)}</strong>)
    } else {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), files, key)}</em>)
    }
    cursor = match.index + token.length
    tokenIndex += 1
  }
  if (cursor < normalizedText.length) nodes.push(normalizedText.slice(cursor))
  return nodes
}

function normalizeInlineMarkdownText(text: string): string {
  const tokenMarker = '\uE000'
  const protectedTokens: string[] = []
  const protectedText = normalizeMarkdownImageReferences(text).replace(
    /(!\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)]*\)|`[^`]+`)/gu,
    (token) => {
      const index = protectedTokens.push(token) - 1
      return `${tokenMarker}${index}${tokenMarker}`
    },
  )
  const tokenPattern = new RegExp(`${tokenMarker}(\\d+)${tokenMarker}`, 'gu')
  return normalizeRichText(protectedText).replace(tokenPattern, (_match, index: string) => protectedTokens[Number(index)] ?? '')
}

function MathSpan({ formula, display = false }: { readonly formula: string; readonly display?: boolean }): React.JSX.Element {
  try {
    const normalizedFormula = formula
      .replace(/\u200B|\u200C|\u200D|\uFEFF/gu, '')
      .trim()
      .replace(/^\$([^$\n]+)\$$/u, '$1')
    return <span className={display ? 'material-math material-math-display' : 'material-math'} dangerouslySetInnerHTML={{ __html: katex.renderToString(normalizedFormula, { displayMode: display, throwOnError: false }) }} />
  } catch {
    return <code>{formula}</code>
  }
}

function ManagedMarkdownImage({ file, alt }: { readonly file: ManagedFileRecord; readonly alt: string }): React.JSX.Element {
  const [content, setContent] = useState<ManagedFileContent | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.teacherWorkbench.files.readContent({ fileId: file.id }).then((next) => {
      if (!cancelled) setContent(next)
    }).catch(() => {
      if (!cancelled) setContent(null)
    })
    return () => { cancelled = true }
  }, [file.id])
  if (content?.kind === 'image') return <img className="material-markdown-image" src={content.dataUrl} alt={alt || file.originalName} />
  return <span className="material-image-missing">{alt || file.originalName}</span>
}

function isTableHeader(lines: readonly string[], index: number): boolean {
  return index + 1 < lines.length && lines[index].includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(lines[index + 1])
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|').map((cell) => cell.trim())
}

function isBlockStart(line: string): boolean {
  return /^(?:#{1,6}\s|```|[-*+]\s|\d+[.、)]\s|>|---+$|\*\*\*+$|___+$)/u.test(line)
}

function findReferencedFile(files: readonly ManagedFileRecord[], reference: string): ManagedFileRecord | undefined {
  const rawReference = reference.trim().split(/[?#]/u)[0]
  const withoutTitle = rawReference.split(/\s+['"]/u)[0]
  const name = withoutTitle.startsWith('<') && withoutTitle.endsWith('>')
    ? withoutTitle.slice(1, -1)
    : withoutTitle
  let normalized = name.split(/[\\/]/u).at(-1) ?? ''
  try {
    normalized = decodeURIComponent(normalized)
  } catch {
    // Keep the original path when a malformed escape appears in a document.
  }
  normalized = normalized.toLocaleLowerCase('zh-CN')
  if (normalized === undefined || normalized === '') return undefined
  return files.find((file) => file.originalName.toLocaleLowerCase('zh-CN') === normalized)
}

function choosePreferredFile(files: readonly ManagedFileRecord[]): ManagedFileRecord | undefined {
  const markdown = [...files]
    .filter((file) => file.mimeType === 'text/markdown')
    .sort((left, right) => right.sizeBytes - left.sizeBytes)[0]
  if (markdown !== undefined) return markdown
  return [...files]
    .filter((file) => file.mimeType.startsWith('image/'))
    .sort((left, right) => right.sizeBytes - left.sizeBytes)[0] ?? files[0]
}

function displayFileName(name: string): string {
  return name.replace(/\.(?:md|markdown|txt)$/iu, '')
}
