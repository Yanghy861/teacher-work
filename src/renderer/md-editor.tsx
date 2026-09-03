import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ManagedFileRecord } from '../shared/file-contracts'
import { MarkdownDocument } from './lesson-material-reader'
import { toErrorMessage } from './ui-utils'

/** D28/D29（V17-C）：零新依赖 md 编辑器——受控 textarea + 工具栏 + 分屏 KaTeX 预览。 */
export default function MdEditor({
  file,
  files,
  onSaved,
  onCancel,
}: {
  readonly file: ManagedFileRecord
  readonly files: readonly ManagedFileRecord[]
  readonly onSaved: (result: { readonly file: ManagedFileRecord; readonly version: number }) => void
  readonly onCancel: () => void
}): React.JSX.Element {
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [draftRecovered, setDraftRecovered] = useState(false)
  const [recoverPrompt, setRecoverPrompt] = useState(false)
  const [latexPaletteOpen, setLatexPaletteOpen] = useState(false)
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const draftKey = `md-editor-draft:${file.id}`
  // 撤销/重做：快照栈（含光标），textarea 原生输入外的工具栏插入走此栈
  const undoStack = useRef<readonly string[]>([])
  const redoStack = useRef<readonly string[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    void window.teacherWorkbench.files.readText({ fileId: file.id })
      .then((result) => {
        if (cancelled) return
        const hot = readHotDraft(draftKey)
        if (hot !== null) {
          setBody(result.content)
          window.sessionStorage.setItem(`${draftKey}:hot`, hot)
          setRecoverPrompt(true)
        } else {
          setBody(result.content)
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(toErrorMessage(loadError, '正文读取失败，请稍后重试。'))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [draftKey, file.id])

  // 热保存：250ms 防抖写 localStorage，失败静默（D28 基准）
  useEffect(() => {
    if (loading || recoverPrompt) return
    const timer = window.setTimeout(() => {
      try {
        if (body.trim() !== '') window.localStorage.setItem(draftKey, body)
        else window.localStorage.removeItem(draftKey)
      } catch {
        // 写入失败静默：热保存只是保险，不阻塞编辑
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [body, draftKey, loading, recoverPrompt])

  function recoverHotDraft(): void {
    const hot = window.sessionStorage.getItem(`${draftKey}:hot`)
    window.sessionStorage.removeItem(`${draftKey}:hot`)
    setBody(hot ?? body)
    setRecoverPrompt(false)
    setDraftRecovered(true)
  }

  function discardHotDraft(): void {
    window.sessionStorage.removeItem(`${draftKey}:hot`)
    try {
      window.localStorage.removeItem(draftKey)
    } catch {
      // 静默
    }
    setRecoverPrompt(false)
  }

  const pushUndo = useCallback((snapshot: string): void => {
    undoStack.current = [...undoStack.current.slice(-99), snapshot]
    redoStack.current = []
  }, [])

  function undo(): void {
    const stack = undoStack.current
    const previous = stack[stack.length - 1]
    if (previous === undefined || textareaRef.current === null) return
    redoStack.current = [...redoStack.current, textareaRef.current.value]
    undoStack.current = stack.slice(0, -1)
    setBody(previous)
  }

  function redo(): void {
    const stack = redoStack.current
    const next = stack[stack.length - 1]
    if (next === undefined || textareaRef.current === null) return
    undoStack.current = [...undoStack.current, textareaRef.current.value]
    redoStack.current = stack.slice(0, -1)
    setBody(next)
  }

  /** 在光标处插入模板；选中文本存在时包裹（行内语法）或替换为空模板。 */
  function insertTemplate(before: string, after = '', placeholder = ''): void {
    const textarea = textareaRef.current
    if (textarea === null) return
    pushUndo(textarea.value)
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = textarea.value.slice(start, end)
    const inner = selected !== '' ? selected : placeholder
    const next = `${textarea.value.slice(0, start)}${before}${inner}${after}${textarea.value.slice(end)}`
    setBody(next)
    requestAnimationFrame(() => {
      const caret = start + before.length + inner.length
      textarea.focus()
      textarea.setSelectionRange(
        selected !== '' ? caret : start + before.length,
        selected !== '' ? caret : start + before.length + placeholder.length,
      )
    })
  }

  function insertBlockLines(prefix: string): void {
    const textarea = textareaRef.current
    if (textarea === null) return
    pushUndo(textarea.value)
    const start = textarea.selectionStart
    const lineStart = textarea.value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const next = `${textarea.value.slice(0, lineStart)}${prefix}${textarea.value.slice(lineStart)}`
    setBody(next)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + prefix.length)
    })
  }

  async function saveAsNewVersion(): Promise<void> {
    if (saving || body.trim() === '') return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await window.teacherWorkbench.files.writeVersion({
        fileId: file.id,
        bodyMd: body,
      })
      try {
        window.localStorage.removeItem(draftKey)
        window.sessionStorage.removeItem(`${draftKey}:hot`)
      } catch {
        // 静默
      }
      onSaved(result)
    } catch (saveError) {
      setError(toErrorMessage(saveError, '保存失败，请稍后重试。'))
    } finally {
      setSaving(false)
    }
  }

  const lessonImages = useMemo(
    () => files.filter((candidate) => candidate.mimeType.startsWith('image/')),
    [files],
  )
  const canSave = !loading && !saving && !recoverPrompt && body.trim() !== ''

  return (
    <div className="md-editor" aria-label={`编辑 ${file.originalName}`}>
      {error !== '' && <div className="inline-error" role="alert">{error}</div>}
      {notice !== '' && <div className="inline-notice" role="status">{notice}</div>}
      {recoverPrompt && (
        <div className="md-editor-recover inline-notice" role="status">
          检测到上次未保存的编辑草稿。{draftRecovered ? '已恢复。' : '恢复吗？'}
          {!draftRecovered && (
            <>
              <button className="secondary-button" type="button" onClick={recoverHotDraft}>恢复草稿</button>
              <button className="secondary-button" type="button" onClick={discardHotDraft}>丢弃</button>
            </>
          )}
        </div>
      )}
      <div className="md-editor-toolbar" role="toolbar" aria-label="Markdown 编辑工具栏">
        <button type="button" title="加粗" onClick={() => insertTemplate('**', '**', '加粗文本')}>B</button>
        <button type="button" title="斜体" onClick={() => insertTemplate('*', '*', '斜体文本')}><i>i</i></button>
        <select
          aria-label="标题层级（字号）"
          defaultValue=""
          onChange={(event) => {
            const value = event.currentTarget.value
            if (value !== '') insertBlockLines(value)
            event.currentTarget.value = ''
          }}
        >
          <option value="" disabled>标题字号</option>
          <option value="# ">H1 大标题</option>
          <option value="## ">H2 中标题</option>
          <option value="### ">H3 小标题</option>
        </select>
        <button type="button" title="下标 x₂" onClick={() => insertTemplate('<sub>', '</sub>', '下标')}>x₂</button>
        <button type="button" title="上标 x²" onClick={() => insertTemplate('<sup>', '</sup>', '上标')}>x²</button>
        <button type="button" title="无序列表" onClick={() => insertBlockLines('- ')}>• 列表</button>
        <button type="button" title="有序列表" onClick={() => insertBlockLines('1. ')}>1. 列表</button>
        <button type="button" title="引用" onClick={() => insertBlockLines('> ')}>引用</button>
        <button type="button" title="表格模板" onClick={() => insertTemplate('\n| 列1 | 列2 |\n| --- | --- |\n| 内容 | 内容 |\n', '', '')}>表格</button>
        <button type="button" title="分隔线" onClick={() => insertTemplate('\n---\n', '', '')}>—</button>
        <span className="md-editor-toolbar-sep" aria-hidden="true" />
        <button type="button" title="行内公式 $…$" onClick={() => insertTemplate('$', '$', 'a^2+b^2=c^2')}>$x$</button>
        <button type="button" title="块级公式 $$…$$" onClick={() => insertTemplate('$$\n', '\n$$', '公式')}>$$∑$$</button>
        <button
          type="button"
          title="LaTeX 片段速查"
          aria-expanded={latexPaletteOpen}
          onClick={() => setLatexPaletteOpen((open) => !open)}
        >ƒ 速查</button>
        <button
          type="button"
          title="插入本课图片引用"
          aria-expanded={imagePickerOpen}
          onClick={() => setImagePickerOpen((open) => !open)}
        >▦ 插图</button>
        <span className="md-editor-toolbar-sep" aria-hidden="true" />
        <button type="button" title="撤销" onClick={undo}>↶</button>
        <button type="button" title="重做" onClick={redo}>↷</button>
      </div>
      {latexPaletteOpen && (
        <div className="md-editor-palette" role="group" aria-label="LaTeX 公式速查">
          {LATEX_SNIPPETS.map((snippet) => (
            <button
              key={snippet.code}
              type="button"
              className="md-editor-palette-item"
              title={snippet.title}
              onClick={() => insertTemplate(snippet.code, snippet.after ?? '', snippet.placeholder ?? '')}
            >
              {snippet.title}
            </button>
          ))}
        </div>
      )}
      {imagePickerOpen && (
        <div className="md-editor-palette" role="group" aria-label="本课图片">
          {lessonImages.length === 0 && <span className="md-editor-palette-empty">本课还没有图片资料；先从素材库或外部资料复制图片到本课。</span>}
          {lessonImages.map((image) => (
            <button
              key={image.id}
              type="button"
              className="md-editor-palette-item"
              title={`插入 ![${displayBaseName(image.originalName)}](${image.originalName})`}
              onClick={() => {
                insertTemplate(`![${displayBaseName(image.originalName)}](${image.originalName})`, '', '')
                setImagePickerOpen(false)
              }}
            >
              {image.originalName}
            </button>
          ))}
        </div>
      )}
      <div className="md-editor-split">
        <textarea
          ref={textareaRef}
          className="md-editor-textarea"
          value={body}
          disabled={loading || saving}
          spellCheck={false}
          aria-label={`${file.originalName} 正文编辑`}
          onChange={(event) => setBody(event.currentTarget.value)}
        />
        <div className="md-editor-preview" aria-label="实时预览（KaTeX 渲染）">
          <MarkdownDocument body={body === '' ? '（空文档）' : body} files={files} />
        </div>
      </div>
      <footer className="md-editor-actions">
        <span className="md-editor-hint">保存为**新版本**：旧版保留在历史版本，原件永不被改写。行内公式用 $…$，块级公式用 $$…$$，预览实时渲染。</span>
        <div>
          <button className="secondary-button" type="button" disabled={saving} onClick={onCancel}>取消</button>
          <button
            className="primary-button"
            type="button"
            disabled={!canSave}
            title={body.trim() === '' ? '正文为空' : '保存为新版本（版本链出“ · 第 N+1 版.md”，外部 md 出“原名（编辑版）.md”）'}
            onClick={() => { void saveAsNewVersion() }}
          >
            {saving ? '正在保存…' : '保存为新版本'}
          </button>
        </div>
      </footer>
    </div>
  )
}

function readHotDraft(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function displayBaseName(name: string): string {
  return name.replace(/\.[^.]+$/u, '')
}

/** 数学高频 LaTeX 片段速查（D28：点选插入模板）。 */
export const LATEX_SNIPPETS: readonly {
  readonly title: string
  readonly code: string
  readonly after?: string
  readonly placeholder?: string
}[] = [
  { title: '分式 a/b', code: '\\frac{a}{b}' },
  { title: '根号 √x', code: '\\sqrt{x}' },
  { title: 'n 次根', code: '\\sqrt[n]{x}' },
  { title: '上标 x²', code: 'x^{2}' },
  { title: '上标 xⁿ', code: 'x^{n}' },
  { title: '下标 x₁', code: 'x_{1}' },
  { title: '角度 ∠A', code: '\\angle A' },
  { title: '三角形 △ABC', code: '\\triangle ABC' },
  { title: '全等 ≌', code: '\\cong' },
  { title: '相似 ∽', code: '\\sim' },
  { title: '垂直 ⊥', code: '\\perp' },
  { title: '平行 ∥', code: '\\parallel' },
  { title: '度 90°', code: '90^\\circ' },
  { title: '圆 π', code: '\\pi' },
  { title: '因为/所以', code: '\\because \\; \\therefore' },
  { title: '求和 ∑', code: '\\sum_{i=1}^{n}' },
  { title: '括号适配', code: '\\left( \\right)'  , placeholder: '\\left( x \\right)' },
  { title: '方程组', code: '\\begin{cases}\nx+y=1\\\\\nx-y=3\n\\end{cases}', placeholder: '' },
]
